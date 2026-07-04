import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getUserAffinity, getUserAversion } from "./affinity";
import { scoreFilms, starterPackScored, type ScoredFilm } from "./score";
import type { FilmTagRow, TagFacet } from "@/lib/queries/film-tags";
import { buildShelves, dailySeed, mulberry32, pickOmen, starterShelf, type Shelf, type ShelfFilmMeta } from "./shelves";
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
  added_at: string;
}

export interface ForYouShelvesResult {
  omen: ScoredFilm | null;
  shelves: Shelf[];
  filmsById: Map<string, FilmLite>;
  scoredById: Map<string, ScoredFilm>;
}

/**
 * v3.5 orchestrator: same score pipeline as getForYou, plus impressions +
 * dismissals context, then shelf assembly. No pagination — shelves are
 * fully materialized (≤ ~60 films).
 */
export async function getForYouShelves(
  client: Client,
  userId: string,
): Promise<ForYouShelvesResult> {
  const now = new Date();
  const seed = dailySeed(userId, now);

  const [affinity, aversion] = await Promise.all([
    getUserAffinity(client, userId),
    getUserAversion(client, userId),
  ]);
  const hasAnySignal = Object.keys(affinity.byTag).length > 0;

  if (!hasAnySignal) {
    // Cold start: seeded omen from the starter pack + one alphabetical shelf.
    const [startersRes, watchedRes, dismissedRes, watchlistRes, libraryRes] = await Promise.all([
      client
        .from("films")
        .select("id, title, year, director, artwork_url, added_at:first_seen_at")
        .eq("editorial_starter", true)
        .eq("available", true)
        .order("title"),
      client.from("watched").select("film_id").eq("user_id", userId),
      client.from("fyp_not_interested").select("film_id").eq("user_id", userId),
      client.from("watchlists").select("film_id").eq("user_id", userId),
      client.from("library").select("film_id").eq("user_id", userId),
    ]);
    const excluded = new Set([
      ...(watchedRes.data ?? []).map((w) => w.film_id),
      ...(dismissedRes.data ?? []).map((d) => d.film_id),
      ...(watchlistRes.data ?? []).map((w) => w.film_id),
      ...(libraryRes.data ?? []).map((l) => l.film_id),
    ]);
    const starterList = ((startersRes.data ?? []) as FilmLite[]).filter((f) => !excluded.has(f.id));
    const filmsById = new Map(starterList.map((f) => [f.id, f]));
    const scored = starterPackScored(starterList.map((s) => s.id));
    const omen = pickOmen(scored, mulberry32(seed));
    const rest = scored.filter((s) => s.filmId !== omen?.filmId).map((s) => s.filmId);
    return {
      omen,
      shelves: rest.length >= 3 ? [starterShelf(rest)] : [],
      filmsById,
      scoredById: new Map(scored.map((s) => [s.filmId, s])),
    };
  }

  const [
    candidateFilms,
    watchedRows,
    dislikedRows,
    lanesProfile,
    covenRatings,
    ownWatchDirectors,
    impressionRows,
    dismissedRows,
    watchlistRows,
    libraryRows,
  ] = await Promise.all([
    client
      .from("films")
      .select("id, title, year, director, artwork_url, added_at:first_seen_at")
      .eq("available", true),
    client.from("watched").select("film_id").eq("user_id", userId),
    client.from("watched").select("film_id").eq("user_id", userId).eq("recommended", false),
    client.from("profiles").select("lane_tag_ids").eq("id", userId).maybeSingle(),
    client.from("films_with_stats").select("id, coven_rating_pct").eq("available", true),
    client.from("watched").select("film:films!inner(director)").eq("user_id", userId),
    client.from("fyp_impressions").select("film_id, impressions").eq("user_id", userId),
    client.from("fyp_not_interested").select("film_id").eq("user_id", userId),
    client.from("watchlists").select("film_id").eq("user_id", userId),
    client.from("library").select("film_id").eq("user_id", userId),
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

  const covenRatingByFilm = new Map(
    (covenRatings.data ?? [])
      .filter((r): r is { id: string; coven_rating_pct: number } =>
        r.id != null && r.coven_rating_pct != null)
      .map((r) => [r.id, r.coven_rating_pct]),
  );

  const ctx = {
    userWatchedFilmIds: new Set((watchedRows.data ?? []).map((w) => w.film_id)),
    userDislikedFilmIds: new Set((dislikedRows.data ?? []).map((w) => w.film_id)),
    covenRatingByFilm,
    ownDirectors: new Set(
      (ownWatchDirectors.data ?? [])
        .map((r) => (r as unknown as { film: { director: string } }).film.director)
        .filter(Boolean),
    ),
    lanesByTag,
    idfByTag,
    aversion,
    notInterestedFilmIds: new Set((dismissedRows.data ?? []).map((d) => d.film_id)),
    userSavedFilmIds: new Set([
      ...(watchlistRows.data ?? []).map((w) => w.film_id),
      ...(libraryRows.data ?? []).map((l) => l.film_id),
    ]),
    impressionsByFilm: new Map(
      (impressionRows.data ?? []).map((r) => [r.film_id, r.impressions]),
    ),
  };

  const scored = scoreFilms(
    filmsList.map((f) => ({ id: f.id, director: f.director, tags: tagsByFilmId.get(f.id) ?? [] })),
    affinity,
    ctx,
  );

  const metaByFilm = new Map<string, ShelfFilmMeta>(
    filmsList.map((f) => {
      const primary = (tagsByFilmId.get(f.id) ?? []).find(
        (t) => t.type === "subgenre" && t.is_primary,
      );
      return [f.id, {
        director: f.director,
        addedAt: f.added_at,
        primarySubgenre: primary?.name ?? null,
      }];
    }),
  );

  const { omen, shelves } = buildShelves({
    scored, metaByFilm, affinity, covenRatingByFilm, seed, now,
  });

  return { omen, shelves, filmsById, scoredById: new Map(scored.map((s) => [s.filmId, s])) };
}
