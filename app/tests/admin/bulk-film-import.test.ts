import { describe, expect, it } from "vitest";
import { parseBulkFilmInput } from "@/lib/admin/bulk-film-import";

describe("parseBulkFilmInput", () => {
  it("parses common Markdown movie list formats", () => {
    const rows = parseBulkFilmInput(`
# Suggestions

- The Wicker Man (1973)
1. Lake Mungo - 2008
2. The Vanishing | 1988
- [ ] Possession (1981)
> Cure (1997)
`);

    const ready = rows.filter(row => row.status === "ready").map(row => row.seed);

    expect(ready).toEqual([
      expect.objectContaining({ title: "The Wicker Man", year: 1973 }),
      expect.objectContaining({ title: "Lake Mungo", year: 2008 }),
      expect.objectContaining({ title: "The Vanishing", year: 1988 }),
      expect.objectContaining({ title: "Possession", year: 1981 }),
      expect.objectContaining({ title: "Cure", year: 1997 }),
    ]);
  });

  it("detects duplicate title/year entries after normalization", () => {
    const rows = parseBulkFilmInput(`
- The Thing (1982)
- Thing, The (1982)
- The Thing (2011)
`);

    expect(rows.filter(row => row.status === "ready")).toHaveLength(2);
    expect(rows.find(row => row.status === "duplicate_input")?.seed).toEqual(
      expect.objectContaining({ title: "Thing, The", year: 1982 }),
    );
  });

  it("ignores Markdown table separators and caps ready rows", () => {
    const rows = parseBulkFilmInput(`
| Title | Year |
| --- | --- |
| Audition | 1999 |
- Noroi: The Curse (2005)
- Pulse (2001)
- Cure (1997)
`, 2);

    expect(rows.filter(row => row.status === "ready").map(row => row.seed?.title)).toEqual([
      "Noroi: The Curse",
      "Pulse",
    ]);
    expect(rows.find(row => row.raw.includes("Audition"))?.status).toBe("ignored");
    expect(rows.find(row => row.raw.includes("Cure"))?.status).toBe("ignored");
  });
});
