import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public profile relics", () => {
  const page = readFileSync("app/p/[username]/page.tsx", "utf8");
  const component = readFileSync("components/profile/ProfileRelics.tsx", "utf8");
  const css = readFileSync("app/styles/260-profile.css", "utf8");

  it("loads earned badges into the existing Relics section", () => {
    expect(page).toContain('import { getProfileBadges } from "@/lib/queries/badges"');
    expect(page).toContain('import ProfileRelics from "@/components/profile/ProfileRelics"');
    expect(page).toContain("getProfileBadges(supabase, bundle.profile.id)");
    expect(page).toContain("<ProfileRelics badges={profileBadges} />");
  });

  it("preserves the empty state and renders only public trophy details", () => {
    expect(component).toContain("No relics pried from the dark yet.");
    expect(component).toContain("When badges awaken, the trophies will gather here.");
    expect(component).toContain("<img");
    expect(component).toContain("badge.image_url");
    expect(component).toContain("badge.name");
    expect(component).toContain("badge.description");
    expect(component).toContain("badge.awarded_at");
    expect(component).not.toMatch(/evidence|progress|director/i);
  });

  it("keeps SVG and PNG artwork contained in a responsive relic grid", () => {
    expect(css).toContain(".profile-relic-grid");
    expect(css).toContain(".profile-relic-art img");
    expect(css).toContain("object-fit: contain");
    expect(css.match(/@media/g)).toHaveLength(1);
    expect(css).toContain("@media (max-width: 720px)");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });
});
