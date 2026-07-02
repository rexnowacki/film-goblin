import { describe, it, expect } from "vitest";
import { scoreFilms, scoreOneFilm, starterPackScored, FATIGUE_FREE_IMPRESSIONS, FATIGUE_K, FATIGUE_FLOOR } from "@/lib/queries/fyp/score";
import type { FilmInput, ScoreContext } from "@/lib/queries/fyp/score";
import type { AffinityVector } from "@/lib/queries/fyp/affinity";
import type { FilmTagRow } from "@/lib/queries/film-tags";

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
  position = 6, // default to hidden-tail position so existing tests aren't boosted
) => ({ id: `t-${name}`, name, type, position, is_primary } as const);

/** Empty context — no watches, no dislikes, no ratings, no directors, no lanes.
 *  IDF defaults to 1.0 for any tag not in the map (no boost / no penalty),
 *  so the existing tests stay valid without listing every tag. */
const EMPTY_CTX: ScoreContext = {
  userWatchedFilmIds: new Set<string>(),
  userDislikedFilmIds: new Set<string>(),
  covenRatingByFilm: new Map<string, number>(),
  ownDirectors: new Set<string>(),
  lanesByTag: new Set<string>(),
  idfByTag: new Map<string, number>(),
  aversion: { byTag: {} },
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
    expect(result[0].score).toBeCloseTo(5.0); // 5.0 × 1.0 (idf default) × 1.0 (β) / sqrt(1)
    expect(result[1].filmId).toBe("f2");
    expect(result[1].score).toBeCloseTo(1.0); // 1.0 × 1.0 × 1.0 / sqrt(1)
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

  it("attributes top reason to the tag with the highest raw affinity (no μ at scoring)", () => {
    // v3: μ is no longer applied at scoring time — raw affinity dominates.
    // folk horror primary: 5 × 1.0 (idf) × 1.0 (β) = 5
    // gore content: 10 × 1.0 × 1.0 = 10
    // → gore wins because raw affinity is higher (5 vs 10), μ no longer inflates subgenre
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
    // total = (5 + 10) / sqrt(2) ≈ 10.607; topTag = gore with 10 / sqrt(2) ≈ 7.071
    expect(result[0].topReason.kind).toBe("tag");
    expect(result[0].topReason.tagName).toBe("gore");
    expect(result[0].topReason.contribution).toBeCloseTo(10 / Math.sqrt(2));
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

  it("does not attribute lane reason when a non-lane tag has a higher raw affinity", () => {
    // v3: without μ, raw affinity decides the winner.
    // folk horror (non-lane) primary: 6 × 1.0 × 1.0 = 6
    // gothic (lane) secondary: 5 × 1.0 × 1.0 = 5 → lower → tag reason
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
      { byTag: { "folk horror": 6, gothic: 5 } },
      ctx,
    );
    expect(result[0].topReason.kind).toBe("tag");
    expect(result[0].topReason.tagName).toBe("folk horror");
  });

  // ── 5. topReason: coven_rating ────────────────────────────────────────────

  it("attributes coven_rating reason when it exceeds the top tag contribution", () => {
    // folk horror: 0.1 × 1.0 (idf) × 1.0 (β) / sqrt(1) = 0.1
    // coven bonus for 90% rating: 0.9 → exceeds 0.1 → coven_rating reason
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
    // folk horror: 5 × 1.0 × 1.0 / sqrt(1) = 5.0 >> coven bonus 0.9 → tag reason
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
    // v3: no μ at scoring. gore content: 1 × 1.0 (idf) × 1.0 (β) = 1.0 < 1.5 threshold → director reason
    const films: FilmInput[] = [
      { id: "f1", director: "Ari Aster", tags: [TAG("gore", "content")] },
    ];
    const ctx: ScoreContext = {
      ...EMPTY_CTX,
      ownDirectors: new Set(["Ari Aster"]),
    };
    const result = scoreFilms(films, { byTag: { gore: 1 } }, ctx);
    expect(result[0].topReason.kind).toBe("director");
  });

  it("does not attribute director reason when a strong tag match exists (contrib >= 1.5)", () => {
    // v3: no μ at scoring. folk horror: 2 × 1.0 (idf) × 1.0 (β) = 2.0 >= 1.5 → tag reason wins over director
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
    const result = scoreFilms(films, { byTag: { "folk horror": 2 } }, ctx);
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
    // folk horror: 0.1 × 1.0 × 1.0 / sqrt(1) = 0.1
    // coven rating 69% → no bonus → total stays 0.1
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
    ];
    const ctx: ScoreContext = {
      ...EMPTY_CTX,
      covenRatingByFilm: new Map([["f1", 69]]),
    };
    const result = scoreFilms(films, { byTag: { "folk horror": 0.1 } }, ctx);
    expect(result[0].score).toBeCloseTo(0.1);
    expect(result[0].topReason.kind).toBe("tag"); // no coven reason
  });

  it("applies coven bonus exactly at 70", () => {
    // folk horror: 0.1 × 1.0 × 1.0 / sqrt(1) = 0.1
    // coven rating 70% → bonus 0.7 → total 0.8 — coven wins (0.7 > 0.1)
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
    ];
    const ctx: ScoreContext = {
      ...EMPTY_CTX,
      covenRatingByFilm: new Map([["f1", 70]]),
    };
    const result = scoreFilms(films, { byTag: { "folk horror": 0.1 } }, ctx);
    expect(result[0].score).toBeCloseTo(0.8);
    expect(result[0].topReason.kind).toBe("coven_rating");
  });

  // ── 10. Multi-tag score accumulation ──────────────────────────────────────

  it("accumulates contributions from multiple tags (with length penalty)", () => {
    // v3: folk horror: 2 × 1.0 × 1.0 = 2; arthouse: 1 × 1.0 × 1.0 = 1
    // sum = 3; length penalty: 3 / sqrt(2) ≈ 2.121
    // topTag = folk horror with 2 / sqrt(2) ≈ 1.414
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
    expect(result[0].score).toBeCloseTo(3 / Math.sqrt(2));
    expect(result[0].topReason.kind).toBe("tag");
    expect(result[0].topReason.tagName).toBe("folk horror");
    expect(result[0].topReason.contribution).toBeCloseTo(2 / Math.sqrt(2));
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

// ---------------------------------------------------------------------------
// TF-IDF tag weighting (recommender v2)
// ---------------------------------------------------------------------------

describe("scoreFilms — TF-IDF tag weighting", () => {
  it("rare tag scores higher than common tag, all else equal", () => {
    const TAG_AT = (name: string, position: number) =>
      ({ id: `t-${name}`, name, type: "tone" as const, position, is_primary: false });
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG_AT("rare", 6)] },
      { id: "f2", director: "x", tags: [TAG_AT("common", 6)] },
    ];
    // Affinity equal for both; IDF differs.
    const aff = { byTag: { rare: 1, common: 1 } };
    const ctx: ScoreContext = {
      ...EMPTY_CTX,
      idfByTag: new Map([
        ["rare", 3.0],   // log(150/5) ≈ 3.4 — rare in catalog
        ["common", 0.5], // log(150/90) ≈ 0.5 — near-universal
      ]),
    };
    const result = scoreFilms(films, aff, ctx);
    expect(result[0].filmId).toBe("f1");      // rare wins
    expect(result[0].score).toBeCloseTo(1 * 3.0); // aff × idf (no μ; sqrt(1)=1)
    expect(result[1].score).toBeCloseTo(1 * 0.5);
  });

  it("missing IDF entry defaults to 1.0 (no boost)", () => {
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
    ];
    const aff = { byTag: { "folk horror": 2 } };
    // No entry for "folk horror" — defaults to 1.0
    const result = scoreFilms(films, aff, { ...EMPTY_CTX, idfByTag: new Map() });
    expect(result[0].score).toBeCloseTo(2 * 1.0); // aff × idf-default (no μ; sqrt(1)=1)
  });
});

