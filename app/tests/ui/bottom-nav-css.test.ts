import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("../../app/styles/80-discovery-actions.css", import.meta.url),
  "utf8",
);
const client = readFileSync(new URL("../../components/BottomNavClient.tsx", import.meta.url), "utf8");
const loadingNav = readFileSync(new URL("../../components/skeletons/BottomNavSkeleton.tsx", import.meta.url), "utf8");

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

  it("acknowledges taps immediately and retains a native-navigation watchdog", () => {
    expect(client).toContain("setPending(tab.id)");
    expect(client).toContain("window.location.assign(tab.href)");
    expect(client).toContain("NAVIGATION_FALLBACK_MS = 1800");
    expect(css).toContain(".bottom-nav__item.is-pending");
  });

  it("keeps the bottom nav actionable while destination content is loading", () => {
    expect(loadingNav).toContain('href: "/home"');
    expect(loadingNav).toContain('href: "/films"');
    expect(loadingNav).toContain('href: "/coven"');
    expect(loadingNav).toContain('href: "/watchlist"');
    expect(loadingNav).toContain("<a key={tab.href}");
    expect(loadingNav).not.toContain("pointerEvents");
    expect(loadingNav).not.toContain('aria-hidden="true"');
  });
});
