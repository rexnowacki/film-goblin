import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export interface CommentItem {
  id: string;
  user_id: string;
  user: {
    handle: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  body: string;
  created_at: string;
}

export interface CommentSummary {
  count: number;
  items: CommentItem[]; // chronological (oldest first)
}

/**
 * Batch-fetch comment threads for a set of activity rows. Single SELECT joining
 * activity_comments + profiles via PostgREST nested embed; aggregate into
 * Map<activity_id, CommentSummary> in JS. Mirrors getReactionsForActivities.
 *
 * The empty entry for every requested id is pre-seeded so callers can read
 * `map.get(id)` without null checks.
 */
export async function getCommentSummariesForActivities(
  client: Client,
  activityIds: string[],
): Promise<Map<string, CommentSummary>> {
  const map = new Map<string, CommentSummary>();
  for (const id of activityIds) map.set(id, { count: 0, items: [] });
  if (activityIds.length === 0) return map;

  const { data, error } = await client
    .from("activity_comments")
    .select("id, activity_id, user_id, body, created_at, user:profiles!inner(handle, display_name, avatar_url)")
    .in("activity_id", activityIds)
    .order("created_at", { ascending: true });
  if (error) throw error;

  for (const row of data ?? []) {
    const entry = map.get(row.activity_id);
    if (!entry) continue;
    // PostgREST nested embed types may model the embed as array even when it's
    // always one row — same workaround as the FilmPoster `as never` cast.
    const u = (Array.isArray(row.user) ? row.user[0] : row.user) as CommentItem["user"];
    entry.items.push({
      id: row.id,
      user_id: row.user_id,
      user: u,
      body: row.body,
      created_at: row.created_at,
    });
    entry.count = entry.items.length;
  }
  return map;
}
