"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  searchFilms,
  parseFilm,
  fetchPrices,
  type ParsedFilm,
} from "film-goblin-worker";

export interface ITunesSearchHit {
  itunes_id: number;
  title: string;
  director: string;
  year: number;
  runtime_min: number;
  genre_primary: string;
  description: string;
  content_advisory: string;
  artwork_url: string;
  itunes_url: string;
  price_usd: number | null;
}

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
  const m = trimmed.match(/id(\d+)/i);
  if (m) return Number(m[1]);
  return null;
}

function toHit(p: ParsedFilm): ITunesSearchHit {
  return {
    itunes_id: p.itunes_id,
    title: p.title,
    director: p.director,
    year: p.year,
    runtime_min: p.runtime_min,
    genre_primary: p.genre_primary,
    description: p.description,
    content_advisory: p.content_advisory,
    artwork_url: p.artwork_url,
    itunes_url: p.itunes_url,
    price_usd: p.price_usd,
  };
}

export async function adminSearchItunes(term: string): Promise<ITunesSearchHit[]> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  if (!term.trim()) return [];
  const res = await searchFilms(term, { limit: 10 });
  return res.results
    .map(r => parseFilm(r))
    .filter((p): p is ParsedFilm => p !== null)
    .map(toHit);
}

export async function adminLookupItunes(urlOrId: string): Promise<
  | { ok: true; hit: ITunesSearchHit }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const id = parseIdFromUrlOrId(urlOrId);
  if (id === null) return { ok: false, error: "Could not extract an iTunes trackId from that input." };
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
