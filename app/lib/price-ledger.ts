export interface PriceChange {
  at: string;
  price: number;
  previousPrice: number | null;
  direction: "drop" | "rise" | "first";
  isSale: boolean;
}

export interface PriceLedgerCapture {
  price_usd: number | string;
  is_sale?: boolean | null;
  captured_at: string;
}

/**
 * Turns the oldest-to-newest price-history window into observed change
 * points. Invalid captures are invisible and, importantly, do not replace
 * the last valid price used by the following comparison.
 */
export function extractPriceChanges(history: PriceLedgerCapture[]): PriceChange[] {
  const changes: PriceChange[] = [];
  let previous: number | null = null;

  for (const capture of history) {
    const price = Number(capture.price_usd);
    if (!Number.isFinite(price)) continue;

    if (previous === null) {
      changes.push({
        at: capture.captured_at,
        price,
        previousPrice: null,
        direction: "first",
        isSale: capture.is_sale === true,
      });
    } else if (price !== previous) {
      changes.push({
        at: capture.captured_at,
        price,
        previousPrice: previous,
        direction: price < previous ? "drop" : "rise",
        isSale: capture.is_sale === true,
      });
    }
    previous = price;
  }

  return changes;
}
