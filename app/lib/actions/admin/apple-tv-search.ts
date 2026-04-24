"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  searchFilms,
  parseFilm,
  fetchPrices,
  type ParsedFilm,
} from "film-goblin-worker";
import { toHit, type ITunesSearchHit } from "./itunes-hit";
import { extractAdamIdFromHtml } from "@/lib/apple-tv/resolve-adam-id";

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

async function fetchCandidateFromUrl(url: string): Promise<SearchCandidate | null> {
  try {
    const pageRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    });
    if (!pageRes.ok) {
      console.log(`apple-tv-search: page fetch failed (${pageRes.status}): ${url}`);
      return null;
    }
    const html = await pageRes.text();
    const adamId = extractAdamIdFromHtml(html);
    if (adamId === null) {
      console.log(`apple-tv-search: no adamId (streaming-only): ${url}`);
      return null;
    }
    const priceRes = await fetchPrices([adamId]);
    if (priceRes.resultCount === 0) {
      console.log(`apple-tv-search: iTunes Lookup empty for adamId ${adamId}`);
      return null;
    }
    const parsed = parseFilm(priceRes.results[0]);
    if (!parsed) {
      console.log(`apple-tv-search: parseFilm null for adamId ${adamId}`);
      return null;
    }
    return { ...toHit(parsed), via: "apple-tv-search" as const };
  } catch (e) {
    console.log(`apple-tv-search: candidate fetch threw for ${url}:`, e);
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
  const settled = await Promise.all(candidateUrls.map(fetchCandidateFromUrl));
  const candidates = settled.filter((c): c is SearchCandidate => c !== null);
  const dropped = candidateUrls.length - candidates.length;
  if (dropped > 0) {
    console.log(`apple-tv-search: dropped ${dropped}/${candidateUrls.length} candidates`);
  }
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "all-streaming-only",
      message: `Apple TV has results for "${term}" but none are buyable (all streaming-only).`,
    };
  }
  return { ok: true, candidates };
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
