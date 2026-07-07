import { describe, it, expect } from "vitest";
import { pickPriceBeat } from "../lib/price-beat";

const rows = (...prices: (number | string)[]) => prices.map(p => ({ price_usd: p }));

describe("pickPriceBeat", () => {
  it("returns lowest when current price is the window minimum", () => {
    expect(pickPriceBeat(9.99, rows(14.99, 12.99, 9.99))).toEqual({ kind: "lowest" });
  });

  it("counts ties as lowest", () => {
    expect(pickPriceBeat(9.99, rows(9.99, 14.99, 9.99))).toEqual({ kind: "lowest" });
  });

  it("returns lowest for single-row history", () => {
    expect(pickPriceBeat(12.99, rows(12.99))).toEqual({ kind: "lowest" });
  });

  it("returns drop with the prior price when the last change was a drop but not the low", () => {
    // window low is 7.99, current 9.99 came down from 14.99
    expect(pickPriceBeat(9.99, rows(7.99, 14.99, 9.99))).toEqual({ kind: "drop", from: 14.99 });
  });

  it("skips trailing rows equal to the current price when finding the prior price", () => {
    expect(pickPriceBeat(9.99, rows(7.99, 14.99, 9.99, 9.99, 9.99))).toEqual({ kind: "drop", from: 14.99 });
  });

  it("returns plain when the last change was a rise", () => {
    expect(pickPriceBeat(14.99, rows(7.99, 9.99, 14.99))).toEqual({ kind: "plain" });
  });

  it("returns plain for empty history", () => {
    expect(pickPriceBeat(9.99, rows())).toEqual({ kind: "plain" });
  });

  it("coerces string price_usd values (PostgREST NUMERIC)", () => {
    expect(pickPriceBeat(9.99, rows("14.99", "9.99"))).toEqual({ kind: "lowest" });
    expect(pickPriceBeat(9.99, rows("7.99", "14.99", "9.99"))).toEqual({ kind: "drop", from: 14.99 });
  });
});
