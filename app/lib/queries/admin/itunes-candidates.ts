import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface PendingCandidateRow {
  id: string;
  film_id: string;
  itunes_id: number;
  itunes_url: string;
  match_title: string;
  match_year: number | null;
  match_artwork_url: string | null;
  confidence: number;
  match_type: string;
  created_at: string;
  film: {
    id: string;
    title: string;
    year: number;
    director: string;
    artwork_url: string;
  };
}

export async function listPendingItunesCandidates(
  client: SupabaseClient<Database>,
): Promise<PendingCandidateRow[]> {
  const { data, error } = await client
    .from("itunes_candidates")
    .select(
      "id, film_id, itunes_id, itunes_url, match_title, match_year, match_artwork_url, confidence, match_type, created_at, film:films!inner(id, title, year, director, artwork_url)",
    )
    .eq("status", "pending")
    .order("confidence", { ascending: false });
  if (error) throw error;
  // PostgREST nested embed types may emit film as array even though it's one-to-one;
  // coerce to single object.
  return (data ?? []).map((r) => {
    const rawFilm = (r as unknown as { film: unknown }).film;
    const film = Array.isArray(rawFilm)
      ? (rawFilm as PendingCandidateRow["film"][])[0]
      : (rawFilm as PendingCandidateRow["film"]);
    return { ...r, film };
  }) as PendingCandidateRow[];
}
