import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: watchlists + price_alerts", () => {
  it("A can add a film to their own watchlist", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO watchlists (user_id, film_id, max_price_usd) VALUES ($1, $2, 6.00) RETURNING id`,
        [fx.userA.id, fx.filmId]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("A cannot read B's watchlist", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2)`, [fx.userB.id, fx.filmId]);
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM watchlists WHERE user_id = $1`, [fx.userB.id]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("A cannot insert a watchlist row for B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2)`,
          [fx.userB.id, fx.filmId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("A can read their own alert", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const wl = await db.client.query<{ id: string }>(
      `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2) RETURNING id`,
      [fx.userA.id, fx.filmId]
    );
    await db.client.query(
      `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd) VALUES ($1, $2, 9.99, 4.99)`,
      [wl.rows[0].id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM price_alerts WHERE watchlist_id = $1`, [wl.rows[0].id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("B cannot read A's alerts", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const wl = await db.client.query<{ id: string }>(
      `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2) RETURNING id`,
      [fx.userA.id, fx.filmId]
    );
    await db.client.query(
      `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd) VALUES ($1, $2, 9.99, 4.99)`,
      [wl.rows[0].id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM price_alerts WHERE watchlist_id = $1`, [wl.rows[0].id]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("rejects a second open alert for the same watchlist+film (price_alerts_open_uniq)", async () => {
    // Regression: overlapping refresh runs each fired an alert for the same drop,
    // so a user saw the same film twice in one digest. The partial unique index
    // makes at most one un-notified alert per watchlist+film.
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const wl = await db.client.query<{ id: string }>(
        `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2) RETURNING id`,
        [fx.userA.id, fx.filmId]
      );
      const wlId = wl.rows[0].id;
      await db.client.query(
        `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd) VALUES ($1, $2, 14.99, 4.99)`,
        [wlId, fx.filmId]
      );
      await expect(
        db.client.query(
          `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd) VALUES ($1, $2, 14.99, 4.99)`,
          [wlId, fx.filmId]
        )
      ).rejects.toMatchObject({ code: "23505" });
    } finally { await rollback(db.client); }
  });

  it("allows a fresh alert once the prior one is notified", async () => {
    // The index only constrains OPEN (un-notified) alerts. After a digest sends,
    // a later drop on the same film must be able to alert again.
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const wl = await db.client.query<{ id: string }>(
        `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2) RETURNING id`,
        [fx.userA.id, fx.filmId]
      );
      const wlId = wl.rows[0].id;
      await db.client.query(
        `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd, notified_at)
         VALUES ($1, $2, 14.99, 4.99, now())`,
        [wlId, fx.filmId]
      );
      const r = await db.client.query(
        `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd) VALUES ($1, $2, 9.99, 5.99) RETURNING id`,
        [wlId, fx.filmId]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("authenticated client cannot INSERT into price_alerts (worker-only)", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const wl = await db.client.query<{ id: string }>(
      `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2) RETURNING id`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd) VALUES ($1, $2, 9.99, 4.99)`,
          [wl.rows[0].id, fx.filmId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });
});
