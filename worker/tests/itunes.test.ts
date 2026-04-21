import { describe, it, expect } from "vitest";
import { upscaleArtworkUrl, parseFilm } from "../src/itunes.js";
import {
  midsommarResult,
  invalidPriceResult,
  nullPriceResult,
  wrongKindResult,
  missingArtworkResult,
} from "./fixtures/itunes-responses.js";

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

describe("parseFilm", () => {
  it("parses a valid feature-movie result", () => {
    const result = parseFilm(midsommarResult);
    expect(result).not.toBeNull();
    expect(result!.itunes_id).toBe(1468845007);
    expect(result!.title).toBe("Midsommar");
    expect(result!.director).toBe("Ari Aster");
    expect(result!.year).toBe(2019);
    expect(result!.runtime_min).toBe(147);
    expect(result!.price_usd).toBe(4.99);
    expect(result!.hd_price_usd).toBe(4.99);
    expect(result!.artwork_url).toContain("600x600bb.jpg");
  });

  it("returns null for price = 0 (invalid read)", () => {
    expect(parseFilm(invalidPriceResult)).toBeNull();
  });

  it("returns null for price = null (invalid read)", () => {
    expect(parseFilm(nullPriceResult)).toBeNull();
  });

  it("returns null for price < $0.50 (invalid read)", () => {
    expect(parseFilm({ ...midsommarResult, trackPrice: 0.25 })).toBeNull();
  });

  it("returns null when kind is not feature-movie", () => {
    expect(parseFilm(wrongKindResult)).toBeNull();
  });

  it("uses shortDescription when longDescription is absent", () => {
    const result = parseFilm({ ...midsommarResult, longDescription: undefined });
    expect(result!.description).toBe("A couple travels to Sweden.");
  });

  it("handles missing artwork gracefully", () => {
    const result = parseFilm(missingArtworkResult);
    expect(result!.artwork_url).toBe("");
  });

  it("handles missing hd price", () => {
    const result = parseFilm({ ...midsommarResult, trackHdPrice: undefined });
    expect(result!.hd_price_usd).toBeNull();
  });
});
