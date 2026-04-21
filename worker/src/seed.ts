import type { Client } from "pg";
import { searchFilms, parseFilm } from "./itunes.js";
import { upsertFilm } from "./db.js";

export const DEFAULT_SEED_QUERIES = [
  "folk horror",
  "a24",
  "ari aster",
  "robert eggers",
  "kiyoshi kurosawa",
  "midnight movies",
  "giallo",
  "j-horror",
  "body horror",
  "slow cinema",
];

export async function seedFilms(
  client: Client,
  queries: string[] = DEFAULT_SEED_QUERIES
): Promise<number> {
  let count = 0;
  const seen = new Set<number>();
  for (const q of queries) {
    const res = await searchFilms(q, { limit: 50 });
    for (const raw of res.results) {
      if (seen.has(raw.trackId)) continue;
      const parsed = parseFilm(raw);
      if (!parsed) continue;
      await upsertFilm(client, parsed);
      seen.add(raw.trackId);
      count++;
    }
  }
  return count;
}
