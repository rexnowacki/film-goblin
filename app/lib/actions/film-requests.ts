"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchPrices, searchFilms, parseFilm } from "film-goblin-worker";
import { toHit, type ITunesSearchHit } from "@/lib/search/itunes-hit";
import { searchAppleTv } from "@/lib/search/apple-tv";
import { lookupTmdb, searchTmdb, type TmdbCandidate } from "@/lib/search/tmdb";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { requireAdmin } from "@/lib/auth/require-admin";
import { adminCreateFilm } from "@/lib/actions/admin/films";
import { consumeRateLimit, utcDayString } from "@/lib/rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type FilmRequestCandidate =
  | { source: "itunes"; hit: ITunesSearchHit }
  | { source: "tmdb"; hit: TmdbCandidate }
  | { source: "manual"; title: string };

export type SearchForRequestResult =
  | { ok: true; result: FilmRequestCandidate }
  | { ok: false; error: string };

const MAX_REQUEST_SEARCH_LENGTH = 120;
const MAX_REQUEST_TITLE_LENGTH = 200;
const FILM_REQUEST_DAILY_LIMIT = 3;
const FILM_REQUEST_SEARCH_MISS_KEY = "film_request_search_miss";

function filmRequestLimitMessage(): string {
  return "You've reached today's film request limit. Try again tomorrow.";
}

async function checkDailySubmissionLimit(svc: SvcClient, userId: string): Promise<boolean> {
  const { count, error } = await svc
    .from("film_request_users")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", `${utcDayString()}T00:00:00.000Z`);

  if (error) {
    console.error("checkDailySubmissionLimit failed:", error.message);
    return false;
  }

  return (count ?? 0) < FILM_REQUEST_DAILY_LIMIT;
}

export async function searchFilmForRequest(query: string): Promise<SearchForRequestResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to request films." };

  const trimmed = query.trim();
  if (!trimmed) return { ok: false, error: "Enter a film title to search." };
  if (trimmed.length > MAX_REQUEST_SEARCH_LENGTH) return { ok: false, error: "Search is too long." };

  const svc = serviceRoleClient();

  // Step 1: iTunes direct search
  try {
    const itunesRes = await searchFilms(trimmed, { limit: 3 });
    if (itunesRes.resultCount > 0) {
      const parsed = parseFilm(itunesRes.results[0]);
      if (parsed) {
        return { ok: true, result: { source: "itunes", hit: toHit(parsed) } };
      }
    }
  } catch (e) {
    console.debug("searchFilmForRequest: iTunes direct failed:", e);
  }

  const limit = await consumeRateLimit(svc, {
    userId: user.id,
    key: FILM_REQUEST_SEARCH_MISS_KEY,
    limit: FILM_REQUEST_DAILY_LIMIT,
  });
  if (!limit.allowed) return { ok: false, error: filmRequestLimitMessage() };

  // Step 2: Brave → Apple TV → iTunes lookup
  try {
    const braveRes = await searchAppleTv(trimmed);
    if (braveRes.ok && braveRes.candidates.length > 0) {
      return { ok: true, result: { source: "itunes", hit: braveRes.candidates[0] } };
    }
  } catch (e) {
    console.debug("searchFilmForRequest: Brave/Apple TV failed:", e);
  }

  // Step 3: TMDB
  try {
    const tmdbRes = await searchTmdb(trimmed);
    if (tmdbRes.ok && tmdbRes.candidates.length > 0) {
      return { ok: true, result: { source: "tmdb", hit: tmdbRes.candidates[0] } };
    }
  } catch (e) {
    console.debug("searchFilmForRequest: TMDB failed:", e);
  }

  // Step 4: Manual fallback
  return { ok: true, result: { source: "manual", title: trimmed } };
}

// ── Types ────────────────────────────────────────────────────────────────────

type SvcClient = SupabaseClient<Database>;

export interface FilmRequestInput {
  title: string;
  year: number | null;
  source: "itunes" | "tmdb" | "manual";
  needs_itunes_id: boolean;
  itunes_id: number | null;
  tmdb_id: number | null;
  artwork_url: string | null;
  director: string | null;
  description: string | null;
  runtime_min: number | null;
  genre_primary: string | null;
  content_advisory: string | null;
  itunes_url: string | null;
}

