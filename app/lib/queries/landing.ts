import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getRecentSystemEvents } from "@/lib/feed-events/query";
import { composeFeed } from "@/lib/feed-events/compose";
import type { SystemFeedEvent } from "@/lib/feed-events/types";

type Client = SupabaseClient<Database>;

// Kinds shown on the pre-login landing feed card. Deliberately excludes
// user_joined / coven_joined / list_* / gazing_* — film-centric rows only.
const LANDING_KINDS = [
  "watch_logged",
  "review_published",
  "recommendation_sent",
  "watchlist_added",
  "library_added",
] as const;
type LandingKind = (typeof LANDING_KINDS)[number];

export interface LandingActor {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}
export interface LandingFilm {
  id: string;
  title: string;
  artwork_url: string | null;
}

export type LandingFeedRow =
  | {
      kind: Exclude<LandingKind, "recommendation_sent">;
      id: string;
      created_at: string;
      actor: LandingActor;
      film: LandingFilm;
    }
  | {
      kind: "recommendation_sent";
      id: string;
      created_at: string;
      actor: LandingActor;
      film: LandingFilm;
      recipient: { username: string };
    }
  | {
      kind: "system";
      id: string;
      created_at: string;
      event: SystemFeedEvent;
    };

/**
 * Public landing-page feed: latest film-centric activity with real usernames,
 * composed with recent system feed events (price drops, new films, etc. —
 * see lib/feed-events) via the same date-seeded composeFeed used on /home.
 * Service-role only — called through the cached wrapper in
 * lib/supabase/cached.ts. Over-fetches 3× limit to survive dropped rows.
 */
export async function getLandingFeed(client: Client, limit = 5): Promise<LandingFeedRow[]> {
  const [activityRes, systemEvents] = await Promise.all([
    client
      .from("activity")
      .select("id, kind, payload, created_at, actor_user_id")
      .in("kind", [...LANDING_KINDS])
      .order("created_at", { ascending: false })
      .limit(limit * 3),
    getRecentSystemEvents(client, limit * 3),
  ]);
  if (activityRes.error) throw activityRes.error;
  const raw = activityRes.data ?? [];

  const actorIds = [...new Set(raw.map(r => r.actor_user_id))];
  const payloadOf = (r: { payload: unknown }) =>
    (r.payload ?? {}) as { film_id?: string; to_user_id?: string };
  const filmIds = [
    ...new Set(raw.map(r => payloadOf(r).film_id).filter((v): v is string => Boolean(v))),
  ];
  const recipientIds = [
    ...new Set(
      raw
        .filter(r => r.kind === "recommendation_sent")
        .map(r => payloadOf(r).to_user_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  if (actorIds.length === 0 && filmIds.length === 0 && systemEvents.length === 0) return [];

  const allProfileIds = [...new Set([...actorIds, ...recipientIds])];
  const [profilesRes, filmsRes] = await Promise.all([
    allProfileIds.length
      ? client
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", allProfileIds)
      : Promise.resolve({ data: [] as Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>, error: null }),
    filmIds.length
      ? client
          .from("films")
          .select("id, title, artwork_url")
          .in("id", filmIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; artwork_url: string | null }>, error: null }),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (filmsRes.error) throw filmsRes.error;

  const profileMap = new Map(
    (profilesRes.data ?? []).map(p => [p.id, p]),
  );
  const filmMap = new Map(
    (filmsRes.data ?? []).map(f => [f.id, f]),
  );

  const out: LandingFeedRow[] = [];
  for (const r of raw) {
    const payload = payloadOf(r);
    const profile = profileMap.get(r.actor_user_id);
    const filmRow = payload.film_id ? filmMap.get(payload.film_id) : undefined;
    if (!profile || !filmRow) continue;
    const actor: LandingActor = {
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
    };
    const film: LandingFilm = {
      id: filmRow.id,
      title: filmRow.title,
      artwork_url: filmRow.artwork_url,
    };
    if (r.kind === "recommendation_sent") {
      const recipient = payload.to_user_id ? profileMap.get(payload.to_user_id) : undefined;
      if (!recipient) continue;
      out.push({
        kind: "recommendation_sent",
        id: r.id,
        created_at: r.created_at,
        actor,
        film,
        recipient: { username: recipient.username },
      });
    } else {
      out.push({
        kind: r.kind as Exclude<LandingKind, "recommendation_sent">,
        id: r.id,
        created_at: r.created_at,
        actor,
        film,
      });
    }
  }

  out.sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1,
  );

  const dateSeed = new Date().toISOString().slice(0, 10);
  const composed = composeFeed(out, systemEvents, dateSeed, (row) => row.created_at);
  const merged: LandingFeedRow[] = composed.map(c =>
    c.type === "system"
      ? { kind: "system", id: c.event.id, created_at: c.event.created_at, event: c.event }
      : c.item,
  );
  return merged.slice(0, limit);
}
