"use server";

import { createClient } from "@/lib/supabase/server";

export interface FilmSearchHit {
  id: string;
  title: string;
  year: number;
  director: string;
  artwork_url: string;
}

export async function searchFilmsUniversal(query: string, limit = 6): Promise<FilmSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const safe = q.replace(/[%_]/g, "");
  if (safe.length < 2) return [];
  const boundedLimit = Math.max(1, Math.min(limit, 10));
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("films")
    .select("id, title, year, director, artwork_url")
    .or(`title.ilike.%${safe}%,director.ilike.%${safe}%`)
    .order("title", { ascending: true })
    .limit(boundedLimit);
  if (error) throw error;
  return (data ?? []) as FilmSearchHit[];
}
