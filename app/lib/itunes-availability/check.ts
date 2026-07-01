import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { scoreMatch, type FilmInput, type ItunesCandidate } from "./score";
import { searchItunesMovies } from "./itunes-search";
import { searchAppleTv } from "@/lib/search/apple-tv";

const AUTO_PROMOTE_THRESHOLD = 0.85;
const QUEUE_THRESHOLD = 0.45;
const BATCH_LIMIT = 30;

export interface CheckSummary {
  considered: number;
  autoPromoted: number;
  queued: number;
  belowThreshold: number;
  errors: number;
}

interface FilmRow {
  id: string;
  title: string;
  year: number;
  director: string;
  theatrical_release_date: string | null;
}

export type AppleTvFallback = (film: FilmInput) => Promise<ItunesCandidate[]>;

export interface CheckOptions {
  appleTvFallback?: AppleTvFallback;
}

// The iTunes Search API frequently fails to surface new releases (and its
// movie filter is broken outright — see itunes-search.ts). When it yields no
// viable candidate, fall back to the same Brave → Apple TV page → adamId →
// iTunes Lookup pipeline the manual admin add flow uses.
async function defaultAppleTvFallback(film: FilmInput): Promise<ItunesCandidate[]> {
  const res = await searchAppleTv(film.title);
  if (!res.ok) return [];
  return res.candidates.map(hit => ({
    trackId: hit.itunes_id,
    trackName: hit.title,
    releaseDate: hit.year ? `${hit.year}-01-01` : "",
    artistName: hit.director,
    trackViewUrl: hit.itunes_url,
    artworkUrl100: hit.artwork_url,
  }));
}

