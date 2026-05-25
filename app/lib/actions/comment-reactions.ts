"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { requireAuthUser } from "@/lib/auth/require-auth-user";
import type { LikerProfile, LikersResponse } from "@/lib/actions/reactions";

type Client = SupabaseClient<Database>;

/**
 * Toggle the current user's like on a comment. Insert if absent, delete if
 * present. Mirrors _toggleReaction exactly. The composite PK
 * (user_id, comment_id) collapses the SELECT-then-INSERT race; concurrent
 * duplicate inserts return 23505 which we swallow as "already liked".
 */
export async function _toggleCommentReaction(
  client: Client,
  commentId: string,
): Promise<{ liked: boolean }> {
  const user = await requireAuthUser(client);

  const { data: existing } = await client
    .from("activity_comment_reactions")
    .select("comment_id")
    .eq("comment_id", commentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await client
      .from("activity_comment_reactions")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", user.id);
    if (error) throw error;
    return { liked: false };
  } else {
    const { error } = await client
      .from("activity_comment_reactions")
      .insert({ comment_id: commentId, user_id: user.id });
    if (error && (error as { code?: string }).code !== "23505") throw error;
    return { liked: true };
  }
}

export async function toggleCommentReaction(commentId: string): Promise<{ liked: boolean }> {
  const supabase = await createClient();
  const result = await _toggleCommentReaction(supabase, commentId);
  revalidatePath("/home");
  return result;
}

/**
 * Fetch the likers of a comment, partitioned into coven members of the viewer
 * and everyone else. Mirrors fetchLikersForActivity. Called on-demand by
 * LikersBottomSheet via CommentHeartButton.
 */
export async function fetchLikersForComment(commentId: string): Promise<LikersResponse> {
  const supabase = await createClient();
  const user = await requireAuthUser(supabase);

  const { data: reactionRows, error: rxErr } = await supabase
    .from("activity_comment_reactions")
    .select("user_id")
    .eq("comment_id", commentId);
  if (rxErr) throw rxErr;
  const likerIds: string[] = (reactionRows ?? []).map((r: { user_id: string }) => r.user_id);
  if (likerIds.length === 0) return { coven: [], others: [] };

  const { data: profileRows, error: pErr } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", likerIds);
  if (pErr) throw pErr;
  const allLikers: LikerProfile[] = (profileRows ?? []) as LikerProfile[];
  if (allLikers.length === 0) return { coven: [], others: [] };

  const { data: covenRows } = await supabase
    .from("coven_members")
    .select("user_a_id, user_b_id")
    .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);
  const covenIds = new Set<string>();
  for (const r of covenRows ?? []) {
    covenIds.add(r.user_a_id === user.id ? r.user_b_id : r.user_a_id);
  }

  const coven: LikerProfile[] = [];
  const others: LikerProfile[] = [];
  for (const p of allLikers) {
    (covenIds.has(p.id) ? coven : others).push(p);
  }
  return { coven, others };
}
