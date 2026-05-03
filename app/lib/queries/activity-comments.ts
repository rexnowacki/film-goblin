import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export interface CommentItem {
  id: string;
  user_id: string;
  user: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  body: string;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
  parent_id: string | null;
  reply_count: number;
}

export interface CommentSummary {
  count: number;
  items: CommentItem[]; // chronological (oldest first)
}

/**
 * Batch-fetch comment threads for a set of activity rows. Two-step hydrate:
 * activity_comments rows first, then a single profiles lookup over the unique
 * commenter ids. Cannot use a PostgREST nested embed because activity_comments
 * .user_id FKs to auth.users (not profiles); PostgREST can't traverse the
 * auth.users -> profiles indirection. Same pattern as fetchLikersForActivity
 * in app/lib/actions/reactions.ts.
 *
 * The empty entry for every requested id is pre-seeded so callers can read
 * `map.get(id)` without null checks.
 */
export async function getCommentSummariesForActivities(
  client: Client,
  activityIds: string[],
  viewerId: string | null,
): Promise<Map<string, CommentSummary>> {
  const map = new Map<string, CommentSummary>();
  for (const id of activityIds) map.set(id, { count: 0, items: [] });
  if (activityIds.length === 0) return map;

  const { data: rows, error } = await client
    .from("activity_comments")
    .select("id, activity_id, user_id, body, created_at, like_count, parent_id, reply_count")
    .in("activity_id", activityIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!rows || rows.length === 0) return map;

  const userIds = Array.from(new Set(rows.map(r => r.user_id)));
  const { data: profiles, error: pErr } = await client
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", userIds);
  if (pErr) throw pErr;
  const profileById = new Map((profiles ?? []).map(p => [p.id, p]));

  // Viewer's likes — single query, then in-memory Set lookup per row.
  // Skipped entirely for anonymous viewers.
  const likedSet = new Set<string>();
  if (viewerId !== null) {
    const commentIds = rows.map(r => r.id);
    const { data: rxRows, error: rxErr } = await client
      .from("activity_comment_reactions")
      .select("comment_id")
      .eq("user_id", viewerId)
      .in("comment_id", commentIds);
    if (rxErr) throw rxErr;
    for (const r of rxRows ?? []) likedSet.add(r.comment_id);
  }

  for (const row of rows) {
    const entry = map.get(row.activity_id);
    if (!entry) continue;
    const p = profileById.get(row.user_id);
    if (!p) continue; // commenter profile missing (deleted account); skip the row
    entry.items.push({
      id: row.id,
      user_id: row.user_id,
      user: { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url },
      body: row.body,
      created_at: row.created_at,
      like_count: row.like_count,
      liked_by_me: likedSet.has(row.id),
      parent_id: row.parent_id,
      reply_count: row.reply_count,
    });
    entry.count = entry.items.length;
  }
  return map;
}
