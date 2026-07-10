import { describe, expect, it } from "vitest";
import { extractPriceChanges } from "@/lib/price-ledger";

describe("extractPriceChanges", () => {
  it("emits only the first capture for a single or flat price series", () => {
    expect(extractPriceChanges([
      { price_usd: 14.99, captured_at: "2026-04-01T00:00:00Z" },
      { price_usd: 14.99, captured_at: "2026-04-02T00:00:00Z" },
    ])).toEqual([{
      at: "2026-04-01T00:00:00Z", price: 14.99, previousPrice: null, direction: "first", isSale: false,
    }]);
  });

  it("tracks chronological drop and rise chains with accurate previous prices", () => {
    expect(extractPriceChanges([
      { price_usd: 19.99, captured_at: "2026-04-01T00:00:00Z" },
      { price_usd: 4.99, captured_at: "2026-04-02T00:00:00Z", is_sale: true },
      { price_usd: 14.99, captured_at: "2026-04-03T00:00:00Z" },
    ])).toEqual([
      { at: "2026-04-01T00:00:00Z", price: 19.99, previousPrice: null, direction: "first", isSale: false },
      { at: "2026-04-02T00:00:00Z", price: 4.99, previousPrice: 19.99, direction: "drop", isSale: true },
      { at: "2026-04-03T00:00:00Z", price: 14.99, previousPrice: 4.99, direction: "rise", isSale: false },
    ]);
  });

  it("coerces NUMERIC strings and skips malformed rows without corrupting the previous valid price", () => {
    expect(extractPriceChanges([
      { price_usd: "12.99", captured_at: "2026-04-01T00:00:00Z" },
      { price_usd: "not-a-price", captured_at: "2026-04-02T00:00:00Z" },
      { price_usd: "8.99", captured_at: "2026-04-03T00:00:00Z" },
      { price_usd: Infinity, captured_at: "2026-04-04T00:00:00Z" },
    ])).toEqual([
      { at: "2026-04-01T00:00:00Z", price: 12.99, previousPrice: null, direction: "first", isSale: false },
      { at: "2026-04-03T00:00:00Z", price: 8.99, previousPrice: 12.99, direction: "drop", isSale: false },
    ]);
  });
});
