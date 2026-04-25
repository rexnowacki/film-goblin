# Watchlist Page (The Scroll) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/watchlist` — an authenticated editorial list of the user's tracked films with drop-first default sort, inline threshold editor, "▼ DROP" visual signal, and zine-voice empty state.

**Architecture:** New authenticated route under `app/app/watchlist/`. Pure sort function in `app/lib/queries/sort-watchlist.ts`. New query `getMyWatchlistWithFilms` joining `watchlists` to `films_with_stats`. New action `setWatchlistThreshold` filling the previously-unused `max_price_usd` field. Middleware gains `/watchlist` to its protected matcher. Top nav gains a `Watchlist` link. Reuses existing zine design tokens; no new deps.

**Tech Stack:** Next.js 15 App Router, Supabase SSR, Vitest (existing config), `vi.mock` + `vi.spyOn` test pattern (no MSW — mirrors `tests/admin/apple-tv-search.test.ts`). No new dependencies.

**Prerequisites:**
- Node 20 required. Prefix `npm`/`tsx`/`node` one-shots with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`.
- Commits via `/tmp/msg.txt` + `git commit -F` (heredocs mangle messages in this env — see CLAUDE.md Gotchas).
- Spec at `docs/superpowers/specs/2026-04-24-watchlist-page-design.md` is the canonical reference.
- Baseline: `/films`, `/admin/films/new`, and `/admin/films/[id]/edit` are precedents for colocated page-specific components. `app/app/films/FilmsSortSelect.tsx` is the template for `WatchlistSortSelect`.

---

## Task 1: `sortWatchlist` pure function (TDD)

**Files:**
- Create: `app/lib/queries/sort-watchlist.ts`
- Create: `app/tests/queries/sort-watchlist.test.ts` (also creates the `tests/queries/` subdirectory)

No dependencies on other new files. Pure in, pure out. Good warm-up.

- [ ] **Step 1: Write the failing tests**

Create `app/tests/queries/sort-watchlist.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sortWatchlist, computeDropPct, type WatchlistSort } from "@/lib/queries/sort-watchlist";
import type { WatchlistRowData } from "@/lib/queries/watchlists";

function row(overrides: Partial<WatchlistRowData> & { id: string; title?: string; latest_price?: number | null; max_price_usd?: number | null; created_at?: string }): WatchlistRowData {
  return {
    id: overrides.id,
    film_id: overrides.id + "-film",
    max_price_usd: overrides.max_price_usd ?? null,
    last_alerted_at: null,
    created_at: overrides.created_at ?? "2026-04-20T00:00:00Z",
    film: {
      id: overrides.id + "-film",
      title: overrides.title ?? `Film ${overrides.id}`,
      director: "Dir",
      year: 2020,
      artwork_url: "",
      itunes_url: null,
      genre_primary: "Horror",
      runtime_min: 100,
      latest_price: overrides.latest_price ?? null,
    },
  };
}

describe("computeDropPct", () => {
  it("returns null when max_price_usd is null", () => {
    expect(computeDropPct(row({ id: "a", latest_price: 5, max_price_usd: null }))).toBeNull();
  });
  it("returns null when latest_price is null", () => {
    expect(computeDropPct(row({ id: "a", latest_price: null, max_price_usd: 10 }))).toBeNull();
  });
  it("returns null when latest_price > max_price_usd (not dropped)", () => {
    expect(computeDropPct(row({ id: "a", latest_price: 12, max_price_usd: 10 }))).toBeNull();
  });
  it("returns 0 when latest_price equals max_price_usd (borderline dropped)", () => {
    expect(computeDropPct(row({ id: "a", latest_price: 10, max_price_usd: 10 }))).toBe(0);
  });
  it("returns positive fraction when latest_price < max_price_usd", () => {
    expect(computeDropPct(row({ id: "a", latest_price: 5, max_price_usd: 10 }))).toBe(0.5);
  });
});

describe("sortWatchlist", () => {
  it("drop sort: dropped rows first ordered by % drop DESC, rest in recency order", () => {
    const rows: WatchlistRowData[] = [
      row({ id: "a", latest_price: 8, max_price_usd: 10, created_at: "2026-04-01T00:00:00Z" }), // dropped 20%
      row({ id: "b", latest_price: 15, max_price_usd: 10, created_at: "2026-04-02T00:00:00Z" }), // not dropped
      row({ id: "c", latest_price: 2, max_price_usd: 10, created_at: "2026-04-03T00:00:00Z" }), // dropped 80%
      row({ id: "d", latest_price: 20, max_price_usd: null, created_at: "2026-04-04T00:00:00Z" }), // no threshold
    ];
    const sorted = sortWatchlist(rows, "drop");
    expect(sorted.map(r => r.id)).toEqual(["c", "a", "d", "b"]);
  });

  it("recency sort: newest created_at first", () => {
    const rows: WatchlistRowData[] = [
      row({ id: "a", created_at: "2026-04-01T00:00:00Z" }),
      row({ id: "b", created_at: "2026-04-03T00:00:00Z" }),
      row({ id: "c", created_at: "2026-04-02T00:00:00Z" }),
    ];
    expect(sortWatchlist(rows, "recency").map(r => r.id)).toEqual(["b", "c", "a"]);
  });

  it("price-low sort: cheapest first, nulls last", () => {
    const rows: WatchlistRowData[] = [
      row({ id: "a", latest_price: 10 }),
      row({ id: "b", latest_price: null }),
      row({ id: "c", latest_price: 5 }),
      row({ id: "d", latest_price: 8 }),
    ];
    expect(sortWatchlist(rows, "price-low").map(r => r.id)).toEqual(["c", "d", "a", "b"]);
  });

  it("alphabetical sort: A-Z by title", () => {
    const rows: WatchlistRowData[] = [
      row({ id: "1", title: "Midsommar" }),
      row({ id: "2", title: "Annihilation" }),
      row({ id: "3", title: "Suspiria" }),
    ];
    expect(sortWatchlist(rows, "alphabetical").map(r => r.film.title)).toEqual(["Annihilation", "Midsommar", "Suspiria"]);
  });

  it("drop sort: rows with null max_price_usd never appear in the dropped block", () => {
    const rows: WatchlistRowData[] = [
      row({ id: "a", latest_price: 5, max_price_usd: null, created_at: "2026-04-02T00:00:00Z" }),
      row({ id: "b", latest_price: 5, max_price_usd: 10, created_at: "2026-04-01T00:00:00Z" }),
    ];
    expect(sortWatchlist(rows, "drop").map(r => r.id)).toEqual(["b", "a"]);
  });

  it("drop sort: rows with null latest_price never appear in the dropped block", () => {
    const rows: WatchlistRowData[] = [
      row({ id: "a", latest_price: null, max_price_usd: 10, created_at: "2026-04-02T00:00:00Z" }),
      row({ id: "b", latest_price: 5, max_price_usd: 10, created_at: "2026-04-01T00:00:00Z" }),
    ];
    expect(sortWatchlist(rows, "drop").map(r => r.id)).toEqual(["b", "a"]);
  });
});
```

Note: this test imports `WatchlistRowData` from `@/lib/queries/watchlists`. That type doesn't exist yet — it's added in Task 2. That's intentional for TDD ordering; the test will fail at module resolution, which is the RED state we want.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/sort-watchlist.test.ts`
Expected: FAIL — `Cannot find module '@/lib/queries/sort-watchlist'` (and `@/lib/queries/watchlists` may fail on the WatchlistRowData import; that's fine — we'll create the type next).

