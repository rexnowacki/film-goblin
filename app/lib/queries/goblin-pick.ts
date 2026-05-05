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
}

export async function getGoblinPick(client: Client): Promise<GoblinPickFilm | null> {
  const { data } = await client
    .from("goblin_pick")
    .select("films(id, title, director, year, artwork_url, itunes_url)")
    .eq("id", 1)
    .maybeSingle();

  if (!data?.films) return null;
  return data.films as unknown as GoblinPickFilm;
}
