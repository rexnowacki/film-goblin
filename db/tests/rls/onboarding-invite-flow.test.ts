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
  await db.client.query(`DELETE FROM coven_requests`);
  await db.client.query(`DELETE FROM coven_members`);
  await db.client.query(`DELETE FROM notifications`);
  await commit(db.client);
});

async function bond(client: typeof db.client, x: string, y: string) {
  const [a, b] = x < y ? [x, y] : [y, x];
  await client.query(
    `INSERT INTO coven_members (user_a_id, user_b_id) VALUES ($1, $2)`,
    [a, b]
  );
}

describe("onboarding invite flow — coven_request insert via service-role", () => {
  it("creates exactly one coven_request when inviter and new user are distinct", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO coven_requests (from_user_id, to_user_id, status)
       VALUES ($1, $2, 'pending')`,
      [fx.userA.id, fx.userB.id]
    );
    const r = await db.client.query(
      `SELECT * FROM coven_requests WHERE from_user_id = $1 AND to_user_id = $2`,
      [fx.userA.id, fx.userB.id]
    );
    expect(r.rowCount).toBe(1);
    await commit(db.client);
  });

  it("trigger fires coven_invite_pending notification for the recipient", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO coven_requests (from_user_id, to_user_id, status)
       VALUES ($1, $2, 'pending')`,
      [fx.userA.id, fx.userB.id]
    );
    const r = await db.client.query<{ user_id: string; kind: string; actor_user_id: string }>(
      `SELECT user_id, kind, actor_user_id FROM notifications WHERE kind = 'coven_invite_pending'`
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].user_id).toBe(fx.userB.id);
    expect(r.rows[0].actor_user_id).toBe(fx.userA.id);
    await commit(db.client);
  });

  it("UNIQUE (from_user_id, to_user_id) prevents duplicate inserts", async () => {
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(
        `INSERT INTO coven_requests (from_user_id, to_user_id, status)
         VALUES ($1, $2, 'pending')`,
        [fx.userA.id, fx.userB.id]
      );
      await expect(
        db.client.query(
          `INSERT INTO coven_requests (from_user_id, to_user_id, status)
           VALUES ($1, $2, 'pending')`,
          [fx.userA.id, fx.userB.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("CHECK (from_user_id <> to_user_id) blocks self-invite at DB level", async () => {
    await beginAs(db.client, null, "service_role");
    try {
      await expect(
        db.client.query(
          `INSERT INTO coven_requests (from_user_id, to_user_id, status)
           VALUES ($1, $1, 'pending')`,
          [fx.userA.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("inviter and new user are already coven mates — bond is detectable via (a < b) lookup", async () => {
    await beginAs(db.client, null, "service_role");
    await bond(db.client, fx.userA.id, fx.userB.id);
    const a = fx.userA.id < fx.userB.id ? fx.userA.id : fx.userB.id;
    const b = fx.userA.id < fx.userB.id ? fx.userB.id : fx.userA.id;
    const bondR = await db.client.query(
      `SELECT * FROM coven_members WHERE user_a_id = $1 AND user_b_id = $2`,
      [a, b]
    );
    expect(bondR.rowCount).toBe(1);
    await commit(db.client);
  });

  it("recipient can SELECT their pending request (RLS owner-readable)", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO coven_requests (from_user_id, to_user_id, status)
       VALUES ($1, $2, 'pending')`,
      [fx.userA.id, fx.userB.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT * FROM coven_requests WHERE to_user_id = $1`,
        [fx.userB.id]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });
});