- [ ] **Step 3: Temporarily inline the `WatchlistRowData` shape for Task 1 to stay self-contained**

Edit the test file: replace the `import type { WatchlistRowData } from "@/lib/queries/watchlists";` line with a local type declaration above `function row(...)`:

```ts
// Task 2 moves this type to @/lib/queries/watchlists and imports it properly.
interface WatchlistRowData {
  id: string;
  film_id: string;
  max_price_usd: number | null;
  last_alerted_at: string | null;
  created_at: string;
  film: {
    id: string;
    title: string;
    director: string;
    year: number;
    artwork_url: string;
    itunes_url: string | null;
    genre_primary: string;
    runtime_min: number;
    latest_price: number | null;
  };
}
```

This keeps Task 1 independently runnable. Task 2 will replace this local declaration with the real import.

- [ ] **Step 4: Create the sort function**

Create `app/lib/queries/sort-watchlist.ts`:

```ts
import type { WatchlistRowData } from "./watchlists";

export type WatchlistSort = "drop" | "recency" | "price-low" | "alphabetical";

export function computeDropPct(r: WatchlistRowData): number | null {
  if (r.max_price_usd == null || r.film.latest_price == null) return null;
  if (r.film.latest_price > r.max_price_usd) return null;
  return (r.max_price_usd - r.film.latest_price) / r.max_price_usd;
}

export function sortWatchlist(rows: WatchlistRowData[], sort: WatchlistSort): WatchlistRowData[] {
  switch (sort) {
    case "drop": {
      const dropped: Array<[WatchlistRowData, number]> = [];
      const rest: WatchlistRowData[] = [];
      for (const r of rows) {
        const pct = computeDropPct(r);
        if (pct != null) dropped.push([r, pct]);
        else rest.push(r);
      }
      dropped.sort((a, b) => b[1] - a[1]);
      rest.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return [...dropped.map(([r]) => r), ...rest];
    }
    case "recency":
      return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "price-low":
      return [...rows].sort((a, b) => {
        const pa = a.film.latest_price, pb = b.film.latest_price;
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pa - pb;
      });
    case "alphabetical":
      return [...rows].sort((a, b) => a.film.title.localeCompare(b.film.title));
  }
}
```

Note: `sort-watchlist.ts` imports `WatchlistRowData` from `./watchlists`. That type gets added to `watchlists.ts` in Task 2. For Task 1, the import will fail at typecheck (but the test still runs because the types compile away and the test file has a local copy of the type).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/sort-watchlist.test.ts`
Expected: PASS — 11 tests total (5 computeDropPct + 6 sortWatchlist).

- [ ] **Step 6: Typecheck will still fail on the sort-watchlist.ts import of WatchlistRowData — this is expected and resolved in Task 2**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | grep -v "watchlists" | tail -5`
Expected: clean ignoring the known watchlists-related typecheck error. Task 2 fixes this.

- [ ] **Step 7: Commit**

Write `/tmp/msg.txt`:

```
feat(watchlist): pure sort function + tests

Introduces app/lib/queries/sort-watchlist.ts with sortWatchlist
+ computeDropPct. Supports the four sort modes for /watchlist:
drop (default: % drop DESC, then recency), recency, price-low
(nulls last), and alphabetical.

11 tests, all hermetic. WatchlistRowData type temporarily
inlined in the test file; Task 2 wires up the real import from
lib/queries/watchlists.
```

Then:

```bash
git add app/lib/queries/sort-watchlist.ts app/tests/queries/sort-watchlist.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 2: `getMyWatchlistWithFilms` query + numeric-coercion test

**Files:**
- Modify: `app/lib/queries/watchlists.ts`
- Create: `app/tests/queries/watchlists.test.ts`
- Modify: `app/tests/queries/sort-watchlist.test.ts` (replace local type with real import)

Adds the type and query, then fixes up the Task 1 test to use the real type.

- [ ] **Step 1: Write the failing coercion test**

Create `app/tests/queries/watchlists.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { getMyWatchlistWithFilms } from "@/lib/queries/watchlists";

function makeClient(rows: any[]) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    }),
  } as any;
}

