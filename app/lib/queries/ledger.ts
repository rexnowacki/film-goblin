import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface LedgerFilm {
  id: string;
  title: string;
  director: string;
  year: number;
  artwork_url: string | null;
  itunes_url: string;
}

export async function getWatchlistPriceDropFilms(
  client: Client,
  userId: string,
  limit = 3,
): Promise<LedgerFilm[]> {
  const { data: watchlists } = await client
    .from("watchlists")
    .select("id, film_id")
    .eq("user_id", userId);

  if (!watchlists?.length) return [];

  const watchlistIds = watchlists.map(w => w.id);
  const { data: alerts } = await client
    .from("price_alerts")
    .select("film_id")
    .in("watchlist_id", watchlistIds)
    .order("created_at", { ascending: false });

  if (!alerts?.length) return [];

  // Deduplicate by film_id, keeping the most recent alert per film.
  const seen = new Set<string>();
  const filmIds: string[] = [];
  for (const a of alerts) {
    if (!seen.has(a.film_id)) { seen.add(a.film_id); filmIds.push(a.film_id); }
    if (filmIds.length === limit) break;
  }

  const { data: films } = await client
    .from("films")
    .select("id, title, director, year, artwork_url, itunes_url")
    .in("id", filmIds);

  return (films ?? []) as LedgerFilm[];
}
