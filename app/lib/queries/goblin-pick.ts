import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface GoblinPickFilm {
  id: string;
  title: string;
  director: string;
  year: number;
  artwork_url: string | null;
  itunes_url: string;
  whisper_text: string | null;
}

export interface GoblinPickRow {
  id: number;
  effective_at: string;
  whisper_text: string | null;
  film: {
    id: string;
    title: string;
    director: string;
    year: number;
    artwork_url: string | null;
    itunes_url: string;
  };
}

// The currently-active pick = greatest effective_at that is <= now().
export async function getGoblinPick(client: Client): Promise<GoblinPickFilm | null> {
  const { data } = await client
    .from("goblin_pick")
    .select("whisper_text, films(id, title, director, year, artwork_url, itunes_url)")
    .lte("effective_at", new Date().toISOString())
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.films) return null;
  const film = data.films as unknown as Omit<GoblinPickFilm, "whisper_text">;
  return { ...film, whisper_text: data.whisper_text ?? null };
}

// Admin view: everything (recent past + active + queued) ordered newest-first.
export async function getGoblinPickQueue(client: Client, limit = 20): Promise<GoblinPickRow[]> {
  const { data } = await client
    .from("goblin_pick")
    .select("id, effective_at, whisper_text, films(id, title, director, year, artwork_url, itunes_url)")
    .order("effective_at", { ascending: false })
    .limit(limit);

  if (!data) return [];
  return data
    .filter((r): r is typeof r & { films: NonNullable<typeof r.films> } => Boolean(r.films))
    .map(r => ({
      id: r.id,
      effective_at: r.effective_at,
      whisper_text: r.whisper_text,
      film: r.films as unknown as GoblinPickRow["film"],
    }));
}
