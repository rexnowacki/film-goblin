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
  await db.client.query(`DELETE FROM fyp_impressions`);
  await commit(db.client);
});

describe("RLS: fyp_impressions + record_fyp_impressions RPC", () => {
  it("RPC inserts on first call and increments on repeat", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(`SELECT record_fyp_impressions($1::uuid[])`, [[fx.filmId]]);
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(`SELECT record_fyp_impressions($1::uuid[])`, [[fx.filmId]]);
    const { rows } = await db.client.query(
      `SELECT impressions FROM fyp_impressions WHERE user_id = $1 AND film_id = $2`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);
    expect(rows[0].impressions).toBe(2);
  });

  it("users cannot see each other's impressions", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(`SELECT record_fyp_impressions($1::uuid[])`, [[fx.filmId]]);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const { rows } = await db.client.query(`SELECT * FROM fyp_impressions`);
      expect(rows).toHaveLength(0);
    } finally { await rollback(db.client); }
  });

  it("direct INSERT is denied to authenticated (writes only via RPC)", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO fyp_impressions (user_id, film_id) VALUES ($1, $2)`,
          [fx.userA.id, fx.filmId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("unknown film ids are skipped, not errored", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(`SELECT record_fyp_impressions($1::uuid[])`, [
      ["00000000-0000-0000-0000-000000000000", fx.filmId],
    ]);
    const { rows } = await db.client.query(`SELECT film_id FROM fyp_impressions`);
    await commit(db.client);
    expect(rows).toHaveLength(1);
    expect(rows[0].film_id).toBe(fx.filmId);
  });
});
