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
  const safe = q.replace(/[%_]/g, "");
  if (safe.length < 2) return { users: [], films: [] };
  const boundedLimit = Math.max(1, Math.min(limit, 10));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { users: [], films: [] };

  const [users, films] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
      .order("username", { ascending: true })
      .limit(boundedLimit),
    supabase
      .from("films")
      .select("id, title, year, director, artwork_url")
      .or(`title.ilike.%${safe}%,director.ilike.%${safe}%`)
      .order("title", { ascending: true })
      .limit(boundedLimit),
  ]);
  return {
    users: (users.data ?? []) as FeedSearchUser[],
    films: (films.data ?? []) as FeedSearchFilm[],
  };
}