describe("getMyWatchlistWithFilms", () => {
  it("coerces NUMERIC fields (max_price_usd, latest_price) from string to number", async () => {
    const client = makeClient([
      {
        id: "w1",
        film_id: "f1",
        max_price_usd: "9.99",
        last_alerted_at: null,
        created_at: "2026-04-20T00:00:00Z",
        film: {
          id: "f1",
          title: "Midsommar",
          director: "Ari Aster",
          year: 2019,
          artwork_url: "https://example.com/a.jpg",
          itunes_url: "https://itunes.apple.com/us/movie/id1",
          genre_primary: "Horror",
          runtime_min: 147,
          latest_price: "14.99",
        },
      },
    ]);
    const rows = await getMyWatchlistWithFilms(client);
    expect(rows).toHaveLength(1);
    expect(typeof rows[0].max_price_usd).toBe("number");
    expect(rows[0].max_price_usd).toBe(9.99);
    expect(typeof rows[0].film.latest_price).toBe("number");
    expect(rows[0].film.latest_price).toBe(14.99);
  });

  it("returns null for missing NUMERIC fields (not NaN)", async () => {
    const client = makeClient([
      {
        id: "w1",
        film_id: "f1",
        max_price_usd: null,
        last_alerted_at: null,
        created_at: "2026-04-20T00:00:00Z",
        film: {
          id: "f1",
          title: "Midsommar",
          director: "Ari Aster",
          year: 2019,
          artwork_url: "",
          itunes_url: null,
          genre_primary: "Horror",
          runtime_min: 147,
          latest_price: null,
        },
      },
    ]);
    const rows = await getMyWatchlistWithFilms(client);
    expect(rows[0].max_price_usd).toBeNull();
    expect(rows[0].film.latest_price).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/watchlists.test.ts`
Expected: FAIL — `getMyWatchlistWithFilms` isn't exported yet.

- [ ] **Step 3: Extend `app/lib/queries/watchlists.ts`**

Replace the contents of `app/lib/queries/watchlists.ts` with:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export interface WatchlistRowData {
  id: string;
  film_id: string;
  max_price_usd: number | null;
  last_alerted_at: string | null;
  created_at: string;
  film: {
    id: string;
    title: string;
    director: string;
    year: number;
    artwork_url: string;
    itunes_url: string | null;
    genre_primary: string;
    runtime_min: number;
    latest_price: number | null;
  };
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function getMyWatchlist(client: Client) {
  const { data, error } = await client
    .from("watchlists")
    .select("id, film_id, max_price_usd, last_alerted_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function isOnWatchlist(client: Client, filmId: string): Promise<boolean> {
  const { data, error } = await client
    .from("watchlists")
    .select("id")
    .eq("film_id", filmId)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

export async function getMyWatchlistWithFilms(client: Client): Promise<WatchlistRowData[]> {
  const { data, error } = await client
    .from("watchlists")
    .select(`
      id, film_id, max_price_usd, last_alerted_at, created_at,
      film:films_with_stats!inner(
        id, title, director, year,
        artwork_url, itunes_url,
        genre_primary, runtime_min,
        latest_price
      )
    `)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    film_id: r.film_id,
    max_price_usd: toNumber(r.max_price_usd),
    last_alerted_at: r.last_alerted_at,
    created_at: r.created_at,
    film: {
      id: r.film.id,
      title: r.film.title,
      director: r.film.director,
      year: r.film.year,
      artwork_url: r.film.artwork_url,
      itunes_url: r.film.itunes_url,
      genre_primary: r.film.genre_primary,
      runtime_min: r.film.runtime_min,
      latest_price: toNumber(r.film.latest_price),
    },
  }));
}
```

- [ ] **Step 4: Replace the inline type in the Task 1 test with a real import**

In `app/tests/queries/sort-watchlist.test.ts`, delete the local `interface WatchlistRowData { ... }` block added in Task 1 Step 3, and add at the top of the imports:

```ts
import type { WatchlistRowData } from "@/lib/queries/watchlists";
```

- [ ] **Step 5: Run both test files to verify they pass**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/`
Expected: PASS — 13 tests total (11 sort + 2 coercion).

- [ ] **Step 6: Run typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

Write `/tmp/msg.txt`:

```
feat(watchlist): getMyWatchlistWithFilms query + coercion

Extends lib/queries/watchlists.ts with
getMyWatchlistWithFilms(client), a single-query helper that
joins watchlists to the films_with_stats view and returns
WatchlistRowData rows. NUMERIC fields (max_price_usd,
film.latest_price) are coerced to number|null at the query
boundary per the Supabase-numeric-as-string convention.

Replaces the Task-1 inline WatchlistRowData declaration in
sort-watchlist.test.ts with the real import.
```

Then:

```bash
git add app/lib/queries/watchlists.ts app/tests/queries/watchlists.test.ts app/tests/queries/sort-watchlist.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 3: `setWatchlistThreshold` action + 5 tests + revalidate updates

**Files:**
- Modify: `app/lib/actions/watchlists.ts`
- Modify: `app/tests/actions/watchlists.test.ts`

Adds the new action and fixes the two existing actions' revalidation.

- [ ] **Step 1: Read the existing `app/tests/actions/watchlists.test.ts` to find the test-client helpers**

Run: `cat app/tests/actions/watchlists.test.ts` — note the shape of the mocked Supabase client and any helper functions. The new tests will follow the same pattern.

- [ ] **Step 2: Write the failing tests**

Append these 5 tests to `app/tests/actions/watchlists.test.ts` inside a new `describe("_setWatchlistThreshold", ...)` block. The existing file already imports `_addToWatchlist` / `_removeFromWatchlist` — add `_setWatchlistThreshold` to that import and use the same mock client helpers. Exact shape:

```ts
  describe("_setWatchlistThreshold", () => {
    it("updates max_price_usd when user is authenticated and value is valid", async () => {
      const client = makeAuthedClient("user-a");
      client.__seedWatchlistRow({ user_id: "user-a", film_id: "film-1", max_price_usd: null });
      await _setWatchlistThreshold(client as any, "film-1", 9.99);
      expect(client.__getWatchlistRow("user-a", "film-1")?.max_price_usd).toBe(9.99);
    });

    it("clears max_price_usd when passed null", async () => {
      const client = makeAuthedClient("user-a");
      client.__seedWatchlistRow({ user_id: "user-a", film_id: "film-1", max_price_usd: 12 });
      await _setWatchlistThreshold(client as any, "film-1", null);
      expect(client.__getWatchlistRow("user-a", "film-1")?.max_price_usd).toBeNull();
    });

    it("throws 'invalid threshold' for values outside (0, 1000] or non-finite", async () => {
      const client = makeAuthedClient("user-a");
      client.__seedWatchlistRow({ user_id: "user-a", film_id: "film-1", max_price_usd: 5 });
      for (const bad of [0, -1, 1001, NaN, Infinity, -Infinity]) {
        await expect(_setWatchlistThreshold(client as any, "film-1", bad as number))
          .rejects.toThrow("invalid threshold");
      }
      // unchanged
      expect(client.__getWatchlistRow("user-a", "film-1")?.max_price_usd).toBe(5);
    });

    it("throws 'unauthenticated' when no user session", async () => {
      const client = makeUnauthedClient();
      await expect(_setWatchlistThreshold(client as any, "film-1", 9.99))
        .rejects.toThrow("unauthenticated");
    });

    it("does not touch another user's row (RLS scoping via user_id filter)", async () => {
      const client = makeAuthedClient("user-b");
      // Seed userA's row; only userA should be able to edit it.
      client.__seedWatchlistRow({ user_id: "user-a", film_id: "film-1", max_price_usd: 5 });
      await _setWatchlistThreshold(client as any, "film-1", 99);
      expect(client.__getWatchlistRow("user-a", "film-1")?.max_price_usd).toBe(5);
    });
  });
```

**If `makeAuthedClient` / `makeUnauthedClient` / `__seedWatchlistRow` / `__getWatchlistRow` helpers don't exist in the current test file**: the existing file uses some form of mocked Supabase client. Read the current tests carefully and adapt the new tests to match that mock pattern. Exact helper names may differ; the test cases' intent is what matters — happy path, null clear, 6 invalid values (parameterized), unauthed rejection, cross-user no-op.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/watchlists.test.ts`
Expected: FAIL — `_setWatchlistThreshold` not exported.

- [ ] **Step 4: Extend `app/lib/actions/watchlists.ts` — add the new action + patch the two existing `revalidatePath` calls**

Replace the entire file `app/lib/actions/watchlists.ts` with:

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function _addToWatchlist(
  client: Client,
  filmId: string,
  maxPriceUsd?: number
): Promise<{ id: string }> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");
  const { data, error } = await client
    .from("watchlists")
    .insert({
      user_id: user.id,
      film_id: filmId,
      max_price_usd: maxPriceUsd ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id };
}

export async function _removeFromWatchlist(
  client: Client,
  filmId: string
): Promise<void> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");
  const { error } = await client
    .from("watchlists")
    .delete()
    .eq("user_id", user.id)
    .eq("film_id", filmId);
  if (error) throw error;
}

export async function _setWatchlistThreshold(
  client: Client,
  filmId: string,
  maxPriceUsd: number | null
): Promise<void> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");
  if (maxPriceUsd != null) {
    if (!Number.isFinite(maxPriceUsd) || maxPriceUsd <= 0 || maxPriceUsd > 1000) {
      throw new Error("invalid threshold");
    }
  }
  const { error } = await client
    .from("watchlists")
    .update({ max_price_usd: maxPriceUsd })
    .eq("user_id", user.id)
    .eq("film_id", filmId);
  if (error) throw error;
}

export async function addToWatchlist(filmId: string, maxPriceUsd?: number) {
  const supabase = await createClient();
  const result = await _addToWatchlist(supabase, filmId, maxPriceUsd);
  revalidatePath("/home");
  revalidatePath("/watchlist");
  revalidatePath(`/film/${filmId}`);
  return result;
}

export async function removeFromWatchlist(filmId: string) {
  const supabase = await createClient();
  await _removeFromWatchlist(supabase, filmId);
  revalidatePath("/home");
  revalidatePath("/watchlist");
  revalidatePath(`/film/${filmId}`);
}

export async function setWatchlistThreshold(filmId: string, maxPriceUsd: number | null) {
  const supabase = await createClient();
  await _setWatchlistThreshold(supabase, filmId, maxPriceUsd);
  revalidatePath("/watchlist");
}
```

Note both `addToWatchlist` and `removeFromWatchlist` gain a `revalidatePath("/watchlist")` call.

- [ ] **Step 5: Run tests**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/watchlists.test.ts`
Expected: PASS — original tests + 5 new. If the helper-function names used in Step 2 didn't match the existing file's actual helpers, fix the test to match (do NOT change the implementation).

- [ ] **Step 6: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

Write `/tmp/msg.txt`:

```
feat(watchlist): setWatchlistThreshold action + revalidate /watchlist

Adds the private+public action pair for setting a watchlist
row's max_price_usd threshold. Validates: null OR finite number
in (0, 1000]. RLS on watchlists already scopes to auth.uid();
the action also .eq("user_id", user.id) defensively.

Also adds revalidatePath("/watchlist") to the existing add and
remove actions so the new page stays fresh when watchlist state
changes from any surface (film detail button, admin,
recommendation modal).

5 new tests: happy path, clear (null), invalid values
(parameterized over 6 bad inputs), unauthenticated rejection,
cross-user attempt (no-op under RLS user_id scope).
```

Then:

```bash
git add app/lib/actions/watchlists.ts app/tests/actions/watchlists.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 4: Middleware — gate `/watchlist` behind auth

**Files:**
- Modify: `app/middleware.ts`
- Modify: `app/tests/middleware.test.ts`

- [ ] **Step 1: Read the existing middleware + test**

Run: `cat app/middleware.ts app/tests/middleware.test.ts` — note how the protected routes list is shaped and how `decideRedirect` is exported for testing.

- [ ] **Step 2: Write the failing test**

Append a new `it` block inside the existing `describe("decideRedirect", ...)` in `app/tests/middleware.test.ts`:

```ts
  it("redirects unauthed users hitting /watchlist to /auth/signin with redirect param", () => {
    const result = decideRedirect({ path: "/watchlist", authed: false });
    expect(result).toBe("/auth/signin?redirect=/watchlist");
  });

  it("allows authed users to hit /watchlist without redirect", () => {
    const result = decideRedirect({ path: "/watchlist", authed: true });
    expect(result).toBeNull();
  });
```

The exact shape of `decideRedirect`'s input/output depends on the current implementation — read the existing test cases and copy their argument/return conventions. If `decideRedirect` takes a URL object, pass a URL; if it takes a plain string path, pass a string.

- [ ] **Step 3: Run to verify failure**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/middleware.test.ts`
Expected: FAIL — `/watchlist` doesn't match any protected pattern yet.

- [ ] **Step 4: Edit `app/middleware.ts`**

Locate the list of protected route prefixes (currently includes `/home`, `/onboarding`, `/settings`, `/coven`). Add `/watchlist` to that list. The exact syntax depends on how the list is expressed — a `Set`, an array with `.some(r => path.startsWith(r))`, or regex. Follow the existing pattern.

If the list looks like:

```ts
const PROTECTED = ["/home", "/onboarding", "/settings", "/coven"];
```

Change to:

```ts
const PROTECTED = ["/home", "/onboarding", "/settings", "/coven", "/watchlist"];
```

- [ ] **Step 5: Run tests**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/middleware.test.ts`
Expected: PASS — existing cases still pass, 2 new cases pass.

- [ ] **Step 6: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

Write `/tmp/msg.txt`:

```
feat(watchlist): middleware gates /watchlist behind auth

Adds /watchlist to the protected-routes list. Unauthed users
hitting /watchlist are redirected to /auth/signin with a
?redirect=/watchlist param so they land on the page post-auth.
Authed users hit the page normally.

2 new decideRedirect test cases.
```

Then:

```bash
git add app/middleware.ts app/tests/middleware.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 5: `WatchlistSortSelect` component

**Files:**
- Create: `app/app/watchlist/WatchlistSortSelect.tsx`

No tests (no React testing library in `app/`; verified by typecheck + manual smoke). Mirror of `app/app/films/FilmsSortSelect.tsx`.

- [ ] **Step 1: Read the template**

Run: `cat app/app/films/FilmsSortSelect.tsx` — note the JSX shape, imports, and URL-param behavior. The new file copies this structure with the four watchlist sort options.

- [ ] **Step 2: Create the new component**

Create `app/app/watchlist/WatchlistSortSelect.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import type { WatchlistSort } from "@/lib/queries/sort-watchlist";

interface Props {
  current: WatchlistSort;
}

const OPTIONS: Array<{ value: WatchlistSort; label: string }> = [
  { value: "drop", label: "Price dropped" },
  { value: "recency", label: "Recently added" },
  { value: "price-low", label: "Lowest price" },
  { value: "alphabetical", label: "A → Z" },
];

export default function WatchlistSortSelect({ current }: Props) {
  const router = useRouter();
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-ui)", fontSize: 13 }}>
      <span className="caps" style={{ opacity: 0.7 }}>Sort</span>
      <select
        value={current}
        onChange={e => router.replace(`/watchlist?sort=${e.target.value}`, { scroll: false })}
        style={{ background: "var(--void-2)", color: "var(--bone)", border: "1px solid var(--muted-dark)", padding: "6px 10px", fontFamily: "inherit", fontSize: 13 }}
      >
        {OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
```

Note: if `FilmsSortSelect.tsx` uses a different style pattern (e.g., class-based instead of inline styles), match that. The goal is visual + interaction parity.

- [ ] **Step 3: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

Write `/tmp/msg.txt`:

```
feat(watchlist): WatchlistSortSelect client component

Four-option URL-param-driven sort select for /watchlist:
price-dropped (default), recently added, lowest price,
alphabetical. Mirror of FilmsSortSelect's shape and styling.

No tests — client router.replace is Next.js runtime; typecheck
+ manual smoke covers this.
```

Then:

```bash
git add app/app/watchlist/WatchlistSortSelect.tsx
git commit -F /tmp/msg.txt
```

---

## Task 6: `WatchlistRow` component

**Files:**
- Create: `app/app/watchlist/WatchlistRow.tsx`

Client component. Owns inline threshold editor state + remove pending state. The largest single component in this sub-project — ~100-140 lines of TSX.

- [ ] **Step 1: Create the component**

Create `app/app/watchlist/WatchlistRow.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { setWatchlistThreshold, removeFromWatchlist } from "@/lib/actions/watchlists";
import { computeDropPct } from "@/lib/queries/sort-watchlist";
import type { WatchlistRowData } from "@/lib/queries/watchlists";

interface Props {
  row: WatchlistRowData;
}

function formatPrice(n: number | null): string {
  return n == null ? "—" : `$${n.toFixed(2)}`;
}

export default function WatchlistRow({ row }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(
    row.max_price_usd != null ? row.max_price_usd.toFixed(2) : ""
  );
  const [editError, setEditError] = useState<string | null>(null);
  const [pendingEdit, startEdit] = useTransition();
  const [pendingRemove, startRemove] = useTransition();

  const dropped = computeDropPct(row) != null;

  function submitThreshold() {
    setEditError(null);
    startEdit(async () => {
      try {
        const trimmed = draft.trim();
        const value = trimmed === "" ? null : Number(trimmed);
        if (value != null && (!Number.isFinite(value) || value <= 0 || value > 1000)) {
          setEditError("Must be between $0.01 and $1000.");
          return;
        }
        await setWatchlistThreshold(row.film_id, value);
        setEditing(false);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Couldn't save — try again.";
        setEditError(msg === "invalid threshold" ? "Must be between $0.01 and $1000." : "Couldn't save — try again.");
      }
    });
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(row.max_price_usd != null ? row.max_price_usd.toFixed(2) : "");
    setEditError(null);
  }

  function onRemove() {
    startRemove(async () => {
      try {
        await removeFromWatchlist(row.film_id);
      } catch (e) {
        console.error(e);
      }
    });
  }

  return (
    <div className={`watchlist-row${dropped ? " watchlist-row-dropped" : ""}`}>
      <a href={`/film/${row.film.id}`} className="watchlist-row-poster">
        {row.film.artwork_url ? (
          <img src={row.film.artwork_url} alt="" width={48} height={72} style={{ objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: 48, height: 72, background: "#222" }} />
        )}
      </a>
      <div className="watchlist-row-title">
        <a href={`/film/${row.film.id}`} style={{ color: "inherit", textDecoration: "none" }}>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 20, lineHeight: 1.1 }}>{row.film.title}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{row.film.director} · {row.film.year}</div>
        </a>
      </div>
      <div className="watchlist-row-price">
        <div style={{ fontFamily: "var(--font-head)", fontSize: 22 }}>{formatPrice(row.film.latest_price)}</div>
        {dropped && <span className="caps" style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>▼ DROP</span>}
      </div>
      <div className="watchlist-row-threshold">
        {editing ? (
          <div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="1000"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") submitThreshold();
                if (e.key === "Escape") cancelEdit();
              }}
              onBlur={submitThreshold}
              disabled={pendingEdit}
              autoFocus
              className="watchlist-threshold-editor"
              placeholder="0.00"
            />
            {editError && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 11, marginTop: 4 }}>{editError}</div>}
          </div>
        ) : row.max_price_usd != null ? (
          <button type="button" onClick={() => setEditing(true)} className="watchlist-threshold-display">
            ≤ ${row.max_price_usd.toFixed(2)} <span style={{ opacity: 0.5, marginLeft: 4 }}>✎</span>
          </button>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="watchlist-threshold-set">
            + Set alert
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={pendingRemove}
        className="watchlist-remove"
        aria-label="Remove from watchlist"
      >
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

Write `/tmp/msg.txt`:

```
feat(watchlist): WatchlistRow client component

One row per tracked film. Grid layout: poster thumb · title +
dir/year · current price (with ▼ DROP badge if below threshold)
· inline threshold editor · remove ×.

Inline threshold editor: click "+ Set alert" or existing
threshold → input appears → save on Enter/blur, cancel on
Escape. Empty submission clears the threshold. Errors display
inline as red italic; input stays editable on failure.

Remove button uses useTransition; the action revalidates
/watchlist so the row disappears on success.

Styling hooks (.watchlist-row, .watchlist-row-dropped,
.watchlist-threshold-editor, .watchlist-remove) land in
globals.css in Task 8.
```

Then:

```bash
git add app/app/watchlist/WatchlistRow.tsx
git commit -F /tmp/msg.txt
```

---

## Task 7: Page component + empty state

**Files:**
- Create: `app/app/watchlist/page.tsx`

Server component. Empty state inlined as a small local subcomponent (keeps the file under ~100 lines — well within comfort; splitting adds overhead without benefit at this scale).

- [ ] **Step 1: Create the page**

Create `app/app/watchlist/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getMyWatchlistWithFilms } from "@/lib/queries/watchlists";
import { sortWatchlist, type WatchlistSort } from "@/lib/queries/sort-watchlist";
import TopNav from "@/components/TopNav";
import WatchlistRow from "./WatchlistRow";
import WatchlistSortSelect from "./WatchlistSortSelect";

const VALID_SORTS: readonly WatchlistSort[] = ["drop", "recency", "price-low", "alphabetical"] as const;

function WatchlistEmpty() {
  return (
    <div className="watchlist-empty">
      <h2 className="display" style={{ fontSize: "clamp(36px, 6vw, 64px)", margin: "0 0 16px", lineHeight: 0.95 }}>
        The Scroll is empty.
      </h2>
      <p style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontStyle: "italic", opacity: 0.75, margin: "0 0 28px" }}>
        No films tracked. Yet.
      </p>
      <a href="/films" className="btn btn-lg">
        Browse the archive →
      </a>
    </div>
  );
}

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const supabase = await createClient();
  const { sort: sortParam } = await searchParams;
  const sort: WatchlistSort =
    sortParam && (VALID_SORTS as readonly string[]).includes(sortParam)
      ? (sortParam as WatchlistSort)
      : "drop";

  const rows = await getMyWatchlistWithFilms(supabase);
  const sorted = sortWatchlist(rows, sort);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav />
      <section style={{ padding: "48px 0" }}>
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 10 }}>
            Films you're tracking
          </div>
          <h1
            className="display"
            style={{
              fontSize: "clamp(48px, 8vw, 96px)",
              margin: "0 0 32px",
              lineHeight: 0.9,
            }}
          >
            The Scroll
          </h1>
          {rows.length === 0 ? (
            <WatchlistEmpty />
          ) : (
            <>
              <div className="watchlist-toolbar">
                <span className="caps" style={{ opacity: 0.7 }}>
                  {rows.length} tracked
                </span>
                <WatchlistSortSelect current={sort} />
              </div>
              <div className="watchlist-list">
                {sorted.map(r => (
                  <WatchlistRow key={r.id} row={r} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

Write `/tmp/msg.txt`:

```
feat(watchlist): page.tsx — The Scroll route

Server component at /watchlist. Auth is gated by middleware
(Task 4). Reads ?sort= from searchParams, validates against the
four allowed values (defaults to "drop"), fetches
getMyWatchlistWithFilms, sorts in JS, renders toolbar +
WatchlistRow list OR the WatchlistEmpty zine-voice empty
state with a CTA to /films.

Styling hooks (.watchlist-toolbar, .watchlist-list,
.watchlist-empty) land in globals.css in Task 8.
```

Then:

```bash
git add app/app/watchlist/page.tsx
git commit -F /tmp/msg.txt
```

---

## Task 8: CSS — `.watchlist-*` class set

**Files:**
- Modify: `app/app/globals.css`

All the layout + responsive styles for the page and row. Lands after the JSX so we can tune against the real rendered markup.

- [ ] **Step 1: Check the end of globals.css for the right insertion point**

Run: `tail -20 app/app/globals.css` — note the last rule. Append after it.

- [ ] **Step 2: Append the new CSS block**

Append to `app/app/globals.css`:

```css

/* ===== WATCHLIST PAGE =====
   /watchlist — editorial list, drop-first default sort, inline
   threshold editor per row. Desktop: single-line row via grid.
   Mobile (≤720px): two-row card (poster+title on top, price +
   threshold + remove below). Dropped rows get accent-colored
   price + ▼ DROP badge. */
.watchlist-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.watchlist-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.watchlist-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto auto auto;
  gap: 18px;
  align-items: center;
  padding: 14px 16px;
  background: var(--void-2);
  border: 1px solid #222;
}
.watchlist-row-poster {
  display: block;
  line-height: 0;
}
.watchlist-row-title {
  min-width: 0;
  overflow: hidden;
}
.watchlist-row-title a {
  display: block;
}
.watchlist-row-price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 80px;
  text-align: right;
}
.watchlist-row-dropped .watchlist-row-price {
  color: var(--accent);
}
.watchlist-row-threshold {
  min-width: 110px;
}
.watchlist-threshold-display,
.watchlist-threshold-set {
  background: none;
  border: 1px dashed var(--muted-dark);
  color: var(--bone);
  font-family: var(--font-ui);
  font-size: 13px;
  padding: 6px 10px;
  cursor: pointer;
}
.watchlist-threshold-set {
  color: var(--muted);
  font-style: italic;
}
.watchlist-threshold-display:hover,
.watchlist-threshold-set:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.watchlist-threshold-editor {
  background: var(--void);
  color: var(--bone);
  border: 2px solid var(--accent);
  padding: 6px 8px;
  width: 90px;
  font-family: var(--font-ui);
  font-size: 14px;
}
.watchlist-threshold-editor:focus {
  outline: none;
}
.watchlist-remove {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  padding: 4px 8px;
}
.watchlist-remove:hover {
  color: var(--accent);
}
.watchlist-remove:disabled {
  opacity: 0.4;
  cursor: default;
}
.watchlist-empty {
  padding: 48px 0;
  text-align: left;
}

@media (max-width: 720px) {
  .watchlist-toolbar {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .watchlist-row {
    grid-template-columns: 48px 1fr;
    gap: 12px;
    padding: 14px;
  }
  .watchlist-row-poster   { grid-column: 1; grid-row: 1 / span 2; }
  .watchlist-row-title    { grid-column: 2; grid-row: 1; }
  .watchlist-row-price,
  .watchlist-row-threshold,
  .watchlist-remove {
    grid-column: 2;
    grid-row: 2;
    align-self: center;
  }
  .watchlist-row-price     { justify-self: start; align-items: flex-start; text-align: left; }
  .watchlist-row-threshold { justify-self: center; min-width: 0; }
  .watchlist-remove        { justify-self: end; }
}
```

Mobile layout: poster spans both rows on the left column; title block sits in the top-right cell; price + threshold + remove share the bottom-right cell with `justify-self: start/center/end` to distribute them across the row.

- [ ] **Step 3: Typecheck + start the dev server for a visual check (optional but recommended)**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean.

If you have `app/.env.local` with Supabase credentials and the dev server is reachable, briefly start `npm run dev`, sign in as a user with watchlist items, and eyeball `/watchlist` at desktop + mobile widths. If the mobile stacking is broken, swap to the alternative CSS block from Step 2 and re-verify. If no env is available, defer the visual check to Task 10 and commit the CSS as-is.

- [ ] **Step 4: Commit**

Write `/tmp/msg.txt`:

```
style(watchlist): .watchlist-* class set in globals.css

Desktop grid layout for watchlist rows (poster · title · price
· threshold · remove), editorial toolbar, and mobile ≤720px
two-row card layout. Dropped rows pull var(--accent) on the
price cell. Threshold editor + remove button styles mirror the
zine palette — dashed muted borders, accent on hover.
```

Then:

```bash
git add app/app/globals.css
git commit -F /tmp/msg.txt
```

---

## Task 9: TopNav — add "Watchlist" link

**Files:**
- Modify: `app/components/TopNavChrome.tsx` (or wherever the nav links live — check first)

- [ ] **Step 1: Read the current TopNav / TopNavChrome**

Run: `cat app/components/TopNav.tsx app/components/TopNavChrome.tsx 2>/dev/null` — confirm where the nav links live and how auth-gated links are expressed.

- [ ] **Step 2: Add the Watchlist link**

In `TopNavChrome.tsx` (or whichever file holds the nav link JSX), add a link labeled `"Watchlist"` pointing to `/watchlist`, positioned between `"Films"` and `"Lists"`. Use the exact same auth-gating pattern as the existing auth-only links (conditional render on the user prop).

Example shape — adapt to the real JSX:

```tsx
<a href="/films">Films</a>
{user && <a href="/watchlist">Watchlist</a>}
<a href="/lists">Lists</a>
```

Mobile nav (if the component has a separate burger menu): add the same link there too, in the same position relative to the other auth-gated items.

- [ ] **Step 3: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

Write `/tmp/msg.txt`:

```
feat(nav): add Watchlist link to TopNav

Inserts a "Watchlist" link pointing at /watchlist between
"Films" and "Lists" in the top-nav chrome. Auth-gated to match
the existing pattern for signed-in-only links.
```

Then:

```bash
git add app/components/TopNavChrome.tsx
# (or the actual file that changed; adjust the git add target)
git commit -F /tmp/msg.txt
```

---

## Task 10: Manual smoke test

No code changes. Hands-on browser verification.

- [ ] **Step 1: Confirm Supabase env vars are in `app/.env.local`**

Run: `grep -E "^NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)=" app/.env.local`
Expected: both vars set. If missing, run `npx vercel env pull app/.env.local --environment=development` from the repo root.

- [ ] **Step 2: Start the dev server**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev`
Expected: "Ready in Xs" on http://localhost:3000.

- [ ] **Step 3: Verify auth gating**

Sign out (or open an incognito window). Navigate to http://localhost:3000/watchlist.
Expected: redirected to http://localhost:3000/auth/signin?redirect=/watchlist. Sign in; land on `/watchlist`.

- [ ] **Step 4: Verify empty state**

Use a user with zero watchlist items (or clear all items temporarily). Hit `/watchlist`.
Expected: `The Scroll is empty.` display-type headline + italic-serif "No films tracked. Yet." subcopy + "Browse the archive →" button. Click the button → lands on `/films`.

- [ ] **Step 5: Verify populated state (desktop)**

Add at least 3 films to the watchlist (via film detail pages or admin). Return to `/watchlist`.
Expected:
- `The Scroll` display title with `Films you're tracking` eyebrow.
- Toolbar showing "N tracked" on the left and "Sort" dropdown on the right.
- Rows showing poster · title (clickable → film detail) · director/year · current price · "+ Set alert" threshold cell · "×" remove button.

- [ ] **Step 6: Set a threshold**

On a row, click "+ Set alert" → input appears. Type `9.99` → Enter.
Expected: threshold updates to "≤ $9.99" with a small ✎ pencil icon. If the film's current price is ≤ $9.99, the row's price cell turns accent-colored and gets a "▼ DROP" caps badge; sort re-runs and this row moves to the top if default sort is "drop".

- [ ] **Step 7: Edit the threshold**

Click the existing threshold display. Change value. Press Enter. Expected: updates. Try Escape mid-edit. Expected: reverts. Try submitting an invalid value (e.g., `1500`). Expected: red italic "Must be between $0.01 and $1000." appears below the input; input stays editable.

- [ ] **Step 8: Clear a threshold**

Click an existing threshold. Clear the input. Press Enter.
Expected: threshold reverts to "+ Set alert" muted-dashed state.

- [ ] **Step 9: Sort**

Use the Sort dropdown to change to "Recently added" → URL updates to `/watchlist?sort=recency`, rows reorder. Try each of the four sorts. Refresh the page — URL-driven sort persists.

- [ ] **Step 10: Remove a row**

Click the "×" on a row. Expected: row disappears; count in toolbar decrements. The film's watchlist state on its film detail page also updates (via the added revalidate).

- [ ] **Step 11: Mobile**

Narrow the browser to ≤720px width (or use device emulation). Expected: row reflows to two-row card — poster + title on top, price + threshold + remove row below. Toolbar stacks to vertical.

- [ ] **Step 12: Stop the dev server**

Ctrl-C. No commit — this task made no code changes.

---

## Task 11: Deploy to production

- [ ] **Step 1: Sanity check the deploy context**

Run: `pwd && ls -la .vercel/project.json && git log --oneline -1`
Expected: in `/home/cthulhulemon/film_goblin`, `.vercel/project.json` present, latest commit is the Task 9 TopNav commit (or a smoke-test-driven tweak).

- [ ] **Step 2: Deploy**

Run: `npx vercel deploy --prod --yes`
Expected: build succeeds, output ends with `Aliased: https://film-goblin.vercel.app`.

- [ ] **Step 3: Production smoke**

Open https://film-goblin.vercel.app/watchlist in a browser signed in as a user with watchlist items. Verify the page renders, the sort dropdown works, and at least one threshold edit + remove works end-to-end.

No commit — this task doesn't modify the repo.

---

## Summary

**Total tasks:** 11 (9 coding + 1 smoke + 1 deploy)
**Estimated total:** ~7-8 hours focused
**Net new files:** 5 (`sort-watchlist.ts`, 2 new tests, 3 new `app/app/watchlist/` components)
**Net edited files:** 6 (`watchlists.ts` query, `watchlists.ts` action, `middleware.ts`, `globals.css`, `TopNavChrome.tsx`, 2 existing test files)
**Test delta:** +13 (11 sort + 2 coercion + 5 action + 2 middleware, less the 5 in watchlists.test.ts already counted)
**Env vars:** none new
**Migrations:** none
**Model routing hint (for subagent execution):** Tasks 1, 4, 5, 9 are mechanical (Haiku-class); Tasks 2, 3, 7, 8 involve judgment or integration (Sonnet); Task 6 is the most complex single component (Sonnet).

**Key invariants to preserve:**
- Private + public action pair pattern — never skip the `_name(client, ...)` separation.
- Supabase NUMERIC → JS number coercion at the query boundary (never let a string price leak into sort logic or React rendering).
- RLS is the authoritative scoping mechanism; the `.eq("user_id", user.id)` in actions is belt-and-suspenders defensive, not the primary boundary.
- All new logs (none at the moment for this feature) would prefix `watchlist:` if added.
- Colocated page-specific components under `app/app/watchlist/` — don't drift toward `app/components/`.

---

## Addendum — 2026-04-24 post-ship pivot

Tasks 3 and 6 in this plan built a `setWatchlistThreshold` action + inline threshold editor in `WatchlistRow`. **That design was removed during integration** — see the companion spec's addendum for the full rationale. Short version: the user's mental model reframed the feature as "the watchlist IS the alert, threshold = price at add time," and the editor UI became unnecessary friction.

The shipped feature replaces Task 6's threshold editor with a **"Buy on Apple TV →" external link**, replaces the `▼ DROP` badge with a **struck-through "was" price**, auto-captures `max_price_usd` at add time via a fresh iTunes Lookup, and dropped Task 3's action + its 5 tests. The nav link in Task 9 works as planned on desktop + mobile (one early bug — a redundant `onClick` on the mobile drawer `<Link>` — was fixed in the same pivot commit).

Commits to trace the pivot:
- `5f4cdd7` — original Task 6 editor
- `0f93ca6` — Enter/blur dedup on the editor (rendered irrelevant by the pivot)
- `6266cd2` — **THE PIVOT** (remove editor, add Buy link, strikethrough, mobile nav fix, auto-capture in `_addToWatchlist`)
- `ae2f2d1` — DB migration backfilling the threshold on pre-existing watchlist rows
- `c371d15` — fresh iTunes Lookup at add time (tightens the auto-capture; falls back to last-swept price on iTunes failure)

The plan above is historical; treat the spec addendum + these commits as the source of truth for shipped behavior.
