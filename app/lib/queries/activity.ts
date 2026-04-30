import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { getReactionsForActivities, type ReactionSummary } from "./activity-reactions";
import { getCommentSummariesForActivities, type CommentSummary } from "./activity-comments";
import { groupFeed } from "./group-activity";

type Client = SupabaseClient<Database>;

interface ActorLite {
  id: string;
  username: string;
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
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export type EnrichedActivity = (
  | { kind: "recommendation_sent"; film: FilmLite; recipient: RecipientLite; note: string }
  | { kind: "review_published"; film: FilmLite; title: string; pullquote: string | null }
  | { kind: "watchlist_added"; film: FilmLite }
  | { kind: "watch_logged"; film: FilmLite; note: string | null }
  | { kind: "library_added"; film: FilmLite }
  | { kind: "list_created"; list: ListLite }
  | { kind: "list_film_added"; list: ListLite; film: FilmLite }
  | { kind: "coven_joined"; other: RecipientLite }
) & {
  id: string;
  created_at: string;
  actor: ActorLite;
  reactions: ReactionSummary;
  comments: CommentSummary;
};

export type FeedItem =
  | { type: "single"; activity: EnrichedActivity }
  | { type: "group"; group: ActivityGroup };

export interface ActivityGroup {
  // Stable composite key for React. Anchored on the OLDEST event in the run
  // so the key doesn't shift if newer events join the run on subsequent reads.
  key: string;
  actor: ActorLite;
  kind: "watchlist_added" | "watch_logged"; // widens as more kinds register
  items: EnrichedActivity[]; // newest-first, length >= 3
  count: number; // = items.length
  latestAt: string; // = items[0].created_at
}

export async function getEnrichedFeed(
  client: Client,
  followerUserId: string,
  limit = 50,
): Promise<FeedItem[]> {
  const { data: followsRows } = await client
    .from("follows")
    .select("followed_user_id")
    .eq("follower_user_id", followerUserId);
  const followedIds = (followsRows ?? []).map(r => r.followed_user_id);

  // Activity surfaces that show in the feed:
  //   - Followed users' public activity (reviews, watchlist adds, lists, coven joins, recs they sent).
  //   - My own activity (so I can see what I broadcast).
  //   - Recs sent TO me regardless of whether I follow the sender.
  // `activity` RLS already allows reads; we filter application-side.
  const actorIds = Array.from(new Set([followerUserId, ...followedIds]));

  const [byActor, recsToMe] = await Promise.all([
    client
      .from("activity")
      .select("id, kind, payload, created_at, actor_user_id")
      .in("actor_user_id", actorIds)
      .order("created_at", { ascending: false })
      .limit(limit),
    client
      .from("activity")
      .select("id, kind, payload, created_at, actor_user_id")
      .eq("kind", "recommendation_sent")
      .filter("payload->>to_user_id", "eq", followerUserId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (byActor.error) throw byActor.error;
  if (recsToMe.error) throw recsToMe.error;

  const merged = new Map<string, any>();
  for (const row of byActor.data ?? []) merged.set(row.id, row);
  for (const row of recsToMe.data ?? []) merged.set(row.id, row);
  const raw = Array.from(merged.values())
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit);
  if (raw.length === 0) return [];

  const rawActorIds = Array.from(new Set(raw.map(r => r.actor_user_id)));
  const filmIds = Array.from(new Set(raw.map(r => (r.payload as any)?.film_id).filter(Boolean)));
  const recipientIds = Array.from(new Set(raw.map(r => (r.payload as any)?.to_user_id).filter(Boolean)));
  const listIds = Array.from(new Set(raw.map(r => (r.payload as any)?.list_id).filter(Boolean)));

  const [actors, films, recipients, lists, reactionsMap, commentsMap] = await Promise.all([
    rawActorIds.length ? client.from("profiles").select("id, username, display_name, avatar_url").in("id", rawActorIds) : Promise.resolve({ data: [] as any }),
    filmIds.length ? client.from("films").select("id, title, director, year, artwork_url, itunes_url").in("id", filmIds) : Promise.resolve({ data: [] as any }),
    recipientIds.length ? client.from("profiles").select("id, username, display_name, avatar_url").in("id", recipientIds) : Promise.resolve({ data: [] as any }),
    listIds.length ? client.from("lists").select("id, title").in("id", listIds) : Promise.resolve({ data: [] as any }),
    getReactionsForActivities(client, raw.map(r => r.id), followerUserId),
    getCommentSummariesForActivities(client, raw.map(r => r.id)),
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

    const reactions = reactionsMap.get(r.id) ?? { count: 0, likedByMe: false };
    const comments = commentsMap.get(r.id) ?? { count: 0, items: [] };
    const base = { id: r.id, created_at: r.created_at, actor, reactions, comments };

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
      case "watch_logged":
        if (film) out.push({ ...base, kind: "watch_logged", film, note: payload.note ?? null });
        break;
      case "library_added":
        if (film) out.push({ ...base, kind: "library_added", film });
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
  return groupFeed(out);
}

// Back-compat wrapper. Returns FeedItem[] now that getEnrichedFeed groups internally.
export async function getFeed(client: Client, limit = 50): Promise<FeedItem[]> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return [];
  return getEnrichedFeed(client, user.id, limit);
}
