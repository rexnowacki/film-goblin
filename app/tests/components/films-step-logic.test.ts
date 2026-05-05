import { describe, it, expect } from "vitest";
import { filterFilmsByLanes, type DbFilm } from "@/app/onboarding/films-step-logic";

function makeFilm(id: string, tagIds: string[]): DbFilm {
  return { id, itunes_id: null, title: id, director: "D", year: 2024, genre_primary: "Horror", artwork_url: "", editorial_starter: false, tagIds };
}

const folkId = "uuid-folk";
const gialloId = "uuid-giallo";

describe("filterFilmsByLanes", () => {
  it("returns all films when laneTagIds empty", () => {
    const films = [makeFilm("a", [folkId]), makeFilm("b", [])];
    expect(filterFilmsByLanes(films, [])).toEqual(films);
  });

  it("falls back to all films when fewer than 6 match", () => {
    const films = [makeFilm("a", [folkId]), makeFilm("b", []), makeFilm("c", [])];
    // 1 match < 6 → fallback to all
    expect(filterFilmsByLanes(films, [folkId])).toEqual(films);
  });

  it("returns filtered list when 6+ match", () => {
    const films = Array.from({ length: 8 }, (_, i) => makeFilm(`f${i}`, [folkId]));
    const result = filterFilmsByLanes(films, [folkId]);
    expect(result).toHaveLength(8);
    expect(result.every(f => f.tagIds.includes(folkId))).toBe(true);
  });

  it("matches any of multiple selected lanes", () => {
    const films = [
      ...Array.from({ length: 3 }, (_, i) => makeFilm(`f${i}`, [folkId])),
      ...Array.from({ length: 3 }, (_, i) => makeFilm(`g${i}`, [gialloId])),
    ];
    const result = filterFilmsByLanes(films, [folkId, gialloId]);
    expect(result).toHaveLength(6);
  });
});
