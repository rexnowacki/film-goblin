# Apple TV Search Provider (Lane B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `iTunesSearchBox` in admin Add Film with a Brave-backed "Search Apple TV" widget that falls back from iTunes Search → Brave Search → `tv.apple.com` page → `adamId` extraction.

**Architecture:** New shared helper `app/lib/apple-tv/resolve-adam-id.ts` (extracted from `films.ts`). New server action `app/lib/actions/admin/apple-tv-search.ts` that tries iTunes Search first and falls back to Brave Search + parallel `tv.apple.com` page fetches. New client component `AppleTvSearchBox.tsx` mirroring the current widget UX with a `via` badge per candidate.

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest (already installed), `vi.mock` + `vi.spyOn(globalThis, "fetch")` for test stubs (no MSW — follows existing `tests/routes/cron-refresh-prices.test.ts` pattern). Brave Search API as the external search provider.

**Prerequisites (do before Task 1):**

- Node 20 in PATH for all `npm` commands (repo uses Node 20 via `.nvmrc`). Prefix one-shots with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH` if `nvm use` hasn't run for the shell.
- Commit messages use `git commit -F /tmp/msg.txt` (heredocs mangle messages in this env — see CLAUDE.md Gotchas). Never `git commit -m`.
- A Brave Search API key from https://brave.com/search/api (free tier, 2000 queries/month — requires a credit card at signup even on free tier).
- Add `BRAVE_SEARCH_API_KEY=<key>` to `app/.env.local` for local dev. Vercel env configuration happens in Task 16.
- Reference the spec throughout: `docs/superpowers/specs/2026-04-24-apple-tv-search-provider-design.md`.

---

## Task 1: Extract `resolveAdamIdFromAppleTvUrl` into a shared helper (TDD)

**Files:**
- Create: `app/lib/apple-tv/resolve-adam-id.ts`
- Create: `app/tests/admin/resolve-adam-id.test.ts`
- Create: `app/tests/fixtures/apple-tv-page-valid.html`
- Create: `app/tests/fixtures/apple-tv-page-streaming-only.html`
- Modify: `app/lib/actions/admin/films.ts` (remove inline copy, import shared)

- [ ] **Step 1: Create the fixture file `apple-tv-page-valid.html`**

```html
<!DOCTYPE html>
<html>
<head><title>Midsommar — Apple TV</title></head>
<body>
<script id="shoebox-data" type="application/json">{"movieHeader":{"content":{"id":"umc.cmc.testhashvalid","adamId":"1468845007","title":"Midsommar","year":2019,"posterUrl":"https://is1-ssl.mzstatic.com/image/thumb/poster.jpg"}}}</script>
</body>
</html>
```

- [ ] **Step 2: Create the fixture file `apple-tv-page-streaming-only.html`**

```html
<!DOCTYPE html>
<html>
<head><title>Suspiria 1977 — Apple TV</title></head>
<body>
<script id="shoebox-data" type="application/json">{"movieHeader":{"content":{"id":"umc.cmc.streamingonlyhash","title":"Suspiria","year":1977,"posterUrl":"https://is1-ssl.mzstatic.com/image/thumb/poster.jpg","availability":"streaming-only"}}}</script>
</body>
</html>
```

Note: no `adamId` field — this simulates pages that link to streaming services but have no iTunes purchase option.

- [ ] **Step 3: Write the failing test file `app/tests/admin/resolve-adam-id.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractAdamIdFromHtml } from "@/lib/apple-tv/resolve-adam-id";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const validHtml = readFileSync(fixturesDir + "apple-tv-page-valid.html", "utf8");
const streamingOnlyHtml = readFileSync(fixturesDir + "apple-tv-page-streaming-only.html", "utf8");

