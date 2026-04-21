import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { makeServer } from "./helpers/http.js";
import { makeTestDb } from "./helpers/db.js";
import { runOnce } from "../src/worker.js";
import { upsertFilm } from "../src/db.js";
import { midsommarResult } from "./fixtures/itunes-responses.js";

const server = makeServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("runOnce", () => {
  it("refreshes films, writes price history on change, fires alert on drop", async () => {
    const { client, close } = await makeTestDb();
    try {
      // Seed film at 5.99, expecting drop to 4.99.
      const filmId = await upsertFilm(client, {
        itunes_id: 1468845007, title: "Midsommar", director: "Ari Aster",
        year: 2019, runtime_min: 147, genre_primary: "Horror",
        description: "", content_advisory: "R", artwork_url: "", itunes_url: "",
        price_usd: 5.99, hd_price_usd: null,
      });
      await client.query(
        `INSERT INTO price_history (film_id, price_usd) VALUES ($1, 5.99)`,
        [filmId]
      );
      await client.query(
        `INSERT INTO watchlists (user_id, film_id, max_price_usd) VALUES (gen_random_uuid(), $1, 6.00)`,
        [filmId]
      );

      server.use(http.get("https://itunes.apple.com/lookup", () =>
        HttpResponse.json({ resultCount: 1, results: [{ ...midsommarResult, trackPrice: 4.99 }] })
      ));

      const digest = await runOnce(client, { batchSize: 10 });

      const snap = digest.snapshot();
      expect(snap.films_refreshed).toBe(1);
      expect(snap.price_changes).toBe(1);
      expect(snap.alerts_fired).toBe(1);

      const hist = await client.query(`SELECT price_usd FROM price_history WHERE film_id = $1 ORDER BY captured_at`, [filmId]);
      expect(hist.rows.map((r: any) => Number(r.price_usd))).toEqual([5.99, 4.99]);

      const alerts = await client.query(`SELECT old_price_usd, new_price_usd FROM price_alerts WHERE film_id = $1`, [filmId]);
      expect(alerts.rows).toHaveLength(1);
      expect(Number(alerts.rows[0].old_price_usd)).toBe(5.99);
      expect(Number(alerts.rows[0].new_price_usd)).toBe(4.99);
    } finally { await close(); }
  });

  it("marks a removed film unavailable when lookup returns resultCount=0", async () => {
    const { client, close } = await makeTestDb();
    try {
      const filmId = await upsertFilm(client, {
        itunes_id: 99999, title: "Removed", director: "", year: 2020,
        runtime_min: 0, genre_primary: "", description: "",
        content_advisory: "", artwork_url: "", itunes_url: "",
        price_usd: 4.99, hd_price_usd: null,
      });
      server.use(http.get("https://itunes.apple.com/lookup", () =>
        HttpResponse.json({ resultCount: 0, results: [] })
      ));

      const digest = await runOnce(client, { batchSize: 10 });

      expect(digest.snapshot().unavailable_marked).toBe(1);
      const r = await client.query(`SELECT tracking, available FROM films WHERE id = $1`, [filmId]);
      expect(r.rows[0].tracking).toBe(false);
      expect(r.rows[0].available).toBe(false);
    } finally { await close(); }
  });

  it("does not write history or alerts when price is unchanged", async () => {
    const { client, close } = await makeTestDb();
    try {
      const filmId = await upsertFilm(client, {
        itunes_id: 1468845007, title: "Midsommar", director: "Ari Aster",
        year: 2019, runtime_min: 147, genre_primary: "Horror",
        description: "", content_advisory: "R", artwork_url: "", itunes_url: "",
        price_usd: 4.99, hd_price_usd: null,
      });
      await client.query(`INSERT INTO price_history (film_id, price_usd) VALUES ($1, 4.99)`, [filmId]);

      server.use(http.get("https://itunes.apple.com/lookup", () =>
        HttpResponse.json({ resultCount: 1, results: [{ ...midsommarResult, trackPrice: 4.99 }] })
      ));

      const digest = await runOnce(client, { batchSize: 10 });

      expect(digest.snapshot().price_changes).toBe(0);
      expect(digest.snapshot().alerts_fired).toBe(0);
      const hist = await client.query(`SELECT count(*)::int AS n FROM price_history WHERE film_id = $1`, [filmId]);
      expect(hist.rows[0].n).toBe(1);
    } finally { await close(); }
  });

  it("marks is_sale=TRUE when the new price is below the trailing-180d max", async () => {
    const { client, close } = await makeTestDb();
    try {
      const filmId = await upsertFilm(client, {
        itunes_id: 1468845007, title: "Midsommar", director: "Ari Aster",
        year: 2019, runtime_min: 147, genre_primary: "Horror",
        description: "", content_advisory: "R", artwork_url: "", itunes_url: "",
        price_usd: 14.99, hd_price_usd: null,
      });
      // Seed a historical high: $14.99 a few weeks ago.
      await client.query(
        `INSERT INTO price_history (film_id, price_usd, captured_at) VALUES ($1, 14.99, now() - INTERVAL '20 days')`,
        [filmId]
      );
      server.use(http.get("https://itunes.apple.com/lookup", () =>
        HttpResponse.json({ resultCount: 1, results: [{ ...midsommarResult, trackPrice: 4.99 }] })
      ));

      await runOnce(client, { batchSize: 10 });

      const r = await client.query(
        `SELECT is_sale FROM price_history WHERE film_id = $1 ORDER BY captured_at DESC LIMIT 1`,
        [filmId]
      );
      expect(r.rows[0].is_sale).toBe(true);
    } finally { await close(); }
  });
});
