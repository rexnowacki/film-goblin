import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

/**
 * IDs of coven members the current user has sent recommendations to,
 * ordered by recommendation count (descending). Returns up to `limit`
 * IDs. Empty array if the user has never sent a recommendation.
 *
 * Aggregation runs in app code because PostgREST doesn't support GROUP BY
 * natively. Fine at this scale (~hundreds of recommendations per user
 * worst case). Promote to an RPC or materialized view if a user ever
 * surpasses ~10k sent recommendations.
 */
export async function getTopRecommendedCovenMemberIds(
  client: Client,
  userId: string,
  limit = 8,
): Promise<string[]> {
  const { data, error } = await client
    .from("activity")
    .select("payload")
    .eq("actor_user_id", userId)
    .eq("kind", "recommendation_sent");
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const toId = (row.payload as { to_user_id?: string })?.to_user_id;
    if (toId) counts.set(toId, (counts.get(toId) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}
