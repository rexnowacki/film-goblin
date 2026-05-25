"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { requireAuthUser } from "@/lib/auth/require-auth-user";

type Client = SupabaseClient<Database>;

export async function _subscribeToList(client: Client, listId: string): Promise<void> {
  const user = await requireAuthUser(client);
  const { error } = await client
    .from("list_subscriptions")
    .insert({ user_id: user.id, list_id: listId });
  if (error) throw error;
}

export async function _unsubscribeFromList(client: Client, listId: string): Promise<void> {
  const user = await requireAuthUser(client);
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
