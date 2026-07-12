import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

describe("From the Pit seal", () => {
  it("uses the supplied well goblin artwork for the shared feed avatar", () => {
    const source = readFileSync(resolve(root, "public/pit-seal-source.jpg"));
    const seal = readFileSync(resolve(root, "public/pit-seal.png"));
    const component = readFileSync(resolve(root, "components/activity/systemEventParts.tsx"), "utf8");

    expect(createHash("sha256").update(source).digest("hex"))
      .toBe("cc0a1060127d305e305f71acb5d9711eedee746e84032d3db3748e3990881add");
    expect([seal.readUInt32BE(16), seal.readUInt32BE(20)]).toEqual([160, 160]);
    expect(component).toContain('src="/pit-seal.png"');
    expect(component).toContain("objectFit: \"contain\"");
  });
});
