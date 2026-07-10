import { describe, expect, it } from "vitest";
import { filterArchiveByBucket, PIT_BUCKETS, type PitBucket } from "@/lib/feed-events/pitArchive";
import type { FeedEventType } from "@/lib/feed-events/copy";
import type { SystemFeedEvent } from "@/lib/feed-events/types";

const assignments: Array<[FeedEventType, PitBucket]> = [
  ["price_drop", "deals"], ["all_time_low", "deals"], ["price_rise", "deals"],
  ["now_free", "free"], ["left_free", "free"],
  ["new_film", "catalog"], ["now_on_apple", "catalog"], ["anniversary", "catalog"],
  ["milestone", "catalog"], ["verdict_anointed", "catalog"], ["goblin_pick", "catalog"],
  ["last_showing", "hauntings"], ["now_at_theater", "hauntings"], ["full_moon", "hauntings"], ["monthly_communion", "hauntings"],
];

function event(id: string, event_type: FeedEventType): SystemFeedEvent {
  return { id, event_type, film_id: null, payload: {}, copy: id, priority: 1, created_at: "2026-07-09T00:00:00Z", film: null };
}

describe("Pit archive buckets", () => {
  it.each(assignments)("assigns %s to %s", (eventType, bucket) => {
    expect(PIT_BUCKETS[eventType]).toBe(bucket);
  });

  it("returns the original list for Everything without mutation", () => {
    const events = [event("a", "price_drop"), event("b", "now_free")];
    expect(filterArchiveByBucket(events, null)).toBe(events);
    expect(events).toHaveLength(2);
  });

  it("filters only the requested bucket and handles an empty archive", () => {
    const events = [event("a", "price_drop"), event("b", "now_free"), event("c", "new_film"), event("d", "full_moon")];
    expect(filterArchiveByBucket(events, "deals").map((item) => item.id)).toEqual(["a"]);
    expect(filterArchiveByBucket(events, "free").map((item) => item.id)).toEqual(["b"]);
    expect(filterArchiveByBucket(events, "catalog").map((item) => item.id)).toEqual(["c"]);
    expect(filterArchiveByBucket(events, "hauntings").map((item) => item.id)).toEqual(["d"]);
    expect(filterArchiveByBucket([], "deals")).toEqual([]);
  });
});
