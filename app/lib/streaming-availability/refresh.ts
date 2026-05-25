import type pg from "pg";
import { lookupTmdbWatchProviders, type TmdbWatchProvider } from "@/lib/search/tmdb";

export interface StreamingAvailabilityRefreshOptions {
  maxFilms?: number;
  staleHours?: number;
  region?: string;
}

export interface StreamingAvailabilityRefreshResult {
  checked: number;
  refreshed: number;
  providersSaved: number;
  failed: number;
  skipped: number;
  region: string;
}

interface FilmRow {
  id: string;
  tmdb_id: number;
}

type PgClient = pg.Client | pg.PoolClient;

function positiveInt(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? Math.floor(value!) : fallback;
}

async function selectFilms(
  client: PgClient,
  opts: { maxFilms: number; staleHours: number },
): Promise<FilmRow[]> {
  const { rows } = await client.query<FilmRow>(
    `
      SELECT id, tmdb_id
      FROM films
      WHERE tmdb_id IS NOT NULL
        AND available IS TRUE
        AND (
          streaming_availability_checked_at IS NULL
          OR streaming_availability_checked_at < now() - ($2::text)::interval
        )
      ORDER BY streaming_availability_checked_at ASC NULLS FIRST, first_seen_at DESC
      LIMIT $1
    `,
    [opts.maxFilms, `${opts.staleHours} hours`],
  );
  return rows;
}

async function replaceProviders(
  client: PgClient,
  input: { filmId: string; region: string; providers: TmdbWatchProvider[] },
): Promise<number> {
  await client.query("BEGIN");
  try {
    await client.query(
      `DELETE FROM film_watch_providers WHERE film_id = $1 AND region = $2`,
      [input.filmId, input.region],
    );

    for (const provider of input.providers) {
      await client.query(
        `
          INSERT INTO film_watch_providers (
            film_id, region, provider_id, provider_name, provider_logo_path,
            category, display_priority, tmdb_link, last_seen_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
        `,
        [
          input.filmId,
          input.region,
          provider.provider_id,
          provider.provider_name,
          provider.provider_logo_path,
          provider.category,
          provider.display_priority,
          provider.tmdb_link,
        ],
      );
    }

    await client.query(
      `UPDATE films SET streaming_availability_checked_at = now() WHERE id = $1`,
      [input.filmId],
    );
    await client.query("COMMIT");
    return input.providers.length;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

export async function runStreamingAvailabilityRefresh(
  client: PgClient,
  options: StreamingAvailabilityRefreshOptions = {},
): Promise<StreamingAvailabilityRefreshResult> {
  const maxFilms = positiveInt(options.maxFilms, 40);
  const staleHours = positiveInt(options.staleHours, 24);
  const region = (options.region ?? "US").trim().toUpperCase() || "US";
  const films = await selectFilms(client, { maxFilms, staleHours });

  const result: StreamingAvailabilityRefreshResult = {
    checked: films.length,
    refreshed: 0,
    providersSaved: 0,
    failed: 0,
    skipped: 0,
    region,
  };

  for (const film of films) {
    if (!film.tmdb_id) {
      result.skipped += 1;
      continue;
    }

    const lookup = await lookupTmdbWatchProviders(Number(film.tmdb_id), region);
    if (!lookup.ok) {
      result.failed += 1;
      console.warn(`streaming availability refresh failed for film ${film.id}: ${lookup.error}`);
      continue;
    }

    try {
      const saved = await replaceProviders(client, {
        filmId: film.id,
        region,
        providers: lookup.providers,
      });
      result.refreshed += 1;
      result.providersSaved += saved;
    } catch (err) {
      result.failed += 1;
      console.warn(`streaming availability write failed for film ${film.id}:`, err);
    }
  }

  return result;
}
