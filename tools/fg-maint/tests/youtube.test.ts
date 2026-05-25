import { describe, expect, it } from "vitest";
import { canonicalYoutubeUrl, extractYoutubeId } from "../src/youtube.js";

describe("youtube helpers", () => {
  it("extracts ids from common YouTube URL shapes", () => {
    expect(extractYoutubeId("https://www.youtube.com/watch?v=abcdefghijk")).toBe("abcdefghijk");
    expect(extractYoutubeId("https://youtu.be/abcdefghijk")).toBe("abcdefghijk");
    expect(extractYoutubeId("https://www.youtube.com/embed/abcdefghijk")).toBe("abcdefghijk");
  });

  it("rejects non-video urls", () => {
    expect(extractYoutubeId("https://www.youtube.com/results?search_query=test")).toBeNull();
    expect(extractYoutubeId("https://example.com/watch?v=abcdefghijk")).toBeNull();
  });

  it("builds canonical watch urls", () => {
    expect(canonicalYoutubeUrl("abcdefghijk")).toBe("https://www.youtube.com/watch?v=abcdefghijk");
  });
});
