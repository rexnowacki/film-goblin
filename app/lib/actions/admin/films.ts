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

export async function adminCreateFilm(fields: FilmFormFields): Promise<
  | { ok: true; filmId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const err = validateForm(fields);
  if (err) return { ok: false, error: err };

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
  };

  // Cast needed because lib/supabase/types.ts pre-dates migration 0118 which
  // made films.itunes_id nullable. Regenerate types with `npm run gen:types`
  // after running migrations to drop this cast.
  const { data, error } = await supabase
    .from("films")
    .insert(payload as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

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
