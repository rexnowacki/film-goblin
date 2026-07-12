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

  it("uses a horizontally scrollable pill row at the zine breakpoint", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 720px)"));
    expect(css).toContain(".settings-pill-nav button[aria-selected=\"true\"]");
    expect(css).toContain("border-radius: 999px");
    expect(css).toContain("overflow-x: auto");
    expect(mobile).toContain(".settings-pill-nav");
    expect(mobile).toContain("margin: 0 -20px 25px");
  });
});
