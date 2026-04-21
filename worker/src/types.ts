// Rows as stored in our Postgres.
export interface FilmRow {
  id: string;                      // uuid
  itunes_id: number;
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
  first_seen_at: Date;
  last_checked_at: Date | null;
  last_priced_at: Date | null;
}

export interface PriceHistoryRow {
  id: string;
  film_id: string;
  captured_at: Date;
  price_usd: number;
  hd_price_usd: number | null;
  is_sale: boolean;
}

export interface WatchlistRow {
  id: string;
  user_id: string;
  film_id: string;
  max_price_usd: number | null;   // alert only if current price is at-or-below this (null = any drop)
  last_alerted_at: Date | null;
}

export interface PriceAlertRow {
  id: string;
  watchlist_id: string;
  film_id: string;
  old_price_usd: number;
  new_price_usd: number;
  created_at: Date;
}

// iTunes Search API raw response shapes.
export interface ITunesLookupResponse {
  resultCount: number;
  results: ITunesResult[];
}

export interface ITunesResult {
  wrapperType?: string;
  kind?: string;                   // "feature-movie" for what we want
  trackId: number;
  trackName: string;
  artistName: string;
  releaseDate: string;             // ISO string
  trackTimeMillis?: number;
  primaryGenreName?: string;
  longDescription?: string;
  shortDescription?: string;
  contentAdvisoryRating?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
  trackPrice?: number | null;
  trackHdPrice?: number | null;
  trackRentalPrice?: number | null;
  collectionId?: number;
  collectionName?: string;
}

// Parsed shape — what we persist (minus id/timestamps the DB assigns).
export interface ParsedFilm {
  itunes_id: number;
  title: string;
  director: string;
  year: number;
  runtime_min: number;
  genre_primary: string;
  description: string;
  content_advisory: string;
  artwork_url: string;
  itunes_url: string;
  price_usd: number;
  hd_price_usd: number | null;
}
