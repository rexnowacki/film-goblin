import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getUserAffinity, getUserAversion } from "./affinity";
import { scoreFilms, starterPackScored, type ScoredFilm } from "./score";
import type { FilmTagRow, TagFacet } from "@/lib/queries/film-tags";
// Note (v3): the calibration helper (calibration.ts) is preserved for future
// use but no longer wired into the display path. v3 drops the calibrated
// percentage in favor of rank-percentile bands — see attachMatchBands in
// score.ts. This sidesteps the circularity concern flagged by the math review
// (rated films feed both the user vector AND the calibration anchors), and
// the rank bands produce honest "where this film sits in your personal feed"
// signal without implying probability.

type Client = SupabaseClient<Database>;

export interface FilmLite {
  id: string;
  title: string;
  year: number;
  director: string;
  artwork_url: string | null;
}

export interface ForYouPage {
  items: ScoredFilm[];
  filmsById: Map<string, FilmLite>;
  nextCursor: string | null;
  done: boolean;
}

/**
 * Orchestrates the FYP ranked feed for a user.
 *
 * Cold-start branch: if getUserAffinity returns an empty byTag map (no lanes,
 * no own signals, no coven bonds), skip scoring entirely and return the
 * editorial starter pack ordered alphabetically.
 *
 * Score path otherwise: fetches the candidate pool (all available films) +
 * their full tag set (all positions, including hidden FYP tail) + supporting
 * context (watched exclusion set, disliked exclusion set, coven ratings, lane
 * names, directors the user has watched) in parallel, builds ScoreContext,
 * calls scoreFilms, then slices by cursor + limit.
 *
 * Cursor is a stringified rank offset (e.g. "20" means "items starting at
 * rank 20"). This is NOT a created_at cursor like the activity feed.
 */
