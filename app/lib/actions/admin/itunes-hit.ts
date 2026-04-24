import type { ParsedFilm } from "film-goblin-worker";

export interface ITunesSearchHit {
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
  price_usd: number | null;
}

export function toHit(p: ParsedFilm): ITunesSearchHit {
  return {
    itunes_id: p.itunes_id,
    title: p.title,
    director: p.director,
    year: p.year,
    runtime_min: p.runtime_min,
    genre_primary: p.genre_primary,
    description: p.description,
    content_advisory: p.content_advisory,
    artwork_url: p.artwork_url,
    itunes_url: p.itunes_url,
    price_usd: p.price_usd,
  };
}
