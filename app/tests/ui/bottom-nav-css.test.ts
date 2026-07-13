import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("../../app/styles/80-discovery-actions.css", import.meta.url),
  "utf8",
);
const authenticatedNav = readFileSync(new URL("../../components/BottomNav.tsx", import.meta.url), "utf8");
const loadingNav = readFileSync(new URL("../../components/skeletons/BottomNavSkeleton.tsx", import.meta.url), "utf8");

const baseBottomNavRule = css.match(/\.bottom-nav\s*\{([^}]*)\}/)?.[1] ?? "";
const mobileBottomNavRule =
  css.match(
    /@media\s*\(max-width:\s*720px\)\s*\{\s*\.bottom-nav\s*\{([^}]*)\}/,
  )?.[1] ?? "";

describe("mobile bottom nav contract", () => {
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

  it("uses native anchors for authenticated navigation", () => {
    expect(authenticatedNav).toContain('href: "/home"');
    expect(authenticatedNav).toContain('href: "/films"');
    expect(authenticatedNav).toContain('href: "/coven"');
    expect(authenticatedNav).toContain('href: "/watchlist"');
    expect(authenticatedNav).toMatch(/<a\s+key=\{tab\.id\}/);
    expect(authenticatedNav).toContain("href={tab.href}");
    expect(authenticatedNav).not.toContain("BottomNavClient");
    expect(authenticatedNav).not.toContain('"use client"');
    expect(authenticatedNav).not.toContain('from "next/link"');
    expect(authenticatedNav).not.toContain('from "next/navigation"');
    expect(authenticatedNav).not.toContain("onClick");
    expect(authenticatedNav).not.toContain("window.location.assign");
    expect(css).not.toContain(".bottom-nav__item.is-pending");
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
