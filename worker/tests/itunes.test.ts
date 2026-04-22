import { describe, it, expect, afterAll, afterEach, beforeAll } from "vitest";
import { http, HttpResponse } from "msw";
import { upscaleArtworkUrl, parseFilm } from "../src/itunes.js";
import { fetchPrices } from "../src/itunes.js";
import { makeLookupHandler, makeServer } from "./helpers/http.js";
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

describe("fetchPrices", () => {
  const server = makeServer(makeLookupHandler({}));
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("returns results on 200", async () => {
    const res = await fetchPrices([1468845007]);
    expect(res.resultCount).toBe(1);
    expect(res.results[0].trackId).toBe(1468845007);
  });

  it("sends comma-joined ids and country=US", async () => {
    let capturedUrl = "";
    server.use(
      http.get("https://itunes.apple.com/lookup", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ resultCount: 0, results: [] });
      })
    );
    await fetchPrices([111, 222, 333]);
    expect(capturedUrl).toContain("id=111%2C222%2C333");
    expect(capturedUrl).toContain("country=US");
    expect(capturedUrl).not.toContain("entity=movie");
  });

  it("retries on 429 with backoff and eventually succeeds", async () => {
    let calls = 0;
    server.use(
      http.get("https://itunes.apple.com/lookup", () => {
        calls++;
        if (calls < 3) return new HttpResponse(null, { status: 429 });
        return HttpResponse.json({ resultCount: 0, results: [] });
      })
    );
    const res = await fetchPrices([1], { backoffMs: 1 });
    expect(calls).toBe(3);
    expect(res.resultCount).toBe(0);
  });

  it("throws after 3 failed retries", async () => {
    server.use(
      http.get("https://itunes.apple.com/lookup", () => new HttpResponse(null, { status: 500 }))
    );
    await expect(fetchPrices([1], { backoffMs: 1 })).rejects.toThrow(/itunes.*500/i);
  });
});
