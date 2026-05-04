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
     VALUES ($1, 'watchlist_added', $2) RETURNING id`,
    [fx.userA.id, JSON.stringify({ film_id: fx.filmId })]
  );
  activityId = res.rows[0].id;
  await commit(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM notifications`);
  await db.client.query(`DELETE FROM activity_comments WHERE activity_id = $1`, [activityId]);
  await commit(db.client);
});

describe("RLS: reply_on_comment notification trigger", () => {
  it("reply by userC on userB comment → notifies userB with reply_on_comment", async () => {
    // Seed parent comment by userB
    await beginAs(db.client, null, "service_role");
    const parent = await db.client.query<{ id: string }>(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'parent') RETURNING id`,
      [activityId, fx.userB.id]
    );
    await commit(db.client);
    const parentId = parent.rows[0].id;

    // userC replies
    await beginAs(db.client, fx.userC.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comments (activity_id, user_id, body, parent_id)
       VALUES ($1, $2, 'a reply', $3)`,
      [activityId, fx.userC.id, parentId]
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const n = await db.client.query<{
      kind: string; user_id: string; actor_user_id: string; payload: Record<string, unknown>;
    }>(
      `SELECT kind, user_id, actor_user_id, payload
       FROM notifications WHERE kind = 'reply_on_comment'`
    );
    await commit(db.client);

    expect(n.rowCount).toBe(1);
    expect(n.rows[0].user_id).toBe(fx.userB.id);
    expect(n.rows[0].actor_user_id).toBe(fx.userC.id);
    expect(n.rows[0].payload.parent_comment_id).toBe(parentId);
    expect(n.rows[0].payload.body).toBe("a reply");
  });

  it("self-reply → no notification", async () => {
    await beginAs(db.client, null, "service_role");
    const parent = await db.client.query<{ id: string }>(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'mine') RETURNING id`,
      [activityId, fx.userB.id]
    );
    await commit(db.client);
    const parentId = parent.rows[0].id;

    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comments (activity_id, user_id, body, parent_id)
       VALUES ($1, $2, 'self-reply', $3)`,
      [activityId, fx.userB.id, parentId]
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const n = await db.client.query(
      `SELECT id FROM notifications WHERE kind = 'reply_on_comment'`
    );
    await commit(db.client);
    expect(n.rowCount).toBe(0);
  });

  it("reply to activity owner's comment → no reply_on_comment notification", async () => {
    await beginAs(db.client, null, "service_role");
    const parent = await db.client.query<{ id: string }>(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'owner comment') RETURNING id`,
      [activityId, fx.userA.id]
    );
    await commit(db.client);
    const parentId = parent.rows[0].id;

    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comments (activity_id, user_id, body, parent_id)
       VALUES ($1, $2, 'reply to owner', $3)`,
      [activityId, fx.userB.id, parentId]
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const n = await db.client.query(
      `SELECT id FROM notifications WHERE kind = 'reply_on_comment'`
    );
    await commit(db.client);
    expect(n.rowCount).toBe(0);
  });
});
