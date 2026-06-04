import { describe, expect, it } from "vitest";
import { formatSummonMeta, normalizeTheaterName } from "@/lib/gazing/summon-meta";

describe("normalizeTheaterName", () => {
  it("shortens The Loft Cinema", () => {
    expect(normalizeTheaterName("The Loft Cinema")).toBe("The Loft");
  });
  it("passes other names through", () => {
    expect(normalizeTheaterName("Harkins Tucson")).toBe("Harkins Tucson");
  });
});

describe("formatSummonMeta", () => {
  // 2026-06-05T20:30:00-07:00 is Fri Jun 5, 8:30 PM in America/Phoenix.
  const iso = "2026-06-05T20:30:00-07:00";

  it("joins theater, day/time, and format with middots", () => {
    expect(formatSummonMeta("The Loft Cinema", iso, "70mm")).toBe("The Loft · Fri 8:30 PM · 70mm");
  });
  it("omits the format segment when null", () => {
    expect(formatSummonMeta("The Loft Cinema", iso, null)).toBe("The Loft · Fri 8:30 PM");
  });
});
