import { describe, expect, it } from "vitest";
import { rankTasteTwins } from "@/lib/taste-twins/rank";
const facets = { folk: "subgenre", bleak: "tone", grief: "theme" } as const;
describe("rankTasteTwins", () => {
  it("requires three evidence films and two shared facets, then orders by cosine", () => {
    const viewer = { byTag: { folk: 5, bleak: 4, grief: 1 } };
    const base = { evidenceFilmCount: 3, watchlistOverlap: 0, secondDegree: false, sharedFilm: null };
    const ranked = rankTasteTwins(viewer, [
      { ...base, userId: "b", vector: { byTag: { folk: 5, bleak: 4 } } },
      { ...base, userId: "a", vector: { byTag: { folk: 1, bleak: 1, grief: 9 } } },
      { ...base, userId: "thin", evidenceFilmCount: 2, vector: { byTag: { folk: 5, bleak: 4 } } },
    ], facets, 5);
    expect(ranked.map(x => x.userId)).toEqual(["b", "a"]);
    expect(ranked[0].sharedTraits.map(x => x.facet)).toEqual(["subgenre", "tone"]);
  });
  it("labels cold-start fallbacks honestly and returns none without evidence", () => {
    const base = { vector: { byTag: {} }, evidenceFilmCount: 0, sharedFilm: null };
    expect(rankTasteTwins({ byTag: {} }, [
      { ...base, userId: "overlap", watchlistOverlap: 2, secondDegree: false },
      { ...base, userId: "second", watchlistOverlap: 0, secondDegree: true },
      { ...base, userId: "none", watchlistOverlap: 1, secondDegree: false },
    ], facets, 5).map(x => [x.userId, x.source])).toEqual([["second", "second_degree"], ["overlap", "watchlist_overlap"]]);
  });
  it("uses a stable user-id tie break and limit", () => {
    const base = { vector: { byTag: {} }, evidenceFilmCount: 0, watchlistOverlap: 2, secondDegree: false, sharedFilm: null };
    expect(rankTasteTwins({ byTag: {} }, [{ ...base, userId: "b" }, { ...base, userId: "a" }], facets, 1)[0].userId).toBe("a");
  });
});
