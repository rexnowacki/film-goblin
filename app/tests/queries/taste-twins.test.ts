import { describe, expect, it, vi } from "vitest";
import {
  buildBulkAffinityVectors,
  getActiveTasteTwinSuppressionIds,
} from "@/lib/queries/taste-twins";
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

  it("returns only active suppression ids for passive fallback reuse", async () => {
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => void) => resolve({
        data: [{ candidate_id: "suppressed-1" }, { candidate_id: "suppressed-2" }],
        error: null,
      }),
    };
    const client = { from: vi.fn().mockReturnValue(builder) } as any;
    const now = new Date("2026-07-12T12:00:00Z");

    const result = await getActiveTasteTwinSuppressionIds(client, "viewer", now);

    expect(result).toEqual(new Set(["suppressed-1", "suppressed-2"]));
    expect(client.from).toHaveBeenCalledWith("taste_twin_suppressions");
    expect(builder.eq).toHaveBeenCalledWith("viewer_id", "viewer");
    expect(builder.gt).toHaveBeenCalledWith("suppressed_until", now.toISOString());
  });
});
