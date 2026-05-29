import { describe, it, expect } from "vitest";
import { buildShareUrl, buildShareMessage } from "@/components/ShareFilmButton";

describe("buildShareUrl", () => {
  it("returns plain film URL when no sharer username", () => {
    expect(buildShareUrl("abc123", null)).toBe("https://freshfromthepit.com/film/abc123");
  });

  it("appends ?from= when sharer username is present", () => {
    expect(buildShareUrl("abc123", "teethtony")).toBe("https://freshfromthepit.com/film/abc123?from=teethtony");
  });

  it("URL-encodes the sharer username", () => {
    expect(buildShareUrl("abc123", "weird.name")).toBe("https://freshfromthepit.com/film/abc123?from=weird.name");
  });
});

describe("buildShareMessage", () => {
  it("formats title, year, and URL", () => {
    expect(buildShareMessage("Suspiria", 2018, "https://example.com/x")).toBe("the goblin's calling: Suspiria (2018). https://example.com/x");
  });
});
