import { describe, expect, it } from "vitest";
import { sourceHash } from "@/lib/theaters/source-hash";

describe("sourceHash", () => {
  it("uses parsed date key when available", () => {
    const a = sourceHash({
      theaterSlug: "loft-cinema",
      title: "Se7en",
      sourceUrl: "https://loftcinema.org/film/se7en/",
      startsOn: "2026-05-08",
      dateLabel: "Starts May 8",
    });
    const b = sourceHash({
      theaterSlug: "loft-cinema",
      title: "Se7en 4K restoration!",
      sourceUrl: "https://loftcinema.org/film/se7en/",
      startsOn: "2026-05-08",
      dateLabel: "Friday, May 8",
    });
    expect(a).toBe(b);
  });

  it("separates theaters", () => {
    const base = {
      title: "Serial Mom",
      sourceUrl: "https://example.test/serial-mom",
      dateLabel: "May 15",
    };
    expect(sourceHash({ ...base, theaterSlug: "guild-cinema" })).not.toBe(
      sourceHash({ ...base, theaterSlug: "loft-cinema" }),
    );
  });
});
