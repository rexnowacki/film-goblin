import { describe, expect, it } from "vitest";
import { watchedDigestSummary } from "@/components/activity/activityDigestCopy";

describe("activity digest copy", () => {
  it("describes a day of watches in the Film Goblin voice", () => {
    expect(Object.values(watchedDigestSummary(43)).join("")).toBe(" devoured 43 films in a single day.");
  });

  it("keeps singular grammar honest", () => {
    expect(Object.values(watchedDigestSummary(1)).join("")).toBe(" devoured 1 film in a single day.");
  });
});
