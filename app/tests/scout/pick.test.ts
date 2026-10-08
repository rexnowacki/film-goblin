import { describe, expect, it } from "vitest";
import { pickScoutReleases, SCOUT_MIN_POPULARITY, type TmdbDiscoverResult } from "@/lib/scout/pick";

const TODAY = "2026-10-07";
const r = (over: Partial<TmdbDiscoverResult> & { id: number }): TmdbDiscoverResult => ({
  title: `Film ${over.id}`, release_date: "2026-10-01", popularity: 50,
  adult: false, poster_path: "/p.jpg", overview: "o", ...over,
});
const run = (digital: TmdbDiscoverResult[], theatrical: TmdbDiscoverResult[] = [], known: number[] = []) =>
  pickScoutReleases({ digital, theatrical, today: TODAY, knownTmdbIds: new Set(known) });

describe("pickScoutReleases", () => {
  it("drops re-releases whose primary release date is older than a year", () => {
    const picks = run([
      r({ id: 4488, title: "Friday the 13th", release_date: "1980-05-09" }),
      r({ id: 933260, title: "The Substance", release_date: "2024-10-31" }),
      r({ id: 1291595, title: "Insidious: Out of the Further", release_date: "2026-10-06" }),
    ]);
    expect(picks.map(p => p.tmdb_id)).toEqual([1291595]);
  });

  it("keeps a film exactly 365 days old and drops one 366 days old", () => {
    const picks = run([r({ id: 1, release_date: "2025-10-07" }), r({ id: 2, release_date: "2025-10-06" })]);
    expect(picks.map(p => p.tmdb_id)).toEqual([1]);
  });

  it("keeps popularity exactly at the floor and drops just below it", () => {
    const picks = run([
      r({ id: 1, popularity: SCOUT_MIN_POPULARITY }),
      r({ id: 2, popularity: SCOUT_MIN_POPULARITY - 0.01 }),
      r({ id: 3, popularity: undefined }),
    ]);
    expect(picks.map(p => p.tmdb_id)).toEqual([1]);
  });

  it("drops adult results, results without a release date, and known ids", () => {
    const picks = run([
      r({ id: 1, adult: true }),
      r({ id: 2, release_date: undefined }),
      r({ id: 3, release_date: "" }),
      r({ id: 4 }),
      r({ id: 5 }),
    ], [], [4]);
    expect(picks.map(p => p.tmdb_id)).toEqual([5]);
  });

  it("emits a film present in both windows once, as theatrical", () => {
    const picks = run([r({ id: 7, release_date: "2026-10-01" })], [r({ id: 7, release_date: "2026-10-20" })]);
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ tmdb_id: 7, window: "theatrical", release_date: "2026-10-20" });
  });

  it("maps fields, deriving year and a null poster when missing", () => {
    const [pick] = run([], [r({ id: 9, title: "Clayface", release_date: "2026-10-23", poster_path: null, overview: undefined })]);
    expect(pick).toEqual({
      tmdb_id: 9, title: "Clayface", year: 2026, release_date: "2026-10-23",
      window: "theatrical", artwork_url: null, description: "",
    });
  });

  it("builds artwork urls from the poster path", () => {
    const [pick] = run([r({ id: 10, poster_path: "/abc.jpg" })]);
    expect(pick.artwork_url).toBe("https://image.tmdb.org/t/p/w780/abc.jpg");
  });

  it("drops results without a title", () => {
    expect(run([r({ id: 11, title: "" }), r({ id: 12, title: undefined })])).toEqual([]);
  });
});
