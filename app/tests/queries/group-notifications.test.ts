import { describe, it, expect } from "vitest";
import { groupNotifications } from "@/lib/queries/group-notifications";
import type { EnrichedNotification, NotificationKind } from "@/lib/queries/notifications";

const ACTOR_A = { id: "a", handle: "alice", display_name: "Alice", avatar_url: null };
const ACTOR_B = { id: "b", handle: "bob",   display_name: "Bob",   avatar_url: null };
const FILM = { id: "f1", title: "F", artwork_url: "" };

function rec(
  id: string,
  actor: typeof ACTOR_A | null,
  createdAt: string,
  kind: NotificationKind = "recommendation_received",
): EnrichedNotification {
  return {
    id, kind, created_at: createdAt, read_at: null,
    actor,
    payload: kind === "price_drop"
      ? { price_alert_id: "x", film_id: FILM.id, old_price_usd: 10, new_price_usd: 5 }
      : { recommendation_id: "x", film_id: FILM.id },
    film: FILM,
  };
}

describe("groupNotifications", () => {
  it("returns empty array for empty input", () => {
    expect(groupNotifications([])).toEqual([]);
  });

  it("passes a single item through as a single", () => {
    const out = groupNotifications([rec("1", ACTOR_A, "2026-04-26T12:00:00Z")]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("single");
  });

  it("returns single items when fewer than 3 cluster", () => {
    const items = [
      rec("3", ACTOR_A, "2026-04-26T12:00:00Z"),
      rec("2", ACTOR_A, "2026-04-26T11:50:00Z"),
    ];
    const out = groupNotifications(items);
    expect(out.map(o => o.type)).toEqual(["single", "single"]);
  });

  it("groups exactly 3 same-(kind, actor) within 30 min", () => {
    const items = [
      rec("3", ACTOR_A, "2026-04-26T12:00:00Z"),
      rec("2", ACTOR_A, "2026-04-26T11:50:00Z"),
      rec("1", ACTOR_A, "2026-04-26T11:40:00Z"),
    ];
    const out = groupNotifications(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("group");
    if (out[0].type === "group") {
      expect(out[0].group.count).toBe(3);
      expect(out[0].group.latestAt).toBe("2026-04-26T12:00:00Z");
      expect(out[0].group.kind).toBe("recommendation_received");
    }
  });

  it("breaks group when gap > 30 min", () => {
    const items = [
      rec("3", ACTOR_A, "2026-04-26T12:00:00Z"),
      rec("2", ACTOR_A, "2026-04-26T11:50:00Z"),
      rec("1", ACTOR_A, "2026-04-26T11:00:00Z"), // 50-min gap from prior
    ];
    const out = groupNotifications(items);
    expect(out.map(o => o.type)).toEqual(["single", "single", "single"]);
  });

  it("does not mix actors", () => {
    const items = [
      rec("3", ACTOR_A, "2026-04-26T12:00:00Z"),
      rec("2", ACTOR_B, "2026-04-26T11:55:00Z"),
      rec("1", ACTOR_A, "2026-04-26T11:50:00Z"),
    ];
    const out = groupNotifications(items);
    expect(out.map(o => o.type)).toEqual(["single", "single", "single"]);
  });

  it("does not group across different kinds for the same actor", () => {
    const items = [
      rec("3", ACTOR_A, "2026-04-26T12:00:00Z", "recommendation_received"),
      rec("2", ACTOR_A, "2026-04-26T11:55:00Z", "coven_invite_pending"),
      rec("1", ACTOR_A, "2026-04-26T11:50:00Z", "recommendation_received"),
    ];
    const out = groupNotifications(items);
    expect(out.map(o => o.type)).toEqual(["single", "single", "single"]);
  });

  it("groups null-actor price_drop events together", () => {
    const items = [
      rec("3", null, "2026-04-26T12:00:00Z", "price_drop"),
      rec("2", null, "2026-04-26T11:50:00Z", "price_drop"),
      rec("1", null, "2026-04-26T11:40:00Z", "price_drop"),
    ];
    const out = groupNotifications(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("group");
    if (out[0].type === "group") {
      expect(out[0].group.kind).toBe("price_drop");
      expect(out[0].group.actor).toBeNull();
    }
  });

  it("breaks group when total span > 24 hr (gap each <30 min)", () => {
    // 56 events 25 min apart spans 56 * 25 = 1400 min ≈ 23h 20m — under the
    // ceiling. 60 events 25 min apart spans 60 * 25 = 1500 min = 25 hr — over
    // the ceiling. Each event-to-event gap is 25 min so the gap check never
    // breaks the run; only the span ceiling can.
    const head = new Date("2026-04-26T23:00:00Z").getTime();
    const items: EnrichedNotification[] = [];
    for (let n = 0; n < 60; n++) {
      const t = new Date(head - n * 25 * 60 * 1000).toISOString();
      items.push(rec(String(60 - n), ACTOR_A, t));
    }
    const out = groupNotifications(items);
    // Span ceiling forces at least one break — we should NOT see a single
    // group of 60. The first group is bounded by the 24-hr ceiling from the
    // head, so it contains at most floor(24*60/25)+1 = 58 events, then the
    // remaining 2 emit as singles (run < MIN_GROUP_SIZE).
    expect(out.length).toBeGreaterThan(1);
    const firstGroup = out.find(o => o.type === "group");
    expect(firstGroup).toBeDefined();
    if (firstGroup && firstGroup.type === "group") {
      expect(firstGroup.group.count).toBeLessThan(60);
    }
  });

  it("group key is stable when newer events join the run on subsequent reads", () => {
    const first = [
      rec("3", ACTOR_A, "2026-04-26T12:00:00Z"),
      rec("2", ACTOR_A, "2026-04-26T11:50:00Z"),
      rec("1", ACTOR_A, "2026-04-26T11:40:00Z"),
    ];
    const second = [
      rec("4", ACTOR_A, "2026-04-26T12:10:00Z"), // new event prepended (newest)
      ...first,
    ];
    const outA = groupNotifications(first);
    const outB = groupNotifications(second);
    expect(outA[0].type).toBe("group");
    expect(outB[0].type).toBe("group");
    if (outA[0].type === "group" && outB[0].type === "group") {
      // Key is anchored on the OLDEST event in the run, so adding a newer
      // event to the head doesn't shift the key.
      expect(outA[0].group.key).toBe(outB[0].group.key);
    }
  });
});
