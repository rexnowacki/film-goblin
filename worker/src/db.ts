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
  const r = await client.query(
    `SELECT * FROM films
     WHERE tracking = TRUE
     ORDER BY last_checked_at ASC NULLS FIRST
     LIMIT $1`,
    [limit]
  );
  // BIGINT comes back as a string from pg; coerce at the boundary.
  return r.rows.map((row: any) => ({
    ...row,
    itunes_id: Number(row.itunes_id),
  })) as FilmRow[];
}

export async function maxPriceInWindow(
  client: Client,
  filmId: string,
  days: number
): Promise<number | null> {
  const r = await client.query(
    `SELECT MAX(price_usd) AS max_price FROM price_history
     WHERE film_id = $1 AND captured_at > now() - ($2 || ' days')::INTERVAL`,
    [filmId, String(days)]
  );
  return numOrNull(r.rows[0]?.max_price);
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

export async function upsertFilm(client: Client, f: ParsedFilm): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO films (
       itunes_id, title, director, year, runtime_min, genre_primary,
       description, content_advisory, artwork_url, itunes_url
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (itunes_id) DO UPDATE SET
       title = EXCLUDED.title,
       director = EXCLUDED.director,
       year = EXCLUDED.year,
       runtime_min = EXCLUDED.runtime_min,
       genre_primary = EXCLUDED.genre_primary,
       description = EXCLUDED.description,
       content_advisory = EXCLUDED.content_advisory,
       artwork_url = EXCLUDED.artwork_url,
       itunes_url = EXCLUDED.itunes_url
     RETURNING id`,
    [
      f.itunes_id, f.title, f.director, f.year, f.runtime_min, f.genre_primary,
      f.description, f.content_advisory, f.artwork_url, f.itunes_url,
    ]
  );
  return r.rows[0].id;
}

export async function insertPriceHistory(
  client: Client,
  filmId: string,
  price_usd: number,
  hd_price_usd: number | null,
  is_sale: boolean
): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO price_history (film_id, price_usd, hd_price_usd, is_sale)
       VALUES ($1, $2, $3, $4)`,
      [filmId, price_usd, hd_price_usd, is_sale]
    );
    await client.query(
      `UPDATE films SET last_checked_at = now(), last_priced_at = now() WHERE id = $1`,
      [filmId]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

export async function updateLastChecked(client: Client, filmId: string): Promise<void> {
  await client.query(`UPDATE films SET last_checked_at = now() WHERE id = $1`, [filmId]);
}

export async function markUnavailable(client: Client, filmId: string): Promise<void> {
  await client.query(
    `UPDATE films SET tracking = FALSE, available = FALSE, last_checked_at = now() WHERE id = $1`,
    [filmId]
  );
}

export async function createAlertAndMark(
  client: Client,
  watchlistId: string,
  filmId: string,
  oldPrice: number,
  newPrice: number
): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd)
       VALUES ($1, $2, $3, $4)`,
      [watchlistId, filmId, oldPrice, newPrice]
    );
    await client.query(
      `UPDATE watchlists SET last_alerted_at = now() WHERE id = $1`,
      [watchlistId]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}
