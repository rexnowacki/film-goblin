import type { FeedEventType } from "./copy";

export interface SystemFeedEvent {
  id: string;
  event_type: FeedEventType;
  film_id: string | null;
  payload: Record<string, unknown>;
  copy: string;
  priority: number;
  created_at: string;
  film: { id: string; title: string; artwork_url: string | null } | null;
}
