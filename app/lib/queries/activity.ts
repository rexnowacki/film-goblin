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
  | { kind: "watch_logged"; film: FilmLite; note: string | null; recommended: boolean | null }
  | { kind: "library_added"; film: FilmLite }
  | { kind: "list_created"; list: ListLite }
  | { kind: "list_film_added"; list: ListLite; film: FilmLite }
  | { kind: "coven_joined"; other: RecipientLite }
  | { kind: "user_joined" }
  | { kind: "gazing_invited"; film: FilmLite; token: string; theaterName: string; startsAt: string; formatLabel: string | null }
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

export interface FeedFilters {
  limit?: number;
  // "coven" is the legacy home feed scope: viewer + coven mates, plus recs
  // sent to the viewer. "site" is the public activity firehose.
  scope?: "coven" | "site";
  // When set, return only this user's activity (overrides the follow-graph scope).
  actorId?: string;
  // When set, return only activity whose payload references this film_id.
  filmId?: string;
  // Cursor: return only activity strictly older than this ISO timestamp.
  // Used by infinite scroll on /home.
  before?: string;
  // When set, restrict to these activity kinds (used by tab-scoped queries).
  kinds?: string[];
}

export interface EnrichedActivityPage {
  items: EnrichedActivity[];
  // Cursor for the next page — the LAST raw row's created_at, not the
  // last enriched item's. Using the raw boundary means we don't fall off
  // the end early when enrichment drops rows (e.g., film no longer exists).
  nextCursor: string | null;
  // True when the raw fetch was shorter than the limit — i.e., we know
  // there's nothing older to fetch. Decoupled from items.length so dropped
  // rows don't fake-out the pagination.
  done: boolean;
}

/**
 * Returns un-grouped enriched activity rows newest-first. Same fetch +
 * enrichment logic as getEnrichedFeed but without the groupFeed step,
 * so the caller can paginate (group across page boundaries) client-side.
 *
 * This is what /home calls for the initial render and what loadMoreFeed
 * calls for subsequent pages.
 */
export async function getEnrichedActivity(
  client: Client,
  followerUserId: string,
  opts: FeedFilters = {},
): Promise<EnrichedActivityPage> {
  const limit = opts.limit ?? 20;
  const scope = opts.scope ?? "coven";

  let actorIds: string[] | null = null;
  if (scope === "coven") {
    // Feed scope is the user's coven graph (mutual bonds), not the older
    // one-directional follows table. coven_members has the user_a_id <
    // user_b_id invariant; expand both sides into a flat list of mates.
    const { data: covenRows } = await client
      .from("coven_members")
      .select("user_a_id, user_b_id")
      .or(`user_a_id.eq.${followerUserId},user_b_id.eq.${followerUserId}`);
    const covenMateIds = (covenRows ?? []).map(r =>
      r.user_a_id === followerUserId ? r.user_b_id : r.user_a_id,
    );
    actorIds = Array.from(new Set([followerUserId, ...covenMateIds]));
  }

  const isFiltered = !!(opts.actorId || opts.filmId);

  // Build the primary query. When filtered by actor: scope to that actor.
  // When filtered by film: scope to follow-graph + film_id payload match.
  // recsToMe (recs from non-followed strangers) is dropped under any filter
  // because the user has explicitly asked for one specific axis.
  let primary = client
    .from("activity")
    .select("id, kind, payload, created_at, actor_user_id")
    .order("created_at", { ascending: false });
  if (opts.actorId) {
    primary = primary.eq("actor_user_id", opts.actorId);
  } else if (actorIds) {
    primary = primary.in("actor_user_id", actorIds);
  }
  if (opts.filmId) {
    primary = primary.filter("payload->>film_id", "eq", opts.filmId);
  }
  if (opts.kinds && opts.kinds.length > 0) {
    primary = primary.in("kind", opts.kinds as EnrichedActivity["kind"][]);
  }
  if (opts.before) {
    primary = primary.lt("created_at", opts.before);
  }
  primary = primary.limit(limit);

  // For the coven-scoped feed, preserve the legacy behavior of including
  // recommendations sent to the viewer even if the sender is not in their
  // coven graph. The site-wide feed already includes those rows naturally.
  const includeRecsToMe = scope === "coven" && !isFiltered && (!opts.kinds?.length || opts.kinds.includes("recommendation_sent"));

  const [byActor, recsToMe] = await Promise.all([
    primary,
    includeRecsToMe
      ? (() => {
          let q = client
            .from("activity")
            .select("id, kind, payload, created_at, actor_user_id")
            .eq("kind", "recommendation_sent")
            .filter("payload->>to_user_id", "eq", followerUserId)
            .order("created_at", { ascending: false });
          if (opts.before) q = q.lt("created_at", opts.before);
          return q.limit(limit);
        })()
      : Promise.resolve({ data: [] as Array<{ id: string; kind: string; payload: unknown; created_at: string; actor_user_id: string }>, error: null }),
  ]);
  if (byActor.error) throw byActor.error;
  if (recsToMe.error) throw recsToMe.error;

  const merged = new Map<string, any>();
  for (const row of byActor.data ?? []) merged.set(row.id, row);
  for (const row of recsToMe.data ?? []) merged.set(row.id, row);
  const raw = Array.from(merged.values())
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit);
  // Pagination signals come from the RAW result before enrichment. If we
  // asked for `limit` rows and got fewer back, there's nothing older to
  // fetch — done. Otherwise the cursor is the oldest raw row's timestamp.
  const rawDone = raw.length < limit;
  const rawCursor: string | null = raw.length > 0 ? raw[raw.length - 1].created_at : null;
  if (raw.length === 0) return { items: [], nextCursor: null, done: true };

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
    getCommentSummariesForActivities(client, raw.map(r => r.id), followerUserId),
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
      case "user_joined":
        out.push({ ...base, kind: "user_joined" });
        break;
      case "gazing_invited":
        if (film) out.push({
          ...base,
          kind: "gazing_invited",
          film,
          token: payload.token ?? "",
          theaterName: payload.theater_name ?? "",
          startsAt: payload.starts_at ?? "",
          formatLabel: payload.format_label ?? null,
        });
        break;
    }
  }
  return { items: out, nextCursor: rawCursor, done: rawDone };
}

/**
 * Returns the feed already grouped (for callers that don't paginate).
 * Internally getEnrichedActivity + groupFeed.
 */
export async function getEnrichedFeed(
  client: Client,
  followerUserId: string,
  optsOrLimit: number | FeedFilters = {},
): Promise<FeedItem[]> {
  const opts: FeedFilters = typeof optsOrLimit === "number" ? { limit: optsOrLimit } : optsOrLimit;
  const page = await getEnrichedActivity(client, followerUserId, opts);
  return groupFeed(page.items);
}

// Back-compat wrapper. Returns FeedItem[] now that getEnrichedFeed groups internally.
export async function getFeed(client: Client, limit = 50): Promise<FeedItem[]> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return [];
  return getEnrichedFeed(client, user.id, limit);
}
