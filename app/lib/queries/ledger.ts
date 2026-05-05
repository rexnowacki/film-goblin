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
    .in("watchlist_id", watchlistIds);

  if (!alerts?.length) return [];

  const filmIds = Array.from(new Set(alerts.map(a => a.film_id)));
  const shuffled = [...filmIds].sort(() => Math.random() - 0.5).slice(0, limit);

  const { data: films } = await client
    .from("films")
    .select("id, title, director, year, artwork_url, itunes_url")
    .in("id", shuffled);

  return (films ?? []) as LedgerFilm[];
}
