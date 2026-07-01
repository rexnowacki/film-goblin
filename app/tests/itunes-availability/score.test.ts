import { describe, expect, it } from "vitest";
import { scoreMatch, type FilmInput, type ItunesCandidate } from "@/lib/itunes-availability/score";

const film = (over: Partial<FilmInput> = {}): FilmInput => ({
  title: "The Substance",
  year: 2024,
  director: "Coralie Fargeat",
  ...over,
});

const cand = (over: Partial<ItunesCandidate> = {}): ItunesCandidate => ({
  trackId: 12345,
  trackName: "The Substance",
  releaseDate: "2024-09-20T07:00:00Z",
  artistName: "Coralie Fargeat",
  trackViewUrl: "https://itunes.apple.com/us/movie/the-substance/id12345",
  artworkUrl100: "https://example.com/100.jpg",
  ...over,
});

describe("scoreMatch", () => {
  it("scores exact title + exact year + director at 1.0", () => {
    const r = scoreMatch(film(), cand());
    expect(r.confidence).toBe(1.0);
    expect(r.matchType).toBe("exact_title_year_director");
  });

  it("scores exact title + exact year (no director) at 0.9", () => {
    const r = scoreMatch(film(), cand({ artistName: "Someone Else" }));
    expect(r.confidence).toBeCloseTo(0.9, 5);
    expect(r.matchType).toBe("exact_title_year");
  });

  it("scores exact title + year ±1 at 0.75", () => {
    const r = scoreMatch(film(), cand({ releaseDate: "2025-01-15T07:00:00Z", artistName: "Nope" }));
    expect(r.confidence).toBeCloseTo(0.75, 5);
    expect(r.matchType).toBe("exact_title_fuzzy_year");
  });

  it("scores normalized title (article diff) + exact year at 0.7", () => {
    const r = scoreMatch(
      film({ title: "The Substance" }),
      cand({ trackName: "Substance", artistName: "Nope" }),
    );
    expect(r.confidence).toBeCloseTo(0.7, 5);
    expect(r.matchType).toBe("normalized_title_year");
  });

  it("scores normalized title (apostrophe diff) + exact year at 0.7", () => {
    const r = scoreMatch(
      film({ title: "Don't Breathe" }),
      cand({ trackName: "Dont Breathe", artistName: "Nope" }),
    );
    expect(r.confidence).toBeCloseTo(0.7, 5);
  });

  it("treats lowercase-only difference as exact match", () => {
    const r = scoreMatch(film(), cand({ trackName: "the substance", artistName: "Nope" }));
    expect(r.confidence).toBeCloseTo(0.9, 5);
    expect(r.matchType).toBe("exact_title_year");
  });

  it("falls below threshold when title doesn't normalize the same", () => {
    const r = scoreMatch(film({ title: "Alien" }), cand({ trackName: "Aliens", artistName: "Nope" }));
    expect(r.confidence).toBeLessThan(0.45);
    expect(r.matchType).toBe("below_threshold");
  });

  it("scores year mismatch >1 as no year score", () => {
    const r = scoreMatch(film(), cand({ releaseDate: "2027-01-15T07:00:00Z", artistName: "Nope" }));
    expect(r.confidence).toBeCloseTo(0.6, 5);
  });

  it("director match adds +0.1 even with fuzzy year", () => {
    const r = scoreMatch(film(), cand({ releaseDate: "2025-09-20T07:00:00Z" }));
    // exact title (0.6) + year ±1 (0.15) + director (0.1) = 0.85
    expect(r.confidence).toBeCloseTo(0.85, 5);
    expect(r.matchType).toBe("exact_title_fuzzy_year_director");
  });

  it("caps confidence at 1.0", () => {
    const r = scoreMatch(film(), cand());
    expect(r.confidence).toBeLessThanOrEqual(1.0);
  });

  // Apple names new listings with a parenthesized year suffix — e.g.
  // "Obsession (2026)", "The Boy Next Door (2015)", "Magnificent Obsession (1954)".
  it("treats a trailing (YYYY) suffix on the candidate as exact title", () => {
    const r = scoreMatch(
      film({ title: "Obsession", year: 2026, director: "Curry Barker" }),
      cand({
        trackName: "Obsession (2026)",
        releaseDate: "2026-06-26T07:00:00Z",
        artistName: "Curry Barker",
      }),
    );
    expect(r.confidence).toBe(1.0);
    expect(r.matchType).toBe("exact_title_year_director");
  });

  it("strips a trailing (YYYY) suffix from the film title side too", () => {
    const r = scoreMatch(
      film({ title: "Obsession (2026)", year: 2026, director: "Curry Barker" }),
      cand({
        trackName: "Obsession",
        releaseDate: "2026-06-26T07:00:00Z",
        artistName: "Curry Barker",
      }),
    );
    expect(r.confidence).toBe(1.0);
    expect(r.matchType).toBe("exact_title_year_director");
  });

  it("does not strip non-year parentheticals", () => {
    const r = scoreMatch(
      film({ title: "Obsession", year: 2026, director: "Curry Barker" }),
      cand({
        trackName: "Obsession (Unrated)",
        releaseDate: "2026-06-26T07:00:00Z",
        artistName: "Curry Barker",
      }),
    );
    expect(r.matchType).toBe("below_threshold");
  });

  it("does not treat a bare year title as a strippable suffix", () => {
    const r = scoreMatch(
      film({ title: "1917", year: 2019, director: "Sam Mendes" }),
      cand({
        trackName: "1917",
        releaseDate: "2019-12-25T07:00:00Z",
        artistName: "Sam Mendes",
      }),
    );
    expect(r.confidence).toBe(1.0);
    expect(r.matchType).toBe("exact_title_year_director");
  });
});
