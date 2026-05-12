"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { resolveAdamIdFromAppleTvUrl } from "@/lib/apple-tv/resolve-adam-id";
import {
  parseFilm,
  fetchPrices,
  type ParsedFilm,
} from "film-goblin-worker";
import { toHit, type ITunesSearchHit } from "@/lib/search/itunes-hit";
import { _fulfillRequest } from "@/lib/actions/film-requests";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { backfillTmdbTrailers, lookupTrailerForFilm, trailerPayload } from "@/lib/trailers/tmdb-enrichment";
import { backfillTmdbCast, lookupCastForFilm, replaceFilmCast } from "@/lib/cast/tmdb-enrichment";

export type { ITunesSearchHit } from "@/lib/search/itunes-hit";

export interface FilmFormFields {
  itunes_id: number | null;
  title: string;
  director: string;
  year: number;
  runtime_min: number;
  genre_primary: string;
  description: string;
  content_advisory: string;
  artwork_url: string;
  itunes_url: string;
  tracking: boolean;
  available: boolean;
  tmdb_id: number | null;
  theatrical_release_date: string | null;
  // Series override — manual override of the title-heuristic in
  // app/lib/series-order.ts. series_id is "__new__" when the admin is
  // creating a new series in this save (paired with series_new_name);
  // a UUID when picking an existing series; null when standalone.
  series_id: string | null;
  series_new_name: string;
  series_order: number | null;
}

export interface FilmSeriesSummary {
  id: string;
  name: string;
}

export async function listFilmSeries(): Promise<FilmSeriesSummary[]> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = supabase as unknown as { from: (t: string) => any };
  const { data, error } = await c
    .from("film_series")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FilmSeriesSummary[];
}

async function resolveSeriesId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: { from: (t: string) => any },
  fields: FilmFormFields,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  if (fields.series_id === "__new__") {
    const name = fields.series_new_name.trim();
    if (!name) return { ok: false, error: "New series name is required." };
    const { data, error } = await c
      .from("film_series")
      .insert({ name })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data.id };
  }
  return { ok: true, id: fields.series_id };
}

function parseIdFromUrlOrId(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  // Legacy iTunes URL format: ...id<digits>
  const m = trimmed.match(/id(\d+)/i);
  if (m) return Number(m[1]);
  return null;
}

export async function adminLookupItunes(urlOrId: string): Promise<
  | { ok: true; hit: ITunesSearchHit }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const trimmed = urlOrId.trim();
  let id = parseIdFromUrlOrId(trimmed);
  const isAppleTvUrl = /tv\.apple\.com\/.*\/umc\.cmc\./i.test(trimmed);
  if (id === null && isAppleTvUrl) {
    id = await resolveAdamIdFromAppleTvUrl(trimmed);
    if (id === null) {
      return { ok: false, error: "That Apple TV page doesn't link to an iTunes purchase — the film is probably streaming-only (e.g. via Hulu/Max/MUBI through Apple TV). Try the 'Enter manually' option, or paste a different Apple TV URL that has Buy/Rent options (tap Share → Copy Link from the film's detail page in your iOS Apple TV app)." };
    }
  }
  if (id === null) return { ok: false, error: "Could not extract an iTunes trackId. Expected a legacy iTunes URL (…/id<digits>), an Apple TV URL (…/movie/<slug>/umc.cmc.<hash>), or a bare numeric trackId." };
  const res = await fetchPrices([id]);
  if (res.resultCount === 0) return { ok: false, error: `No iTunes result for trackId ${id}.` };
  const parsed = parseFilm(res.results[0]);
  if (!parsed) return { ok: false, error: `Result for trackId ${id} did not parse (wrong media type or invalid price).` };
  return { ok: true, hit: toHit(parsed) };
}

function validateForm(fields: FilmFormFields): string | null {
  if (!fields.title.trim()) return "Title is required.";
  if (!fields.director.trim()) return "Director is required.";
  const thisYear = new Date().getUTCFullYear();
  if (!Number.isFinite(fields.year) || fields.year < 1900 || fields.year > thisYear + 5) {
    return `Year must be between 1900 and ${thisYear + 5}.`;
  }
  if (!fields.genre_primary.trim()) return "Genre primary is required.";
  return null;
}

