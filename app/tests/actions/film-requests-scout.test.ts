import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/supabase/service-role", () => ({ serviceRoleClient: vi.fn() }));
vi.mock("@/lib/actions/admin/films", () => ({ adminCreateFilm: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/search/apple-tv", () => ({ searchAppleTv: vi.fn() }));
vi.mock("@/lib/search/tmdb", () => ({ searchTmdb: vi.fn(), lookupTmdb: vi.fn() }));
vi.mock("film-goblin-worker", () => ({ searchFilms: vi.fn(), fetchPrices: vi.fn(), parseFilm: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: vi.fn(), utcDayString: vi.fn() }));

import { dismissFilmRequest, fulfillFilmRequest } from "@/lib/actions/film-requests";
import { requireAdmin } from "@/lib/auth/require-admin";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { adminCreateFilm } from "@/lib/actions/admin/films";

function svcWithRequest(row: Record<string, unknown>) {
  const updateEq2 = vi.fn().mockResolvedValue({ error: null });
  const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 });
  const update = vi.fn().mockReturnValue({ eq: updateEq1 });
  const svc = {
    from: vi.fn((table: string) => {
      if (table === "film_requests") {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: row, error: null }) }) }),
          update,
        };
      }
      // _fulfillRequest's requester lookup: no requesters → returns early.
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
    }),
  };
  return { svc, update, updateEq1, updateEq2 };
}

const BASE = {
  id: "req-1", status: "pending", itunes_id: null, title: "Clayface", director: null, year: 2026,
  runtime_min: null, genre_primary: null, description: "", content_advisory: null, artwork_url: null,
  itunes_url: null, tmdb_id: 1400940,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(undefined);
  vi.mocked(adminCreateFilm).mockResolvedValue({ ok: true, filmId: "film-1" } as never);
});

describe("fulfillFilmRequest overrides", () => {
  it("theatrical scout rows pass their release date and are not summoned", async () => {
    const { svc } = svcWithRequest({ ...BASE, source: "scout", scout_window: "theatrical", release_date: "2026-10-23" });
    vi.mocked(serviceRoleClient).mockReturnValue(svc as never);
    await fulfillFilmRequest("req-1");
    expect(adminCreateFilm).toHaveBeenCalledWith(expect.objectContaining({ theatrical_release_date: "2026-10-23", summoned: false }));
  });

  it("digital scout rows pass a null release date", async () => {
    const { svc } = svcWithRequest({ ...BASE, source: "scout", scout_window: "digital", release_date: "2026-10-01" });
    vi.mocked(serviceRoleClient).mockReturnValue(svc as never);
    await fulfillFilmRequest("req-1");
    expect(adminCreateFilm).toHaveBeenCalledWith(expect.objectContaining({ theatrical_release_date: null, summoned: false }));
  });

  it("member rows stay summoned with no release date", async () => {
    const { svc } = svcWithRequest({ ...BASE, source: "tmdb", scout_window: null, release_date: null });
    vi.mocked(serviceRoleClient).mockReturnValue(svc as never);
    await fulfillFilmRequest("req-1");
    expect(adminCreateFilm).toHaveBeenCalledWith(expect.objectContaining({ theatrical_release_date: null, summoned: true }));
  });
});

describe("dismissFilmRequest", () => {
  it("requires admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValueOnce(new Error("not admin"));
    await expect(dismissFilmRequest("req-1")).rejects.toThrow("not admin");
    expect(serviceRoleClient).not.toHaveBeenCalled();
  });

  it("marks only a pending request dismissed", async () => {
    const { svc, update, updateEq1, updateEq2 } = svcWithRequest(BASE);
    vi.mocked(serviceRoleClient).mockReturnValue(svc as never);
    expect(await dismissFilmRequest("req-1")).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "dismissed" }));
    expect(updateEq1).toHaveBeenCalledWith("id", "req-1");
    expect(updateEq2).toHaveBeenCalledWith("status", "pending");
  });

  it("returns an error when the update fails", async () => {
    const { svc, updateEq2 } = svcWithRequest(BASE);
    updateEq2.mockResolvedValueOnce({ error: { message: "boom" } });
    vi.mocked(serviceRoleClient).mockReturnValue(svc as never);
    expect(await dismissFilmRequest("req-1")).toEqual({ ok: false, error: "boom" });
  });
});

// ── submitFilmRequest vs the tmdb_id unique index ───────────────────────────

import { submitFilmRequest } from "@/lib/actions/film-requests";
import { lookupTmdb } from "@/lib/search/tmdb";
import { createClient } from "@/lib/supabase/server";

type Op = { table: string; kind: "select" | "insert" | "update"; payload?: unknown; filters: [string, unknown][] };
type Result = { data?: unknown; error?: { message: string; code?: string } | null; count?: number };

