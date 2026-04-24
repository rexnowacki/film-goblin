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

interface BraveResponse {
  web?: { results?: { url?: string }[] };
}

async function callBraveSearch(term: string): Promise<string[] | null> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) {
    console.error("apple-tv-search: BRAVE_SEARCH_API_KEY not set");
    return null;
  }
  const query = `site:tv.apple.com/${APPLE_TV_SEARCH_REGION}/movie "${term}"`;
  const url = `${BRAVE_ENDPOINT}?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "X-Subscription-Token": key,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      console.error(`apple-tv-search: Brave returned HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as BraveResponse;
    const urls = body.web?.results?.map(r => r.url).filter((u): u is string => !!u) ?? [];
    return urls;
  } catch (e) {
    console.error("apple-tv-search: Brave fetch threw:", e);
    return null;
  }
}

async function tryBraveSearch(term: string): Promise<SearchResult> {
  const urls = await callBraveSearch(term);
  if (urls === null) {
    return { ok: false, reason: "brave-error", message: "Search unavailable — try again in a moment." };
  }
  const candidateUrls = urls.filter(u => APPLE_TV_URL_RE.test(u)).slice(0, CANDIDATE_LIMIT);
  if (candidateUrls.length === 0) {
    return {
      ok: false,
      reason: "brave-empty",
      message: `No Apple TV results for "${term}". Try a different spelling or use manual entry.`,
    };
  }
  // Page fetches + adamId extraction added in Task 5.
  return { ok: false, reason: "brave-empty", message: "unreachable-until-task-5" };
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
