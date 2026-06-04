import type { WatchlistRowData } from "./watchlists";

export type WatchlistSort = "drop" | "recency" | "price-low" | "alphabetical";

export function computeDropPct(r: WatchlistRowData): number | null {
  if (r.max_price_usd == null || r.film.latest_price == null) return null;
  if (r.film.latest_price > r.max_price_usd) return null;
  return (r.max_price_usd - r.film.latest_price) / r.max_price_usd;
}

export function sortWatchlist(rows: WatchlistRowData[], sort: WatchlistSort): WatchlistRowData[] {
  function showingFirst(sorted: WatchlistRowData[]) {
    return [...sorted].sort((a, b) => Number(b.film.currently_showing) - Number(a.film.currently_showing));
  }

  switch (sort) {
    case "drop": {
      const dropped: Array<[WatchlistRowData, number]> = [];
      const rest: WatchlistRowData[] = [];
      for (const r of rows) {
        const pct = computeDropPct(r);
        if (pct != null) dropped.push([r, pct]);
        else rest.push(r);
      }
      dropped.sort((a, b) => b[1] - a[1]);
      rest.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return showingFirst([...dropped.map(([r]) => r), ...rest]);
    }
    case "recency":
      return showingFirst([...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    case "price-low":
      return showingFirst([...rows].sort((a, b) => {
        const pa = a.film.latest_price, pb = b.film.latest_price;
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pa - pb;
      }));
    case "alphabetical":
      return showingFirst([...rows].sort((a, b) => a.film.title.localeCompare(b.film.title)));
  }
}
