import { FACET_MULTIPLIERS } from "./affinity";
import type { AffinityVector } from "./affinity";
import type { FilmTagRow } from "@/lib/queries/film-tags";

// Re-export so consumers can reference the type without touching affinity.ts.
export type { AffinityVector };

export type ReasonKind = "tag" | "coven_rating" | "lane" | "director" | "starter";

export interface ScoredFilm {
  filmId: string;
  score: number;
  topReason: { kind: ReasonKind; tagName?: string; contribution: number };
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
}

// Tags at film_tags.position 1-4 are the editorial visible capsule per the
// staff style guide. They get a small boost on top of the facet multiplier
// to honor that editorial intent.
const VISIBLE_POSITION_BOOST = 1.3;
const VISIBLE_POSITION_THRESHOLD = 4;

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

    let total = 0;
    let topTagContrib = 0;
    let topTagName: string | undefined;
    let laneContrib = 0;
    let laneTagName: string | undefined;

    for (const tag of f.tags) {
      const aff = affinity.byTag[tag.name] ?? 0;
      if (aff === 0) continue;
      const idf = ctx.idfByTag.get(tag.name) ?? 1.0;
      const positionBoost =
        tag.position <= VISIBLE_POSITION_THRESHOLD ? VISIBLE_POSITION_BOOST : 1.0;
      const contrib = aff * facetMultiplier(tag) * idf * positionBoost;
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

    // Coven-rating bonus: soft tiebreaker for highly-rated films.
    // Only applies for ratings >= 70. NOT multiplied by any facet weight —
    // it's a film-level signal, not a tag-level one.
    // A 90% coven rating contributes 0.9; a 70% contributes 0.7.
    const covenRating = ctx.covenRatingByFilm.get(f.id);
    const covenContrib =
      covenRating != null && covenRating >= 70 ? covenRating / 100 : 0;
    total += covenContrib;

    if (total <= 0) continue;

    // Pick the strongest contributor for the "why" caption.
    let topReason: ScoredFilm["topReason"];
    const directorMatch = ctx.ownDirectors.has(f.director);

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

    out.push({ filmId: f.id, score: total, topReason });
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
 */
export function starterPackScored(filmIds: string[]): ScoredFilm[] {
  return filmIds.map((id) => ({
    filmId: id,
    score: 0,
    topReason: { kind: "starter" as const, contribution: 0 },
  }));
}
