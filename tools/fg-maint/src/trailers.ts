import {
  listMissingTrailers,
  updateFilmTrailer,
  type MissingEnrichmentFilm,
  type PgClient,
} from "./db.js";
import { searchBrave, type BraveSearchResult } from "./brave.js";
import { canonicalYoutubeUrl, extractYoutubeId } from "./youtube.js";

const OFFICIAL_CHANNEL_HINTS = [
  "a24",
  "arrow video",
  "criterion",
  "ifc films",
  "janus films",
  "kino lorber",
  "magnolia pictures",
  "neon",
  "rlje films",
  "shudder",
  "utopia",
  "xyz films",
];

const NEGATIVE_TERMS = [
  ["reaction", -0.4],
  ["review", -0.35],
  ["explained", -0.3],
  ["ending", -0.3],
  ["fan trailer", -0.25],
  ["clip", -0.2],
  ["scene", -0.2],
  ["teaser", -0.15],
  ["trailer 2", -0.15],
] as const;

export interface TrailerCandidate {
  youtubeId: string;
  url: string;
  title: string;
  description: string;
  sourceUrl: string;
  score: number;
  reasons: string[];
}

export interface TrailerSearchOptions {
  limit: number;
  threshold: number;
  delayMs: number;
  write: boolean;
  yes: boolean;
}

export interface TrailerSearchResult {
  scanned: number;
  candidatesFound: number;
  written: number;
  belowThreshold: number;
  noCandidates: number;
  failed: number;
  rows: Array<{
    film: MissingEnrichmentFilm;
    candidate: TrailerCandidate | null;
    action: "would_save" | "saved" | "below_threshold" | "no_candidates" | "failed";
    error?: string;
  }>;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function containsAllTitleTokens(haystack: string, title: string): boolean {
  const tokens = normalize(title).split(" ").filter((token) => token.length > 1);
  if (tokens.length === 0) return false;
  return tokens.every((token) => haystack.includes(token));
}

export function scoreTrailerCandidate(
  film: Pick<MissingEnrichmentFilm, "title" | "year" | "director">,
  result: BraveSearchResult,
  youtubeId: string,
): TrailerCandidate {
  const title = normalize(result.title);
  const description = normalize(result.description);
  const combined = `${title} ${description}`;
  const reasons: string[] = [];
  let score = 0;

  if (containsAllTitleTokens(title, film.title)) {
    score += 0.35;
    reasons.push("title match");
  }
  if (title.includes("official trailer") || description.includes("official trailer")) {
    score += 0.2;
    reasons.push("official trailer");
  }
  const yearText = String(film.year);
  if (film.year && combined.includes(yearText)) {
    score += 0.1;
    reasons.push("year match");
  } else if (film.year && combined.includes(String(film.year - 1))) {
    score += 0.05;
    reasons.push("near-year match");
  }
  const directorTokens = normalize(film.director).split(" ").filter((token) => token.length > 2);
  if (directorTokens.length > 0 && directorTokens.some((token) => combined.includes(token))) {
    score += 0.1;
    reasons.push("director mention");
  }
  if (OFFICIAL_CHANNEL_HINTS.some((hint) => combined.includes(hint))) {
    score += 0.1;
    reasons.push("known channel/distributor");
  }
  if (title.includes("trailer") && description.includes("official trailer")) {
    score += 0.13;
    reasons.push("official snippet");
  }
  if (extractYoutubeId(result.url) === youtubeId) {
    score += 0.05;
    reasons.push("direct youtube url");
  }

  for (const [term, penalty] of NEGATIVE_TERMS) {
    if (combined.includes(term)) {
      score += penalty;
      reasons.push(`penalty:${term}`);
    }
  }
  if (film.year && !combined.includes(yearText) && !combined.includes(String(film.year - 1))) {
    score -= 0.1;
    reasons.push("missing year");
  }

  return {
    youtubeId,
    url: canonicalYoutubeUrl(youtubeId),
    title: result.title,
    description: result.description,
    sourceUrl: result.url,
    score: clamp(score),
    reasons,
  };
}

export async function findTrailerCandidate(film: MissingEnrichmentFilm): Promise<TrailerCandidate | null> {
  const query = `site:youtube.com/watch "${film.title}" "official trailer" ${film.year || ""}`.trim();
  const results = await searchBrave(query, 10);
  const candidates = results
    .map((result) => {
      const youtubeId = extractYoutubeId(result.url);
      return youtubeId ? scoreTrailerCandidate(film, result, youtubeId) : null;
    })
    .filter((candidate): candidate is TrailerCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score);

  return candidates[0] ?? null;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchMissingTrailers(
  client: PgClient,
  options: TrailerSearchOptions,
): Promise<TrailerSearchResult> {
  const films = await listMissingTrailers(client, options.limit);
  const result: TrailerSearchResult = {
    scanned: 0,
    candidatesFound: 0,
    written: 0,
    belowThreshold: 0,
    noCandidates: 0,
    failed: 0,
    rows: [],
  };

  for (let i = 0; i < films.length; i += 1) {
    const film = films[i];
    result.scanned += 1;

    try {
      const candidate = await findTrailerCandidate(film);
      if (!candidate) {
        result.noCandidates += 1;
        result.rows.push({ film, candidate: null, action: "no_candidates" });
      } else if (candidate.score < options.threshold) {
        result.candidatesFound += 1;
        result.belowThreshold += 1;
        result.rows.push({ film, candidate, action: "below_threshold" });
      } else if (!options.write) {
        result.candidatesFound += 1;
        result.rows.push({ film, candidate, action: "would_save" });
      } else {
        result.candidatesFound += 1;
        const written = await updateFilmTrailer(client, film.id, {
          trailer_url: candidate.url,
          trailer_source: "youtube",
          trailer_youtube_id: candidate.youtubeId,
          trailer_label: "Official Trailer",
          trailer_verified: false,
          trailer_updated_at: new Date().toISOString(),
        });
        if (written) {
          result.written += 1;
          result.rows.push({ film, candidate, action: "saved" });
        } else {
          result.failed += 1;
          result.rows.push({ film, candidate, action: "failed", error: "film already has trailer" });
        }
      }
    } catch (err) {
      result.failed += 1;
      result.rows.push({
        film,
        candidate: null,
        action: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (i < films.length - 1) await sleep(options.delayMs);
  }

  return result;
}
