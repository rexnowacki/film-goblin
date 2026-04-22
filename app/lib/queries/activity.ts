import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export async function getFeed(client: Client, limit = 50) {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return [];

  // "Activity from users I follow" — RLS on activity is public, but we filter
  // client-side by subquery against follows.
  const { data: follows, error: fErr } = await client
    .from("follows")
    .select("followed_user_id")
    .eq("follower_user_id", user.id);
  if (fErr) throw fErr;
  const followedIds = (follows ?? []).map(f => f.followed_user_id);
  if (followedIds.length === 0) return [];

  const { data, error } = await client
    .from("activity")
    .select("id, actor_user_id, kind, payload, created_at")
    .in("actor_user_id", followedIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
