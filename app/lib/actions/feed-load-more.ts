"use server";

import { createClient } from "@/lib/supabase/server";
import { getEnrichedActivity, type EnrichedActivity, type FeedFilters } from "@/lib/queries/activity";

export interface LoadMoreFeedArgs {
  before: string;            // cursor — return rows strictly older than this ISO timestamp
  actorId?: string;
  filmId?: string;
  kinds?: string[];          // when set, restrict to these activity kinds
  limit?: number;            // default 20
}

export interface LoadMoreFeedResult {
  items: EnrichedActivity[];
  nextCursor: string | null; // null when no more rows
  done: boolean;             // true when this was the final page
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Load the next page of feed activity for the signed-in user. Cursor is
 * the `created_at` of the last item the client already has; the server
 * returns rows strictly older than that timestamp.
 *
 * `done` is true when the returned page is shorter than `limit` — the
 * client uses that to stop the IntersectionObserver loop.
 */
export async function loadMoreFeed(args: LoadMoreFeedArgs): Promise<LoadMoreFeedResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { items: [], nextCursor: null, done: true };

  const limit = args.limit ?? 20;
  const opts: FeedFilters = {
    limit,
    before: args.before,
    actorId: args.actorId && UUID_RE.test(args.actorId) ? args.actorId : undefined,
    filmId: args.filmId && UUID_RE.test(args.filmId) ? args.filmId : undefined,
    kinds: args.kinds?.length ? args.kinds : undefined,
  };
  const page = await getEnrichedActivity(supabase, user.id, opts);
  return {
    items: page.items,
    nextCursor: page.nextCursor,
    done: page.done,
  };
}
