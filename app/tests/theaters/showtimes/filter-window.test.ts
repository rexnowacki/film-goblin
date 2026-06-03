import { describe, expect, it } from "vitest";
import { withinWindow } from "@/lib/theaters/showtimes/filter-window";

const now = new Date("2026-06-03T12:00:00Z");

describe("withinWindow", () => {
  it("keeps slots from now through just before now+7 days", () => {
    expect(withinWindow("2026-06-03T12:00:00.000Z", now)).toBe(true);
    expect(withinWindow("2026-06-03T13:00:00.000Z", now)).toBe(true);
    expect(withinWindow("2026-06-10T11:59:59.000Z", now)).toBe(true);
    expect(withinWindow("2026-06-10T12:00:00.000Z", now)).toBe(false);
    expect(withinWindow("2026-06-03T11:59:59.000Z", now)).toBe(false);
  });
});
