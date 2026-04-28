import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures, Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;
let activityId: string; // owned by userA

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);

  await beginAs(db.client, null, "service_role");
  const res = await db.client.query<{ id: string }>(
    `INSERT INTO activity (actor_user_id, kind, payload)
     VALUES ($1, 'watchlist_added', $2)
     RETURNING id`,
    [fx.userA.id, JSON.stringify({ film_id: fx.filmId })]
  );
  activityId = res.rows[0].id;
  await commit(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM notifications`);
  await db.client.query(`DELETE FROM activity_comments`);
  await commit(db.client);
});

describe("RLS: activity_comments", () => {
  it("authenticated INSERT with matching user_id succeeds", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO activity_comments (activity_id, user_id, body)
         VALUES ($1, $2, 'banger') RETURNING id`,
        [activityId, fx.userB.id]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("INSERT with mismatched user_id is blocked", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO activity_comments (activity_id, user_id, body)
           VALUES ($1, $2, 'spoof')`,
          [activityId, fx.userC.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("body length 0 rejected by CHECK", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO activity_comments (activity_id, user_id, body)
           VALUES ($1, $2, '')`,
          [activityId, fx.userB.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("body length > 140 rejected by CHECK", async () => {
    const long = "x".repeat(141);
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO activity_comments (activity_id, user_id, body)
           VALUES ($1, $2, $3)`,
          [activityId, fx.userB.id, long]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("public read — any authed user sees the thread", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'hi')`,
      [activityId, fx.userB.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userC.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM activity_comments WHERE activity_id = $1`, [activityId]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("author can delete own comment", async () => {
    await beginAs(db.client, null, "service_role");
    const seed = await db.client.query<{ id: string }>(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'mine') RETURNING id`,
      [activityId, fx.userB.id]
    );
    await commit(db.client);
    const commentId = seed.rows[0].id;

    await beginAs(db.client, fx.userB.id, "authenticated");
    const del = await db.client.query(
      `DELETE FROM activity_comments WHERE id = $1`,
      [commentId]
    );
    await commit(db.client);
    expect(del.rowCount).toBe(1);
  });

  it("activity owner can delete a comment on their own activity", async () => {
    await beginAs(db.client, null, "service_role");
    const seed = await db.client.query<{ id: string }>(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'theirs') RETURNING id`,
      [activityId, fx.userB.id]
    );
    await commit(db.client);
    const commentId = seed.rows[0].id;

    await beginAs(db.client, fx.userA.id, "authenticated"); // userA is the activity owner
    const del = await db.client.query(
      `DELETE FROM activity_comments WHERE id = $1`,
      [commentId]
    );
    await commit(db.client);
    expect(del.rowCount).toBe(1);
  });

  it("third-party delete is blocked", async () => {
    await beginAs(db.client, null, "service_role");
    const seed = await db.client.query<{ id: string }>(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'hands off') RETURNING id`,
      [activityId, fx.userB.id]
    );
    await commit(db.client);
    const commentId = seed.rows[0].id;

    // userC is neither the comment author nor the activity owner.
    await beginAs(db.client, fx.userC.id, "authenticated");
    const del = await db.client.query(
      `DELETE FROM activity_comments WHERE id = $1`,
      [commentId]
    );
    await commit(db.client);
    expect(del.rowCount).toBe(0);
  });

  it("trigger: comment by non-actor produces a notification for the actor", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'hello')`,
      [activityId, fx.userB.id]
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const n = await db.client.query<{ kind: string; user_id: string; actor_user_id: string; payload: any }>(
      `SELECT kind, user_id, actor_user_id, payload FROM notifications WHERE kind = 'comment_on_activity'`
    );
    await commit(db.client);
    expect(n.rowCount).toBe(1);
    expect(n.rows[0].user_id).toBe(fx.userA.id);
    expect(n.rows[0].actor_user_id).toBe(fx.userB.id);
    expect(n.rows[0].payload.activity_id).toBe(activityId);
    expect(n.rows[0].payload.body).toBe("hello");
    expect(n.rows[0].payload.film_id).toBe(fx.filmId);
  });

  it("trigger: self-comment produces no notification", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'self')`,
      [activityId, fx.userA.id]
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const n = await db.client.query(
      `SELECT id FROM notifications WHERE kind = 'comment_on_activity'`
    );
    await commit(db.client);
    expect(n.rowCount).toBe(0);
  });

  it("cascade: delete activity removes its comments", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'doomed')`,
      [activityId, fx.userB.id]
    );
    await db.client.query(`DELETE FROM activity WHERE id = $1`, [activityId]);
    const r = await db.client.query(`SELECT id FROM activity_comments WHERE activity_id = $1`, [activityId]);
    await commit(db.client);
    expect(r.rowCount).toBe(0);

    // Re-seed activity row so afterAll/other tests don't crash.
    const re = await db.client.query<{ id: string }>(
      `INSERT INTO activity (actor_user_id, kind, payload)
       VALUES ($1, 'watchlist_added', $2)
       RETURNING id`,
      [fx.userA.id, JSON.stringify({ film_id: fx.filmId })]
    );
    activityId = re.rows[0].id;
    await beginAs(db.client, null, "service_role");
    await commit(db.client);
  });
});
