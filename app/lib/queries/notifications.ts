import type { Database } from "../supabase/types";

export type NotificationKind = Database["public"]["Enums"]["notification_kind"];

export interface ActorLite {
  id: string;
  handle: string;
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
  notifKind: NotificationKind;
  items: EnrichedNotification[];
  count: number;
  latestAt: string;
}

export type NotificationFeedItem =
  | { kind: "single"; notification: EnrichedNotification }
  | { kind: "group"; group: NotificationGroup };
