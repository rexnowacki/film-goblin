import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("expanded activity digests", () => {
  it("does not cap or clip long expanded lists", () => {
    const css = readFileSync("app/styles/90-activity-feed.css", "utf8");
    const openRule = css.match(/\.activity-group-expanded-items\[data-open="true"\]\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(openRule).toContain("max-height: none");
    expect(openRule).toContain("overflow: visible");
  });
});
