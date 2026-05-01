import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures, Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;
let activityId: string;
let commentId: string;

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);

  // Create one activity authored by userA, with one comment authored by userA.
  await beginAs(db.client, null, "service_role");
  const a = await db.client.query<{ id: string }>(
    `INSERT INTO activity (kind, actor_user_id, payload)
     VALUES ('watchlist_added', $1, jsonb_build_object('film_id', $2::uuid))
     RETURNING id`,
    [fx.userA.id, fx.filmId],
  );
  activityId = a.rows[0].id;
  const c = await db.client.query<{ id: string }>(
    `INSERT INTO activity_comments (activity_id, user_id, body)
     VALUES ($1, $2, 'first')
     RETURNING id`,
    [activityId, fx.userA.id],
  );
  commentId = c.rows[0].id;
  await commit(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM activity_comment_reactions`);
  await db.client.query(`UPDATE activity_comments SET like_count = 0 WHERE id = $1`, [commentId]);
  await commit(db.client);
});

describe("RLS: activity_comment_reactions", () => {
  it("anon SELECT — denied (acr_select policy is TO authenticated only)", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userA.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT * FROM activity_comment_reactions`);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("user can INSERT own reaction", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2) RETURNING user_id`,
        [fx.userB.id, commentId],
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("user CANNOT INSERT a spoofed user_id", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
          [fx.userB.id, commentId],
        ),
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("user can DELETE own reaction", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userA.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    const del = await db.client.query(
      `DELETE FROM activity_comment_reactions WHERE comment_id = $1`,
      [commentId],
    );
    await commit(db.client);
    expect(del.rowCount).toBe(1);
  });

  it("user CANNOT DELETE another user's reaction (RLS no-op)", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userA.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    const del = await db.client.query(
      `DELETE FROM activity_comment_reactions WHERE comment_id = $1`,
      [commentId],
    );
    await commit(db.client);
    expect(del.rowCount).toBe(0);
  });

  it("trigger increments like_count under authenticated role (regression test for SECURITY DEFINER)", async () => {
    // This explicitly exercises the trigger under authenticated rather than service_role,
    // which would otherwise mask a missing SECURITY DEFINER. activity_comments grants
    // SELECT/INSERT/DELETE to authenticated but not UPDATE, so the trigger MUST run as
    // DEFINER for like_count to increment.
    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userB.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ like_count: number }>(
      `SELECT like_count FROM activity_comments WHERE id = $1`,
      [commentId],
    );
    expect(r.rows[0].like_count).toBe(1);
    await commit(db.client);
  });

  it("trigger increments like_count on INSERT, decrements on DELETE", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userA.id, commentId],
    );
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userB.id, commentId],
    );
    let r = await db.client.query<{ like_count: number }>(
      `SELECT like_count FROM activity_comments WHERE id = $1`,
      [commentId],
    );
    expect(r.rows[0].like_count).toBe(2);

    await db.client.query(
      `DELETE FROM activity_comment_reactions WHERE user_id = $1 AND comment_id = $2`,
      [fx.userA.id, commentId],
    );
    r = await db.client.query<{ like_count: number }>(
      `SELECT like_count FROM activity_comments WHERE id = $1`,
      [commentId],
    );
    expect(r.rows[0].like_count).toBe(1);
    await commit(db.client);
  });

  it("composite PK prevents duplicate likes", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userA.id, commentId],
    );
    await expect(
      db.client.query(
        `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
        [fx.userA.id, commentId],
      ),
    ).rejects.toThrow();
    await rollback(db.client);
  });

  it("ON DELETE CASCADE — deleting the parent comment removes reactions", async () => {
    await beginAs(db.client, null, "service_role");
    const c = await db.client.query<{ id: string }>(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'throwaway') RETURNING id`,
      [activityId, fx.userA.id],
    );
    const tmpId = c.rows[0].id;
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userB.id, tmpId],
    );
    await db.client.query(`DELETE FROM activity_comments WHERE id = $1`, [tmpId]);
    const r = await db.client.query(
      `SELECT * FROM activity_comment_reactions WHERE comment_id = $1`,
      [tmpId],
    );
    expect(r.rowCount).toBe(0);
    await commit(db.client);
  });
});
