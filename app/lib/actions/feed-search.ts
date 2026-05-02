"use server";

import { createClient } from "@/lib/supabase/server";

export interface FeedSearchUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface FeedSearchFilm {
  id: string;
  title: string;
  year: number;
  director: string;
  artwork_url: string;
}

export interface FeedSearchResults {
  users: FeedSearchUser[];
  films: FeedSearchFilm[];
}

/**
 * Typeahead for the feed-search dropdown on /home. Returns up to `limit`
 * profile + film hits matching the substring query. Min query length 2 —
 * shorter queries return empty so we don't flash dozens of unrelated results
 * on the first keystroke.
 */
export async function searchFeedTargets(query: string, limit = 5): Promise<FeedSearchResults> {
  const q = query.trim();
  if (q.length < 2) return { users: [], films: [] };
  const supabase = await createClient();
  const [users, films] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .order("username", { ascending: true })
      .limit(limit),
    supabase
      .from("films")
      .select("id, title, year, director, artwork_url")
      .or(`title.ilike.%${q}%,director.ilike.%${q}%`)
      .order("title", { ascending: true })
      .limit(limit),
  ]);
  return {
    users: (users.data ?? []) as FeedSearchUser[],
    films: (films.data ?? []) as FeedSearchFilm[],
  };
}
