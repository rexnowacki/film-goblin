import { describe, it, expect, vi } from "vitest";
import { getReactionsForActivities } from "@/lib/queries/activity-reactions";

function makeClient(rows: { activity_id: string; user_id: string }[]) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    }),
  } as any;
}

describe("getReactionsForActivities", () => {
  it("aggregates counts per activity and flags likedByMe for the viewer", async () => {
    const client = makeClient([
      { activity_id: "a1", user_id: "u1" },
      { activity_id: "a1", user_id: "u2" },
      { activity_id: "a1", user_id: "viewer" },
      { activity_id: "a2", user_id: "u1" },
      { activity_id: "a3", user_id: "u3" },
    ]);
    const map = await getReactionsForActivities(client, ["a1", "a2", "a3"], "viewer");
    expect(map.get("a1")).toEqual({ count: 3, likedByMe: true });
    expect(map.get("a2")).toEqual({ count: 1, likedByMe: false });
    expect(map.get("a3")).toEqual({ count: 1, likedByMe: false });
  });

  it("flags likedByMe=false for every row when viewer has no reactions", async () => {
    const client = makeClient([
      { activity_id: "a1", user_id: "u1" },
      { activity_id: "a2", user_id: "u2" },
    ]);
    const map = await getReactionsForActivities(client, ["a1", "a2"], "viewer");
    expect(map.get("a1")?.likedByMe).toBe(false);
    expect(map.get("a2")?.likedByMe).toBe(false);
  });

  it("returns empty Map without hitting the DB when activityIds is empty", async () => {
    const fromSpy = vi.fn();
    const client = { from: fromSpy } as any;
    const map = await getReactionsForActivities(client, [], "viewer");
    expect(map.size).toBe(0);
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