// ---------------------------------------------------------------------------
// Visible-tag position boost (positions 1-4 ≥ 1.3×)
// ---------------------------------------------------------------------------

describe("scoreFilms — visible-tag position boost", () => {
  it("position 1 contributes 1.3× a position 6 tag", () => {
    const TAG_AT = (position: number) =>
      ({ id: `t`, name: "shared", type: "tone" as const, position, is_primary: false });
    const visibleFilm: FilmInput = { id: "fA", director: "x", tags: [TAG_AT(1)] };
    const hiddenFilm: FilmInput = { id: "fB", director: "x", tags: [TAG_AT(6)] };
    const aff = { byTag: { shared: 5 } };

    const result = scoreFilms([visibleFilm, hiddenFilm], aff, EMPTY_CTX);
    expect(result[0].filmId).toBe("fA");
    expect(result[0].score).toBeCloseTo(5 * 1.3);  // aff × β(pos 1) / sqrt(1); no μ
    expect(result[1].score).toBeCloseTo(5 * 1.0);  // aff × β(pos 6) / sqrt(1)
    expect(result[0].score / result[1].score).toBeCloseTo(1.3);
  });

  it("position exactly 4 still gets the boost; position 5 does not", () => {
    const TAG_AT = (position: number) =>
      ({ id: `t`, name: "x", type: "tone" as const, position, is_primary: false });
    const at4: FilmInput = { id: "fA", director: "x", tags: [TAG_AT(4)] };
    const at5: FilmInput = { id: "fB", director: "x", tags: [TAG_AT(5)] };
    const aff = { byTag: { x: 1 } };
    const r = scoreFilms([at4, at5], aff, EMPTY_CTX);
    expect(r[0].filmId).toBe("fA");  // position 4 wins
    expect(r[0].score).toBeCloseTo(1 * 1.3);  // aff × β(pos 4); no μ
    expect(r[1].score).toBeCloseTo(1 * 1.0);  // aff × β(pos 5)
  });
});

