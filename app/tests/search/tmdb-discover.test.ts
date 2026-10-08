import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverHorrorReleases, SCOUT_MAX_PAGES } from "@/lib/search/tmdb";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("TMDB_API_KEY", "test-key");
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const page = (results: unknown[], total_pages: number) =>
  ({ ok: true, status: 200, json: async () => ({ results, total_pages }) }) as Response;

describe("discoverHorrorReleases", () => {
  it("queries the digital window: release types 4|5, last 14 days", async () => {
    fetchMock.mockResolvedValueOnce(page([{ id: 1 }], 1));
    const res = await discoverHorrorReleases("digital", "2026-10-07");
    expect(res).toEqual({ ok: true, results: [{ id: 1 }] });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/3/discover/movie");
    expect(url.searchParams.get("with_genres")).toBe("27");
    expect(url.searchParams.get("region")).toBe("US");
    expect(url.searchParams.get("include_adult")).toBe("false");
    expect(url.searchParams.get("sort_by")).toBe("popularity.desc");
    expect(url.searchParams.get("with_release_type")).toBe("4|5");
    expect(url.searchParams.get("release_date.gte")).toBe("2026-09-23");
    expect(url.searchParams.get("release_date.lte")).toBe("2026-10-07");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("api_key")).toBe("test-key");
  });

  it("queries the theatrical window: release types 2|3, next 1–30 days", async () => {
    fetchMock.mockResolvedValueOnce(page([], 1));
    await discoverHorrorReleases("theatrical", "2026-10-07");
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("with_release_type")).toBe("2|3");
    expect(url.searchParams.get("release_date.gte")).toBe("2026-10-08");
    expect(url.searchParams.get("release_date.lte")).toBe("2026-11-06");
  });

  it("follows pagination until total_pages", async () => {
    fetchMock
      .mockResolvedValueOnce(page([{ id: 1 }], 3))
      .mockResolvedValueOnce(page([{ id: 2 }], 3))
      .mockResolvedValueOnce(page([{ id: 3 }], 3));
    const res = await discoverHorrorReleases("digital", "2026-10-07");
    expect(res).toEqual({ ok: true, results: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops at the page cap", async () => {
    fetchMock.mockImplementation(async () => page([{ id: 0 }], 50));
    const res = await discoverHorrorReleases("digital", "2026-10-07");
    expect(fetchMock).toHaveBeenCalledTimes(SCOUT_MAX_PAGES);
    expect(res.ok && res.results.length).toBe(SCOUT_MAX_PAGES);
  });

  it("returns ok with no results when total_pages is 0", async () => {
    fetchMock.mockResolvedValueOnce(page([], 0));
    expect(await discoverHorrorReleases("digital", "2026-10-07")).toEqual({ ok: true, results: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns ok:false on a non-200 response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as Response);
    expect(await discoverHorrorReleases("digital", "2026-10-07")).toEqual({ ok: false, error: "TMDB discover returned 503" });
  });

  it("returns ok:false when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect(await discoverHorrorReleases("digital", "2026-10-07")).toEqual({ ok: false, error: "network down" });
  });
});
