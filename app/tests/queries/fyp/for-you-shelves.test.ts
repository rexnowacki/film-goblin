import { describe, it, expect, vi } from "vitest";
import { getForYouShelves } from "@/lib/queries/fyp/forYou";

// getForYouShelves composes getUserAffinity, which (via getCovenBorrowedAffinity)
// calls getRankedCovenfolk. Mock it to short-circuit coven borrowing entirely —
// none of these tests exercise coven signal, and mocking here avoids having to
// stub coven_members/activity_comments through the real call chain. Mirrors the
// precedent in affinity.test.ts.
vi.mock("@/lib/queries/coven-interactions", () => ({
  getRankedCovenfolk: vi.fn(async () => []),
}));

const USER_ID = "user-1";

// ---------------------------------------------------------------------------
// Table-keyed stub client
// ---------------------------------------------------------------------------
// Modeled on app/tests/itunes-availability/check.test.ts's from(table) switch
// resolving canned rows through a thenable chain. Every chain method used by
// getForYouShelves (select/eq/in/order/maybeSingle) returns the chain; `then`
// resolves { data, error: null } after applying accumulated eq/in filters.

type Filter = { col: string; op: "eq" | "in" | "gte"; val: unknown };

function applyFilters(rows: any[], filters: Filter[]) {
  return rows.filter((r) =>
    filters.every((f) => {
      if (f.op === "eq") return r[f.col] === f.val;
      if (f.op === "in") return (f.val as unknown[]).includes(r[f.col]);
      if (f.op === "gte") return r[f.col] >= (f.val as any);
      return true;
    }),
  );
}

function tableChain(rows: any[]) {
  const filters: Filter[] = [];
  let orderCol: string | null = null;
  const handler: any = {
    select: () => handler,
    eq: (col: string, val: unknown) => {
      filters.push({ col, op: "eq", val });
      return handler;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push({ col, op: "in", val: vals });
      return handler;
    },
    gte: (col: string, val: unknown) => {
      filters.push({ col, op: "gte", val });
      return handler;
    },
    order: (col: string) => {
      orderCol = col;
      return handler;
    },
    maybeSingle: async () => {
      const filtered = applyFilters(rows, filters);
      return { data: filtered[0] ?? null, error: null };
    },
    then: (resolve: (v: { data: any[]; error: null }) => unknown) => {
      let filtered = applyFilters(rows, filters);
      if (orderCol) {
        const col = orderCol;
        filtered = [...filtered].sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          return av < bv ? -1 : av > bv ? 1 : 0;
        });
      }
      resolve({ data: filtered, error: null });
    },
  };
  return handler;
}

interface Fixtures {
  films?: any[];
  watched?: any[];
  library?: any[];
  watchlists?: any[];
  activity?: any[];
  activity_reactions?: any[];
  profiles?: any[];
  tags?: any[];
  film_tags?: any[];
  fyp_not_interested?: any[];
  fyp_impressions?: any[];
  films_with_stats?: any[];
}

