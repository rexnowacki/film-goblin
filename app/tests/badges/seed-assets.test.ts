import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateBadgeImageContent } from "@/lib/badges/image";

const SEEDED_BADGES = [
  "fresh-blood",
  "deep-cut",
  "midnight-glutton",
  "century-beast",
  "auteurs-familiar",
] as const;

describe("seed badge artwork", () => {
  it.each(SEEDED_BADGES)("ships %s as a safe square SVG", (slug) => {
    const bytes = readFileSync(`public/badges/${slug}.svg`);
    const source = bytes.toString("utf8");
    expect(source).toContain('viewBox="0 0 256 256"');
    expect(validateBadgeImageContent(bytes, "image/svg+xml")).toBeNull();
  });
});
