import type { ITunesResult, ITunesLookupResponse, ParsedFilm } from "./types.js";

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

interface FetchOptions {
  maxAttempts?: number;
  backoffMs?: number;
  fetchImpl?: typeof fetch;
}

function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

export async function fetchPrices(
  iTunesIds: number[],
  opts: FetchOptions = {}
): Promise<ITunesLookupResponse> {
  const max = opts.maxAttempts ?? 3;
  const backoff = opts.backoffMs ?? 500;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const url = new URL("https://itunes.apple.com/lookup");
  url.searchParams.set("id", iTunesIds.join(","));
  url.searchParams.set("country", "US");

  let lastError: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    let retryDelayMs: number | null = null;
    try {
      const res = await fetchImpl(url.toString());
      if (res.ok) return (await res.json()) as ITunesLookupResponse;
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`itunes lookup ${res.status}`);
        retryDelayMs = retryAfterMs(res.headers.get("retry-after"));
      } else {
        throw new Error(`itunes lookup ${res.status}`);
      }
    } catch (err) {
      lastError = err;
    }
    if (attempt < max) {
      await new Promise(r => setTimeout(r, retryDelayMs ?? backoff * Math.pow(2, attempt - 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function searchFilms(
  term: string,
  opts: FetchOptions & { limit?: number } = {}
): Promise<ITunesLookupResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("country", "US");
  url.searchParams.set("limit", String(opts.limit ?? 25));
  const res = await fetchImpl(url.toString());
  if (!res.ok) throw new Error(`itunes search ${res.status}`);
  return (await res.json()) as ITunesLookupResponse;
}
