import { describe, it, expect } from "vitest";
import { enforcePitPositionRules, PIT_FIRST_SCREEN_WINDOW, PIT_MIN_GAP } from "../../lib/feed-events/pitPosition";
import type { SystemFeedEvent } from "../../lib/feed-events/types";
import type { ComposedItem } from "../../lib/feed-events/compose";

function sysItem(id: string): ComposedItem<{ id: string }> {
  const event: SystemFeedEvent = { id, event_type: "price_drop", film_id: null, payload: {}, copy: "x", priority: 90, created_at: "2026-07-08T00:00:00Z", film: null };
  return { type: "system", event };
}
function userItem(id: string): ComposedItem<{ id: string }> {
  return { type: "user", item: { id } };
}
function ids(items: Array<ComposedItem<{ id: string }>>): string[] {
  return items.map(i => i.type === "system" ? i.event.id : i.item.id);
}

describe("enforcePitPositionRules", () => {
  it("keeps a single Pit item within the first-screen window", () => {
    const items = [userItem("u0"), sysItem("s0"), userItem("u1")];
    expect(ids(enforcePitPositionRules(items))).toEqual(["u0", "s0", "u1"]);
  });

  it("drops a second Pit item that lands inside the first-screen window", () => {
    // positions 0..5 = first screen. Two system items both land inside it.
    const items = [userItem("u0"), sysItem("s0"), userItem("u1"), sysItem("s1"), userItem("u2")];
    const out = enforcePitPositionRules(items);
    expect(ids(out)).toEqual(["u0", "s0", "u1", "u2"]); // s1 dropped
  });

  it("allows a second Pit item once it lands outside the first-screen window, respecting min-gap", () => {
    const items = [
      sysItem("s0"),                                    // pos 0 (first screen, kept)
      ...Array.from({ length: 6 }, (_, i) => userItem(`u${i}`)), // pos 1..6, pushes past first-screen window
      sysItem("s1"),                                     // pos 7 (outside first-screen window; gap since s0 is 6 user items, well over PIT_MIN_GAP)
    ];
    const out = enforcePitPositionRules(items);
    expect(ids(out)).toContain("s1");
  });

  it(`drops a Pit item fewer than ${PIT_MIN_GAP} user items after a kept Pit item, even outside the first screen`, () => {
    const items = [
      sysItem("s0"),
      ...Array.from({ length: 10 }, (_, i) => userItem(`u${i}`)), // clears first-screen window
      sysItem("s1"), // immediately after s0's window clears, but only 1 user item follows before s2
      userItem("gap"),
      sysItem("s2"), // only 1 user item ("gap") since s1 -- fewer than PIT_MIN_GAP (2)
    ];
    const out = enforcePitPositionRules(items);
    const kept = ids(out);
    expect(kept).toContain("s1");
    expect(kept).not.toContain("s2");
  });

  it("keeps a Pit item exactly PIT_MIN_GAP user items after the previous kept Pit item", () => {
    const items = [
      sysItem("s0"),
      ...Array.from({ length: 10 }, (_, i) => userItem(`u${i}`)),
      sysItem("s1"),
      ...Array.from({ length: PIT_MIN_GAP }, (_, i) => userItem(`gap${i}`)),
      sysItem("s2"),
    ];
    const out = enforcePitPositionRules(items);
    expect(ids(out)).toContain("s2");
  });

  it("applies the min-gap rule uniformly regardless of tier (whisper events are not exempt)", () => {
    // enforcePitPositionRules has no concept of tier at all -- it only sees
    // ComposedItem's user/system discriminant. This test documents that a
    // system item is a system item for position purposes, full stop.
    const items = [sysItem("s0"), userItem("u0"), sysItem("s1")];
    const out = enforcePitPositionRules(items);
    expect(ids(out)).toEqual(["s0", "u0"]); // s1 dropped: only 1 user item between them, gap < PIT_MIN_GAP
  });

  it("never drops user items", () => {
    const items = [sysItem("s0"), sysItem("s1"), sysItem("s2"), userItem("u0")];
    const out = enforcePitPositionRules(items);
    expect(ids(out)).toContain("u0");
  });

  it("handles an empty feed", () => {
    expect(enforcePitPositionRules([])).toEqual([]);
  });

  it("handles an all-system feed (no user items to satisfy any gap)", () => {
    const items = [sysItem("s0"), sysItem("s1"), sysItem("s2")];
    const out = enforcePitPositionRules(items);
    expect(ids(out)).toEqual(["s0"]); // only the first survives -- first-screen cap AND min-gap both violated for s1/s2
  });
});
