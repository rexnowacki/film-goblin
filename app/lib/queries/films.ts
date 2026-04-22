import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export async function getLandingMarquee(client: Client) {
  const { data, error } = await client
    .from("films")
    .select("id, itunes_id, title, director, year, runtime_min, genre_primary, artwork_url, itunes_url")
    .eq("tracking", true)
    .eq("available", true)
    .order("last_priced_at", { ascending: false, nullsFirst: false })
    .limit(10);
  if (error) throw error;
  return data ?? [];
}

export async function getFilm(client: Client, id: string) {
  const { data, error } = await client
    .from("films")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function getFilms(client: Client, opts: { q?: string; limit?: number } = {}) {
  let query = client
    .from("films")
    .select("id, itunes_id, title, director, year, runtime_min, genre_primary, artwork_url")
    .eq("tracking", true)
    .eq("available", true)
    .order("year", { ascending: false })
    .limit(opts.limit ?? 60);
  if (opts.q && opts.q.trim()) {
    query = query.or(`title.ilike.%${opts.q}%,director.ilike.%${opts.q}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getLatestPriceHistory(client: Client, filmId: string, days = 180) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const { data, error } = await client
    .from("price_history")
    .select("price_usd, hd_price_usd, is_sale, captured_at")
    .eq("film_id", filmId)
    .gte("captured_at", since)
    .order("captured_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