function makeClient(fixtures: Fixtures): any {
  return {
    from: (table: string) => tableChain((fixtures as Record<string, any[]>)[table] ?? []),
  };
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const gothicTag = { id: "t-gothic", name: "gothic-horror", type: "subgenre" };

function starterFilm(id: string, title: string) {
  return {
    id,
    title,
    year: 2020,
    director: `Dir ${id}`,
    artwork_url: null,
    first_seen_at: "2020-01-01T00:00:00.000Z",
    editorial_starter: true,
    available: true,
  };
}

const STARTER_FILMS = [
  starterFilm("s1", "Alpha Rites"),
  starterFilm("s2", "Bravo Hollow"),
  starterFilm("s3", "Charlie Woods"),
  starterFilm("s4", "Delta Manor"),
  starterFilm("s5", "Echo Grove"),
  starterFilm("s6", "Foxglove Pit"),
];

describe("getForYouShelves", () => {
  it("cold start: returns omen + single starter shelf, excluding watched/dismissed starters", async () => {
    const client = makeClient({
      films: STARTER_FILMS,
      watched: [{ user_id: USER_ID, film_id: "s1", recommended: null, created_at: "2020-01-01" }],
      fyp_not_interested: [{ user_id: USER_ID, film_id: "s2", created_at: "2020-01-01" }],
      profiles: [{ id: USER_ID, lane_tag_ids: [] }],
    });

    const result = await getForYouShelves(client, USER_ID);

    // No signals anywhere -> cold start branch.
    expect(result.omen).not.toBeNull();
    expect(result.filmsById.has("s1")).toBe(false); // watched, excluded
    expect(result.filmsById.has("s2")).toBe(false); // dismissed, excluded

    expect(result.shelves).toHaveLength(1);
    expect(result.shelves[0].kind).toBe("starter");
    const shelfIds = result.shelves[0].filmIds;
    expect(shelfIds).not.toContain("s1");
    expect(shelfIds).not.toContain("s2");
    expect(shelfIds).not.toContain(result.omen!.filmId);
    // Remaining starters (s3-s6) minus the omen = 3, alphabetical order.
    expect(shelfIds).toHaveLength(3);
  });

  it("score path: a dismissed film never appears in the omen or any shelf", async () => {
    const films = [
      ...STARTER_FILMS,
      {
        id: "f-dismissed",
        title: "Hollow Coven",
        year: 2021,
        director: "Dir Dismissed",
        artwork_url: null,
        first_seen_at: "2020-06-01T00:00:00.000Z",
        editorial_starter: false,
        available: true,
      },
      {
        id: "f-twin-a",
        title: "Twin A",
        year: 2021,
        director: "Dir Twin A",
        artwork_url: null,
        first_seen_at: "2020-06-01T00:00:00.000Z",
        editorial_starter: false,
        available: true,
      },
      {
        id: "f-twin-b",
        title: "Twin B",
        year: 2021,
        director: "Dir Twin B",
        artwork_url: null,
        first_seen_at: "2020-06-01T00:00:00.000Z",
        editorial_starter: false,
        available: true,
      },
    ];

    const client = makeClient({
      films,
      // Library signal gives the user a non-empty affinity vector (hasAnySignal).
      library: [{ user_id: USER_ID, film_id: "f-lib", created_at: new Date().toISOString() }],
      watched: [],
      watchlists: [],
      activity: [],
      activity_reactions: [],
      profiles: [{ id: USER_ID, lane_tag_ids: [] }],
      film_tags: [
        { film_id: "f-lib", position: 1, is_primary: true, tag: gothicTag },
        { film_id: "f-dismissed", position: 1, is_primary: true, tag: gothicTag },
        { film_id: "f-twin-a", position: 1, is_primary: true, tag: gothicTag },
        { film_id: "f-twin-b", position: 1, is_primary: true, tag: gothicTag },
      ],
      fyp_not_interested: [{ user_id: USER_ID, film_id: "f-dismissed", created_at: "2020-01-01" }],
      fyp_impressions: [],
      films_with_stats: [],
    });

    const result = await getForYouShelves(client, USER_ID);

    expect(result.omen?.filmId).not.toBe("f-dismissed");
    for (const shelf of result.shelves) {
      expect(shelf.filmIds).not.toContain("f-dismissed");
    }
    expect(result.scoredById.has("f-dismissed")).toBe(false);
  });

  it("score path: impressions dampen score — a film with 50 impressions ranks below its identically-tagged twin with 0", async () => {
    const films = [
      ...STARTER_FILMS,
      {
        id: "f-twin-a",
        title: "Twin A",
        year: 2021,
        director: "Dir Twin A",
        artwork_url: null,
        first_seen_at: "2020-06-01T00:00:00.000Z",
        editorial_starter: false,
        available: true,
      },
      {
        id: "f-twin-b",
        title: "Twin B",
        year: 2021,
        director: "Dir Twin B",
        artwork_url: null,
        first_seen_at: "2020-06-01T00:00:00.000Z",
        editorial_starter: false,
        available: true,
      },
    ];

    const client = makeClient({
      films,
      library: [{ user_id: USER_ID, film_id: "f-lib", created_at: new Date().toISOString() }],
      watched: [],
      watchlists: [],
      activity: [],
      activity_reactions: [],
      profiles: [{ id: USER_ID, lane_tag_ids: [] }],
      film_tags: [
        { film_id: "f-lib", position: 1, is_primary: true, tag: gothicTag },
        { film_id: "f-twin-a", position: 1, is_primary: true, tag: gothicTag },
        { film_id: "f-twin-b", position: 1, is_primary: true, tag: gothicTag },
      ],
      fyp_not_interested: [],
      // f-twin-b has been shown 50 times with no action; f-twin-a has none.
      fyp_impressions: [{ user_id: USER_ID, film_id: "f-twin-b", impressions: 50 }],
      films_with_stats: [],
    });

    const result = await getForYouShelves(client, USER_ID);

    const twinA = result.scoredById.get("f-twin-a");
    const twinB = result.scoredById.get("f-twin-b");
    expect(twinA).toBeDefined();
    expect(twinB).toBeDefined();
    expect(twinB!.score).toBeLessThan(twinA!.score);
  });
});
