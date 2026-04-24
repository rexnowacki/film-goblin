import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { extractAdamIdFromHtml } from "@/lib/apple-tv/resolve-adam-id";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const validHtml = readFileSync(join(fixturesDir, "apple-tv-page-valid.html"), "utf8");
const streamingOnlyHtml = readFileSync(join(fixturesDir, "apple-tv-page-streaming-only.html"), "utf8");

describe("extractAdamIdFromHtml", () => {
  it("returns the adamId as a number from a valid Apple TV page", () => {
    expect(extractAdamIdFromHtml(validHtml)).toBe(1468845007);
  });

  it("returns null when the page has no adamId (streaming-only page)", () => {
    expect(extractAdamIdFromHtml(streamingOnlyHtml)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(extractAdamIdFromHtml("")).toBeNull();
  });

  it("returns null when the regex does not match (non-digit payload)", () => {
    expect(extractAdamIdFromHtml('{"adamId":"not-a-number"}')).toBeNull();
  });
});
