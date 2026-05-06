import { describe, it, expect } from "vitest";
import { getSelectedTagIds, FLAVOR_CARDS } from "@/app/onboarding/taste-step-logic";

const TAG_MAP: Record<string, string> = {
  "folk horror":      "uuid-folk",
  "giallo":           "uuid-giallo",
  "witchcraft":       "uuid-witch",
  "body horror":      "uuid-body",
  "cosmic horror":    "uuid-cosmic",
  "religious horror": "uuid-religious",
  "arthouse":         "uuid-arthouse",
  "midnight movie":   "uuid-midnight",
};

describe("FLAVOR_CARDS", () => {
  it("has exactly 8 entries", () => {
    expect(FLAVOR_CARDS).toHaveLength(8);
  });

  it("every card label is unique", () => {
    const labels = FLAVOR_CARDS.map(c => c.label);
    expect(new Set(labels).size).toBe(8);
  });

  it("every card tagName resolves in TAG_MAP", () => {
    for (const card of FLAVOR_CARDS) {
      expect(TAG_MAP[card.tagName]).toBeDefined();
    }
  });
});

describe("getSelectedTagIds", () => {
  it("returns UUIDs for selected card labels", () => {
    const ids = getSelectedTagIds(["Folk Rot", "Velvet Murder"], TAG_MAP);
    expect(ids).toContain("uuid-folk");
    expect(ids).toContain("uuid-giallo");
    expect(ids).toHaveLength(2);
  });

  it("returns empty array for empty selection", () => {
    expect(getSelectedTagIds([], TAG_MAP)).toEqual([]);
  });

  it("ignores cards whose tagName is missing from the map (tag not seeded)", () => {
    const ids = getSelectedTagIds(["Folk Rot"], { "folk horror": "uuid-folk" });
    expect(ids).toEqual(["uuid-folk"]);
  });
});
