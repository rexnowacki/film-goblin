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
});
