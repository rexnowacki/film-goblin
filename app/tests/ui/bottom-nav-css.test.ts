import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("../../app/styles/80-discovery-actions.css", import.meta.url),
  "utf8",
);

const baseBottomNavRule = css.match(/\.bottom-nav\s*\{([^}]*)\}/)?.[1] ?? "";
const mobileBottomNavRule =
  css.match(
    /@media\s*\(max-width:\s*720px\)\s*\{\s*\.bottom-nav\s*\{([^}]*)\}/,
  )?.[1] ?? "";

describe("mobile bottom nav CSS contract", () => {
  it("stays fixed to the safe-area-aware mobile viewport edge", () => {
    expect(baseBottomNavRule).toMatch(/position:\s*fixed/);
    expect(baseBottomNavRule).toMatch(/bottom:\s*0/);
    expect(baseBottomNavRule).toMatch(/safe-area-inset-bottom/);
    expect(mobileBottomNavRule).toMatch(/display:\s*flex/);
  });

  it("isolates only the mobile bar in a compositor layer for iOS fast scrolling", () => {
    expect(baseBottomNavRule).not.toMatch(/transform:/);
    expect(mobileBottomNavRule).toMatch(/transform:\s*translate3d\(0,\s*0,\s*0\)/);
    expect(mobileBottomNavRule).toMatch(/-webkit-backface-visibility:\s*hidden/);
    expect(mobileBottomNavRule).toMatch(
      /(^|[;\s])backface-visibility:\s*hidden/,
    );
  });
});
