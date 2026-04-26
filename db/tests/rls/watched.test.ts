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
  // Reset watched + coven edges + watchlists between tests via service_role.
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM watched`);
  await db.client.query(`DELETE FROM watchlists`);
  await db.client.query(`DELETE FROM coven_members`);
  await db.client.query(`DELETE FROM activity WHERE kind = 'watch_logged'`);
  // Reset broadcast_watched to default TRUE for each user.
  await db.client.query(`UPDATE profiles SET broadcast_watched = TRUE`);
  await commit(db.client);
});

// Helper: insert a coven_members edge respecting the (user_a < user_b) invariant.
async function bond(client: typeof db.client, x: string, y: string) {
  const [a, b] = x < y ? [x, y] : [y, x];
  await client.query(
    `INSERT INTO coven_members (user_a_id, user_b_id) VALUES ($1, $2)`,
    [a, b]
  );
}

describe("RLS: watched", () => {
  it("anon SELECT is denied — returns 0 rows even when rows exist", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT * FROM watched`);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("owner SELECT own rows — allowed", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2), ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM watched`);
      expect(r.rowCount).toBe(2); // both watch entries visible to owner
    } finally { await rollback(db.client); }
  });

  it("multiple watches of same (user, film) all insert — no unique constraint", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await db.client.query(
        `INSERT INTO watched (user_id, film_id, watched_at) VALUES ($1, $2, '2026-04-01')`,
        [fx.userA.id, fx.filmId]
      );
      await db.client.query(
        `INSERT INTO watched (user_id, film_id, watched_at) VALUES ($1, $2, '2026-04-15')`,
        [fx.userA.id, fx.filmId]
      );
      await db.client.query(
        `INSERT INTO watched (user_id, film_id, watched_at) VALUES ($1, $2, '2026-04-15')`,
        [fx.userA.id, fx.filmId] // same date — also OK
      );
      const r = await db.client.query(
        `SELECT count(*)::int AS c FROM watched WHERE user_id = $1 AND film_id = $2`,
        [fx.userA.id, fx.filmId]
      );
      expect(r.rows[0].c).toBe(3);
    } finally { await rollback(db.client); }
  });

  it("coven mate with broadcast=TRUE — SELECT allowed", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await bond(db.client, fx.userA.id, fx.userB.id);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM watched WHERE user_id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("coven mate with broadcast=FALSE — SELECT denied", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await bond(db.client, fx.userA.id, fx.userB.id);
    await db.client.query(
      `UPDATE profiles SET broadcast_watched = FALSE WHERE id = $1`,
      [fx.userA.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM watched WHERE user_id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("non-coven user — SELECT denied even with broadcast=TRUE", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userC.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM watched WHERE user_id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("owner INSERT own row — allowed", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO watched (user_id, film_id) VALUES ($1, $2) RETURNING id`,
        [fx.userA.id, fx.filmId]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("INSERT with spoofed user_id — denied", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
          [fx.userB.id, fx.filmId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("owner UPDATE own row — allowed", async () => {
    await beginAs(db.client, null, "service_role");
    const ins = await db.client.query<{ id: string }>(
      `INSERT INTO watched (user_id, film_id, note) VALUES ($1, $2, 'old') RETURNING id`,
      [fx.userA.id, fx.filmId]
    );
    const watchId = ins.rows[0].id;
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    const upd = await db.client.query(
      `UPDATE watched SET note = 'new' WHERE id = $1`,
      [watchId]
    );
    await commit(db.client);
    expect(upd.rowCount).toBe(1);
  });

  it("non-owner UPDATE — no-op (RLS filters out the row)", async () => {
    await beginAs(db.client, null, "service_role");
    const ins = await db.client.query<{ id: string }>(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2) RETURNING id`,
      [fx.userA.id, fx.filmId]
    );
    const watchId = ins.rows[0].id;
    // Bond + broadcast=TRUE, so userB CAN see (SELECT) but UPDATE is owner-only.
    await bond(db.client, fx.userA.id, fx.userB.id);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    const upd = await db.client.query(
      `UPDATE watched SET note = 'pwned' WHERE id = $1`,
      [watchId]
    );
    await commit(db.client);
    expect(upd.rowCount).toBe(0);
  });

  it("owner DELETE own row — allowed", async () => {
    await beginAs(db.client, null, "service_role");
    const ins = await db.client.query<{ id: string }>(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2) RETURNING id`,
      [fx.userA.id, fx.filmId]
    );
    const watchId = ins.rows[0].id;
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    const del = await db.client.query(
      `DELETE FROM watched WHERE id = $1`,
      [watchId]
    );
    await commit(db.client);
    expect(del.rowCount).toBe(1);
  });

  it("non-owner DELETE — no-op (RLS filters out the row)", async () => {
    await beginAs(db.client, null, "service_role");
    const ins = await db.client.query<{ id: string }>(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2) RETURNING id`,
      [fx.userA.id, fx.filmId]
    );
    const watchId = ins.rows[0].id;
    await bond(db.client, fx.userA.id, fx.userB.id);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    const del = await db.client.query(`DELETE FROM watched WHERE id = $1`, [watchId]);
    await commit(db.client);
    expect(del.rowCount).toBe(0);
  });
});
