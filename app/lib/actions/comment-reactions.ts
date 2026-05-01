"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

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
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

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
