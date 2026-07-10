// Candidate selection for FROM THE PIT cadence caps (spec
// 2026-07-08-pit-cadence-caps-design.md). getEligiblePitEventsForUser
// filters/boosts/trims BEFORE handing events to the existing, unmodified
// composeFeed -- the boost is a pure pre-processing step (boosted-priority
// copies), never a change to composeFeed's own b.priority - a.priority sort.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SystemFeedEvent } from "./types";
import { getRecentSystemEvents } from "./query";
import { getWatchlistedFilmIds } from "@/lib/queries/watchlists";
import { filterPitByAge } from "./pitAge";
import { bundlePitDigests } from "./pitDigest";

type Client = SupabaseClient<Database>;

export const PIT_DAILY_CAP = 3;
export const PIT_WATCHLIST_BOOST = 1000;

/**
 * Returns boosted-priority COPIES (never mutates input) sorted descending.
 * A flat +1000 on the existing 10-100 priority scale guarantees any
 * watchlist match outranks any non-match, while preserving relative order
 * within each group.
 */
export function rankPitCandidatesByWatchlist(
  events: SystemFeedEvent[],
  watchlistFilmIds: string[],
): SystemFeedEvent[] {
  const watchlist = new Set(watchlistFilmIds);
  return events
    .map(e => watchlist.has(e.film_id ?? "") ? { ...e, priority: e.priority + PIT_WATCHLIST_BOOST } : e)
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Eligible, ranked, cap-trimmed candidates for one signed-in user's feed.
 * feed_events isn't in the generated Database type yet (matches
 * getRecentSystemEvents's own note) -- the `.from` cast is reused via
 * getRecentSystemEvents rather than re-cast here.
 */
export async function getEligiblePitEventsForUser(
  client: Client,
  userId: string,
  limit: number,
): Promise<SystemFeedEvent[]> {
  const { data: impressed, error: impErr } = await client
    .from("pit_impressions")
    .select("event_id, shown_at, digest_key")
    .eq("user_id", userId);
  if (impErr) throw impErr;

  const seenEventIds = new Set((impressed ?? []).map(r => r.event_id));

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const todayCount = new Set(
    (impressed ?? [])
      .filter(r => new Date(r.shown_at) >= dayStart)
      .map(r => r.digest_key ?? r.event_id),
  ).size;

  if (todayCount >= PIT_DAILY_CAP) return [];

  const candidates = (await getRecentSystemEvents(client, limit)).filter(
    e => !seenEventIds.has(e.id),
  );
  if (candidates.length === 0) return [];

  const watchlistFilmIds = await getWatchlistedFilmIds(client, userId);
  const now = new Date();
  const fresh = filterPitByAge(candidates, watchlistFilmIds, now);
  if (fresh.length === 0) return [];
  const bundled = bundlePitDigests(fresh, watchlistFilmIds, now);
  const ranked = rankPitCandidatesByWatchlist(bundled, watchlistFilmIds);

  return ranked.slice(0, PIT_DAILY_CAP - todayCount);
}