describe("extractAdamIdFromHtml", () => {
  it("returns the adamId as a number from a valid Apple TV page", () => {
    expect(extractAdamIdFromHtml(validHtml)).toBe(1468845007);
  });

  it("returns null when the page has no adamId (streaming-only page)", () => {
    expect(extractAdamIdFromHtml(streamingOnlyHtml)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(extractAdamIdFromHtml("")).toBeNull();
  });

  it("returns null when the adamId match payload is non-numeric", () => {
    // Defensive: the regex forbids non-digits but this proves the Number.isFinite guard.
    // Simulate a shape the regex accepts but Number() rejects — not actually possible
    // with /\d+/ but we keep the guard, so assert the obvious: no match → null.
    expect(extractAdamIdFromHtml('{"adamId":"not-a-number"}')).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/admin/resolve-adam-id.test.ts`

Expected: FAIL — `Cannot find module '@/lib/apple-tv/resolve-adam-id'`.

- [ ] **Step 5: Create the helper `app/lib/apple-tv/resolve-adam-id.ts`**

```ts
export function extractAdamIdFromHtml(html: string): number | null {
  const m = html.match(/"adamId":"(\d+)"/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Apple TV URLs use the format https://tv.apple.com/us/movie/<slug>/umc.cmc.<hash>.
 * The `umc.cmc.*` token is NOT the iTunes trackId — iTunes Lookup can't resolve it.
 * But the rendered Apple TV page embeds the trackId as `"adamId":"<digits>"` in its
 * server-side JSON. Fetching the page and extracting adamId gives us the trackId.
 */
export async function resolveAdamIdFromAppleTvUrl(url: string): Promise<number | null> {
  if (!/tv\.apple\.com\/.*\/umc\.cmc\./i.test(url)) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    });
    if (!res.ok) return null;
    return extractAdamIdFromHtml(await res.text());
  } catch { return null; }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/admin/resolve-adam-id.test.ts`

Expected: PASS — 4 tests pass.

- [ ] **Step 7: Replace the inline helper in `films.ts` with an import**

In `app/lib/actions/admin/films.ts`, delete the inline `resolveAdamIdFromAppleTvUrl` function (lines 55–76 as of the current file) including its doc comment, and add this import near the top with the other imports:

```ts
import { resolveAdamIdFromAppleTvUrl } from "@/lib/apple-tv/resolve-adam-id";
```

The existing call site at line 115 (inside `adminLookupItunes`) is unchanged — the imported function has the same signature.

- [ ] **Step 8: Run typecheck and the full test suite to verify nothing regressed**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: no errors.

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: all tests pass (4 new + existing ones).

- [ ] **Step 9: Commit**

Write the commit message to `/tmp/msg.txt`:

```
refactor(app): extract resolveAdamIdFromAppleTvUrl into shared helper

Moves the Apple TV adamId extraction logic out of
lib/actions/admin/films.ts into lib/apple-tv/resolve-adam-id.ts
so it can be reused by the upcoming Brave-backed search server
action. Adds pure-function tests for extractAdamIdFromHtml with
valid and streaming-only fixtures.

Behavior-preserving. The URL-paste path in adminLookupItunes now
imports the shared function instead of calling the inline copy.
```

Then commit:

```bash
git add app/lib/apple-tv/resolve-adam-id.ts app/lib/actions/admin/films.ts app/tests/admin/resolve-adam-id.test.ts app/tests/fixtures/apple-tv-page-valid.html app/tests/fixtures/apple-tv-page-streaming-only.html
git commit -F /tmp/msg.txt
```

---

## Task 2: Scaffold `apple-tv-search.ts` with the empty-input contract (TDD)

**Files:**
- Create: `app/lib/actions/admin/apple-tv-search.ts`
- Create: `app/tests/admin/apple-tv-search.test.ts`

This task establishes the server action's skeleton, the `SearchResult` return type, the auth check, and the empty-input short-circuit. Subsequent tasks add the iTunes-first and Brave-fallback branches.

- [ ] **Step 1: Write the failing test for the empty-input case**

Create `app/tests/admin/apple-tv-search.test.ts`:

```ts
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

  it("calls requireAdmin before doing any work", async () => {
    const err = new Error("admin role required");
    requireAdminMock.mockRejectedValue(err);
    await expect(adminSearchAppleTv("midsommar")).rejects.toThrow("admin role required");
    expect(searchFilmsMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/admin/apple-tv-search.test.ts`
Expected: FAIL — `Cannot find module '@/lib/actions/admin/apple-tv-search'`.

- [ ] **Step 3: Create the server action skeleton**

Create `app/lib/actions/admin/apple-tv-search.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { ITunesSearchHit } from "./films";

const APPLE_TV_SEARCH_REGION = "us";
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const CANDIDATE_LIMIT = 5;
const APPLE_TV_URL_RE = new RegExp(
  `^https://tv\\.apple\\.com/${APPLE_TV_SEARCH_REGION}/movie/[a-z0-9-]+/umc\\.cmc\\.[a-z0-9]+$`
);

export interface SearchCandidate extends ITunesSearchHit {
  via: "itunes" | "apple-tv-search";
}

export type SearchResult =
  | { ok: true; candidates: SearchCandidate[] }
  | { ok: false; reason: "brave-empty" | "all-streaming-only" | "brave-error"; message: string };

export async function adminSearchAppleTv(term: string): Promise<SearchResult> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const trimmed = term.trim();
  if (!trimmed) return { ok: true, candidates: [] };

  // iTunes-first and Brave-fallback branches added in later tasks.
  return { ok: true, candidates: [] };
}
```

Note the `"use server"` directive — this is a server action. The unused constants (`BRAVE_ENDPOINT`, `CANDIDATE_LIMIT`, `APPLE_TV_URL_RE`) are scaffolded here and wired up in later tasks. TypeScript won't complain about unused module-scope consts.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/admin/apple-tv-search.test.ts`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Run typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

Write `/tmp/msg.txt`:

```
feat(admin): scaffold apple-tv-search server action

Empty-input and requireAdmin checks only — iTunes-first and Brave
fallback branches added in subsequent commits. Sets up the
SearchResult discriminated union and module-scope constants
(region, endpoint, candidate limit, URL regex).
```

```bash
git add app/lib/actions/admin/apple-tv-search.ts app/tests/admin/apple-tv-search.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 3: Add the iTunes-first branch (TDD)

**Files:**
- Modify: `app/lib/actions/admin/apple-tv-search.ts`
- Modify: `app/tests/admin/apple-tv-search.test.ts`

- [ ] **Step 1: Add the failing test for the iTunes happy path**

Append this `it` block inside the existing `describe("adminSearchAppleTv", ...)` block in `apple-tv-search.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/admin/apple-tv-search.test.ts`
Expected: FAIL — the new tests fail because `adminSearchAppleTv` still returns `{ ok: true, candidates: [] }` unconditionally.

- [ ] **Step 3: Implement the iTunes-first branch and the brave-error fallthrough stub**

Replace the body of `app/lib/actions/admin/apple-tv-search.ts` with:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  searchFilms,
  parseFilm,
  type ParsedFilm,
} from "film-goblin-worker";
import type { ITunesSearchHit } from "./films";

const APPLE_TV_SEARCH_REGION = "us";
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const CANDIDATE_LIMIT = 5;
const APPLE_TV_URL_RE = new RegExp(
  `^https://tv\\.apple\\.com/${APPLE_TV_SEARCH_REGION}/movie/[a-z0-9-]+/umc\\.cmc\\.[a-z0-9]+$`
);

export interface SearchCandidate extends ITunesSearchHit {
  via: "itunes" | "apple-tv-search";
}

export type SearchResult =
  | { ok: true; candidates: SearchCandidate[] }
  | { ok: false; reason: "brave-empty" | "all-streaming-only" | "brave-error"; message: string };

function toHit(p: ParsedFilm): ITunesSearchHit {
  return {
    itunes_id: p.itunes_id,
    title: p.title,
    director: p.director,
    year: p.year,
    runtime_min: p.runtime_min,
    genre_primary: p.genre_primary,
    description: p.description,
    content_advisory: p.content_advisory,
    artwork_url: p.artwork_url,
    itunes_url: p.itunes_url,
    price_usd: p.price_usd,
  };
}

async function tryItunesSearch(term: string): Promise<SearchCandidate[]> {
  try {
    const res = await searchFilms(term, { limit: 10 });
    return res.results
      .map(r => parseFilm(r))
      .filter((p): p is ParsedFilm => p !== null)
      .map(p => ({ ...toHit(p), via: "itunes" as const }));
  } catch (e) {
    console.warn("apple-tv-search: iTunes search threw:", e);
    return [];
  }
}

async function tryBraveSearch(_term: string): Promise<SearchResult> {
  // Full implementation added in Task 4. For now, treat as unavailable so
  // the iTunes-first branch can be tested without requiring a real Brave key.
  if (!process.env.BRAVE_SEARCH_API_KEY) {
    console.error("apple-tv-search: BRAVE_SEARCH_API_KEY not set");
    return { ok: false, reason: "brave-error", message: "Search unavailable — try again in a moment." };
  }
  return { ok: false, reason: "brave-error", message: "Search unavailable — try again in a moment." };
}

export async function adminSearchAppleTv(term: string): Promise<SearchResult> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const trimmed = term.trim();
  if (!trimmed) return { ok: true, candidates: [] };

  const itunesCandidates = await tryItunesSearch(trimmed);
  if (itunesCandidates.length > 0) return { ok: true, candidates: itunesCandidates };

  return await tryBraveSearch(trimmed);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/admin/apple-tv-search.test.ts`
Expected: PASS — 5 tests pass total (2 previous + 3 new).

- [ ] **Step 5: Run typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

Write `/tmp/msg.txt`:

```
feat(admin): iTunes-first branch in apple-tv-search

Runs iTunes Search through the existing worker helper and
surfaces results as SearchCandidate[] with via: "itunes". Thrown
errors from searchFilms are caught and treated as zero results,
so the Brave fallback still runs. Brave branch is stubbed to
always return brave-error until Task 4 lands the full
implementation.
```

```bash
git add app/lib/actions/admin/apple-tv-search.ts app/tests/admin/apple-tv-search.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 4: Add Brave fixtures + URL filter + empty/filter-zero handling (TDD)

**Files:**
- Create: `app/tests/fixtures/brave-search-response.json`
- Create: `app/tests/fixtures/brave-search-empty.json`
- Modify: `app/lib/actions/admin/apple-tv-search.ts`
- Modify: `app/tests/admin/apple-tv-search.test.ts`

- [ ] **Step 1: Create the Brave success fixture**

Create `app/tests/fixtures/brave-search-response.json`:

```json
{
  "web": {
    "results": [
      { "url": "https://tv.apple.com/us/movie/midsommar/umc.cmc.aaaaaaa1" },
      { "url": "https://tv.apple.com/us/movie/the-thing/umc.cmc.bbbbbbb2" },
      { "url": "https://tv.apple.com/us/movie/suspiria/umc.cmc.ccccccc3" },
      { "url": "https://tv.apple.com/us/movie/send-help/umc.cmc.ddddddd4" },
      { "url": "https://tv.apple.com/us/movie/hereditary/umc.cmc.eeeeeee5" },
      { "url": "https://tv.apple.com/us/show/severance/umc.cmc.ffffffff" },
      { "url": "https://tv.apple.com/us/genre/horror/umc.cmc.ggggggg" },
      { "url": "https://tv.apple.com/gb/movie/midsommar/umc.cmc.hhhhhhh6" }
    ]
  }
}
```

The first 5 are valid movie URLs (Lane B's expected candidates). The last 3 are noise that must be filtered out: a TV show, a genre/category page, and a non-US region URL.

- [ ] **Step 2: Create the Brave empty fixture**

Create `app/tests/fixtures/brave-search-empty.json`:

```json
{ "web": { "results": [] } }
```

- [ ] **Step 3: Add the failing tests for Brave empty / filter-zero**

Append these tests to `describe("adminSearchAppleTv", ...)` in `apple-tv-search.test.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/admin/apple-tv-search.test.ts`
Expected: FAIL — new tests fail because `tryBraveSearch` is still the stub from Task 3.

- [ ] **Step 5: Implement the Brave call + URL filter + empty handling**

Replace the `tryBraveSearch` function in `app/lib/actions/admin/apple-tv-search.ts`:

```ts
interface BraveResponse {
  web?: { results?: { url?: string }[] };
}

async function callBraveSearch(term: string): Promise<string[] | null> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) {
    console.error("apple-tv-search: BRAVE_SEARCH_API_KEY not set");
    return null;
  }
  const query = `site:tv.apple.com/${APPLE_TV_SEARCH_REGION}/movie "${term}"`;
  const url = `${BRAVE_ENDPOINT}?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "X-Subscription-Token": key,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      console.error(`apple-tv-search: Brave returned HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as BraveResponse;
    const urls = body.web?.results?.map(r => r.url).filter((u): u is string => !!u) ?? [];
    return urls;
  } catch (e) {
    console.error("apple-tv-search: Brave fetch threw:", e);
    return null;
  }
}

async function tryBraveSearch(term: string): Promise<SearchResult> {
  const urls = await callBraveSearch(term);
  if (urls === null) {
    return { ok: false, reason: "brave-error", message: "Search unavailable — try again in a moment." };
  }
  const candidateUrls = urls.filter(u => APPLE_TV_URL_RE.test(u)).slice(0, CANDIDATE_LIMIT);
  if (candidateUrls.length === 0) {
    return {
      ok: false,
      reason: "brave-empty",
      message: `No Apple TV results for "${term}". Try a different spelling or use manual entry.`,
    };
  }
  // Page fetches + adamId extraction added in Task 5.
  return { ok: false, reason: "brave-empty", message: "unreachable-until-task-5" };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/admin/apple-tv-search.test.ts`
Expected: PASS — 8 tests pass.

- [ ] **Step 7: Run typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

Write `/tmp/msg.txt`:

```
feat(admin): Brave call + URL filter in apple-tv-search

Calls api.search.brave.com with a site:-restricted phrase-match
query for the admin's term, filters returned URLs against the
APPLE_TV_URL_RE (US region, movie path, umc.cmc suffix), drops
noise (TV shows, genre pages, non-US regions), and returns
brave-empty when zero candidates survive. Brave HTTP errors,
malformed JSON, and missing env key all fall to brave-error with
a server-side console.error.
```

```bash
git add app/lib/actions/admin/apple-tv-search.ts app/tests/admin/apple-tv-search.test.ts app/tests/fixtures/brave-search-response.json app/tests/fixtures/brave-search-empty.json
git commit -F /tmp/msg.txt
```

---

## Task 5: Add parallel page fetches + adamId extraction + candidate assembly (TDD)

**Files:**
- Modify: `app/lib/actions/admin/apple-tv-search.ts`
- Modify: `app/tests/admin/apple-tv-search.test.ts`

This is the core of the Brave fallback — fetch each candidate URL in parallel, extract the adamId, look up the live iTunes Lookup result, and return candidates tagged `via: "apple-tv-search"`.

- [ ] **Step 1: Write the failing Brave happy-path test**

Append to `apple-tv-search.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/admin/apple-tv-search.test.ts`
Expected: FAIL — the new tests fail because the page-fetch pipeline returns the Task-4 stub.

- [ ] **Step 3: Implement the page-fetch pipeline**

Replace `tryBraveSearch` in `app/lib/actions/admin/apple-tv-search.ts` with the full implementation, and add an import for `fetchPrices` + `extractAdamIdFromHtml`:

At the top, update the imports:

```ts
import {
  searchFilms,
  parseFilm,
  fetchPrices,
  type ParsedFilm,
} from "film-goblin-worker";
import { extractAdamIdFromHtml } from "@/lib/apple-tv/resolve-adam-id";
```

Then replace `tryBraveSearch`:

```ts
async function fetchCandidateFromUrl(url: string): Promise<SearchCandidate | null> {
  try {
    const pageRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    });
    if (!pageRes.ok) {
      console.log(`apple-tv-search: page fetch failed (${pageRes.status}): ${url}`);
      return null;
    }
    const html = await pageRes.text();
    const adamId = extractAdamIdFromHtml(html);
    if (adamId === null) {
      console.log(`apple-tv-search: no adamId (streaming-only): ${url}`);
      return null;
    }
    const priceRes = await fetchPrices([adamId]);
    if (priceRes.resultCount === 0) {
      console.log(`apple-tv-search: iTunes Lookup empty for adamId ${adamId}`);
      return null;
    }
    const parsed = parseFilm(priceRes.results[0]);
    if (!parsed) {
      console.log(`apple-tv-search: parseFilm null for adamId ${adamId}`);
      return null;
    }
    return { ...toHit(parsed), via: "apple-tv-search" as const };
  } catch (e) {
    console.log(`apple-tv-search: candidate fetch threw for ${url}:`, e);
    return null;
  }
}

async function tryBraveSearch(term: string): Promise<SearchResult> {
  const urls = await callBraveSearch(term);
  if (urls === null) {
    return { ok: false, reason: "brave-error", message: "Search unavailable — try again in a moment." };
  }
  const candidateUrls = urls.filter(u => APPLE_TV_URL_RE.test(u)).slice(0, CANDIDATE_LIMIT);
  if (candidateUrls.length === 0) {
    return {
      ok: false,
      reason: "brave-empty",
      message: `No Apple TV results for "${term}". Try a different spelling or use manual entry.`,
    };
  }
  const settled = await Promise.all(candidateUrls.map(fetchCandidateFromUrl));
  const candidates = settled.filter((c): c is SearchCandidate => c !== null);
  const dropped = candidateUrls.length - candidates.length;
  if (dropped > 0) {
    console.log(`apple-tv-search: dropped ${dropped}/${candidateUrls.length} candidates`);
  }
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "all-streaming-only",
      message: `Apple TV has results for "${term}" but none are buyable (all streaming-only).`,
    };
  }
  return { ok: true, candidates };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/admin/apple-tv-search.test.ts`
Expected: PASS — 11 tests pass.

- [ ] **Step 5: Run typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

Write `/tmp/msg.txt`:

```
feat(admin): page fetches + adamId extraction in apple-tv-search

Completes the Brave fallback pipeline. For each URL surviving the
APPLE_TV_URL_RE filter (up to CANDIDATE_LIMIT=5), fetches the
Apple TV page in parallel, extracts adamId via the shared
extractAdamIdFromHtml helper, runs iTunes Lookup to build a live
ITunesSearchHit, and returns candidates tagged
via: "apple-tv-search". Streaming-only pages (no adamId), 404s,
and iTunes Lookup failures are silently dropped and logged.
Returns all-streaming-only when every candidate drops.
```

```bash
git add app/lib/actions/admin/apple-tv-search.ts app/tests/admin/apple-tv-search.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 6: Add Brave HTTP error tests (500, 401) (TDD)

**Files:**
- Modify: `app/tests/admin/apple-tv-search.test.ts`

The error path is already implemented (Task 4's `callBraveSearch` handles non-2xx). This task just adds coverage.

- [ ] **Step 1: Write the failing tests**

Append to `apple-tv-search.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests — they should pass immediately**

The error paths were implemented in Task 4. These are pure coverage additions.

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/admin/apple-tv-search.test.ts`
Expected: PASS — 14 tests total.

If any fail, the error-handling in `callBraveSearch` was not correctly wired in Task 4 — fix the implementation (do not change the tests).

- [ ] **Step 3: Commit**

Write `/tmp/msg.txt`:

```
test(admin): Brave HTTP error coverage for apple-tv-search

Asserts brave-error discrimination for Brave HTTP 500, HTTP 401,
and missing BRAVE_SEARCH_API_KEY cases. All three surface the
same admin-facing message ("Search unavailable…") and emit
distinct server-side console.error logs.
```

```bash
git add app/tests/admin/apple-tv-search.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 7: Build the `AppleTvSearchBox` client component

**Files:**
- Create: `app/app/admin/films/AppleTvSearchBox.tsx`

This is a UI-only task. No tests (no React testing in `app/` today — manual verification in Task 9).

- [ ] **Step 1: Create the component**

Create `app/app/admin/films/AppleTvSearchBox.tsx`:

```tsx
"use client";

import { useState } from "react";
import { adminSearchAppleTv, type SearchCandidate, type SearchResult } from "@/lib/actions/admin/apple-tv-search";
import type { ITunesSearchHit } from "@/lib/actions/admin/films";

interface Props {
  onPick: (hit: ITunesSearchHit) => void;
}

function errorMessage(result: Extract<SearchResult, { ok: false }>, term: string): string {
  switch (result.reason) {
    case "brave-empty":
      return `No Apple TV results for "${term}". Try a different spelling or use manual entry.`;
    case "all-streaming-only":
      return `Apple TV has results for "${term}" but none are buyable (all streaming-only).`;
    case "brave-error":
      return "Search unavailable — try again in a moment.";
  }
}

export default function AppleTvSearchBox({ onPick }: Props) {
  const [term, setTerm] = useState("");
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setCandidates([]);
    setLoading(true);
    try {
      const result = await adminSearchAppleTv(term);
      if (result.ok) {
        setCandidates(result.candidates);
        if (result.candidates.length === 0) setErr("No results.");
      } else {
        setErr(errorMessage(result, term));
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSearch} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          value={term}
          onChange={e => setTerm(e.target.value)}
          placeholder="Search Apple TV (title)…"
          style={{ flex: 1, padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 14 }}
        />
        <button type="submit" className="btn btn-sm" disabled={loading || !term.trim()}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      {err && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13, marginBottom: 14 }}>{err}</div>}
      {candidates.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 20 }}>
          {candidates.map(c => (
            <button
              key={c.itunes_id}
              type="button"
              onClick={() => onPick(c)}
              style={{ textAlign: "left", display: "grid", gridTemplateColumns: "48px 1fr auto auto", gap: 12, alignItems: "center", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)", cursor: "pointer", fontFamily: "inherit" }}
            >
              {c.artwork_url ? <img src={c.artwork_url} alt="" width={48} height={72} style={{ objectFit: "cover" }} /> : <div style={{ width: 48, height: 72, background: "#222" }} />}
              <div>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 16 }}>{c.title}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{c.director || "—"} · {c.year || "—"}</div>
              </div>
              <span className="caps" style={{ fontSize: 10, opacity: 0.5 }}>
                {c.via === "itunes" ? "via iTunes" : "via Apple TV search"}
              </span>
              <span className="caps" style={{ fontSize: 10, opacity: 0.6 }}>Pick →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

Write `/tmp/msg.txt`:

```
feat(admin): AppleTvSearchBox client component

Mirrors iTunesSearchBox layout and styling. Candidate cards get
a "via iTunes" or "via Apple TV search" badge in caps style at
opacity 0.5. Error rendering switches on the SearchResult reason
to distinguish brave-empty, all-streaming-only, and brave-error
with specific admin-facing copy.
```

```bash
git add app/app/admin/films/AppleTvSearchBox.tsx
git commit -F /tmp/msg.txt
```

---

## Task 8: Swap widget in `AddFilmClient` and delete `iTunesSearchBox`

**Files:**
- Modify: `app/app/admin/films/new/AddFilmClient.tsx`
- Delete: `app/app/admin/films/iTunesSearchBox.tsx`

- [ ] **Step 1: Update the imports and Option 1 heading in `AddFilmClient.tsx`**

In `app/app/admin/films/new/AddFilmClient.tsx`, replace:

```tsx
import ITunesSearchBox from "../iTunesSearchBox";
```

with:

```tsx
import AppleTvSearchBox from "../AppleTvSearchBox";
```

Then in the JSX, replace:

```tsx
            <h2 className="head" style={{ fontSize: 22, marginBottom: 10 }}>Option 1 — Search iTunes</h2>
            <ITunesSearchBox onPick={prefillFromHit} />
```

with:

```tsx
            <h2 className="head" style={{ fontSize: 22, marginBottom: 10 }}>Option 1 — Search Apple TV</h2>
            <AppleTvSearchBox onPick={prefillFromHit} />
```

- [ ] **Step 2: Delete `iTunesSearchBox.tsx`**

```bash
git rm app/app/admin/films/iTunesSearchBox.tsx
```

- [ ] **Step 3: Verify no other references to `iTunesSearchBox` remain**

Run: `grep -r "iTunesSearchBox\|ITunesSearchBox" app --include="*.ts" --include="*.tsx"`
Expected: no results.

- [ ] **Step 4: Verify `adminSearchItunes` is not referenced anywhere**

Run: `grep -rn "adminSearchItunes" app --include="*.ts" --include="*.tsx"`
Expected: only the export in `app/lib/actions/admin/films.ts`.

If `adminSearchItunes` is export-only (no callers), leave it in place for now — deleting it is a separate cleanup and not part of Lane B's scope. The unused export won't break anything.

- [ ] **Step 5: Run typecheck and the full test suite**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: no errors.

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: all tests pass (original 16 + 4 resolve-adam-id + 14 apple-tv-search = 34).

- [ ] **Step 6: Commit**

Write `/tmp/msg.txt`:

```
feat(admin): swap AppleTvSearchBox into AddFilmClient

Option 1 on /admin/films/new now uses the Brave-backed search
widget. The old iTunesSearchBox is deleted. The broken
adminSearchItunes server action stays in films.ts for now — it
has no callers but is harmless and removing it is out of scope
for Lane B.
```

```bash
git add app/app/admin/films/new/AddFilmClient.tsx
git commit -F /tmp/msg.txt
```

---

## Task 9: Manual smoke test in local dev

This task is hands-on verification — no code changes, no commits. Confirms Lane B works end-to-end against a real Brave + real Apple TV before we deploy.

- [ ] **Step 1: Confirm `BRAVE_SEARCH_API_KEY` is in `app/.env.local`**

Run: `grep BRAVE_SEARCH_API_KEY app/.env.local`
Expected: one line with the key value. If missing, add it now (see Prerequisites).

- [ ] **Step 2: Start the dev server**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev`
Expected: "Ready in Xs" on http://localhost:3000.

- [ ] **Step 3: Sign in as an admin in a browser**

Navigate to http://localhost:3000/auth/signin, sign in with an admin account, then go to http://localhost:3000/admin/films/new.

Expected: the page shows "Option 1 — Search Apple TV", "Option 2 — Paste Apple TV URL or iTunes ID", and "Option 3 — No iTunes match?".

- [ ] **Step 4: Test the iTunes-first happy path**

Type `the thing carpenter` in the Option 1 search box and hit Search.

Expected:
- Candidate cards appear with posters, title, director, year.
- Each card has a "via iTunes" badge in caps styling.
- No Brave quota is consumed (check the Brave dashboard — the search count should be unchanged).
- Clicking a candidate prefills the FilmForm below.

- [ ] **Step 5: Test the Brave-fallback happy path**

Clear the form (click "Start over" or reload the page). Type `midsommar` and hit Search.

Expected:
- Candidate cards appear with "via Apple TV search" badges.
- Brave dashboard shows one query consumed.
- Clicking a candidate prefills the FilmForm with title, director, year, etc.

- [ ] **Step 6: Test the brave-empty case**

Type `xqzzyyabc definitely not a movie` and hit Search.

Expected: red italic message `No Apple TV results for "xqzzyyabc definitely not a movie". Try a different spelling or use manual entry.`

- [ ] **Step 7: Test the all-streaming-only case (best-effort)**

Type a title known to be streaming-only on Apple TV (e.g., a Netflix original like `stranger things`). This may or may not trigger the case depending on Brave's current index.

Expected: either brave-empty OR all-streaming-only, both are acceptable outcomes.

- [ ] **Step 8: Test the brave-error case**

Temporarily rename `BRAVE_SEARCH_API_KEY` to something invalid in `app/.env.local` and restart the dev server. Type `midsommar` and hit Search.

Expected: red italic message `Search unavailable — try again in a moment.` Server logs show `apple-tv-search: Brave returned HTTP 401` or similar.

Restore the correct key, restart the dev server, and verify Search works again.

- [ ] **Step 9: Stop the dev server**

Ctrl-C the `npm run dev` process. No commit — this task made no code changes.

---

## Task 10: Add Vercel env var + update CLAUDE.md Gotchas + deploy

**Files:**
- Modify: `CLAUDE.md` (Gotchas section — add Brave key rotation note)
- Vercel env: add `BRAVE_SEARCH_API_KEY` (sensitive) to production, preview, development

- [ ] **Step 1: Add `BRAVE_SEARCH_API_KEY` to Vercel (from repo root)**

Run three commands, each prompts interactively for the key value:

```bash
cd /home/cthulhulemon/film_goblin
npx vercel env add BRAVE_SEARCH_API_KEY production
npx vercel env add BRAVE_SEARCH_API_KEY preview
npx vercel env add BRAVE_SEARCH_API_KEY development
```

At each prompt, paste the same Brave key used in `app/.env.local`. Vercel defaults new vars to `sensitive: true` (not retrievable via `vercel env pull`).

- [ ] **Step 2: Verify the env var landed in all three environments**

Run: `npx vercel env ls`
Expected: `BRAVE_SEARCH_API_KEY` appears three times (Production, Preview, Development), all marked Encrypted.

- [ ] **Step 3: Append the rotation note to `CLAUDE.md` Gotchas section**

Add this block after the existing "Vercel deploys must run from the repo root..." bullet and before the end of the Gotchas section:

```markdown
- **`BRAVE_SEARCH_API_KEY` lives in Vercel env (Production, Preview, Development — all sensitive) and `app/.env.local` for local dev.** Used only by `app/lib/actions/admin/apple-tv-search.ts`. To rotate: regenerate the key at brave.com/search/api → `npx vercel env rm BRAVE_SEARCH_API_KEY <env>` + `npx vercel env add BRAVE_SEARCH_API_KEY <env>` for each of production/preview/development → update `app/.env.local` → redeploy with `npx vercel deploy --prod --yes` from the repo root.
```

- [ ] **Step 4: Deploy to production**

Run: `cd /home/cthulhulemon/film_goblin && npx vercel deploy --prod --yes`

Expected: build succeeds, deploy URL returned, "aliased to film-goblin.vercel.app".

- [ ] **Step 5: Smoke-test production**

Open https://film-goblin.vercel.app/admin/films/new in a browser signed in as an admin. Search for `midsommar`. Expected: candidate cards with "via Apple TV search" badges. Click one — form prefills correctly.

- [ ] **Step 6: Commit the CLAUDE.md edit**

Write `/tmp/msg.txt`:

```
docs: document BRAVE_SEARCH_API_KEY rotation in Gotchas

Used by app/lib/actions/admin/apple-tv-search.ts (Lane B of the
Apple TV add-film helpers). Rotation involves regenerating at
brave.com/search/api, updating all three Vercel envs, and
updating app/.env.local.
```

```bash
git add CLAUDE.md
git commit -F /tmp/msg.txt
```

- [ ] **Step 7: Final sanity check**

Run: `git log --oneline -12`
Expected: the last ~8 commits are the Lane B chain, ending with the CLAUDE.md edit. No unstaged changes (`git status` clean).

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test && npm run typecheck`
Expected: all tests pass, no type errors.

---

## Summary

**Total tasks:** 10
**Estimated total:** ~6 hours (matches the spec estimate)
**Test count delta:** +18 (4 resolve-adam-id + 14 apple-tv-search)
**Net new files:** 7 (1 lib + 1 action + 1 component + 4 fixtures/tests)
**Deleted files:** 1 (iTunesSearchBox.tsx)
**Env vars added:** 1 (`BRAVE_SEARCH_API_KEY`)

**Key invariants to preserve throughout:**
- Admin UX: the Add Film page keeps its three-option layout. Only Option 1's widget changes.
- Candidate shape: `SearchCandidate extends ITunesSearchHit` — downstream `onPick → FilmForm → adminCreateFilm` is untouched.
- Error policy: admin sees only working candidates. Extraction failures log to server-side `console.*` with the `apple-tv-search:` prefix.
- Test style: `vi.mock` + `vi.spyOn(globalThis, "fetch")`, no MSW, matches the existing `tests/routes/cron-refresh-prices.test.ts` pattern.
