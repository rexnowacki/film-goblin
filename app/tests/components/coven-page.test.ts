import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Coven discovery orchestration", () => {
  const page = readFileSync("app/coven/page.tsx", "utf8");
  const tasteTwinStrip = readFileSync("components/coven/TasteTwinStrip.tsx", "utf8");

  it("skips the compatibility pipeline during intentional search", () => {
    expect(page).toMatch(
      /hasSearchQuery\s*\? Promise\.resolve\(\[\]\)\s*:\s*getTasteTwinSuggestions/,
    );
  });

  it("filters passive fallback by pending relationships and active suppressions before sampling", () => {
    expect(page).toContain("getActiveTasteTwinSuppressionIds(supabase, user.id)");
    expect(page).toContain("suppressedCandidateIds === null");
    expect(page).toContain("[...relationshipMap.keys(), ...suppressedCandidateIds]");
    expect(page).toContain("pickDailyCovenSuggestions(eligibleFallbackProfiles");
  });

  it("caps compatibility cards and uses the broad pool only for fallback", () => {
    expect(page).toContain("getTasteTwinSuggestions(supabase, user.id, COVEN_SUGGESTION_LIMIT)");
    expect(page).toContain('limit: discoveryMode === "fallback" ? COVEN_FALLBACK_POOL_LIMIT : undefined');
    expect(page).toContain('discoveryMode === "compatibility"');
  });

  it("uses the honest cold-start label when no suggestion has taste evidence", () => {
    expect(tasteTwinStrip).toContain('suggestion.source === "taste"');
    expect(tasteTwinStrip).toContain("People your coven knows.");
    expect(tasteTwinStrip).toContain("People whose film trail crosses yours.");
  });
});
