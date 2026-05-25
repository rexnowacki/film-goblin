import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupTmdbWatchProvidersMock = vi.fn();

vi.mock("@/lib/search/tmdb", () => ({
  lookupTmdbWatchProviders: lookupTmdbWatchProvidersMock,
}));

const { runStreamingAvailabilityRefresh } = await import("@/lib/streaming-availability/refresh");

function makeClient(films: Array<{ id: string; tmdb_id: number }>) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  return {
    calls,
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("SELECT id, tmdb_id")) return { rows: films };
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe("runStreamingAvailabilityRefresh", () => {
  beforeEach(() => {
    lookupTmdbWatchProvidersMock.mockReset();
  });

  it("refreshes stale films and replaces provider rows", async () => {
    const client = makeClient([{ id: "film-1", tmdb_id: 550 }]);
    lookupTmdbWatchProvidersMock.mockResolvedValue({
      ok: true,
      providers: [
        {
          provider_id: 8,
          provider_name: "Shudder",
          provider_logo_path: "/shudder.jpg",
          category: "flatrate",
          display_priority: 3,
          tmdb_link: "https://www.themoviedb.org/movie/550-watch",
        },
      ],
    });

    await expect(runStreamingAvailabilityRefresh(client as never, { maxFilms: 5, staleHours: 48 })).resolves.toEqual({
      checked: 1,
      refreshed: 1,
      providersSaved: 1,
      failed: 0,
      skipped: 0,
      region: "US",
    });
    expect(lookupTmdbWatchProvidersMock).toHaveBeenCalledWith(550, "US");
    expect(client.calls.some((call) => call.sql === "BEGIN")).toBe(true);
    expect(client.calls.some((call) => call.sql.includes("DELETE FROM film_watch_providers"))).toBe(true);
    expect(client.calls.some((call) => call.sql.includes("INSERT INTO film_watch_providers"))).toBe(true);
    expect(client.calls.some((call) => call.sql.includes("streaming_availability_checked_at"))).toBe(true);
    expect(client.calls.some((call) => call.sql === "COMMIT")).toBe(true);
  });

  it("counts TMDB lookup failures without writing provider rows", async () => {
    const client = makeClient([{ id: "film-1", tmdb_id: 550 }]);
    lookupTmdbWatchProvidersMock.mockResolvedValue({ ok: false, error: "rate limited" });

    await expect(runStreamingAvailabilityRefresh(client as never)).resolves.toMatchObject({
      checked: 1,
      refreshed: 0,
      providersSaved: 0,
      failed: 1,
    });
    expect(client.calls.some((call) => call.sql.includes("INSERT INTO film_watch_providers"))).toBe(false);
  });
});
