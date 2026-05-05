import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { normalizeTitle } from "./normalize-title";

type Client = SupabaseClient<Database>;

interface FilmCandidate {
  id: string;
  title: string;
  year: number | null;
  normalized_title: string;
}

interface ShowingCandidate {
  id: string;
  title: string;
  normalized_title: string;
  source_id: string | null;
}

export interface MatchShowingsResult {
  matchedAuto: number;
  needsReview: number;
}

function yearFromSourceId(sourceId: string | null): number | null {
  const m = sourceId?.match(/-(\d{4})$/);
  return m ? Number(m[1]) : null;
}

function chooseMatch(showing: ShowingCandidate, films: FilmCandidate[]): {
  film: FilmCandidate;
  match_type: "exact_title" | "normalized_title" | "title_year";
  confidence: number;
  status: "auto" | "needs_review";
} | null {
  const year = yearFromSourceId(showing.source_id);
  const exactRaw = films.filter((f) => f.title.toLowerCase() === showing.title.toLowerCase());
  if (exactRaw.length === 1) {
    return { film: exactRaw[0], match_type: "exact_title", confidence: 1, status: "auto" };
  }

  const normalized = films.filter((f) => f.normalized_title === showing.normalized_title);
  if (year != null) {
    const titleYear = normalized.filter((f) => f.year === year);
    if (titleYear.length === 1) {
      return { film: titleYear[0], match_type: "title_year", confidence: 0.98, status: "auto" };
    }
  }
  if (normalized.length === 1) {
    return { film: normalized[0], match_type: "normalized_title", confidence: 0.95, status: "auto" };
  }
  if (normalized.length > 1) {
    return { film: normalized[0], match_type: "normalized_title", confidence: 0.95, status: "needs_review" };
  }
  return null;
}

export async function matchActiveShowings(client: Client, showingIds?: string[]): Promise<MatchShowingsResult> {
  let showingsQuery = client
    .from("theater_showings")
    .select("id, title, normalized_title, source_id")
    .eq("is_active", true);
  if (showingIds && showingIds.length > 0) showingsQuery = showingsQuery.in("id", showingIds);
  const [showingsRes, filmsRes] = await Promise.all([
    showingsQuery,
    client.from("films").select("id, title, year").eq("available", true),
  ]);
  if (showingsRes.error) throw showingsRes.error;
  if (filmsRes.error) throw filmsRes.error;

  const films: FilmCandidate[] = (filmsRes.data ?? []).map((film) => ({
    id: film.id,
    title: film.title,
    year: film.year,
    normalized_title: normalizeTitle(film.title),
  }));

  const rows = (showingsRes.data ?? [])
    .map((showing) => {
      const match = chooseMatch(showing, films);
      if (!match) return null;
      return {
        showing_id: showing.id,
        film_id: match.film.id,
        match_type: match.match_type,
        confidence: match.confidence,
        status: match.status,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (rows.length > 0) {
    const { error } = await client
      .from("theater_showing_matches")
      .upsert(rows, { onConflict: "showing_id,film_id", ignoreDuplicates: true });
    if (error) throw error;
  }

  return {
    matchedAuto: rows.filter((row) => row.status === "auto").length,
    needsReview: rows.filter((row) => row.status === "needs_review").length,
  };
}
