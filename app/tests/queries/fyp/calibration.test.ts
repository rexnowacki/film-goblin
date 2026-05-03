/**
 * Tests for app/lib/queries/fyp/calibration.ts
 *
 * Pure-function tests — no env or DB required.
 *
 * Quartile method: sorted-index — q[k] = sorted[Math.floor(n * k/4)]
 *   Example: n=4 scores [10,20,30,40]
 *     q1 = sorted[1] = 20
 *     q2 = sorted[2] = 30
 *     q3 = sorted[3] = 40
 */
import { describe, it, expect } from "vitest";
import {
  buildCalibrationStats,
  scoreToPercentage,
} from "@/lib/queries/fyp/calibration";
import type { CalibrationStats } from "@/lib/queries/fyp/calibration";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function liked(filmId: string, score: number) {
  return { filmId, score, recommended: true };
}
function disliked(filmId: string, score: number) {
  return { filmId, score, recommended: false };
}

/** A stats object with no ratings and no candidate scores. */
const EMPTY_STATS: CalibrationStats = {
  likedMean: 0,
  dislikedMean: 0,
  likedCount: 0,
  dislikedCount: 0,
  totalRatings: 0,
  catalogQuartiles: { q1: 0, q2: 0, q3: 0 },
};

// ---------------------------------------------------------------------------
// buildCalibrationStats
// ---------------------------------------------------------------------------

