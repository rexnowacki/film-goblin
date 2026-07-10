import { describe, expect, it } from "vitest";
import { getCovenSectionOrder } from "@/components/coven/social-promise-logic";

describe("getCovenSectionOrder", () => {
  it("puts pending human actions first", () => expect(getCovenSectionOrder({ pendingCount: 1, memberCount: 2 })[0]).toBe("pending"));
  it("puts benefits before directory for a non-empty coven", () => expect(getCovenSectionOrder({ pendingCount: 0, memberCount: 2 })).toEqual(["actions", "members", "discovery", "invite"]));
  it("offers discovery and a known-person invite without claiming a match", () => expect(getCovenSectionOrder({ pendingCount: 0, memberCount: 0 })).toEqual(["actions", "discovery", "invite"]));
});
