const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/w780";

function apiKey(): string {
  const k = process.env.TMDB_API_KEY;
  if (!k) throw new Error("TMDB_API_KEY not configured");
  return k;
}

export interface TmdbCandidate {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  overview: string;
}

export interface TmdbFilmFields {
  itunes_id: null;
  title: string;
  director: string;
  year: number;
  runtime_min: number;
  genre_primary: string;
  description: string;
  content_advisory: string;
  artwork_url: string;
  itunes_url: string;
  tracking: boolean;
  available: boolean;
  tmdb_id: number;
  theatrical_release_date: string | null;
  series_id: string | null;
  series_new_name: string;
  series_order: number | null;
}

export interface TmdbVideo {
  id?: string;
  iso_3166_1?: string;
  iso_639_1?: string;
  key?: string;
  name?: string;
  official?: boolean;
  published_at?: string;
  site?: string;
  size?: number;
  type?: string;
}

export interface TmdbTrailer {
  youtube_id: string;
  url: string;
  label: string;
  official: boolean;
  published_at: string | null;
}

export interface TmdbResolvedTrailer extends TmdbTrailer {
  tmdb_id: number;
}

export interface TmdbCreditCastMember {
  id?: number;
  name?: string;
  character?: string;
  order?: number;
  profile_path?: string | null;
  known_for_department?: string | null;
}

export interface TmdbCastMember {
  tmdb_id: number;
  name: string;
  character: string | null;
  billing_order: number;
  profile_path: string | null;
  known_for_department: string | null;
}

export async function searchTmdb(query: string): Promise<
  | { ok: true; candidates: TmdbCandidate[] }
  | { ok: false; error: string }
> {
  if (!query.trim()) return { ok: true, candidates: [] };

  try {
    const url = `${TMDB_BASE}/search/movie?api_key=${apiKey()}&query=${encodeURIComponent(query)}&language=en-US&include_adult=false`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`TMDB returned ${res.status}`);
    const data = await res.json();

    const candidates: TmdbCandidate[] = (data.results ?? []).slice(0, 10).map((r: any) => ({
      tmdb_id: r.id,
      title: r.title,
      year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
      poster_url: r.poster_path ? `${IMG_BASE}${r.poster_path}` : null,
      overview: r.overview ?? "",
    }));

    return { ok: true, candidates };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "TMDB search failed." };
  }
}

function publishedTime(video: TmdbVideo): number {
  const value = video.published_at ? Date.parse(video.published_at) : 0;
  return Number.isFinite(value) ? value : 0;
}

function trailerRank(video: TmdbVideo): number {
  const type = (video.type ?? "").toLowerCase();
  const official = video.official === true;
  if (official && type === "trailer") return 0;
  if (official && type === "teaser") return 1;
  if (type === "trailer") return 2;
  if (type === "teaser") return 3;
  return 4;
}

export function chooseBestTmdbTrailer(videos: TmdbVideo[]): TmdbTrailer | null {
  const candidates = videos
    .filter((video) => (video.site ?? "").toLowerCase() === "youtube")
    .filter((video) => typeof video.key === "string" && video.key.trim().length > 0)
    .filter((video) => {
      const type = (video.type ?? "").toLowerCase();
      return type === "trailer" || type === "teaser";
    })
    .sort((a, b) => {
      const rankDiff = trailerRank(a) - trailerRank(b);
      if (rankDiff !== 0) return rankDiff;
      return publishedTime(b) - publishedTime(a);
    });

  const best = candidates[0];
  if (!best?.key) return null;

  return {
    youtube_id: best.key.trim(),
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(best.key.trim())}`,
    label: best.name?.trim() || "Official Trailer",
    official: best.official === true,
    published_at: best.published_at ?? null,
  };
}

export function chooseTmdbCast(cast: TmdbCreditCastMember[], limit = 12): TmdbCastMember[] {
  return cast
    .filter((member) => Number.isFinite(member.id))
    .filter((member) => typeof member.name === "string" && member.name.trim().length > 0)
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
    .slice(0, Math.max(1, limit))
    .map((member, index) => ({
      tmdb_id: Number(member.id),
      name: member.name!.trim(),
      character: member.character?.trim() || null,
      billing_order: Number.isFinite(member.order) ? Number(member.order) : index,
      profile_path: member.profile_path ?? null,
      known_for_department: member.known_for_department ?? null,
    }));
}

export async function lookupTmdbTrailer(tmdbId: number): Promise<
  | { ok: true; trailer: TmdbTrailer | null }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(`${TMDB_BASE}/movie/${tmdbId}/videos?api_key=${apiKey()}&language=en-US`, { cache: "no-store" });
    if (!res.ok) throw new Error(`TMDB videos fetch returned ${res.status}`);
    const data = await res.json();
    return { ok: true, trailer: chooseBestTmdbTrailer(data.results ?? []) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "TMDB trailer lookup failed." };
  }
}

export async function lookupTmdbCast(tmdbId: number, limit = 12): Promise<
  | { ok: true; cast: TmdbCastMember[] }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(`${TMDB_BASE}/movie/${tmdbId}/credits?api_key=${apiKey()}&language=en-US`, { cache: "no-store" });
    if (!res.ok) throw new Error(`TMDB credits fetch returned ${res.status}`);
    const data = await res.json();
    return { ok: true, cast: chooseTmdbCast(data.cast ?? [], limit) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "TMDB cast lookup failed." };
  }
}

function normalizeTitleForMatch(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(\s*(19|20)\d{2}\s*\)\s*$/, "")
    .replace(/&/g, "and")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export async function resolveTmdbIdByTitleYear(title: string, year: number): Promise<
  | { ok: true; tmdb_id: number | null }
  | { ok: false; error: string }
> {
  const cleanTitle = title.trim().replace(new RegExp(`\\s*\\(\\s*${year}\\s*\\)\\s*$`), "").trim();
  if (!cleanTitle || !Number.isFinite(year) || year <= 0) return { ok: true, tmdb_id: null };

  try {
    const url = `${TMDB_BASE}/search/movie?api_key=${apiKey()}&query=${encodeURIComponent(cleanTitle)}&language=en-US&include_adult=false&year=${year}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`TMDB search returned ${res.status}`);
    const data = await res.json();
    const expectedTitle = normalizeTitleForMatch(cleanTitle);
    const match = (data.results ?? []).find((result: any) => {
      const resultYear = result.release_date ? Number(String(result.release_date).slice(0, 4)) : null;
      const titleMatches = [result.title, result.original_title]
        .filter((value): value is string => typeof value === "string")
        .some((value) => normalizeTitleForMatch(value) === expectedTitle);
      return resultYear === year && titleMatches;
    });
    return { ok: true, tmdb_id: match?.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "TMDB title lookup failed." };
  }
}

