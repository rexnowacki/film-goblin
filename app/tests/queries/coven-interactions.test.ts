import { describe, it, expect, vi } from "vitest";
import { getRankedCovenfolk } from "@/lib/queries/coven-interactions";

// Unit-style: mock the chained PostgREST builder + the getMyCovenMembers
// helper that getRankedCovenfolk delegates to. The sort + aggregation
// logic is what we want to verify; the real DB shape is exercised by
// db/tests/rls/. Faster than testcontainers, no env required.

vi.mock("@/lib/queries/coven", () => ({
  getMyCovenMembers: vi.fn(),
}));

import { getMyCovenMembers } from "@/lib/queries/coven";
const mockedGetMembers = getMyCovenMembers as unknown as ReturnType<typeof vi.fn>;

interface BuilderResult {
  data: unknown[] | null;
  error: null | { message: string };
}

function makeClient(per: { activity?: unknown[]; reactions?: unknown[]; comments?: unknown[] } = {}) {
  function chain(result: BuilderResult) {
    const c: any = {
      select: vi.fn(() => c),
      eq: vi.fn(() => c),
      gte: vi.fn(() => Promise.resolve(result)),
    };
    return c;
  }
  return {
    from: vi.fn((table: string) => {
      if (table === "activity") return chain({ data: per.activity ?? [], error: null });
      if (table === "activity_reactions") return chain({ data: per.reactions ?? [], error: null });
      if (table === "activity_comments") return chain({ data: per.comments ?? [], error: null });
      return chain({ data: [], error: null });
    }),
  } as any;
}

const A = { id: "a", username: "alice", display_name: null, avatar_url: null };
const B = { id: "b", username: "bob", display_name: null, avatar_url: null };
const C = { id: "c", username: "carol", display_name: null, avatar_url: null };
const D = { id: "d", username: "dave", display_name: null, avatar_url: null };

describe("getRankedCovenfolk", () => {
  it("orders by score DESC, alphabetical ASC for ties / zero-score", async () => {
    mockedGetMembers.mockResolvedValueOnce([A, B, C, D]);
    const client = makeClient({
      activity: [
        { payload: { to_user_id: "a" } },
        { payload: { to_user_id: "a" } }, // alice = 2 recs
      ],
      reactions: [
        { activity: { actor_user_id: "b" } }, // bob = 1
      ],
      comments: [
        { activity: { actor_user_id: "c" } }, // carol = 1
      ],
    });
    const ranked = await getRankedCovenfolk(client, "viewer");
    // alice (2) > bob (1) = carol (1) — bob before carol alphabetically — > dave (0)
    expect(ranked.map(r => r.username)).toEqual(["alice", "bob", "carol", "dave"]);
    expect(ranked.map(r => r.score)).toEqual([2, 1, 1, 0]);
  });

  it("zero-score covenfolk fall to alphabetical tail", async () => {
    mockedGetMembers.mockResolvedValueOnce([D, B, A, C]);
    const client = makeClient({});
    const ranked = await getRankedCovenfolk(client, "viewer");
    expect(ranked.map(r => r.username)).toEqual(["alice", "bob", "carol", "dave"]);
    expect(ranked.every(r => r.score === 0)).toBe(true);
  });

  it("ignores activity from non-coven counterparts", async () => {
    mockedGetMembers.mockResolvedValueOnce([A]);
    const client = makeClient({
      activity: [
        { payload: { to_user_id: "a" } },         // counts
        { payload: { to_user_id: "stranger" } },  // ignored — not in coven
      ],
      reactions: [{ activity: { actor_user_id: "stranger" } }], // ignored
    });
    const ranked = await getRankedCovenfolk(client, "viewer");
    expect(ranked).toEqual([{ id: "a", username: "alice", display_name: null, avatar_url: null, score: 1 }]);
  });

  it("returns [] when the viewer has no coven members", async () => {
    mockedGetMembers.mockResolvedValueOnce([]);
    const client = makeClient({});
    const ranked = await getRankedCovenfolk(client, "viewer");
    expect(ranked).toEqual([]);
  });

  it("sums signals: 2 recs + 1 reaction + 1 comment = 4 for the same person", async () => {
    mockedGetMembers.mockResolvedValueOnce([A, B]);
    const client = makeClient({
      activity: [{ payload: { to_user_id: "a" } }, { payload: { to_user_id: "a" } }],
      reactions: [{ activity: { actor_user_id: "a" } }],
      comments: [{ activity: { actor_user_id: "a" } }],
    });
    const ranked = await getRankedCovenfolk(client, "viewer");
    expect(ranked[0]).toMatchObject({ username: "alice", score: 4 });
    expect(ranked[1]).toMatchObject({ username: "bob", score: 0 });
  });
});
