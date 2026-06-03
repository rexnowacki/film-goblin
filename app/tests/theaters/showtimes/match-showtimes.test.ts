import { describe, expect, it } from "vitest";
import { chooseFilmId } from "@/lib/theaters/showtimes/match-showtimes";

const films = [
  { id: "f1", title: "Death Becomes Her", year: 1992 },
  { id: "f2", title: "The Substance", year: 2024 },
  { id: "f3", title: "Substance", year: 1999 },
  { id: "f4", title: "Close Encounters of the Third Kind", year: 1977 },
];

describe("chooseFilmId", () => {
  it("matches on exact title case-insensitively", () => {
    expect(chooseFilmId("death becomes her", films)).toBe("f1");
  });

  it("returns null when normalized title is ambiguous", () => {
    expect(chooseFilmId("A Substance", films)).toBe(null);
  });

  it("matches a showtime title after known format suffix normalization", () => {
    expect(chooseFilmId("Close Encounters of the Third Kind in 70mm", films)).toBe("f4");
  });

  it("returns null when no film matches", () => {
    expect(chooseFilmId("Backrooms", films)).toBe(null);
  });
});
