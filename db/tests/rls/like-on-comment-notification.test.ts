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

  // userA owns the activity. userA also authors a comment on it (so the
  // recipient of the notification will be userA when someone else likes that
  // comment). userB will be the liker.
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
  await db.client.query(`DELETE FROM notifications`);
  await db.client.query(`DELETE FROM activity_comment_reactions`);
  await db.client.query(`UPDATE activity_comments SET like_count = 0 WHERE id = $1`, [commentId]);
  await db.client.query(`UPDATE profiles SET notify_comment_likes = TRUE`);
  await commit(db.client);
});

describe("trigger: notify_like_on_comment", () => {
  it("inserts one notification for the comment author when a different user likes", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userB.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{
      kind: string; user_id: string; actor_user_id: string;
      payload: { activity_id: string; comment_id: string; body: string; film_id: string };
    }>(
      `SELECT kind, user_id, actor_user_id, payload FROM notifications WHERE kind = 'like_on_comment'`,
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].user_id).toBe(fx.userA.id);
    expect(r.rows[0].actor_user_id).toBe(fx.userB.id);
    expect(r.rows[0].payload.activity_id).toBe(activityId);
    expect(r.rows[0].payload.comment_id).toBe(commentId);
    expect(r.rows[0].payload.body).toBe("first");
    expect(r.rows[0].payload.film_id).toBe(fx.filmId);
    await commit(db.client);
  });

  it("self-like does NOT generate a notification", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userA.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const r = await db.client.query(
      `SELECT * FROM notifications WHERE kind = 'like_on_comment'`,
    );
    expect(r.rowCount).toBe(0);
    await commit(db.client);
  });

  it("recipient with notify_comment_likes = FALSE gets no notification", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `UPDATE profiles SET notify_comment_likes = FALSE WHERE id = $1`,
      [fx.userA.id],
    );
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userB.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const r = await db.client.query(
      `SELECT * FROM notifications WHERE kind = 'like_on_comment'`,
    );
    expect(r.rowCount).toBe(0);
    await commit(db.client);
  });

  it("un-like (DELETE on activity_comment_reactions) does NOT remove the notification", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userB.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    let r = await db.client.query(
      `SELECT * FROM notifications WHERE kind = 'like_on_comment'`,
    );
    expect(r.rowCount).toBe(1);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `DELETE FROM activity_comment_reactions WHERE user_id = $1 AND comment_id = $2`,
      [fx.userB.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    r = await db.client.query(
      `SELECT * FROM notifications WHERE kind = 'like_on_comment'`,
    );
    expect(r.rowCount).toBe(1);
    await commit(db.client);
  });

  it("liker cannot SELECT recipient's notification (RLS owner-only)", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userB.id, commentId],
    );
    await commit(db.client);

    // Liker (userB) reads notifications: should see NONE because RLS scopes to user_id = auth.uid().
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT * FROM notifications WHERE kind = 'like_on_comment'`,
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }

    // Recipient (userA) reads: should see the row.
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT * FROM notifications WHERE kind = 'like_on_comment'`,
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });
});
