import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface FilmCastMember {
  id: string;
  tmdb_id: number;
  name: string;
  character: string | null;
  billing_order: number;
  profile_path: string | null;
}

export function tmdbProfileUrl(profilePath: string | null, size = "w185"): string | null {
  return profilePath ? `https://image.tmdb.org/t/p/${size}${profilePath}` : null;
}

export async function getFilmCast(client: Client, filmId: string): Promise<FilmCastMember[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (table: string) => any };
  const { data, error } = await c
    .from("film_cast")
    .select("character, billing_order, people(id, tmdb_id, name, profile_path)")
    .eq("film_id", filmId)
    .order("billing_order", { ascending: true })
    .limit(12);
  if (error) {
    // Allows code deploys to land safely before migration 0180 is applied.
    if (error.code === "42P01") return [];
    throw error;
  }

  return (data ?? []).map((row: any) => {
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    return {
      id: person.id,
      tmdb_id: person.tmdb_id,
      name: person.name,
      character: row.character ?? null,
      billing_order: row.billing_order,
      profile_path: person.profile_path ?? null,
    };
  });
}
