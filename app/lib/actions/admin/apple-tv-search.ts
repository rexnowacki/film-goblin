"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  searchFilms,
  parseFilm,
  type ParsedFilm,
} from "film-goblin-worker";
import { toHit, type ITunesSearchHit } from "./itunes-hit";

const APPLE_TV_SEARCH_REGION = "us";
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const CANDIDATE_LIMIT = 5;
const APPLE_TV_URL_RE = new RegExp(
  `^https://tv\\.apple\\.com/${APPLE_TV_SEARCH_REGION}/movie/[a-z0-9-]+/umc\\.cmc\\.[a-z0-9]+$`
);

export interface SearchCandidate extends ITunesSearchHit {
  via: "itunes" | "apple-tv-search";
}

export type SearchResult =
  | { ok: true; candidates: SearchCandidate[] }
  | { ok: false; reason: "brave-empty" | "all-streaming-only" | "brave-error"; message: string };


async function tryItunesSearch(term: string): Promise<SearchCandidate[]> {
  try {
    const res = await searchFilms(term, { limit: 10 });
    return res.results
      .map(r => parseFilm(r))
      .filter((p): p is ParsedFilm => p !== null)
      .map(p => ({ ...toHit(p), via: "itunes" as const }));
  } catch (e) {
    console.warn("apple-tv-search: iTunes search threw:", e);
    return [];
  }
}

async function tryBraveSearch(_term: string): Promise<SearchResult> {
  // Full implementation added in Task 4. For now, treat as unavailable so
  // the iTunes-first branch can be tested without requiring a real Brave key.
  if (!process.env.BRAVE_SEARCH_API_KEY) {
    console.error("apple-tv-search: BRAVE_SEARCH_API_KEY not set");
    return { ok: false, reason: "brave-error", message: "Search unavailable — try again in a moment." };
  }
  return { ok: false, reason: "brave-error", message: "Search unavailable — try again in a moment." };
}

export async function adminSearchAppleTv(term: string): Promise<SearchResult> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const trimmed = term.trim();
  if (!trimmed) return { ok: true, candidates: [] };

  const itunesCandidates = await tryItunesSearch(trimmed);
  if (itunesCandidates.length > 0) return { ok: true, candidates: itunesCandidates };

  return await tryBraveSearch(trimmed);
}
