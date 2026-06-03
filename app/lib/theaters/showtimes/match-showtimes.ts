import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { normalizeTitle } from "../normalize-title";

type Client = SupabaseClient<Database>;

interface FilmRow {
  id: string;
  title: string;
  year: number | null;
}

export function chooseFilmId(title: string, films: FilmRow[]): string | null {
  const exact = films.filter((film) => film.title.toLowerCase() === title.toLowerCase());
  if (exact.length === 1) return exact[0].id;

  const normalizedTitle = normalizeTitle(title);
  const normalized = films.filter((film) => normalizeTitle(film.title) === normalizedTitle);
  if (normalized.length === 1) return normalized[0].id;

  return null;
}

export async function matchShowtimes(client: Client, showtimeIds?: string[]): Promise<number> {
  if (showtimeIds && showtimeIds.length === 0) return 0;

  let showtimesQuery = client
    .from("theater_showtimes")
    .select("id, title")
    .eq("is_active", true)
    .is("film_id", null);

  if (showtimeIds) showtimesQuery = showtimesQuery.in("id", showtimeIds);

  const [showtimesRes, filmsRes] = await Promise.all([
    showtimesQuery,
    client.from("films").select("id, title, year").eq("available", true),
  ]);
  if (showtimesRes.error) throw showtimesRes.error;
  if (filmsRes.error) throw filmsRes.error;

  const films = filmsRes.data ?? [];
  let matched = 0;

  for (const showtime of showtimesRes.data ?? []) {
    const filmId = chooseFilmId(showtime.title, films);
    if (!filmId) continue;

    const { error } = await client
      .from("theater_showtimes")
      .update({ film_id: filmId })
      .eq("id", showtime.id);
    if (error) throw error;
    matched++;
  }

  return matched;
}
