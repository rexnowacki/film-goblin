import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export async function getMyProfile(client: Client) {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return data;
}

export async function getProfileByHandle(client: Client, handle: string) {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .ilike("handle", handle)
    .maybeSingle();
  if (error) throw error;
  return data;
}
