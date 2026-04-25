"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface LikerProfile {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface LikersResponse {
  coven: LikerProfile[];
  others: LikerProfile[];
}

/**
 * Toggle the current user's reaction on an activity row. Insert if absent,
 * delete if present. Self-likes are allowed — any authenticated user can like
 * any activity. Concurrent duplicate inserts (race between two tabs) are
 * swallowed at code 23505 — the final state matches the user's intent either
 * way.
 */
export async function _toggleReaction(
  client: Client,
  activityId: string,
): Promise<{ liked: boolean }> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

  // activity_reactions isn't in the generated types yet (post-types.ts migration).
  // Cast pattern from app/lib/actions/admin/films.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (t: string) => any };

  // Existence → toggle.
  const { data: existing } = await c
    .from("activity_reactions")
    .select("activity_id")
    .eq("activity_id", activityId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await c
      .from("activity_reactions")
      .delete()
      .eq("activity_id", activityId)
      .eq("user_id", user.id);
    if (error) throw error;
    return { liked: false };
  } else {
    const { error } = await c
      .from("activity_reactions")
      .insert({ activity_id: activityId, user_id: user.id });
    // Race with another tab: unique constraint violation — treat as "already liked".
    if (error && (error as { code?: string }).code !== "23505") throw error;
    return { liked: true };
  }
}

export async function toggleReaction(activityId: string): Promise<{ liked: boolean }> {
  const supabase = await createClient();
  const result = await _toggleReaction(supabase, activityId);
  revalidatePath("/home");
  return result;
}

/**
 * Fetch the likers of a single activity row, partitioned into coven members
 * of the viewer and everyone else. Called on-demand by LikersBottomSheet.
 */
export async function fetchLikersForActivity(activityId: string): Promise<LikersResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  // activity_reactions isn't in the generated Supabase types yet; cast pattern.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = supabase as unknown as { from: (t: string) => any };

  // Step 1: who liked this activity?
  const { data: reactionRows, error: rxErr } = await c
    .from("activity_reactions")
    .select("user_id")
    .eq("activity_id", activityId);
  if (rxErr) throw rxErr;
  const likerIds: string[] = (reactionRows ?? []).map((r: { user_id: string }) => r.user_id);
  if (likerIds.length === 0) return { coven: [], others: [] };

  // Step 2: hydrate profile info for those user_ids.
  // Note the indirect path: activity_reactions.user_id → auth.users.id, and
  // profiles.id → auth.users.id. PostgREST can't infer the chain, so we hydrate
  // explicitly via a second query (matches getEnrichedFeed's actor/recipient
  // hydration pattern).
  const { data: profileRows, error: pErr } = await supabase
    .from("profiles")
    .select("id, handle, display_name, avatar_url")
    .in("id", likerIds);
  if (pErr) throw pErr;
  const allLikers: LikerProfile[] = (profileRows ?? []) as LikerProfile[];

  if (allLikers.length === 0) return { coven: [], others: [] };

  // Step 3: viewer's coven membership.
  const { data: covenRows } = await supabase
    .from("coven_members")
    .select("user_a_id, user_b_id")
    .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);
  const covenIds = new Set<string>();
  for (const r of covenRows ?? []) {
    covenIds.add(r.user_a_id === user.id ? r.user_b_id : r.user_a_id);
  }

  // Step 4: partition all likers (including the viewer) by coven membership.
  const coven: LikerProfile[] = [];
  const others: LikerProfile[] = [];
  for (const p of allLikers) {
    (covenIds.has(p.id) ? coven : others).push(p);
  }
  return { coven, others };
}
