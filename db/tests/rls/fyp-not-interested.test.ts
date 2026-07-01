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
  await db.client.query("DELETE FROM fyp_not_interested");
  await commit(db.client);
});

describe("RLS: fyp_not_interested", () => {
  it("user can insert and delete their own dismissal", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(
      "INSERT INTO fyp_not_interested (user_id, film_id) VALUES ($1, $2)",
      [fx.userA.id, fx.filmId],
    );
    const ins = await db.client.query("SELECT * FROM fyp_not_interested");
    expect(ins.rows).toHaveLength(1);
    await db.client.query(
      "DELETE FROM fyp_not_interested WHERE user_id = $1 AND film_id = $2",
      [fx.userA.id, fx.filmId],
    );
    const del = await db.client.query("SELECT * FROM fyp_not_interested");
    await commit(db.client);
    expect(del.rows).toHaveLength(0);
  });

  it("user cannot insert a dismissal for another user", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          "INSERT INTO fyp_not_interested (user_id, film_id) VALUES ($1, $2)",
          [fx.userB.id, fx.filmId],
        ),
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("users cannot see each other's dismissals", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(
      "INSERT INTO fyp_not_interested (user_id, film_id) VALUES ($1, $2)",
      [fx.userA.id, fx.filmId],
    );
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const { rows } = await db.client.query("SELECT * FROM fyp_not_interested");
      expect(rows).toHaveLength(0);
    } finally { await rollback(db.client); }
  });
});
