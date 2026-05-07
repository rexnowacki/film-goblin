import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
  }),
}));

// Mock search helpers
vi.mock("@/lib/search/apple-tv", () => ({
  searchAppleTv: vi.fn(),
}));
vi.mock("@/lib/search/tmdb", () => ({
  searchTmdb: vi.fn(),
}));
vi.mock("film-goblin-worker", () => ({
  searchFilms: vi.fn(),
  parseFilm: vi.fn(),
}));
vi.mock("@/lib/search/itunes-hit", () => ({
  toHit: vi.fn(p => p),
}));

import { searchFilmForRequest } from "@/lib/actions/film-requests";
import { searchAppleTv } from "@/lib/search/apple-tv";
import { searchTmdb } from "@/lib/search/tmdb";
import { searchFilms, parseFilm } from "film-goblin-worker";

const mockSearchFilms = vi.mocked(searchFilms);
const mockParseFilm = vi.mocked(parseFilm);
const mockSearchAppleTv = vi.mocked(searchAppleTv);
const mockSearchTmdb = vi.mocked(searchTmdb);

const ITUNES_HIT = {
  itunes_id: 123, title: "The Fly", director: "David Cronenberg",
  year: 1986, runtime_min: 96, genre_primary: "Horror",
  description: "A scientist…", content_advisory: "R",
  artwork_url: "https://example.com/fly.jpg", itunes_url: "https://itunes.apple.com/…",
  price_usd: 3.99,
};

const TMDB_CANDIDATE = {
  tmdb_id: 999, title: "The Fly", year: 1986,
  poster_url: "https://image.tmdb.org/…", overview: "A scientist…",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchFilmForRequest — fallback chain", () => {
  it("returns iTunes hit when direct search succeeds", async () => {
    mockSearchFilms.mockResolvedValue({ resultCount: 1, results: [{} as any] });
    mockParseFilm.mockReturnValue(ITUNES_HIT as any);

    const result = await searchFilmForRequest("The Fly");

    expect(result).toEqual({ ok: true, result: { source: "itunes", hit: ITUNES_HIT } });
    expect(mockSearchAppleTv).not.toHaveBeenCalled();
    expect(mockSearchTmdb).not.toHaveBeenCalled();
  });

  it("falls back to Brave when iTunes search returns no results", async () => {
    mockSearchFilms.mockResolvedValue({ resultCount: 0, results: [] });
    mockSearchAppleTv.mockResolvedValue({ ok: true, candidates: [ITUNES_HIT] });

    const result = await searchFilmForRequest("The Fly");

    expect(result).toEqual({ ok: true, result: { source: "itunes", hit: ITUNES_HIT } });
    expect(mockSearchTmdb).not.toHaveBeenCalled();
  });

  it("falls back to TMDB when iTunes and Brave both fail", async () => {
    mockSearchFilms.mockResolvedValue({ resultCount: 0, results: [] });
    mockSearchAppleTv.mockResolvedValue({ ok: false, reason: "brave-empty", message: "no results" });
    mockSearchTmdb.mockResolvedValue({ ok: true, candidates: [TMDB_CANDIDATE] });

    const result = await searchFilmForRequest("The Fly");

    expect(result).toEqual({ ok: true, result: { source: "tmdb", hit: TMDB_CANDIDATE } });
  });

  it("returns manual fallback when all three sources fail", async () => {
    mockSearchFilms.mockResolvedValue({ resultCount: 0, results: [] });
    mockSearchAppleTv.mockResolvedValue({ ok: false, reason: "brave-error", message: "err" });
    mockSearchTmdb.mockResolvedValue({ ok: false, error: "TMDB down" });

    const result = await searchFilmForRequest("Some Obscure Film");

    expect(result).toEqual({ ok: true, result: { source: "manual", title: "Some Obscure Film" } });
  });

  it("returns manual fallback when iTunes throws", async () => {
    mockSearchFilms.mockRejectedValue(new Error("network error"));
    mockSearchAppleTv.mockResolvedValue({ ok: false, reason: "brave-error", message: "err" });
    mockSearchTmdb.mockResolvedValue({ ok: false, error: "TMDB down" });

    const result = await searchFilmForRequest("Some Film");

    expect(result).toEqual({ ok: true, result: { source: "manual", title: "Some Film" } });
  });

  it("returns auth error when not signed in", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any);

    const result = await searchFilmForRequest("The Fly");

    expect(result).toEqual({ ok: false, error: "Sign in to request films." });
    expect(mockSearchFilms).not.toHaveBeenCalled();
  });

  it("returns validation error for empty query", async () => {
    const result = await searchFilmForRequest("   ");

    expect(result).toEqual({ ok: false, error: "Enter a film title to search." });
    expect(mockSearchFilms).not.toHaveBeenCalled();
  });
});

