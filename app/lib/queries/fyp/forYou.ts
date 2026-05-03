import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getUserAffinity } from "./affinity";
import { scoreFilms, starterPackScored, type ScoredFilm } from "./score";
import type { FilmTagRow, TagFacet } from "@/lib/queries/film-tags";

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
  const affinity = await getUserAffinity(client, userId);
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

  // ── Fetch all tags for the candidate set in one indexed round trip ───────
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
  };

  // ── Score + paginate ─────────────────────────────────────────────────────
  const scored = scoreFilms(
    filmsList.map((f) => ({
      id: f.id,
      director: f.director,
      tags: tagsByFilmId.get(f.id) ?? [],
    })),
    affinity,
    ctx,
  );

  const slice = scored.slice(offset, offset + limit);

  return {
    items: slice,
    filmsById,
    nextCursor: offset + limit < scored.length ? String(offset + limit) : null,
    done: offset + limit >= scored.length,
  };
}
