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

  it("returns brave-empty when Brave returns zero web.results", async () => {
    searchFilmsMock.mockResolvedValue({ resultCount: 0, results: [] });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ web: { results: [] } }), { status: 200 })
    );

    const result = await adminSearchAppleTv("midsommar");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("brave-empty");
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("api.search.brave.com/res/v1/web/search");
    expect(String(url)).toContain("site%3Atv.apple.com%2Fus%2Fmovie");
    fetchSpy.mockRestore();
  });

  it("returns brave-empty when all Brave URLs fail the candidate regex (noise only)", async () => {
    searchFilmsMock.mockResolvedValue({ resultCount: 0, results: [] });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        web: {
          results: [
            { url: "https://tv.apple.com/us/show/severance/umc.cmc.aa" },
            { url: "https://tv.apple.com/gb/movie/midsommar/umc.cmc.bb" },
            { url: "https://tv.apple.com/us/genre/horror/umc.cmc.cc" },
          ],
        },
      }), { status: 200 })
    );

    const result = await adminSearchAppleTv("junk");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("brave-empty");
    // Only the Brave call happened — no tv.apple.com page fetches, because all URLs were noise.
    expect(fetchSpy).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });

  it("sends the subscription token header and site-restricted query", async () => {
    searchFilmsMock.mockResolvedValue({ resultCount: 0, results: [] });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ web: { results: [] } }), { status: 200 })
    );

    await adminSearchAppleTv("midsommar");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('%22midsommar%22'); // quoted phrase match
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Subscription-Token")).toBe("test-brave-key");
    expect(headers.get("Accept")).toBe("application/json");
    fetchSpy.mockRestore();
  });

  it("returns 5 apple-tv-search candidates when Brave and all page fetches succeed", async () => {
    searchFilmsMock.mockResolvedValue({ resultCount: 0, results: [] });
    const validHtml = `<html><body><script>{"adamId":"__ADAM__"}</script></body></html>`;
    const mkHtml = (id: string) => validHtml.replace("__ADAM__", id);

    // Return a different adamId per URL so we can verify each candidate is distinct.
    const urlToAdamId: Record<string, string> = {
      "https://tv.apple.com/us/movie/midsommar/umc.cmc.aaaaaaa1": "100000001",
      "https://tv.apple.com/us/movie/the-thing/umc.cmc.bbbbbbb2": "100000002",
      "https://tv.apple.com/us/movie/suspiria/umc.cmc.ccccccc3": "100000003",
      "https://tv.apple.com/us/movie/send-help/umc.cmc.ddddddd4": "100000004",
      "https://tv.apple.com/us/movie/hereditary/umc.cmc.eeeeeee5": "100000005",
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.startsWith("https://api.search.brave.com/")) {
        return new Response(JSON.stringify({
          web: { results: Object.keys(urlToAdamId).concat([
            "https://tv.apple.com/us/show/severance/umc.cmc.ffffffff",
            "https://tv.apple.com/us/genre/horror/umc.cmc.ggggggg",
            "https://tv.apple.com/gb/movie/midsommar/umc.cmc.hhhhhhh6",
          ]).map(url => ({ url })) },
        }), { status: 200 });
      }
      if (urlToAdamId[urlStr]) {
        return new Response(mkHtml(urlToAdamId[urlStr]), { status: 200, headers: { "content-type": "text/html" } });
      }
      throw new Error(`unexpected fetch: ${urlStr}`);
    });

    fetchPricesMock.mockImplementation(async (ids: number[]) => ({
      resultCount: ids.length,
      results: ids.map(id => ({ trackId: id })),
    }));
    parseFilmMock.mockImplementation((r: { trackId: number }) => ({
      itunes_id: r.trackId,
      title: `Film ${r.trackId}`,
      director: "Dir",
      year: 2020,
      runtime_min: 100,
      genre_primary: "Horror",
      description: "",
      content_advisory: "R",
      artwork_url: "",
      itunes_url: `https://itunes.apple.com/us/movie/id${r.trackId}`,
      price_usd: 9.99,
    }));

    const result = await adminSearchAppleTv("midsommar");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidates).toHaveLength(5);
      expect(result.candidates.every(c => c.via === "apple-tv-search")).toBe(true);
      const ids = result.candidates.map(c => c.itunes_id).sort();
      expect(ids).toEqual([100000001, 100000002, 100000003, 100000004, 100000005]);
    }

    // Verify noise URLs were NOT fetched.
    const fetchedUrls = fetchSpy.mock.calls.map(c => String(c[0]));
    expect(fetchedUrls.some(u => u.includes("/us/show/"))).toBe(false);
    expect(fetchedUrls.some(u => u.includes("/us/genre/"))).toBe(false);
    expect(fetchedUrls.some(u => u.startsWith("https://tv.apple.com/gb/"))).toBe(false);

    fetchSpy.mockRestore();
  });

  it("drops streaming-only candidates and logs dropped count on partial success", async () => {
    searchFilmsMock.mockResolvedValue({ resultCount: 0, results: [] });
    const validHtml = (id: string) => `<html><body><script>{"adamId":"${id}"}</script></body></html>`;
    const streamingOnlyHtml = `<html><body><script>{"title":"no adam id"}</script></body></html>`;

    const urls = [
      "https://tv.apple.com/us/movie/a/umc.cmc.aa",
      "https://tv.apple.com/us/movie/b/umc.cmc.bb",
      "https://tv.apple.com/us/movie/c/umc.cmc.cc",
      "https://tv.apple.com/us/movie/d/umc.cmc.dd",
      "https://tv.apple.com/us/movie/e/umc.cmc.ee",
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.startsWith("https://api.search.brave.com/")) {
        return new Response(JSON.stringify({ web: { results: urls.map(url => ({ url })) } }), { status: 200 });
      }
      // a, c, e are valid; b, d are streaming-only.
      const idx = urls.indexOf(urlStr);
      if (idx === 1 || idx === 3) {
        return new Response(streamingOnlyHtml, { status: 200 });
      }
      return new Response(validHtml(`10000000${idx + 1}`), { status: 200 });
    });

    fetchPricesMock.mockImplementation(async (ids: number[]) => ({
      resultCount: ids.length,
      results: ids.map(id => ({ trackId: id })),
    }));
    parseFilmMock.mockImplementation((r: { trackId: number }) => ({
      itunes_id: r.trackId,
      title: `Film ${r.trackId}`,
      director: "Dir",
      year: 2020,
      runtime_min: 100,
      genre_primary: "Horror",
      description: "",
      content_advisory: "R",
      artwork_url: "",
      itunes_url: `https://itunes.apple.com/us/movie/id${r.trackId}`,
      price_usd: 9.99,
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await adminSearchAppleTv("mixed");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidates).toHaveLength(3);
    }
    expect(logSpy.mock.calls.some(args => args.some(a => typeof a === "string" && a.includes("dropped 2/5")))).toBe(true);

    logSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it("returns all-streaming-only when every candidate page fails adamId extraction", async () => {
    searchFilmsMock.mockResolvedValue({ resultCount: 0, results: [] });
    const streamingOnlyHtml = `<html><body><script>{"title":"no adam id"}</script></body></html>`;
    const urls = [
      "https://tv.apple.com/us/movie/a/umc.cmc.aa",
      "https://tv.apple.com/us/movie/b/umc.cmc.bb",
      "https://tv.apple.com/us/movie/c/umc.cmc.cc",
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.startsWith("https://api.search.brave.com/")) {
        return new Response(JSON.stringify({ web: { results: urls.map(url => ({ url })) } }), { status: 200 });
      }
      return new Response(streamingOnlyHtml, { status: 200 });
    });

    const result = await adminSearchAppleTv("suspiria 1977");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("all-streaming-only");
      expect(result.message).toContain("streaming-only");
    }
    fetchSpy.mockRestore();
  });

  it("returns brave-error on Brave HTTP 500", async () => {
    searchFilmsMock.mockResolvedValue({ resultCount: 0, results: [] });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("internal error", { status: 500 })
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await adminSearchAppleTv("midsommar");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("brave-error");
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls.some(args => args.some(a => typeof a === "string" && a.includes("500")))).toBe(true);

    errorSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it("returns brave-error on Brave HTTP 401 (same admin-facing copy as 500)", async () => {
    searchFilmsMock.mockResolvedValue({ resultCount: 0, results: [] });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unauthorized", { status: 401 })
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await adminSearchAppleTv("midsommar");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("brave-error");
      expect(result.message).toBe("Search unavailable — try again in a moment.");
    }

    errorSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it("returns brave-error when BRAVE_SEARCH_API_KEY is unset", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    searchFilmsMock.mockResolvedValue({ resultCount: 0, results: [] });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await adminSearchAppleTv("midsommar");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("brave-error");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.some(args => args.some(a => typeof a === "string" && a.includes("BRAVE_SEARCH_API_KEY")))).toBe(true);

    errorSpy.mockRestore();
    fetchSpy.mockRestore();
  });
});
