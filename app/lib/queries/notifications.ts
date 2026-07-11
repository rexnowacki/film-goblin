import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { groupNotifications } from "./group-notifications";

type Client = SupabaseClient<Database>;

export type NotificationKind = Database["public"]["Enums"]["notification_kind"];

export interface ActorLite {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface FilmLite {
  id: string;
  title: string;
  artwork_url: string;
}

export interface EnrichedNotification {
  id: string;
  kind: NotificationKind;
  created_at: string;
  read_at: string | null;
  actor: ActorLite | null;
  payload: Record<string, unknown>;
  film: FilmLite | null;
}

export interface NotificationGroup {
  key: string;
  actor: ActorLite | null;
  kind: NotificationKind;
  items: EnrichedNotification[];
  count: number;
  latestAt: string;
}

export type NotificationFeedItem =
  | { type: "single"; notification: EnrichedNotification }
  | { type: "group"; group: NotificationGroup };

const RECENT_DAYS = 14;
const RECENT_LIMIT = 50;

const ACTIVE_GAZING_NOTIFICATION_KINDS = new Set<NotificationKind>([
  "gazing_reminder_24h",
  "gazing_reminder_2h",
  "gazing_aftermath",
]);

interface GazingNotificationRef {
  kind: NotificationKind;
  payload: unknown;
}

function gazingInviteId(row: GazingNotificationRef): string | null {
  if (!ACTIVE_GAZING_NOTIFICATION_KINDS.has(row.kind)) return null;
  const inviteId = (row.payload as { invite_id?: unknown } | null)?.invite_id;
  return typeof inviteId === "string" && inviteId.length > 0 ? inviteId : null;
}

async function filterActiveGazingNotifications<T extends GazingNotificationRef>(
  client: Client,
  rows: T[],
): Promise<T[]> {
  const inviteIds = Array.from(new Set(rows.map(gazingInviteId).filter((id): id is string => Boolean(id))));
  if (inviteIds.length === 0) {
    return rows.filter(row => !ACTIVE_GAZING_NOTIFICATION_KINDS.has(row.kind));
  }

  const { data, error } = await client
    .from("gazing_invites")
    .select("id")
    .in("id", inviteIds)
    .neq("status", "cancelled");
  if (error) throw error;
  const activeInviteIds = new Set((data ?? []).map(invite => invite.id));

  return rows.filter(row => {
    if (!ACTIVE_GAZING_NOTIFICATION_KINDS.has(row.kind)) return true;
    const inviteId = gazingInviteId(row);
    return inviteId != null && activeInviteIds.has(inviteId);
  });
}

export async function getUnreadNotificationCount(client: Client, userId: string): Promise<number> {
  const { data, error } = await client
    .from("notifications")
    .select("kind, payload")
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
  return (await filterActiveGazingNotifications(client, data ?? [])).length;
}

export async function getRecentNotifications(client: Client, userId: string): Promise<NotificationFeedItem[]> {
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("notifications")
    .select("id, kind, created_at, read_at, actor_user_id, payload")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);
  if (error) throw error;
  const rows = await filterActiveGazingNotifications(client, data ?? []);
  if (rows.length === 0) return [];

  const actorIds = Array.from(new Set(rows.map(r => r.actor_user_id).filter((x): x is string => Boolean(x))));
  const filmIds = Array.from(new Set(
    rows
      .map(r => (r.payload as { film_id?: string } | null)?.film_id)
      .filter((x): x is string => Boolean(x))
  ));

  const [actorsRes, filmsRes] = await Promise.all([
    actorIds.length === 0
      ? Promise.resolve({ data: [], error: null as null })
      : client.from("profiles").select("id, username, display_name, avatar_url").in("id", actorIds),
    filmIds.length === 0
      ? Promise.resolve({ data: [], error: null as null })
      : client.from("films").select("id, title, artwork_url").in("id", filmIds),
  ]);
  if (actorsRes.error) throw actorsRes.error;
  if (filmsRes.error) throw filmsRes.error;

  const actorById = new Map((actorsRes.data ?? []).map(a => [a.id, a]));
  const filmById = new Map((filmsRes.data ?? []).map(f => [f.id, f]));

  const enriched: EnrichedNotification[] = rows.map(r => {
    const actor = r.actor_user_id ? actorById.get(r.actor_user_id) ?? null : null;
    const filmId = (r.payload as { film_id?: string } | null)?.film_id;
    const film = filmId ? filmById.get(filmId) ?? null : null;
    return {
      id: r.id,
      kind: r.kind,
      created_at: r.created_at,
      read_at: r.read_at,
      actor: actor
        ? { id: actor.id, username: actor.username, display_name: actor.display_name, avatar_url: actor.avatar_url }
        : null,
      payload: (r.payload ?? {}) as Record<string, unknown>,
      film,
    };
  });

  return groupNotifications(enriched);
}
