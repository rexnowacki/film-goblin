"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { requireAuthUser } from "@/lib/auth/require-auth-user";

type Client = SupabaseClient<Database>;

export async function _follow(client: Client, followedUserId: string): Promise<void> {
  const user = await requireAuthUser(client);
  const { error } = await client
    .from("follows")
    .insert({ follower_user_id: user.id, followed_user_id: followedUserId });
  // 23505 = unique violation. Already following — treat as no-op.
  if (error && error.code !== "23505") throw error;
}

export async function _unfollow(client: Client, followedUserId: string): Promise<void> {
  const user = await requireAuthUser(client);
  const { error } = await client
    .from("follows")
    .delete()
    .eq("follower_user_id", user.id)
    .eq("followed_user_id", followedUserId);
  if (error) throw error;
}

export async function follow(followedUserId: string, targetUsername?: string) {
  const c = await createClient();
  await _follow(c, followedUserId);
  revalidatePath("/home");
  if (targetUsername) revalidatePath(`/p/${targetUsername}`);
}

export async function unfollow(followedUserId: string, targetUsername?: string) {
  const c = await createClient();
  await _unfollow(c, followedUserId);
  revalidatePath("/home");
  if (targetUsername) revalidatePath(`/p/${targetUsername}`);
}
