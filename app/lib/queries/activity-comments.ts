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
): Promise<Map<string, CommentSummary>> {
  const map = new Map<string, CommentSummary>();
  for (const id of activityIds) map.set(id, { count: 0, items: [] });
  if (activityIds.length === 0) return map;

  const { data: rows, error } = await client
    .from("activity_comments")
    .select("id, activity_id, user_id, body, created_at")
    .in("activity_id", activityIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!rows || rows.length === 0) return map;

  const userIds = Array.from(new Set(rows.map(r => r.user_id)));
  const { data: profiles, error: pErr } = await client
    .from("profiles")
    .select("id, handle, display_name, avatar_url")
    .in("id", userIds);
  if (pErr) throw pErr;
  const profileById = new Map((profiles ?? []).map(p => [p.id, p]));

  for (const row of rows) {
    const entry = map.get(row.activity_id);
    if (!entry) continue;
    const p = profileById.get(row.user_id);
    if (!p) continue; // commenter profile missing (deleted account); skip the row
    entry.items.push({
      id: row.id,
      user_id: row.user_id,
      user: { handle: p.handle, display_name: p.display_name, avatar_url: p.avatar_url },
      body: row.body,
      created_at: row.created_at,
    });
    entry.count = entry.items.length;
  }
  return map;
}
