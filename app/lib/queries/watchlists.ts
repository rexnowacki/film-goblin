import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export async function getMyWatchlist(client: Client) {
  const { data, error } = await client
    .from("watchlists")
    .select("id, film_id, max_price_usd, last_alerted_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function isOnWatchlist(client: Client, filmId: string): Promise<boolean> {
  const { data, error } = await client
    .from("watchlists")
    .select("id")
    .eq("film_id", filmId)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}
