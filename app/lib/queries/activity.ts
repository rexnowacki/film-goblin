import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

interface ActorLite {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface FilmLite {
  id: string;
  title: string;
  director: string;
  year: number;
  artwork_url: string;
  itunes_url: string;
}

interface ListLite {
  id: string;
  title: string;
}

interface RecipientLite {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
}

export type EnrichedActivity =
  | { id: string; kind: "recommendation_sent"; created_at: string; actor: ActorLite; film: FilmLite; recipient: RecipientLite; note: string }
  | { id: string; kind: "review_published"; created_at: string; actor: ActorLite; film: FilmLite; title: string; pullquote: string | null }
  | { id: string; kind: "watchlist_added"; created_at: string; actor: ActorLite; film: FilmLite }
  | { id: string; kind: "list_created"; created_at: string; actor: ActorLite; list: ListLite }
  | { id: string; kind: "list_film_added"; created_at: string; actor: ActorLite; list: ListLite; film: FilmLite }
  | { id: string; kind: "coven_joined"; created_at: string; actor: ActorLite; other: RecipientLite };

export async function getEnrichedFeed(
  client: Client,
  followerUserId: string,
  limit = 50,
): Promise<EnrichedActivity[]> {
  const { data: followsRows } = await client
    .from("follows")
    .select("followed_user_id")
    .eq("follower_user_id", followerUserId);
  const followedIds = (followsRows ?? []).map(r => r.followed_user_id);
  if (followedIds.length === 0) return [];

  const { data: raw, error } = await client
    .from("activity")
    .select("id, kind, payload, created_at, actor_user_id")
    .in("actor_user_id", followedIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!raw || raw.length === 0) return [];

  const actorIds = Array.from(new Set(raw.map(r => r.actor_user_id)));
  const filmIds = Array.from(new Set(raw.map(r => (r.payload as any)?.film_id).filter(Boolean)));
  const recipientIds = Array.from(new Set(raw.map(r => (r.payload as any)?.to_user_id).filter(Boolean)));
  const listIds = Array.from(new Set(raw.map(r => (r.payload as any)?.list_id).filter(Boolean)));

  const [actors, films, recipients, lists] = await Promise.all([
    actorIds.length ? client.from("profiles").select("id, handle, display_name, avatar_url").in("id", actorIds) : Promise.resolve({ data: [] as any }),
    filmIds.length ? client.from("films").select("id, title, director, year, artwork_url, itunes_url").in("id", filmIds) : Promise.resolve({ data: [] as any }),
    recipientIds.length ? client.from("profiles").select("id, handle, display_name, avatar_url").in("id", recipientIds) : Promise.resolve({ data: [] as any }),
    listIds.length ? client.from("lists").select("id, title").in("id", listIds) : Promise.resolve({ data: [] as any }),
  ]);

  const actorMap = new Map((actors.data ?? []).map((r: any) => [r.id, r]));
  const filmMap = new Map((films.data ?? []).map((r: any) => [r.id, r]));
  const recipientMap = new Map((recipients.data ?? []).map((r: any) => [r.id, r]));
  const listMap = new Map((lists.data ?? []).map((r: any) => [r.id, r]));

  const out: EnrichedActivity[] = [];
  for (const r of raw) {
    const actor = actorMap.get(r.actor_user_id) as ActorLite | undefined;
    if (!actor) continue;
    const payload = r.payload as any;
    const film = payload?.film_id ? (filmMap.get(payload.film_id) as FilmLite | undefined) : undefined;
    const recipient = payload?.to_user_id ? (recipientMap.get(payload.to_user_id) as RecipientLite | undefined) : undefined;
    const list = payload?.list_id ? (listMap.get(payload.list_id) as ListLite | undefined) : undefined;

    const base = { id: r.id, created_at: r.created_at, actor };

    switch (r.kind) {
      case "recommendation_sent":
        if (film && recipient) out.push({ ...base, kind: "recommendation_sent", film, recipient, note: payload.note ?? "" });
        break;
      case "review_published":
        if (film) out.push({ ...base, kind: "review_published", film, title: payload.title ?? "", pullquote: payload.pullquote ?? null });
        break;
      case "watchlist_added":
        if (film) out.push({ ...base, kind: "watchlist_added", film });
        break;
      case "list_created":
        if (list) out.push({ ...base, kind: "list_created", list });
        break;
      case "list_film_added":
        if (list && film) out.push({ ...base, kind: "list_film_added", list, film });
        break;
      case "coven_joined":
        if (recipient) out.push({ ...base, kind: "coven_joined", other: recipient });
        break;
    }
  }
  return out;
}

// Back-compat wrapper so home/page.tsx continues to compile pre-Task 14.
// Task 14 will replace callers with getEnrichedFeed directly.
export async function getFeed(client: Client, limit = 50): Promise<EnrichedActivity[]> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return [];
  return getEnrichedFeed(client, user.id, limit);
}
