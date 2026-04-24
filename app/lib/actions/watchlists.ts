"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { fetchPrices, parseFilm } from "film-goblin-worker";

type Client = SupabaseClient<Database>;

/**
 * Adds a film to the user's watchlist. On add we:
 *   1. Hit iTunes Lookup for a fresh current price.
 *   2. Log a new price_history row with that price (authoritative user-action
 *      timestamp alongside the worker's periodic sweeps).
 *   3. Store the same price as the row's max_price_usd — the watchlist IS the
 *      alert: drop below the add-time price and the user gets notified.
 *
 * On any iTunes failure (rate limit, network, missing itunes_id, 0 results),
 * fall back to the last-swept price from films_with_stats.latest_price so
 * watchlist adds never break on transient upstream issues.
 *
 * Callers may override the threshold via `maxPriceUsd` (skips the fresh-fetch
 * path entirely). In practice, the UI doesn't.
 */
export async function _addToWatchlist(
  client: Client,
  filmId: string,
  maxPriceUsd?: number,
): Promise<{ id: string }> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

  let threshold: number | null = null;

  if (maxPriceUsd != null) {
    threshold = maxPriceUsd;
  } else {
    // Step 1: fresh iTunes Lookup. Capture the film's itunes_id first.
    const { data: filmMeta } = await client
      .from("films")
      .select("itunes_id")
      .eq("id", filmId)
      .maybeSingle();
    const itunesId = filmMeta?.itunes_id;

    if (itunesId != null) {
      try {
        const res = await fetchPrices([Number(itunesId)]);
        const parsed = res.resultCount > 0 ? parseFilm(res.results[0]) : null;
        if (parsed && parsed.price_usd != null) {
          threshold = parsed.price_usd;
          // Step 2: log a price_history row. Best-effort — a failure here
          // (e.g. RLS, transient DB error) shouldn't abort the watchlist add.
          try {
            await client.from("price_history").insert({
              film_id: filmId,
              price_usd: parsed.price_usd,
              hd_price_usd: parsed.hd_price_usd ?? null,
            });
          } catch (e) {
            console.warn("_addToWatchlist: price_history log failed", e);
          }
        }
      } catch (e) {
        console.warn("_addToWatchlist: fresh iTunes fetch failed, falling back", e);
      }
    }

    if (threshold == null) {
      // Fallback: last-swept price from films_with_stats. The view isn't in the
      // generated Supabase types, so we cast (same pattern as lib/queries/films.ts).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const viewClient = (client as unknown as { from: (t: string) => any });
      const { data: filmRow } = await viewClient
        .from("films_with_stats")
        .select("latest_price")
        .eq("id", filmId)
        .maybeSingle();
      const raw = filmRow?.latest_price;
      const n = raw == null ? NaN : Number(raw);
      threshold = Number.isFinite(n) ? n : null;
    }
  }

  const { data, error } = await client
    .from("watchlists")
    .insert({
      user_id: user.id,
      film_id: filmId,
      max_price_usd: threshold,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id };
}

export async function _removeFromWatchlist(
  client: Client,
  filmId: string,
): Promise<void> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");
  const { error } = await client
    .from("watchlists")
    .delete()
    .eq("user_id", user.id)
    .eq("film_id", filmId);
  if (error) throw error;
}

export async function addToWatchlist(filmId: string, maxPriceUsd?: number) {
  const supabase = await createClient();
  const result = await _addToWatchlist(supabase, filmId, maxPriceUsd);
  revalidatePath("/home");
  revalidatePath("/watchlist");
  revalidatePath(`/film/${filmId}`);
  return result;
}

export async function removeFromWatchlist(filmId: string) {
  const supabase = await createClient();
  await _removeFromWatchlist(supabase, filmId);
  revalidatePath("/home");
  revalidatePath("/watchlist");
  revalidatePath(`/film/${filmId}`);
}
