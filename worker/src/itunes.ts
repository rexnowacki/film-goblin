import type { ITunesResult, ParsedFilm } from "./types.js";

const MIN_VALID_PRICE = 0.5;

export function upscaleArtworkUrl(url: string): string {
  if (!url) return url;
  return url.replace("/100x100bb.jpg", "/600x600bb.jpg");
}

export function parseFilm(raw: ITunesResult): ParsedFilm | null {
  if (raw.kind !== "feature-movie") return null;

  const price = raw.trackPrice;
  if (price == null || price < MIN_VALID_PRICE) return null;

  const year = raw.releaseDate ? new Date(raw.releaseDate).getUTCFullYear() : 0;
  const runtime_min = raw.trackTimeMillis ? Math.round(raw.trackTimeMillis / 60000) : 0;

  return {
    itunes_id: raw.trackId,
    title: raw.trackName,
    director: raw.artistName,
    year,
    runtime_min,
    genre_primary: raw.primaryGenreName ?? "",
    description: raw.longDescription ?? raw.shortDescription ?? "",
    content_advisory: raw.contentAdvisoryRating ?? "",
    artwork_url: raw.artworkUrl100 ? upscaleArtworkUrl(raw.artworkUrl100) : "",
    itunes_url: raw.trackViewUrl ?? "",
    price_usd: price,
    hd_price_usd: raw.trackHdPrice ?? null,
  };
}
