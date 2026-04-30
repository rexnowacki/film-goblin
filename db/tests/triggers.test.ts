import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { makeTestDb, TestDb } from "./helpers/testcontainers.js";
import { beginAs, rollback, commit } from "./helpers/session.js";
import { seedFixtures } from "./helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("trigger: auth.users → profiles bootstrap", () => {
  it("creates a matching profiles row with a unique username", async () => {
    const id = randomUUID();
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'goblin@test.example')`, [id]);
      const r = await db.client.query(`SELECT username FROM profiles WHERE id = $1`, [id]);
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].username).toMatch(/^goblin/);
    } finally { await rollback(db.client); }
  });

  it("de-duplicates handles by suffix", async () => {
    await beginAs(db.client, null, "service_role");
    try {
      const a = randomUUID(), b = randomUUID();
      await db.client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'alice@test.example')`, [a]);
      await db.client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'alice@other.example')`, [b]);
      const r = await db.client.query(
        `SELECT lower(username) AS h FROM profiles WHERE id IN ($1, $2) ORDER BY username`, [a, b]
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

describe("trigger: activity fan-out", () => {
  it("lists insert emits list_created activity", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query<{ id: string }>(
        `INSERT INTO lists (owner_user_id, title) VALUES ($1, 'Grimoire') RETURNING id`,
        [fx.userA.id]
      );
      const a = await db.client.query(
        `SELECT kind, payload FROM activity WHERE actor_user_id = $1`, [fx.userA.id]
      );
      expect(a.rowCount).toBe(1);
      expect(a.rows[0].kind).toBe("list_created");
      expect(a.rows[0].payload.list_id).toBe(r.rows[0].id);
    } finally { await rollback(db.client); }
  });

  it("list_films insert emits list_film_added with list owner as actor", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const list = await db.client.query<{ id: string }>(
        `INSERT INTO lists (owner_user_id, title) VALUES ($1, 'G') RETURNING id`, [fx.userA.id]
      );
      await db.client.query(
        `INSERT INTO list_films (list_id, film_id, position) VALUES ($1, $2, 0)`,
        [list.rows[0].id, fx.filmId]
      );
      const r = await db.client.query(
        `SELECT actor_user_id FROM activity WHERE kind = 'list_film_added' AND actor_user_id = $1`,
        [fx.userA.id]
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].actor_user_id).toBe(fx.userA.id);
    } finally { await rollback(db.client); }
  });

  it("recommendations insert emits recommendation_sent", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(
        `INSERT INTO recommendations (from_user_id, to_user_id, film_id, note) VALUES ($1, $2, $3, 'rec')`,
        [fx.userA.id, fx.userB.id, fx.filmId]
      );
      const r = await db.client.query(
        `SELECT kind, payload FROM activity WHERE actor_user_id = $1 AND kind = 'recommendation_sent'`,
        [fx.userA.id]
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].payload.to_user_id).toBe(fx.userB.id);
    } finally { await rollback(db.client); }
  });

  it("watchlist insert with broadcast=false does NOT emit activity", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      // broadcast defaults to FALSE
      await db.client.query(`INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2)`, [fx.userA.id, fx.filmId]);
      const r = await db.client.query(
        `SELECT count(*)::int AS n FROM activity WHERE actor_user_id = $1 AND kind = 'watchlist_added'`,
        [fx.userA.id]
      );
      expect(r.rows[0].n).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("watchlist insert with broadcast=true emits activity", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(`UPDATE profiles SET broadcast_watchlist_adds = TRUE WHERE id = $1`, [fx.userA.id]);
      await db.client.query(`INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2)`, [fx.userA.id, fx.filmId]);
      const r = await db.client.query(
        `SELECT kind, payload FROM activity WHERE actor_user_id = $1 AND kind = 'watchlist_added'`,
        [fx.userA.id]
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].payload.film_id).toBe(fx.filmId);
    } finally { await rollback(db.client); }
  });
});

describe("trigger: review draft→published", () => {
  it("emits review_published activity on transition", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query<{ id: string }>(
        `INSERT INTO reviews (film_id, author_user_id, title, body) VALUES ($1, $2, 'T', 'B') RETURNING id`,
        [fx.filmId, fx.staffS.id]
      );
      // No activity yet (draft insert)
      const a1 = await db.client.query(
        `SELECT count(*)::int AS n FROM activity WHERE kind = 'review_published' AND actor_user_id = $1`,
        [fx.staffS.id]
      );
      expect(a1.rows[0].n).toBe(0);

      await db.client.query(
        `UPDATE reviews SET status = 'published', published_at = now() WHERE id = $1`,
        [r.rows[0].id]
      );

      const a2 = await db.client.query(
        `SELECT actor_user_id, payload FROM activity WHERE kind = 'review_published' AND actor_user_id = $1`,
        [fx.staffS.id]
      );
      expect(a2.rowCount).toBe(1);
      expect(a2.rows[0].actor_user_id).toBe(fx.staffS.id);
      expect(a2.rows[0].payload.review_id).toBe(r.rows[0].id);
    } finally { await rollback(db.client); }
  });

  it("does NOT emit when updating a draft (status stays draft)", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query<{ id: string }>(
        `INSERT INTO reviews (film_id, author_user_id, title, body) VALUES ($1, $2, 'T', 'B') RETURNING id`,
        [fx.filmId, fx.staffS.id]
      );
      await db.client.query(`UPDATE reviews SET body = 'edited' WHERE id = $1`, [r.rows[0].id]);
      const a = await db.client.query(
        `SELECT count(*)::int AS n FROM activity WHERE kind = 'review_published' AND actor_user_id = $1`,
        [fx.staffS.id]
      );
      expect(a.rows[0].n).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("does NOT emit when editing an already-published review", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query<{ id: string }>(
        `INSERT INTO reviews (film_id, author_user_id, title, body, status, published_at)
         VALUES ($1, $2, 'T', 'B', 'published', now()) RETURNING id`,
        [fx.filmId, fx.staffS.id]
      );
      // Initial published insert doesn't fire the trigger (UPDATE trigger, not INSERT)
      await db.client.query(`UPDATE reviews SET body = 'edited' WHERE id = $1`, [r.rows[0].id]);
      const a = await db.client.query(
        `SELECT count(*)::int AS n FROM activity WHERE kind = 'review_published' AND actor_user_id = $1`,
        [fx.staffS.id]
      );
      expect(a.rows[0].n).toBe(0);
    } finally { await rollback(db.client); }
  });
});
