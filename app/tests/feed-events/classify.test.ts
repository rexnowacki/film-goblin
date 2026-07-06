import { describe, it, expect } from "vitest";
import { classifyPriceChange, type PriceChangeFacts } from "@/lib/feed-events/classify";

const base: PriceChangeFacts = {
  prevPrice: 14.99, newPrice: 14.99, histMin: 4.99, histSpanDays: 400,
  median: 12.99, rowsAtOrAboveMedianLast7d: 3,
};

describe("classifyPriceChange", () => {
  it("drop of >= $3 → price_drop", () => {
    expect(classifyPriceChange({ ...base, newPrice: 11.99 })).toBe("price_drop");
  });

  it("drop of >= 20% (but < $3) → price_drop", () => {
    expect(classifyPriceChange({ ...base, prevPrice: 9.99, newPrice: 7.99 })).toBe("price_drop");
  });

  it("small drop (< 20% and < $3) → null", () => {
    expect(classifyPriceChange({ ...base, prevPrice: 14.99, newPrice: 13.99 })).toBe(null);
  });

  it("new price at or below historical min with >= 180d span → all_time_low (supersedes drop)", () => {
    expect(classifyPriceChange({ ...base, newPrice: 4.99 })).toBe("all_time_low");
    expect(classifyPriceChange({ ...base, newPrice: 3.99 })).toBe("all_time_low");
  });

  it("at historical min but span < 180d → plain price_drop", () => {
    expect(classifyPriceChange({ ...base, newPrice: 4.99, histSpanDays: 90 })).toBe("price_drop");
  });

  it("rise back to >= median after 7 clean days below → price_rise", () => {
    expect(classifyPriceChange({
      ...base, prevPrice: 7.99, newPrice: 14.99, rowsAtOrAboveMedianLast7d: 0,
    })).toBe("price_rise");
  });

  it("rise that never dipped 7 days below median → null", () => {
    expect(classifyPriceChange({
      ...base, prevPrice: 7.99, newPrice: 14.99, rowsAtOrAboveMedianLast7d: 2,
    })).toBe(null);
  });

  it("no change → null", () => {
    expect(classifyPriceChange(base)).toBe(null);
  });
});
