import { describe, it, expect } from "vitest";
import { sortWatchlist, computeDropPct, type WatchlistSort } from "@/lib/queries/sort-watchlist";
import type { WatchlistRowData } from "@/lib/queries/watchlists";

function row(overrides: Partial<WatchlistRowData> & { id: string; title?: string; latest_price?: number | null; max_price_usd?: number | null; created_at?: string }): WatchlistRowData {
  return {
    id: overrides.id,
    film_id: overrides.id + "-film",
    max_price_usd: overrides.max_price_usd ?? null,
    last_alerted_at: null,
    created_at: overrides.created_at ?? "2026-04-20T00:00:00Z",
    film: {
      id: overrides.id + "-film",
      title: overrides.title ?? `Film ${overrides.id}`,
      director: "Dir",
      year: 2020,
      artwork_url: "",
      itunes_url: null,
      genre_primary: "Horror",
      runtime_min: 100,
      latest_price: overrides.latest_price ?? null,
      coven_rating_pct: null,
    },
  };
}

describe("computeDropPct", () => {
  it("returns null when max_price_usd is null", () => {
    expect(computeDropPct(row({ id: "a", latest_price: 5, max_price_usd: null }))).toBeNull();
  });
  it("returns null when latest_price is null", () => {
    expect(computeDropPct(row({ id: "a", latest_price: null, max_price_usd: 10 }))).toBeNull();
  });
  it("returns null when latest_price > max_price_usd (not dropped)", () => {
    expect(computeDropPct(row({ id: "a", latest_price: 12, max_price_usd: 10 }))).toBeNull();
  });
  it("returns 0 when latest_price equals max_price_usd (borderline dropped)", () => {
    expect(computeDropPct(row({ id: "a", latest_price: 10, max_price_usd: 10 }))).toBe(0);
  });
  it("returns positive fraction when latest_price < max_price_usd", () => {
    expect(computeDropPct(row({ id: "a", latest_price: 5, max_price_usd: 10 }))).toBe(0.5);
  });
});

describe("sortWatchlist", () => {
  it("drop sort: dropped rows first ordered by % drop DESC, rest in recency order", () => {
    const rows: WatchlistRowData[] = [
      row({ id: "a", latest_price: 8, max_price_usd: 10, created_at: "2026-04-01T00:00:00Z" }), // dropped 20%
      row({ id: "b", latest_price: 15, max_price_usd: 10, created_at: "2026-04-02T00:00:00Z" }), // not dropped
      row({ id: "c", latest_price: 2, max_price_usd: 10, created_at: "2026-04-03T00:00:00Z" }), // dropped 80%
      row({ id: "d", latest_price: 20, max_price_usd: null, created_at: "2026-04-04T00:00:00Z" }), // no threshold
    ];
    const sorted = sortWatchlist(rows, "drop");
    expect(sorted.map(r => r.id)).toEqual(["c", "a", "d", "b"]);
  });

  it("recency sort: newest created_at first", () => {
    const rows: WatchlistRowData[] = [
      row({ id: "a", created_at: "2026-04-01T00:00:00Z" }),
      row({ id: "b", created_at: "2026-04-03T00:00:00Z" }),
      row({ id: "c", created_at: "2026-04-02T00:00:00Z" }),
    ];
    expect(sortWatchlist(rows, "recency").map(r => r.id)).toEqual(["b", "c", "a"]);
  });

  it("price-low sort: cheapest first, nulls last", () => {
    const rows: WatchlistRowData[] = [
      row({ id: "a", latest_price: 10 }),
      row({ id: "b", latest_price: null }),
      row({ id: "c", latest_price: 5 }),
      row({ id: "d", latest_price: 8 }),
    ];
    expect(sortWatchlist(rows, "price-low").map(r => r.id)).toEqual(["c", "d", "a", "b"]);
  });

  it("alphabetical sort: A-Z by title", () => {
    const rows: WatchlistRowData[] = [
      row({ id: "1", title: "Midsommar" }),
      row({ id: "2", title: "Annihilation" }),
      row({ id: "3", title: "Suspiria" }),
    ];
    expect(sortWatchlist(rows, "alphabetical").map(r => r.film.title)).toEqual(["Annihilation", "Midsommar", "Suspiria"]);
  });

  it("drop sort: rows with null max_price_usd never appear in the dropped block", () => {
    const rows: WatchlistRowData[] = [
      row({ id: "a", latest_price: 5, max_price_usd: null, created_at: "2026-04-02T00:00:00Z" }),
      row({ id: "b", latest_price: 5, max_price_usd: 10, created_at: "2026-04-01T00:00:00Z" }),
    ];
    expect(sortWatchlist(rows, "drop").map(r => r.id)).toEqual(["b", "a"]);
  });

  it("drop sort: rows with null latest_price never appear in the dropped block", () => {
    const rows: WatchlistRowData[] = [
      row({ id: "a", latest_price: null, max_price_usd: 10, created_at: "2026-04-02T00:00:00Z" }),
      row({ id: "b", latest_price: 5, max_price_usd: 10, created_at: "2026-04-01T00:00:00Z" }),
    ];
    expect(sortWatchlist(rows, "drop").map(r => r.id)).toEqual(["b", "a"]);
  });
});
