import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { runItunesAvailabilityCheck } from "@/lib/itunes-availability/check";

const today = new Date();
const isoDate = (offsetDays: number) =>
  new Date(today.getTime() + offsetDays * 86400 * 1000).toISOString().slice(0, 10);

const FILM_AUTO = {
  id: "f-auto",
  title: "The Substance",
  year: 2024,
  director: "Coralie Fargeat",
  theatrical_release_date: isoDate(-90),
};
const FILM_QUEUE = {
  id: "f-queue",
  title: "Hereditary",
  year: 2018,
  director: "Ari Aster",
  theatrical_release_date: isoDate(-60),
};
const FILM_NULL = {
  id: "f-null",
  title: "Some Obscure Title That Won't Match",
  year: 2024,
  director: "Nobody",
  theatrical_release_date: isoDate(-50),
};

// FILM_AUTO: exact title + exact year + director → score 1.0 → auto-promote
// FILM_QUEUE: "Hereditary." normalizes to "hereditary" == "hereditary" → normalized title
//             + exact year + director → score 0.8 → queue (0.45 ≤ 0.8 < 0.85)
// FILM_NULL: no iTunes result → candidates.length === 0 → belowThreshold
const ITUNES_RESPONSES: Record<string, unknown> = {
  "The Substance": {
    resultCount: 1,
    results: [{
      trackId: 111,
      trackName: "The Substance",
      releaseDate: "2024-09-20T07:00:00Z",
      artistName: "Coralie Fargeat",
      trackViewUrl: "https://itunes.apple.com/us/movie/the-substance/id111",
      artworkUrl100: "https://example.com/100x100bb.jpg",
    }],
  },
  "Hereditary": {
    resultCount: 1,
    results: [{
      trackId: 222,
      // Trailing period normalizes to "hereditary" — exact-title check fails but
      // fullyNormalize strips punctuation, giving a normalized-title match.
      trackName: "Hereditary.",
      releaseDate: "2018-06-08T07:00:00Z",
      artistName: "Ari Aster",
      trackViewUrl: "https://itunes.apple.com/us/movie/hereditary/id222",
      artworkUrl100: "https://example.com/her100.jpg",
    }],
  },
};

const films = [FILM_AUTO, FILM_QUEUE, FILM_NULL];
const filmsState = new Map(films.map(f => [f.id, { ...f, last_itunes_check_at: null, itunes_id: null, tracking: false, available: true, artwork_url: "" }]));
const candidateInserts: any[] = [];
const filmUpdates: any[] = [];

function makeStubClient() {
  const client: any = {
    from: (table: string) => {
      if (table === "films") {
        let filters: any = {};
        let mode: "select" | "update" = "select";
        let payload: any = null;
        const handler = {
          select: (_cols: string) => handler,
          is: (col: string, val: any) => { filters[col] = { is: val }; return handler; },
          eq: (col: string, val: any) => { filters[col] = { eq: val }; return handler; },
          gte: (col: string, val: any) => { filters[col] = { gte: val }; return handler; },
          lte: (col: string, val: any) => { filters[col] = { lte: val }; return handler; },
          in: (col: string, vals: any[]) => { filters[col] = { in: vals }; return handler; },
          or: () => handler,
          order: () => handler,
          limit: () => handler,
          single: async () => {
            const id = filters.id?.eq;
            const f = filmsState.get(id);
            return { data: f ?? null, error: f ? null : { message: "not found" } };
          },
          update: (p: any) => { mode = "update"; payload = p; return handler; },
          then: (resolve: any) => {
            // For select queries, return matching films
            if (mode === "select") {
              const out: any[] = [];
              for (const f of filmsState.values()) {
                let ok = true;
                if (filters.itunes_id?.is === null && f.itunes_id !== null) ok = false;
                if (filters.tracking?.eq === false && f.tracking !== false) ok = false;
                if (filters.theatrical_release_date?.gte && (f.theatrical_release_date == null || f.theatrical_release_date < filters.theatrical_release_date.gte)) ok = false;
                if (filters.theatrical_release_date?.lte && (f.theatrical_release_date == null || f.theatrical_release_date > filters.theatrical_release_date.lte)) ok = false;
                if (filters.theatrical_release_date?.is === null && f.theatrical_release_date != null) ok = false;
                if (ok) out.push(f);
              }
              resolve({ data: out, error: null });
            } else {
              const id = filters.id?.eq;
              const existing = filmsState.get(id);
              if (existing && (filters.itunes_id?.is === null ? existing.itunes_id == null : true)) {
                Object.assign(existing, payload);
                filmUpdates.push({ id, ...payload });
              }
              resolve({ data: null, error: null });
            }
          },
        };
        return handler;
      }
      if (table === "itunes_candidates") {
        let filters: any = {};
        let mode: "select" | "delete" | "insert" = "select";
        let payload: any = null;
        const handler = {
          select: () => handler,
          eq: (col: string, val: any) => { filters[col] = val; return handler; },
          in: () => handler,
          gte: () => handler,
          delete: () => { mode = "delete"; return handler; },
          insert: (p: any) => { mode = "insert"; payload = p; return handler; },
          then: (resolve: any) => {
            if (mode === "select") resolve({ data: [], error: null });
            else if (mode === "delete") resolve({ data: null, error: null });
            else if (mode === "insert") {
              candidateInserts.push(payload);
              resolve({ data: null, error: null });
            }
          },
        };
        return handler;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return client;
}

describe("runItunesAvailabilityCheck", () => {
  beforeEach(() => {
    filmsState.clear();
    for (const f of films) {
      filmsState.set(f.id, { ...f, last_itunes_check_at: null, itunes_id: null, tracking: false, available: true, artwork_url: "" });
    }
    candidateInserts.length = 0;
    filmUpdates.length = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const u = new URL(url.toString());
      const term = u.searchParams.get("term") ?? "";
      const body = ITUNES_RESPONSES[term] ?? { resultCount: 0, results: [] };
      return new Response(JSON.stringify(body), { status: 200 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-promotes high-confidence matches and queues fuzzy ones", async () => {
    const client = makeStubClient();
    const summary = await runItunesAvailabilityCheck(client);

    expect(summary.autoPromoted).toBe(1);
    expect(summary.queued).toBe(1);
    expect(summary.belowThreshold).toBe(1);

    // Auto: itunes_id was set on FILM_AUTO
    expect(filmsState.get("f-auto")!.itunes_id).toBe(111);
    expect(filmsState.get("f-auto")!.tracking).toBe(true);

    // Queue: candidate row written for FILM_QUEUE
    expect(candidateInserts.some(c => c.film_id === "f-queue")).toBe(true);

    // Null: no candidate row, no auto-promote, but still touched
    expect(filmsState.get("f-null")!.itunes_id).toBe(null);
  });

  it("touches last_itunes_check_at for every considered film", async () => {
    const client = makeStubClient();
    await runItunesAvailabilityCheck(client);
    for (const f of filmsState.values()) {
      expect(f.last_itunes_check_at).not.toBe(null);
    }
  });
});
