import { describe, expect, it } from "vitest";
import { parseDateLabel } from "@/lib/theaters/date-label";

const now = new Date("2026-05-05T12:00:00Z");

describe("parseDateLabel", () => {
  it("parses Loft start and single-day labels", () => {
    expect(parseDateLabel("Starts May 8", now)).toMatchObject({ startsOn: "2026-05-08", datePrecision: "date" });
    expect(parseDateLabel("Wednesday, May 6", now)).toMatchObject({ startsOn: "2026-05-06", datePrecision: "date" });
    expect(parseDateLabel("Saturday, Jun 20", now)).toMatchObject({ startsOn: "2026-06-20", datePrecision: "date" });
  });

  it("keeps Now Playing and complex Guild ranges label-only", () => {
    expect(parseDateLabel("Now Playing", now)).toMatchObject({ startsOn: null, datePrecision: "label" });
    expect(parseDateLabel("May 6 & 7 plus 29", now)).toMatchObject({ startsOn: null, datePrecision: "label" });
    expect(parseDateLabel("May 9 thru 11", now)).toMatchObject({ startsOn: null, datePrecision: "label" });
  });
});
