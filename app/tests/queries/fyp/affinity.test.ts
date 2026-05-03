import { describe, it, expect, vi } from "vitest";
import { getUserOwnAffinity, SIGNAL_WEIGHTS, FACET_MULTIPLIERS } from "@/lib/queries/fyp/affinity";

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
  watched?: Array<{ film_id: string; recommended: boolean | null }>;
  library?: Array<{ film_id: string }>;
  watchlists?: Array<{ film_id: string }>;
  activity?: Array<{ payload: Record<string, unknown> }>;
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
