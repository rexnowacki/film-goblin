"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface ProfileFields {
  handle?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  broadcast_watchlist_adds?: boolean;
}

export async function _updateProfile(client: Client, fields: ProfileFields): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  const { error } = await client.from("profiles").update(fields).eq("id", user.id);
  if (error) throw error;
}

export async function updateProfile(fields: ProfileFields) {
  const c = await createClient();
  await _updateProfile(c, fields);
  revalidatePath("/settings");
}
