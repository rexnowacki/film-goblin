import { describe, expect, it } from "vitest";
import { FEED_DISPLAY_TARGET, shouldBackfillFeed } from "@/lib/feed/backfill";

describe("shouldBackfillFeed", () => {
  it("loads another raw page when daily grouping leaves too few rendered cards", () => {
    expect(shouldBackfillFeed({ renderedCount: 2, done: false, loading: false, hasCursor: true, tab: "all" })).toBe(true);
  });

  it("stops once the rendered-card target is met", () => {
    expect(shouldBackfillFeed({ renderedCount: FEED_DISPLAY_TARGET, done: false, loading: false, hasCursor: true, tab: "all" })).toBe(false);
  });

  it("stops while loading or when the raw source is exhausted", () => {
    expect(shouldBackfillFeed({ renderedCount: 2, done: false, loading: true, hasCursor: true, tab: "coven" })).toBe(false);
    expect(shouldBackfillFeed({ renderedCount: 2, done: true, loading: false, hasCursor: false, tab: "coven" })).toBe(false);
  });

  it("never runs on the separately paginated Pit archive", () => {
    expect(shouldBackfillFeed({ renderedCount: 0, done: false, loading: false, hasCursor: true, tab: "pit" })).toBe(false);
  });
});