// ── submitFilmRequest ────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/service-role", () => ({
  serviceRoleClient: vi.fn(),
}));

import { submitFilmRequest, fulfillRequest } from "@/lib/actions/film-requests";
import { serviceRoleClient } from "@/lib/supabase/service-role";

const mockServiceRoleClient = vi.mocked(serviceRoleClient);

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  // make each method return the chain so calls can be chained
  Object.keys(chain).forEach(k => {
    if (typeof chain[k as keyof typeof chain] === 'function' && !['maybeSingle','single','insert','upsert'].includes(k)) {
      const orig = chain[k as keyof typeof chain] as ReturnType<typeof vi.fn>;
      orig.mockReturnValue(chain);
    }
  });
  return chain;
}

const BASE_INPUT = {
  title: "The Fly",
  year: 1986,
  source: "itunes" as const,
  needs_itunes_id: false,
  itunes_id: 123,
  tmdb_id: null,
  artwork_url: "https://example.com/fly.jpg",
  director: "David Cronenberg",
  description: "A scientist…",
  runtime_min: 96,
  genre_primary: "Horror",
  content_advisory: "R",
  itunes_url: "https://itunes.apple.com/…",
};

describe("submitFilmRequest", () => {
  it("returns already_in_catalog when film exists by itunes_id", async () => {
    const filmChain = makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "film-abc" }, error: null }) });
    const svc = { from: vi.fn().mockReturnValue(filmChain) } as any;
    mockServiceRoleClient.mockReturnValue(svc);

    const result = await submitFilmRequest(BASE_INPUT);

    expect(result).toEqual({ status: "already_in_catalog", filmId: "film-abc" });
  });

  it("inserts new request when no existing film or request", async () => {
    let callNum = 0;
    const svc = {
      from: vi.fn().mockImplementation(() => {
        callNum++;
        if (callNum === 1) {
          // films check — not found
          return { ...makeChain(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }
        if (callNum === 2) {
          // film_requests check — not found
          return { ...makeChain(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }
        if (callNum === 3) {
          // insert film_requests
          return { ...makeChain(), insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: "req-1" }, error: null }) }) }) };
        }
        // insert film_request_users
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }),
    } as any;
    mockServiceRoleClient.mockReturnValue(svc);

    const result = await submitFilmRequest(BASE_INPUT);

    expect(result).toEqual({ status: "ok" });
  });
});

describe("fulfillRequest", () => {
  it("updates request status and inserts notifications for opted-in users only", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    const svc = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "film_requests") return { update: updateMock };
        if (table === "film_request_users") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u1" }, { user_id: "u2" }], error: null }),
          };
        }
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [
                { id: "u1", notify_film_requests: true },
                { id: "u2", notify_film_requests: false },
              ],
              error: null,
            }),
          };
        }
        if (table === "notifications") return { insert: insertMock };
        return {};
      }),
    } as any;

    await fulfillRequest(svc, "req-1", "film-abc", "The Fly");

    // u1 opted in → 1 notification; u2 opted out → excluded
    expect(insertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ user_id: "u1", kind: "film_request_fulfilled" }),
      ])
    );
    const notifications = insertMock.mock.calls[0][0] as Array<{ user_id: string }>;
    expect(notifications.some(n => n.user_id === "u2")).toBe(false);
  });
});
