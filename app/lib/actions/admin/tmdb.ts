"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { searchTmdb, lookupTmdb } from "@/lib/search/tmdb";
import type { TmdbCandidate } from "@/lib/search/tmdb";
import type { FilmFormFields } from "./films";

export type { TmdbCandidate } from "@/lib/search/tmdb";

export async function adminSearchTmdb(query: string): Promise<
  | { ok: true; candidates: TmdbCandidate[] }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  return searchTmdb(query);
}

export async function adminLookupTmdb(tmdbId: number): Promise<
  | { ok: true; fields: FilmFormFields }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  return lookupTmdb(tmdbId);
}
