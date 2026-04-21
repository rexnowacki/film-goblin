import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: staff", () => {
  it("anyone can read staff rows", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT user_id, role FROM staff WHERE user_id = $1`, [fx.staffS.id]);
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].role).toBe("reviewer");
    } finally { await rollback(db.client); }
  });

  it("authenticated user cannot insert into staff", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO staff (user_id, role) VALUES ($1, 'reviewer')`,
          [fx.userA.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("service-role CAN insert into staff", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      // userC isn't staff yet in fixtures
      const r = await db.client.query(
        `INSERT INTO staff (user_id, role) VALUES ($1, 'reviewer') RETURNING role`,
        [fx.userC.id]
      );
      expect(r.rows[0].role).toBe("reviewer");
    } finally { await rollback(db.client); }
  });
});