// ---------------------------------------------------------------------------
// v3 new behaviour specs
// ---------------------------------------------------------------------------

describe("scoreFilms — v3 length penalty", () => {
  it("4-tag film scores 2× a 1-tag film when per-tag contribution is equal", () => {
    // Each tag has aff=3, idf=1, β=1 → per-tag raw contrib = 3.
    // 1-tag film: total = 3 / sqrt(1) = 3.
    // 4-tag film: total = 12 / sqrt(4) = 6.
    // Ratio = 2× (breadth rewarded, but only at the sqrt rate, not linearly).
    const oneTag: FilmInput = {
      id: "f1",
      director: "x",
      tags: [TAG("slasher", "subgenre", false)],
    };
    const fourTag: FilmInput = {
      id: "f2",
      director: "x",
      tags: [
        TAG("slasher", "subgenre", false),
        TAG("gore", "content"),
        TAG("suspense", "tone"),
        TAG("urban", "setting"),
      ],
    };
    const aff = { byTag: { slasher: 3, gore: 3, suspense: 3, urban: 3 } };
    const result = scoreFilms([oneTag, fourTag], aff, EMPTY_CTX);
    expect(result[0].filmId).toBe("f2"); // 4-tag film wins
    expect(result[0].score).toBeCloseTo(3 * 4 / Math.sqrt(4)); // = 6
    expect(result[1].score).toBeCloseTo(3 / Math.sqrt(1));     // = 3
    expect(result[0].score / result[1].score).toBeCloseTo(2);
  });
});

