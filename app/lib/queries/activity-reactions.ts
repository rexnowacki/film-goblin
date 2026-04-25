import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export interface ReactionSummary {
  count: number;
  likedByMe: boolean;
}

/**
 * Batch-fetch reaction summaries for a set of activity rows. One SELECT pulls
 * every (activity_id, user_id) tuple in the batch; we aggregate in JS. This
 * shape lets us compute both the per-activity count AND the "did the viewer
 * like this" flag in a single round-trip, which an aggregate SQL query can't
 * easily return.
 *
 * Passing `viewerUserId === null` is safe: every returned entry will have
 * `likedByMe: false`. Supports the "not signed in" case for callers that
 * don't want to branch.
 */
export async function getReactionsForActivities(
  client: Client,
  activityIds: string[],
  viewerUserId: string | null,
): Promise<Map<string, ReactionSummary>> {
  if (activityIds.length === 0) return new Map();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (t: string) => any };
  const { data, error } = await c
    .from("activity_reactions")
    .select("activity_id, user_id")
    .in("activity_id", activityIds);
  if (error) throw error;

  const map = new Map<string, ReactionSummary>();
  for (const id of activityIds) map.set(id, { count: 0, likedByMe: false });
  for (const r of data ?? []) {
    const entry = map.get(r.activity_id);
    if (!entry) continue;
    entry.count += 1;
    if (viewerUserId && r.user_id === viewerUserId) entry.likedByMe = true;
  }
  return map;
}
