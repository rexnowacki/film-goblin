import { describe, expect, it } from "vitest";
import {
  BADGE_IMAGE_MAX_BYTES,
  validateBadgeImage,
  validateBadgeImageContent,
  validateBadgeImageMetadata,
} from "@/lib/badges/image";

const encoder = new TextEncoder();
const ONE_PIXEL_PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));

function file(name: string, type: string, bytes: Uint8Array) {
  return {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  };
}

describe("badge artwork validation", () => {
  it("accepts a restrained SVG and a PNG signature", async () => {
    const svg = encoder.encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><path fill="url(#g)" d="M0 0h10v10z"/></svg>');
    await expect(validateBadgeImage(file("relic.svg", "image/svg+xml", svg))).resolves.toMatchObject({
      ok: true,
      extension: "svg",
      contentType: "image/svg+xml",
    });
    expect(validateBadgeImageContent(ONE_PIXEL_PNG, "image/png")).toBeNull();
  });

  it.each([
    ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "blocked element"],
    ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>', "event handlers"],
    ['<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.example/x.svg#x"/></svg>', "same document"],
    ['<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://evil.example/x.svg)"/></svg>', "stay inside"],
    ['<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>', "entities"],
    ['<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.example/x.css)</style></svg>', "blocked element"],
    ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><s:script>alert(1)</s:script></svg>', "namespace prefixes"],
    ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="&#x75;rl(https://evil.example/x.svg)" d="M0 0h10v10z"/></svg>', "encoded active content"],
    ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path style="fill:u\\72l(https://evil.example/x.svg)" d="M0 0h10v10z"/></svg>', "encoded active content"],
  ])("rejects active SVG content: %s", (source, fragment) => {
    expect(validateBadgeImageContent(encoder.encode(source), "image/svg+xml")).toContain(fragment);
  });

  it("rejects mismatched extensions, empty files, oversize files, and false PNGs", () => {
    expect(validateBadgeImageMetadata({ name: "x.jpg", type: "image/jpeg", size: 1 })).toMatchObject({ ok: false });
    expect(validateBadgeImageMetadata({ name: "x.svg", type: "image/png", size: 1 })).toMatchObject({ ok: false });
    expect(validateBadgeImageMetadata({ name: "x.png", type: "image/png", size: 0 })).toMatchObject({ ok: false });
    expect(validateBadgeImageMetadata({ name: "x.png", type: "image/png", size: BADGE_IMAGE_MAX_BYTES + 1 })).toMatchObject({ ok: false });
    expect(validateBadgeImageContent(encoder.encode("not a png"), "image/png")).toContain("signature");
  });

  it("requires square artwork with bounded PNG dimensions", () => {
    expect(validateBadgeImageContent(
      encoder.encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"></svg>'),
      "image/svg+xml",
    )).toContain("square");
    const rectangular = new Uint8Array(ONE_PIXEL_PNG);
    rectangular[19] = 2;
    expect(validateBadgeImageContent(rectangular, "image/png")).toContain("square");
  });

});
