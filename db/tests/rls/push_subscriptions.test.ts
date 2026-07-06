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
  await db.client.query(`DELETE FROM push_subscriptions`);
  await commit(db.client);
});

function sub(userId: string, endpoint: string) {
  return {
    text: `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
           VALUES ($1, $2, 'p256dh-key', 'auth-key')`,
    values: [userId, endpoint],
  };
}

describe("RLS: push_subscriptions", () => {
  it("owner can INSERT own subscription", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const q = sub(fx.userA.id, "https://push.example/a1");
      await db.client.query(q.text, q.values);
      const r = await db.client.query(`SELECT * FROM push_subscriptions`);
      expect(r.rowCount).toBe(1);
      await commit(db.client);
    } catch (e) { await rollback(db.client); throw e; }
  });

  it("user cannot INSERT a subscription for someone else", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const q = sub(fx.userB.id, "https://push.example/b1");
      await expect(db.client.query(q.text, q.values)).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("user cannot SELECT another user's subscriptions", async () => {
    await beginAs(db.client, null, "service_role");
    const q = sub(fx.userA.id, "https://push.example/a2");
    await db.client.query(q.text, q.values);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM push_subscriptions`);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("owner can DELETE own subscription; cannot delete another's", async () => {
    await beginAs(db.client, null, "service_role");
    const qa = sub(fx.userA.id, "https://push.example/a3");
    const qb = sub(fx.userB.id, "https://push.example/b3");
    await db.client.query(qa.text, qa.values);
    await db.client.query(qb.text, qb.values);
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      // Deleting B's row silently affects 0 rows under RLS.
      const rb = await db.client.query(
        `DELETE FROM push_subscriptions WHERE endpoint = 'https://push.example/b3'`
      );
      expect(rb.rowCount).toBe(0);
      const ra = await db.client.query(
        `DELETE FROM push_subscriptions WHERE endpoint = 'https://push.example/a3'`
      );
      expect(ra.rowCount).toBe(1);
      await commit(db.client);
    } catch (e) { await rollback(db.client); throw e; }

    await beginAs(db.client, null, "service_role");
    const left = await db.client.query(`SELECT endpoint FROM push_subscriptions`);
    await commit(db.client);
    expect(left.rows.map(r => r.endpoint)).toEqual(["https://push.example/b3"]);
  });

  it("anon cannot read push_fanout_config (deny-all RLS)", async () => {
    await beginAs(db.client, null, "anon");
    try {
      // Either 0 rows (RLS) or permission denied (no grant) — both prove denial.
      const r = await db.client
        .query(`SELECT * FROM push_fanout_config`)
        .then(res => res.rowCount)
        .catch(() => 0);
      expect(r).toBe(0);
    } finally { await rollback(db.client); }
  });
});
