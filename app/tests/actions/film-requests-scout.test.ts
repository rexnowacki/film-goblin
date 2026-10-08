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