export async function lookupTmdbTrailerForFilm(input: { tmdb_id?: number | null; title: string; year: number }): Promise<
  | { ok: true; trailer: TmdbResolvedTrailer | null }
  | { ok: false; error: string }
> {
  let tmdbId = input.tmdb_id ?? null;
  if (!tmdbId) {
    const resolveResult = await resolveTmdbIdByTitleYear(input.title, input.year);
    if (!resolveResult.ok) return resolveResult;
    tmdbId = resolveResult.tmdb_id;
  }
  if (!tmdbId) return { ok: true, trailer: null };

  const trailerResult = await lookupTmdbTrailer(tmdbId);
  if (!trailerResult.ok) return trailerResult;
  return {
    ok: true,
    trailer: trailerResult.trailer ? { ...trailerResult.trailer, tmdb_id: tmdbId } : null,
  };
}

export async function lookupTmdbCastForFilm(input: { tmdb_id?: number | null; title: string; year: number; limit?: number }): Promise<
  | { ok: true; tmdb_id: number | null; cast: TmdbCastMember[] }
  | { ok: false; error: string }
> {
  let tmdbId = input.tmdb_id ?? null;
  if (!tmdbId) {
    const resolveResult = await resolveTmdbIdByTitleYear(input.title, input.year);
    if (!resolveResult.ok) return resolveResult;
    tmdbId = resolveResult.tmdb_id;
  }
  if (!tmdbId) return { ok: true, tmdb_id: null, cast: [] };

  const castResult = await lookupTmdbCast(tmdbId, input.limit ?? 12);
  if (!castResult.ok) return castResult;
  return { ok: true, tmdb_id: tmdbId, cast: castResult.cast };
}

export async function lookupTmdb(tmdbId: number): Promise<
  | { ok: true; fields: TmdbFilmFields }
  | { ok: false; error: string }
> {
  try {
    const k = apiKey();
    const [movieRes, creditsRes, releaseDatesRes] = await Promise.all([
      fetch(`${TMDB_BASE}/movie/${tmdbId}?api_key=${k}&language=en-US`, { cache: "no-store" }),
      fetch(`${TMDB_BASE}/movie/${tmdbId}/credits?api_key=${k}`, { cache: "no-store" }),
      fetch(`${TMDB_BASE}/movie/${tmdbId}/release_dates?api_key=${k}`, { cache: "no-store" }),
    ]);

    if (!movieRes.ok) throw new Error(`TMDB movie fetch returned ${movieRes.status}`);

    const [movie, credits, releaseDates] = await Promise.all([
      movieRes.json(),
      creditsRes.ok ? creditsRes.json() : { crew: [] },
      releaseDatesRes.ok ? releaseDatesRes.json() : { results: [] },
    ]);

    const director = (credits.crew ?? []).find((c: any) => c.job === "Director")?.name ?? "";

    // US theatrical certification (e.g. "R", "PG-13")
    const usEntry = (releaseDates.results ?? []).find((r: any) => r.iso_3166_1 === "US");
    const certification = usEntry?.release_dates?.find((d: any) => d.certification)?.certification ?? "";

    const fields: TmdbFilmFields = {
      itunes_id: null,
      title: movie.title ?? "",
      director,
      year: movie.release_date ? Number(movie.release_date.slice(0, 4)) : 0,
      runtime_min: movie.runtime ?? 0,
      genre_primary: movie.genres?.[0]?.name ?? "",
      description: movie.overview ?? "",
      content_advisory: certification,
      artwork_url: movie.poster_path ? `${IMG_BASE}${movie.poster_path}` : "",
      itunes_url: "",
      tracking: false,
      available: true,
      tmdb_id: tmdbId,
      theatrical_release_date: movie.release_date || null,
      series_id: null,
      series_new_name: "",
      series_order: null,
    };

    return { ok: true, fields };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "TMDB lookup failed." };
  }
}
