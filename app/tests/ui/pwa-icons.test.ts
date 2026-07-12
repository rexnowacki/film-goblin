import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function readIcon(path: string) {
  const bytes = readFileSync(resolve(root, path));
  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe("PWA icon assets", () => {
  it("uses the supplied goblin artwork at every install-icon size", () => {
    const source = readIcon("public/icons/icon-source.png");
    const apple = readIcon("public/icons/apple-touch-icon.png");
    const small = readIcon("public/icons/icon-192.png");
    const large = readIcon("public/icons/icon-512.png");

    expect(source.sha256).toBe("9dbe4e623d0aa02099f180fdec9b87a740a4f8a427fab64b5dc068f23b9dba4e");
    expect([source.width, source.height]).toEqual([1254, 1254]);
    expect([apple.width, apple.height]).toEqual([180, 180]);
    expect([small.width, small.height]).toEqual([192, 192]);
    expect([large.width, large.height]).toEqual([512, 512]);
  });

  it("keeps iOS and the web manifest wired to the generated icons", () => {
    const layout = readFileSync(resolve(root, "app/layout.tsx"), "utf8");
    const manifest = readFileSync(resolve(root, "app/manifest.ts"), "utf8");

    expect(layout).toContain('apple: "/icons/apple-touch-icon.png"');
    expect(manifest).toContain('src: "/icons/icon-192.png"');
    expect(manifest).toContain('src: "/icons/icon-512.png"');
  });
});
