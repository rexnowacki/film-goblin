import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export type TagFacet = 'subgenre' | 'subject' | 'tone' | 'theme' | 'setting' | 'content';

export interface FilmTagRow {
  id: string;
  name: string;
  type: TagFacet;
  position: number;
  is_primary: boolean;
}

export interface FilmTags {
  visible: FilmTagRow[];   // film_tags rows where position <= 4 (max 4; staff guide visible 1-5 includes virtual director slot)
  hidden: FilmTagRow[];    // film_tags rows where position >= 5 (the FYP tail)
}

/**
 * Returns ordered tags for a film, split into visible (positions 1-4 in
 * film_tags = staff guide positions 1, 3, 4, 5 — guide position 2 is the
 * virtual director slot from films.director, not in film_tags) and hidden
 * (positions 5+).
 *
 * Hidden tags don't render on the film detail page in v2 but are returned
 * so the FYP recommender (sub-project B) can read the full ranked list
 * from the same query.
 */
export async function getFilmTags(client: Client, filmId: string): Promise<FilmTags> {
  const { data, error } = await client
    .from("film_tags")
    .select("position, is_primary, tag:tags!inner(id, name, type)")
    .eq("film_id", filmId)
    .order("position", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    position: number;
    is_primary: boolean;
    tag: { id: string; name: string; type: TagFacet };
  }>;
  const ordered: FilmTagRow[] = rows.map(r => ({
    id: r.tag.id,
    name: r.tag.name,
    type: r.tag.type,
    position: r.position,
    is_primary: r.is_primary,
  }));
  return {
    visible: ordered.filter(r => r.position <= 4),
    hidden: ordered.filter(r => r.position >= 5),
  };
}

export interface TagOption {
  id: string;
  name: string;
}

export type TagsByFacet = Record<TagFacet, TagOption[]>;

/**
 * Returns the entire canonical tag vocabulary keyed by facet. Drives the
 * editor's chip-picker stage. Results are alphabetical within each facet.
 */
export async function getAllTagsGroupedByType(client: Client): Promise<TagsByFacet> {
  const { data, error } = await client
    .from("tags")
    .select("id, name, type")
    .order("name", { ascending: true });
  if (error) throw error;
  const grouped: TagsByFacet = {
    subgenre: [], subject: [], tone: [], theme: [], setting: [], content: [],
  };
  for (const row of data ?? []) {
    const type = row.type as TagFacet;
    if (grouped[type]) grouped[type].push({ id: row.id, name: row.name });
  }
  return grouped;
}
