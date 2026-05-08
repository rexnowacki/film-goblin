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
    };

    return { ok: true, fields };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "TMDB lookup failed." };
  }
}
