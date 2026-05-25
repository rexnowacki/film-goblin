import { describe, expect, it } from "vitest";
import { scoreTrailerCandidate } from "../src/trailers.js";

const film = {
  title: "Red Rooms",
  year: 2024,
  director: "Pascal Plante",
};

describe("trailer scoring", () => {
  it("scores a strong official trailer candidate above the default threshold", () => {
    const candidate = scoreTrailerCandidate(film, {
      title: "Red Rooms - Official Trailer (2024)",
      description: "Official trailer from Utopia for Pascal Plante's Red Rooms, 2024.",
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    }, "abcdefghijk");

    expect(candidate.score).toBeGreaterThanOrEqual(0.88);
    expect(candidate.reasons).toContain("title match");
    expect(candidate.reasons).toContain("official trailer");
  });

  it("penalizes review and explanation videos", () => {
    const candidate = scoreTrailerCandidate(film, {
      title: "Red Rooms ending explained review",
      description: "A review and explanation of the movie.",
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    }, "abcdefghijk");

    expect(candidate.score).toBeLessThan(0.5);
    expect(candidate.reasons).toContain("penalty:review");
    expect(candidate.reasons).toContain("penalty:explained");
  });
});
