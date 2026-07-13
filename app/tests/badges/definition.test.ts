import { describe, expect, it } from "vitest";
import {
  BADGE_CONDITIONS,
  describeBadgeCondition,
  slugifyBadgeName,
  validateBadgeDefinition,
} from "@/lib/badges/definition";

const storageOrigin = "https://example.supabase.co";

const valid = {
  name: "Night Fiend",
  slug: "night-fiend",
  description: "Logged enough films to wake the dead.",
  imageUrl: `${storageOrigin}/storage/v1/object/public/badge-images/abc/icon.svg`,
  conditionKind: "watch_log_count" as const,
  threshold: 25,
};

describe("badge definition registry", () => {
  it("exposes typed, human-readable supported conditions", () => {
    expect(BADGE_CONDITIONS.map(option => option.value)).toEqual([
      "watch_log_count",
      "distinct_film_count",
      "director_distinct_film_count",
    ]);
    expect(describeBadgeCondition("watch_log_count", 25)).toBe(
      "At least 25 watch logs (rewatches count)",
    );
    expect(describeBadgeCondition("distinct_film_count", 1)).toBe(
      "At least 1 distinct film logged",
    );
    expect(describeBadgeCondition("director_distinct_film_count", 3)).toBe(
      "At least 3 distinct films from one director",
    );
  });

  it("generates stable lower-kebab slugs", () => {
    expect(slugifyBadgeName("Auteur’s Familiar")).toBe("auteurs-familiar");
    expect(slugifyBadgeName("  100% Midnight!!!  ")).toBe("100-midnight");
  });

  it("accepts a complete definition with a badge-bucket image", () => {
    expect(validateBadgeDefinition(valid, storageOrigin)).toBeNull();
  });

  it.each([
    [{ ...valid, name: "" }, "Name is required."],
    [{ ...valid, name: "x".repeat(81) }, "Name must be 80 characters or fewer."],
    [{ ...valid, slug: "Night Fiend" }, "Slug must use lower-case letters, numbers, and single hyphens."],
    [{ ...valid, slug: "x".repeat(65) }, "Slug must be 64 characters or fewer."],
    [{ ...valid, description: "" }, "Description is required."],
    [{ ...valid, description: "x".repeat(281) }, "Description must be 280 characters or fewer."],
    [{ ...valid, threshold: 0 }, "Threshold must be a whole number between 1 and 10,000."],
    [{ ...valid, threshold: 2.5 }, "Threshold must be a whole number between 1 and 10,000."],
    [{ ...valid, threshold: 10_001 }, "Threshold must be a whole number between 1 and 10,000."],
  ])("rejects invalid authored fields", (input, error) => {
    expect(validateBadgeDefinition(input as typeof valid, storageOrigin)).toBe(error);
  });

  it("rejects unsupported condition kinds", () => {
    expect(validateBadgeDefinition(
      { ...valid, conditionKind: "raw_sql" as never },
      storageOrigin,
    )).toBe("Choose a supported badge condition.");
  });

  it.each([
    "https://evil.example/storage/v1/object/public/badge-images/icon.svg",
    `${storageOrigin}/storage/v1/object/public/avatars/icon.svg`,
    `${storageOrigin}/storage/v1/object/public/badge-images/`,
    `${storageOrigin}/storage/v1/object/public/badge-images/icon.svg?token=1`,
    "/badges/local.svg",
  ])("rejects image URLs outside the configured badge bucket: %s", imageUrl => {
    expect(validateBadgeDefinition({ ...valid, imageUrl }, storageOrigin)).toBe(
      "Upload artwork to the badge image bucket.",
    );
  });

  it("fails clearly when badge storage is not configured", () => {
    expect(validateBadgeDefinition(valid, "")).toBe("Badge image storage is not configured.");
  });
});
