import type { FeedEventType } from "./copy";
import type { SystemFeedEvent } from "./types";

export const PIT_ARCHIVE_PAGE_SIZE = 30;

export type PitBucket = "deals" | "free" | "catalog" | "hauntings";

// Keep this total mapping beside the archive rather than scattering category
// checks through the client component. Adding a new feed event type must make
// an explicit archive-home decision at compile time.
export const PIT_BUCKETS: Record<FeedEventType, PitBucket> = {
  price_drop: "deals",
  all_time_low: "deals",
  price_rise: "deals",
  now_free: "free",
  left_free: "free",
  new_film: "catalog",
  now_on_apple: "catalog",
  anniversary: "catalog",
  milestone: "catalog",
  verdict_anointed: "catalog",
  goblin_pick: "catalog",
  last_showing: "hauntings",
  now_at_theater: "hauntings",
  full_moon: "hauntings",
  monthly_communion: "hauntings",
};

/** `null` is the archive's unfiltered "Everything" chip. */
export function filterArchiveByBucket(
  events: SystemFeedEvent[],
  bucket: PitBucket | null,
): SystemFeedEvent[] {
  if (bucket === null) return events;
  return events.filter((event) => PIT_BUCKETS[event.event_type] === bucket);
}
