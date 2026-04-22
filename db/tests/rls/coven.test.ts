import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: coven_requests", () => {
  it("A can send a coven request to B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2) RETURNING status`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rows[0].status).toBe("pending");
    } finally { await rollback(db.client); }
  });

  it("C cannot see a request between A and B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.userB.id]);
    await commit(db.client);

    await beginAs(db.client, fx.userC.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT * FROM coven_requests WHERE from_user_id = $1 AND to_user_id = $2`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("B can accept A's request", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.userB.id]);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE coven_requests SET status = 'accepted', responded_at = now()
         WHERE from_user_id = $1 AND to_user_id = $2 RETURNING status`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rows[0].status).toBe("accepted");
    } finally { await rollback(db.client); }
  });

  it("A cannot accept their own request", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.userB.id]);
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE coven_requests SET status = 'accepted' WHERE from_user_id = $1 AND to_user_id = $2 RETURNING status`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("self-request is rejected", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $1)`,
          [fx.userA.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("anyone can read coven_members", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const lo = fx.userA.id < fx.userB.id ? fx.userA.id : fx.userB.id;
    const hi = fx.userA.id < fx.userB.id ? fx.userB.id : fx.userA.id;
    await db.client.query(`INSERT INTO coven_members (user_a_id, user_b_id) VALUES ($1, $2)`, [lo, hi]);
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT * FROM coven_members WHERE user_a_id = $1`, [lo]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("client cannot directly insert into coven_members", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const lo = fx.userA.id < fx.userB.id ? fx.userA.id : fx.userB.id;
      const hi = fx.userA.id < fx.userB.id ? fx.userB.id : fx.userA.id;
      await expect(
        db.client.query(`INSERT INTO coven_members (user_a_id, user_b_id) VALUES ($1, $2)`, [lo, hi])
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });
});
