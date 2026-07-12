import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("collection page presentation", () => {
  const watchlist = readFileSync("app/watchlist/page.tsx", "utf8");
  const library = readFileSync("app/library/page.tsx", "utf8");
  const watched = readFileSync("app/watched/page.tsx", "utf8");
  const films = readFileSync("app/films/page.tsx", "utf8");
  const browse = readFileSync("app/films/BrowseAll.tsx", "utf8");
  const signin = readFileSync("app/auth/signin/page.tsx", "utf8");
  const css = readFileSync("app/styles/300-collections.css", "utf8");

  it("gives every named collection route its own editorial identity", () => {
    expect(watchlist).toContain("The <em>Hoard</em>");
    expect(library).toContain("Your <em>Grimoire</em>");
    expect(watched).toContain("Your <em>Diary</em>");
    expect(films).toContain("The complete archive");
    expect(browse).toContain("Catalog census");
    expect(signin).toContain("signin-oracle");
  });

  it("preserves each route's existing data and behavior contracts", () => {
    expect(watchlist).toContain("getMyWatchlistWithFilms(supabase)");
    expect(watchlist).toContain("sortWatchlist(rows, sort)");
    expect(watchlist).toContain("<WatchlistSearch />");
    expect(library).toContain("getLibrary(supabase, user.id)");
    expect(library).toContain("getLibrarySavings(supabase, user.id)");
    expect(watched).toContain("getWatchedDiary(supabase, user.id)");
    expect(watched).toContain("<DiaryRow key={r.id} row={r} />");
    expect(browse).toContain("getFilms(supabase, { q, sort, page");
    expect(browse).toContain("<FilmsSortChips currentSort={sort} currentQ={q} />");
  });

  it("shares one responsive collection framework at the zine breakpoint", () => {
    expect(css).toContain(".collection-hero");
    expect(css).toContain(".collection-tools");
    expect(css).toContain(".collection-grid");
    expect(css).toContain(".collection-ledger");
    expect(css).toContain(".diary-repeats");
    const mobile = css.slice(css.indexOf("@media (max-width: 720px)"));
    expect(mobile).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(mobile).toContain(".collection-tools");
    expect(mobile).toContain(".diary-ledger");
  });
});
