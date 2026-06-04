import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface DiaryFilm {
  id: string;
  title: string;
  year: number;
  director: string;
  artwork_url: string;
  coven_rating_pct: number | null;
  coven_rating_count: number | null;
}

export interface DiaryRow {
  id: string;
  watched_at: string; // YYYY-MM-DD
  note: string | null;
  recommended: boolean | null;
  spoiler: boolean;
  film: DiaryFilm;
}

export interface TopFilm {
  film: DiaryFilm;
  count: number;
}

export interface WatchedStats {
  total: number;
  thisYear: number;
  topFilms: TopFilm[]; // up to 5
}

/**
 * Returns the user's full diary, newest first, joined with film details.
 * Powers the /watched page. Month-grouping happens at render time.
 */
export async function getWatchedDiary(client: Client, userId: string): Promise<DiaryRow[]> {
  const { data, error } = await client
    .from("watched")
    .select(`
      id, watched_at, note, recommended, spoiler,
      film:films_with_stats!inner(id, title, year, director, artwork_url, coven_rating_pct, coven_rating_count)
    `)
    .eq("user_id", userId)
    .order("watched_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as never;
}

/**
 * Aggregate stats for the /watched hero band.
 */
export async function getWatchedStats(client: Client, userId: string): Promise<WatchedStats> {
  const { count: total } = await client
    .from("watched")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  const yearStart = `${new Date().getUTCFullYear()}-01-01`;
  const { count: thisYear } = await client
    .from("watched")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("watched_at", yearStart);

  // Top-5 films by watch count. Pull all rows for this user, group in JS.
  // For v1 cardinality (a single user's watch log) this is fine; if it grows
  // to hundreds of thousands, swap for an RPC.
  const { data: rows } = await client
    .from("watched")
    .select("film_id")
    .eq("user_id", userId);

  const counts = new Map<string, number>();
  for (const r of rows ?? []) {
    counts.set(r.film_id, (counts.get(r.film_id) ?? 0) + 1);
  }
  const topIds = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  let topFilms: TopFilm[] = [];
  if (topIds.length > 0) {
    const filmIds = topIds.map(([id]) => id);
    const { data: films } = await client
      .from("films_with_stats")
      .select("id, title, year, director, artwork_url, coven_rating_pct, coven_rating_count")
      .in("id", filmIds);
    const filmMap = new Map((films ?? []).map(f => [f.id, f]));
    topFilms = topIds
      .map(([id, count]) => {
        const film = filmMap.get(id);
        return film ? { film: film as DiaryFilm, count } : null;
      })
      .filter((x): x is TopFilm => x !== null);
  }

  return { total: total ?? 0, thisYear: thisYear ?? 0, topFilms };
}

/**
 * Watch count for a single (user, film). Powers the "✓ Watched · N" badge
 * on FilmActions on /film/[id]. Returns 0 for unauthed callers.
 */
export async function getWatchCountForFilm(
  client: Client,
  userId: string | null,
  filmId: string,
): Promise<number> {
  if (!userId) return 0;
  const { count } = await client
    .from("watched")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("film_id", filmId);
  return count ?? 0;
}
