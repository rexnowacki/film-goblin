import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { searchItunesMovies } from "@/lib/itunes-availability/itunes-search";

// Emulates the live iTunes Search API as observed 2026-07-01: any request with
// entity=movie (or media=movie) returns zero results, while the default search
// returns a mixed-kind result set that includes feature movies.
const MIXED_RESULTS = {
  resultCount: 4,
  results: [
    {
      wrapperType: "track",
      kind: "song",
      trackId: 900,
      trackName: "Obsession",
      releaseDate: "1984-01-01T08:00:00Z",
      artistName: "Animotion",
    },
    {
      wrapperType: "track",
      kind: "feature-movie",
      trackId: 1895945921,
      trackName: "Obsession (2026)",
      releaseDate: "2026-06-26T07:00:00Z",
      artistName: "Curry Barker",
      trackViewUrl: "https://itunes.apple.com/us/movie/obsession-2026/id1895945921?uo=4",
      artworkUrl100: "https://example.com/100x100bb.jpg",
    },
    {
      wrapperType: "artist",
      artistName: "Obsession Band",
    },
    {
      wrapperType: "track",
      kind: "feature-movie",
      trackName: "Broken Row Missing TrackId",
      releaseDate: "2020-01-01T08:00:00Z",
      artistName: "Nobody",
    },
  ],
};

describe("searchItunesMovies", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const u = new URL(url.toString());
      const broken =
        u.searchParams.get("entity") === "movie" || u.searchParams.get("media") === "movie";
      const body = broken ? { resultCount: 0, results: [] } : MIXED_RESULTS;
      return new Response(JSON.stringify(body), { status: 200 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("finds feature movies via the default search despite the broken movie filter", async () => {
    const results = await searchItunesMovies("Obsession");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      trackId: 1895945921,
      trackName: "Obsession (2026)",
      artistName: "Curry Barker",
    });
  });

  it("excludes non-movie kinds and malformed rows", async () => {
    const results = await searchItunesMovies("Obsession");
    expect(results.some(r => r.trackName === "Obsession" && r.trackId === 900)).toBe(false);
    expect(results.some(r => r.trackName === "Broken Row Missing TrackId")).toBe(false);
  });
});
