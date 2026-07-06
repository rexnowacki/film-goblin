// Pure price-event decisions (spec triggers, section "Generators").
// No DB, no clock: the caller assembles PriceChangeFacts from SQL.

export interface PriceChangeFacts {
  prevPrice: number;
  newPrice: number;
  histMin: number;
  histSpanDays: number;
  median: number;
  rowsAtOrAboveMedianLast7d: number;
}

export type PriceEventKind = "price_drop" | "all_time_low" | "price_rise";

const DROP_ABS_USD = 3;
const DROP_PCT = 0.2;
const ATL_MIN_SPAN_DAYS = 180;

export function classifyPriceChange(f: PriceChangeFacts): PriceEventKind | null {
  if (f.newPrice < f.prevPrice) {
    const dropped = f.prevPrice - f.newPrice;
    const isDrop = dropped >= DROP_ABS_USD || dropped >= f.prevPrice * DROP_PCT;
    const isAtl = f.histSpanDays >= ATL_MIN_SPAN_DAYS && f.newPrice <= f.histMin;
    if (isAtl && f.newPrice < f.prevPrice) return "all_time_low";
    return isDrop ? "price_drop" : null;
  }
  if (f.newPrice > f.prevPrice) {
    const returnedToMedian = f.newPrice >= f.median;
    const sevenCleanDaysBelow = f.rowsAtOrAboveMedianLast7d === 0;
    return returnedToMedian && sevenCleanDaysBelow ? "price_rise" : null;
  }
  return null;
}
