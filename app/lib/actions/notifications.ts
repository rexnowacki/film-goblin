"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function _markAllRead(client: Client, userId: string): Promise<void> {
  const { error } = await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

export async function markAllRead(): Promise<void> {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  await _markAllRead(client, user.id);
}

export async function _clearAllNotifications(client: Client, userId: string): Promise<void> {
  const { error } = await client
    .from("notifications")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}

export async function clearAllNotifications(): Promise<void> {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  await _clearAllNotifications(client, user.id);
}
