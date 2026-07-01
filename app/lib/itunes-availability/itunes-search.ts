import type { ItunesCandidate } from "./score";

const ENDPOINT = "https://itunes.apple.com/search";

// As of 2026-07 the Search API returns zero results whenever entity=movie or
// media=movie is set, while the default (unfiltered) search still surfaces
// feature movies. Search wide and filter on kind ourselves.
export async function searchItunesMovies(query: string): Promise<ItunesCandidate[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("term", query);
  url.searchParams.set("country", "us");
  url.searchParams.set("limit", "50");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`iTunes search returned ${res.status}`);
  const data = await res.json();

  // iTunes returns { resultCount, results: [...] }. Keep feature movies with
  // the bits we need; drop songs, artists, and malformed rows.
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .filter(
      (r: any) =>
        r.kind === "feature-movie" &&
        typeof r.trackId === "number" &&
        typeof r.trackName === "string",
    )
    .map((r: any): ItunesCandidate => ({
      trackId: r.trackId,
      trackName: r.trackName,
      releaseDate: r.releaseDate ?? "",
      artistName: r.artistName ?? "",
      trackViewUrl: r.trackViewUrl ?? "",
      artworkUrl100: r.artworkUrl100 ?? "",
    }));
}
