"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { searchFilms, parseFilm } from "film-goblin-worker";
import { toHit, type ITunesSearchHit } from "@/lib/search/itunes-hit";
import { searchAppleTv } from "@/lib/search/apple-tv";
import { searchTmdb, type TmdbCandidate } from "@/lib/search/tmdb";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { requireAdmin } from "@/lib/auth/require-admin";
import { adminCreateFilm } from "@/lib/actions/admin/films";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

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
  } catch (e) {
    console.debug("searchFilmForRequest: iTunes direct failed:", e);
  }

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

  const svc = serviceRoleClient();

  // 1. Already in catalog?
  let filmQuery = svc.from("films").select("id");
  if (input.itunes_id) {
    filmQuery = (filmQuery as any).eq("itunes_id", input.itunes_id);
  } else {
    filmQuery = (filmQuery as any).eq("title", input.title).eq("year", input.year);
  }
  const { data: existingFilm } = await (filmQuery as any).maybeSingle();
  if (existingFilm) return { status: "already_in_catalog", filmId: existingFilm.id };

  // 2. Already requested?
  let reqQuery = svc.from("film_requests").select("id, request_count").eq("status", "pending");
  if (input.itunes_id) {
    reqQuery = (reqQuery as any).eq("itunes_id", input.itunes_id);
  } else {
    reqQuery = (reqQuery as any).eq("title", input.title).eq("year", input.year);
  }
  const { data: existingReq } = await (reqQuery as any).maybeSingle();

  if (existingReq) {
    const { data: alreadyUser } = await svc
      .from("film_request_users")
      .select("user_id")
      .eq("request_id", existingReq.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (alreadyUser) return { status: "already_on_list" };

    await svc.from("film_request_users").insert({ request_id: existingReq.id, user_id: user.id } as never);
    await (svc.from("film_requests") as any)
      .update({ request_count: existingReq.request_count + 1, updated_at: new Date().toISOString() })
      .eq("id", existingReq.id);

    return { status: "already_requested", requestCount: existingReq.request_count + 1 };
  }

  // 3. New request
  const { data: newReq, error: insertErr } = await svc
    .from("film_requests")
    .insert({
      title: input.title,
      year: input.year,
      source: input.source,
      needs_itunes_id: input.needs_itunes_id,
      itunes_id: input.itunes_id,
      tmdb_id: input.tmdb_id,
      artwork_url: input.artwork_url,
      director: input.director,
      description: input.description,
      runtime_min: input.runtime_min,
      genre_primary: input.genre_primary,
      content_advisory: input.content_advisory,
      itunes_url: input.itunes_url,
    } as never)
    .select("id")
    .single();

  if (insertErr || !newReq) {
    return { status: "error", message: insertErr?.message ?? "Failed to save request." };
  }

  await svc.from("film_request_users").insert({ request_id: newReq.id, user_id: user.id } as never);

  return { status: "ok" };
}

// ── fulfillRequest ───────────────────────────────────────────────────────────

export async function fulfillRequest(
  svc: SvcClient,
  requestId: string,
  filmId: string,
  filmTitle: string,
): Promise<void> {
  await (svc.from("film_requests") as any)
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
  });

  if (!createResult.ok) return createResult;

  await fulfillRequest(svc, requestId, createResult.filmId, req.title);
  revalidatePath("/admin/film-requests");
  revalidatePath("/films");

  return { ok: true, filmId: createResult.filmId };
}
