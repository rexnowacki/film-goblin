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

export async function getCovenWatchersForFilm(
  client: Client,
  userId: string,
  filmId: string,
): Promise<WatcherProfile[]> {
  const { data: edges, error: edgeErr } = await client
    .from("coven_members")
    .select("user_a_id, user_b_id")
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
  if (edgeErr) throw edgeErr;

  const covenIds = (edges ?? []).map(r =>
    r.user_a_id === userId ? r.user_b_id : r.user_a_id,
  );
  if (covenIds.length === 0) return [];

  const [{ data: wl }, { data: lib }] = await Promise.all([
    client.from("watchlists").select("user_id").eq("film_id", filmId).in("user_id", covenIds),
    client.from("library").select("user_id").eq("film_id", filmId).in("user_id", covenIds),
  ]);

  const watcherSet = new Set([
    ...(wl ?? []).map(r => r.user_id),
    ...(lib ?? []).map(r => r.user_id),
  ]);
  if (watcherSet.size === 0) return [];

  const { data: profiles, error: pErr } = await client
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", Array.from(watcherSet))
    .limit(4);
  if (pErr) throw pErr;
  return profiles ?? [];
}

export async function getOtherWatchersForFilm(
  client: Client,
  userId: string,
  filmId: string,
  limit = 50,
): Promise<OtherWatchersResult> {
  const { data: edges } = await client
    .from("coven_members")
    .select("user_a_id, user_b_id")
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
  const excludeIds = new Set<string>([userId]);
  for (const r of edges ?? []) {
    excludeIds.add(r.user_a_id === userId ? r.user_b_id : r.user_a_id);
  }

  const [{ data: wl }, { data: lib }] = await Promise.all([
    client.from("watchlists").select("user_id").eq("film_id", filmId),
    client.from("library").select("user_id").eq("film_id", filmId),
  ]);

  const allIds = new Set([
    ...(wl ?? []).map(r => r.user_id),
    ...(lib ?? []).map(r => r.user_id),
  ]);
  for (const id of excludeIds) allIds.delete(id);
  if (allIds.size === 0) return { users: [], totalCount: 0 };

  const { data: profiles, error } = await client
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", Array.from(allIds))
    .eq("discoverable", true)
    .order("username");
  if (error) throw error;

  const all = profiles ?? [];
  return {
    users: all.slice(0, limit),
    totalCount: all.length,
  };
}