describe("buildCalibrationStats", () => {
  it("empty inputs → all zeros, totalRatings=0, quartiles all 0", () => {
    const stats = buildCalibrationStats({ ratedFilmScores: [], candidateScores: [] });
    expect(stats.likedMean).toBe(0);
    expect(stats.dislikedMean).toBe(0);
    expect(stats.likedCount).toBe(0);
    expect(stats.dislikedCount).toBe(0);
    expect(stats.totalRatings).toBe(0);
    expect(stats.catalogQuartiles).toEqual({ q1: 0, q2: 0, q3: 0 });
  });

  it("3 liked films with no disliked → likedMean=20, dislikedMean=0, dislikedCount=0", () => {
    const stats = buildCalibrationStats({
      ratedFilmScores: [liked("f1", 10), liked("f2", 20), liked("f3", 30)],
      candidateScores: [],
    });
    expect(stats.likedMean).toBeCloseTo(20);
    expect(stats.dislikedMean).toBe(0);
    expect(stats.likedCount).toBe(3);
    expect(stats.dislikedCount).toBe(0);
    expect(stats.totalRatings).toBe(3);
  });

  it("2 liked + 2 disliked → correct means and totalRatings=4", () => {
    const stats = buildCalibrationStats({
      ratedFilmScores: [liked("f1", 50), liked("f2", 100), disliked("f3", 10), disliked("f4", 20)],
      candidateScores: [],
    });
    expect(stats.likedMean).toBeCloseTo(75);     // (50+100)/2
    expect(stats.dislikedMean).toBeCloseTo(15);  // (10+20)/2
    expect(stats.likedCount).toBe(2);
    expect(stats.dislikedCount).toBe(2);
    expect(stats.totalRatings).toBe(4);
  });

  it("quartiles for 4 candidate scores [10,20,30,40]", () => {
    // Sorted-index method: q1=sorted[1]=20, q2=sorted[2]=30, q3=sorted[3]=40
    const stats = buildCalibrationStats({
      ratedFilmScores: [],
      candidateScores: [10, 20, 30, 40],
    });
    expect(stats.catalogQuartiles.q1).toBe(20);
    expect(stats.catalogQuartiles.q2).toBe(30);
    expect(stats.catalogQuartiles.q3).toBe(40);
  });

  it("quartiles for 1 candidate score → q1=q2=q3=that score", () => {
    // n=1: floor(1*1/4)=0, floor(1*2/4)=0, floor(1*3/4)=0 → sorted[0] for all
    const stats = buildCalibrationStats({
      ratedFilmScores: [],
      candidateScores: [42],
    });
    expect(stats.catalogQuartiles.q1).toBe(42);
    expect(stats.catalogQuartiles.q2).toBe(42);
    expect(stats.catalogQuartiles.q3).toBe(42);
  });

  it("unsorted candidate scores are sorted before computing quartiles", () => {
    // Same values as before, different insertion order.
    const stats = buildCalibrationStats({
      ratedFilmScores: [],
      candidateScores: [40, 10, 30, 20],
    });
    expect(stats.catalogQuartiles.q1).toBe(20);
    expect(stats.catalogQuartiles.q2).toBe(30);
    expect(stats.catalogQuartiles.q3).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// scoreToPercentage — verbal (cold-start) mode
// ---------------------------------------------------------------------------

describe("scoreToPercentage — verbal mode (cold start)", () => {
  it("totalRatings < 3 → mode=verbal regardless of score", () => {
    const stats = buildCalibrationStats({
      ratedFilmScores: [liked("f1", 10), liked("f2", 20)], // only 2
      candidateScores: [5, 10, 15, 20],
    });
    expect(stats.totalRatings).toBe(2);
    const result = scoreToPercentage(18, stats);
    expect(result.mode).toBe("verbal");
  });

  it("score above q3 → verbalKind='strong'", () => {
    const result = scoreToPercentage(41, {
      ...EMPTY_STATS,
      catalogQuartiles: { q1: 20, q2: 30, q3: 40 },
    });
    expect(result.mode).toBe("verbal");
    if (result.mode === "verbal") expect(result.verbalKind).toBe("strong");
  });

  it("score exactly at q3 → verbalKind='strong'", () => {
    const result = scoreToPercentage(40, {
      ...EMPTY_STATS,
      catalogQuartiles: { q1: 20, q2: 30, q3: 40 },
    });
    if (result.mode === "verbal") expect(result.verbalKind).toBe("strong");
  });

  it("score between q2 and q3 → verbalKind='good'", () => {
    const result = scoreToPercentage(35, {
      ...EMPTY_STATS,
      catalogQuartiles: { q1: 20, q2: 30, q3: 40 },
    });
    if (result.mode === "verbal") expect(result.verbalKind).toBe("good");
  });

  it("score exactly at q2 → verbalKind='good'", () => {
    const result = scoreToPercentage(30, {
      ...EMPTY_STATS,
      catalogQuartiles: { q1: 20, q2: 30, q3: 40 },
    });
    if (result.mode === "verbal") expect(result.verbalKind).toBe("good");
  });

  it("score between q1 and q2 → verbalKind='neutral'", () => {
    const result = scoreToPercentage(25, {
      ...EMPTY_STATS,
      catalogQuartiles: { q1: 20, q2: 30, q3: 40 },
    });
    if (result.mode === "verbal") expect(result.verbalKind).toBe("neutral");
  });

  it("score exactly at q1 → verbalKind='neutral'", () => {
    const result = scoreToPercentage(20, {
      ...EMPTY_STATS,
      catalogQuartiles: { q1: 20, q2: 30, q3: 40 },
    });
    if (result.mode === "verbal") expect(result.verbalKind).toBe("neutral");
  });

  it("score below q1 → verbalKind=null (suppressed)", () => {
    const result = scoreToPercentage(5, {
      ...EMPTY_STATS,
      catalogQuartiles: { q1: 20, q2: 30, q3: 40 },
    });
    if (result.mode === "verbal") expect(result.verbalKind).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// scoreToPercentage — calibrated mode
// ---------------------------------------------------------------------------

describe("scoreToPercentage — calibrated mode", () => {
  /** A stats fixture with enough ratings to enter calibrated mode. */
  const calibStats: CalibrationStats = {
    likedMean: 100,
    dislikedMean: 20,
    likedCount: 3,
    dislikedCount: 2,
    totalRatings: 5,
    catalogQuartiles: { q1: 20, q2: 50, q3: 80 },
  };

  it("score == dislikedMean → pct=0", () => {
    const r = scoreToPercentage(20, calibStats);
    expect(r.mode).toBe("calibrated");
    if (r.mode === "calibrated") expect(r.pct).toBe(0);
  });

  it("score == likedMean → pct=100", () => {
    const r = scoreToPercentage(100, calibStats);
    expect(r.mode).toBe("calibrated");
    if (r.mode === "calibrated") expect(r.pct).toBe(100);
  });

  it("score exactly halfway between dislikedMean and likedMean → pct=50", () => {
    // halfway = 20 + (100-20)/2 = 60
    const r = scoreToPercentage(60, calibStats);
    expect(r.mode).toBe("calibrated");
    if (r.mode === "calibrated") expect(r.pct).toBe(50);
  });

  it("score below dislikedMean → clamped to 0%", () => {
    const r = scoreToPercentage(0, calibStats);
    expect(r.mode).toBe("calibrated");
    if (r.mode === "calibrated") expect(r.pct).toBe(0);
  });

  it("score above likedMean → clamped to 100%", () => {
    const r = scoreToPercentage(200, calibStats);
    expect(r.mode).toBe("calibrated");
    if (r.mode === "calibrated") expect(r.pct).toBe(100);
  });

  it("pct is an integer (rounded)", () => {
    // 60 / 80 range: (55-20)/(100-20) = 35/80 = 0.4375 → 44
    const r = scoreToPercentage(55, calibStats);
    expect(r.mode).toBe("calibrated");
    if (r.mode === "calibrated") {
      expect(Number.isInteger(r.pct)).toBe(true);
      expect(r.pct).toBe(44); // Math.round(43.75)
    }
  });

  it("zero disliked: floor=0 instead of dislikedMean", () => {
    const noDisliked: CalibrationStats = {
      likedMean: 50,
      dislikedMean: 0,
      likedCount: 4,
      dislikedCount: 0,
      totalRatings: 4,
      catalogQuartiles: { q1: 10, q2: 25, q3: 40 },
    };
    // score=25, floor=0, ceiling=50 → 50%
    const r = scoreToPercentage(25, noDisliked);
    expect(r.mode).toBe("calibrated");
    if (r.mode === "calibrated") expect(r.pct).toBe(50);
  });

  it("degenerate (likedMean == dislikedMean) → falls back to verbal mode", () => {
    const degenerate: CalibrationStats = {
      likedMean: 30,
      dislikedMean: 30,
      likedCount: 2,
      dislikedCount: 2,
      totalRatings: 4,
      catalogQuartiles: { q1: 20, q2: 30, q3: 40 },
    };
    const r = scoreToPercentage(35, degenerate);
    expect(r.mode).toBe("verbal");
  });

  it("degenerate (likedMean < dislikedMean) → falls back to verbal mode", () => {
    const degenerate: CalibrationStats = {
      likedMean: 10,
      dislikedMean: 50,
      likedCount: 3,
      dislikedCount: 3,
      totalRatings: 6,
      catalogQuartiles: { q1: 20, q2: 30, q3: 40 },
    };
    const r = scoreToPercentage(30, degenerate);
    expect(r.mode).toBe("verbal");
  });
});
