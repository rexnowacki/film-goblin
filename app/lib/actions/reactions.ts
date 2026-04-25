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
 * delete if present. Self-likes blocked via a lookup against
 * activity.actor_user_id. Concurrent duplicate inserts (race between two
 * tabs) are swallowed at code 23505 — the final state matches the user's
 * intent either way.
 */
export async function _toggleReaction(
  client: Client,
  activityId: string,
): Promise<{ liked: boolean }> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

  // Self-like prevention.
  const { data: activityRow, error: actErr } = await client
    .from("activity")
    .select("actor_user_id")
    .eq("id", activityId)
    .maybeSingle();
  if (actErr) throw actErr;
  if (!activityRow) throw new Error("activity not found");
  if (activityRow.actor_user_id === user.id) {
    throw new Error("cannot like own activity");
  }

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = supabase as unknown as { from: (t: string) => any };

  // Likers + their profile info in one shot.
  const { data: likersRaw, error } = await c
    .from("activity_reactions")
    .select("user_id, profile:profiles!inner(id, handle, display_name, avatar_url)")
    .eq("activity_id", activityId);
  if (error) throw error;

  const allLikers: LikerProfile[] = (likersRaw ?? []).map((r: any) => r.profile).filter(Boolean);
  if (allLikers.length === 0) return { coven: [], others: [] };

  // Viewer's coven membership.
  const { data: covenRows } = await supabase
    .from("coven_members")
    .select("user_a_id, user_b_id")
    .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);
  const covenIds = new Set<string>();
  for (const r of covenRows ?? []) {
    covenIds.add(r.user_a_id === user.id ? r.user_b_id : r.user_a_id);
  }

  // Partition (drop the viewer themselves from the list).
  const coven: LikerProfile[] = [];
  const others: LikerProfile[] = [];
  for (const p of allLikers) {
    if (p.id === user.id) continue;
    (covenIds.has(p.id) ? coven : others).push(p);
  }
  return { coven, others };
}
