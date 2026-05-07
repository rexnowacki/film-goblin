"use server";

import { createClient } from "@/lib/supabase/server";
import { searchFilms, parseFilm } from "film-goblin-worker";
import { toHit, type ITunesSearchHit } from "@/lib/search/itunes-hit";
import { searchAppleTv } from "@/lib/search/apple-tv";
import { searchTmdb, type TmdbCandidate } from "@/lib/search/tmdb";

export type FilmRequestCandidate =
  | { source: "itunes"; hit: ITunesSearchHit }
  | { source: "tmdb"; hit: TmdbCandidate }
  | { source: "manual"; title: string };

export type SearchForRequestResult =
  | { ok: true; result: FilmRequestCandidate }
  | { ok: false; error: string };

export async function searchFilmForRequest(query: string): Promise<SearchForRequestResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to request films." };

  const trimmed = query.trim();
  if (!trimmed) return { ok: false, error: "Enter a film title to search." };

  // Step 1: iTunes direct search
  try {
    const itunesRes = await searchFilms(trimmed, { limit: 3 });
    if (itunesRes.resultCount > 0) {
      const parsed = parseFilm(itunesRes.results[0]);
      if (parsed) {
        return { ok: true, result: { source: "itunes", hit: toHit(parsed) } };
      }
    }
  } catch {
    // fall through to next step
  }

  // Step 2: Brave → Apple TV → iTunes lookup
  try {
    const braveRes = await searchAppleTv(trimmed);
    if (braveRes.ok && braveRes.candidates.length > 0) {
      return { ok: true, result: { source: "itunes", hit: braveRes.candidates[0] } };
    }
  } catch {
    // fall through
  }

  // Step 3: TMDB
  try {
    const tmdbRes = await searchTmdb(trimmed);
    if (tmdbRes.ok && tmdbRes.candidates.length > 0) {
      return { ok: true, result: { source: "tmdb", hit: tmdbRes.candidates[0] } };
    }
  } catch {
    // fall through
  }

  // Step 4: Manual fallback
  return { ok: true, result: { source: "manual", title: trimmed } };
}
