import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export interface FilmTags {
  subgenre: string | null;   // tag.name where type='subgenre', or null
  vibes: string[];           // tag.name list where type='vibe'
}

export interface TagOption {
  id: string;
  name: string;
}

/**
 * Returns the curated tag set for a film. Joins film_tags → tags and
 * partitions by type. The schema technically allows multiple subgenre
 * rows per film, but the editor enforces 1; if multiple are present we
 * use the first (alphabetical by name).
 */
export async function getFilmTags(client: Client, filmId: string): Promise<FilmTags> {
  const { data, error } = await client
    .from("film_tags")
    .select("tag:tags!inner(name, type)")
    .eq("film_id", filmId);
  if (error) throw error;
  const subgenres: string[] = [];
  const vibes: string[] = [];
  for (const row of data ?? []) {
    const tag = (row as unknown as { tag: { name: string; type: string } }).tag;
    if (tag.type === "subgenre") subgenres.push(tag.name);
    else if (tag.type === "vibe") vibes.push(tag.name);
  }
  subgenres.sort();
  vibes.sort();
  return {
    subgenre: subgenres[0] ?? null,
    vibes,
  };
}

/**
 * All sub-genre tags. Cached at the request level — same lists render on
 * every admin editor mount.
 */
export async function getAllSubgenres(client: Client): Promise<TagOption[]> {
  const { data, error } = await client
    .from("tags")
    .select("id, name")
    .eq("type", "subgenre")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TagOption[];
}

export async function getAllVibes(client: Client): Promise<TagOption[]> {
  const { data, error } = await client
    .from("tags")
    .select("id, name")
    .eq("type", "vibe")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TagOption[];
}
