import { describe, it, expect, vi } from "vitest";
import { getFilms } from "@/lib/queries/films";

// Mocks the chained PostgREST builder for both `films_with_stats` and `library`
// tables. Returns the client + spies so tests can assert on which calls fired.
function makeFilmsClient(opts: { ownedIds?: string[] } = {}) {
  const fromCalls: string[] = [];
  const filmsChain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
  };
  const libraryChain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({
      data: (opts.ownedIds ?? []).map(id => ({ film_id: id })),
      error: null,
    }),
  };
  const client = {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      return table === "library" ? libraryChain : filmsChain;
    }),
  } as any;
  return { client, fromCalls, filmsChain };
}

describe("getFilms — viewerUserId discovery filter", () => {
  it("queries library and appends .not(id, in, (...)) when viewerUserId is set + viewer owns films", async () => {
    const { client, fromCalls, filmsChain } = makeFilmsClient({ ownedIds: ["f1", "f2"] });
    await getFilms(client, { viewerUserId: "u1" });
    expect(fromCalls).toContain("library");
    expect(filmsChain.not).toHaveBeenCalledWith("id", "in", `("f1","f2")`);
  });

  it("queries library but skips .not() when viewer owns nothing", async () => {
    const { client, fromCalls, filmsChain } = makeFilmsClient({ ownedIds: [] });
    await getFilms(client, { viewerUserId: "u1" });
    expect(fromCalls).toContain("library");
    expect(filmsChain.not).not.toHaveBeenCalled();
  });

  it("does not query library at all when viewerUserId is null", async () => {
    const { client, fromCalls, filmsChain } = makeFilmsClient();
    await getFilms(client, { viewerUserId: null });
    expect(fromCalls).not.toContain("library");
    expect(filmsChain.not).not.toHaveBeenCalled();
  });

  it("does not query library when viewerUserId is omitted entirely", async () => {
    const { client, fromCalls } = makeFilmsClient();
    await getFilms(client, {});
    expect(fromCalls).not.toContain("library");
  });
});
