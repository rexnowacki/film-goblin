import { FACET_MULTIPLIERS } from "./affinity";
import type { AffinityVector } from "./affinity";
import type { FilmTagRow } from "@/lib/queries/film-tags";
import type { VerbalKind } from "./calibration";

// Re-export so consumers can reference the type without touching affinity.ts.
export type { AffinityVector };

export type ReasonKind = "tag" | "coven_rating" | "lane" | "director" | "starter";

export interface ScoredFilm {
  filmId: string;
  score: number;
  topReason: { kind: ReasonKind; tagName?: string; contribution: number };
  /** 0–100 when calibrated mode; null in verbal/cold-start mode. Set by orchestrator. */
  matchPercent: number | null;
  /** Verbal kind when in verbal/cold-start mode; null otherwise. Set by orchestrator. */
  matchVerbal: VerbalKind | null;
}

export interface FilmInput {
  id: string;
  director: string;
  tags: FilmTagRow[]; // all positions, including hidden tail
}

export interface ScoreContext {
  userWatchedFilmIds: Set<string>;
  userDislikedFilmIds: Set<string>;
  covenRatingByFilm: Map<string, number>; // film_id → coven_rating_pct (0-100)
  ownDirectors: Set<string>; // directors the user has watched at least one film by
  lanesByTag: Set<string>; // tag names the user has selected as lanes in /settings
  // Per-tag inverse-document-frequency over the catalog. Tags missing from the
  // map default to 1.0 (no boost). Computed once per request from the candidate
  // pool — `idf(t) = log(N / df(t))`. Distinctive tags (rare) score higher;
  // near-universal tags (atmospheric, bleak) score lower.
  idfByTag: Map<string, number>;
  /** User's aversion vector (positive magnitudes of dislike per tag).
   *  scoreOneFilm subtracts λ × aversion-mass from the raw positive score.
   *  Empty vector when user has no thumbs-down ratings. */
  aversion: AffinityVector;
}

// Tags at film_tags.position 1-4 are the editorial visible capsule per the
// staff style guide. They get a small boost on top of the facet multiplier
// to honor that editorial intent.
const VISIBLE_POSITION_BOOST = 1.3;
const VISIBLE_POSITION_THRESHOLD = 4;

/**
 * Length-penalty exponent γ. Score is divided by |tags(F)|^γ so heavily-
 * tagged films don't accumulate raw score advantage purely from breadth.
 * γ=0 is no penalty (sum), γ=1 is mean-per-tag (probably too harsh),
 * γ=0.5 (sqrt) is the recommended middle ground per math review.
 */
const LENGTH_PENALTY_GAMMA = 0.5;

/**
 * Aversion penalty weight λ. The aversion mass (built from explicit dislikes)
 * is multiplied by λ and subtracted from the positive score after length
 * penalty. λ=0.8 means a strong dislike signal meaningfully suppresses a
 * match but doesn't completely dominate moderate positive signals.
 */
const AVERSION_LAMBDA = 0.8;

/**
 * Maps a FilmTagRow to the facet multiplier it contributes to the affinity
 * score. Delegates to the shared FACET_MULTIPLIERS constant from affinity.ts
 * so both the vector builder and the scorer use exactly the same numbers.
 */
function facetMultiplier(t: FilmTagRow): number {
  switch (t.type) {
    case "subgenre":
      return t.is_primary
        ? FACET_MULTIPLIERS.subgenre_primary
        : FACET_MULTIPLIERS.subgenre_secondary;
    case "tone":
      return FACET_MULTIPLIERS.tone;
    case "theme":
      return FACET_MULTIPLIERS.theme;
    case "subject":
      return FACET_MULTIPLIERS.subject;
    case "setting":
      return FACET_MULTIPLIERS.setting;
    case "content":
      return FACET_MULTIPLIERS.content;
  }
}

/**
 * Scores a single film against the user's affinity vector and context.
 * Pure function — no exclusion logic; callers decide whether to filter.
 *
 * Returns `{ score, topReason }`.  The exclusion sets in `ctx` are NOT
 * consulted here — that is the responsibility of `scoreFilms`'s loop.
 * Extracted so the orchestrator can score already-watched rated films for
 * calibration without needing to temporarily manipulate the exclusion sets.
 */
