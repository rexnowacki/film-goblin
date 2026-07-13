import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("film detail editorial UI contract", () => {
  const page = readFileSync("app/film/[id]/page.tsx", "utf8");
  const globals = readFileSync("app/globals.css", "utf8");
  const css = readFileSync("app/styles/330-film-detail.css", "utf8");

  it("uses the cinematic page shell and editorial rooms", () => {
    expect(page).toContain('className="film-detail-page"');
    expect(page).toContain('className="film-detail-hero"');
    expect(page).toContain('className="film-detail-actions"');
    expect(page).toContain('className="container-wide film-detail-info-grid"');
    expect(page).toContain('className="film-detail-price-room grain-light"');
    expect(page).toContain('className="film-detail-review-card"');
    expect(page.indexOf('className="film-detail-identity"')).toBeLessThan(
      page.indexOf('className="film-detail-poster-wrap"'),
    );
  });

  it("preserves every existing film action surface", () => {
    for (const component of [
      "FilmActions",
      "RecommendModal",
      "PlanWatchButton",
      "ShareFilmButton",
      "ShowtimesSheet",
      "BuyOnAppleLink",
      "TrailerButton",
    ]) {
      expect(page).toContain(`<${component}`);
    }
  });

  it("loads a dedicated responsive stylesheet", () => {
    expect(globals).toContain('@import "./styles/330-film-detail.css";');
    expect(css).toContain(".film-detail-hero__inner");
    expect(css).toContain(".film-detail-actions__grid");
    expect(css).toContain("@media (max-width: 720px)");
  });

  it("renders each published review body once", () => {
    expect(page.match(/\{r\.body\}/g)).toHaveLength(1);
  });

  it("labels the watcher strip as completed watches", () => {
    const strip = readFileSync("components/FilmWatchersStrip.tsx", "utf8");
    expect(page).toContain("Who&rsquo;s Watched");
    expect(strip).toContain("Watched");
    expect(strip).toContain('title="Who’s Watched"');
    expect(strip).not.toContain("Also Watching");
  });
});
