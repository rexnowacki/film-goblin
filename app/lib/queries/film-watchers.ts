import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export interface WatcherProfile {
  id: string;
  username: string;
  avatar_url: string | null;
}

export interface OtherWatchersResult {
  users: WatcherProfile[];
  totalCount: number;
}

// Uses SECURITY DEFINER RPCs to bypass RLS on watchlists/library, which are
// owner-only SELECT policies. The DB functions enforce their own access rules.

export async function getCovenWatchersForFilm(
  client: Client,
  userId: string,
  filmId: string,
): Promise<WatcherProfile[]> {
  const { data, error } = await client.rpc("get_coven_watchers_for_film", {
    p_user_id: userId,
    p_film_id: filmId,
  });
  if (error) throw error;
  return (data ?? []) as WatcherProfile[];
}

export async function getOtherWatchersForFilm(
  client: Client,
  userId: string,
  filmId: string,
  limit = 50,
): Promise<OtherWatchersResult> {
  const { data, error } = await client.rpc("get_other_watchers_for_film", {
    p_user_id: userId,
    p_film_id: filmId,
  });
  if (error) throw error;
  const all = (data ?? []) as WatcherProfile[];
  return {
    users: all.slice(0, limit),
    totalCount: all.length,
  };
}