describe("scoreFilms — v3 μ no longer applied at scoring", () => {
  it("content tag and primary-subgenre tag with equal affinity now contribute equally", () => {
    // Old formula: primary subgenre ×3.0 vs content ×0.5 → 6× difference.
    // v3: both contribute aff × 1.0 × 1.0 = same raw contrib.
    const filmPrimary: FilmInput = {
      id: "f1",
      director: "x",
      tags: [TAG("folk horror", "subgenre", true)],
    };
    const filmContent: FilmInput = {
      id: "f2",
      director: "x",
      tags: [TAG("gore", "content")],
    };
    const aff = { byTag: { "folk horror": 4, gore: 4 } };
    const result = scoreFilms([filmPrimary, filmContent], aff, EMPTY_CTX);
    // Both films have 1 tag, aff=4, idf=1, β=1 → score = 4 each.
    expect(result[0].score).toBeCloseTo(result[1].score);
    expect(result[0].score).toBeCloseTo(4.0);
  });
});

describe("scoreFilms — v3 IDF still applied", () => {
  it("high-IDF tag outscores low-IDF tag with the same affinity", () => {
    // Both films: 1 tag, aff=2, β=1. IDF differs: 4.0 vs 0.25.
    // f1 (distinctive): 2 × 4.0 / sqrt(1) = 8.0
    // f2 (common):      2 × 0.25 / sqrt(1) = 0.5
    const highIdf: FilmInput = {
      id: "f1",
      director: "x",
      tags: [TAG("slow burn", "tone")],
    };
    const lowIdf: FilmInput = {
      id: "f2",
      director: "x",
      tags: [TAG("atmospheric", "tone")],
    };
    const aff = { byTag: { "slow burn": 2, atmospheric: 2 } };
    const ctx: ScoreContext = {
      ...EMPTY_CTX,
      idfByTag: new Map([
        ["slow burn", 4.0],    // distinctive — appears in few films
        ["atmospheric", 0.25], // near-universal — appears in almost everything
      ]),
    };
    const result = scoreFilms([highIdf, lowIdf], aff, ctx);
    expect(result[0].filmId).toBe("f1");
    expect(result[0].score).toBeCloseTo(2 * 4.0);
    expect(result[1].score).toBeCloseTo(2 * 0.25);
    expect(result[0].score / result[1].score).toBeCloseTo(16);
  });
});

// ---------------------------------------------------------------------------
// v3 aversion vector
// ---------------------------------------------------------------------------

describe("scoreFilms — aversion", () => {
  it("empty aversion vector → score equals previous formula output (unchanged)", () => {
    // Aversion byTag = {} → aversionTotal = 0 → total unchanged.
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
    ];
    const aff = { byTag: { "folk horror": 5 } };
    const noAversion: ScoreContext = { ...EMPTY_CTX, aversion: { byTag: {} } };
    const result = scoreFilms(films, aff, noAversion);
    // 5 × 1.0 (idf) × 1.0 (β) / sqrt(1) = 5
    expect(result).toHaveLength(1);
    expect(result[0].score).toBeCloseTo(5.0);
  });

  it("equal positive and aversion on matching tag → score = (5 - 0.8 × 5) × per-tag-factors", () => {
    // 1-tag film: idf=1, β=1, length-denom=sqrt(1)=1
    // positive contrib = 5 × 1 × 1 / 1 = 5
    // aversion contrib = 5 × 1 × 1 / 1 = 5
    // final score = 5 - 0.8 × 5 = 1.0
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
    ];
    const aff = { byTag: { "folk horror": 5 } };
    const ctx: ScoreContext = {
      ...EMPTY_CTX,
      aversion: { byTag: { "folk horror": 5 } },
    };
    const result = scoreFilms(films, aff, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBeCloseTo(1.0); // 5 - 0.8 × 5 = 1
  });

  it("aversion exceeds positive → film excluded (total ≤ 0)", () => {
    // positive contrib = 3; aversion contrib = 6 (stronger dislike)
    // final = 3 - 0.8 × 6 = 3 - 4.8 = -1.8 → filtered out
    const films: FilmInput[] = [
      { id: "f1", director: "x", tags: [TAG("slasher", "subgenre", true)] },
      { id: "f2", director: "x", tags: [TAG("gothic", "subgenre", true)] }, // no aversion
    ];
    const aff = { byTag: { slasher: 3, gothic: 4 } };
    const ctx: ScoreContext = {
      ...EMPTY_CTX,
      aversion: { byTag: { slasher: 6 } }, // f1 aversion suppresses it
    };
    const result = scoreFilms(films, aff, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].filmId).toBe("f2");
  });

  it("aversion on a tag the user has no positive affinity for → still penalises", () => {
    // f1: 2 tags — "folk horror" (aff=4) and "gore" (aff=0 but aversion=3)
    // positive total = 4 × 1 × 1 = 4; length denom = sqrt(2)
    // positive after denom = 4 / sqrt(2) ≈ 2.828
    // aversion total = 3 × 1 × 1 / sqrt(2) ≈ 2.121
    // final = 2.828 - 0.8 × 2.121 ≈ 2.828 - 1.697 ≈ 1.131
    const films: FilmInput[] = [
      {
        id: "f1",
        director: "x",
        tags: [TAG("folk horror", "subgenre", true), TAG("gore", "content")],
      },
    ];
    const aff = { byTag: { "folk horror": 4 } }; // no affinity for gore
    const ctx: ScoreContext = {
      ...EMPTY_CTX,
      aversion: { byTag: { gore: 3 } },
    };
    const result = scoreFilms(films, aff, ctx);
    expect(result).toHaveLength(1);
    const expected = 4 / Math.sqrt(2) - 0.8 * (3 / Math.sqrt(2));
    expect(result[0].score).toBeCloseTo(expected);
  });
});

