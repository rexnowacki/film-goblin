import { describe, it, expect } from "vitest";
import { resolvePitTiers, PIT_FULL_CARD_WINDOW } from "../../lib/feed-events/pitCadence";
import { getPitKicker } from "../../lib/feed-events/tier";
import type { SystemFeedEvent } from "../../lib/feed-events/types";
import type { ComposedItem } from "../../lib/feed-events/compose";
import type { FeedEventType } from "../../lib/feed-events/copy";

function makeEvent(id: string, type: FeedEventType): SystemFeedEvent {
  return { id, event_type: type, film_id: null, payload: {}, copy: "x", priority: 0, created_at: "2026-07-07T00:00:00Z", film: null };
}
function sysItem(id: string, type: FeedEventType): ComposedItem<{ id: string }> {
  return { type: "system", event: makeEvent(id, type) };
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

  it("demotes a full candidate at the tightest gap that must still be demoted", () => {
    // b's counter value when reached is (number of user items) + 1. The
    // boundary test above uses PIT_FULL_CARD_WINDOW (8) user items, giving
    // b a counter of 9 — comfortably kept, but not the tightest possible
    // edge. The true edge is PIT_FULL_CARD_WINDOW - 2 (6) user items,
    // giving b a counter of 7 (7 < 8 -> demoted) — one less user item than
    // this would give a counter of 8 (kept, per the test above). Together
    // the two tests bracket the exact index where the comparison flips.
    const items = [
      sysItem("a", "all_time_low"),
      ...Array.from({ length: PIT_FULL_CARD_WINDOW - 2 }, (_, i) => userItem(`u${i}`)),
      sysItem("b", "all_time_low"),
    ];
    const out = resolvePitTiers(items);
    expect(out.get("a")).toBe("full");
    expect(out.get("b")).toBe("standard");
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

  it("end-to-end: a demoted full card's resolved tier renders the LEDGER ECHO kicker", () => {
    // Chains resolvePitTiers's output directly into getPitKicker, the way
    // SystemEventRow/LandingFeedCard actually do — tier.test.ts proves
    // getPitKicker(event, "standard") === "LEDGER ECHO" in isolation, and
    // the tests above prove demotion happens, but nothing previously
    // threaded one into the other.
    const bEvent = makeEvent("b", "all_time_low");
    const items = [
      sysItem("a", "all_time_low"),
      ...Array.from({ length: 3 }, (_, i) => userItem(`u${i}`)),
      { type: "system" as const, event: bEvent },
    ];
    const out = resolvePitTiers(items);
    const resolvedTier = out.get("b")!;
    expect(resolvedTier).toBe("standard");
    expect(getPitKicker(bEvent, resolvedTier)).toBe("LEDGER ECHO");
  });
});
