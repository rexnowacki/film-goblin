"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";
import { readInviteCookie, clearInviteCookie } from "./invite-cookie";

type Client = SupabaseClient<Database>;

export interface OnboardingPayload {
  username: string;
  watchlistFilmIds: string[];
  thresholdPct: number; // 10–75
}

const USERNAME_RE = /^[a-z0-9._]+$/;

export async function _completeOnboarding(client: Client, p: OnboardingPayload): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  const username = p.username.trim();
  if (!USERNAME_RE.test(username)) {
    throw new Error("Invalid username: lowercase letters, numbers, dots, underscores only.");
  }

  const { error: pErr } = await client
    .from("profiles")
    .update({
      username,
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

  const inviteUsername = await readInviteCookie();
  if (inviteUsername) {
    try {
      await maybeCreateInviteCovenRequest(user.id, inviteUsername);
    } finally {
      await clearInviteCookie();
    }
  }
}

/**
 * If a valid `fg_invite` cookie is present and the inviter exists and isn't
 * the same person, insert a `coven_request` row from inviter -> new user.
 * Idempotency is enforced by `coven_requests.UNIQUE (from_user_id, to_user_id)`
 * — duplicate inserts return error code 23505 which we swallow. Self-invites
 * are rejected by the table's CHECK constraint at the DB level; we still
 * pre-guard to avoid a noisy error. The cookie is cleared by the caller
 * regardless of outcome.
 */
async function maybeCreateInviteCovenRequest(newUserId: string, inviterUsername: string): Promise<void> {
  const admin = serviceRoleClient();

  const { data: inviter } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", inviterUsername)
    .maybeSingle();
  if (!inviter || inviter.id === newUserId) return;

  // Already coven members? Walk both directions of the (user_a < user_b)
  // edge invariant.
  const a = inviter.id < newUserId ? inviter.id : newUserId;
  const b = inviter.id < newUserId ? newUserId : inviter.id;
  const { data: bond } = await admin
    .from("coven_members")
    .select("user_a_id")
    .eq("user_a_id", a)
    .eq("user_b_id", b)
    .maybeSingle();
  if (bond) return;

  // Existing pending request in either direction? Skip.
  const { data: existingFwd } = await admin
    .from("coven_requests")
    .select("id")
    .eq("from_user_id", inviter.id)
    .eq("to_user_id", newUserId)
    .maybeSingle();
  if (existingFwd) return;
  const { data: existingRev } = await admin
    .from("coven_requests")
    .select("id")
    .eq("from_user_id", newUserId)
    .eq("to_user_id", inviter.id)
    .maybeSingle();
  if (existingRev) return;

  const { error } = await admin
    .from("coven_requests")
    .insert({ from_user_id: inviter.id, to_user_id: newUserId, status: "pending" });
  // 23505 = unique violation; safe to swallow (raced with another path)
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function completeOnboarding(payload: OnboardingPayload) {
  const c = await createClient();
  await _completeOnboarding(c, payload);
  redirect("/home");
}
