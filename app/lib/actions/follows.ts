"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function _follow(client: Client, followedUserId: string): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  const { error } = await client
    .from("follows")
    .insert({ follower_user_id: user.id, followed_user_id: followedUserId });
  // 23505 = unique violation. Already following — treat as no-op.
  if (error && error.code !== "23505") throw error;
}

export async function _unfollow(client: Client, followedUserId: string): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  const { error } = await client
    .from("follows")
    .delete()
    .eq("follower_user_id", user.id)
    .eq("followed_user_id", followedUserId);
  if (error) throw error;
}

export async function follow(followedUserId: string, targetHandle?: string) {
  const c = await createClient();
  await _follow(c, followedUserId);
  revalidatePath("/home");
  if (targetHandle) revalidatePath(`/p/${targetHandle}`);
}

export async function unfollow(followedUserId: string, targetHandle?: string) {
  const c = await createClient();
  await _unfollow(c, followedUserId);
  revalidatePath("/home");
  if (targetHandle) revalidatePath(`/p/${targetHandle}`);
}
