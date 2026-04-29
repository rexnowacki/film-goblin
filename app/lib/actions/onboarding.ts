"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface OnboardingPayload {
  handle: string;
  watchlistFilmIds: string[];
  thresholdPct: number; // 10–75
}

const HANDLE_RE = /^[a-z0-9._]+$/;

export async function _completeOnboarding(client: Client, p: OnboardingPayload): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  const handle = p.handle.trim();
  if (!HANDLE_RE.test(handle)) {
    throw new Error("Invalid handle: lowercase letters, numbers, dots, underscores only.");
  }

  const { error: pErr } = await client
    .from("profiles")
    .update({
      handle,
      broadcast_watchlist_adds: true,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (pErr) throw pErr;

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
    if (wErr && wErr.code !== "23505") throw wErr;
  }
}

export async function completeOnboarding(payload: OnboardingPayload) {
  const c = await createClient();
  await _completeOnboarding(c, payload);
  redirect("/home");
}
