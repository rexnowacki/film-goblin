import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: films admin writes", () => {
  it("anon cannot INSERT", async () => {
    await beginAs(db.client, null, "anon");
    try {
      await expect(
        db.client.query(`INSERT INTO films (title, director, year, genre_primary) VALUES ('T','D',2024,'G')`)
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("non-staff authenticated cannot UPDATE", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO films (title, director, year, genre_primary) VALUES ('X','D',2024,'G') RETURNING id`
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const upd = await db.client.query(`UPDATE films SET title='Y' WHERE id=$1`, [r.rows[0].id]);
      expect(upd.rowCount).toBe(0); // policy blocks it silently — no rows match
    } finally { await rollback(db.client); }
  });

  it("authenticated reviewer cannot INSERT", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.staffS.id, "authenticated");
    try {
      await expect(
        db.client.query(`INSERT INTO films (title, director, year, genre_primary) VALUES ('T','D',2024,'G')`)
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("authenticated admin can INSERT, UPDATE, and DELETE", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.adminA.id, "authenticated");
    try {
      const ins = await db.client.query<{ id: string }>(
        `INSERT INTO films (title, director, year, genre_primary) VALUES ('Admin','D',2024,'G') RETURNING id`
      );
      expect(ins.rowCount).toBe(1);

      const upd = await db.client.query(`UPDATE films SET title='Admin2' WHERE id=$1`, [ins.rows[0].id]);
      expect(upd.rowCount).toBe(1);

      const del = await db.client.query(`DELETE FROM films WHERE id=$1`, [ins.rows[0].id]);
      expect(del.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });
});
