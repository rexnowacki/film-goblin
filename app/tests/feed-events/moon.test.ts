import { describe, it, expect } from "vitest";
import { isFullMoonUTCDate } from "@/lib/feed-events/moon";

const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe("isFullMoonUTCDate", () => {
  it("recognizes well-documented full moons", () => {
    // 2018-01-31: "super blue blood moon", full at 13:27 UTC
    expect(isFullMoonUTCDate(d("2018-01-31"))).toBe(true);
    // 2015-09-28: supermoon lunar eclipse, full at 02:50 UTC
    expect(isFullMoonUTCDate(d("2015-09-28"))).toBe(true);
    // 1999-12-22: solstice full moon, full at 17:31 UTC
    expect(isFullMoonUTCDate(d("1999-12-22"))).toBe(true);
  });

  it("rejects days far from full", () => {
    expect(isFullMoonUTCDate(d("2018-01-17"))).toBe(false); // new moon
    expect(isFullMoonUTCDate(d("2018-02-07"))).toBe(false); // last quarter
    expect(isFullMoonUTCDate(d("2015-09-13"))).toBe(false); // new moon
  });

  it("fires on 1-2 days per synodic month, never 0, never 3+", () => {
    // scan one year; group consecutive true days into full-moon windows
    let windows = 0, run = 0, maxRun = 0;
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 86_400_000) {
      if (isFullMoonUTCDate(new Date(t))) {
        run += 1;
        maxRun = Math.max(maxRun, run);
      } else {
        if (run > 0) windows += 1;
        run = 0;
      }
    }
    if (run > 0) windows += 1;
    expect(windows).toBeGreaterThanOrEqual(12);
    expect(windows).toBeLessThanOrEqual(13);
    expect(maxRun).toBeLessThanOrEqual(2);
  });
});
