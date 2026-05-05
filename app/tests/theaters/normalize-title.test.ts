import { describe, expect, it } from "vitest";
import { extractYearFromTitle, normalizeTitle, stripYearFromTitle } from "@/lib/theaters/normalize-title";

describe("normalizeTitle", () => {
  it("normalizes presentation suffixes without losing display title elsewhere", () => {
    expect(normalizeTitle("The Devil Wears Prada 2 – Spanish Subtitles")).toBe("devil wears prada 2");
    expect(normalizeTitle("Close Encounters of the Third Kind in 70mm")).toBe("close encounters of the third kind");
    expect(normalizeTitle("Se7en 4K restoration!")).toBe("se7en");
    expect(normalizeTitle("The Room with live commentary from Greg Sestero!")).toBe("room");
  });

  it("normalizes quotes and articles", () => {
    expect(normalizeTitle("Howl’s Moving Castle")).toBe("howls moving castle");
    expect(normalizeTitle("The Shining")).toBe("shining");
  });

  it("extracts and strips terminal years", () => {
    expect(extractYearFromTitle("SERIAL MOM (1994)")).toBe(1994);
    expect(stripYearFromTitle("SERIAL MOM (1994)")).toBe("SERIAL MOM");
  });
});
