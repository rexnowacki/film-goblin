import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { lookupTmdbTrailerForFilm, type TmdbResolvedTrailer, type TmdbTrailer } from "@/lib/search/tmdb";

type Client = SupabaseClient<Database>;

export interface TrailerLookupInput {
  tmdb_id: number | null;
  title: string;
  year: number;
}

export interface TrailerBackfillStats {
  scanned: number;
  updated: number;
  missing: number;
  failed: number;
}

export function trailerPayload(trailer: TmdbTrailer) {
  return {
    trailer_url: trailer.url,
    trailer_source: "youtube",
    trailer_youtube_id: trailer.youtube_id,
    trailer_label: trailer.label,
    trailer_verified: trailer.official,
    trailer_updated_at: new Date().toISOString(),
  };
}

export async function lookupTrailerForFilm(input: TrailerLookupInput): Promise<TmdbResolvedTrailer | null> {
  const trailerResult = await lookupTmdbTrailerForFilm(input);
  return trailerResult.ok ? trailerResult.trailer : null;
}

export async function backfillTmdbTrailers(client: Client, batchSize = 25): Promise<
  | { ok: true; stats: TrailerBackfillStats }
  | { ok: false; error: string }
> {
  const limit = Math.max(1, Math.min(batchSize, 50));
  const { data, error } = await client
    .from("films")
    .select("id, title, year, tmdb_id")
    .is("trailer_youtube_id", null)
    .limit(limit);
  if (error) return { ok: false, error: error.message };

  let updated = 0;
  let missing = 0;
  let failed = 0;

  for (const film of data ?? []) {
    const trailerResult = await lookupTmdbTrailerForFilm({
      tmdb_id: film.tmdb_id,
      title: film.title,
      year: film.year,
    });
    if (!trailerResult.ok) {
      failed += 1;
      continue;
    }
    if (!trailerResult.trailer) {
      missing += 1;
      continue;
    }

    const { error: updateError } = await client
      .from("films")
      .update({
        tmdb_id: film.tmdb_id ?? trailerResult.trailer.tmdb_id,
        ...trailerPayload(trailerResult.trailer),
      } as never)
      .eq("id", film.id)
      .is("trailer_youtube_id", null);
    if (updateError) {
      failed += 1;
    } else {
      updated += 1;
    }
  }

  return { ok: true, stats: { scanned: (data ?? []).length, updated, missing, failed } };
}
