import { describe, it, expect, vi } from "vitest";
import { getRelationshipMap } from "@/lib/queries/coven";

function makeClient(rows: any[]) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  return {
    from: vi.fn().mockReturnValue(builder),
    _builder: builder,
  } as any;
}

describe("getRelationshipMap", () => {
  it("returns an empty map when profileIds is empty (no query)", async () => {
    const client = makeClient([]);
    const map = await getRelationshipMap(client, "me", []);
    expect(map.size).toBe(0);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("classifies outgoing requests under the to_user_id key", async () => {
    const client = makeClient([
      { id: "r1", from_user_id: "me", to_user_id: "alice", status: "pending" },
    ]);
    const map = await getRelationshipMap(client, "me", ["alice"]);
    expect(map.size).toBe(1);
    expect(map.get("alice")).toEqual({ state: "pending_outbound", requestId: "r1" });
  });

  it("classifies incoming requests under the from_user_id key", async () => {
    const client = makeClient([
      { id: "r2", from_user_id: "bob", to_user_id: "me", status: "pending" },
    ]);
    const map = await getRelationshipMap(client, "me", ["bob"]);
    expect(map.size).toBe(1);
    expect(map.get("bob")).toEqual({ state: "pending_inbound", requestId: "r2" });
  });

  it("handles a mix of outgoing and incoming for different users", async () => {
    const client = makeClient([
      { id: "r1", from_user_id: "me", to_user_id: "alice", status: "pending" },
      { id: "r2", from_user_id: "bob", to_user_id: "me", status: "pending" },
    ]);
    const map = await getRelationshipMap(client, "me", ["alice", "bob"]);
    expect(map.size).toBe(2);
    expect(map.get("alice")).toEqual({ state: "pending_outbound", requestId: "r1" });
    expect(map.get("bob")).toEqual({ state: "pending_inbound", requestId: "r2" });
  });

  it("constructs the or() filter with both directions and the id list", async () => {
    const client = makeClient([]);
    await getRelationshipMap(client, "me", ["alice", "bob"]);
    expect(client._builder.or).toHaveBeenCalledWith(
      "and(from_user_id.eq.me,to_user_id.in.(alice,bob)),and(to_user_id.eq.me,from_user_id.in.(alice,bob))",
    );
  });
});
