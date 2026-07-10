import { describe, expect, it } from "vitest";
import { buildBulkAffinityVectors } from "@/lib/queries/taste-twins";
describe("buildBulkAffinityVectors", () => {
  it("applies the existing signal weights and facet multiplier once in bulk", () => {
    const result = buildBulkAffinityVectors([
      { user_id: "u", film_id: "f1", weight: 3 }, { user_id: "u", film_id: "f2", weight: 1.5 },
    ], [
      { film_id: "f1", name: "folk", facet: "subgenre", isPrimary: true },
      { film_id: "f2", name: "folk", facet: "subgenre", isPrimary: true },
      { film_id: "f1", name: "bleak", facet: "tone", isPrimary: false },
    ]);
    expect(result.get("u")).toEqual({ vector: { byTag: { folk: 13.5, bleak: 4.5 } }, evidenceFilmCount: 2 });
  });
  it("floors dislikes after aggregation and caps runaway tags", () => {
    const result = buildBulkAffinityVectors([{ user_id: "u", film_id: "f", weight: -4 }], [{ film_id: "f", name: "folk", facet: "subgenre", isPrimary: true }]);
    expect(result.get("u")?.vector.byTag.folk).toBe(0);
  });
});
