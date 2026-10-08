import { describe, expect, it } from "vitest";
import { requestCreateOverrides } from "@/lib/scout/approval";

describe("requestCreateOverrides", () => {
  it("member requests are summoned and carry no release date", () => {
    expect(requestCreateOverrides({ source: "tmdb", scout_window: null, release_date: null }))
      .toEqual({ theatrical_release_date: null, summoned: true });
  });

  it("theatrical scout picks keep their release date, even after opening day", () => {
    // No clock involved: the stored window decides, so approval date is irrelevant.
    expect(requestCreateOverrides({ source: "scout", scout_window: "theatrical", release_date: "2026-10-23" }))
      .toEqual({ theatrical_release_date: "2026-10-23", summoned: false });
  });

  it("digital scout picks are not summoned and carry no release date", () => {
    expect(requestCreateOverrides({ source: "scout", scout_window: "digital", release_date: "2026-10-01" }))
      .toEqual({ theatrical_release_date: null, summoned: false });
  });
});
