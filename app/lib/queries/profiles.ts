import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export const PROFILE_SELECT_COLUMNS = "id, username, display_name, bio, avatar_url, role, created_at, updated_at, broadcast_watchlist_adds, broadcast_library, broadcast_watched, email_added_at, email_price_drops, email_coven_recs, email_comments, email_coven_invites, notify_rate_reminders, notify_comment_likes, notify_film_requests, lane_tag_ids, discoverable, is_starter, starter_order, onboarded_at, must_change_password" as const;

export const PUBLIC_PROFILE_COLUMNS = "id, username, display_name, avatar_url, bio, role, created_at" as const;

export async function getMyProfile(client: Client) {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("profiles")
    .select(PROFILE_SELECT_COLUMNS)
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return data;
}

export async function getProfileByUsername(client: Client, username: string) {
  const { data, error } = await client
    .from("profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .ilike("username", username)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProfilesBySearch(
  client: Client,
  opts: { q?: string; limit?: number; excludeUserIds?: string[] } = {},
) {
  let query = client
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio, created_at")
    .order("username", { ascending: true })
    .limit(opts.limit ?? 60);
  if (opts.q && opts.q.trim()) {
    const q = opts.q.trim();
    query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
  }
  if (opts.excludeUserIds && opts.excludeUserIds.length > 0) {
    query = query.not("id", "in", `(${opts.excludeUserIds.join(",")})`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export interface ProfileBundle {
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    created_at: string;
    role: "goblin" | "witch" | "high_goblin";
  };
  lists: Array<{ id: string; title: string; description: string | null; is_official: boolean; is_public: boolean }>;
  coven: Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>;
}

export async function getPublicProfileBundle(
  client: Client,
  username: string,
): Promise<ProfileBundle | null> {
  const { data: profile, error } = await client
    .from("profiles")
    .select("id, username, display_name, bio, avatar_url, created_at, role")
    .ilike("username", username)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return null;

  const { data: lists } = await client
    .from("lists")
    .select("id, title, description, is_official, is_public")
    .eq("owner_user_id", profile.id)
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  const { data: pairs } = await client
    .from("coven_members")
    .select("user_a_id, user_b_id")
    .or(`user_a_id.eq.${profile.id},user_b_id.eq.${profile.id}`);
  const otherIds = (pairs ?? []).map(p => (p.user_a_id === profile.id ? p.user_b_id : p.user_a_id));
  let coven: Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }> = [];
  if (otherIds.length > 0) {
    const { data: cov } = await client
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", otherIds);
    coven = cov ?? [];
  }

  return {
    profile,
    lists: lists ?? [],
    coven,
  };
}
