import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface FilmShowtime {
  id: string;
  starts_at: string;
  screen_label: string | null;
  format_label: string | null;
  tickets_url: string;
  theater_name: string;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function getActiveShowtimesForFilm(client: Client, filmId: string): Promise<FilmShowtime[]> {
  const { data, error } = await client
    .from("theater_showtimes")
    .select("id, starts_at, screen_label, format_label, tickets_url, theater:theaters(name)")
    .eq("film_id", filmId)
    .eq("is_active", true)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const theater = one(row.theater as { name: string } | { name: string }[] | null);
    return {
      id: row.id,
      starts_at: row.starts_at,
      screen_label: row.screen_label,
      format_label: row.format_label,
      tickets_url: row.tickets_url,
      theater_name: theater?.name ?? "The Loft",
    };
  });
}
