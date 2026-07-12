import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("film hero action buttons", () => {
  it("keeps Plan a watch on the shared button typography contract", () => {
    const source = readFileSync("components/gazing/PlanWatchButton.tsx", "utf8");
    expect(source).toContain('className="btn btn-outline btn-lg"');
  });
});