// Thenable query-builder fake: records every operation, answers via `answer`.
function fakeSvc(answer: (op: Op) => Result) {
  const ops: Op[] = [];
  const from = (table: string) => {
    const op: Op = { table, kind: "select", filters: [] };
    const b: any = {
      select: () => b,
      insert: (payload: unknown) => { op.kind = "insert"; op.payload = payload; return b; },
      update: (payload: unknown) => { op.kind = "update"; op.payload = payload; return b; },
      eq: (c: string, v: unknown) => { op.filters.push([c, v]); return b; },
      gte: () => b,
      in: () => b,
      maybeSingle: () => b,
      single: () => b,
      then: (res: (r: Result) => unknown, rej: (e: unknown) => unknown) => {
        ops.push(op);
        return Promise.resolve(answer(op)).then(r => ({ data: null, error: null, ...r })).then(res, rej);
      },
    };
    return b;
  };
  return { svc: { from }, ops };
}

const TMDB_FIELDS = {
  itunes_id: null, title: "Clayface", director: "Someone", year: 2026, runtime_min: 0,
  genre_primary: "Horror", description: "", content_advisory: "", artwork_url: "",
  itunes_url: "", tracking: false, available: true, tmdb_id: 1400940,
  theatrical_release_date: "2026-10-23", series_id: null, series_new_name: "", series_order: null,
};
const MEMBER_INPUT = {
  source: "tmdb" as const, tmdb_id: 1400940, itunes_id: null, title: "Clayface", year: 2026,
  needs_itunes_id: true, artwork_url: null, director: null, description: null,
  runtime_min: null, genre_primary: null, content_advisory: null, itunes_url: null,
};

function answerWith(existing: Record<string, unknown> | null, insertError: Result["error"] = null) {
  return (op: Op): Result => {
    if (op.table === "films") return { data: null };
    if (op.table === "film_request_users" && op.kind === "select") {
      return op.filters.some(([c]) => c === "request_id") ? { data: null } : { count: 0 };
    }
    if (op.table === "film_requests" && op.kind === "select") return { data: existing };
    if (op.table === "film_requests" && op.kind === "insert") return insertError ? { error: insertError } : { data: { id: "new-req" } };
    return {};
  };
}

describe("submitFilmRequest against existing tmdb_id rows", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "member-1" } } }) },
    } as never);
    vi.mocked(lookupTmdb).mockResolvedValue({ ok: true, fields: TMDB_FIELDS } as never);
  });

  it("reopens a dismissed scout pick as a member request instead of inserting a duplicate", async () => {
    const { svc, ops } = fakeSvc(answerWith({ id: "scout-req", request_count: 0, status: "dismissed", source: "scout", fulfilled_film_id: null }));
    vi.mocked(serviceRoleClient).mockReturnValue(svc as never);

    const result = await submitFilmRequest(MEMBER_INPUT as never);

    expect(result).toEqual({ status: "already_requested", requestCount: 1 });
    expect(ops.some(o => o.table === "film_requests" && o.kind === "insert")).toBe(false);
    const lookup = ops.find(o => o.table === "film_requests" && o.kind === "select");
    expect(lookup?.filters).toEqual([["tmdb_id", 1400940]]);
    const update = ops.find(o => o.table === "film_requests" && o.kind === "update");
    expect(update?.payload).toMatchObject({ status: "pending", source: "tmdb", request_count: 1 });
  });

  it("converts a pending scout pick into a member request when a member joins it", async () => {
    const { svc, ops } = fakeSvc(answerWith({ id: "scout-req", request_count: 0, status: "pending", source: "scout", fulfilled_film_id: null }));
    vi.mocked(serviceRoleClient).mockReturnValue(svc as never);

    await submitFilmRequest(MEMBER_INPUT as never);

    const update = ops.find(o => o.table === "film_requests" && o.kind === "update");
    expect(update?.payload).toMatchObject({ source: "tmdb", request_count: 1 });
  });

  it("reports a fulfilled request's film as already in the catalog", async () => {
    const { svc } = fakeSvc(answerWith({ id: "old-req", request_count: 2, status: "fulfilled", source: "tmdb", fulfilled_film_id: "film-9" }));
    vi.mocked(serviceRoleClient).mockReturnValue(svc as never);

    expect(await submitFilmRequest(MEMBER_INPUT as never)).toEqual({ status: "already_in_catalog", filmId: "film-9" });
  });

  it("turns a unique-violation race into a friendly message", async () => {
    const { svc } = fakeSvc(answerWith(null, { message: "duplicate key value violates unique constraint", code: "23505" }));
    vi.mocked(serviceRoleClient).mockReturnValue(svc as never);

    expect(await submitFilmRequest(MEMBER_INPUT as never)).toEqual({
      status: "error",
      message: "That film is already in the summoning queue.",
    });
  });
});
