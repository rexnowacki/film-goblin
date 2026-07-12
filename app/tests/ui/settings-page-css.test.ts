import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("settings page responsive CSS", () => {
  const css = readFileSync("app/styles/190-settings.css", "utf8");

  it("shares the profile page's hero texture and card hierarchy", () => {
    expect(css).toContain(".settings-hero::after");
    expect(css).toContain(".settings-avatar-ring");
    expect(css).toContain(".settings-group__header");
    expect(css).toContain(".settings-section__content");
  });

  it("replaces the desktop rail with a mobile chapter bar at the zine breakpoint", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 720px)"));
    expect(mobile).toContain(".settings-section-rail");
    expect(mobile).toContain("display: none");
    expect(mobile).toContain(".settings-mobile-nav");
    expect(mobile).toContain("display: flex");
    expect(mobile).toContain("overflow-x: auto");
  });
});
