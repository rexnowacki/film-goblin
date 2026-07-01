export interface FilmInput {
  title: string;
  year: number;
  director: string;
}

export interface ItunesCandidate {
  trackId: number;
  trackName: string;
  releaseDate: string;
  artistName: string;
  trackViewUrl: string;
  artworkUrl100: string;
}

export type MatchType =
  | "exact_title_year_director"
  | "exact_title_year"
  | "exact_title_fuzzy_year_director"
  | "exact_title_fuzzy_year"
  | "normalized_title_year_director"
  | "normalized_title_year"
  | "normalized_title_fuzzy_year_director"
  | "normalized_title_fuzzy_year"
  | "below_threshold";

export interface MatchScore {
  confidence: number;
  matchType: MatchType;
}

const ARTICLES = /^(the|a|an)\s+/i;
// Apple names many listings "Title (YYYY)" — strip the suffix, but never a
// bare year title like "1917".
const YEAR_SUFFIX = /\s+\((19|20)\d{2}\)$/;

function stripYearSuffix(s: string): string {
  return s.replace(YEAR_SUFFIX, "");
}

function lowercaseOnly(s: string): string {
  return stripYearSuffix(s.trim()).toLowerCase();
}

function fullyNormalize(s: string): string {
  return stripYearSuffix(s.trim())
    .normalize("NFKC")
    .toLowerCase()
    .replace(ARTICLES, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYear(iso: string): number | null {
  const m = iso.match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

export function scoreMatch(film: FilmInput, candidate: ItunesCandidate): MatchScore {
  let confidence = 0;
  let titleMode: "exact" | "normalized" | "none" = "none";
  let yearMode: "exact" | "fuzzy" | "none" = "none";
  let directorMatched = false;

  if (lowercaseOnly(film.title) === lowercaseOnly(candidate.trackName)) {
    confidence += 0.6;
    titleMode = "exact";
  } else if (fullyNormalize(film.title) === fullyNormalize(candidate.trackName)) {
    confidence += 0.4;
    titleMode = "normalized";
  }

  const candYear = extractYear(candidate.releaseDate);
  if (candYear !== null) {
    if (candYear === film.year) {
      confidence += 0.3;
      yearMode = "exact";
    } else if (Math.abs(candYear - film.year) === 1) {
      confidence += 0.15;
      yearMode = "fuzzy";
    }
  }

  if (
    film.director.trim().length > 0 &&
    lowercaseOnly(film.director) === lowercaseOnly(candidate.artistName)
  ) {
    confidence += 0.1;
    directorMatched = true;
  }

  confidence = Math.min(Math.round(confidence * 1e10) / 1e10, 1.0);

  if (confidence < 0.45 || titleMode === "none") {
    return { confidence, matchType: "below_threshold" };
  }

  const titleKey = titleMode === "exact" ? "exact_title" : "normalized_title";
  const yearKey = yearMode === "exact" ? "year" : yearMode === "fuzzy" ? "fuzzy_year" : null;
  if (yearKey === null) {
    return { confidence, matchType: "below_threshold" };
  }
  const key = directorMatched
    ? `${titleKey}_${yearKey}_director`
    : `${titleKey}_${yearKey}`;
  return { confidence, matchType: key as MatchType };
}
