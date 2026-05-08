import type { ItunesCandidate } from "./score";

const ENDPOINT = "https://itunes.apple.com/search";

export async function searchItunesMovies(query: string): Promise<ItunesCandidate[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("term", query);
  url.searchParams.set("entity", "movie");
  url.searchParams.set("country", "us");
  url.searchParams.set("limit", "10");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`iTunes search returned ${res.status}`);
  const data = await res.json();

  // iTunes returns { resultCount, results: [...] }. Map to our shape, ignoring
  // entries missing the bits we need.
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .filter((r: any) => typeof r.trackId === "number" && typeof r.trackName === "string")
    .map((r: any): ItunesCandidate => ({
      trackId: r.trackId,
      trackName: r.trackName,
      releaseDate: r.releaseDate ?? "",
      artistName: r.artistName ?? "",
      trackViewUrl: r.trackViewUrl ?? "",
      artworkUrl100: r.artworkUrl100 ?? "",
    }));
}