export async function getForYou(
  client: Client,
  userId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<ForYouPage> {
  const limit = opts.limit ?? 20;
  const offset = opts.cursor ? Number(opts.cursor) : 0;

  // ── Cold-start detection ─────────────────────────────────────────────────
  // getUserAffinity composes own + coven-borrowed + lanes. If the resulting
  // vector is empty, the user has no signals at all → editorial starter path.
  // Fetch aversion in parallel — empty vector for users with no dislikes.
  const [affinity, aversion] = await Promise.all([
    getUserAffinity(client, userId),
    getUserAversion(client, userId),
  ]);
  const hasAnySignal = Object.keys(affinity.byTag).length > 0;

  if (!hasAnySignal) {
    // Editorial starter pack: skip scoring, return curated list alphabetically.
    const { data: starters } = await client
      .from("films")
      .select("id, title, year, director, artwork_url")
      .eq("editorial_starter", true)
      .eq("available", true)
      .order("title");

    const starterList = (starters ?? []) as FilmLite[];
    const filmsById = new Map(starterList.map((f) => [f.id, f]));
    const allItems = starterPackScored(starterList.map((s) => s.id));
    const slice = allItems.slice(offset, offset + limit);

    return {
      items: slice,
      filmsById,
      nextCursor: offset + limit < allItems.length ? String(offset + limit) : null,
      done: offset + limit >= allItems.length,
    };
  }

  // ── Score path ───────────────────────────────────────────────────────────
  // Fetch all supporting data in parallel to minimise round-trip count.
  // Six concurrent queries; tags follow as a 7th after we know the film ids.
  const [
    candidateFilms,
    watchedRows,
    dislikedRows,
    lanesProfile,
    covenRatings,
    ownWatchDirectors,
  ] = await Promise.all([
    // 1. All available films — the candidate pool.
    client
      .from("films")
      .select("id, title, year, director, artwork_url")
      .eq("available", true),

    // 2. All films the user has watched (exclusion set).
    client
      .from("watched")
      .select("film_id")
      .eq("user_id", userId),

    // 3. Films the user explicitly disliked (recommended = false) — hard exclude.
    client
      .from("watched")
      .select("film_id")
      .eq("user_id", userId)
      .eq("recommended", false),

    // 4. User's lane_tag_ids for later name resolution.
    client
      .from("profiles")
      .select("lane_tag_ids")
      .eq("id", userId)
      .maybeSingle(),

    // 5. Coven ratings view for the tiebreaker bonus signal.
    client
      .from("films_with_stats")
      .select("id, coven_rating_pct")
      .eq("available", true),

    // 6. Directors the user has watched — separate query so we don't miss
    //    films that were later set available=false. Defensive per the plan.
    client
      .from("watched")
      .select("film:films!inner(director)")
      .eq("user_id", userId),
  ]);

  const filmsList = (candidateFilms.data ?? []) as FilmLite[];
  const filmsById = new Map(filmsList.map((f) => [f.id, f]));
  const filmIds = filmsList.map((f) => f.id);

  // ── Fetch tags for candidate pool in one indexed round trip ─────────────
  // v3: rated-film tags no longer needed (calibration helper unwired — see
  // header note). Only candidate films need their tags fetched here.
  const { data: allTags } = await client
    .from("film_tags")
    .select("film_id, position, is_primary, tag:tags!inner(id, name, type)")
    .in("film_id", filmIds);

  // Build film_id → FilmTagRow[] map. Includes all positions (hidden tail too).
  const tagsByFilmId = new Map<string, FilmTagRow[]>();
  for (const r of allTags ?? []) {
    const row = r as unknown as {
      film_id: string;
      position: number;
      is_primary: boolean;
      tag: { id: string; name: string; type: TagFacet };
    };
    const existing = tagsByFilmId.get(row.film_id) ?? [];
    existing.push({
      id: row.tag.id,
      name: row.tag.name,
      type: row.tag.type,
      position: row.position,
      is_primary: row.is_primary,
    });
    tagsByFilmId.set(row.film_id, existing);
  }

  // ── Lane ids → tag names ─────────────────────────────────────────────────
  const laneIds = (lanesProfile.data?.lane_tag_ids ?? []) as string[];
  let lanesByTag = new Set<string>();
  if (laneIds.length > 0) {
    const lanesTags = await client
      .from("tags")
      .select("name")
      .in("id", laneIds);
    lanesByTag = new Set((lanesTags.data ?? []).map((t) => t.name));
  }

  // ── Compute smoothed + clamped IDF over the candidate pool ──────────────
  // v3 (math review): with N≈150 films, raw log(N/df) is volatile —
  // singleton tags get explosive IDF; common tags drop close to 0 and shift
  // a lot when films are added/removed. Smoothed form `log(1 + N/(1+df))`
  // dampens both extremes; clamping to [0.75, 3.0] gives guardrails.
  // Tags not in the map default to 1.0 in scoreOneFilm (no boost).
  const N = filmsList.length;
  const dfByTag = new Map<string, number>();
  for (const filmId of filmIds) {
    const tags = tagsByFilmId.get(filmId) ?? [];
    const seen = new Set<string>();
    for (const t of tags) seen.add(t.name);
    for (const name of seen) dfByTag.set(name, (dfByTag.get(name) ?? 0) + 1);
  }
  const IDF_FLOOR = 0.75;
  const IDF_CEIL = 3.0;
  const idfByTag = new Map<string, number>();
  for (const [name, df] of dfByTag) {
    const raw = Math.log(1 + N / (1 + df));
    idfByTag.set(name, Math.max(IDF_FLOOR, Math.min(IDF_CEIL, raw)));
  }

  // ── Build ScoreContext ───────────────────────────────────────────────────
  const ctx = {
    userWatchedFilmIds: new Set(
      (watchedRows.data ?? []).map((w) => w.film_id),
    ),
    userDislikedFilmIds: new Set(
      (dislikedRows.data ?? []).map((w) => w.film_id),
    ),
    covenRatingByFilm: new Map(
      (covenRatings.data ?? [])
        .filter(
          (r): r is { id: string; coven_rating_pct: number } =>
            r.id != null && r.coven_rating_pct != null,
        )
        .map((r) => [r.id, r.coven_rating_pct]),
    ),
    ownDirectors: new Set(
      (ownWatchDirectors.data ?? [])
        .map(
          (r) =>
            (r as unknown as { film: { director: string } }).film.director,
        )
        .filter(Boolean),
    ),
    lanesByTag,
    idfByTag,
    aversion,
  };

  // ── Score candidates ─────────────────────────────────────────────────────
  const scored = scoreFilms(
    filmsList.map((f) => ({
      id: f.id,
      director: f.director,
      tags: tagsByFilmId.get(f.id) ?? [],
    })),
    affinity,
    ctx,
  );

  // v3: matchBand is already populated by scoreFilms (via attachMatchBands).
  // matchPercent/matchVerbal stay null in v3 — see header note on calibration.
  const slice = scored.slice(offset, offset + limit);

  return {
    items: slice,
    filmsById,
    nextCursor: offset + limit < scored.length ? String(offset + limit) : null,
    done: offset + limit >= scored.length,
  };
}
