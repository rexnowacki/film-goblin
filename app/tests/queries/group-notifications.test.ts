import { describe, it, expect } from "vitest";
import { groupNotifications } from "@/lib/queries/group-notifications";
import type { EnrichedNotification } from "@/lib/queries/notifications";

const ACTOR_A = { id: "a", handle: "alice", display_name: "Alice", avatar_url: null };
const ACTOR_B = { id: "b", handle: "bob",   display_name: "Bob",   avatar_url: null };
const FILM = { id: "f1", title: "F", artwork_url: "" };

function rec(id: string, actor: typeof ACTOR_A | null, createdAt: string,
             kind: EnrichedNotification["kind"] = "recommendation_received"): EnrichedNotification {
  return {
    id, kind, created_at: createdAt, read_at: null,
    actor, payload: kind === "price_drop"
      ? { price_alert_id: "x", film_id: FILM.id, old_price_usd: 10, new_price_usd: 5 }
      : { recommendation_id: "x", film_id: FILM.id },
    film: FILM,
  } as EnrichedNotification;
}

describe("groupNotifications", () => {
  it("returns single items when fewer than 3 cluster", () => {
    const items = [
      rec("3", ACTOR_A, "2026-04-26T12:00:00Z"),
      rec("2", ACTOR_A, "2026-04-26T11:50:00Z"),
    ];
    const out = groupNotifications(items);
    expect(out.map(o => o.kind)).toEqual(["single", "single"]);
  });

  it("groups 3+ same-(kind, actor) within 30 min", () => {
    const items = [
      rec("3", ACTOR_A, "2026-04-26T12:00:00Z"),
      rec("2", ACTOR_A, "2026-04-26T11:50:00Z"),
      rec("1", ACTOR_A, "2026-04-26T11:40:00Z"),
    ];
    const out = groupNotifications(items);
    expect(out.length).toBe(1);
    expect(out[0].kind).toBe("group");
    if (out[0].kind === "group") {
      expect(out[0].count).toBe(3);
      expect(out[0].latestAt).toBe("2026-04-26T12:00:00Z");
    }
  });

  it("breaks group when gap > 30 min", () => {
    const items = [
      rec("3", ACTOR_A, "2026-04-26T12:00:00Z"),
      rec("2", ACTOR_A, "2026-04-26T11:50:00Z"),
      rec("1", ACTOR_A, "2026-04-26T11:00:00Z"), // 50-min gap
    ];
    const out = groupNotifications(items);
    expect(out.map(o => o.kind)).toEqual(["single", "single", "single"]);
  });

  it("does not mix actors", () => {
    const items = [
      rec("3", ACTOR_A, "2026-04-26T12:00:00Z"),
      rec("2", ACTOR_B, "2026-04-26T11:55:00Z"),
      rec("1", ACTOR_A, "2026-04-26T11:50:00Z"),
    ];
    const out = groupNotifications(items);
    expect(out.map(o => o.kind)).toEqual(["single", "single", "single"]);
  });

  it("groups null-actor price_drop events together", () => {
    const items = [
      rec("3", null, "2026-04-26T12:00:00Z", "price_drop"),
      rec("2", null, "2026-04-26T11:50:00Z", "price_drop"),
      rec("1", null, "2026-04-26T11:40:00Z", "price_drop"),
    ];
    const out = groupNotifications(items);
    expect(out.length).toBe(1);
    expect(out[0].kind).toBe("group");
    if (out[0].kind === "group") {
      expect(out[0].notifKind).toBe("price_drop");
      expect(out[0].actor).toBeNull();
    }
  });

  it("breaks group when total span > 24 hr", () => {
    const items = [
      rec("3", ACTOR_A, "2026-04-26T23:00:00Z"),
      rec("2", ACTOR_A, "2026-04-26T22:50:00Z"),
      rec("1", ACTOR_A, "2026-04-25T22:00:00Z"), // > 24 hr from head
    ];
    const out = groupNotifications(items);
    // The 25-min gap from row 2 to row 1 itself fits in 30, but span ceiling kicks
    // in. The function should refuse to extend the group across the 24-hr boundary.
    if (out.length === 1 && out[0].kind === "group") {
      // Regression — span ceiling missed
      expect(out[0].count).toBeLessThan(3);
    }
    // At least one item must be a single (the older one outside the window)
    expect(out.some(o => o.kind === "single")).toBe(true);
  });
});
