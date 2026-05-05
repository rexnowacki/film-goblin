import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export interface LocalHauntDetail {
  id: string;
  title: string;
  source_url: string;
  date_label: string | null;
  starts_on: string | null;
  starts_at: string | null;
  date_precision: string;
  showtime_label: string | null;
  poster_url: string | null;
  description: string | null;
  theater: {
    name: string;
    city: string | null;
    region: string | null;
  };
  film: {
    id: string;
    title: string;
    year: number;
    artwork_url: string;
  } | null;
}

export async function getLocalHauntDetail(client: Client, id: string): Promise<LocalHauntDetail | null> {
  const { data: showing, error } = await client
    .from("theater_showings")
    .select("id, title, source_url, date_label, starts_on, starts_at, date_precision, showtime_label, poster_url, description, theater:theaters!inner(name, city, region)")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!showing) return null;

  const { data: match, error: matchErr } = await client
    .from("theater_showing_matches")
    .select("film:films!inner(id, title, year, artwork_url)")
    .eq("showing_id", id)
    .in("status", ["auto", "confirmed"])
    .order("confidence", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (matchErr) throw matchErr;
  const theater = Array.isArray(showing.theater) ? showing.theater[0] : showing.theater;
  const film = match?.film ? (Array.isArray(match.film) ? match.film[0] : match.film) : null;

  return {
    id: showing.id,
    title: showing.title,
    source_url: showing.source_url,
    date_label: showing.date_label,
    starts_on: showing.starts_on,
    starts_at: showing.starts_at,
    date_precision: showing.date_precision,
    showtime_label: showing.showtime_label,
    poster_url: showing.poster_url,
    description: showing.description,
    theater,
    film,
  };
}
