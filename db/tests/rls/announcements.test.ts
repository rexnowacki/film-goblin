import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures, Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM announcement_dismissals`);
  await db.client.query(`DELETE FROM announcement_recipients`);
  await db.client.query(`DELETE FROM announcements`);
  await commit(db.client);
});

async function seedAnnouncement(opts: {
  audience: "everyone" | "specific";
  status?: "published" | "archived";
  title?: string;
  recipients?: string[];
}): Promise<string> {
  await beginAs(db.client, null, "service_role");
  const r = await db.client.query<{ id: string }>(
    `INSERT INTO announcements (title, body, audience, status, created_by)
     VALUES ($1, 'b', $2, COALESCE($3, 'published'), $4)
     RETURNING id`,
    [opts.title ?? "T", opts.audience, opts.status ?? null, fx.adminA.id],
  );
  const id = r.rows[0].id;
  if (opts.audience === "specific" && opts.recipients) {
    for (const uid of opts.recipients) {
      await db.client.query(
        `INSERT INTO announcement_recipients (announcement_id, user_id) VALUES ($1, $2)`,
        [id, uid],
      );
    }
  }
  await commit(db.client);
  return id;
}

describe("RLS: announcements", () => {
  it("non-admin authenticated cannot INSERT announcements", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(db.client.query(
        `INSERT INTO announcements (title, body, audience, created_by)
         VALUES ('x', 'y', 'everyone', $1)`,
        [fx.userA.id],
      )).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("admin can INSERT announcements", async () => {
    await beginAs(db.client, fx.adminA.id, "authenticated");
    try {
      const r = await db.client.query<{ id: string }>(
        `INSERT INTO announcements (title, body, audience, created_by)
         VALUES ('x', 'y', 'everyone', $1) RETURNING id`,
        [fx.adminA.id],
      );
      expect(r.rows).toHaveLength(1);
    } finally { await rollback(db.client); }
  });

  it("non-admin authenticated CAN SELECT announcements", async () => {
    const id = await seedAnnouncement({ audience: "everyone" });
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM announcements WHERE id = $1`, [id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("non-admin authenticated cannot UPDATE announcements", async () => {
    const id = await seedAnnouncement({ audience: "everyone" });
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE announcements SET status = 'archived' WHERE id = $1`,
        [id],
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("admin can UPDATE announcements (archive flow)", async () => {
    const id = await seedAnnouncement({ audience: "everyone" });
    await beginAs(db.client, fx.adminA.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE announcements SET status = 'archived', archived_at = NOW() WHERE id = $1`,
        [id],
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("user can INSERT only their own dismissal row", async () => {
    const id = await seedAnnouncement({ audience: "everyone" });

    // Their own row — allowed.
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO announcement_dismissals (user_id, announcement_id) VALUES ($1, $2) RETURNING user_id`,
        [fx.userA.id, id],
      );
      expect(r.rows).toHaveLength(1);
    } finally { await commit(db.client); }

    // Someone else's row — denied.
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(db.client.query(
        `INSERT INTO announcement_dismissals (user_id, announcement_id) VALUES ($1, $2)`,
        [fx.userB.id, id],
      )).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("user cannot SELECT another user's dismissal rows", async () => {
    const id = await seedAnnouncement({ audience: "everyone" });
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO announcement_dismissals (user_id, announcement_id) VALUES ($1, $2)`,
      [fx.userB.id, id],
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM announcement_dismissals`);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("'everyone' audience surfaces to a user with no recipient row", async () => {
    const id = await seedAnnouncement({ audience: "everyone" });
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT id FROM announcements
         WHERE status = 'published'
         ORDER BY created_at ASC LIMIT 1`,
      );
      expect(r.rows[0]?.id).toBe(id);
    } finally { await rollback(db.client); }
  });

  it("'specific' audience surfaces only to listed recipients", async () => {
    const id = await seedAnnouncement({
      audience: "specific",
      recipients: [fx.userA.id],
    });

    // userA is in recipients — should see it via the recipient join.
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT a.id FROM announcements a
         WHERE a.id = $1 AND EXISTS (
           SELECT 1 FROM announcement_recipients r
           WHERE r.announcement_id = a.id AND r.user_id = $2
         )`,
        [id, fx.userA.id],
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }

    // userB is NOT in recipients — recipient lookup returns nothing.
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT * FROM announcement_recipients WHERE announcement_id = $1 AND user_id = $2`,
        [id, fx.userB.id],
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("dismissal hides the announcement from the next pending query", async () => {
    const id = await seedAnnouncement({ audience: "everyone" });
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO announcement_dismissals (user_id, announcement_id) VALUES ($1, $2)`,
      [fx.userA.id, id],
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT a.id FROM announcements a
         WHERE a.status = 'published'
           AND NOT EXISTS (
             SELECT 1 FROM announcement_dismissals d
             WHERE d.announcement_id = a.id AND d.user_id = $1
           )`,
        [fx.userA.id],
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("archived announcement does not surface even when undismissed", async () => {
    const id = await seedAnnouncement({ audience: "everyone", status: "archived" });
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT id FROM announcements WHERE status = 'published' AND id = $1`,
        [id],
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("multiple pending announcements return in created_at ASC order (FIFO)", async () => {
    const first = await seedAnnouncement({ audience: "everyone", title: "first" });
    // Tiny sleep to guarantee distinct created_at timestamps.
    await new Promise(r => setTimeout(r, 5));
    const second = await seedAnnouncement({ audience: "everyone", title: "second" });

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT id, title FROM announcements
         WHERE status = 'published'
         ORDER BY created_at ASC`,
      );
      expect(r.rows.map(x => x.id)).toEqual([first, second]);
    } finally { await rollback(db.client); }
  });
});
