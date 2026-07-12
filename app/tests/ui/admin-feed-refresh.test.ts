import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("admin and home feed presentation", () => {
  it("gives the admin film workflow a shared editorial shell", () => {
    const layout = read("app/admin/layout.tsx");
    const index = read("app/admin/page.tsx");
    const films = read("app/admin/films/page.tsx");
    const css = read("app/styles/310-admin.css");

    expect(layout).toContain('className="admin-shell"');
    expect(index).toContain("The control crypt.");
    expect(films).toContain("Film Vault");
    expect(films).toContain("listFilmsForAdmin");
    expect(films).toContain('href="/admin/films/new"');
    expect(css).toContain(".admin-film-ledger");
    expect(css).toContain("@media (max-width:720px)");
  });

  it("keeps film create, bulk, and edit routes inside the new form treatment", () => {
    for (const path of [
      "app/admin/films/new/page.tsx",
      "app/admin/films/bulk/page.tsx",
      "app/admin/films/[id]/edit/page.tsx",
    ]) {
      expect(read(path)).toContain("admin-form-page");
      expect(read(path)).toContain("admin-form-surface");
    }
  });

  it("adds accessible feed navigation while preserving composition plumbing", () => {
    const page = read("app/home/page.tsx");
    const tabs = read("components/FeedTabs.tsx");
    const css = read("app/styles/320-home-feed.css");

    expect(page).toContain("home-feed-masthead");
    expect(page).toContain("getEnrichedActivity");
    expect(tabs).toContain('role="tablist"');
    expect(tabs).toContain('aria-selected={tab === t}');
    expect(tabs).toContain('t === "recs" ? "Recs"');
    expect(tabs).toContain('"From the Pit"');
    expect(css).toContain("grid-template-columns:repeat(4,minmax(0,1fr))");
    expect(tabs).toContain("composeFeed");
    expect(tabs).toContain("enforcePitPositionRules");
    expect(css).toContain(".feed-tab-pill.is-active");
    expect(css).toContain("@media (max-width:720px)");
  });

  it("puts coven activity first while keeping every feed scope available", () => {
    const page = read("app/home/page.tsx");
    const tabs = read("components/FeedTabs.tsx");
    const returnContract = read("components/return-contract/NextInThePit.tsx");
    const returnContractCss = read("app/styles/250-return-contract.css");
    const homeCss = read("app/styles/320-home-feed.css");

    expect(page).toContain('(sp.tab as FeedTab) : "coven"');
    expect(tabs).toContain(': "coven";');
    expect(tabs).toContain('if (next === "coven") p.delete("tab")');
    expect(tabs).toContain('(tab === "all" || tab === "coven")');
    expect(tabs).toContain("index === 0 && showFeedInsert && children");
    expect(returnContract).toContain('className="btn return-contract__action"');
    expect(returnContractCss).toContain("grid-template-columns:minmax(0,1fr) auto");
    expect(homeCss).toContain("min-height:132px");
  });
});
