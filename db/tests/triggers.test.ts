import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { makeTestDb, TestDb } from "./helpers/testcontainers.js";
import { beginAs, rollback, commit } from "./helpers/session.js";
import { seedFixtures } from "./helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("trigger: auth.users → profiles bootstrap", () => {
  it("creates a matching profiles row with a unique handle", async () => {
    const id = randomUUID();
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'goblin@test.example')`, [id]);
      const r = await db.client.query(`SELECT handle FROM profiles WHERE id = $1`, [id]);
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].handle).toMatch(/^goblin/);
    } finally { await rollback(db.client); }
  });

  it("de-duplicates handles by suffix", async () => {
    await beginAs(db.client, null, "service_role");
    try {
      const a = randomUUID(), b = randomUUID();
      await db.client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'alice@test.example')`, [a]);
      await db.client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'alice@other.example')`, [b]);
      const r = await db.client.query(
        `SELECT lower(handle) AS h FROM profiles WHERE id IN ($1, $2) ORDER BY handle`, [a, b]
      );
      const handles = r.rows.map((x: any) => x.h);
      expect(handles).toContain("alice");
      expect(handles.some((h: string) => /^alice\d+$/.test(h))).toBe(true);
    } finally { await rollback(db.client); }
  });
});

describe("trigger: coven_requests accept → coven_members + activity", () => {
  it("inserts coven_members with canonicalized pair on accept", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(
        `INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2)`,
        [fx.userA.id, fx.userB.id]
      );
      await db.client.query(
        `UPDATE coven_requests SET status = 'accepted', responded_at = now()
         WHERE from_user_id = $1 AND to_user_id = $2`,
        [fx.userA.id, fx.userB.id]
      );
      const lo = fx.userA.id < fx.userB.id ? fx.userA.id : fx.userB.id;
      const hi = fx.userA.id < fx.userB.id ? fx.userB.id : fx.userA.id;
      const r = await db.client.query(
        `SELECT user_a_id, user_b_id FROM coven_members WHERE user_a_id = $1 AND user_b_id = $2`,
        [lo, hi]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("emits exactly two 'coven_joined' activity rows on accept", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(`INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2)`, [fx.userA.id, fx.userB.id]);
      await db.client.query(
        `UPDATE coven_requests SET status = 'accepted' WHERE from_user_id = $1 AND to_user_id = $2`,
        [fx.userA.id, fx.userB.id]
      );
      const r = await db.client.query(
        `SELECT actor_user_id FROM activity WHERE kind = 'coven_joined' AND actor_user_id IN ($1, $2)`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rowCount).toBe(2);
    } finally { await rollback(db.client); }
  });

  it("does NOT emit on decline", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(`INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2)`, [fx.userA.id, fx.userB.id]);
      await db.client.query(
        `UPDATE coven_requests SET status = 'declined' WHERE from_user_id = $1 AND to_user_id = $2`,
        [fx.userA.id, fx.userB.id]
      );
      const members = await db.client.query(
        `SELECT count(*)::int AS n FROM coven_members WHERE user_a_id IN ($1, $2) OR user_b_id IN ($1, $2)`,
        [fx.userA.id, fx.userB.id]
      );
      const activityRows = await db.client.query(
        `SELECT count(*)::int AS n FROM activity WHERE kind = 'coven_joined' AND actor_user_id IN ($1, $2)`,
        [fx.userA.id, fx.userB.id]
      );
      expect(members.rows[0].n).toBe(0);
      expect(activityRows.rows[0].n).toBe(0);
    } finally { await rollback(db.client); }
  });
});
