import { describe, it, expect } from "vitest";
import { composeFeed } from "@/lib/feed-events/compose";
import type { SystemFeedEvent } from "@/lib/feed-events/types";

function sys(id: string, type: SystemFeedEvent["event_type"], priority: number, createdAt: string): SystemFeedEvent {
  return { id, event_type: type, film_id: null, payload: {}, copy: id, priority, created_at: createdAt, film: null };
}
function usr(id: string, createdAt: string) {
  return { id, created_at: createdAt };
}
const at = (h: number) => `2026-07-05T${String(h).padStart(2, "0")}:00:00Z`;
const getCreatedAt = (u: { created_at: string }) => u.created_at;

describe("composeFeed", () => {
  it("caps system events at 2:1 against user items", () => {
    const users = [usr("u1", at(10)), usr("u2", at(9))];
    const systems = Array.from({ length: 10 }, (_, i) =>
      sys(`s${i}`, i % 2 ? "price_drop" : "anniversary", 50, at(8 - (i % 8))));
    const out = composeFeed(users, systems, "2026-07-05", getCreatedAt);
    const sysCount = out.filter(o => o.type === "system").length;
    expect(sysCount).toBeLessThanOrEqual(4); // 2 * 2 users
    expect(out.filter(o => o.type === "user")).toHaveLength(2);
  });

  it("caps at 6 system events when there is zero user activity", () => {
    const systems = Array.from({ length: 12 }, (_, i) =>
      sys(`s${i}`, i % 2 ? "price_drop" : "anniversary", 50, at(i % 12)));
    const out = composeFeed([], systems, "2026-07-05", getCreatedAt);
    expect(out).toHaveLength(6);
  });

  it("includes at least one system event when any exist", () => {
    const users = [usr("u1", at(10))];
    const out = composeFeed(users, [sys("s1", "milestone", 50, at(9))], "2026-07-05", getCreatedAt);
    expect(out.some(o => o.type === "system")).toBe(true);
  });

  it("never renders two consecutive system events of the same type", () => {
    const systems = [
      sys("a", "price_drop", 90, at(10)),
      sys("b", "price_drop", 90, at(9)),
      sys("c", "price_drop", 90, at(8)),
      sys("d", "anniversary", 10, at(7)),
    ];
    const out = composeFeed([usr("u1", at(6)), usr("u2", at(5))], systems, "2026-07-05", getCreatedAt);
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1], b = out[i];
      if (a.type === "system" && b.type === "system") {
        expect(a.event.event_type).not.toBe(b.event.event_type);
      }
    }
  });

  it("selects higher-priority system events when over cap", () => {
    const users = [usr("u1", at(10))];
    const systems = [
      sys("low1", "anniversary", 10, at(9)),
      sys("low2", "anniversary", 10, at(8)),
      sys("high", "all_time_low", 100, at(1)),
    ];
    const out = composeFeed(users, systems, "2026-07-05", getCreatedAt); // cap = 2
    const chosen = out.filter(o => o.type === "system").map(o => (o as any).event.id);
    expect(chosen).toContain("high");
  });

  it("is deterministic for the same date seed", () => {
    const users = [usr("u1", at(10)), usr("u2", at(6))];
    const systems = [sys("a", "price_drop", 90, at(9)), sys("b", "milestone", 50, at(7))];
    const run1 = composeFeed(users, systems, "2026-07-05", getCreatedAt).map(o => o.type === "user" ? o.item.id : o.event.id);
    const run2 = composeFeed(users, systems, "2026-07-05", getCreatedAt).map(o => o.type === "user" ? o.item.id : o.event.id);
    expect(run1).toEqual(run2);
  });

  it("spreads a same-burst clump of system events across older user activity (stride cap)", () => {
    // A cron burst: 3 different-type system events, all fired seconds apart
    // and all newer than any real user activity — the exact shape of a
    // real cron run landing while user activity is stale.
    const users = [usr("u1", at(1)), usr("u2", at(0))];
    const systems = [
      sys("s1", "now_free", 85, "2026-07-06T23:27:10Z"),
      sys("s2", "now_at_theater", 65, "2026-07-06T23:26:58Z"),
      sys("s3", "price_rise", 60, "2026-07-06T23:26:53Z"),
    ];
    const out = composeFeed(users, systems, "2026-07-06", getCreatedAt);
    for (let i = 1; i < out.length; i++) {
      if (out[i - 1].type === "system" && out[i].type === "system") {
        throw new Error(`consecutive system rows at ${i - 1}-${i} with a user item still available to break them up`);
      }
    }
    expect(out.filter(o => o.type === "user")).toHaveLength(2);
  });

  it("falls back to allowing consecutive system events only once every user item is placed", () => {
    // 2:1 cap fully maxed (2 users -> 4 systems survive): with only 2 user
    // items to separate 4 system items, one adjacent system pair is
    // mathematically unavoidable — it must land only after both user items
    // have already been placed, never before.
    const users = [usr("u1", at(2)), usr("u2", at(1))];
    const systems = [
      sys("s1", "now_free", 85, at(10)),
      sys("s2", "now_at_theater", 65, at(9)),
      sys("s3", "price_rise", 60, at(8)),
      sys("s4", "left_free", 88, at(7)),
    ];
    const out = composeFeed(users, systems, "2026-07-05", getCreatedAt);
    expect(out.filter(o => o.type === "system")).toHaveLength(4);
    const lastUserIndex = out.map(o => o.type).lastIndexOf("user");
    for (let i = 1; i <= lastUserIndex; i++) {
      if (out[i - 1].type === "system" && out[i].type === "system") {
        throw new Error(`consecutive system rows at ${i - 1}-${i} before every user item was placed`);
      }
    }
  });
});
