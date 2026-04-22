"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function _subscribeToList(client: Client, listId: string): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  const { error } = await client
    .from("list_subscriptions")
    .insert({ user_id: user.id, list_id: listId });
  if (error) throw error;
}

export async function _unsubscribeFromList(client: Client, listId: string): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  const { error } = await client
    .from("list_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("list_id", listId);
  if (error) throw error;
}

export async function subscribeToList(listId: string) {
  const c = await createClient();
  await _subscribeToList(c, listId);
  revalidatePath("/lists");
}

export async function unsubscribeFromList(listId: string) {
  const c = await createClient();
  await _unsubscribeFromList(c, listId);
  revalidatePath("/lists");
}
