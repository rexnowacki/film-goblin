// Age-based eligibility for FROM THE PIT (spec 2026-07-09-pit-aging-ttl).
// A pure selection-side filter used only by getEligiblePitEventsForUser
// (the signed-in path) -- deliberately NOT applied in getRecentSystemEvents,
// which also feeds the un-aged anonymous landing page.
import type { SystemFeedEvent } from "./types";

export const PIT_FRESH_HOURS = 24;
export const PIT_AGING_HOURS = 48;

export type PitAgeTier = "fresh" | "aging" | "stale";

// Rolling hours from created_at, upper-bound-exclusive: exactly
// PIT_FRESH_HOURS old is "aging", exactly PIT_AGING_HOURS old is "stale".
// `now` is injected for testability.
export function classifyPitEventAge(createdAt: string, now: Date): PitAgeTier {
  const ageHours = (now.getTime() - new Date(createdAt).getTime()) / 3_600_000;
  if (ageHours < PIT_FRESH_HOURS) return "fresh";
  if (ageHours < PIT_AGING_HOURS) return "aging";
  return "stale";
}

// fresh -> always kept; stale -> always dropped; aging -> kept only when the
// event's film is on the watchlist. Builds its own Set (signature mirrors
// rankPitCandidatesByWatchlist), so the call site passes the same
// watchlistFilmIds array to both. Never mutates input.
export function filterPitByAge(
  events: SystemFeedEvent[],
  watchlistFilmIds: string[],
  now: Date,
): SystemFeedEvent[] {
  const watchlist = new Set(watchlistFilmIds);
  return events.filter(e => {
    const tier = classifyPitEventAge(e.created_at, now);
    if (tier === "fresh") return true;
    if (tier === "stale") return false;
    return e.film_id != null && watchlist.has(e.film_id);
  });
}
