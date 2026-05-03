"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { CommentItem } from "@/lib/queries/activity-comments";

type Client = SupabaseClient<Database>;

const MAX_LEN = 140;

export type AddResult =
  | { ok: true; comment: CommentItem }
  | { ok: false; error: string };

export type DeleteResult =
  | { ok: true }
  | { ok: false; error: string };

export async function _addActivityComment(
  client: Client,
  activityId: string,
  rawBody: string,
  parentId?: string,
): Promise<AddResult> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) return { ok: false, error: "unauthenticated" };

  const body = (rawBody ?? "").trim();
  if (body.length === 0) return { ok: false, error: "Comment is empty." };
  if (body.length > MAX_LEN) return { ok: false, error: `Comment is over ${MAX_LEN} characters.` };

  // Two-step hydrate: activity_comments.user_id FKs to auth.users, not profiles,
  // so PostgREST can't traverse the chain via a nested embed. Insert first, then
  // hydrate the commenter profile in a second query. Same pattern as the read
  // helper in lib/queries/activity-comments.ts.
  const { data, error } = await client
    .from("activity_comments")
    .insert({ activity_id: activityId, user_id: user.id, body, parent_id: parentId ?? null })
    .select("id, activity_id, user_id, body, created_at, parent_id")
    .single();
  if (error) return { ok: false, error: error.message };

  const { data: profile, error: pErr } = await client
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", user.id)
    .single();
  if (pErr) return { ok: false, error: pErr.message };

  return {
    ok: true,
    comment: {
      id: data.id,
      user_id: data.user_id,
      user: {
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      },
      body: data.body,
      created_at: data.created_at,
      like_count: 0,
      liked_by_me: false,
      parent_id: data.parent_id,
      reply_count: 0,
    },
  };
}

export async function addActivityComment(
  activityId: string,
  body: string,
  parentId?: string,
): Promise<AddResult> {
  const supabase = await createClient();
  const result = await _addActivityComment(supabase, activityId, body, parentId);
  if (result.ok) revalidatePath("/home");
  return result;
}

export async function _deleteActivityComment(
  client: Client,
  commentId: string,
): Promise<DeleteResult> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) return { ok: false, error: "unauthenticated" };

  const { data, error } = await client
    .from("activity_comments")
    .delete()
    .eq("id", commentId)
    .select("id"); // returns deleted row(s); empty array means RLS filtered the delete out.
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Not allowed." };
  return { ok: true };
}

export async function deleteActivityComment(commentId: string): Promise<DeleteResult> {
  const supabase = await createClient();
  const result = await _deleteActivityComment(supabase, commentId);
  if (result.ok) revalidatePath("/home");
  return result;
}
