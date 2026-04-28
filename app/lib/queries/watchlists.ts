import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export interface WatchlistRowData {
  id: string;
  film_id: string;
  max_price_usd: number | null;
  last_alerted_at: string | null;
  created_at: string;
  film: {
    id: string;
    title: string;
    director: string;
    year: number;
    artwork_url: string;
    itunes_url: string | null;
    genre_primary: string;
    runtime_min: number;
    latest_price: number | null;
  };
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

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

/**
 * Returns the IDs of films on the given user's watchlist. Used by /films
 * discovery to mark which posters already have a green-checked watchlist
 * affordance in the hover-quick-add menu. Returns [] for unauthed callers.
 */
export async function getWatchlistedFilmIds(client: Client, userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const { data, error } = await client
    .from("watchlists")
    .select("film_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map(r => r.film_id);
}

export async function getMyWatchlistWithFilms(client: Client): Promise<WatchlistRowData[]> {
  const { data, error } = await client
    .from("watchlists")
    .select(`
      id, film_id, max_price_usd, last_alerted_at, created_at,
      film:films_with_stats!inner(
        id, title, director, year,
        artwork_url, itunes_url,
        genre_primary, runtime_min,
        latest_price
      )
    `)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    film_id: r.film_id,
    max_price_usd: toNumber(r.max_price_usd),
    last_alerted_at: r.last_alerted_at,
    created_at: r.created_at,
    film: {
      id: r.film.id,
      title: r.film.title,
      director: r.film.director,
      year: r.film.year,
      artwork_url: r.film.artwork_url,
      itunes_url: r.film.itunes_url,
      genre_primary: r.film.genre_primary,
      runtime_min: r.film.runtime_min,
      latest_price: toNumber(r.film.latest_price),
    },
  }));
}
