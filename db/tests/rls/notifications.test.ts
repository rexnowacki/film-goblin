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

  describe("triggers", () => {
    async function bond(client: typeof db.client, x: string, y: string) {
      const [a, b] = x < y ? [x, y] : [y, x];
      await client.query(
        `INSERT INTO coven_members (user_a_id, user_b_id) VALUES ($1, $2)`,
        [a, b]
      );
    }

    beforeEach(async () => {
      await beginAs(db.client, null, "service_role");
      await db.client.query(`DELETE FROM notifications`);
      await db.client.query(`DELETE FROM coven_requests`);
      await db.client.query(`DELETE FROM coven_members`);
      await db.client.query(`DELETE FROM recommendations`);
      await commit(db.client);
    });

    it("coven_requests INSERT emits coven_invite_pending for to_user", async () => {
      await beginAs(db.client, null, "service_role");
      const { rows } = await db.client.query(
        `INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2) RETURNING id`,
        [fx.userA.id, fx.userB.id]
      );
      const reqId = rows[0].id;
      await commit(db.client);

      await beginAs(db.client, null, "service_role");
      try {
        const r = await db.client.query(
          `SELECT user_id, kind, actor_user_id, payload FROM notifications`
        );
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].user_id).toBe(fx.userB.id);
        expect(r.rows[0].kind).toBe("coven_invite_pending");
        expect(r.rows[0].actor_user_id).toBe(fx.userA.id);
        expect(r.rows[0].payload).toEqual({ coven_request_id: reqId });
      } finally { await rollback(db.client); }
    });

    it("coven_requests pending → accepted emits coven_invite_accepted for from_user", async () => {
      await beginAs(db.client, null, "service_role");
      const { rows } = await db.client.query(
        `INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2) RETURNING id`,
        [fx.userA.id, fx.userB.id]
      );
      const reqId = rows[0].id;
      // Clear out the auto-emitted pending notification so we can isolate accept
      await db.client.query(`DELETE FROM notifications`);
      await db.client.query(
        `UPDATE coven_requests SET status = 'accepted', responded_at = now() WHERE id = $1`,
        [reqId]
      );
      await commit(db.client);

      await beginAs(db.client, null, "service_role");
      try {
        const r = await db.client.query(
          `SELECT user_id, kind, actor_user_id, payload FROM notifications`
        );
        // The accept triggers TWO things: the existing 0111 trigger's coven_joined
        // activity rows (which we're not asserting on here) AND our new
        // coven_invite_accepted notification. Filter to our kind:
        const ours = r.rows.filter(row => row.kind === "coven_invite_accepted");
        expect(ours.length).toBe(1);
        expect(ours[0].user_id).toBe(fx.userA.id);
        expect(ours[0].actor_user_id).toBe(fx.userB.id);
        expect(ours[0].payload).toEqual({ coven_request_id: reqId });
      } finally { await rollback(db.client); }
    });

    it("recommendations INSERT emits recommendation_received for to_user", async () => {
      await beginAs(db.client, null, "service_role");
      await bond(db.client, fx.userA.id, fx.userB.id);
      const { rows } = await db.client.query(
        `INSERT INTO recommendations (from_user_id, to_user_id, film_id, note)
         VALUES ($1, $2, $3, 'great') RETURNING id`,
        [fx.userA.id, fx.userB.id, fx.filmId]
      );
      const recId = rows[0].id;
      await commit(db.client);

      await beginAs(db.client, null, "service_role");
      try {
        const r = await db.client.query(
          `SELECT user_id, kind, actor_user_id, payload FROM notifications WHERE kind = 'recommendation_received'`
        );
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].user_id).toBe(fx.userB.id);
        expect(r.rows[0].actor_user_id).toBe(fx.userA.id);
        expect(r.rows[0].payload).toEqual({ recommendation_id: recId, film_id: fx.filmId });
      } finally { await rollback(db.client); }
    });

    it("price_alerts INSERT emits price_drop for the watchlist owner", async () => {
      await beginAs(db.client, null, "service_role");
      const { rows: wlRows } = await db.client.query(
        `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2) RETURNING id`,
        [fx.userA.id, fx.filmId]
      );
      const wlId = wlRows[0].id;
      const { rows: alertRows } = await db.client.query(
        `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd)
         VALUES ($1, $2, 14.99, 9.99) RETURNING id`,
        [wlId, fx.filmId]
      );
      const alertId = alertRows[0].id;
      await commit(db.client);

      await beginAs(db.client, null, "service_role");
      try {
        const r = await db.client.query(
          `SELECT user_id, kind, actor_user_id, payload FROM notifications WHERE kind = 'price_drop'`
        );
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].user_id).toBe(fx.userA.id);
        expect(r.rows[0].actor_user_id).toBeNull();
        expect(r.rows[0].payload).toMatchObject({
          price_alert_id: alertId,
          film_id: fx.filmId,
        });
      } finally { await rollback(db.client); }
    });
  });
});
