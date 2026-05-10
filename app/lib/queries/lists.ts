import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export async function getFeaturedGrimoires(client: Client) {
  const { data, error } = await client
    .from("lists")
    .select("id, owner_user_id, title, description, is_public, is_official, created_at")
    .eq("is_public", true)
    .order("is_official", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(4);
  if (error) throw error;
  return data ?? [];
}

export async function getPublicLists(client: Client) {
  const { data, error } = await client
    .from("lists")
    .select("id, owner_user_id, title, description, is_public, is_official, created_at")
    .eq("is_public", true)
    .order("is_official", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(24);
  if (error) throw error;
  return data ?? [];
}

export async function getList(client: Client, id: string) {
  const { data, error } = await client
    .from("lists")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMySubscribedLists(client: Client, userId: string) {
  const { data, error } = await client
    .from("list_subscriptions")
    .select("list_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map(r => r.list_id);
}

export interface ListFilmRow {
  position: number;
  added_at: string;
  film: {
    id: string;
    itunes_id: number | null;
    title: string;
    director: string;
    year: number;
    artwork_url: string;
    coven_rating_pct: number | null;
  };
}

export async function getListFilms(client: Client, listId: string): Promise<ListFilmRow[]> {
  const { data, error } = await (client as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (k: string, v: string) => {
          order: (k: string, opts: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  })
    .from("list_films")
    .select(`
      position,
      added_at,
      film:films_with_stats!inner(
        id, itunes_id, title, director, year, artwork_url, coven_rating_pct
      )
    `)
    .eq("list_id", listId)
    .order("position", { ascending: true });
  if (error) throw error as Error;
  return ((data ?? []) as ListFilmRow[]).map(r => ({
    position: r.position,
    added_at: r.added_at,
    film: r.film,
  }));
}

export async function getListOwner(client: Client, ownerUserId: string) {
  const { data, error } = await client
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("id", ownerUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
