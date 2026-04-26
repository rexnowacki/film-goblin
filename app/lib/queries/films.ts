import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { getOwnedFilmIds } from "./library";

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
    .from("films_with_stats")
    .select("id, itunes_id, title, director, year, runtime_min, genre_primary, description, content_advisory, artwork_url, itunes_url, tracking, available, first_seen_at, last_checked_at, last_priced_at, watchlist_count, owned_count, watcher_count, latest_price")
    .eq("id", id)
    .single();
  if (error) throw error;
  // Cast at the boundary: the view types all columns as nullable because Supabase
  // generates view types defensively, but a film looked up by id is guaranteed to
  // have non-null id/title/director/year fields (the underlying `films` table
  // declares them NOT NULL). This narrowing lets the page consumer pass film.id
  // and film.title directly without `!` assertions.
  return data as typeof data & {
    id: string; title: string; director: string; year: number;
    watchlist_count: number; watcher_count: number;
  };
}

export type FilmsSort = "added" | "release" | "title" | "watchlisted" | "price_low" | "price_high";

export const FILMS_PAGE_SIZE = 60;

export async function getFilms(
  client: Client,
  opts: { q?: string; sort?: FilmsSort; page?: number; viewerUserId?: string | null } = {},
): Promise<{
  rows: Array<{
    id: string; itunes_id: number | null; title: string; director: string;
    year: number; runtime_min: number; genre_primary: string; artwork_url: string;
    latest_price: number | null; watchlist_count: number; watcher_count: number;
  }>;
  total: number;
  pageSize: number;
}> {
  const sort: FilmsSort = opts.sort ?? "added";
  const page = Math.max(1, opts.page ?? 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (client as unknown as { from: (t: string) => any })
    .from("films_with_stats")
    .select(
      "id, itunes_id, title, director, year, runtime_min, genre_primary, artwork_url, latest_price, watchlist_count, watcher_count",
      { count: "exact" },
    )
    .eq("tracking", true)
    .eq("available", true);

  if (opts.q && opts.q.trim()) {
    query = query.or(`title.ilike.%${opts.q}%,director.ilike.%${opts.q}%`);
  }

  if (opts.viewerUserId) {
    const ownedIds = await getOwnedFilmIds(client, opts.viewerUserId);
    if (ownedIds.length > 0) {
      query = query.not("id", "in", `(${ownedIds.map(id => `"${id}"`).join(",")})`);
    }
  }

  switch (sort) {
    case "added":
      query = query.order("first_seen_at", { ascending: false });
      break;
    case "release":
      query = query.order("year", { ascending: false });
      break;
    case "title":
      query = query.order("title", { ascending: true });
      break;
    case "watchlisted":
      query = query.order("watchlist_count", { ascending: false, nullsFirst: false });
      break;
    case "price_low":
      query = query.order("latest_price", { ascending: true, nullsFirst: false });
      break;
    case "price_high":
      query = query.order("latest_price", { ascending: false, nullsFirst: false });
      break;
  }

  const from = (page - 1) * FILMS_PAGE_SIZE;
  const to = from + FILMS_PAGE_SIZE - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return { rows: (data ?? []) as never, total: count ?? 0, pageSize: FILMS_PAGE_SIZE };
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
