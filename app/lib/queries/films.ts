import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { getOwnedFilmIds } from "./library";
import { getWatchlistedFilmIds } from "./watchlists";
import { getCurrentlyShowingFilmIds } from "./current-showing";

type Client = SupabaseClient<Database>;

export async function getRecentlySummoned(client: Client, limit = 10) {
  const { data, error } = await client
    .from("films")
    .select("id, itunes_id, title, director, year, runtime_min, genre_primary, artwork_url, itunes_url")
    .eq("available", true)
    .order("first_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getFilm(client: Client, id: string) {
  // Trailer columns added to films_with_stats in mig 0178; types.ts not
  // regenerated yet so we cast through `as never` on the select string.
  const { data, error } = await (client as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { single: () => Promise<{ data: unknown; error: unknown }> } } } })
    .from("films_with_stats")
    .select("id, itunes_id, title, director, year, runtime_min, genre_primary, description, content_advisory, artwork_url, itunes_url, tracking, available, first_seen_at, last_checked_at, last_priced_at, watchlist_count, owned_count, watcher_count, latest_price, coven_rating_pct, coven_rating_count, trailer_url, trailer_youtube_id, trailer_label, trailer_verified")
    .eq("id", id)
    .single();
  if (error) throw error;
  // Cast at the boundary: the view types all columns as nullable because Supabase
  // generates view types defensively, but a film looked up by id is guaranteed to
  // have non-null id/title/director/year fields (the underlying `films` table
  // declares them NOT NULL). This narrowing lets the page consumer pass film.id
  // and film.title directly without `!` assertions.
  return data as {
    id: string; itunes_id: number | null; title: string; director: string;
    year: number; runtime_min: number; genre_primary: string;
    description: string; content_advisory: string; artwork_url: string;
    itunes_url: string; tracking: boolean; available: boolean;
    first_seen_at: string; last_checked_at: string | null; last_priced_at: string | null;
    watchlist_count: number; owned_count: number; watcher_count: number;
    latest_price: number | null;
    coven_rating_pct: number | null; coven_rating_count: number | null;
    trailer_url: string | null; trailer_youtube_id: string | null;
    trailer_label: string | null; trailer_verified: boolean;
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
    coven_rating_pct: number | null;
    on_watchlist: boolean; in_library: boolean; currently_showing: boolean;
  }>;
  total: number;
  pageSize: number;
}> {
  const sort: FilmsSort = opts.sort ?? "added";
  const page = Math.max(1, opts.page ?? 1);
  const isSearching = !!(opts.q && opts.q.trim());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (client as unknown as { from: (t: string) => any })
    .from("films_with_stats")
    .select(
      "id, itunes_id, title, director, year, runtime_min, genre_primary, artwork_url, latest_price, watchlist_count, watcher_count, coven_rating_pct",
      { count: "exact" },
    )
    .eq("available", true);

  if (isSearching) {
    query = query.or(`title.ilike.%${opts.q}%,director.ilike.%${opts.q}%`);
  }

  let ownedSet = new Set<string>();
  let watchlistedSet = new Set<string>();
  if (opts.viewerUserId) {
    // Default browse hides films the viewer has already saved or owns — the
    // grid is for discovery. When the viewer is searching by query, the
    // exclusion is lifted so any film they remember by name can be found;
    // matched rows get tagged with `on_watchlist` / `in_library` so the UI
    // can render a muted "On watchlist" / "In grimoire" badge.
    const [ownedIds, watchlistedIds] = await Promise.all([
      getOwnedFilmIds(client, opts.viewerUserId),
      getWatchlistedFilmIds(client, opts.viewerUserId),
    ]);
    ownedSet = new Set(ownedIds);
    watchlistedSet = new Set(watchlistedIds);
    if (!isSearching) {
      const excludeIds = Array.from(new Set([...ownedIds, ...watchlistedIds]));
      if (excludeIds.length > 0) {
        query = query.not("id", "in", `(${excludeIds.map(id => `"${id}"`).join(",")})`);
      }
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
  const showingIds = await getCurrentlyShowingFilmIds(client, ((data ?? []) as Array<{ id: string }>).map(r => r.id));
  const rows = ((data ?? []) as Array<{ id: string }>).map(r => ({
    ...r,
    on_watchlist: watchlistedSet.has(r.id),
    in_library: ownedSet.has(r.id),
    currently_showing: showingIds.has(r.id),
  })).sort((a, b) => Number(b.currently_showing) - Number(a.currently_showing));
  return { rows: rows as never, total: count ?? 0, pageSize: FILMS_PAGE_SIZE };
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
