import type { PriceHistoryRow, WatchlistRow } from "./types.js";

export interface DiffResult {
  writeHistory: boolean;
  decreased: boolean;
  unchanged: boolean;
}

export function computeDiff(
  latest: PriceHistoryRow | null,
  newPrice: number
): DiffResult {
  if (latest == null) {
    return { writeHistory: true, decreased: false, unchanged: false };
  }
  if (latest.price_usd === newPrice) {
    return { writeHistory: false, decreased: false, unchanged: true };
  }
  return {
    writeHistory: true,
    decreased: newPrice < latest.price_usd,
    unchanged: false,
  };
}

const DAY_MS = 24 * 3600 * 1000;

export function shouldAlert(
  w: WatchlistRow,
  newPrice: number,
  now: Date
): boolean {
  if (w.max_price_usd != null && newPrice > w.max_price_usd) return false;
  if (w.last_alerted_at && now.getTime() - w.last_alerted_at.getTime() < DAY_MS) return false;
  return true;
}
