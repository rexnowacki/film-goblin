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
});
