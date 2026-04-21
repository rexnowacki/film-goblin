import { describe, it, expect } from "vitest";
import { upscaleArtworkUrl } from "../src/itunes.js";

describe("upscaleArtworkUrl", () => {
  it("swaps 100x100bb.jpg to 600x600bb.jpg", () => {
    const url = "https://is1-ssl.mzstatic.com/image/thumb/Video/abc/100x100bb.jpg";
    expect(upscaleArtworkUrl(url)).toBe("https://is1-ssl.mzstatic.com/image/thumb/Video/abc/600x600bb.jpg");
  });

  it("leaves unrecognized URLs unchanged", () => {
    const url = "https://example.com/poster.png";
    expect(upscaleArtworkUrl(url)).toBe(url);
  });

  it("handles empty string", () => {
    expect(upscaleArtworkUrl("")).toBe("");
  });
});
