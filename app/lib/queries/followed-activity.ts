import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { EnrichedActivity } from "./activity";
import { getReactionsForActivities } from "./activity-reactions";
import { getCommentSummariesForActivities } from "./activity-comments";

type Client = SupabaseClient<Database>;

export async function getFollowedActivity(
  client: Client,
  userId: string,
  limit = 10,
): Promise<EnrichedActivity[]> {
  const { data: followRows } = await client
    .from("follows")
    .select("followed_user_id")
    .eq("follower_user_id", userId);
  const followedIds = (followRows ?? []).map(r => r.followed_user_id);
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

  const [actors, films, recipients, lists, reactionsMap, commentsMap] = await Promise.all([
    actorIds.length ? client.from("profiles").select("id, username, display_name, avatar_url").in("id", actorIds) : Promise.resolve({ data: [] as any[] }),
    filmIds.length ? client.from("films").select("id, title, director, year, artwork_url, itunes_url").in("id", filmIds) : Promise.resolve({ data: [] as any[] }),
    recipientIds.length ? client.from("profiles").select("id, username, display_name, avatar_url").in("id", recipientIds) : Promise.resolve({ data: [] as any[] }),
    listIds.length ? client.from("lists").select("id, title").in("id", listIds) : Promise.resolve({ data: [] as any[] }),
    getReactionsForActivities(client, raw.map(r => r.id), userId),
    getCommentSummariesForActivities(client, raw.map(r => r.id), userId),
  ]);

  const actorMap = new Map((actors.data ?? []).map((r: any) => [r.id, r]));
  const filmMap = new Map((films.data ?? []).map((r: any) => [r.id, r]));
  const recipientMap = new Map((recipients.data ?? []).map((r: any) => [r.id, r]));
  const listMap = new Map((lists.data ?? []).map((r: any) => [r.id, r]));

  const out: EnrichedActivity[] = [];
  for (const r of raw) {
    const actor = actorMap.get(r.actor_user_id);
    if (!actor) continue;
    const payload = r.payload as any;
    const film = payload?.film_id ? filmMap.get(payload.film_id) : undefined;
    const recipient = payload?.to_user_id ? recipientMap.get(payload.to_user_id) : undefined;
    const list = payload?.list_id ? listMap.get(payload.list_id) : undefined;
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
        if (film) out.push({ ...base, kind: "watch_logged", film, note: payload.note ?? null, recommended: typeof payload.recommended === "boolean" ? payload.recommended : null });
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
  return out;
}
