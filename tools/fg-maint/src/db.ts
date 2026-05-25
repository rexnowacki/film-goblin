import pg from "pg";
import { requireEnv } from "./env.js";

export type PgClient = pg.Client;

export async function withClient<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: requireEnv("DATABASE_URL") });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

export interface Counts {
  films: number;
  available: number;
  retired: number;
  itunesBacked: number;
  tmdbBacked: number;
  withStreamingProviders: number;
  missingTrailer: number;
  missingCast: number;
  withPriceHistory: number;
  stalePrices: number;
  staleStreaming: number;
}

function n(value: unknown): number {
  return Number(value ?? 0);
}

export async function getCounts(client: PgClient): Promise<Counts> {
  const { rows } = await client.query(`
    WITH provider_films AS (
      SELECT DISTINCT film_id FROM film_watch_providers
    ),
    priced_films AS (
      SELECT DISTINCT film_id FROM price_history
    ),
    cast_films AS (
      SELECT DISTINCT film_id FROM film_cast
    )
    SELECT
      count(*)::int AS films,
      count(*) FILTER (WHERE available IS TRUE)::int AS available,
      count(*) FILTER (WHERE available IS FALSE OR tracking IS FALSE)::int AS retired,
      count(*) FILTER (WHERE itunes_id IS NOT NULL)::int AS itunes_backed,
      count(*) FILTER (WHERE tmdb_id IS NOT NULL)::int AS tmdb_backed,
      count(provider_films.film_id)::int AS with_streaming_providers,
      count(*) FILTER (WHERE trailer_youtube_id IS NULL)::int AS missing_trailer,
      count(*) FILTER (WHERE cast_films.film_id IS NULL)::int AS missing_cast,
      count(priced_films.film_id)::int AS with_price_history,
      count(*) FILTER (
        WHERE tracking IS TRUE
          AND itunes_id IS NOT NULL
          AND (last_checked_at IS NULL OR last_checked_at < now() - interval '20 hours')
      )::int AS stale_prices,
      count(*) FILTER (
        WHERE available IS TRUE
          AND (streaming_availability_checked_at IS NULL OR streaming_availability_checked_at < now() - interval '24 hours')
      )::int AS stale_streaming
    FROM films
    LEFT JOIN provider_films ON provider_films.film_id = films.id
    LEFT JOIN priced_films ON priced_films.film_id = films.id
    LEFT JOIN cast_films ON cast_films.film_id = films.id
  `);
  const row = rows[0] ?? {};
  return {
    films: n(row.films),
    available: n(row.available),
    retired: n(row.retired),
    itunesBacked: n(row.itunes_backed),
    tmdbBacked: n(row.tmdb_backed),
    withStreamingProviders: n(row.with_streaming_providers),
    missingTrailer: n(row.missing_trailer),
    missingCast: n(row.missing_cast),
    withPriceHistory: n(row.with_price_history),
    stalePrices: n(row.stale_prices),
    staleStreaming: n(row.stale_streaming),
  };
}

export interface FullPriceFilm {
  id: string;
  itunes_id: number;
  title: string;
}

export async function selectFullPriceSnapshot(client: PgClient): Promise<FullPriceFilm[]> {
  const { rows } = await client.query(`
    SELECT id, itunes_id, title
    FROM films
    WHERE tracking IS TRUE
      AND itunes_id IS NOT NULL
      AND itunes_id > 0
    ORDER BY last_checked_at ASC NULLS FIRST, title ASC
  `);
  return rows.map((row) => ({
    id: row.id,
    itunes_id: Number(row.itunes_id),
    title: row.title,
  }));
}
