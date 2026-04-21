import type { Client } from "pg";
import type { FilmRow, PriceHistoryRow, WatchlistRow, ParsedFilm } from "./types.js";

// Postgres returns NUMERIC as strings by default (because JS has no arbitrary precision).
// We coerce at the read boundary so consumers see numbers.
function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export async function selectFilmsToRefresh(
  client: Client,
  limit: number
): Promise<FilmRow[]> {
  const r = await client.query<FilmRow>(
    `SELECT * FROM films
     WHERE tracking = TRUE
     ORDER BY last_checked_at ASC NULLS FIRST
     LIMIT $1`,
    [limit]
  );
  return r.rows;
}

export async function latestPriceHistory(
  client: Client,
  filmId: string
): Promise<PriceHistoryRow | null> {
  const r = await client.query(
    `SELECT * FROM price_history
     WHERE film_id = $1
     ORDER BY captured_at DESC
     LIMIT 1`,
    [filmId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    ...row,
    price_usd: Number(row.price_usd),
    hd_price_usd: numOrNull(row.hd_price_usd),
  } as PriceHistoryRow;
}

export async function findWatchlistsForFilm(
  client: Client,
  filmId: string
): Promise<WatchlistRow[]> {
  const r = await client.query(
    `SELECT * FROM watchlists WHERE film_id = $1`,
    [filmId]
  );
  return r.rows.map((row: any) => ({
    ...row,
    max_price_usd: numOrNull(row.max_price_usd),
  })) as WatchlistRow[];
}
