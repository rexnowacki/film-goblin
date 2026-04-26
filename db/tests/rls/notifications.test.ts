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
  await db.client.query(`DELETE FROM notifications`);
  await commit(db.client);
});

describe("RLS: notifications", () => {
  it("recipient SELECTs own rows; other users see nothing", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO notifications (user_id, kind, actor_user_id, payload)
       VALUES ($1, 'recommendation_received', $2, $3::jsonb)`,
      [fx.userA.id, fx.userB.id, JSON.stringify({ recommendation_id: "00000000-0000-0000-0000-000000000000", film_id: fx.filmId })]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM notifications`);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM notifications`);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("recipient can UPDATE read_at on own row; cannot UPDATE another's", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO notifications (user_id, kind, payload)
       VALUES ($1, 'price_drop', '{}'::jsonb), ($2, 'price_drop', '{}'::jsonb)`,
      [fx.userA.id, fx.userB.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE notifications SET read_at = now() WHERE user_id = $1 RETURNING id`,
        [fx.userA.id]
      );
      expect(r.rowCount).toBe(1);
      const otherTry = await db.client.query(
        `UPDATE notifications SET read_at = now() WHERE user_id = $1 RETURNING id`,
        [fx.userB.id]
      );
      expect(otherTry.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("authenticated INSERT is denied (no client write policy)", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO notifications (user_id, kind, payload)
           VALUES ($1, 'price_drop', '{}'::jsonb)`,
          [fx.userA.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });
});