// ---------------------------------------------------------------------------
// v3.5 dismissal exclusion + impression fatigue
// ---------------------------------------------------------------------------

function baseCtx(over: Partial<ScoreContext> = {}): ScoreContext {
  return {
    userWatchedFilmIds: new Set<string>(),
    userDislikedFilmIds: new Set<string>(),
    covenRatingByFilm: new Map<string, number>(),
    ownDirectors: new Set<string>(),
    lanesByTag: new Set<string>(),
    idfByTag: new Map<string, number>(),
    aversion: { byTag: {} },
    ...over,
  };
}

const tag = (name: string): FilmTagRow =>
  ({ id: "t-" + name, name, type: "subgenre", position: 1, is_primary: true } as const);

const filmInput = (id: string): FilmInput => ({ id, director: "D", tags: [tag("folk-horror")] });

const affinity: AffinityVector = { byTag: { "folk-horror": 10 } };

describe("v3.5 dismissal exclusion", () => {
  it("excludes not-interested films from scoreFilms output", () => {
    const out = scoreFilms([filmInput("f1"), filmInput("f2")], affinity,
      baseCtx({ notInterestedFilmIds: new Set(["f1"]) }));
    expect(out.map(s => s.filmId)).toEqual(["f2"]);
  });
});

describe("v3.5 impression fatigue", () => {
  it("first FATIGUE_FREE_IMPRESSIONS impressions cost nothing", () => {
    const fresh = scoreOneFilm(filmInput("f1"), affinity, baseCtx()).score;
    const shown = scoreOneFilm(filmInput("f1"), affinity,
      baseCtx({ impressionsByFilm: new Map([["f1", FATIGUE_FREE_IMPRESSIONS]]) })).score;
    expect(shown).toBe(fresh);
  });

  it("damps score beyond the free threshold", () => {
    const fresh = scoreOneFilm(filmInput("f1"), affinity, baseCtx()).score;
    const shown = scoreOneFilm(filmInput("f1"), affinity,
      baseCtx({ impressionsByFilm: new Map([["f1", FATIGUE_FREE_IMPRESSIONS + 4]]) })).score;
    expect(shown).toBeCloseTo(fresh * (1 / (1 + FATIGUE_K * 4)), 10);
  });

  it("never damps below FATIGUE_FLOOR", () => {
    const fresh = scoreOneFilm(filmInput("f1"), affinity, baseCtx()).score;
    const buried = scoreOneFilm(filmInput("f1"), affinity,
      baseCtx({ impressionsByFilm: new Map([["f1", 500]]) })).score;
    expect(buried).toBeCloseTo(fresh * FATIGUE_FLOOR, 10);
  });
});
