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
  email_notifications_enabled?: boolean;
}

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export async function _updateProfile(client: Client, fields: ProfileFields): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  const patch: ProfileUpdate = { ...fields };
  if (fields.email_notifications_enabled === true) {
    const { data: current } = await client
      .from("profiles")
      .select("email_notifications_enabled")
      .eq("id", user.id)
      .single();
    if (current && current.email_notifications_enabled === false) {
      const { randomUUID } = await import("node:crypto");
      patch.unsubscribe_token = randomUUID();
    }
  }

  const { error } = await client.from("profiles").update(patch).eq("id", user.id);
  if (error) throw error;
}

export async function updateProfile(fields: ProfileFields) {
  const c = await createClient();
  await _updateProfile(c, fields);
  revalidatePath("/settings");
}
