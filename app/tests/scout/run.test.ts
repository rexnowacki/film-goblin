import { describe, expect, it, vi } from "vitest";
import { runReleaseScout, type ScoutDeps } from "@/lib/scout/run";
import type { TmdbDiscoverResult } from "@/lib/scout/pick";

const NOW = new Date("2026-10-07T10:00:00Z");
const film = (id: number, release_date: string, popularity = 50): TmdbDiscoverResult => ({
  id, title: `Film ${id}`, release_date, popularity, adult: false, poster_path: null, overview: "",
});

function deps(over: Partial<ScoutDeps> = {}): ScoutDeps {
  return {
    discover: vi.fn(async (window) => ({
      ok: true as const,
      results: window === "digital" ? [film(1, "2026-10-01"), film(2, "2026-10-02")] : [film(3, "2026-10-20")],
    })),
    loadKnownTmdbIds: vi.fn(async () => new Set([2])),
    insertPick: vi.fn(async () => "inserted" as const),
    ...over,
  };
}

describe("runReleaseScout", () => {
  it("fetches both windows for today's UTC date and inserts unknown picks", async () => {
    const d = deps();
    const stats = await runReleaseScout(d, NOW);
    expect(d.discover).toHaveBeenCalledWith("digital", "2026-10-07");
    expect(d.discover).toHaveBeenCalledWith("theatrical", "2026-10-07");
    expect(vi.mocked(d.insertPick).mock.calls.map(c => [c[0].tmdb_id, c[0].window])).toEqual([[1, "digital"], [3, "theatrical"]]);
    expect(stats).toEqual({ fetchedDigital: 2, fetchedTheatrical: 1, kept: 2, inserted: 2, skippedKnown: 1 });
  });

  it("counts a unique-violation race as skipped, not an error", async () => {
    const d = deps({ insertPick: vi.fn(async (p) => (p.tmdb_id === 3 ? "duplicate" : "inserted")) });
    const stats = await runReleaseScout(d, NOW);
    expect(stats).toMatchObject({ kept: 2, inserted: 1, skippedKnown: 2 });
  });

  it("succeeds with zero inserts on an empty week", async () => {
    const d = deps({ discover: vi.fn(async () => ({ ok: true as const, results: [] })) });
    expect(await runReleaseScout(d, NOW)).toEqual({ fetchedDigital: 0, fetchedTheatrical: 0, kept: 0, inserted: 0, skippedKnown: 0 });
    expect(d.insertPick).not.toHaveBeenCalled();
  });

  it("throws when either TMDB window fails, before inserting anything", async () => {
    const d = deps({
      discover: vi.fn(async (window) =>
        window === "theatrical" ? { ok: false as const, error: "TMDB discover returned 503" } : { ok: true as const, results: [film(1, "2026-10-01")] }),
    });
    await expect(runReleaseScout(d, NOW)).rejects.toThrow("theatrical: TMDB discover returned 503");
    expect(d.insertPick).not.toHaveBeenCalled();
  });

  it("does not re-insert ids known from fulfilled or dismissed requests", async () => {
    const d = deps({ loadKnownTmdbIds: vi.fn(async () => new Set([1, 2, 3])) });
    const stats = await runReleaseScout(d, NOW);
    expect(d.insertPick).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ kept: 0, inserted: 0, skippedKnown: 3 });
  });
});
