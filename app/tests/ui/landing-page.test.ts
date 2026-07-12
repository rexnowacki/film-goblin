import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("landing page presentation", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const css = readFileSync("app/styles/220-landing.css", "utf8");

  it("keeps the live landing data and conversion paths", () => {
    expect(page).toContain("getLandingFeed()");
    expect(page).toContain("getRecentlySummoned()");
    expect(page).toContain("<LandingFeedCard rows={feedRows} />");
    expect(page).toContain('href="/auth/signup"');
    expect(page).toContain('href="/auth/signin"');
    expect(page).toContain('href="/films"');
  });

  it("uses the plum editorial hierarchy across hero, rites, catalog, and final call", () => {
    expect(page).toContain("landing-hero__grid");
    expect(page).toContain("landing-rites-band");
    expect(page).toContain("landing-summoned");
    expect(page).toContain("landing-final");
    expect(page).toContain('src="/add-film-oracle.png"');
    expect(page).toContain("A goblin peering over an enchanted palantir");
    expect(css).toContain("var(--pit-plum-bg)");
    expect(css).toContain(".landing-feed-card");
    expect(css).toContain(".landing-hero__oracle");
    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain("contain: paint");
  });

  it("collapses the hero and rites at the single zine breakpoint", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 720px)"));
    expect(mobile).toContain(".landing-hero__grid");
    expect(mobile).toContain("grid-template-columns: 1fr");
    expect(mobile).toContain(".landing-rites");
    expect(mobile).toContain(".landing-feed-card");
    expect(mobile).toContain("transform: none");
    expect(mobile).toContain(".landing-hero__oracle");
    expect(mobile).toContain("@media (max-width: 360px)");
  });
});
