import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
  }),
}));

// Mock search helpers
vi.mock("@/lib/search/apple-tv", () => ({
  searchAppleTv: vi.fn(),
}));
vi.mock("@/lib/search/tmdb", () => ({
  searchTmdb: vi.fn(),
}));
vi.mock("film-goblin-worker", () => ({
  searchFilms: vi.fn(),
  parseFilm: vi.fn(),
}));
vi.mock("@/lib/search/itunes-hit", () => ({
  toHit: vi.fn(p => p),
}));

import { searchFilmForRequest } from "@/lib/actions/film-requests";
import { searchAppleTv } from "@/lib/search/apple-tv";
import { searchTmdb } from "@/lib/search/tmdb";
import { searchFilms, parseFilm } from "film-goblin-worker";

const mockSearchFilms = vi.mocked(searchFilms);
const mockParseFilm = vi.mocked(parseFilm);
const mockSearchAppleTv = vi.mocked(searchAppleTv);
const mockSearchTmdb = vi.mocked(searchTmdb);

const ITUNES_HIT = {
  itunes_id: 123, title: "The Fly", director: "David Cronenberg",
  year: 1986, runtime_min: 96, genre_primary: "Horror",
  description: "A scientist…", content_advisory: "R",
  artwork_url: "https://example.com/fly.jpg", itunes_url: "https://itunes.apple.com/…",
  price_usd: 3.99,
};

const TMDB_CANDIDATE = {
  tmdb_id: 999, title: "The Fly", year: 1986,
  poster_url: "https://image.tmdb.org/…", overview: "A scientist…",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchFilmForRequest — fallback chain", () => {
  it("returns iTunes hit when direct search succeeds", async () => {
    mockSearchFilms.mockResolvedValue({ resultCount: 1, results: [{} as any] });
    mockParseFilm.mockReturnValue(ITUNES_HIT as any);

    const result = await searchFilmForRequest("The Fly");

    expect(result).toEqual({ ok: true, result: { source: "itunes", hit: ITUNES_HIT } });
    expect(mockSearchAppleTv).not.toHaveBeenCalled();
    expect(mockSearchTmdb).not.toHaveBeenCalled();
  });

  it("falls back to Brave when iTunes search returns no results", async () => {
    mockSearchFilms.mockResolvedValue({ resultCount: 0, results: [] });
    mockSearchAppleTv.mockResolvedValue({ ok: true, candidates: [ITUNES_HIT] });

    const result = await searchFilmForRequest("The Fly");

    expect(result).toEqual({ ok: true, result: { source: "itunes", hit: ITUNES_HIT } });
    expect(mockSearchTmdb).not.toHaveBeenCalled();
  });

  it("falls back to TMDB when iTunes and Brave both fail", async () => {
    mockSearchFilms.mockResolvedValue({ resultCount: 0, results: [] });
    mockSearchAppleTv.mockResolvedValue({ ok: false, reason: "brave-empty", message: "no results" });
    mockSearchTmdb.mockResolvedValue({ ok: true, candidates: [TMDB_CANDIDATE] });

    const result = await searchFilmForRequest("The Fly");

    expect(result).toEqual({ ok: true, result: { source: "tmdb", hit: TMDB_CANDIDATE } });
  });

  it("returns manual fallback when all three sources fail", async () => {
    mockSearchFilms.mockResolvedValue({ resultCount: 0, results: [] });
    mockSearchAppleTv.mockResolvedValue({ ok: false, reason: "brave-error", message: "err" });
    mockSearchTmdb.mockResolvedValue({ ok: false, error: "TMDB down" });

    const result = await searchFilmForRequest("Some Obscure Film");

    expect(result).toEqual({ ok: true, result: { source: "manual", title: "Some Obscure Film" } });
  });

  it("returns manual fallback when iTunes throws", async () => {
    mockSearchFilms.mockRejectedValue(new Error("network error"));
    mockSearchAppleTv.mockResolvedValue({ ok: false, reason: "brave-error", message: "err" });
    mockSearchTmdb.mockResolvedValue({ ok: false, error: "TMDB down" });

    const result = await searchFilmForRequest("Some Film");

    expect(result).toEqual({ ok: true, result: { source: "manual", title: "Some Film" } });
  });

  it("returns auth error when not signed in", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any);

    const result = await searchFilmForRequest("The Fly");

    expect(result).toEqual({ ok: false, error: "Sign in to request films." });
    expect(mockSearchFilms).not.toHaveBeenCalled();
  });

  it("returns validation error for empty query", async () => {
    const result = await searchFilmForRequest("   ");

    expect(result).toEqual({ ok: false, error: "Enter a film title to search." });
    expect(mockSearchFilms).not.toHaveBeenCalled();
  });
});
