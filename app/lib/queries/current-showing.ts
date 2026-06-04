import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export async function getCurrentlyShowingFilmIds(client: Client, filmIds: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(filmIds)).filter(Boolean);
  if (unique.length === 0) return new Set();

  const { data, error } = await client
    .from("theater_showtimes")
    .select("film_id")
    .in("film_id", unique)
    .eq("is_active", true)
    .gte("starts_at", new Date().toISOString());
  if (error) throw error;

  return new Set((data ?? []).map(row => row.film_id).filter((id): id is string => Boolean(id)));
}

export async function isFilmCurrentlyShowing(client: Client, filmId: string): Promise<boolean> {
  const showing = await getCurrentlyShowingFilmIds(client, [filmId]);
  return showing.has(filmId);
}