export type SubmitFilmRequestResult =
  | { status: "ok" }
  | { status: "already_in_catalog"; filmId: string }
  | { status: "already_requested"; requestCount: number }
  | { status: "already_on_list" }
  | { status: "error"; message: string };

// ── submitFilmRequest ────────────────────────────────────────────────────────

export async function submitFilmRequest(input: FilmRequestInput): Promise<SubmitFilmRequestResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Not signed in." };
  const title = input.title.trim();
  if (!title) return { status: "error", message: "Title is required." };
  if (title.length > MAX_REQUEST_TITLE_LENGTH) return { status: "error", message: "Title is too long." };

  const svc = serviceRoleClient();

  let trustedInput: FilmRequestInput = { ...input, title };

  if (input.source === "itunes") {
    if (!input.itunes_id) return { status: "error", message: "Missing iTunes ID." };
    try {
      const lookup = await fetchPrices([input.itunes_id]);
      const parsed = lookup.results[0] ? parseFilm(lookup.results[0]) : null;
      if (!parsed || parsed.itunes_id !== input.itunes_id) {
        return { status: "error", message: "Could not verify that film on iTunes." };
      }
      const hit = toHit(parsed);
      trustedInput = {
        title: hit.title,
        year: hit.year,
        source: "itunes",
        needs_itunes_id: false,
        itunes_id: hit.itunes_id,
        tmdb_id: null,
        artwork_url: hit.artwork_url,
        director: hit.director,
        description: hit.description,
        runtime_min: hit.runtime_min,
        genre_primary: hit.genre_primary,
        content_advisory: hit.content_advisory,
        itunes_url: hit.itunes_url,
      };
    } catch (e) {
      console.error("submitFilmRequest: iTunes verification failed:", e);
      return { status: "error", message: "Could not verify that film on iTunes." };
    }
  } else if (input.source === "tmdb") {
    if (!input.tmdb_id) return { status: "error", message: "Missing TMDB ID." };
    const lookup = await lookupTmdb(input.tmdb_id);
    if (!lookup.ok) return { status: "error", message: "Could not verify that film in TMDB." };
    trustedInput = {
      title: lookup.fields.title,
      year: lookup.fields.year || null,
      source: "tmdb",
      needs_itunes_id: true,
      itunes_id: null,
      tmdb_id: lookup.fields.tmdb_id,
      artwork_url: lookup.fields.artwork_url || null,
      director: lookup.fields.director || null,
      description: lookup.fields.description || null,
      runtime_min: lookup.fields.runtime_min || null,
      genre_primary: lookup.fields.genre_primary || null,
      content_advisory: lookup.fields.content_advisory || null,
      itunes_url: null,
    };
  } else {
    trustedInput = {
      title,
      year: null,
      source: "manual",
      needs_itunes_id: true,
      itunes_id: null,
      tmdb_id: null,
      artwork_url: null,
      director: null,
      description: null,
      runtime_min: null,
      genre_primary: null,
      content_advisory: null,
      itunes_url: null,
    };
  }

  // 1. Already in catalog?
  const { data: existingFilm } = trustedInput.itunes_id
    ? await svc.from("films").select("id").eq("itunes_id", trustedInput.itunes_id).maybeSingle()
    : await svc.from("films").select("id").eq("title", trustedInput.title).eq("year", trustedInput.year as number).maybeSingle();
  if (existingFilm) return { status: "already_in_catalog", filmId: existingFilm.id };

  // 2. Already requested?
  const { data: existingReq } = trustedInput.itunes_id
    ? await svc.from("film_requests").select("id, request_count").eq("status", "pending").eq("itunes_id", trustedInput.itunes_id).maybeSingle()
    : await svc.from("film_requests").select("id, request_count").eq("status", "pending").eq("title", trustedInput.title).eq("year", trustedInput.year as number).maybeSingle();

  if (existingReq) {
    const { data: alreadyUser } = await svc
      .from("film_request_users")
      .select("user_id")
      .eq("request_id", existingReq.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (alreadyUser) return { status: "already_on_list" };

    if (!(await checkDailySubmissionLimit(svc, user.id))) {
      return { status: "error", message: filmRequestLimitMessage() };
    }

    const { error: insertUserErr } = await svc
      .from("film_request_users")
      .insert({ request_id: existingReq.id, user_id: user.id } as never);
    if (insertUserErr) return { status: "error", message: insertUserErr.message ?? "Failed to link request." };

    await svc
      .from("film_requests")
      .update({ request_count: existingReq.request_count + 1, updated_at: new Date().toISOString() })
      .eq("id", existingReq.id);

    return { status: "already_requested", requestCount: existingReq.request_count + 1 };
  }

  if (!(await checkDailySubmissionLimit(svc, user.id))) {
    return { status: "error", message: filmRequestLimitMessage() };
  }

  // 3. New request
  const { data: newReq, error: insertErr } = await svc
    .from("film_requests")
    .insert({
      title: trustedInput.title,
      year: trustedInput.year,
      source: trustedInput.source,
      needs_itunes_id: trustedInput.needs_itunes_id,
      itunes_id: trustedInput.itunes_id,
      tmdb_id: trustedInput.tmdb_id,
      artwork_url: trustedInput.artwork_url,
      director: trustedInput.director,
      description: trustedInput.description,
      runtime_min: trustedInput.runtime_min,
      genre_primary: trustedInput.genre_primary,
      content_advisory: trustedInput.content_advisory,
      itunes_url: trustedInput.itunes_url,
    } as never)
    .select("id")
    .single();

  if (insertErr || !newReq) {
    return { status: "error", message: insertErr?.message ?? "Failed to save request." };
  }

  const { error: insertErr2 } = await svc
    .from("film_request_users")
    .insert({ request_id: newReq.id, user_id: user.id } as never);
  if (insertErr2) return { status: "error", message: insertErr2.message ?? "Failed to link request." };

  return { status: "ok" };
}

