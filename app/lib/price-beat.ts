// One context line for the film-page price sticker, derived from the
// 180-day price_history window (oldest→newest, as getLatestPriceHistory returns it).
export type PriceBeat =
  | { kind: "lowest" }
  | { kind: "drop"; from: number }
  | { kind: "plain" };

export function pickPriceBeat(
  price: number,
  history: { price_usd: number | string }[]
): PriceBeat {
  const prices = history
    .map(h => Number(h.price_usd))
    .filter(n => Number.isFinite(n));

  if (prices.length > 0 && price <= Math.min(...prices)) {
    return { kind: "lowest" };
  }

  for (let i = prices.length - 1; i >= 0; i--) {
    if (prices[i] !== price) {
      return prices[i] > price ? { kind: "drop", from: prices[i] } : { kind: "plain" };
    }
  }
  return { kind: "plain" };
}
