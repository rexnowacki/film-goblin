import { describe, it, expect } from "vitest";
import { computeDiff, shouldAlert } from "../src/diff.js";
import type { PriceHistoryRow, WatchlistRow } from "../src/types.js";

const historyRow = (price_usd: number, captured_at = new Date()): PriceHistoryRow => ({
  id: "00000000-0000-0000-0000-000000000001",
  film_id: "f1",
  captured_at,
  price_usd,
  hd_price_usd: null,
  is_sale: false,
});

describe("computeDiff", () => {
  it("writeHistory=true when there is no prior history", () => {
    expect(computeDiff(null, 4.99)).toEqual({
      writeHistory: true,
      decreased: false,
      unchanged: false,
    });
  });

  it("writeHistory=false when the price is identical", () => {
    expect(computeDiff(historyRow(4.99), 4.99)).toEqual({
      writeHistory: false,
      decreased: false,
      unchanged: true,
    });
  });

  it("decreased=true when the price dropped", () => {
    expect(computeDiff(historyRow(5.99), 4.99)).toEqual({
      writeHistory: true,
      decreased: true,
      unchanged: false,
    });
  });

  it("writeHistory=true but decreased=false when the price went up", () => {
    expect(computeDiff(historyRow(4.99), 5.99)).toEqual({
      writeHistory: true,
      decreased: false,
      unchanged: false,
    });
  });
});

const watchlist = (overrides: Partial<WatchlistRow> = {}): WatchlistRow => ({
  id: "w1",
  user_id: "u1",
  film_id: "f1",
  max_price_usd: null,
  last_alerted_at: null,
  ...overrides,
});

describe("shouldAlert", () => {
  const now = new Date("2026-04-20T12:00:00Z");

  it("alerts when max_price_usd is null and last_alerted_at is null", () => {
    expect(shouldAlert(watchlist(), 4.99, now)).toBe(true);
  });

  it("does not alert when newPrice exceeds max_price_usd", () => {
    expect(shouldAlert(watchlist({ max_price_usd: 5.00 }), 6.99, now)).toBe(false);
  });

  it("alerts when newPrice equals max_price_usd", () => {
    expect(shouldAlert(watchlist({ max_price_usd: 5.00 }), 5.00, now)).toBe(true);
  });

  it("does not alert when last_alerted_at is within 24 hours", () => {
    const recent = new Date(now.getTime() - 23 * 3600 * 1000);
    expect(shouldAlert(watchlist({ last_alerted_at: recent }), 4.99, now)).toBe(false);
  });

  it("alerts when last_alerted_at is older than 24 hours", () => {
    const old = new Date(now.getTime() - 25 * 3600 * 1000);
    expect(shouldAlert(watchlist({ last_alerted_at: old }), 4.99, now)).toBe(true);
  });
});