// ── _fulfillRequest ───────────────────────────────────────────────────────────

export async function _fulfillRequest(
  svc: SvcClient,
  requestId: string,
  filmId: string,
  filmTitle: string,
): Promise<void> {
  await svc
    .from("film_requests")
    .update({ status: "fulfilled", fulfilled_film_id: filmId, updated_at: new Date().toISOString() })
    .eq("id", requestId);

  const { data: requesters } = await svc
    .from("film_request_users")
    .select("user_id")
    .eq("request_id", requestId);
  if (!requesters || requesters.length === 0) return;

  const userIds = requesters.map(r => r.user_id);

  const { data: profiles } = await svc
    .from("profiles")
    .select("id, notify_film_requests")
    .in("id", userIds);
  const optedIn = (profiles ?? [])
    .filter(p => p.notify_film_requests !== false)
    .map(p => p.id);
  if (optedIn.length === 0) return;

  await svc.from("notifications").insert(
    optedIn.map(userId => ({
      user_id: userId,
      kind: "film_request_fulfilled" as const,
      actor_user_id: null,
      payload: { film_id: filmId, film_title: filmTitle, request_id: requestId },
    })) as never,
  );
}

// ── fulfillFilmRequest ───────────────────────────────────────────────────────

export async function fulfillFilmRequest(requestId: string): Promise<
  | { ok: true; filmId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const svc = serviceRoleClient();

  const { data: req, error: fetchErr } = await svc
    .from("film_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) return { ok: false, error: "Request not found." };
  if (req.status === "fulfilled") return { ok: false, error: "Already fulfilled." };

  const createResult = await adminCreateFilm({
    itunes_id: req.itunes_id,
    title: req.title,
    director: req.director ?? "",
    year: req.year ?? 0,
    runtime_min: req.runtime_min ?? 0,
    genre_primary: req.genre_primary ?? "",
    description: req.description ?? "",
    content_advisory: req.content_advisory ?? "",
    artwork_url: req.artwork_url ?? "",
    itunes_url: req.itunes_url ?? "",
    tracking: true,
    available: true,
    tmdb_id: req.tmdb_id,
    theatrical_release_date: null,
    series_id: null,
    series_new_name: "",
    series_order: null,
    summoned: true,
  });

  if (!createResult.ok) return createResult;

  await _fulfillRequest(svc, requestId, createResult.filmId, req.title);
  revalidatePath("/admin/film-requests");
  revalidatePath("/films");

  return { ok: true, filmId: createResult.filmId };
}