export function scoreOneFilm(
  film: FilmInput,
  affinity: AffinityVector,
  ctx: ScoreContext,
): { score: number; topReason: ScoredFilm["topReason"] } {
  let total = 0;
  let topTagContrib = 0;
  let topTagName: string | undefined;
  let laneContrib = 0;
  let laneTagName: string | undefined;
  let aversionTotal = 0;

  for (const tag of film.tags) {
    const aff = affinity.byTag[tag.name] ?? 0;
    const idf = ctx.idfByTag.get(tag.name) ?? 1.0;
    const positionBoost =
      tag.position <= VISIBLE_POSITION_THRESHOLD ? VISIBLE_POSITION_BOOST : 1.0;

    if (aff !== 0) {
      // v3 (math review): drop μ at scoring time. The user vector already
      // encodes facet importance because μ is applied at affinity-construction.
      // Re-applying μ here squared the effect (Primary subgenre 36× content).
      // Score per tag = affinity × idf × position-boost.
      const contrib = aff * idf * positionBoost;
      total += contrib;
      if (contrib > topTagContrib) {
        topTagContrib = contrib;
        topTagName = tag.name;
      }
      if (ctx.lanesByTag.has(tag.name) && contrib > laneContrib) {
        laneContrib = contrib;
        laneTagName = tag.name;
      }
    }

    // Aversion: same idf × position-boost factors; μ NOT re-applied
    // (single-application rule — aversion vector was built with μ already baked in).
    const aversionMag = ctx.aversion.byTag[tag.name] ?? 0;
    if (aversionMag !== 0) {
      aversionTotal += aversionMag * idf * positionBoost;
    }
  }

  // v3 (math review): soft length penalty so heavily-tagged films don't
  // accumulate raw advantage from breadth alone. Divide by |tags(F)|^γ.
  if (film.tags.length > 0) {
    const denom = Math.pow(film.tags.length, LENGTH_PENALTY_GAMMA);
    total /= denom;
    topTagContrib /= denom;
    laneContrib /= denom;
    aversionTotal /= denom;
  }

  // v3 aversion: subtract λ × aversion mass from positive score.
  // Films where aversion-mass exceeds positive score will have total ≤ 0
  // and be filtered out by the scoreFilms loop.
  total -= AVERSION_LAMBDA * aversionTotal;

  // Coven-rating bonus: soft tiebreaker for highly-rated films.
  // Only applies for ratings >= 70. NOT subject to length penalty —
  // it's a film-level signal, not a per-tag accumulation.
  const covenRating = ctx.covenRatingByFilm.get(film.id);
  const covenContrib =
    covenRating != null && covenRating >= 70 ? covenRating / 100 : 0;
  total += covenContrib;

  // Pick the strongest contributor for the "why" caption.
  let topReason: ScoredFilm["topReason"];
  const directorMatch = ctx.ownDirectors.has(film.director);

  if (directorMatch && topTagContrib < 1.5) {
    // Director match, but no strong tag signal — surface the director reason.
    topReason = { kind: "director", contribution: topTagContrib };
  } else if (laneTagName != null && laneContrib === topTagContrib) {
    // The strongest single tag contribution belongs to a lane tag.
    topReason = { kind: "lane", tagName: laneTagName, contribution: laneContrib };
  } else if (covenContrib > topTagContrib) {
    // The coven-rating bonus is the dominant contribution.
    topReason = { kind: "coven_rating", contribution: covenContrib };
  } else {
    // Default: strongest tag match drives the reason.
    topReason = { kind: "tag", tagName: topTagName, contribution: topTagContrib };
  }

  return { score: total, topReason };
}

/**
 * Pure-function scorer. Takes a list of film inputs, the user's affinity
 * vector, and a score context, then returns a sorted list of ScoredFilm[]
 * ranked by score DESC.
 *
 * Films with total score ≤ 0 are excluded from output (they have no relevant
 * affinity signal). Already-watched and disliked films are also excluded.
 *
 * topReason attribution precedence (highest-priority first):
 *  1. director  — film.director is in ownDirectors AND no strong tag match
 *                 (topTagContrib < 1.5). Director is a weak tiebreaker, not a
 *                 primary signal; strong tag matches override it.
 *  2. lane      — a lane tag's contribution equals the top tag contribution
 *                 (i.e. the strongest single match is a lane tag).
 *  3. coven_rating — coven bonus exceeds top tag contribution.
 *  4. tag       — default: the highest-weighted tag match drives the reason.
 *
 * Tie-breaking on equal score: stable sort by filmId ascending so output
 * order is deterministic.
 *
 * matchPercent and matchVerbal are initialised to null here; the orchestrator
 * (getForYou) enriches them after calibration stats are available.
 */
export function scoreFilms(
  films: FilmInput[],
  affinity: AffinityVector,
  ctx: ScoreContext,
): ScoredFilm[] {
  const out: ScoredFilm[] = [];

  for (const f of films) {
    if (ctx.userWatchedFilmIds.has(f.id)) continue;
    if (ctx.userDislikedFilmIds.has(f.id)) continue;

    const { score, topReason } = scoreOneFilm(f, affinity, ctx);

    if (score <= 0) continue;

    out.push({ filmId: f.id, score, topReason, matchPercent: null, matchVerbal: null });
  }

  // Sort by score DESC. Tie-break by filmId ASC for deterministic output.
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.filmId < b.filmId ? -1 : a.filmId > b.filmId ? 1 : 0;
  });

  return out;
}

/**
 * Returns a trivially-scored list for the editorial cold-start path.
 * Each film gets score 0 and reason kind 'starter'. Ordering mirrors the
 * order of filmIds supplied (caller sorts editorially, e.g. alphabetical).
 * matchPercent/matchVerbal are null — no calibration for the cold-start path.
 */
export function starterPackScored(filmIds: string[]): ScoredFilm[] {
  return filmIds.map((id) => ({
    filmId: id,
    score: 0,
    topReason: { kind: "starter" as const, contribution: 0 },
    matchPercent: null,
    matchVerbal: null,
  }));
}
