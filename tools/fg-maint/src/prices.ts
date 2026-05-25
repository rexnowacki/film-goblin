import { Digest } from "../../../worker/src/digest.ts";
import {
  createAlertAndMark,
  findWatchlistsForFilm,
  insertPriceHistory,
  latestPriceHistory,
  markUnavailable,
  maxPriceInWindow,
  updateLastChecked,
} from "../../../worker/src/db.ts";
import { computeDiff, shouldAlert } from "../../../worker/src/diff.ts";
import { fetchPrices, parseFilm } from "../../../worker/src/itunes.ts";
import { runOnce } from "../../../worker/src/worker.ts";
import { selectFullPriceSnapshot, type FullPriceFilm, type PgClient } from "./db.js";

export interface PriceRunOptions {
  all: boolean;
  batchSize: number;
  delayMs: number;
  maxAttempts: number;
  maxRuntimeMs: number;
  staleHours: number;
  maxFilms: number;
}

export interface FullPriceSweepResult {
  digest: Digest;
  snapshotSize: number;
  batches: number;
  appleRequests: number;
  delayMs: number;
  batchSize: number;
}

function clampInt(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function normalizePriceRunOptions(flags: Record<string, string | boolean>): PriceRunOptions {
  return {
    all: Boolean(flags.all),
    batchSize: clampInt(Number(flags["batch-size"]), 100, 1, 100),
    delayMs: clampInt(Number(flags["delay-ms"]), 2000, 0, 60_000),
    maxAttempts: clampInt(Number(flags["max-attempts"]), 4, 1, 10),
    maxRuntimeMs: clampInt(Number(flags["budget-ms"]), 240_000, 1, Number.MAX_SAFE_INTEGER),
    staleHours: clampInt(Number(flags["stale-hours"]), 20, 0, 24 * 365),
    maxFilms: clampInt(Number(flags["max-films"]), 10_000, 1, Number.MAX_SAFE_INTEGER),
  };
}

function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processFilm(client: PgClient, film: FullPriceFilm, raw: unknown, digest: Digest): Promise<void> {
  if (!raw) {
    await markUnavailable(client, film.id);
    digest.markedUnavailable();
    digest.filmRefreshed();
    return;
  }

  const parsed = parseFilm(raw as Parameters<typeof parseFilm>[0]);
  if (!parsed) {
    await updateLastChecked(client, film.id);
    digest.parseFailure(film.itunes_id);
    digest.filmRefreshed();
    return;
  }

  const latest = await latestPriceHistory(client, film.id);
  const diff = computeDiff(latest, parsed.price_usd);
  if (!diff.writeHistory) {
    await updateLastChecked(client, film.id);
    digest.filmRefreshed();
    return;
  }

  const maxPrice = (await maxPriceInWindow(client, film.id, 180)) ?? parsed.price_usd;
  const isSale = parsed.price_usd < maxPrice;

  await insertPriceHistory(client, film.id, parsed.price_usd, parsed.hd_price_usd, isSale);
  digest.priceChanged();
  digest.filmRefreshed();

  if (!diff.decreased || !latest) return;

  const now = new Date();
  const watchlists = await findWatchlistsForFilm(client, film.id);
  for (const watchlist of watchlists) {
    if (!shouldAlert(watchlist, parsed.price_usd, now)) continue;
    await createAlertAndMark(client, watchlist.id, film.id, latest.price_usd, parsed.price_usd);
    digest.alertFired();
  }
}

export async function runFullPriceSweep(
  client: PgClient,
  options: PriceRunOptions,
): Promise<FullPriceSweepResult> {
  const snapshot = await selectFullPriceSnapshot(client);
  const batches = chunks(snapshot, options.batchSize);
  const digest = new Digest();
  let appleRequests = 0;

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    const ids = batch.map((film) => film.itunes_id);
    const lookup = await fetchPrices(ids, {
      maxAttempts: options.maxAttempts,
      backoffMs: Math.max(1000, options.delayMs),
    });
    appleRequests += 1;
    const byItunesId = new Map(lookup.results.map((result) => [result.trackId, result]));

    for (const film of batch) {
      await processFilm(client, film, byItunesId.get(film.itunes_id), digest);
    }

    if (i < batches.length - 1) await sleep(options.delayMs);
  }

  return {
    digest,
    snapshotSize: snapshot.length,
    batches: batches.length,
    appleRequests,
    delayMs: options.delayMs,
    batchSize: options.batchSize,
  };
}

export async function runStalePriceRefresh(client: PgClient, options: PriceRunOptions): Promise<Digest> {
  return runOnce(client, {
    batchSize: options.batchSize,
    maxFilms: options.maxFilms,
    maxRuntimeMs: options.maxRuntimeMs,
    staleHours: options.staleHours,
  });
}
