import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: follows", () => {
  it("A can follow B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO follows (follower_user_id, followed_user_id) VALUES ($1, $2) RETURNING follower_user_id`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rows[0].follower_user_id).toBe(fx.userA.id);
    } finally { await rollback(db.client); }
  });

  it("A cannot insert a follow with someone else as the follower", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO follows (follower_user_id, followed_user_id) VALUES ($1, $2)`,
          [fx.userB.id, fx.userC.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("A can unfollow B", async () => {
    const fx = await seedFixtures(db.client);
    // Seed a follow via service-role
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO follows (follower_user_id, followed_user_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.userB.id]);
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `DELETE FROM follows WHERE follower_user_id = $1 AND followed_user_id = $2 RETURNING follower_user_id`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("B can force-unfollow A (soft block)", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO follows (follower_user_id, followed_user_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.userB.id]);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `DELETE FROM follows WHERE follower_user_id = $1 AND followed_user_id = $2 RETURNING follower_user_id`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("C cannot delete a follow between A and B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO follows (follower_user_id, followed_user_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.userB.id]);
    await commit(db.client);

    await beginAs(db.client, fx.userC.id, "authenticated");
    try {
      const r = await db.client.query(
        `DELETE FROM follows WHERE follower_user_id = $1 AND followed_user_id = $2`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("self-follow is rejected by CHECK constraint", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO follows (follower_user_id, followed_user_id) VALUES ($1, $1)`,
          [fx.userA.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });
});
