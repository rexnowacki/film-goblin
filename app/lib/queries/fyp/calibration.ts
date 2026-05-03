/**
 * Verdict-anchored calibration helper.
 *
 * Maps a raw recommender score to a human-readable match percentage (or verbal
 * fallback) anchored to the user's own liked/disliked verdicts.
 *
 * The key invariant: a film that scores like the user's average liked film gets
 * 100%; a film that scores like their average disliked film gets 0%.  Everything
 * in between is linearly interpolated.  This means the number doesn't drift as
 * the catalog grows — it only changes when the user rates more films.
 *
 * Cold start (< 3 total rated films): fall back to verbal pills derived from
 * quartiles of the current candidate pool's scores.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalibrationStats {
  likedMean: number;
  dislikedMean: number;
  likedCount: number;
  dislikedCount: number;
  totalRatings: number;
  /**
   * Quartile thresholds over the candidate pool scores (sorted ascending),
   * used for verbal-mode mapping.  All three default to 0 when there are no
   * candidate scores (edge case / cold start with empty pool).
   *
   * Method: sorted-index quartile — `q[k] = sorted[Math.floor(n * k/4)]`.
   * For n=4 scores [10, 20, 30, 40]:
   *   q1 = sorted[1] = 20, q2 = sorted[2] = 30, q3 = sorted[3] = 40.
   * For n=0: all zeros (no pill rendered).
   */
  catalogQuartiles: { q1: number; q2: number; q3: number };
}

export type VerbalKind = "strong" | "good" | "neutral" | "weak";

export type ScoreToPercentageResult =
  | { mode: "calibrated"; pct: number }
  | { mode: "verbal"; verbalKind: VerbalKind | null }; // null = suppressed

// ---------------------------------------------------------------------------
// Input type for the pure builder
// ---------------------------------------------------------------------------

export interface CalibrationInput {
  /**
   * Each film the user has explicitly rated (recommended = true OR false),
   * paired with its pre-computed recommender score.
   */
  ratedFilmScores: Array<{ filmId: string; score: number; recommended: boolean }>;
  /**
   * The raw scores for all films in the current candidate pool (from
   * scoreFilms in getForYou).  Used to derive verbal-mode quartile thresholds.
   */
  candidateScores: number[];
}

// ---------------------------------------------------------------------------
// Pure builder
// ---------------------------------------------------------------------------

/**
 * Pure function — no DB.  The caller (getForYou, Task 5) computes rated-film
 * scores using the same scoreFilms infrastructure and passes them in alongside
 * the candidate pool scores.  This keeps calibration decoupled from the DB
 * orchestration layer and trivially testable.
 */
export function buildCalibrationStats(input: CalibrationInput): CalibrationStats {
  const { ratedFilmScores, candidateScores } = input;

  // Bucket by verdict.
  let likedSum = 0;
  let likedCount = 0;
  let dislikedSum = 0;
  let dislikedCount = 0;

  for (const { score, recommended } of ratedFilmScores) {
    if (recommended) {
      likedSum += score;
      likedCount++;
    } else {
      dislikedSum += score;
      dislikedCount++;
    }
  }

  const likedMean = likedCount > 0 ? likedSum / likedCount : 0;
  const dislikedMean = dislikedCount > 0 ? dislikedSum / dislikedCount : 0;

  // Quartile thresholds: sorted-index method.
  // q[k] = sorted[Math.floor(n * k/4)]  (k = 1, 2, 3)
  //
  // For n=4 scores [10, 20, 30, 40]:
  //   floor(4*1/4)=1 → sorted[1]=20
  //   floor(4*2/4)=2 → sorted[2]=30
  //   floor(4*3/4)=3 → sorted[3]=40
  const catalogQuartiles = computeQuartiles(candidateScores);

  return {
    likedMean,
    dislikedMean,
    likedCount,
    dislikedCount,
    totalRatings: likedCount + dislikedCount,
    catalogQuartiles,
  };
}

/**
 * Computes q1/q2/q3 using the sorted-index method.
 * All zeros when the input is empty.
 */
function computeQuartiles(scores: number[]): { q1: number; q2: number; q3: number } {
  if (scores.length === 0) return { q1: 0, q2: 0, q3: 0 };
  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    q1: sorted[Math.floor(n * 1 / 4)],
    q2: sorted[Math.floor(n * 2 / 4)],
    q3: sorted[Math.floor(n * 3 / 4)],
  };
}

// ---------------------------------------------------------------------------
// Score → display value
// ---------------------------------------------------------------------------

const COLD_START_THRESHOLD = 3;

/**
 * Maps a raw score to a calibrated percentage or a verbal fallback.
 *
 * Calibrated mode (totalRatings >= 3):
 *   pct = clip((score - floor) / (ceiling - floor), 0, 1) * 100, rounded.
 *   floor = dislikedMean (or 0 if no disliked films).
 *   ceiling = likedMean.
 *   Degenerate (ceiling <= floor): fall back to verbal.
 *
 * Verbal mode (cold start or degenerate):
 *   Kind is picked from catalogQuartiles via pickVerbalKind.
 *   Score below q1 → null (pill suppressed).
 */
export function scoreToPercentage(
  score: number,
  stats: CalibrationStats,
): ScoreToPercentageResult {
  if (stats.totalRatings < COLD_START_THRESHOLD) {
    return { mode: "verbal", verbalKind: pickVerbalKind(score, stats.catalogQuartiles) };
  }

  const floor = stats.dislikedCount === 0 ? 0 : stats.dislikedMean;
  const ceiling = stats.likedMean;

  if (ceiling <= floor) {
    // Degenerate distribution (e.g. only disliked films, or liked == disliked mean).
    return { mode: "verbal", verbalKind: pickVerbalKind(score, stats.catalogQuartiles) };
  }

  const raw = (score - floor) / (ceiling - floor);
  const pct = Math.max(0, Math.min(100, raw * 100));
  return { mode: "calibrated", pct: Math.round(pct) };
}

/**
 * Picks a verbal kind from the candidate-pool quartile thresholds.
 * Returns null for scores below q1 — pill is suppressed entirely.
 * Note: "weak" is in the VerbalKind union for future flexibility but is not
 * currently returned — below-q1 films are suppressed rather than labelled.
 */
function pickVerbalKind(
  score: number,
  q: { q1: number; q2: number; q3: number },
): VerbalKind | null {
  if (score >= q.q3) return "strong";
  if (score >= q.q2) return "good";
  if (score >= q.q1) return "neutral";
  // Below q1: pill suppressed entirely.
  return null;
}
