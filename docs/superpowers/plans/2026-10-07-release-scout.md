# Release Scout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekly job finds new horror releases on TMDB and queues them in `/admin/film-requests` for one-tap owner approval.

**Architecture:**
- A pure picker filters raw TMDB discover results.
- A dependency-injected job inserts picks into the existing `film_requests` table as `source='scout'`. A thin adapter binds the job to the Supabase service client.
- The job runs in the Monday block of the maintenance cron and is manually triggerable from the Engine Room.
- The admin queue gains a Scouted section and a Dismiss action. The approve paths take their release date and "summoned" flag from one shared pure helper.

**Tech Stack:** Next.js 15 App Router, TypeScript, supabase-js (service role), vitest, Postgres migrations (pg-mem smoke + testcontainers RLS in CI).

**Spec:** `docs/superpowers/specs/2026-10-07-release-scout-design.md`

## Global Constraints

- Horror only: TMDB `with_genres=27`, `region=US`, `include_adult=false`, `sort_by=popularity.desc`.
- Digital window: `with_release_type=4|5`, `release_date.gte = today − 14d`, `release_date.lte = today`.
- Theatrical window: `with_release_type=2|3`, `release_date.gte = today + 1d`, `release_date.lte = today + 30d`.
- `SCOUT_MAX_AGE_DAYS = 365` (filters on the result's primary `release_date`), `SCOUT_MIN_POPULARITY = 10`, `SCOUT_MAX_PAGES = 10`.
- No auto-add. Scout rows are `status='pending'`, `needs_itunes_id=true`, `request_count=0`.
- Approval rule:
  - `theatrical_release_date = scout_window === 'theatrical' ? release_date : null`;
  - `summoned = source !== 'scout'`.
- Dismissed rows never reappear in the queue and are never re-scouted.
- Migration number is `0225`. Rollout is **migration first, then app deploy**.
- Dates are UTC (`YYYY-MM-DD` from `toISOString().slice(0, 10)`).
- Commit messages are written to a file and committed with `git commit -F <file>`, never with a `-m "$(heredoc)"`. Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run app commands from `app/`, db commands from `db/`.

## Review Focus

1. A TMDB result with no `release_date` or no `poster_path` must not crash or insert garbage. Missing date → dropped; missing poster → `artwork_url: null`. Pinned in Task 2.
2. The same film in both windows in one run must insert one row (theatrical wins). Pinned in Task 2.
3. A pick whose `tmdb_id` already exists as a *fulfilled or dismissed* request must not be re-inserted. Pinned in Task 4 (known IDs come from all statuses).
4. A week with zero qualifying releases (or `total_pages: 0`) must record a successful run with zero inserts, not an error. Pinned in Tasks 3 and 4.
5. A theatrical pick approved *after* its opening day must still carry its release date into `films.theatrical_release_date`. Pinned in Task 6.

---

### Task 1: Migration 0225 + types

**Files:**
- Create: `db/migrations/0225_film_requests_scout.sql`
- Modify: `app/lib/supabase/types.ts` (the `film_requests` Row/Insert/Update blocks, around lines 451–520)

**Interfaces:**
- Produces: columns `film_requests.release_date DATE NULL` and `film_requests.scout_window TEXT NULL CHECK IN ('digital','theatrical')`; `source` also allows `'scout'`; `status` also allows `'dismissed'`; unique partial index on `tmdb_id`.

- [ ] **Step 1: Re-run the duplicate pre-check against prod (read-only)**

Run from `db/`:
```bash
set -a; source .env; set +a; node -e "
const pg=require('pg');(async()=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();
console.log((await c.query('SELECT tmdb_id, count(*) FROM film_requests WHERE tmdb_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1')).rows);
await c.end()})()"
```
Expected: `[]`. If any rows print, STOP and report; the unique index would fail.

- [ ] **Step 2: Write the migration**

`db/migrations/0225_film_requests_scout.sql`:
```sql
-- db/migrations/0225_film_requests_scout.sql
-- Release Scout: weekly TMDB horror discovery queues picks into film_requests.
-- Spec: docs/superpowers/specs/2026-10-07-release-scout-design.md

ALTER TABLE film_requests DROP CONSTRAINT IF EXISTS film_requests_source_check;
ALTER TABLE film_requests ADD CONSTRAINT film_requests_source_check
  CHECK (source IN ('itunes', 'tmdb', 'manual', 'scout'));

ALTER TABLE film_requests DROP CONSTRAINT IF EXISTS film_requests_status_check;
ALTER TABLE film_requests ADD CONSTRAINT film_requests_status_check
  CHECK (status IN ('pending', 'fulfilled', 'dismissed'));

ALTER TABLE film_requests ADD COLUMN IF NOT EXISTS release_date DATE;
ALTER TABLE film_requests ADD COLUMN IF NOT EXISTS scout_window TEXT
  CHECK (scout_window IN ('digital', 'theatrical'));

CREATE UNIQUE INDEX IF NOT EXISTS film_requests_tmdb_id_uniq
  ON film_requests (tmdb_id) WHERE tmdb_id IS NOT NULL;
```

- [ ] **Step 3: Run the pg-mem smoke test**

Run from `db/`: `npm test`
Expected: `Tests  1 passed`. If pg-mem rejects a statement, add a targeted skip in `db/tests/helpers/pg-mem.ts`, following the existing `replace(...)` examples there, and re-run.

- [ ] **Step 4: Update `types.ts` by hand**

In the `film_requests` block, make these edits in **Row**, **Insert** and **Update**:
- `source: "itunes" | "tmdb" | "manual"` → `"itunes" | "tmdb" | "manual" | "scout"`;
- `status ... "pending" | "fulfilled"` → `"pending" | "fulfilled" | "dismissed"`.

Then add, alphabetically:
- **Row:** `release_date: string | null` and `scout_window: "digital" | "theatrical" | null`.
- **Insert and Update:** `release_date?: string | null` and `scout_window?: "digital" | "theatrical" | null`.

- [ ] **Step 5: Typecheck**

Run from `app/`: `npm run typecheck`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0225_film_requests_scout.sql app/lib/supabase/types.ts
git commit -F /tmp/msg.txt   # "feat(db): film_requests scout source, dismissed status, release window"
```

---

### Task 2: Pure picker

**Files:**
- Create: `app/lib/scout/pick.ts`
- Test: `app/tests/scout/pick.test.ts`

**Interfaces:**
- Produces:
```ts
export const SCOUT_MAX_AGE_DAYS = 365;
export const SCOUT_MIN_POPULARITY = 10;
export type ScoutWindow = "digital" | "theatrical";
export interface TmdbDiscoverResult {
  id: number; title?: string; release_date?: string; popularity?: number;
  adult?: boolean; poster_path?: string | null; overview?: string;
}
export interface ScoutPick {
  tmdb_id: number; title: string; year: number; release_date: string;
  window: ScoutWindow; artwork_url: string | null; description: string;
}
export function pickScoutReleases(input: {
  digital: TmdbDiscoverResult[]; theatrical: TmdbDiscoverResult[];
  today: string; knownTmdbIds: Set<number>;
}): ScoutPick[];
```

- [ ] **Step 1: Write the failing tests**

`app/tests/scout/pick.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { pickScoutReleases, SCOUT_MIN_POPULARITY, type TmdbDiscoverResult } from "@/lib/scout/pick";

const TODAY = "2026-10-07";
const r = (over: Partial<TmdbDiscoverResult> & { id: number }): TmdbDiscoverResult => ({
  title: `Film ${over.id}`, release_date: "2026-10-01", popularity: 50,
  adult: false, poster_path: "/p.jpg", overview: "o", ...over,
});
const run = (digital: TmdbDiscoverResult[], theatrical: TmdbDiscoverResult[] = [], known: number[] = []) =>
  pickScoutReleases({ digital, theatrical, today: TODAY, knownTmdbIds: new Set(known) });

describe("pickScoutReleases", () => {
  it("drops re-releases whose primary release date is older than a year", () => {
    const picks = run([
      r({ id: 4488, title: "Friday the 13th", release_date: "1980-05-09" }),
      r({ id: 933260, title: "The Substance", release_date: "2024-10-31" }),
      r({ id: 1291595, title: "Insidious: Out of the Further", release_date: "2026-10-06" }),
    ]);
    expect(picks.map(p => p.tmdb_id)).toEqual([1291595]);
  });

  it("keeps a film exactly 365 days old and drops one 366 days old", () => {
    const picks = run([r({ id: 1, release_date: "2025-10-07" }), r({ id: 2, release_date: "2025-10-06" })]);
    expect(picks.map(p => p.tmdb_id)).toEqual([1]);
  });

  it("keeps popularity exactly at the floor and drops just below it", () => {
    const picks = run([
      r({ id: 1, popularity: SCOUT_MIN_POPULARITY }),
      r({ id: 2, popularity: SCOUT_MIN_POPULARITY - 0.01 }),
      r({ id: 3, popularity: undefined }),
    ]);
    expect(picks.map(p => p.tmdb_id)).toEqual([1]);
  });

  it("drops adult results, results without a release date, and known ids", () => {
    const picks = run([
      r({ id: 1, adult: true }),
      r({ id: 2, release_date: undefined }),
      r({ id: 3, release_date: "" }),
      r({ id: 4 }),
      r({ id: 5 }),
    ], [], [4]);
    expect(picks.map(p => p.tmdb_id)).toEqual([5]);
  });

  it("emits a film present in both windows once, as theatrical", () => {
    const picks = run([r({ id: 7, release_date: "2026-10-01" })], [r({ id: 7, release_date: "2026-10-20" })]);
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ tmdb_id: 7, window: "theatrical", release_date: "2026-10-20" });
  });

  it("maps fields, deriving year and a null poster when missing", () => {
    const [pick] = run([], [r({ id: 9, title: "Clayface", release_date: "2026-10-23", poster_path: null, overview: undefined })]);
    expect(pick).toEqual({
      tmdb_id: 9, title: "Clayface", year: 2026, release_date: "2026-10-23",
      window: "theatrical", artwork_url: null, description: "",
    });
  });

  it("builds artwork urls from the poster path", () => {
    const [pick] = run([r({ id: 10, poster_path: "/abc.jpg" })]);
    expect(pick.artwork_url).toBe("https://image.tmdb.org/t/p/w780/abc.jpg");
  });

  it("drops results without a title", () => {
    expect(run([r({ id: 11, title: "" }), r({ id: 12, title: undefined })])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `app/`: `npx vitest run tests/scout/pick.test.ts`
Expected: FAIL — cannot resolve `@/lib/scout/pick`.

- [ ] **Step 3: Implement**

`app/lib/scout/pick.ts`:
```ts
// Pure selection logic for the weekly Release Scout.
// Spec: docs/superpowers/specs/2026-10-07-release-scout-design.md

export const SCOUT_MAX_AGE_DAYS = 365;
export const SCOUT_MIN_POPULARITY = 10;

const POSTER_BASE = "https://image.tmdb.org/t/p/w780";

export type ScoutWindow = "digital" | "theatrical";

export interface TmdbDiscoverResult {
  id: number;
  title?: string;
  release_date?: string;
  popularity?: number;
  adult?: boolean;
  poster_path?: string | null;
  overview?: string;
}

export interface ScoutPick {
  tmdb_id: number;
  title: string;
  year: number;
  release_date: string;
  window: ScoutWindow;
  artwork_url: string | null;
  description: string;
}

function daysBefore(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function pickScoutReleases(input: {
  digital: TmdbDiscoverResult[];
  theatrical: TmdbDiscoverResult[];
  today: string;
  knownTmdbIds: Set<number>;
}): ScoutPick[] {
  const oldestAllowed = daysBefore(input.today, SCOUT_MAX_AGE_DAYS);
  const picks = new Map<number, ScoutPick>();

  const consider = (result: TmdbDiscoverResult, window: ScoutWindow) => {
    if (result.adult === true) return;
    if (!result.title) return;
    if (!result.release_date || result.release_date < oldestAllowed) return;
    if ((result.popularity ?? 0) < SCOUT_MIN_POPULARITY) return;
    if (input.knownTmdbIds.has(result.id)) return;
    picks.set(result.id, {
      tmdb_id: result.id,
      title: result.title,
      year: Number(result.release_date.slice(0, 4)),
      release_date: result.release_date,
      window,
      artwork_url: result.poster_path ? `${POSTER_BASE}${result.poster_path}` : null,
      description: result.overview ?? "",
    });
  };

  // Theatrical last so it overwrites a digital entry for the same film.
  for (const result of input.digital) consider(result, "digital");
  for (const result of input.theatrical) consider(result, "theatrical");

  return [...picks.values()];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/scout/pick.test.ts`
Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/lib/scout/pick.ts app/tests/scout/pick.test.ts
git commit -F /tmp/msg.txt   # "feat(scout): pure release picker"
```

---

### Task 3: TMDB discover fetcher

**Files:**
- Modify: `app/lib/search/tmdb.ts` (append a new exported function; reuse the existing private `apiKey()` and `TMDB_BASE`)
- Test: `app/tests/search/tmdb-discover.test.ts`

**Interfaces:**
- Consumes: `TmdbDiscoverResult`, `ScoutWindow` from `@/lib/scout/pick` (Task 2).
- Produces:
```ts
export const SCOUT_MAX_PAGES = 10;
export async function discoverHorrorReleases(window: ScoutWindow, today: string):
  Promise<{ ok: true; results: TmdbDiscoverResult[] } | { ok: false; error: string }>;
```

- [ ] **Step 1: Write the failing tests**

`app/tests/search/tmdb-discover.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/search/tmdb-discover.test.ts`
Expected: FAIL — `discoverHorrorReleases` is not exported.

- [ ] **Step 3: Implement (append to `app/lib/search/tmdb.ts`)**

Add `import type { ScoutWindow, TmdbDiscoverResult } from "@/lib/scout/pick";` with the other imports at the top of the file (the file currently has none, so place it as line 1). Then append:
```ts
export const SCOUT_MAX_PAGES = 10;

function shiftDay(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function discoverHorrorReleases(window: ScoutWindow, today: string): Promise<
  | { ok: true; results: TmdbDiscoverResult[] }
  | { ok: false; error: string }
> {
  try {
    const params = new URLSearchParams({
      api_key: apiKey(),
      with_genres: "27",
      region: "US",
      include_adult: "false",
      sort_by: "popularity.desc",
      with_release_type: window === "digital" ? "4|5" : "2|3",
      "release_date.gte": window === "digital" ? shiftDay(today, -14) : shiftDay(today, 1),
      "release_date.lte": window === "digital" ? today : shiftDay(today, 30),
    });

    const results: TmdbDiscoverResult[] = [];
    let pageNum = 1;
    let totalPages = 1;
    do {
      params.set("page", String(pageNum));
      const res = await fetch(`${TMDB_BASE}/discover/movie?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) return { ok: false, error: `TMDB discover returned ${res.status}` };
      const data = await res.json();
      results.push(...((data.results ?? []) as TmdbDiscoverResult[]));
      totalPages = Number(data.total_pages ?? 0);
      pageNum++;
    } while (pageNum <= totalPages && pageNum <= SCOUT_MAX_PAGES);

    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "TMDB discover failed." };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/search/tmdb-discover.test.ts tests/search/tmdb-trailers.test.ts`
Expected: all pass (the trailers suite confirms the module still loads).

- [ ] **Step 5: Commit**

```bash
git add app/lib/search/tmdb.ts app/tests/search/tmdb-discover.test.ts
git commit -F /tmp/msg.txt   # "feat(scout): TMDB horror discover fetcher"
```

---

### Task 4: Scout job + Supabase adapter

**Files:**
- Create: `app/lib/scout/run.ts`
- Test: `app/tests/scout/run.test.ts`

**Interfaces:**
- Consumes: `pickScoutReleases`, `ScoutPick`, `ScoutWindow`, `TmdbDiscoverResult` (Task 2); `discoverHorrorReleases` (Task 3).
- Produces:
```ts
export interface ScoutDeps {
  discover(window: ScoutWindow, today: string): Promise<{ ok: true; results: TmdbDiscoverResult[] } | { ok: false; error: string }>;
  loadKnownTmdbIds(): Promise<Set<number>>;
  insertPick(pick: ScoutPick): Promise<"inserted" | "duplicate">;
}
export interface ScoutStats { fetchedDigital: number; fetchedTheatrical: number; kept: number; inserted: number; skippedKnown: number }
export async function runReleaseScout(deps: ScoutDeps, now: Date): Promise<ScoutStats>;
export function supabaseScoutDeps(svc: SupabaseClient<Database>): ScoutDeps;
export async function runReleaseScoutWithSvc(svc: SupabaseClient<Database>, now?: Date): Promise<ScoutStats>;
```

`skippedKnown` counts both results already known before the run and inserts lost to a unique-violation race.

- [ ] **Step 1: Write the failing tests**

`app/tests/scout/run.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { runReleaseScout, type ScoutDeps } from "@/lib/scout/run";
import type { TmdbDiscoverResult } from "@/lib/scout/pick";

const NOW = new Date("2026-10-07T10:00:00Z");
const film = (id: number, release_date: string, popularity = 50): TmdbDiscoverResult => ({
  id, title: `Film ${id}`, release_date, popularity, adult: false, poster_path: null, overview: "",
});

function deps(over: Partial<ScoutDeps> = {}): ScoutDeps {
  return {
    discover: vi.fn(async (window) => ({
      ok: true as const,
      results: window === "digital" ? [film(1, "2026-10-01"), film(2, "2026-10-02")] : [film(3, "2026-10-20")],
    })),
    loadKnownTmdbIds: vi.fn(async () => new Set([2])),
    insertPick: vi.fn(async () => "inserted" as const),
    ...over,
  };
}

describe("runReleaseScout", () => {
  it("fetches both windows for today's UTC date and inserts unknown picks", async () => {
    const d = deps();
    const stats = await runReleaseScout(d, NOW);
    expect(d.discover).toHaveBeenCalledWith("digital", "2026-10-07");
    expect(d.discover).toHaveBeenCalledWith("theatrical", "2026-10-07");
    expect(vi.mocked(d.insertPick).mock.calls.map(c => [c[0].tmdb_id, c[0].window])).toEqual([[1, "digital"], [3, "theatrical"]]);
    expect(stats).toEqual({ fetchedDigital: 2, fetchedTheatrical: 1, kept: 2, inserted: 2, skippedKnown: 1 });
  });

  it("counts a unique-violation race as skipped, not an error", async () => {
    const d = deps({ insertPick: vi.fn(async (p) => (p.tmdb_id === 3 ? "duplicate" : "inserted")) });
    const stats = await runReleaseScout(d, NOW);
    expect(stats).toMatchObject({ kept: 2, inserted: 1, skippedKnown: 2 });
  });

  it("succeeds with zero inserts on an empty week", async () => {
    const d = deps({ discover: vi.fn(async () => ({ ok: true as const, results: [] })) });
    expect(await runReleaseScout(d, NOW)).toEqual({ fetchedDigital: 0, fetchedTheatrical: 0, kept: 0, inserted: 0, skippedKnown: 0 });
    expect(d.insertPick).not.toHaveBeenCalled();
  });

  it("throws when either TMDB window fails, before inserting anything", async () => {
    const d = deps({
      discover: vi.fn(async (window) =>
        window === "theatrical" ? { ok: false as const, error: "TMDB discover returned 503" } : { ok: true as const, results: [film(1, "2026-10-01")] }),
    });
    await expect(runReleaseScout(d, NOW)).rejects.toThrow("theatrical: TMDB discover returned 503");
    expect(d.insertPick).not.toHaveBeenCalled();
  });

  it("does not re-insert ids known from fulfilled or dismissed requests", async () => {
    const d = deps({ loadKnownTmdbIds: vi.fn(async () => new Set([1, 2, 3])) });
    const stats = await runReleaseScout(d, NOW);
    expect(d.insertPick).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ kept: 0, inserted: 0, skippedKnown: 3 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/scout/run.test.ts`
Expected: FAIL — cannot resolve `@/lib/scout/run`.

- [ ] **Step 3: Implement**

`app/lib/scout/run.ts`:
```ts
// Weekly Release Scout job. Queues new horror releases into film_requests
// (source='scout') for owner approval. The lock is taken by the caller
// (maintenance wrapper or the manual job runner), never here.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { discoverHorrorReleases } from "@/lib/search/tmdb";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { pickScoutReleases, type ScoutPick, type ScoutWindow, type TmdbDiscoverResult } from "@/lib/scout/pick";

export interface ScoutDeps {
  discover(window: ScoutWindow, today: string): Promise<
    { ok: true; results: TmdbDiscoverResult[] } | { ok: false; error: string }
  >;
  loadKnownTmdbIds(): Promise<Set<number>>;
  insertPick(pick: ScoutPick): Promise<"inserted" | "duplicate">;
}

export interface ScoutStats {
  fetchedDigital: number;
  fetchedTheatrical: number;
  kept: number;
  inserted: number;
  skippedKnown: number;
}

export async function runReleaseScout(deps: ScoutDeps, now: Date): Promise<ScoutStats> {
  const today = now.toISOString().slice(0, 10);
  const [digital, theatrical] = await Promise.all([
    deps.discover("digital", today),
    deps.discover("theatrical", today),
  ]);
  if (!digital.ok) throw new Error(`digital: ${digital.error}`);
  if (!theatrical.ok) throw new Error(`theatrical: ${theatrical.error}`);

  const known = await deps.loadKnownTmdbIds();
  const picks = pickScoutReleases({
    digital: digital.results,
    theatrical: theatrical.results,
    today,
    knownTmdbIds: known,
  });

  const uniqueFetched = new Set([...digital.results, ...theatrical.results].map(r => r.id));
  let skippedKnown = [...uniqueFetched].filter(id => known.has(id)).length;
  let inserted = 0;
  for (const pick of picks) {
    if ((await deps.insertPick(pick)) === "inserted") inserted++;
    else skippedKnown++;
  }

  return {
    fetchedDigital: digital.results.length,
    fetchedTheatrical: theatrical.results.length,
    kept: picks.length,
    inserted,
    skippedKnown,
  };
}

const PAGE_SIZE = 1000;

type IdPage = PromiseLike<{ data: { tmdb_id: number | null }[] | null; error: { message: string } | null }>;

async function collectTmdbIds(
  label: string,
  fetchPage: (from: number, to: number) => IdPage,
  into: Set<number>,
): Promise<void> {
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label} tmdb_id load failed: ${error.message}`);
    for (const row of data ?? []) if (row.tmdb_id != null) into.add(Number(row.tmdb_id));
    if (!data || data.length < PAGE_SIZE) return;
  }
}

export function supabaseScoutDeps(svc: SupabaseClient<Database>): ScoutDeps {
  return {
    discover: discoverHorrorReleases,
    async loadKnownTmdbIds() {
      const ids = new Set<number>();
      // Literal table names keep supabase-js row typing intact.
      await collectTmdbIds("films", (from, to) =>
        svc.from("films").select("tmdb_id").not("tmdb_id", "is", null).range(from, to), ids);
      await collectTmdbIds("film_requests", (from, to) =>
        svc.from("film_requests").select("tmdb_id").not("tmdb_id", "is", null).range(from, to), ids);
      return ids;
    },
    async insertPick(pick) {
      const { error } = await svc.from("film_requests").insert({
        source: "scout",
        status: "pending",
        needs_itunes_id: true,
        request_count: 0,
        tmdb_id: pick.tmdb_id,
        title: pick.title,
        year: pick.year,
        release_date: pick.release_date,
        scout_window: pick.window,
        artwork_url: pick.artwork_url,
        description: pick.description,
      });
      if (!error) return "inserted";
      if (error.code === "23505") return "duplicate";
      throw new Error(`film_requests insert failed: ${error.message}`);
    },
  };
}

export async function runReleaseScoutWithSvc(
  svc: SupabaseClient<Database> = serviceRoleClient(),
  now: Date = new Date(),
): Promise<ScoutStats> {
  return runReleaseScout(supabaseScoutDeps(svc), now);
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/scout && npm run typecheck`
Expected: all scout tests pass; typecheck is silent. If the typed `.not("tmdb_id", "is", null)` or the insert payload fails to typecheck, confirm Task 1's `types.ts` edits landed. Do not cast to `any`.

- [ ] **Step 5: Commit**

```bash
git add app/lib/scout/run.ts app/tests/scout/run.test.ts
git commit -F /tmp/msg.txt   # "feat(scout): release scout job and supabase adapter"
```

---

### Task 5: Scheduling and manual trigger

**Files:**
- Modify: `app/app/api/cron/maintenance/route.ts` (import + inside the existing `if (isMonday)` region)
- Modify: `app/lib/cron/job-meta.ts`
- Modify: `app/lib/cron/jobs.ts`
- Test: `app/tests/cron/release-scout-schedule.test.ts`

**Interfaces:**
- Consumes: `runReleaseScoutWithSvc(svc)` (Task 4); `acquireCronLock(sr, key)` (existing, `@/lib/theaters/lock`).
- Produces: `JobKey` gains `"release-scout"`; `jobs.releaseScout` in the maintenance response.

- [ ] **Step 1: Write the failing test**

This is a source-contract test, following the style of `tests/cron/itunes-availability-cadence.test.ts`.

`app/tests/cron/release-scout-schedule.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isJobKey, JOB_META } from "@/lib/cron/job-meta";

describe("release scout scheduling", () => {
  const maintenance = readFileSync("app/api/cron/maintenance/route.ts", "utf8");

  it("runs on Mondays under its own lock in the maintenance cron", () => {
    expect(maintenance).toContain('jobs.releaseScout = await recordedJob("release-scout", async () => {');
    expect(maintenance).toContain('const locked = await acquireCronLock(sr, "release-scout");');
    expect(maintenance).toContain("return runReleaseScoutWithSvc(sr);");
    const mondayBlock = maintenance.slice(maintenance.indexOf("if (isMonday) {"));
    expect(mondayBlock.indexOf("release-scout")).toBeGreaterThan(-1);
  });

  it("is manually triggerable from the Engine Room", () => {
    expect(isJobKey("release-scout")).toBe(true);
    expect(JOB_META["release-scout"]).toEqual({ label: "Release scout", notifies: false });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/cron/release-scout-schedule.test.ts`
Expected: FAIL on both tests.

- [ ] **Step 3: Implement**

`app/lib/cron/job-meta.ts`:
- Add `"release-scout",` as the last entry of `TRIGGERABLE_JOBS`.
- Add `"release-scout": { label: "Release scout", notifies: false },` as the last entry of `JOB_META`.

`app/lib/cron/jobs.ts`:
- Add `import { runReleaseScoutWithSvc } from "@/lib/scout/run";` with the other imports.
- Add this case in `runJobByKey` after `"theater-alerts"`:
```ts
    case "release-scout":
      return runReleaseScoutWithSvc(sr());
```

`app/app/api/cron/maintenance/route.ts`:
- Add `import { runReleaseScoutWithSvc } from "@/lib/scout/run";` with the other imports.
- Replace the existing Monday block:
```ts
    if (isMonday) {
      jobs.refreshShowtimes = await recordedJob("refresh-showtimes", async () => {
        const locked = await acquireCronLock(sr, "refresh-showtimes");
        if (!locked) return { skipped: true, reason: "locked" };
        return runLoftShowtimes(sr);
      });
    } else {
      jobs.refreshShowtimes = { ok: true, skipped: true, reason: "not scheduled today" };
    }
```
with:
```ts
    if (isMonday) {
      jobs.refreshShowtimes = await recordedJob("refresh-showtimes", async () => {
        const locked = await acquireCronLock(sr, "refresh-showtimes");
        if (!locked) return { skipped: true, reason: "locked" };
        return runLoftShowtimes(sr);
      });
      jobs.releaseScout = await recordedJob("release-scout", async () => {
        const locked = await acquireCronLock(sr, "release-scout");
        if (!locked) return { skipped: true, reason: "locked" };
        return runReleaseScoutWithSvc(sr);
      });
    } else {
      jobs.refreshShowtimes = { ok: true, skipped: true, reason: "not scheduled today" };
      jobs.releaseScout = { ok: true, skipped: true, reason: "not scheduled today" };
    }
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/cron && npm run typecheck`
Expected: pass. `JobsSection` renders from `TRIGGERABLE_JOBS`/`JOB_META`, so it needs no edit. Confirm with `grep -n "TRIGGERABLE_JOBS" app/admin/site-settings/JobsSection.tsx`.

- [ ] **Step 5: Commit**

```bash
git add app/app/api/cron/maintenance/route.ts app/lib/cron/job-meta.ts app/lib/cron/jobs.ts app/tests/cron/release-scout-schedule.test.ts
git commit -F /tmp/msg.txt   # "feat(scout): schedule release scout on Mondays and allow manual runs"
```

---

### Task 6: Approval rule, dismiss action, fulfil correction

**Files:**
- Create: `app/lib/scout/approval.ts` (pure; deliberately NOT a `"use server"` file, so both server and client code can import it)
- Modify: `app/lib/actions/film-requests.ts` (`fulfillFilmRequest` + new `dismissFilmRequest`)
- Test: `app/tests/scout/approval.test.ts`, `app/tests/actions/film-requests-scout.test.ts`

**Interfaces:**
- Produces:
```ts
// app/lib/scout/approval.ts
export function requestCreateOverrides(req: {
  source: string; scout_window?: string | null; release_date?: string | null;
}): { theatrical_release_date: string | null; summoned: boolean };

// app/lib/actions/film-requests.ts
export async function dismissFilmRequest(requestId: string): Promise<{ ok: true } | { ok: false; error: string }>;
```

- [ ] **Step 1: Write the failing pure test**

`app/tests/scout/approval.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { requestCreateOverrides } from "@/lib/scout/approval";

describe("requestCreateOverrides", () => {
  it("member requests are summoned and carry no release date", () => {
    expect(requestCreateOverrides({ source: "tmdb", scout_window: null, release_date: null }))
      .toEqual({ theatrical_release_date: null, summoned: true });
  });

  it("theatrical scout picks keep their release date, even after opening day", () => {
    // No clock involved: the stored window decides, so approval date is irrelevant.
    expect(requestCreateOverrides({ source: "scout", scout_window: "theatrical", release_date: "2026-10-23" }))
      .toEqual({ theatrical_release_date: "2026-10-23", summoned: false });
  });

  it("digital scout picks are not summoned and carry no release date", () => {
    expect(requestCreateOverrides({ source: "scout", scout_window: "digital", release_date: "2026-10-01" }))
      .toEqual({ theatrical_release_date: null, summoned: false });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/scout/approval.test.ts`
Expected: FAIL — cannot resolve `@/lib/scout/approval`.

- [ ] **Step 3: Implement the helper**

`app/lib/scout/approval.ts`:
```ts
// How a film_requests row maps onto adminCreateFilm when approved.
// Shared by fulfillFilmRequest (server) and AddFilmClient (client).

export function requestCreateOverrides(req: {
  source: string;
  scout_window?: string | null;
  release_date?: string | null;
}): { theatrical_release_date: string | null; summoned: boolean } {
  return {
    theatrical_release_date: req.scout_window === "theatrical" ? (req.release_date ?? null) : null,
    summoned: req.source !== "scout",
  };
}
```

Run: `npx vitest run tests/scout/approval.test.ts` → `3 passed`.

- [ ] **Step 4: Write the failing action tests**

`app/tests/actions/film-requests-scout.test.ts`:
```ts
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
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run tests/actions/film-requests-scout.test.ts`
Expected: FAIL — `dismissFilmRequest` is not exported; the override assertions fail.

- [ ] **Step 6: Implement in `app/lib/actions/film-requests.ts`**

Add `import { requestCreateOverrides } from "@/lib/scout/approval";` with the imports.

In `fulfillFilmRequest`:
- After the `if (req.status === "fulfilled") …` line, add:
```ts
  if (req.status === "dismissed") return { ok: false, error: "Request was dismissed." };
  const overrides = requestCreateOverrides(req);
```
- In the `adminCreateFilm({...})` call, replace `theatrical_release_date: null,` with `theatrical_release_date: overrides.theatrical_release_date,`, and `summoned: true,` with `summoned: overrides.summoned,`.

Append at the end of the file:
```ts
// ── dismissFilmRequest ───────────────────────────────────────────────────────

export async function dismissFilmRequest(requestId: string): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const svc = serviceRoleClient();

  const { error } = await svc
    .from("film_requests")
    .update({ status: "dismissed", updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/film-requests");
  revalidatePath("/admin");
  return { ok: true };
}
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `npx vitest run tests/actions/film-requests-scout.test.ts tests/actions/film-requests.test.ts tests/scout && npm run typecheck`
Expected: all pass, including the pre-existing film-requests suite.

- [ ] **Step 8: Commit**

```bash
git add app/lib/scout/approval.ts app/lib/actions/film-requests.ts app/tests/scout/approval.test.ts app/tests/actions/film-requests-scout.test.ts
git commit -F /tmp/msg.txt   # "feat(scout): dismiss action and scout-aware approval"
```

---

### Task 7: Admin UI — Scouted section, Dismiss, dashboard count, Review & Add prefill

**Files:**
- Modify: `app/app/admin/film-requests/page.tsx`
- Modify: `app/app/admin/film-requests/FilmRequestActions.tsx`
- Modify: `app/app/admin/page.tsx`
- Modify: `app/app/admin/films/new/AddFilmClient.tsx` (the `request_id` prefill, around lines 44–73)
- Test: `app/tests/ui/release-scout-admin.test.ts`

**Interfaces:**
- Consumes: `dismissFilmRequest` (Task 6), `requestCreateOverrides` (Task 6).

- [ ] **Step 1: Write the failing source-contract test**

`app/tests/ui/release-scout-admin.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/admin/film-requests/page.tsx", "utf8");
const actions = readFileSync("app/admin/film-requests/FilmRequestActions.tsx", "utf8");
const dashboard = readFileSync("app/admin/page.tsx", "utf8");
const addFilm = readFileSync("app/admin/films/new/AddFilmClient.tsx", "utf8");

describe("release scout admin surfaces", () => {
  it("queue renders a Scouted section and hides dismissed rows", () => {
    expect(page).toContain('.eq("source", "scout")');
    expect(page).toContain('.neq("source", "scout")');
    expect(page).toContain('.neq("status", "dismissed")');
    expect(page).toContain("Scouted");
  });

  it("every pending row offers Dismiss", () => {
    expect(actions).toContain("dismissFilmRequest(request.id)");
    expect(actions).toContain(">\n        Dismiss");
  });

  it("dashboard gates itself and shows the waiting scout count", () => {
    expect(dashboard).toContain("checkAdminAccess");
    expect(dashboard).toContain('.eq("source", "scout")');
    expect(dashboard).toContain("scouted");
  });

  it("Review & Add prefills the release date from the shared approval rule", () => {
    expect(addFilm).toContain("requestCreateOverrides(req).theatrical_release_date");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/release-scout-admin.test.ts`
Expected: FAIL on all four tests.

- [ ] **Step 3: `FilmRequestActions.tsx` — add Dismiss to every pending row**

Replace the whole file with:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { dismissFilmRequest, fulfillFilmRequest } from "@/lib/actions/film-requests";

interface Request {
  id: string;
  title: string;
  needs_itunes_id: boolean;
}

export default function FilmRequestActions({ request }: { request: Request }) {
  const router = useRouter();

  async function handleDirectAdd() {
    const res = await fulfillFilmRequest(request.id);
    if (res.ok) {
      router.refresh();
    } else {
      alert(`Failed: ${res.error}`);
    }
  }

  async function handleDismiss() {
    const res = await dismissFilmRequest(request.id);
    if (res.ok) {
      router.refresh();
    } else {
      alert(`Failed: ${res.error}`);
    }
  }

  const dismiss = (
    <button
      className="btn btn-sm btn-outline"
      style={{ fontSize: 12, whiteSpace: "nowrap" }}
      onClick={handleDismiss}
    >
        Dismiss
    </button>
  );

  if (request.needs_itunes_id) {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <a
          href={`/admin/films/new?request_id=${request.id}`}
          className="btn btn-sm btn-outline"
          style={{ fontSize: 12, whiteSpace: "nowrap" }}
        >
          Review & Add
        </a>
        {dismiss}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        className="btn btn-sm"
        style={{ fontSize: 12, whiteSpace: "nowrap" }}
        onClick={handleDirectAdd}
      >
        Add to catalog
      </button>
      {dismiss}
    </div>
  );
}
```
(The `>\n        Dismiss` spacing inside the `dismiss` button is what the contract test matches. Keep it.)

- [ ] **Step 4: `page.tsx` — split the queries and add the Scouted section**

Replace the two `const { data: requests } = …` query lines with:
```ts
  const memberQuery = (svc.from("film_requests") as any)
    .select("*")
    .neq("source", "scout")
    .neq("status", "dismissed");
  const { data: requests } = showFulfilled
    ? await memberQuery.order("request_count", { ascending: false }).order("created_at", { ascending: false })
    : await memberQuery.eq("status", "pending").order("request_count", { ascending: false }).order("created_at", { ascending: false });

  const { data: scouted } = await (svc.from("film_requests") as any)
    .select("*")
    .eq("source", "scout")
    .eq("status", "pending")
    .order("release_date", { ascending: true });
  const scoutRows = scouted ?? [];
```

Then, inside the returned JSX, add this section immediately before the existing list's `{rows.length === 0 && (` block, as a sibling inside the same container:
```tsx
          {scoutRows.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                Scouted · {scoutRows.length} new {scoutRows.length === 1 ? "release" : "releases"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {scoutRows.map((req: any) => (
                  <div
                    key={req.id}
                    style={{
                      display: "flex", gap: 16, alignItems: "flex-start",
                      background: "var(--void-2)", border: "1px solid var(--void-3)", borderRadius: 6, padding: 16,
                    }}
                  >
                    {req.artwork_url ? (
                      <img src={req.artwork_url} alt={req.title} style={{ width: 48, height: 72, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 48, height: 72, background: "#222", borderRadius: 3, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="head" style={{ fontSize: 16 }}>{req.title}</div>
                      <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                        {req.scout_window === "theatrical" ? "In theaters" : "Digital"} · {req.release_date}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <FilmRequestActions request={req as { id: string; title: string; needs_itunes_id: boolean }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
```

- [ ] **Step 5: `app/admin/page.tsx` — the scout count**

The dashboard becomes an async server component. In Next.js a layout and its page render in parallel, so the layout's redirect does not stop this page's query from running. The page therefore gates itself, matching `film-requests/page.tsx`. Add the imports:
```ts
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkAdminAccess } from "@/lib/auth/require-admin";
import { serviceRoleClient } from "@/lib/supabase/service-role";
```
Change `export default function AdminHome() {` to `export default async function AdminHome() {`, and add as the first lines of the body:
```ts
  const access = await checkAdminAccess(await createClient());
  if (access === "not-authed") redirect("/auth/signin");
  if (access === "not-admin") redirect("/home");

  const { count: scoutCount } = await (serviceRoleClient().from("film_requests") as any)
    .select("id", { count: "exact", head: true })
    .eq("source", "scout")
    .eq("status", "pending");
```
Replace the tile-05 line with:
```tsx
        <Tile
          number="05"
          href="/admin/film-requests"
          title="Summoning Queue"
          blurb={scoutCount ? `${scoutCount} scouted ${scoutCount === 1 ? "release" : "releases"} waiting, plus member requests.` : "Review requests for films missing from the catalog."}
        />
```

- [ ] **Step 6: `AddFilmClient.tsx` — prefill the release date**

Add `import { requestCreateOverrides } from "@/lib/scout/approval";` with the imports. In the `request_id` prefill `setInitial({...})`, replace the line `theatrical_release_date: null,` (the one inside the `.then((req: any) => {` block, NOT the module-level default or `prefillFromHit`) with:
```ts
          theatrical_release_date: requestCreateOverrides(req).theatrical_release_date,
```
`/api/admin/film-request` already returns `select("*")`, so `source`, `scout_window` and `release_date` arrive without changing that route.

- [ ] **Step 7: Run the tests, typecheck, build**

Run from `app/`: `npx vitest run tests/ui/release-scout-admin.test.ts && npm run typecheck && npm test`
Expected: the new suite passes, typecheck is silent, and the full suite passes (baseline before this branch: 869 passed / 102 skipped, plus this branch's new tests).

Run: `set -a && source .env.local && set +a && npm run build`
Expected: the build completes.

- [ ] **Step 8: Commit**

```bash
git add app/app/admin/film-requests/page.tsx app/app/admin/film-requests/FilmRequestActions.tsx app/app/admin/page.tsx app/app/admin/films/new/AddFilmClient.tsx app/tests/ui/release-scout-admin.test.ts
git commit -F /tmp/msg.txt   # "feat(scout): Scouted queue section, dismiss, dashboard count"
```

---

### Task 8: Docs, PR, rollout

**Files:**
- Modify: `CLAUDE.md` ("Current state": a new `**Last shipped (YYYY-MM-DD, release scout):**` paragraph at the top of the shipped list; add a "Release Scout — watch four Mondays" open thread)
- Modify: `docs/sub-project-history.md` (append one row, matching the existing column format)
- Modify (local, untracked): `.claude/skills/film-goblin-diagnostics/scripts/cron-health.mjs` — add `"release-scout": 8 * 24, // Monday only` to `JOB_CADENCE_HOURS`

- [ ] **Step 1: Write the docs** described above. The open thread should say: after four Mondays, compare scouted vs fulfilled vs dismissed counts (`SELECT status, count(*) FROM film_requests WHERE source='scout' GROUP BY 1`) to decide on auto-add.

- [ ] **Step 2: Commit, push, open PR**

```bash
git add CLAUDE.md docs/sub-project-history.md
git commit -F /tmp/msg.txt   # "docs: record release scout"
git fetch origin && git rebase origin/master
git push -u origin feature/release-scout
gh pr create --title "feat: weekly release scout for new horror films" --body-file /tmp/pr.md
```
The PR body must state: **rollout order is migration 0225 first, then deploy.** It must end with the `🤖 Generated with [Claude Code](https://claude.com/claude-code)` line.

- [ ] **Step 3: Wait for CI**

Run: `gh pr checks --watch`
Expected: app, db, worker all pass.

- [ ] **Step 4: Rollout (only with the owner's go-ahead)**
  1. Re-run Task 1 Step 1's duplicate check against prod → `[]`.
  2. Apply the migration: from repo root, `set -a; source app/.env.local; set +a; cd db && npm run migrate`.
  3. Verify: `SELECT column_name FROM information_schema.columns WHERE table_name='film_requests' AND column_name IN ('release_date','scout_window')` returns 2 rows.
  4. Merge: `gh pr merge --squash --delete-branch`, then sync master.
  5. Deploy from the repo root: `npx vercel deploy --prod --yes` → READY.
  6. Smoke: `/`, `/films` 200; signed-out `/admin` redirects.
  7. Ask the owner to press **Release scout → Run** in `/admin/site-settings`. Then confirm a `cron_runs` row (`job='release-scout'`, `status='success'`) with stats, and pending `source='scout'` rows in the database.
