// Pure selection logic for the weekly Release Scout.
// Spec: docs/superpowers/specs/2026-10-07-release-scout-design.md

export const SCOUT_MAX_AGE_DAYS = 365;
export const SCOUT_MIN_POPULARITY = 10;

const POSTER_BASE = "https://image.tmdb.org/t/p/w780";

export type ScoutWindow = "digital" | "theatrical";

export interface TmdbDiscoverResult {
  id: number;
  title?: string;
  release_date?: string;
  popularity?: number;
  adult?: boolean;
  poster_path?: string | null;
  overview?: string;
}

export interface ScoutPick {
  tmdb_id: number;
  title: string;
  year: number;
  release_date: string;
  window: ScoutWindow;
  artwork_url: string | null;
  description: string;
}

function daysBefore(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function pickScoutReleases(input: {
  digital: TmdbDiscoverResult[];
  theatrical: TmdbDiscoverResult[];
  today: string;
  knownTmdbIds: Set<number>;
}): ScoutPick[] {
  const oldestAllowed = daysBefore(input.today, SCOUT_MAX_AGE_DAYS);
  const picks = new Map<number, ScoutPick>();

  const consider = (result: TmdbDiscoverResult, window: ScoutWindow) => {
    if (result.adult === true) return;
    if (!result.title) return;
    if (!result.release_date || result.release_date < oldestAllowed) return;
    if ((result.popularity ?? 0) < SCOUT_MIN_POPULARITY) return;
    if (input.knownTmdbIds.has(result.id)) return;
    picks.set(result.id, {
      tmdb_id: result.id,
      title: result.title,
      year: Number(result.release_date.slice(0, 4)),
      release_date: result.release_date,
      window,
      artwork_url: result.poster_path ? `${POSTER_BASE}${result.poster_path}` : null,
      description: result.overview ?? "",
    });
  };

  // Theatrical last so it overwrites a digital entry for the same film.
  for (const result of input.digital) consider(result, "digital");
  for (const result of input.theatrical) consider(result, "theatrical");

  return [...picks.values()];
}
