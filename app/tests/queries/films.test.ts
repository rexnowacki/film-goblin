import { describe, it, expect, vi } from "vitest";
import { getFilms } from "@/lib/queries/films";

// Mocks the chained PostgREST builder for `films_with_stats`, `library`, and
// `watchlists`. Returns the client + spies so tests can assert on which calls
// fired and which IDs landed in the .not("id","in",…) exclusion clause.
function makeFilmsClient(opts: {
  ownedIds?: string[];
  watchlistedIds?: string[];
  filmRows?: Array<Record<string, unknown>>;
} = {}) {
  const fromCalls: string[] = [];
  const filmsChain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({
      data: opts.filmRows ?? [],
      error: null,
      count: opts.filmRows?.length ?? 0,
    }),
  };
  const libraryChain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({
      data: (opts.ownedIds ?? []).map(id => ({ film_id: id })),
      error: null,
    }),
  };
  const watchlistsChain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({
      data: (opts.watchlistedIds ?? []).map(id => ({ film_id: id })),
      error: null,
    }),
  };
  const client = {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      if (table === "library") return libraryChain;
      if (table === "watchlists") return watchlistsChain;
      return filmsChain;
    }),
  } as any;
  return { client, fromCalls, filmsChain };
}

describe("getFilms — viewerUserId discovery filter", () => {
  it("excludes owned + watchlisted via .not() when viewerUserId is set in default browse", async () => {
    const { client, fromCalls, filmsChain } = makeFilmsClient({
      ownedIds: ["f1"],
      watchlistedIds: ["f2"],
    });
    await getFilms(client, { viewerUserId: "u1" });
    expect(fromCalls).toContain("library");
    expect(fromCalls).toContain("watchlists");
    const [, , idList] = filmsChain.not.mock.calls[0];
    expect(idList).toContain('"f1"');
    expect(idList).toContain('"f2"');
  });

  it("queries library + watchlists but skips .not() when viewer has nothing saved", async () => {
    const { client, filmsChain } = makeFilmsClient({ ownedIds: [], watchlistedIds: [] });
    await getFilms(client, { viewerUserId: "u1" });
    expect(filmsChain.not).not.toHaveBeenCalled();
  });

  it("does not query library or watchlists when viewerUserId is null", async () => {
    const { client, fromCalls, filmsChain } = makeFilmsClient();
    await getFilms(client, { viewerUserId: null });
    expect(fromCalls).not.toContain("library");
    expect(fromCalls).not.toContain("watchlists");
    expect(filmsChain.not).not.toHaveBeenCalled();
  });

  it("does not query library or watchlists when viewerUserId is omitted entirely", async () => {
    const { client, fromCalls } = makeFilmsClient();
    await getFilms(client, {});
    expect(fromCalls).not.toContain("library");
    expect(fromCalls).not.toContain("watchlists");
  });
});

describe("getFilms — search lifts the exclusion but tags rows", () => {
  it("skips .not() when q is set so saved films can be searched", async () => {
    const { client, filmsChain } = makeFilmsClient({
      ownedIds: ["f1"],
      watchlistedIds: ["f2"],
    });
    await getFilms(client, { viewerUserId: "u1", q: "suspiria" });
    expect(filmsChain.not).not.toHaveBeenCalled();
    expect(filmsChain.or).toHaveBeenCalled();
  });

  it("tags returned rows with on_watchlist / in_library flags in search mode", async () => {
    const { client } = makeFilmsClient({
      ownedIds: ["f1"],
      watchlistedIds: ["f2"],
      filmRows: [
        { id: "f1", title: "Owned" },
        { id: "f2", title: "Saved" },
        { id: "f3", title: "Neither" },
      ],
    });
    const { rows } = await getFilms(client, { viewerUserId: "u1", q: "anything" });
    expect(rows.find(r => r.id === "f1")).toMatchObject({ in_library: true, on_watchlist: false });
    expect(rows.find(r => r.id === "f2")).toMatchObject({ in_library: false, on_watchlist: true });
    expect(rows.find(r => r.id === "f3")).toMatchObject({ in_library: false, on_watchlist: false });
  });

  it("treats whitespace-only q as default browse (still excludes)", async () => {
    const { client, filmsChain } = makeFilmsClient({
      ownedIds: ["f1"],
      watchlistedIds: [],
    });
    await getFilms(client, { viewerUserId: "u1", q: "   " });
    expect(filmsChain.not).toHaveBeenCalled();
    expect(filmsChain.or).not.toHaveBeenCalled();
  });
});
