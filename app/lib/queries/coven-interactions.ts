import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { getMyCovenMembers } from "./coven";

type Client = SupabaseClient<Database>;

export interface CovenfolkRanked {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  score: number;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Returns the user's coven members ordered by 90-day interaction score:
 * recommendations sent to them + reactions on their activity + comments
 * on their activity, equally weighted. Ties break alphabetically by
 * username. Coven members with score 0 sort last alphabetically.
 *
 * Aggregation runs in app code because PostgREST has no GROUP BY.
 * Promote to an RPC if a user ever has thousands of covenfolk × hundreds
 * of interactions per pair.
 */
export async function getRankedCovenfolk(
  client: Client,
  userId: string,
): Promise<CovenfolkRanked[]> {
  const since = new Date(Date.now() - NINETY_DAYS_MS).toISOString();

  const members = await getMyCovenMembers(client, userId);
  if (members.length === 0) return [];
  const score = new Map<string, number>(members.map(m => [m.id, 0]));

  const recs = await client
    .from("activity")
    .select("payload")
    .eq("actor_user_id", userId)
    .eq("kind", "recommendation_sent")
    .gte("created_at", since);
  if (recs.error) throw recs.error;
  for (const row of recs.data ?? []) {
    const toId = (row.payload as { to_user_id?: string })?.to_user_id;
    if (toId && score.has(toId)) score.set(toId, score.get(toId)! + 1);
  }

  const reacts = await client
    .from("activity_reactions")
    .select("activity:activity!inner(actor_user_id)")
    .eq("user_id", userId)
    .gte("created_at", since);
  if (reacts.error) throw reacts.error;
  for (const row of reacts.data ?? []) {
    const actorId = (row as unknown as { activity: { actor_user_id: string } }).activity?.actor_user_id;
    if (actorId && score.has(actorId)) score.set(actorId, score.get(actorId)! + 1);
  }

  const comments = await client
    .from("activity_comments")
    .select("activity:activity!inner(actor_user_id)")
    .eq("user_id", userId)
    .gte("created_at", since);
  if (comments.error) throw comments.error;
  for (const row of comments.data ?? []) {
    const actorId = (row as unknown as { activity: { actor_user_id: string } }).activity?.actor_user_id;
    if (actorId && score.has(actorId)) score.set(actorId, score.get(actorId)! + 1);
  }

  return members
    .map(m => ({
      id: m.id,
      username: m.username,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
      score: score.get(m.id) ?? 0,
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.username.localeCompare(b.username);
    });
}
