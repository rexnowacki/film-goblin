import { describe, it, expect } from "vitest";
import { scoreFilms, starterPackScored } from "@/lib/queries/fyp/score";
import type { FilmInput, ScoreContext } from "@/lib/queries/fyp/score";
import type { AffinityVector } from "@/lib/queries/fyp/affinity";

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal FilmTagRow fixture. position defaults to 1 and can be
 * overridden but isn't significant for scoring (only type + is_primary matter).
 */
const TAG = (
  name: string,
  type: "subgenre" | "tone" | "theme" | "subject" | "setting" | "content",
  is_primary = false,
) => ({ id: `t-${name}`, name, type, position: 1, is_primary } as const);

/** Empty context — no watches, no dislikes, no ratings, no directors, no lanes. */
const EMPTY_CTX: ScoreContext = {
  userWatchedFilmIds: new Set<string>(),
  userDislikedFilmIds: new Set<string>(),
  covenRatingByFilm: new Map<string, number>(),
  ownDirectors: new Set<string>(),
  lanesByTag: new Set<string>(),
};

// ---------------------------------------------------------------------------
// Scoring math constants (mirror FACET_MULTIPLIERS from affinity.ts)
// ---------------------------------------------------------------------------
// subgenre primary = 3.0, subgenre secondary = 1.5
// tone = 1.5, theme = 1.5, subject = 1.0, setting = 0.75, content = 0.5

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scoreFilms", () => {
  // ── 1. Basic ranking ──────────────────────────────────────────────────────

  it("ranks higher-affinity films first", () => {
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
      { id: "f2", director: "x", tags: [TAG("gothic", "subgenre", true)] },
    ];
    const affinity: AffinityVector = { byTag: { "folk horror": 5.0, gothic: 1.0 } };
    const result = scoreFilms(films, affinity, EMPTY_CTX);

    expect(result).toHaveLength(2);
    expect(result[0].filmId).toBe("f1");
    expect(result[0].score).toBeCloseTo(15.0); // 5.0 × 3.0 (primary subgenre)
    expect(result[1].filmId).toBe("f2");
    expect(result[1].score).toBeCloseTo(3.0);  // 1.0 × 3.0
  });

  // ── 2. Exclusions ─────────────────────────────────────────────────────────

  it("excludes already-watched films", () => {
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
    ];
    const ctx: ScoreContext = { ...EMPTY_CTX, userWatchedFilmIds: new Set(["f1"]) };
    const result = scoreFilms(films, { byTag: { "folk horror": 5 } }, ctx);
    expect(result).toHaveLength(0);
  });

  it("excludes disliked films", () => {
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
    ];
    const ctx: ScoreContext = { ...EMPTY_CTX, userDislikedFilmIds: new Set(["f1"]) };
    const result = scoreFilms(films, { byTag: { "folk horror": 5 } }, ctx);
    expect(result).toHaveLength(0);
  });

  // ── 3. topReason: tag ─────────────────────────────────────────────────────

  it("attributes top reason to the strongest tag by weighted contribution", () => {
    // folk horror primary (×3.0): 5×3.0 = 15
    // gore content (×0.5): 10×0.5 = 5
    // → folk horror wins despite lower raw affinity
    const films: FilmInput[] = [
      {
        id: "f1",
        director: "x",
        tags: [TAG("folk horror", "subgenre", true), TAG("gore", "content")],
      },
    ];
    const result = scoreFilms(
      films,
      { byTag: { "folk horror": 5, gore: 10 } },
      EMPTY_CTX,
    );
    expect(result[0].topReason.kind).toBe("tag");
    expect(result[0].topReason.tagName).toBe("folk horror");
    expect(result[0].topReason.contribution).toBeCloseTo(15.0);
  });

  // ── 4. topReason: lane ────────────────────────────────────────────────────

  it("attributes lane reason when a lane tag is the strongest match", () => {
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
    ];
    const ctx: ScoreContext = { ...EMPTY_CTX, lanesByTag: new Set(["folk horror"]) };
    const result = scoreFilms(films, { byTag: { "folk horror": 5 } }, ctx);
    expect(result[0].topReason.kind).toBe("lane");
    expect(result[0].topReason.tagName).toBe("folk horror");
  });

  it("does not attribute lane reason when a non-lane tag has a higher contribution", () => {
    // gothic (lane) secondary (×1.5): 5×1.5 = 7.5
    // folk horror (non-lane) primary (×3.0): 4×3.0 = 12 → higher → tag reason
    const films: FilmInput[] = [
      {
        id: "f1",
        director: "x",
        tags: [
          TAG("folk horror", "subgenre", true),
          TAG("gothic", "subgenre", false),
        ],
      },
    ];
    const ctx: ScoreContext = { ...EMPTY_CTX, lanesByTag: new Set(["gothic"]) };
    const result = scoreFilms(
      films,
      { byTag: { "folk horror": 4, gothic: 5 } },
      ctx,
    );
    expect(result[0].topReason.kind).toBe("tag");
    expect(result[0].topReason.tagName).toBe("folk horror");
  });

  // ── 5. topReason: coven_rating ────────────────────────────────────────────

  it("attributes coven_rating reason when it exceeds the top tag contribution", () => {
    // folk horror primary (×3.0): 0.1×3.0 = 0.3
    // coven bonus for 90% rating: 0.9 → exceeds 0.3
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
    ];
    const ctx: ScoreContext = {
      ...EMPTY_CTX,
      covenRatingByFilm: new Map([["f1", 90]]),
    };
    const result = scoreFilms(films, { byTag: { "folk horror": 0.1 } }, ctx);
    expect(result[0].topReason.kind).toBe("coven_rating");
    expect(result[0].topReason.contribution).toBeCloseTo(0.9);
  });

  it("does not attribute coven_rating reason when tag contribution is higher", () => {
    // folk horror primary (×3.0): 5×3.0 = 15 >> coven bonus 0.9
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
    ];
    const ctx: ScoreContext = {
      ...EMPTY_CTX,
      covenRatingByFilm: new Map([["f1", 90]]),
    };
    const result = scoreFilms(films, { byTag: { "folk horror": 5 } }, ctx);
    expect(result[0].topReason.kind).toBe("tag");
  });

  // ── 6. topReason: director ────────────────────────────────────────────────

  it("attributes director reason when director matches and no strong tag exists", () => {
    // gore content (×0.5): 2×0.5 = 1.0 < 1.5 threshold → director reason
    const films: FilmInput[] = [
      { id: "f1", director: "Ari Aster", tags: [TAG("gore", "content")] },
    ];
    const ctx: ScoreContext = {
      ...EMPTY_CTX,
      ownDirectors: new Set(["Ari Aster"]),
    };
    const result = scoreFilms(films, { byTag: { gore: 2 } }, ctx);
    expect(result[0].topReason.kind).toBe("director");
  });

  it("does not attribute director reason when a strong tag match exists (contrib >= 1.5)", () => {
    // folk horror primary (×3.0): 1×3.0 = 3.0 >= 1.5 → tag reason wins over director
    const films: FilmInput[] = [
      {
        id: "f1",
        director: "Ari Aster",
        tags: [TAG("folk horror", "subgenre", true)],
      },
    ];
    const ctx: ScoreContext = {
      ...EMPTY_CTX,
      ownDirectors: new Set(["Ari Aster"]),
    };
    const result = scoreFilms(films, { byTag: { "folk horror": 1 } }, ctx);
    expect(result[0].topReason.kind).toBe("tag");
  });

  // ── 7. Stable sort on tied scores ─────────────────────────────────────────

  it("breaks score ties by filmId ascending (stable, deterministic)", () => {
    // Three films with identical tag and affinity → identical scores.
    const films: FilmInput[] = [
      { id: "film-c", director: "x", tags: [TAG("gore", "content")] },
      { id: "film-a", director: "x", tags: [TAG("gore", "content")] },
      { id: "film-b", director: "x", tags: [TAG("gore", "content")] },
    ];
    const result = scoreFilms(films, { byTag: { gore: 2 } }, EMPTY_CTX);
    expect(result.map((r) => r.filmId)).toEqual(["film-a", "film-b", "film-c"]);
  });

  // ── 8. Zero/negative score filtering ──────────────────────────────────────

  it("filters out films with total score <= 0", () => {
    const films: FilmInput[] = [
      // No affinity for this tag → total = 0
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
      // Has affinity → total > 0
      { id: "f2", director: "x", tags: [TAG("gothic", "subgenre", true)] },
    ];
    const result = scoreFilms(
      films,
      { byTag: { gothic: 2.0 } }, // folk horror has no affinity → contrib 0
      EMPTY_CTX,
    );
    expect(result).toHaveLength(1);
    expect(result[0].filmId).toBe("f2");
  });

  // ── 9. Coven rating threshold ──────────────────────────────────────────────

  it("applies no coven bonus for ratings below 70", () => {
    // folk horror primary (×3.0): 0.1×3.0 = 0.3
    // coven rating 69% → no bonus → total stays 0.3
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
    ];
    const ctx: ScoreContext = {
      ...EMPTY_CTX,
      covenRatingByFilm: new Map([["f1", 69]]),
    };
    const result = scoreFilms(films, { byTag: { "folk horror": 0.1 } }, ctx);
    expect(result[0].score).toBeCloseTo(0.3);
    expect(result[0].topReason.kind).toBe("tag"); // no coven reason
  });

  it("applies coven bonus exactly at 70", () => {
    // folk horror primary (×3.0): 0.1×3.0 = 0.3
    // coven rating 70% → bonus 0.7 → total 1.0 — coven wins
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
    ];
    const ctx: ScoreContext = {
      ...EMPTY_CTX,
      covenRatingByFilm: new Map([["f1", 70]]),
    };
    const result = scoreFilms(films, { byTag: { "folk horror": 0.1 } }, ctx);
    expect(result[0].score).toBeCloseTo(1.0);
    expect(result[0].topReason.kind).toBe("coven_rating");
  });

  // ── 10. Multi-tag score accumulation ──────────────────────────────────────

  it("accumulates contributions from multiple tags", () => {
    // folk horror primary (×3.0): 2×3.0 = 6.0
    // arthouse tone (×1.5): 1×1.5 = 1.5
    // total = 7.5
    const films: FilmInput[] = [
      {
        id: "f1",
        director: "x",
        tags: [
          TAG("folk horror", "subgenre", true),
          TAG("arthouse", "tone"),
        ],
      },
    ];
    const result = scoreFilms(
      films,
      { byTag: { "folk horror": 2, arthouse: 1 } },
      EMPTY_CTX,
    );
    expect(result[0].score).toBeCloseTo(7.5);
    expect(result[0].topReason.kind).toBe("tag");
    expect(result[0].topReason.tagName).toBe("folk horror");
  });

  // ── 11. Empty input ────────────────────────────────────────────────────────

  it("returns empty array when no films are provided", () => {
    expect(scoreFilms([], { byTag: { "folk horror": 5 } }, EMPTY_CTX)).toEqual(
      [],
    );
  });

  it("returns empty array when affinity vector is empty", () => {
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
    ];
    expect(scoreFilms(films, { byTag: {} }, EMPTY_CTX)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// starterPackScored
// ---------------------------------------------------------------------------

describe("starterPackScored", () => {
  it("returns one ScoredFilm per id with kind=starter and score=0", () => {
    const result = starterPackScored(["f1", "f2", "f3"]);
    expect(result).toHaveLength(3);
    for (const r of result) {
      expect(r.score).toBe(0);
      expect(r.topReason.kind).toBe("starter");
      expect(r.topReason.contribution).toBe(0);
    }
    expect(result.map((r) => r.filmId)).toEqual(["f1", "f2", "f3"]);
  });

  it("returns empty array for empty input", () => {
    expect(starterPackScored([])).toEqual([]);
  });
});
