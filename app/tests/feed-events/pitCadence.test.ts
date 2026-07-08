import { describe, it, expect } from "vitest";
import { resolvePitTiers, PIT_FULL_CARD_WINDOW } from "../../lib/feed-events/pitCadence";
import type { SystemFeedEvent } from "../../lib/feed-events/types";
import type { ComposedItem } from "../../lib/feed-events/compose";
import type { FeedEventType } from "../../lib/feed-events/copy";

function sysItem(id: string, type: FeedEventType): ComposedItem<{ id: string }> {
  const event: SystemFeedEvent = { id, event_type: type, film_id: null, payload: {}, copy: "x", priority: 0, created_at: "2026-07-07T00:00:00Z", film: null };
  return { type: "system", event };
}
function userItem(id: string): ComposedItem<{ id: string }> {
  return { type: "user", item: { id } };
}

describe("resolvePitTiers", () => {
  it("keeps a single full-tier event as full", () => {
    const out = resolvePitTiers([sysItem("a", "all_time_low")]);
    expect(out.get("a")).toBe("full");
  });

  it("demotes a second full candidate inside the 8-item window", () => {
    const items = [
      sysItem("a", "all_time_low"),
      ...Array.from({ length: 3 }, (_, i) => userItem(`u${i}`)),
      sysItem("b", "all_time_low"), // 4 items after a — inside window
    ];
    const out = resolvePitTiers(items);
    expect(out.get("a")).toBe("full");
    expect(out.get("b")).toBe("standard");
  });

  it("keeps a full candidate that lands exactly at the window boundary", () => {
    const items = [
      sysItem("a", "all_time_low"),
      ...Array.from({ length: PIT_FULL_CARD_WINDOW }, (_, i) => userItem(`u${i}`)),
      sysItem("b", "all_time_low"), // exactly PIT_FULL_CARD_WINDOW items after a
    ];
    const out = resolvePitTiers(items);
    expect(out.get("a")).toBe("full");
    expect(out.get("b")).toBe("full");
  });

  it("counts user items toward the window gap, not just system items", () => {
    const items = [
      sysItem("a", "all_time_low"),
      ...Array.from({ length: 2 }, (_, i) => userItem(`u${i}`)),
      sysItem("b", "all_time_low"), // 3 items after a — inside window despite most being user rows
    ];
    const out = resolvePitTiers(items);
    expect(out.get("b")).toBe("standard");
  });

  it("never demotes whisper or standard tiers", () => {
    const items = [sysItem("a", "all_time_low"), sysItem("b", "price_rise"), sysItem("c", "now_free")];
    const out = resolvePitTiers(items);
    expect(out.get("b")).toBe("whisper");
    expect(out.get("c")).toBe("standard");
  });

  it("handles an all-system feed with no user items", () => {
    const items = [sysItem("a", "all_time_low"), sysItem("b", "all_time_low"), sysItem("c", "all_time_low")];
    const out = resolvePitTiers(items);
    expect(out.get("a")).toBe("full");
    expect(out.get("b")).toBe("standard");
    expect(out.get("c")).toBe("standard");
  });

  it("returns an empty map for an empty feed", () => {
    expect(resolvePitTiers([]).size).toBe(0);
  });
});
