import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { lookupTmdbCastForFilm, type TmdbCastMember } from "@/lib/search/tmdb";

type Client = SupabaseClient<Database>;

export interface CastLookupInput {
  tmdb_id: number | null;
  title: string;
  year: number;
}

export interface CastBackfillStats {
  scanned: number;
  updated: number;
  skipped: number;
  missing: number;
  failed: number;
}

export async function lookupCastForFilm(input: CastLookupInput): Promise<
  | { tmdb_id: number | null; cast: TmdbCastMember[] }
  | null
> {
  const result = await lookupTmdbCastForFilm({ ...input, limit: 12 });
  return result.ok ? { tmdb_id: result.tmdb_id, cast: result.cast } : null;
}

export async function replaceFilmCast(
  client: Client,
  filmId: string,
  cast: TmdbCastMember[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (table: string) => any };

  const { error: deleteError } = await c
    .from("film_cast")
    .delete()
    .eq("film_id", filmId);
  if (deleteError) return { ok: false, error: deleteError.message };

  for (const member of cast) {
    const { data: person, error: personError } = await c
      .from("people")
      .upsert({
        tmdb_id: member.tmdb_id,
        name: member.name,
        profile_path: member.profile_path,
        known_for_department: member.known_for_department,
        updated_at: new Date().toISOString(),
      }, { onConflict: "tmdb_id" })
      .select("id")
      .single();
    if (personError) return { ok: false, error: personError.message };

    const { error: castError } = await c
      .from("film_cast")
      .insert({
        film_id: filmId,
        person_id: person.id,
        character: member.character,
        billing_order: member.billing_order,
      });
    if (castError) return { ok: false, error: castError.message };
  }

  return { ok: true };
}

export async function enrichFilmCast(
  client: Client,
  film: CastLookupInput & { id: string },
): Promise<
  | { ok: true; updated: boolean; tmdb_id: number | null; count: number }
  | { ok: false; error: string }
> {
  const result = await lookupTmdbCastForFilm({ ...film, limit: 12 });
  if (!result.ok) return result;
  if (!result.tmdb_id || result.cast.length === 0) {
    return { ok: true, updated: false, tmdb_id: result.tmdb_id, count: 0 };
  }

  const replaceResult = await replaceFilmCast(client, film.id, result.cast);
  if (!replaceResult.ok) return replaceResult;

  if (!film.tmdb_id && result.tmdb_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client as unknown as { from: (table: string) => any };
    const { error } = await c
      .from("films")
      .update({ tmdb_id: result.tmdb_id })
      .eq("id", film.id);
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true, updated: true, tmdb_id: result.tmdb_id, count: result.cast.length };
}

export async function backfillTmdbCast(client: Client, batchSize = 25): Promise<
  | { ok: true; stats: CastBackfillStats }
  | { ok: false; error: string }
> {
  const limit = Math.max(1, Math.min(batchSize, 50));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (table: string) => any };
  const { data, error } = await c
    .from("films")
    .select("id, title, year, tmdb_id")
    .order("first_seen_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };

  let updated = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;

  for (const film of data ?? []) {
    const existing = await c
      .from("film_cast")
      .select("film_id")
      .eq("film_id", film.id)
      .limit(1);
    if (existing.error) {
      failed += 1;
      continue;
    }
    if ((existing.data ?? []).length > 0) {
      skipped += 1;
      continue;
    }

    const result = await enrichFilmCast(client, film);
    if (!result.ok) {
      failed += 1;
    } else if (result.updated) {
      updated += 1;
    } else {
      missing += 1;
    }
  }

  return { ok: true, stats: { scanned: (data ?? []).length, updated, skipped, missing, failed } };
}
