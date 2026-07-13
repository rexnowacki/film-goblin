import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin badge forge", () => {
  const index = readFileSync("app/admin/page.tsx", "utf8");
  const page = readFileSync("app/admin/badges/page.tsx", "utf8");
  const manager = readFileSync("app/admin/badges/BadgeManager.tsx", "utf8");
  const actions = readFileSync("lib/actions/admin/badges.ts", "utf8");
  const route = readFileSync("app/api/admin/badges/image/route.ts", "utf8");
  const css = readFileSync("app/styles/310-admin.css", "utf8");

  it("links the control crypt to a typed badge-definition ledger", () => {
    expect(index).toContain('href="/admin/badges"');
    expect(index).toContain('title="Badge Forge"');
    expect(page).toContain("getAdminBadgeRows(supabase)");
    expect(page).toContain("<BadgeManager badges={badges} />");
    expect(manager).toContain("BADGE_CONDITIONS.map");
    expect(manager).toContain("adminCreateBadge");
    expect(manager).toContain("adminReevaluateBadges");
    expect(manager).toContain("Re-run award engine");
    expect(manager).not.toMatch(/conditionJson|conditionSql|dangerouslySetInnerHTML/);
  });

  it("accepts SVG and PNG while keeping service-role access behind an admin gate", () => {
    expect(manager).toContain('accept=".svg,.png,image/svg+xml,image/png"');
    expect(route).toContain("validateBadgeImage(file)");
    expect(route.indexOf("checkAdminAccess")).toBeLessThan(route.indexOf("serviceRoleClient().storage"));
    expect(actions.indexOf("requireAdminUser")).toBeLessThan(actions.indexOf("serviceRoleClient()"));
  });

  it("uses the established single 720px breakpoint and contained artwork", () => {
    expect(css.match(/@media/g)).toHaveLength(1);
    expect(css).toContain("@media (max-width:720px)");
    expect(css).toContain(".admin-badge-row > img");
    expect(css).toContain("object-fit:contain");
    expect(css).toContain(".admin-badge-layout { grid-template-columns:1fr; }");
  });
});
