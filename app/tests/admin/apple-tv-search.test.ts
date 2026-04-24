import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoisted mocks — constructed before the server action module loads.
const requireAdminMock = vi.fn();
const createClientMock = vi.fn();
const searchFilmsMock = vi.fn();
const parseFilmMock = vi.fn();
const fetchPricesMock = vi.fn();

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: requireAdminMock,
  NotAdminError: class NotAdminError extends Error {},
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("film-goblin-worker", () => ({
  searchFilms: searchFilmsMock,
  parseFilm: parseFilmMock,
  fetchPrices: fetchPricesMock,
}));

// Import AFTER the mocks are registered.
const { adminSearchAppleTv } = await import("@/lib/actions/admin/apple-tv-search");

describe("adminSearchAppleTv", () => {
  beforeEach(() => {
    requireAdminMock.mockReset().mockResolvedValue(undefined);
    createClientMock.mockReset().mockResolvedValue({});
    searchFilmsMock.mockReset();
    parseFilmMock.mockReset();
    fetchPricesMock.mockReset();
    process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
  });

  it("returns empty candidates for empty input without hitting iTunes or Brave", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await adminSearchAppleTv("   ");
    expect(result).toEqual({ ok: true, candidates: [] });
    expect(searchFilmsMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("rejects and skips downstream work when requireAdmin throws", async () => {
    const err = new Error("admin role required");
    requireAdminMock.mockRejectedValue(err);
    await expect(adminSearchAppleTv("midsommar")).rejects.toThrow("admin role required");
    expect(searchFilmsMock).not.toHaveBeenCalled();
  });

  it("returns iTunes candidates without hitting Brave when iTunes has results", async () => {
    const raw = [{ trackId: 111, trackName: "The Thing" }];
    searchFilmsMock.mockResolvedValue({ resultCount: 1, results: raw });
    parseFilmMock.mockReturnValue({
      itunes_id: 111,
      title: "The Thing",
      director: "John Carpenter",
      year: 1982,
      runtime_min: 109,
      genre_primary: "Horror",
      description: "...",
      content_advisory: "R",
      artwork_url: "https://example.com/a.jpg",
      itunes_url: "https://itunes.apple.com/us/movie/id111",
      price_usd: 9.99,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await adminSearchAppleTv("The Thing");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].via).toBe("itunes");
      expect(result.candidates[0].itunes_id).toBe(111);
    }
    expect(searchFilmsMock).toHaveBeenCalledWith("The Thing", { limit: 10 });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("treats iTunes results that fail to parse as zero hits and falls through (no Brave key set yet)", async () => {
    searchFilmsMock.mockResolvedValue({ resultCount: 1, results: [{ trackId: 222 }] });
    parseFilmMock.mockReturnValue(null);
    delete process.env.BRAVE_SEARCH_API_KEY;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await adminSearchAppleTv("junk");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("brave-error");
    errorSpy.mockRestore();
  });

  it("treats a thrown searchFilms as zero hits and falls through to Brave path", async () => {
    searchFilmsMock.mockRejectedValue(new Error("iTunes 503"));
    delete process.env.BRAVE_SEARCH_API_KEY;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await adminSearchAppleTv("midsommar");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("brave-error");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
