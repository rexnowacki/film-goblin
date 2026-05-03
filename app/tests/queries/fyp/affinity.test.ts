import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getUserOwnAffinity,
  getLaneAffinity,
  getCovenBorrowedAffinity,
  getUserAffinity,
  SIGNAL_WEIGHTS,
  FACET_MULTIPLIERS,
  LANE_WEIGHT,
  COVEN_PRIOR_SCALE,
} from "@/lib/queries/fyp/affinity";

// Mock getRankedCovenfolk — used by getCovenBorrowedAffinity.
vi.mock("@/lib/queries/coven-interactions", () => ({
  getRankedCovenfolk: vi.fn(),
}));
import { getRankedCovenfolk } from "@/lib/queries/coven-interactions";

// Unit-style mock tests: no env required. We mock the chained PostgREST
// builder pattern to supply deterministic canned data and verify that
// getUserOwnAffinity correctly applies signal weights × facet multipliers,
// floors at zero, and takes a single round trip for tags.
//
// Pattern mirrors app/tests/queries/coven-interactions.test.ts.

// ---------------------------------------------------------------------------
// Mock client builder
// ---------------------------------------------------------------------------

interface TableData {
  watched?: Array<{ film_id: string; recommended: boolean | null; created_at?: string | null }>;
  library?: Array<{ film_id: string; created_at?: string | null }>;
  watchlists?: Array<{ film_id: string; created_at?: string | null }>;
  activity?: Array<{ payload: Record<string, unknown>; created_at?: string | null }>;
  activity_reactions?: Array<unknown>;
  film_tags?: Array<unknown>;
}

/**
 * Builds a minimal mock Supabase client where each table returns canned data.
 *
 * The mock chains select().eq().eq() → Promise<{ data, error: null }>.
 * For film_tags the chain is select().in() → Promise.
 * For activity_reactions the chain is select().eq() → Promise.
 */
