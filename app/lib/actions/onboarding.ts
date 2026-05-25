"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";
import { requireAuthUser } from "@/lib/auth/require-auth-user";
import { readInviteCookie, clearInviteCookie } from "./invite-cookie";

type Client = SupabaseClient<Database>;

export interface OnboardingPayload {
  username: string;
  watchlistFilmIds: string[];
  laneTagIds: string[];
  starterFollowIds: string[];
}

const USERNAME_RE = /^[a-z0-9._]+$/;
const DEFAULT_COVEN_USERNAME = "cthulhu.lemon";

export async function _completeOnboarding(client: Client, p: OnboardingPayload): Promise<void> {
  const user = await requireAuthUser(client);

  const username = p.username.trim();
  if (!USERNAME_RE.test(username)) {
    throw new Error("Invalid username: lowercase letters, numbers, dots, underscores only.");
  }

  const { error: pErr } = await client
    .from("profiles")
    .update({
      username,
      lane_tag_ids: p.laneTagIds,
      broadcast_watchlist_adds: true,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (pErr) throw pErr;

  for (const filmId of p.watchlistFilmIds) {
    const { error: wErr } = await client
      .from("watchlists")
      .insert({ user_id: user.id, film_id: filmId, max_price_usd: null });
    if (wErr && wErr.code !== "23505") throw wErr;
  }

  for (const targetId of p.starterFollowIds) {
    const { error: fErr } = await client
      .from("follows")
      .insert({ follower_user_id: user.id, followed_user_id: targetId });
    if (fErr && fErr.code !== "23505") throw fErr;
  }

  await ensureDefaultCovenBond(user.id);

  const inviteUsername = await readInviteCookie();
  if (inviteUsername) {
    try {
      await maybeCreateInviteCovenRequest(user.id, inviteUsername);
    } finally {
      await clearInviteCookie();
    }
  }
}

async function ensureDefaultCovenBond(newUserId: string): Promise<void> {
  const admin = serviceRoleClient();
  const { data: defaultMember, error: lookupError } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", DEFAULT_COVEN_USERNAME)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!defaultMember || defaultMember.id === newUserId) return;

  const user_a_id = defaultMember.id < newUserId ? defaultMember.id : newUserId;
  const user_b_id = defaultMember.id < newUserId ? newUserId : defaultMember.id;
  const { error } = await admin
    .from("coven_members")
    .insert({ user_a_id, user_b_id });
  if (error && error.code !== "23505") throw error;
}

async function maybeCreateInviteCovenRequest(newUserId: string, inviterUsername: string): Promise<void> {
  const admin = serviceRoleClient();
  const { data: inviter } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", inviterUsername)
    .maybeSingle();
  if (!inviter || inviter.id === newUserId) return;

  const a = inviter.id < newUserId ? inviter.id : newUserId;
  const b = inviter.id < newUserId ? newUserId : inviter.id;
  const { data: bond } = await admin
    .from("coven_members")
    .select("user_a_id")
    .eq("user_a_id", a)
    .eq("user_b_id", b)
    .maybeSingle();
  if (bond) return;

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
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function completeOnboarding(payload: OnboardingPayload) {
  const c = await createClient();
  await _completeOnboarding(c, payload);
  redirect("/home");
}
