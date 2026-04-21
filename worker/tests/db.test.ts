import { describe, it, expect } from "vitest";
import { makeTestDb } from "./helpers/db.js";
import { selectFilmsToRefresh, latestPriceHistory, findWatchlistsForFilm } from "../src/db.js";

async function insertFilm(client: any, itunes_id: number, opts: any = {}) {
  const r = await client.query(
    `INSERT INTO films (itunes_id, title, last_checked_at, tracking)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [itunes_id, opts.title ?? "T", opts.last_checked_at ?? null, opts.tracking ?? true]
  );
  return r.rows[0].id as string;
}

describe("migrations", () => {
  it("creates the three core tables", async () => {
    const { client, close } = await makeTestDb();
    try {
      const tables = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
      );
      const names = tables.rows.map((r: { table_name: string }) => r.table_name);
      expect(names).toEqual(expect.arrayContaining([
        "_migrations", "films", "price_alerts", "price_history", "watchlists",
      ]));
    } finally {
      await close();
    }
  });
});

describe("selectFilmsToRefresh", () => {
  it("orders by last_checked_at ASC NULLS FIRST and respects limit and tracking flag", async () => {
    const { client, close } = await makeTestDb();
    try {
      const a = await insertFilm(client, 1, { last_checked_at: null });
      const b = await insertFilm(client, 2, { last_checked_at: new Date("2020-01-01") });
      const c = await insertFilm(client, 3, { last_checked_at: new Date("2030-01-01") });
      await insertFilm(client, 4, { tracking: false });
      const rows = await selectFilmsToRefresh(client, 10);
      expect(rows.map(r => r.id)).toEqual([a, b, c]);
    } finally { await close(); }
  });
});

describe("latestPriceHistory", () => {
  it("returns null when no history", async () => {
    const { client, close } = await makeTestDb();
    try {
      const id = await insertFilm(client, 1);
      expect(await latestPriceHistory(client, id)).toBeNull();
    } finally { await close(); }
  });

  it("returns the most recent row", async () => {
    const { client, close } = await makeTestDb();
    try {
      const id = await insertFilm(client, 1);
      await client.query(
        `INSERT INTO price_history (film_id, price_usd, captured_at) VALUES ($1, 5.99, $2), ($1, 4.99, $3)`,
        [id, new Date("2026-01-01"), new Date("2026-04-01")]
      );
      const latest = await latestPriceHistory(client, id);
      expect(latest!.price_usd).toBe(4.99);
    } finally { await close(); }
  });
});

describe("findWatchlistsForFilm", () => {
  it("returns all watchlist entries for a film", async () => {
    const { client, close } = await makeTestDb();
    try {
      const film = await insertFilm(client, 1);
      await client.query(
        `INSERT INTO watchlists (user_id, film_id, max_price_usd) VALUES
         (gen_random_uuid(), $1, 5.00),
         (gen_random_uuid(), $1, 8.00)`,
        [film]
      );
      const rows = await findWatchlistsForFilm(client, film);
      expect(rows).toHaveLength(2);
    } finally { await close(); }
  });
});