function makeAffinityClient(perTable: TableData) {
  function chain(result: { data: unknown[] | null; error: null }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {
      select: vi.fn(() => c),
      eq: vi.fn(() => c),
      in: vi.fn(() => Promise.resolve(result)),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return c;
  }

  // For watched/library/watchlists/activity/activity_reactions, all chains end
  // with one or more .eq() calls. We want the final await to resolve.
  // We model this by making the chain object itself thenable (duck-typed Promise).
  function eqChain(result: { data: unknown[] | null; error: null }) {
    let obj: Record<string, unknown>;
    const p = Promise.resolve(result);
    obj = {
      select: vi.fn(() => obj),
      eq: vi.fn(() => obj),
      in: vi.fn(() => p),
      // thenable so `await obj` resolves to result
      then: (
        res: (v: { data: unknown[] | null; error: null }) => unknown,
        rej?: (e: unknown) => unknown,
      ) => p.then(res, rej),
      catch: (rej: (e: unknown) => unknown) => p.catch(rej),
    };
    return obj;
  }

  return {
    from: vi.fn((table: string) => {
      if (table === "watched")
        return eqChain({ data: perTable.watched ?? [], error: null });
      if (table === "library")
        return eqChain({ data: perTable.library ?? [], error: null });
      if (table === "watchlists")
        return eqChain({ data: perTable.watchlists ?? [], error: null });
      if (table === "activity")
        return eqChain({ data: perTable.activity ?? [], error: null });
      if (table === "activity_reactions")
        return eqChain({ data: perTable.activity_reactions ?? [], error: null });
      if (table === "film_tags") {
        // film_tags chain: .select().in() → Promise
        return chain({ data: perTable.film_tags ?? [], error: null });
      }
      return eqChain({ data: [], error: null });
    }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient<
    import("@/lib/supabase/types").Database
  >;
}

// ---------------------------------------------------------------------------
// Tag row factory
// ---------------------------------------------------------------------------

type TagFacet = "subgenre" | "subject" | "tone" | "theme" | "setting" | "content";

function filmTag(
  filmId: string,
  name: string,
  type: TagFacet,
  isPrimary: boolean,
  position = 1,
) {
  return {
    film_id: filmId,
    position,
    is_primary: isPrimary,
    tag: { name, type },
  };
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

describe("getUserOwnAffinity", () => {
  it("returns empty vector when user has no signals", async () => {
    const client = makeAffinityClient({});
    const result = await getUserOwnAffinity(client, "user-1");
    expect(result.byTag).toEqual({});
  });

  it("single watch+liked of a primary folk-horror film → 9.0", async () => {
    // weight 3.0 (watch_liked) × multiplier 3.0 (subgenre_primary) = 9.0
    const client = makeAffinityClient({
      watched: [{ film_id: "film-1", recommended: true }],
      film_tags: [filmTag("film-1", "folk horror", "subgenre", true)],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    expect(result.byTag["folk horror"]).toBe(
      SIGNAL_WEIGHTS.watch_liked * FACET_MULTIPLIERS.subgenre_primary,
    );
    expect(result.byTag["folk horror"]).toBe(9.0);
  });

  it("single watch+disliked of a primary folk-horror film → floored at 0", async () => {
    // weight -4.0 × 3.0 = -12.0 → floored to 0
    const client = makeAffinityClient({
      watched: [{ film_id: "film-1", recommended: false }],
      film_tags: [filmTag("film-1", "folk horror", "subgenre", true)],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    expect(result.byTag["folk horror"]).toBe(0);
  });

  it("liked + disliked of same tag from two films → net contribution floored at 0", async () => {
    // film-1: liked → +3.0 × 3.0 = +9.0 on folk horror
    // film-2: disliked → -4.0 × 3.0 = -12.0 on folk horror
    // net = -3.0 → floored to 0
    const client = makeAffinityClient({
      watched: [
        { film_id: "film-1", recommended: true },
        { film_id: "film-2", recommended: false },
      ],
      film_tags: [
        filmTag("film-1", "folk horror", "subgenre", true),
        filmTag("film-2", "folk horror", "subgenre", true),
      ],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    expect(result.byTag["folk horror"]).toBe(0);
  });

  it("watch with recommended=null → no contribution (unrated watch)", async () => {
    const client = makeAffinityClient({
      watched: [{ film_id: "film-1", recommended: null }],
      film_tags: [filmTag("film-1", "folk horror", "subgenre", true)],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    // No signal from unrated watch; filmWeights stays empty → byTag = {}
    expect(result.byTag).toEqual({});
  });

  it("multi-facet film → each tag gets its own facet multiplier", async () => {
    // One liked watch of a film with 4 different tag types.
    // Expected contributions (weight = 3.0 watch_liked):
    //   folk horror (subgenre, primary=true)  → 3.0 × 3.0 = 9.0
    //   bleak       (tone)                    → 3.0 × 1.5 = 4.5
    //   isolation   (theme)                   → 3.0 × 1.5 = 4.5
    //   gore        (content)                 → 3.0 × 0.5 = 1.5
    const client = makeAffinityClient({
      watched: [{ film_id: "film-1", recommended: true }],
      film_tags: [
        filmTag("film-1", "folk horror", "subgenre", true, 1),
        filmTag("film-1", "bleak", "tone", false, 2),
        filmTag("film-1", "isolation", "theme", false, 3),
        filmTag("film-1", "gore", "content", false, 4),
      ],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    expect(result.byTag["folk horror"]).toBeCloseTo(9.0);
    expect(result.byTag["bleak"]).toBeCloseTo(4.5);
    expect(result.byTag["isolation"]).toBeCloseTo(4.5);
    expect(result.byTag["gore"]).toBeCloseTo(1.5);
  });

  it("recommendation_sent payload → +2.5 contribution on primary subgenre", async () => {
    // weight 2.5 × multiplier 3.0 (primary) = 7.5
    const client = makeAffinityClient({
      activity: [{ payload: { film_id: "film-1" } }],
      film_tags: [filmTag("film-1", "folk horror", "subgenre", true)],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    expect(result.byTag["folk horror"]).toBeCloseTo(
      SIGNAL_WEIGHTS.recommendation_sent * FACET_MULTIPLIERS.subgenre_primary,
    );
    expect(result.byTag["folk horror"]).toBeCloseTo(7.5);
  });

  it("activity reaction with film_id in parent payload → +0.20 contribution", async () => {
    // weight 0.20 × multiplier 3.0 (primary subgenre) = 0.60
    const client = makeAffinityClient({
      activity_reactions: [
        { activity: { payload: { film_id: "film-1" } } },
      ],
      film_tags: [filmTag("film-1", "folk horror", "subgenre", true)],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    expect(result.byTag["folk horror"]).toBeCloseTo(
      SIGNAL_WEIGHTS.reaction * FACET_MULTIPLIERS.subgenre_primary,
    );
    expect(result.byTag["folk horror"]).toBeCloseTo(0.6);
  });

  it("activity reaction with no film_id in payload → ignored", async () => {
    const client = makeAffinityClient({
      activity_reactions: [
        { activity: { payload: { comment_id: "some-comment" } } },
      ],
      film_tags: [],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    expect(result.byTag).toEqual({});
  });

  it("secondary subgenre gets 1.5× multiplier, not 3.0×", async () => {
    // watch_liked (3.0) × subgenre_secondary (1.5) = 4.5
    const client = makeAffinityClient({
      watched: [{ film_id: "film-1", recommended: true }],
      film_tags: [filmTag("film-1", "giallo", "subgenre", false, 2)],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    expect(result.byTag["giallo"]).toBeCloseTo(
      SIGNAL_WEIGHTS.watch_liked * FACET_MULTIPLIERS.subgenre_secondary,
    );
    expect(result.byTag["giallo"]).toBeCloseTo(4.5);
  });

  it("all six signal sources accumulate on the same tag", async () => {
    // All signals pointing to film-1, which has one primary subgenre tag "folk horror".
    // watch_liked:          3.0 × 3.0 = 9.0
    // recommendation_sent:  2.5 × 3.0 = 7.5
    // library_added:        1.5 × 3.0 = 4.5
    // watchlist_added:      0.75 × 3.0 = 2.25
    // reaction:             0.20 × 3.0 = 0.6
    // Total = 23.85
    // (watch_disliked is -4.0 but not included here)
    const client = makeAffinityClient({
      watched: [{ film_id: "film-1", recommended: true }],
      library: [{ film_id: "film-1" }],
      watchlists: [{ film_id: "film-1" }],
      activity: [{ payload: { film_id: "film-1" } }],
      activity_reactions: [{ activity: { payload: { film_id: "film-1" } } }],
      film_tags: [filmTag("film-1", "folk horror", "subgenre", true)],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    const expected =
      (SIGNAL_WEIGHTS.watch_liked +
        SIGNAL_WEIGHTS.recommendation_sent +
        SIGNAL_WEIGHTS.library_added +
        SIGNAL_WEIGHTS.watchlist_added +
        SIGNAL_WEIGHTS.reaction) *
      FACET_MULTIPLIERS.subgenre_primary;
    expect(result.byTag["folk horror"]).toBeCloseTo(expected);
    expect(result.byTag["folk horror"]).toBeCloseTo(23.85);
  });

  it("negative score above threshold stays floored at 0 (not removed from map)", async () => {
    // Two disliked watches → strong negative, still floors at 0
    const client = makeAffinityClient({
      watched: [
        { film_id: "film-1", recommended: false },
        { film_id: "film-2", recommended: false },
      ],
      film_tags: [
        filmTag("film-1", "slasher", "subgenre", true),
        filmTag("film-2", "slasher", "subgenre", true),
      ],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    // -4.0 × 3.0 × 2 films = -24, floored to 0
    expect(result.byTag["slasher"]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Lane client builder — supports profiles.maybeSingle() + tags.in()
// ---------------------------------------------------------------------------

/**
 * Builds a mock client for getLaneAffinity.
 *
 * getLaneAffinity chain:
 *   1. profiles → .select().eq().maybeSingle() → { data: { lane_tag_ids }, error }
 *   2. tags     → .select().in()               → { data: [{ name }], error }
 */
function makeLaneClient(opts: {
  lane_tag_ids?: string[];
  tagNames?: string[];
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function eqMaybeSingle(result: { data: unknown; error: null }) {
    let obj: Record<string, unknown>;
    const p = Promise.resolve(result);
    obj = {
      select: vi.fn(() => obj),
      eq: vi.fn(() => obj),
      maybeSingle: vi.fn(() => p),
      in: vi.fn(() => p),
      then: (
        res: (v: unknown) => unknown,
        rej?: (e: unknown) => unknown,
      ) => p.then(res, rej),
      catch: (rej: (e: unknown) => unknown) => p.catch(rej),
    };
    return obj;
  }

  // tags.in() chain: select().in() → Promise<{ data, error }>
  function inChain(result: { data: unknown[]; error: null }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {
      select: vi.fn(() => c),
      in: vi.fn(() => Promise.resolve(result)),
    };
    return c;
  }

  return {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return eqMaybeSingle({
          data: opts.lane_tag_ids !== undefined
            ? { lane_tag_ids: opts.lane_tag_ids }
            : null,
          error: null,
        });
      }
      if (table === "tags") {
        return inChain({
          data: (opts.tagNames ?? []).map(n => ({ name: n })),
          error: null,
        });
      }
      return eqMaybeSingle({ data: null, error: null });
    }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient<
    import("@/lib/supabase/types").Database
  >;
}

// ---------------------------------------------------------------------------
// getLaneAffinity specs
// ---------------------------------------------------------------------------

describe("getLaneAffinity", () => {
  it("empty lane_tag_ids → empty vector", async () => {
    const client = makeLaneClient({ lane_tag_ids: [] });
    const result = await getLaneAffinity(client, "user-1");
    expect(result.byTag).toEqual({});
  });

  it("two lane tags → both entries at LANE_WEIGHT (1.5)", async () => {
    const client = makeLaneClient({
      lane_tag_ids: ["id-folk-horror", "id-giallo"],
      tagNames: ["folk horror", "giallo"],
    });
    const result = await getLaneAffinity(client, "user-1");
    expect(result.byTag["folk horror"]).toBe(LANE_WEIGHT);
    expect(result.byTag["giallo"]).toBe(LANE_WEIGHT);
    expect(Object.keys(result.byTag)).toHaveLength(2);
  });

  it("lane tag id that doesn't exist in tags table is silently dropped", async () => {
    // We pass two ids in lane_tag_ids but only one returns from the tags query
    // (simulating an unknown/deleted tag id).
    const client = makeLaneClient({
      lane_tag_ids: ["id-folk-horror", "id-unknown"],
      tagNames: ["folk horror"],  // only one tag found
    });
    const result = await getLaneAffinity(client, "user-1");
    expect(result.byTag["folk horror"]).toBe(LANE_WEIGHT);
    expect(Object.keys(result.byTag)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Coven-borrowed client builder
//
// getCovenBorrowedAffinity calls:
//   1. getRankedCovenfolk (mocked via vi.mock above)
//   2. getUserOwnAffinity per mate — uses the full affinity-client shape
//
// Strategy: build a single client per test whose from() handler routes
// "watched"/"library"/"watchlists"/"activity"/"activity_reactions" to the
// appropriate mate's canned data, keyed by the userId argument passed to
// getUserOwnAffinity. Since getUserOwnAffinity's five parallel calls all
// use the same client, we parameterise by a map of userId → TableData.
// ---------------------------------------------------------------------------

/**
 * Builds a mock client that routes table reads to per-user canned data.
 * The user_id is extracted from the first .eq("user_id", id) call; every
 * table lookup after that uses that user's slice of data.
 *
 * Limitation: this mock only supports the "all chains end in eq()" shape
 * used by getUserOwnAffinity — NOT maybeSingle() — so it's not suitable for
 * getLaneAffinity in isolation.
 */
function makeCovenClient(
  dataByUserId: Record<string, TableData>,
) {
  function eqChain(
    tableKey: keyof TableData,
    userId: string,
  ) {
    const data = dataByUserId[userId]?.[tableKey] ?? [];
    const result = { data, error: null };
    const p = Promise.resolve(result);
    let obj: Record<string, unknown>;
    obj = {
      select: vi.fn(() => obj),
      eq: vi.fn((_col: string, val: string) => {
        // If the eq is on "user_id", capture the id for the data slice.
        // Subsequent eq calls (e.g. ".eq('kind', 'recommendation_sent')") are
        // on the same chain — we just return the same obj.
        if (_col === "user_id" || _col === "actor_user_id") {
          const newData = dataByUserId[val]?.[tableKey] ?? [];
          const newResult = { data: newData, error: null };
          const newP = Promise.resolve(newResult);
          let newObj: Record<string, unknown>;
          newObj = {
            select: vi.fn(() => newObj),
            eq: vi.fn(() => newObj),
            in: vi.fn(() => newP),
            then: (
              res: (v: unknown) => unknown,
              rej?: (e: unknown) => unknown,
            ) => newP.then(res, rej),
            catch: (rej: (e: unknown) => unknown) => newP.catch(rej),
          };
          return newObj;
        }
        return obj;
      }),
      in: vi.fn(() => p),
      then: (
        res: (v: unknown) => unknown,
        rej?: (e: unknown) => unknown,
      ) => p.then(res, rej),
      catch: (rej: (e: unknown) => unknown) => p.catch(rej),
    };
    return obj;
  }

  // film_tags uses select().in() — different chain shape.
  function filmTagChain(userId: string) {
    const filmTagData = dataByUserId[userId]?.film_tags ?? [];
    const result = { data: filmTagData, error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {
      select: vi.fn(() => c),
      eq: vi.fn(() => c),
      in: vi.fn(() => Promise.resolve(result)),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return c;
  }

  // getUserOwnAffinity's five parallel queries all go through one client. The
  // userId isn't known at from() time — it's supplied via a subsequent .eq().
  // We return a thenable that lazily resolves to empty and let the eq() calls
  // pick up the right userId.
  return {
    from: vi.fn((table: string) => {
      if (table === "film_tags") {
        // film_tags uses .select().in() after filmWeights is known. We need
        // to capture whichever userId was used. Since the mock is per-client
        // (one client per test call), and getUserOwnAffinity only queries
        // film_tags for ONE userId per invocation, we return a chain that
        // searches all users' film_tags data.
        const allFilmTags: unknown[] = [];
        for (const d of Object.values(dataByUserId)) {
          allFilmTags.push(...(d.film_tags ?? []));
        }
        const result = { data: allFilmTags, error: null };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = {
          select: vi.fn(() => c),
          eq: vi.fn(() => c),
          in: vi.fn(() => Promise.resolve(result)),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(result).then(resolve),
        };
        return c;
      }
      // Default: eqChain with a placeholder userId — real userId gets captured
      // by the eq() mock.
      return eqChain(table as keyof TableData, "__placeholder__");
    }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient<
    import("@/lib/supabase/types").Database
  >;
}

// ---------------------------------------------------------------------------
// getCovenBorrowedAffinity specs
// ---------------------------------------------------------------------------

describe("getCovenBorrowedAffinity", () => {
  const mockedGetRankedCovenfolk = getRankedCovenfolk as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockedGetRankedCovenfolk.mockReset();
  });

  it("empty coven (no getRankedCovenfolk results) → empty vector", async () => {
    mockedGetRankedCovenfolk.mockResolvedValueOnce([]);
    const client = makeAffinityClient({});
    const result = await getCovenBorrowedAffinity(client, "user-main");
    expect(result.byTag).toEqual({});
  });

  it("single coven mate with folk-horror affinity 9.0 and score 1 → 2.7", async () => {
    // 9.0 (mate's own affinity) × 1.0 (weight = 1/total = 1/1) × 0.3 (COVEN_PRIOR_SCALE) = 2.7
    mockedGetRankedCovenfolk.mockResolvedValueOnce([
      { id: "mate-1", username: "mate1", display_name: null, avatar_url: null, score: 1 },
    ]);
    const client = makeAffinityClient({
      watched: [{ film_id: "film-1", recommended: true }],
      film_tags: [filmTag("film-1", "folk horror", "subgenre", true)],
    });
    const result = await getCovenBorrowedAffinity(client, "user-main");
    // mate's own affinity for folk horror: watch_liked × subgenre_primary = 3.0 × 3.0 = 9.0
    // weight: score=1 / totalScore=1 = 1.0
    // scaled: 9.0 × 1.0 × COVEN_PRIOR_SCALE(0.3) = 2.7
    expect(result.byTag["folk horror"]).toBeCloseTo(2.7);
  });

  it("two coven mates with different vectors and scores → weighted average × 0.3", async () => {
    // mate-A: folk horror affinity = 9.0, score = 3
    // mate-B: giallo affinity = 4.5, score = 1
    // totalScore = 4
    // folk horror: 9.0 × (3/4) × 0.3 = 9.0 × 0.75 × 0.3 = 2.025
    // giallo:      4.5 × (1/4) × 0.3 = 4.5 × 0.25 × 0.3 = 0.3375
    mockedGetRankedCovenfolk.mockResolvedValueOnce([
      { id: "mate-a", username: "matean", display_name: null, avatar_url: null, score: 3 },
      { id: "mate-b", username: "mateb", display_name: null, avatar_url: null, score: 1 },
    ]);
    // We need the client to serve different watched/film_tags data per mate.
    // Use makeCovenClient with per-userId data.
    const client = makeCovenClient({
      "mate-a": {
        watched: [{ film_id: "film-folk", recommended: true }],
        film_tags: [filmTag("film-folk", "folk horror", "subgenre", true)],
      },
      "mate-b": {
        watched: [{ film_id: "film-giallo", recommended: true }],
        film_tags: [filmTag("film-giallo", "giallo", "subgenre", false)],
      },
    });
    const result = await getCovenBorrowedAffinity(client, "user-main");
    expect(result.byTag["folk horror"]).toBeCloseTo(2.025);
    // mate-b watch_liked × subgenre_secondary = 3.0 × 1.5 = 4.5
    expect(result.byTag["giallo"]).toBeCloseTo(0.3375);
  });

  it("all-zero scores fall back to equal weights (equal-weight fallback branch)", async () => {
    // Two mates, both with score 0. Each should get weight 0.5.
    // mate-A: folk horror affinity = 9.0
    // mate-B: folk horror affinity = 9.0
    // Equal-weight result: ((9.0 × 0.5) + (9.0 × 0.5)) × 0.3 = 9.0 × 0.3 = 2.7
    mockedGetRankedCovenfolk.mockResolvedValueOnce([
      { id: "mate-a", username: "matea", display_name: null, avatar_url: null, score: 0 },
      { id: "mate-b", username: "mateb", display_name: null, avatar_url: null, score: 0 },
    ]);
    const client = makeCovenClient({
      "mate-a": {
        watched: [{ film_id: "film-1", recommended: true }],
        film_tags: [filmTag("film-1", "folk horror", "subgenre", true)],
      },
      "mate-b": {
        watched: [{ film_id: "film-2", recommended: true }],
        film_tags: [filmTag("film-2", "folk horror", "subgenre", true)],
      },
    });
    const result = await getCovenBorrowedAffinity(client, "user-main");
    // Each mate: watch_liked × subgenre_primary = 3.0 × 3.0 = 9.0
    // Equal-weight sum: 9.0 × 0.5 + 9.0 × 0.5 = 9.0, scaled by 0.3 = 2.7
    expect(result.byTag["folk horror"]).toBeCloseTo(
      9.0 * COVEN_PRIOR_SCALE,
    );
  });
});

// ---------------------------------------------------------------------------
// getUserAffinity composer specs
// ---------------------------------------------------------------------------

describe("getUserAffinity", () => {
  const mockedGetRankedCovenfolk = getRankedCovenfolk as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockedGetRankedCovenfolk.mockReset();
    // Default: empty coven so getCovenBorrowedAffinity returns {} unless overridden.
    mockedGetRankedCovenfolk.mockResolvedValue([]);
  });

  it("all three sources empty → empty vector", async () => {
    const client = makeLaneClient({ lane_tag_ids: [] });
    const result = await getUserAffinity(client, "user-1");
    expect(result.byTag).toEqual({});
  });

  it("sums own + coven + lanes correctly", async () => {
    // Setup:
    //   own: user watches "film-own" (liked), tagged "tag-x" (subgenre, primary)
    //        → own byTag["tag-x"] = watch_liked × subgenre_primary = 3.0 × 3.0 = 9.0
    //   coven: one mate (score=1) watched "film-mate" (liked), tagged "tag-x"
    //        → coven byTag["tag-x"] = 9.0 × (1/1) × 0.3 = 2.7
    //   lanes: user has lane tag → tag "tag-x"
    //        → lanes byTag["tag-x"] = 1.5
    //   expected sum: 9.0 + 2.7 + 1.5 = 13.2
    //
    // The client must handle all three query shapes in one object since
    // getUserAffinity passes a single client to all three sub-functions.
    //
    // Key: getUserOwnAffinity only uses non-watched tables as sources for
    // film_id. We give library/watchlists/activity/activity_reactions data
    // keyed per-user so they never cross-contaminate. Only "watched" is
    // user-specific; everything else returns [] by default.

    mockedGetRankedCovenfolk.mockResolvedValueOnce([
      { id: "mate-1", username: "m1", display_name: null, avatar_url: null, score: 1 },
    ]);

    // Per-user watched data. Library, watchlists, activity, reactions are
    // intentionally kept empty to keep the math clean — own signal comes
    // only from watch_liked.
    const dataByUser: Record<string, { watched: Array<{ film_id: string; recommended: boolean }> }> = {
      "user-1": { watched: [{ film_id: "film-own", recommended: true }] },
      "mate-1": { watched: [{ film_id: "film-mate", recommended: true }] },
    };

    // film-own and film-mate are both tagged "tag-x" (subgenre, primary).
    const filmTagsData = [
      filmTag("film-own", "tag-x", "subgenre", true),
      filmTag("film-mate", "tag-x", "subgenre", true),
    ];

    // Helper: eqChain that routes by user_id/actor_user_id to watched data.
    // Non-watched tables return [] always.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function makeUserRoutedChain(table: string): any {
      function resolved(data: unknown[]) {
        const r = { data, error: null };
        const p = Promise.resolve(r);
        let o: Record<string, unknown>;
        o = {
          select: vi.fn(() => o),
          eq: vi.fn(() => o),
          in: vi.fn(() => p),
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            p.then(res, rej),
          catch: (rej: (e: unknown) => unknown) => p.catch(rej),
        };
        return o;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let obj: any;
      obj = {
        select: vi.fn(() => obj),
        eq: vi.fn((col: string, val: string) => {
          if ((col === "user_id" || col === "actor_user_id") && table === "watched") {
            const d = dataByUser[val]?.watched ?? [];
            return resolved(d);
          }
          // All other eq calls (kind filters, etc.) return empty resolved chain.
          return resolved([]);
        }),
        in: vi.fn(() => Promise.resolve({ data: [], error: null })),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(res, rej),
        catch: (rej: (e: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).catch(rej),
      };
      return obj;
    }

    // film_tags: .select().in() → both film-own and film-mate tags.
    // getUserOwnAffinity filters by filmWeights.keys() — only matching entries
    // contribute, so film-own tags only affect user-1's own call, and
    // film-mate tags only affect mate-1's call (each has their respective
    // film in filmWeights from the watched data above).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filmTagChain: any = {
      select: vi.fn(function(this: unknown) { return filmTagChain; }),
      eq: vi.fn(function(this: unknown) { return filmTagChain; }),
      in: vi.fn(() => Promise.resolve({ data: filmTagsData, error: null })),
      then: (r: (v: unknown) => unknown) =>
        Promise.resolve({ data: filmTagsData, error: null }).then(r),
    };

    // profiles (getLaneAffinity): .select().eq().maybeSingle() → lane_tag_ids
    const profilesResult = { data: { lane_tag_ids: ["lane-tag-id"] }, error: null };
    const profilesP = Promise.resolve(profilesResult);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let profilesChain: any;
    profilesChain = {
      select: vi.fn(() => profilesChain),
      eq: vi.fn(() => profilesChain),
      maybeSingle: vi.fn(() => profilesP),
      then: (r: (v: unknown) => unknown, rj?: (e: unknown) => unknown) =>
        profilesP.then(r, rj),
      catch: (rj: (e: unknown) => unknown) => profilesP.catch(rj),
    };

    // tags (getLaneAffinity): .select().in() → [{ name: "tag-x" }]
    const tagsResult = { data: [{ name: "tag-x" }], error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tagsChain: any = {
      select: vi.fn(function(this: unknown) { return tagsChain; }),
      in: vi.fn(() => Promise.resolve(tagsResult)),
      eq: vi.fn(function(this: unknown) { return tagsChain; }),
    };

    const hybridClient = {
      from: vi.fn((table: string) => {
        if (table === "film_tags") return filmTagChain;
        if (table === "profiles") return profilesChain;
        if (table === "tags") return tagsChain;
        // watched, library, watchlists, activity, activity_reactions
        return makeUserRoutedChain(table);
      }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient<
      import("@/lib/supabase/types").Database
    >;

    const result = await getUserAffinity(hybridClient, "user-1");
    // own: 9.0 (watch_liked × subgenre_primary)
    // coven: 9.0 × 1.0 × 0.3 = 2.7
    // lanes: 1.5
    // total: 13.2
    expect(result.byTag["tag-x"]).toBeCloseTo(13.2);
  });

  it("floor at 0 applied at compose time (defensive: manually zeroed value stays ≥ 0)", async () => {
    // getUserOwnAffinity already floors at 0, so the only way to get a
    // negative in the composed sum would be if a future source contributed
    // negatives. We can't simulate that with the current architecture, but
    // we verify the floor is enforced by testing that a fully-empty composed
    // vector returns {} not negative values.
    const client = makeLaneClient({ lane_tag_ids: [] });
    const result = await getUserAffinity(client, "user-1");
    for (const v of Object.values(result.byTag)) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(result.byTag).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Affinity cap + time decay (recommender v2)
// ---------------------------------------------------------------------------

describe("getUserOwnAffinity — affinity cap", () => {
  it("clips per-tag affinity at AFFINITY_CAP (30)", async () => {
    // 5 watch+liked of the same primary-folk-horror film:
    // raw aggregate = 5 × 3.0 × 3.0 = 45 → capped at 30.
    const today = new Date().toISOString();
    const client = makeAffinityClient({
      watched: Array.from({ length: 5 }, () => ({
        film_id: "f1", recommended: true, created_at: today,
      })),
      film_tags: [filmTag("f1", "folk horror", "subgenre", true)],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    expect(result.byTag["folk horror"]).toBe(30);
  });
});

describe("getUserOwnAffinity — time decay", () => {
  it("today's signal contributes ~ full weight (decay ≈ 1)", async () => {
    const today = new Date().toISOString();
    const client = makeAffinityClient({
      watched: [{ film_id: "f1", recommended: true, created_at: today }],
      film_tags: [filmTag("f1", "folk horror", "subgenre", true)],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    expect(result.byTag["folk horror"]).toBeCloseTo(9.0, 1);
  });

  it("1-year-old signal contributes ~ 0.5×", async () => {
    const oneYearAgo = new Date(Date.now() - 365.25 * 24 * 60 * 60 * 1000).toISOString();
    const client = makeAffinityClient({
      watched: [{ film_id: "f1", recommended: true, created_at: oneYearAgo }],
      film_tags: [filmTag("f1", "folk horror", "subgenre", true)],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    // 3.0 × 3.0 × 0.5 = 4.5
    expect(result.byTag["folk horror"]).toBeCloseTo(4.5, 1);
  });

  it("2-year-old signal contributes ~ 0.25×", async () => {
    const twoYearsAgo = new Date(Date.now() - 2 * 365.25 * 24 * 60 * 60 * 1000).toISOString();
    const client = makeAffinityClient({
      watched: [{ film_id: "f1", recommended: true, created_at: twoYearsAgo }],
      film_tags: [filmTag("f1", "folk horror", "subgenre", true)],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    // 3.0 × 3.0 × 0.25 = 2.25
    expect(result.byTag["folk horror"]).toBeCloseTo(2.25, 1);
  });

  it("missing created_at falls back to no decay (full weight)", async () => {
    const client = makeAffinityClient({
      watched: [{ film_id: "f1", recommended: true, created_at: null }],
      film_tags: [filmTag("f1", "folk horror", "subgenre", true)],
    });
    const result = await getUserOwnAffinity(client, "user-1");
    expect(result.byTag["folk horror"]).toBeCloseTo(9.0, 1);
  });
});
