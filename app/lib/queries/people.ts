import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface PersonFilmCredit {
  film_id: string;
  character: string | null;
  billing_order: number;
  film: {
    id: string;
    title: string;
    director: string;
    year: number;
    artwork_url: string | null;
    available: boolean;
    series_id: string | null;
    series_order: number | null;
  };
  rating: {
    coven_rating_pct: number | null;
    coven_rating_count: number | null;
  } | null;
}

export interface PersonWithCredits {
  id: string;
  tmdb_id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string | null;
  credits: PersonFilmCredit[];
}

export function tmdbPersonUrl(tmdbId: number): string {
  return `https://www.themoviedb.org/person/${tmdbId}`;
}

export async function getPersonWithCredits(
  client: Client,
  personId: string,
): Promise<PersonWithCredits | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (table: string) => any };

  const { data: person, error: personError } = await c
    .from("people")
    .select("id, tmdb_id, name, profile_path, known_for_department")
    .eq("id", personId)
    .maybeSingle();
  if (personError) {
    if (personError.code === "42P01") return null;
    throw personError;
  }
  if (!person) return null;

  const { data: creditsRaw, error: creditsError } = await c
    .from("film_cast")
    .select("film_id, character, billing_order, film:films!inner(id, title, director, year, artwork_url, available, series_id, series_order)")
    .eq("person_id", personId)
    .eq("film.available", true)
    .order("billing_order", { ascending: true });
  if (creditsError) {
    if (creditsError.code === "42P01") return { ...person, credits: [] };
    throw creditsError;
  }

  const credits = (creditsRaw ?? []) as Array<{
    film_id: string;
    character: string | null;
    billing_order: number;
    film: PersonFilmCredit["film"];
  }>;
  const filmIds = credits.map((credit) => credit.film.id);
  const { data: stats, error: statsError } = filmIds.length > 0
    ? await c
      .from("films_with_stats")
      .select("id, coven_rating_pct, coven_rating_count")
      .in("id", filmIds)
    : { data: [], error: null };
  if (statsError) throw statsError;

  const statsRows = (stats ?? []) as Array<{
    id: string;
    coven_rating_pct: number | null;
    coven_rating_count: number | null;
  }>;
  const ratingById = new Map(statsRows.map((row) => [row.id, row]));

  return {
    id: person.id,
    tmdb_id: person.tmdb_id,
    name: person.name,
    profile_path: person.profile_path,
    known_for_department: person.known_for_department,
    credits: credits.map((credit) => ({
      ...credit,
      rating: ratingById.get(credit.film.id) ?? null,
    })),
  };
}
