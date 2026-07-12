import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("For You responsive CSS", () => {
  const css = readFileSync("app/styles/280-for-you.css", "utf8");

  it("establishes a textured masthead, dominant omen, and editorial shelves", () => {
    expect(css).toContain(".fyp-masthead::after");
    expect(css).toContain(".daily-omen__mark");
    expect(css).toContain(".fyp-divider");
    expect(css).toContain(".fyp-shelf__header");
    expect(css).toContain(".fyp-shelf__controls");
  });

  it("keeps the omen and shelves responsive at the single zine breakpoint", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 720px)"));
    expect(mobile).toContain("grid-template-columns: 128px minmax(0, 1fr)");
    expect(mobile).toContain(".daily-omen__copy");
    expect(mobile).toContain("display: contents");
    expect(mobile).toContain(".fyp-shelf__rail");
    expect(mobile).toContain("margin-inline: -20px");
  });
});
