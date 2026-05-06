import { describe, it, expect } from "vitest";
import { initialSelection, toggleFollower } from "@/app/onboarding/coven-step-logic";
import type { StarterProfile } from "@/app/onboarding/CovenStep";

function makeStarter(id: string): StarterProfile {
  return { id, username: id, display_name: null, avatar_url: null };
}

describe("initialSelection", () => {
  it("pre-selects all starters", () => {
    const starters = [makeStarter("a"), makeStarter("b"), makeStarter("c")];
    expect(initialSelection(starters)).toEqual(["a", "b", "c"]);
  });

  it("returns empty array when no starters", () => {
    expect(initialSelection([])).toEqual([]);
  });
});

describe("toggleFollower", () => {
  it("removes id when already selected (deselect)", () => {
    const result = toggleFollower(["a", "b", "c"], "b");
    expect(result).toEqual(["a", "c"]);
    expect(result).not.toContain("b");
  });

  it("adds id when not selected", () => {
    const result = toggleFollower(["a", "c"], "b");
    expect(result).toContain("b");
    expect(result).toHaveLength(3);
  });
});
