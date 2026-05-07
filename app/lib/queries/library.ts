import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * Returns the IDs of films owned by the given user. Used by /films
 * discovery to exclude these from the grid for the viewer.
 * Returns [] for unauthed callers.
 */
export async function getOwnedFilmIds(client: Client, userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const { data, error } = await client
    .from("library")
    .select("film_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map(r => r.film_id);
}

/**
 * Returns the user's library joined with film details, sorted by
 * recently-added by default. Powers the /library page.
 */
export async function getLibrary(client: Client, userId: string) {
  const { data, error } = await (client as any)
    .from("library")
    .select(`
      created_at,
      film:films_with_stats!inner(
        id, itunes_id, title, director, year, artwork_url, coven_rating_pct
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map(r => ({
    created_at: r.created_at as string,
    film: r.film as {
      id: string;
      itunes_id: number | null;
      title: string;
      director: string;
      year: number;
      artwork_url: string;
      coven_rating_pct: number | null;
    },
  }));
}

/**
 * Boolean: does this user own this film? Powers the OwnedButton's
 * initial state on /film/[id].
 */
export async function isInLibrary(client: Client, userId: string, filmId: string): Promise<boolean> {
  const { data, error } = await client
    .from("library")
    .select("film_id")
    .eq("user_id", userId)
    .eq("film_id", filmId)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}
