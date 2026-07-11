import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("../../app/styles/270-gazings.css", import.meta.url),
  "utf8",
);

const baseCtaRule = css.match(/\.social-promise__gazings\s*\{([^}]*)\}/)?.[1] ?? "";
const mobileBlock = css.match(/@media\s*\(max-width:\s*720px\)\s*\{([\s\S]*)\}\s*$/)?.[1] ?? "";
const mobileCtaRule = mobileBlock.match(/\.social-promise__gazings\s*\{([^}]*)\}/)?.[1] ?? "";

describe("Gazings access CTA CSS contract", () => {
  it("uses a 44px mobile target without making the desktop label oversized", () => {
    expect(baseCtaRule).not.toMatch(/min-height:\s*44px/);
    expect(mobileCtaRule).toMatch(/min-height:\s*44px/);
  });
});
