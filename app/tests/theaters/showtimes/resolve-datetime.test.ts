import { describe, expect, it } from "vitest";
import { detectFormatLabel, resolveShowtimeDate } from "@/lib/theaters/showtimes/resolve-datetime";

const now = new Date("2026-06-03T12:00:00Z");

describe("resolveShowtimeDate", () => {
  it("resolves a near-future slot to an ISO timestamp in Phoenix time", () => {
    expect(resolveShowtimeDate("Fri 6/5 @ 8:30pm", now)).toBe("2026-06-06T03:30:00.000Z");
  });

  it("handles am times and noon", () => {
    expect(resolveShowtimeDate("Sat 6/6 @ 11:00am", now)).toBe("2026-06-06T18:00:00.000Z");
    expect(resolveShowtimeDate("Sat 6/6 @ 12:00pm", now)).toBe("2026-06-06T19:00:00.000Z");
  });

  it("rolls to next year when the month/day already passed this year", () => {
    expect(resolveShowtimeDate("Fri 1/1 @ 7:00pm", now)).toBe("2027-01-02T02:00:00.000Z");
  });

  it("returns null when no nearby year matches the given weekday", () => {
    expect(resolveShowtimeDate("Mon 6/5 @ 8:30pm", now)).toBeNull();
  });
});

describe("detectFormatLabel", () => {
  it("pulls a known format from title or screen", () => {
    expect(detectFormatLabel("Close Encounters in 70mm", "Screen 1")).toBe("70mm");
    expect(detectFormatLabel("Some Film", "Open Air Cinema")).toBe("Open Air Cinema");
    expect(detectFormatLabel("Plain Film", "Screen 4")).toBeNull();
  });
});
