import { describe, it, expect } from "vitest";
import { summarizeSavings } from "../../lib/queries/library";

describe("summarizeSavings", () => {
  it("sums paid and peak-minus-paid savings", () => {
    const out = summarizeSavings([
      { paid: 4.99, peak: 19.99 },
      { paid: 7.99, peak: 14.99 },
    ]);
    expect(out.claimedCount).toBe(2);
    expect(out.totalPaid).toBeCloseTo(12.98);
    expect(out.totalSaved).toBeCloseTo(15.0 + 7.0);
  });

  it("floors per-film savings at zero (paid above peak)", () => {
    const out = summarizeSavings([{ paid: 19.99, peak: 9.99 }]);
    expect(out.totalSaved).toBe(0);
  });

  it("counts films with no price history as claimed, $0 saved", () => {
    const out = summarizeSavings([{ paid: 4.99, peak: null }]);
    expect(out.claimedCount).toBe(1);
    expect(out.totalPaid).toBeCloseTo(4.99);
    expect(out.totalSaved).toBe(0);
  });

  it("returns zeros for empty input", () => {
    expect(summarizeSavings([])).toEqual({ claimedCount: 0, totalPaid: 0, totalSaved: 0 });
  });
});
