import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: activity", () => {
  it("anyone can read activity rows", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity (actor_user_id, kind, payload) VALUES ($1, 'list_created', '{"list_id":"abc"}'::jsonb)`,
      [fx.userA.id]
    );
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      // Scope to the kind we inserted — seedFixtures' profile creation also
      // emits a user_joined activity row for this actor (0195 trigger).
      const r = await db.client.query(`SELECT id FROM activity WHERE actor_user_id = $1 AND kind = 'list_created'`, [fx.userA.id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("authenticated user cannot directly INSERT activity", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO activity (actor_user_id, kind) VALUES ($1, 'list_created')`,
          [fx.userA.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("authenticated user cannot UPDATE activity", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO activity (actor_user_id, kind) VALUES ($1, 'list_created') RETURNING id`,
      [fx.userA.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const u = await db.client.query(
        `UPDATE activity SET kind = 'review_published' WHERE id = $1`,
        [r.rows[0].id]
      );
      expect(u.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("authenticated user cannot DELETE activity", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO activity (actor_user_id, kind) VALUES ($1, 'list_created') RETURNING id`,
      [fx.userA.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const d = await db.client.query(`DELETE FROM activity WHERE id = $1`, [r.rows[0].id]);
      expect(d.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });
});
