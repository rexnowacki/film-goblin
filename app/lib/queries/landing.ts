import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

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

const PRICE_DROP_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

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
      kind: "price_drop";
      id: string;
      created_at: string;
      film: LandingFilm;
      newPriceUsd: number;
      pctOff: number;
    };

/**
 * Public landing-page feed: latest film-centric activity with real usernames,
 * plus the most recent site-wide price drop (≤14 days old) spliced in by
 * timestamp. Service-role only — called through the cached wrapper in
 * lib/supabase/cached.ts. Over-fetches 3× limit to survive dropped rows.
 */
export async function getLandingFeed(client: Client, limit = 5): Promise<LandingFeedRow[]> {
  const [activityRes, alertRes] = await Promise.all([
    client
      .from("activity")
      .select("id, kind, payload, created_at, actor_user_id")
      .in("kind", [...LANDING_KINDS])
      .order("created_at", { ascending: false })
      .limit(limit * 3),
    client
      .from("price_alerts")
      .select("id, film_id, old_price_usd, new_price_usd, created_at")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (activityRes.error) throw activityRes.error;
  if (alertRes.error) throw alertRes.error;
  const raw = activityRes.data ?? [];

  const alertRow = (alertRes.data ?? [])[0] ?? null;
  const oldPrice = alertRow ? Number(alertRow.old_price_usd) : 0;
  const newPrice = alertRow ? Number(alertRow.new_price_usd) : 0;
  const alert =
    alertRow &&
    Date.now() - new Date(alertRow.created_at).getTime() <= PRICE_DROP_MAX_AGE_MS &&
    oldPrice > newPrice
      ? alertRow
      : null;

  const actorIds = [...new Set(raw.map(r => r.actor_user_id))];
  const payloadOf = (r: { payload: unknown }) =>
    (r.payload ?? {}) as { film_id?: string; to_user_id?: string };
  const filmIds = [
    ...new Set([
      ...raw.map(r => payloadOf(r).film_id).filter((v): v is string => Boolean(v)),
      ...(alert ? [alert.film_id] : []),
    ]),
  ];
  const recipientIds = [
    ...new Set(
      raw
        .filter(r => r.kind === "recommendation_sent")
        .map(r => payloadOf(r).to_user_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  if (actorIds.length === 0 && filmIds.length === 0) return [];

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

  if (alert) {
    const filmRow = filmMap.get(alert.film_id);
    if (filmRow) {
      out.push({
        kind: "price_drop",
        id: alert.id,
        created_at: alert.created_at,
        film: { id: filmRow.id, title: filmRow.title, artwork_url: filmRow.artwork_url },
        newPriceUsd: newPrice,
        pctOff: Math.round((1 - newPrice / oldPrice) * 100),
      });
    }
  }

  out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return out.slice(0, limit);
}
