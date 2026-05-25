import type { Client } from "pg";
import { fetchPrices, parseFilm } from "./itunes.js";
import { computeDiff, shouldAlert } from "./diff.js";
import {
  selectFilmsToRefresh, latestPriceHistory, findWatchlistsForFilm,
  insertPriceHistory, updateLastChecked, markUnavailable, createAlertAndMark,
  maxPriceInWindow, upsertFilm, insertManualFilm,
} from "./db.js";
import { Digest } from "./digest.js";

export interface RunOnceOptions {
  batchSize?: number;
  maxFilms?: number;
  maxRuntimeMs?: number;
  staleHours?: number;
  now?: () => number;
}

export async function runOnce(client: Client, opts: RunOnceOptions = {}): Promise<Digest> {
  const batchSize = opts.batchSize ?? 100;
  const maxFilms = opts.maxFilms ?? 10000;
  const maxRuntimeMs = opts.maxRuntimeMs ?? 240_000;
  const staleHours = opts.staleHours ?? 20;
  const now = opts.now ?? Date.now;
  const startedAt = now();
  const digest = new Digest();

  let processed = 0;
  while (processed < maxFilms) {
    if (now() - startedAt >= maxRuntimeMs) {
      digest.stopped("time_budget");
      break;
    }

    const remaining = maxFilms - processed;
    const films = await selectFilmsToRefresh(client, Math.min(batchSize, remaining), { staleHours });
    if (films.length === 0) break;

    const ids = films.map(f => f.itunes_id);
    const lookup = await fetchPrices(ids);
    const byItunesId = new Map(lookup.results.map(r => [r.trackId, r]));

    for (const film of films) {
      const raw = byItunesId.get(film.itunes_id);

      if (!raw) {
        // iTunes returned nothing for this id — the film was removed.
        await markUnavailable(client, film.id);
        digest.markedUnavailable();
        digest.filmRefreshed();
        continue;
      }

      const parsed = parseFilm(raw);
      if (!parsed) {
        // Invalid read (kind mismatch, price = 0/null, etc.). Bump last_checked_at and move on.
        await updateLastChecked(client, film.id);
        digest.parseFailure(film.itunes_id);
        digest.filmRefreshed();
        continue;
      }

      const latest = await latestPriceHistory(client, film.id);
      const diff = computeDiff(latest, parsed.price_usd);

      if (!diff.writeHistory) {
        await updateLastChecked(client, film.id);
        digest.filmRefreshed();
        continue;
      }

      // Compute is_sale by comparing against max observed over trailing 180 days.
      const maxPrice = (await maxPriceInWindow(client, film.id, 180)) ?? parsed.price_usd;
      const is_sale = parsed.price_usd < maxPrice;

      await insertPriceHistory(client, film.id, parsed.price_usd, parsed.hd_price_usd, is_sale);
      digest.priceChanged();
      digest.filmRefreshed();

      if (diff.decreased) {
        const now = new Date();
        const oldPrice = latest!.price_usd; // already a number — coerced in latestPriceHistory
        const watchlists = await findWatchlistsForFilm(client, film.id);
        for (const w of watchlists) {
          if (!shouldAlert(w, parsed.price_usd, now)) continue;
          await createAlertAndMark(client, w.id, film.id, oldPrice, parsed.price_usd);
          digest.alertFired();
        }
      }
    }

    processed += films.length;
    if (processed >= maxFilms) {
      digest.stopped("max_films");
      break;
    }
    if (now() - startedAt >= maxRuntimeMs) {
      digest.stopped("time_budget");
      break;
    }
    if (films.length < Math.min(batchSize, remaining)) break;
  }

  return digest;
}

// Re-exports for the Next.js admin dashboard — do not break these without updating
// app/lib/actions/admin/films.ts.
export { searchFilms, parseFilm, fetchPrices } from "./itunes.js";
export type { ParsedFilm } from "./types.js";
export { upsertFilm, insertManualFilm } from "./db.js";
export type { ManualFilmFields } from "./db.js";
