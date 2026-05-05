export interface DbFilm {
  id: string;
  itunes_id: number | null;
  title: string;
  director: string;
  year: number;
  genre_primary: string;
  artwork_url: string;
  editorial_starter: boolean;
  tagIds: string[];
}

const LANE_FILTER_MIN = 6;

export const MIN_PICKS = 3;

export function canProceed(selectedCount: number): boolean {
  return selectedCount >= MIN_PICKS;
}

export function filterFilmsByLanes(films: DbFilm[], laneTagIds: string[]): DbFilm[] {
  if (laneTagIds.length === 0) return films;
  const matched = films.filter(f => laneTagIds.some(id => f.tagIds.includes(id)));
  return matched.length >= LANE_FILTER_MIN ? matched : films;
}
