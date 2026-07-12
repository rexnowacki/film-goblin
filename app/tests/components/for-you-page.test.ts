import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("For You presentation", () => {
  const page = readFileSync("app/films/page.tsx", "utf8");
  const shelves = readFileSync("components/ForYouShelves.tsx", "utf8");
  const omen = readFileSync("components/DailyOmenHero.tsx", "utf8");
  const carousel = readFileSync("components/ShelfCarousel.tsx", "utf8");

  it("gives personalized discovery its own ritual masthead without changing shelf data", () => {
    expect(page).toContain('className="fyp-masthead"');
    expect(page).toContain("The pit <em>remembers</em>.");
    expect(page).toContain("<ForYouShelves");
    expect(shelves).toContain("shelves.map((shelf, index)");
    expect(shelves).toContain("shelf={shelf}");
    expect(shelves).toContain("shelfIndex={index}");
  });

  it("treats the Daily Omen as the primary reading with separate safe links", () => {
    expect(omen).toContain('className="daily-omen"');
    expect(omen).toContain("Daily Omen · Today&apos;s reading");
    expect(omen).toContain("Follow the omen →");
    expect(omen).not.toContain('href={`/film/${film.id}`} className="stackable"');
  });

  it("gives every existing shelf kind an honest visual explanation and controls", () => {
    for (const kind of ["hexed", "loved_tag", "coven", "new", "strange", "starter"]) {
      expect(carousel).toContain(`${kind}: {`);
    }
    expect(carousel).toContain("railRef.current?.scrollBy");
    expect(carousel).toContain("aria-label={`Scroll ${shelf.title} left`}");
    expect(carousel).toContain("aria-label={`Scroll ${shelf.title} right`}");
    expect(carousel).toContain('className="fyp-shelf-card__poster-link"');
    expect(carousel).toContain('className="fyp-shelf-card__link"');
  });
});