export async function adminCreateFilm(
  fields: FilmFormFields,
  requestId?: string,
): Promise<
  | { ok: true; filmId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const err = validateForm(fields);
  if (err) return { ok: false, error: err };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = supabase as unknown as { from: (t: string) => any };
  const seriesRes = await resolveSeriesId(c, fields);
  if (!seriesRes.ok) return seriesRes;
  const trailer = await lookupTrailerForFilm({
    tmdb_id: fields.tmdb_id,
    title: fields.title,
    year: fields.year,
  });
  const cast = await lookupCastForFilm({
    tmdb_id: fields.tmdb_id ?? trailer?.tmdb_id ?? null,
    title: fields.title,
    year: fields.year,
  });

  const payload = {
    itunes_id: fields.itunes_id,
    title: fields.title.trim(),
    director: fields.director.trim(),
    year: fields.year,
    runtime_min: fields.runtime_min,
    genre_primary: fields.genre_primary.trim(),
    description: fields.description,
    content_advisory: fields.content_advisory,
    artwork_url: fields.artwork_url.trim(),
    itunes_url: fields.itunes_url.trim(),
    tracking: fields.tracking,
    available: fields.available,
    tmdb_id: fields.tmdb_id ?? trailer?.tmdb_id ?? cast?.tmdb_id ?? null,
    theatrical_release_date: fields.theatrical_release_date,
    series_id: seriesRes.id,
    series_order: seriesRes.id ? fields.series_order : null,
    ...(trailer ? trailerPayload(trailer) : {}),
  };

  // Cast needed because lib/supabase/types.ts pre-dates migration 0118 which
  // made films.itunes_id nullable, plus mig 0177 added series_id /
  // series_order. Regenerate types with `npm run gen:types` after migrations.
  const { data, error } = await supabase
    .from("films")
    .insert(payload as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (cast && cast.cast.length > 0) {
    await replaceFilmCast(serviceRoleClient(), data.id, cast.cast);
  }

  // Fulfill pending request if one triggered this add
  if (requestId) {
    const svc = serviceRoleClient();
    await _fulfillRequest(svc, requestId, data.id, fields.title.trim());
    revalidatePath("/admin/film-requests");
  }

  revalidatePath("/admin/films");
  return { ok: true, filmId: data.id };
}

export async function adminUpdateFilm(id: string, fields: FilmFormFields): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const err = validateForm(fields);
  if (err) return { ok: false, error: err };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = supabase as unknown as { from: (t: string) => any };
  const seriesRes = await resolveSeriesId(c, fields);
  if (!seriesRes.ok) return seriesRes;

  const updatePayload = {
    itunes_id: fields.itunes_id,
    title: fields.title.trim(),
    director: fields.director.trim(),
    year: fields.year,
    runtime_min: fields.runtime_min,
    genre_primary: fields.genre_primary.trim(),
    description: fields.description,
    content_advisory: fields.content_advisory,
    artwork_url: fields.artwork_url.trim(),
    itunes_url: fields.itunes_url.trim(),
    tracking: fields.tracking,
    available: fields.available,
    tmdb_id: fields.tmdb_id,
    theatrical_release_date: fields.theatrical_release_date,
    series_id: seriesRes.id,
    series_order: seriesRes.id ? fields.series_order : null,
  };

  const { error } = await supabase
    .from("films")
    .update(updatePayload as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/films");
  revalidatePath(`/admin/films/${id}/edit`);
  return { ok: true };
}

export async function adminRetireFilm(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const { error } = await supabase
    .from("films")
    .update({ tracking: false, available: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/films");
  return { ok: true };
}

export async function adminBackfillTmdbTrailers(batchSize = 25): Promise<
  | { ok: true; scanned: number; updated: number; missing: number; failed: number }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const limit = Math.max(1, Math.min(batchSize, 50));
  const service = serviceRoleClient();
  const result = await backfillTmdbTrailers(service, limit);
  if (!result.ok) return result;

  revalidatePath("/admin/films");
  return { ok: true, ...result.stats };
}

export async function adminBackfillTmdbCast(batchSize = 25): Promise<
  | { ok: true; scanned: number; updated: number; skipped: number; missing: number; failed: number }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const limit = Math.max(1, Math.min(batchSize, 50));
  const service = serviceRoleClient();
  const result = await backfillTmdbCast(service, limit);
  if (!result.ok) return result;

  revalidatePath("/admin/films");
  return { ok: true, ...result.stats };
}
