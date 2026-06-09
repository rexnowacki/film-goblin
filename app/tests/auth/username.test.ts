import { describe, it, expect } from "vitest";
import { isValidUsername } from "../../lib/auth/username";

describe("isValidUsername", () => {
  it("accepts normal handles", () => {
    for (const ok of ["moss.whorre", "jarbo", "a", "_moss_", "x.y.z", "goblin99", "a".repeat(24)]) {
      expect(isValidUsername(ok), ok).toBe(true);
    }
  });

  it("rejects path-weird, alphanumeric-free, oversized, and bad-charset handles", () => {
    for (const bad of [".", "..", "a.", ".a", "___", "._.", "", "a".repeat(25), "Has Caps", "sp ace", "hello!"]) {
      expect(isValidUsername(bad), bad).toBe(false);
    }
  });
});