export async function runItunesAvailabilityCheck(
  client: SupabaseClient<Database>,
  options: CheckOptions = {},
): Promise<CheckSummary> {
  const summary: CheckSummary = {
    considered: 0,
    autoPromoted: 0,
    queued: 0,
    belowThreshold: 0,
    errors: 0,
  };

  const minDate = new Date(Date.now() - 365 * 86400 * 1000).toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const minYear = new Date().getUTCFullYear() - 1;
  const cooldownIso = new Date(Date.now() - 6 * 86400 * 1000).toISOString();

  // Two-phase select: first by precise date, then fall back to year-based
  // for rows lacking theatrical_release_date.
  const precise = await client
    .from("films")
    .select("id, title, year, director, theatrical_release_date")
    .is("itunes_id", null)
    .eq("tracking", false)
    .gte("theatrical_release_date", minDate)
    .lte("theatrical_release_date", maxDate)
    .or(`last_itunes_check_at.is.null,last_itunes_check_at.lt.${cooldownIso}`)
    .order("last_itunes_check_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);
  if (precise.error) throw precise.error;

  const yearFallback = await client
    .from("films")
    .select("id, title, year, director, theatrical_release_date")
    .is("itunes_id", null)
    .is("theatrical_release_date", null)
    .eq("tracking", false)
    .gte("year", minYear)
    .or(`last_itunes_check_at.is.null,last_itunes_check_at.lt.${cooldownIso}`)
    .order("last_itunes_check_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);
  if (yearFallback.error) throw yearFallback.error;

  // Merge, dedupe by id, cap at BATCH_LIMIT.
  const seen = new Set<string>();
  const films: FilmRow[] = [];
  for (const r of [...(precise.data ?? []), ...(yearFallback.data ?? [])]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    films.push(r as FilmRow);
    if (films.length >= BATCH_LIMIT) break;
  }

  // Filter out films with a recent rejected candidate (14-day cooldown).
  if (films.length > 0) {
    const ids = films.map(f => f.id);
    const rejectionCutoff = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
    const rej = await client
      .from("itunes_candidates")
      .select("film_id")
      .in("film_id", ids)
      .eq("status", "rejected")
      .gte("reviewed_at", rejectionCutoff);
    if (rej.error) throw rej.error;
    const rejected = new Set((rej.data ?? []).map((r: { film_id: string }) => r.film_id));
    for (let i = films.length - 1; i >= 0; i--) {
      if (rejected.has(films[i].id)) films.splice(i, 1);
    }
  }

  summary.considered = films.length;

  const appleTvFallback = options.appleTvFallback ?? defaultAppleTvFallback;

  for (const film of films) {
    try {
      await processFilm(client, film, summary, appleTvFallback);
    } catch (e) {
      summary.errors++;
      console.error(`itunes-check ${film.id} (${film.title}): ${(e as Error).message}`);
    }
    // Always touch last_itunes_check_at so we don't redo this row next run.
    await client
      .from("films")
      .update({ last_itunes_check_at: new Date().toISOString() })
      .eq("id", film.id);
  }

  return summary;
}

interface BestMatch {
  score: number;
  matchType: string;
  cand: ItunesCandidate;
}

function pickBest(input: FilmInput, candidates: ItunesCandidate[]): BestMatch | null {
  let best: BestMatch | null = null;
  for (const c of candidates) {
    const r = scoreMatch(input, c);
    if (best === null || r.confidence > best.score) {
      best = { score: r.confidence, matchType: r.matchType, cand: c };
    }
  }
  return best;
}

async function processFilm(
  client: SupabaseClient<Database>,
  film: FilmRow,
  summary: CheckSummary,
  appleTvFallback: AppleTvFallback,
): Promise<void> {
  const input: FilmInput = { title: film.title, year: film.year, director: film.director };
  let best = pickBest(input, await searchItunesMovies(film.title));

  if (!best || best.score < QUEUE_THRESHOLD) {
    const fallbackBest = pickBest(input, await appleTvFallback(input));
    if (fallbackBest && (!best || fallbackBest.score > best.score)) {
      best = fallbackBest;
    }
  }

  if (!best || best.score < QUEUE_THRESHOLD) {
    summary.belowThreshold++;
    return;
  }

  if (best.score >= AUTO_PROMOTE_THRESHOLD) {
    await autoPromote(client, film, best);
    summary.autoPromoted++;
    return;
  }

  await queueCandidate(client, film, best);
  summary.queued++;
}

async function autoPromote(
  client: SupabaseClient<Database>,
  film: FilmRow,
  best: { score: number; matchType: string; cand: { trackId: number; trackName: string; trackViewUrl: string; artworkUrl100: string; releaseDate: string } },
): Promise<void> {
  // Read existing artwork to know whether to backfill.
  const fr = await client.from("films").select("artwork_url").eq("id", film.id).single();
  if (fr.error) throw fr.error;

  const patch: Record<string, unknown> = {
    itunes_id: best.cand.trackId,
    itunes_url: best.cand.trackViewUrl,
    tracking: true,
    available: true,
  };
  if (!fr.data?.artwork_url && best.cand.artworkUrl100) {
    patch.artwork_url = best.cand.artworkUrl100.replace(/100x100/, "600x600");
  }

  // Defensive guard: only update if itunes_id still null (race-safe).
  const upd = await client
    .from("films")
    .update(patch as never)
    .eq("id", film.id)
    .is("itunes_id", null);
  if (upd.error) throw upd.error;
}

async function queueCandidate(
  client: SupabaseClient<Database>,
  film: FilmRow,
  best: { score: number; matchType: string; cand: { trackId: number; trackName: string; trackViewUrl: string; artworkUrl100: string; releaseDate: string } },
): Promise<void> {
  // Replace any prior pending row first (the partial unique index requires this).
  await client
    .from("itunes_candidates")
    .delete()
    .eq("film_id", film.id)
    .eq("status", "pending");

  const matchYearStr = best.cand.releaseDate.match(/^(\d{4})/)?.[1];
  const ins = await client.from("itunes_candidates").insert({
    film_id: film.id,
    itunes_id: best.cand.trackId,
    itunes_url: best.cand.trackViewUrl,
    match_title: best.cand.trackName,
    match_year: matchYearStr ? Number(matchYearStr) : null,
    match_artwork_url: best.cand.artworkUrl100 || null,
    confidence: best.score,
    match_type: best.matchType,
    status: "pending",
  });
  if (ins.error) throw ins.error;
}
