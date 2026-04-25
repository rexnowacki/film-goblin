import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures, Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;
let activityId: string;

beforeAll(async () => {
  db = await makeTestDb();

  // Seed users, film, and one activity row authored by userA. These persist across
  // all tests — only activity_reactions rows are reset between tests.
  fx = await seedFixtures(db.client);

  // Insert a 'watchlist_added' activity by userA (service_role bypasses RLS).
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
  // Reset reactions between tests via service_role (bypasses RLS).
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM activity_reactions`);
  await commit(db.client);
});

describe("RLS: activity_reactions", () => {
  it("anon SELECT is denied — returns 0 rows even when rows exist", async () => {
    // Seed a reaction via service_role first.
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_reactions (activity_id, user_id) VALUES ($1, $2)`,
      [activityId, fx.userA.id]
    );
    await commit(db.client);

    // Anon role has no SELECT policy on activity_reactions.
    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT * FROM activity_reactions`);
      // Supabase anon gets GRANT SELECT on all tables in the testcontainers setup,
      // but the RLS policy is TO authenticated only — so anon sees 0 rows.
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("authenticated SELECT is allowed — any signed-in user can read all reactions", async () => {
    // Seed a reaction via service_role.
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_reactions (activity_id, user_id) VALUES ($1, $2)`,
      [activityId, fx.userA.id]
    );
    await commit(db.client);

    // userB (not the reaction owner) should still see the row.
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM activity_reactions`);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("authenticated INSERT with matching user_id succeeds", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO activity_reactions (activity_id, user_id) VALUES ($1, $2) RETURNING activity_id`,
        [activityId, fx.userA.id]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("authenticated INSERT with mismatched user_id is blocked by RLS", async () => {
    // userA's connection tries to insert a reaction attributed to userB — policy violation.
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO activity_reactions (activity_id, user_id) VALUES ($1, $2)`,
          [activityId, fx.userB.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("DELETE is scoped by RLS — userA can only delete their own reaction", async () => {
    // Seed two reactions via service_role (one per user).
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_reactions (activity_id, user_id) VALUES ($1, $2), ($1, $3)`,
      [activityId, fx.userA.id, fx.userB.id]
    );
    await commit(db.client);

    // userA deletes with no specific WHERE on user_id — RLS filters so only their
    // own row is visible/deletable. Commit so the effect is durable for the check below.
    await beginAs(db.client, fx.userA.id, "authenticated");
    const del = await db.client.query(
      `DELETE FROM activity_reactions WHERE activity_id = $1`,
      [activityId]
    );
    await commit(db.client);
    expect(del.rowCount).toBe(1);

    // Confirm userB's reaction still exists via service_role.
    await beginAs(db.client, null, "service_role");
    const remaining = await db.client.query(
      `SELECT user_id FROM activity_reactions WHERE activity_id = $1`,
      [activityId]
    );
    await commit(db.client);
    expect(remaining.rowCount).toBe(1);
    expect(remaining.rows[0].user_id).toBe(fx.userB.id);
  });
});
