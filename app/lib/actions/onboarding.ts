"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface OnboardingPayload {
  handle: string;
  genres: string[];       // captured but not persisted in MVP (no genres table)
  storefronts: string[];  // captured but not persisted in MVP
  watchlistFilmIds: string[];
  followUserIds: string[];
  thresholdPct: number;   // 10–75
  broadcastWatchlistAdds: boolean;
}

export async function _completeOnboarding(client: Client, p: OnboardingPayload): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  // 1. Update the profile (trigger already created a default row)
  const { error: pErr } = await client
    .from("profiles")
    .update({
      handle: p.handle,
      display_name: p.handle,
      broadcast_watchlist_adds: p.broadcastWatchlistAdds,
    })
    .eq("id", user.id);
  if (pErr) throw pErr;

  // 2. Insert watchlists. For each film, compute max_price_usd as
  //    max_observed_price * (1 - thresholdPct/100). If no history, null.
  for (const filmId of p.watchlistFilmIds) {
    const { data: history } = await client
      .from("price_history")
      .select("price_usd")
      .eq("film_id", filmId)
      .order("captured_at", { ascending: false })
      .limit(1);
    const latest = history?.[0]?.price_usd ? Number(history[0].price_usd) : null;
    const maxPriceUsd = latest ? latest * (1 - p.thresholdPct / 100) : null;

    const { error: wErr } = await client
      .from("watchlists")
      .insert({
        user_id: user.id,
        film_id: filmId,
        max_price_usd: maxPriceUsd,
      });
    // Ignore unique-violation (23505) — user may have the film on list already
    if (wErr && wErr.code !== "23505") throw wErr;
  }

  // 3. Insert follows
  for (const followedId of p.followUserIds) {
    const { error: fErr } = await client
      .from("follows")
      .insert({ follower_user_id: user.id, followed_user_id: followedId });
    if (fErr && fErr.code !== "23505") throw fErr;
  }
}

export async function completeOnboarding(payload: OnboardingPayload) {
  const c = await createClient();
  await _completeOnboarding(c, payload);
  redirect("/home");
}
