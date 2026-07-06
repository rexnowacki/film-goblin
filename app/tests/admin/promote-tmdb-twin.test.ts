import { describe, expect, it, beforeEach, vi } from "vitest";

// promoteTmdbTwin's feed-event emission (now_on_apple) calls serviceRoleClient()
// directly rather than reusing the injected films client — see
// app/lib/admin/promote-tmdb-twin.ts. The production call site in
// app/lib/actions/admin/films.ts passes a user-scoped createClient() (not
// service-role) as the injected client, so the emission legitimately needs its
// own service-role client rather than reusing the injected one. Mock it here
// so the test never makes a live network write against feed_events.
function makeFeedEventsStubClient() {
  return {
    from: (table: string) => {
      if (table !== "feed_events") throw new Error(`unexpected table ${table}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler: any = {
        select: () => handler,
        eq: () => handler,
        gt: () => handler,
        order: () => handler,
        limit: () => handler,
        maybeSingle: async () => ({ data: null, error: null }),
        insert: async () => ({ data: null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
      };
      return handler;
    },
  };
}

vi.mock("@/lib/supabase/service-role", () => ({
  serviceRoleClient: vi.fn(() => makeFeedEventsStubClient()),
}));

import { promoteTmdbTwin, type ItunesGraft } from "@/lib/admin/promote-tmdb-twin";

interface FilmRow {
  id: string;
  tmdb_id: number | null;
  itunes_id: number | null;
  artwork_url: string;
  [key: string]: unknown;
}

const filmsState = new Map<string, FilmRow>();
const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];

function makeStubClient() {
  return {
    from: (table: string) => {
      if (table !== "films") throw new Error(`unexpected table ${table}`);
      const filters: Record<string, { eq?: unknown; is?: unknown }> = {};
      let mode: "select" | "update" = "select";
      let payload: Record<string, unknown> | null = null;
      const handler: any = {
        select: () => handler,
        eq: (col: string, val: unknown) => { filters[col] = { ...filters[col], eq: val }; return handler; },
        is: (col: string, val: unknown) => { filters[col] = { ...filters[col], is: val }; return handler; },
        limit: () => handler,
        update: (p: Record<string, unknown>) => { mode = "update"; payload = p; return handler; },
        maybeSingle: async () => {
          for (const f of filmsState.values()) {
            if (filters.tmdb_id?.eq !== undefined && f.tmdb_id !== filters.tmdb_id.eq) continue;
            if (filters.itunes_id?.is === null && f.itunes_id !== null) continue;
            return { data: f, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: (v: unknown) => void) => {
          if (mode === "update") {
            const id = filters.id?.eq as string;
            const existing = filmsState.get(id);
            if (existing) {
              Object.assign(existing, payload);
              updates.push({ id, payload: payload! });
            }
          }
          resolve({ data: null, error: null });
        },
      };
      return handler;
    },
  };
}

const graft = (over: Partial<ItunesGraft> = {}): ItunesGraft => ({
  itunes_id: 1895945921,
  itunes_url: "https://itunes.apple.com/us/movie/obsession-2026/id1895945921?uo=4",
  tracking: true,
  available: true,
  artwork_url: "https://example.com/new600.jpg",
  ...over,
});

describe("promoteTmdbTwin", () => {
  beforeEach(() => {
    filmsState.clear();
    updates.length = 0;
  });

  it("returns null when tmdb_id is null", async () => {
    const id = await promoteTmdbTwin(makeStubClient(), null, graft());
    expect(id).toBe(null);
    expect(updates).toHaveLength(0);
  });

  it("returns null when no TMDB-only twin exists", async () => {
    filmsState.set("other", { id: "other", tmdb_id: 999, itunes_id: null, artwork_url: "" });
    const id = await promoteTmdbTwin(makeStubClient(), 1339713, graft());
    expect(id).toBe(null);
    expect(updates).toHaveLength(0);
  });

  it("ignores films that already carry an iTunes identity", async () => {
    filmsState.set("tracked", { id: "tracked", tmdb_id: 1339713, itunes_id: 42, artwork_url: "" });
    const id = await promoteTmdbTwin(makeStubClient(), 1339713, graft());
    expect(id).toBe(null);
  });

  it("grafts the iTunes identity onto an existing TMDB-only twin", async () => {
    filmsState.set("twin", { id: "twin", tmdb_id: 1339713, itunes_id: null, artwork_url: "https://example.com/existing.jpg" });
    const id = await promoteTmdbTwin(makeStubClient(), 1339713, graft());
    expect(id).toBe("twin");
    const f = filmsState.get("twin")!;
    expect(f.itunes_id).toBe(1895945921);
    expect(f.tracking).toBe(true);
    expect(f.available).toBe(true);
    // Existing artwork is kept — the TMDB row is the curated one.
    expect(f.artwork_url).toBe("https://example.com/existing.jpg");
  });

  it("backfills artwork when the twin has none", async () => {
    filmsState.set("twin", { id: "twin", tmdb_id: 1339713, itunes_id: null, artwork_url: "" });
    await promoteTmdbTwin(makeStubClient(), 1339713, graft());
    expect(filmsState.get("twin")!.artwork_url).toBe("https://example.com/new600.jpg");
  });
});
