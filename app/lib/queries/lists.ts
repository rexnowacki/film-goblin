import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export async function getFeaturedGrimoires(client: Client) {
  const { data, error } = await client
    .from("lists")
    .select("id, owner_user_id, title, description, is_public, is_official, created_at")
    .eq("is_public", true)
    .order("is_official", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(4);
  if (error) throw error;
  return data ?? [];
}

export async function getPublicLists(client: Client) {
  const { data, error } = await client
    .from("lists")
    .select("id, owner_user_id, title, description, is_public, is_official, created_at")
    .eq("is_public", true)
    .order("is_official", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(24);
  if (error) throw error;
  return data ?? [];
}

export async function getList(client: Client, id: string) {
  const { data, error } = await client
    .from("lists")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function getMySubscribedLists(client: Client, userId: string) {
  const { data, error } = await client
    .from("list_subscriptions")
    .select("list_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map(r => r.list_id);
}
