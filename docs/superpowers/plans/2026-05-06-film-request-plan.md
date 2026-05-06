# Film Request Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users request missing films from the discover page; feed an admin queue with request counts, one-click add-to-catalog, and bell notifications on fulfillment.

**Architecture:** Multi-step search fallback (iTunes direct → Brave/Apple TV → TMDB → manual) runs at request time and stores full metadata on `film_requests`. Admin queue splits on `needs_itunes_id`: iTunes-confirmed rows get a direct `fulfillFilmRequest` save; TMDB/manual rows open a pre-filled form at `/admin/films/new?request_id=`. A shared `fulfillRequest` helper handles status update + notification batch insert for both paths.

**Tech Stack:** Next.js 15 App Router, Supabase (service-role for cross-user reads), BottomSheet component, Vitest for unit tests.

---

## File Map

| File | Action |
|------|--------|
| `db/migrations/0165_film_requests.sql` | Create |
| `app/lib/search/apple-tv.ts` | Create (extract from admin action) |
| `app/lib/search/tmdb.ts` | Create (extract from admin action) |
| `app/lib/actions/admin/apple-tv-search.ts` | Modify (use shared helper) |
| `app/lib/actions/admin/tmdb.ts` | Modify (use shared helper) |
| `app/lib/actions/film-requests.ts` | Create |
| `app/tests/actions/film-requests.test.ts` | Create |
| `app/components/FilmRequestSheet.tsx` | Create |
| `app/app/films/page.tsx` | Modify (empty state) |
| `app/components/notifications/NotificationRow.tsx` | Modify (new kind) |
| `app/app/settings/SettingsForm.tsx` | Modify (toggle) |
| `app/app/admin/film-requests/page.tsx` | Create |
| `app/app/admin/page.tsx` | Modify (new tile) |
| `app/app/admin/films/new/AddFilmClient.tsx` | Modify (request_id pre-fill) |
| `app/lib/supabase/types.ts` | Regen after migration |

---

## Task 1: Migration

**Files:**
- Create: `db/migrations/0165_film_requests.sql`

- [ ] **Step 1: Write the migration**

```sql
-- db/migrations/0165_film_requests.sql

-- Extend the notification_kind enum
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'film_request_fulfilled';

-- film_requests: one row per unique requested film
CREATE TABLE film_requests (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  itunes_id         BIGINT,
  tmdb_id           INT,
  title             TEXT        NOT NULL,
  year              INT,
  artwork_url       TEXT,
  director          TEXT,
  description       TEXT,
  runtime_min       INT,
  genre_primary     TEXT,
  content_advisory  TEXT,
  itunes_url        TEXT,
  source            TEXT        NOT NULL CHECK (source IN ('itunes', 'tmdb', 'manual')),
  needs_itunes_id   BOOLEAN     NOT NULL DEFAULT false,
  request_count     INT         NOT NULL DEFAULT 1,
  status            TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled')),
  fulfilled_film_id UUID        REFERENCES films(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- film_request_users: who requested what
CREATE TABLE film_request_users (
  request_id  UUID        NOT NULL REFERENCES film_requests(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);

-- notification opt-out
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_film_requests BOOLEAN NOT NULL DEFAULT true;

-- RLS: film_requests
ALTER TABLE film_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can insert film_requests"
  ON film_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "users can read their own requested films"
  ON film_requests FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT request_id FROM film_request_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "staff can manage film_requests"
  ON film_requests FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff')
  );

-- RLS: film_request_users
ALTER TABLE film_request_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can insert their own film_request_users rows"
  ON film_request_users FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users can read their own film_request_users rows"
  ON film_request_users FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "staff can read all film_request_users"
  ON film_request_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff')
  );
```

- [ ] **Step 2: Run pg-mem smoke test**

```bash
cd db && npm test
```

Expected: all existing tests pass, no parse errors on new migration.

- [ ] **Step 3: Apply to production**

```bash
cd db
set -a; source ../app/.env.local; set +a
npm run migrate
```

Expected: `Applied 0165_film_requests.sql` in output.

- [ ] **Step 4: Regen types**

```bash
cd app && npm run gen:types
```

Then open `app/lib/supabase/types.ts` and re-apply every hand-edit listed in the warning block at the top of the file before saving.

- [ ] **Step 5: Commit**

Write to `/tmp/msg.txt`:
```
feat(db): film_requests + film_request_users tables, notify_film_requests profile column (mig 0165)
```
Then:
```bash
git add db/migrations/0165_film_requests.sql app/lib/supabase/types.ts
git commit -F /tmp/msg.txt
```

---

## Task 2: Extract Brave/Apple TV Search Helper

The admin action currently has `tryBraveSearch` inlined. Extract the shared bits into `app/lib/search/apple-tv.ts` so the user-facing action can call it without `requireAdmin`.

**Files:**
- Create: `app/lib/search/apple-tv.ts`
- Modify: `app/lib/actions/admin/apple-tv-search.ts`

- [ ] **Step 1: Create the shared helper**

```typescript
// app/lib/search/apple-tv.ts
import { parseFilm, fetchPrices } from "film-goblin-worker";
import { extractAdamIdFromHtml } from "@/lib/apple-tv/resolve-adam-id";
import { toHit, type ITunesSearchHit } from "@/lib/actions/admin/itunes-hit";

const APPLE_TV_SEARCH_REGION = "us";
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const CANDIDATE_LIMIT = 5;
export const APPLE_TV_URL_RE = new RegExp(
  `^https://tv\\.apple\\.com/${APPLE_TV_SEARCH_REGION}/movie/[a-z0-9-]+/umc\\.cmc\\.[a-z0-9]+$`
);

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
      headers: { "X-Subscription-Token": key, Accept: "application/json" },
    });
    if (!res.ok) {
      console.error(`apple-tv-search: Brave returned HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as BraveResponse;
    return body.web?.results?.map(r => r.url).filter((u): u is string => !!u) ?? [];
  } catch (e) {
    console.error("apple-tv-search: Brave fetch threw:", e);
    return null;
  }
}

async function fetchCandidateFromUrl(url: string): Promise<ITunesSearchHit | null> {
  try {
    const pageRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const adamId = extractAdamIdFromHtml(html);
    if (adamId === null) return null;
    const priceRes = await fetchPrices([adamId]);
    if (priceRes.resultCount === 0) return null;
    const parsed = parseFilm(priceRes.results[0]);
    if (!parsed) return null;
    return toHit(parsed);
  } catch {
    return null;
  }
}

export type AppleTvSearchResult =
  | { ok: true; candidates: ITunesSearchHit[] }
  | { ok: false; reason: "brave-empty" | "all-streaming-only" | "brave-error"; message: string };

export async function searchAppleTv(term: string): Promise<AppleTvSearchResult> {
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
  const candidates = settled.filter((c): c is ITunesSearchHit => c !== null);
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

- [ ] **Step 2: Update the admin action to use the shared helper**

Replace the body of `app/lib/actions/admin/apple-tv-search.ts` with:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { searchAppleTv, type AppleTvSearchResult } from "@/lib/search/apple-tv";
import type { ITunesSearchHit } from "./itunes-hit";

export type SearchCandidate = ITunesSearchHit;
export type SearchResult = AppleTvSearchResult;

export async function adminSearchAppleTv(term: string): Promise<SearchResult> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const trimmed = term.trim();
  if (!trimmed) return { ok: true, candidates: [] };
  return searchAppleTv(trimmed);
}
```

- [ ] **Step 3: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/lib/search/apple-tv.ts app/lib/actions/admin/apple-tv-search.ts
printf 'refactor(search): extract Brave/Apple TV search into shared lib/search/apple-tv\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>' > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

## Task 3: Extract TMDB Search Helper

**Files:**
- Create: `app/lib/search/tmdb.ts`
- Modify: `app/lib/actions/admin/tmdb.ts`

- [ ] **Step 1: Create the shared TMDB helper**

```typescript
// app/lib/search/tmdb.ts
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/w780";

function apiKey(): string {
  const k = process.env.TMDB_API_KEY;
  if (!k) throw new Error("TMDB_API_KEY not configured");
  return k;
}

export interface TmdbCandidate {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  overview: string;
}

export interface TmdbFilmFields {
  itunes_id: null;
  title: string;
  director: string;
  year: number;
  runtime_min: number;
  genre_primary: string;
  description: string;
  content_advisory: string;
  artwork_url: string;
  itunes_url: string;
  tracking: boolean;
  available: boolean;
}

export async function searchTmdb(query: string): Promise<
  | { ok: true; candidates: TmdbCandidate[] }
  | { ok: false; error: string }
> {
  if (!query.trim()) return { ok: true, candidates: [] };
  try {
    const url = `${TMDB_BASE}/search/movie?api_key=${apiKey()}&query=${encodeURIComponent(query)}&language=en-US&include_adult=false`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`TMDB returned ${res.status}`);
    const data = await res.json();
    const candidates: TmdbCandidate[] = (data.results ?? []).slice(0, 10).map((r: any) => ({
      tmdb_id: r.id,
      title: r.title,
      year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
      poster_url: r.poster_path ? `${IMG_BASE}${r.poster_path}` : null,
      overview: r.overview ?? "",
    }));
    return { ok: true, candidates };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "TMDB search failed." };
  }
}

export async function lookupTmdb(tmdbId: number): Promise<
  | { ok: true; fields: TmdbFilmFields }
  | { ok: false; error: string }
> {
  try {
    const k = apiKey();
    const [movieRes, creditsRes, releaseDatesRes] = await Promise.all([
      fetch(`${TMDB_BASE}/movie/${tmdbId}?api_key=${k}&language=en-US`, { cache: "no-store" }),
      fetch(`${TMDB_BASE}/movie/${tmdbId}/credits?api_key=${k}`, { cache: "no-store" }),
      fetch(`${TMDB_BASE}/movie/${tmdbId}/release_dates?api_key=${k}`, { cache: "no-store" }),
    ]);
    if (!movieRes.ok) throw new Error(`TMDB movie fetch returned ${movieRes.status}`);
    const [movie, credits, releaseDates] = await Promise.all([
      movieRes.json(),
      creditsRes.ok ? creditsRes.json() : { crew: [] },
      releaseDatesRes.ok ? releaseDatesRes.json() : { results: [] },
    ]);
    const director = (credits.crew ?? []).find((c: any) => c.job === "Director")?.name ?? "";
    const usEntry = (releaseDates.results ?? []).find((r: any) => r.iso_3166_1 === "US");
    const certification = usEntry?.release_dates?.find((d: any) => d.certification)?.certification ?? "";
    return {
      ok: true,
      fields: {
        itunes_id: null,
        title: movie.title ?? "",
        director,
        year: movie.release_date ? Number(movie.release_date.slice(0, 4)) : 0,
        runtime_min: movie.runtime ?? 0,
        genre_primary: movie.genres?.[0]?.name ?? "",
        description: movie.overview ?? "",
        content_advisory: certification,
        artwork_url: movie.poster_path ? `${IMG_BASE}${movie.poster_path}` : "",
        itunes_url: "",
        tracking: false,
        available: true,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "TMDB lookup failed." };
  }
}
```

- [ ] **Step 2: Update the admin TMDB action to use the shared helper**

Replace `app/lib/actions/admin/tmdb.ts` body:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { searchTmdb, lookupTmdb, type TmdbCandidate, type TmdbFilmFields } from "@/lib/search/tmdb";
import type { FilmFormFields } from "./films";

export type { TmdbCandidate };

export async function adminSearchTmdb(query: string): Promise<
  | { ok: true; candidates: TmdbCandidate[] }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  return searchTmdb(query);
}

export async function adminLookupTmdb(tmdbId: number): Promise<
  | { ok: true; fields: FilmFormFields }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const result = await lookupTmdb(tmdbId);
  if (!result.ok) return result;
  return { ok: true, fields: result.fields as FilmFormFields };
}
```

- [ ] **Step 3: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/lib/search/tmdb.ts app/lib/actions/admin/tmdb.ts
printf 'refactor(search): extract TMDB search into shared lib/search/tmdb\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>' > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

## Task 4: Search Fallback Action (TDD)

**Files:**
- Create: `app/lib/actions/film-requests.ts` (searchFilmForRequest only)
- Create: `app/tests/actions/film-requests.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/tests/actions/film-requests.test.ts
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
vi.mock("@/lib/actions/admin/itunes-hit", () => ({
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
    mockSearchFilms.mockResolvedValue({ resultCount: 1, results: [{}] });
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
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/film-requests.test.ts
```

Expected: FAIL — `searchFilmForRequest` not found.

- [ ] **Step 3: Implement `searchFilmForRequest`**

```typescript
// app/lib/actions/film-requests.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { searchFilms, parseFilm } from "film-goblin-worker";
import { toHit, type ITunesSearchHit } from "@/lib/actions/admin/itunes-hit";
import { searchAppleTv } from "@/lib/search/apple-tv";
import { searchTmdb, type TmdbCandidate } from "@/lib/search/tmdb";

export type FilmRequestCandidate =
  | { source: "itunes"; hit: ITunesSearchHit }
  | { source: "tmdb"; hit: TmdbCandidate }
  | { source: "manual"; title: string };

export type SearchForRequestResult =
  | { ok: true; result: FilmRequestCandidate }
  | { ok: false; error: string };

export async function searchFilmForRequest(query: string): Promise<SearchForRequestResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to request films." };

  const trimmed = query.trim();
  if (!trimmed) return { ok: false, error: "Enter a film title to search." };

  // Step 1: iTunes direct search
  try {
    const itunesRes = await searchFilms(trimmed, { limit: 3 });
    if (itunesRes.resultCount > 0) {
      const parsed = parseFilm(itunesRes.results[0]);
      if (parsed) {
        return { ok: true, result: { source: "itunes", hit: toHit(parsed) } };
      }
    }
  } catch {
    // fall through to next step
  }

  // Step 2: Brave → Apple TV → iTunes lookup
  try {
    const braveRes = await searchAppleTv(trimmed);
    if (braveRes.ok && braveRes.candidates.length > 0) {
      return { ok: true, result: { source: "itunes", hit: braveRes.candidates[0] } };
    }
  } catch {
    // fall through
  }

  // Step 3: TMDB
  try {
    const tmdbRes = await searchTmdb(trimmed);
    if (tmdbRes.ok && tmdbRes.candidates.length > 0) {
      return { ok: true, result: { source: "tmdb", hit: tmdbRes.candidates[0] } };
    }
  } catch {
    // fall through
  }

  // Step 4: Manual fallback
  return { ok: true, result: { source: "manual", title: trimmed } };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/film-requests.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/lib/actions/film-requests.ts app/tests/actions/film-requests.test.ts
printf 'feat(film-requests): searchFilmForRequest — iTunes → Brave → TMDB → manual fallback chain\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>' > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

## Task 5: Submit + Fulfill Actions (TDD)

**Files:**
- Modify: `app/lib/actions/film-requests.ts` (add submitFilmRequest, fulfillRequest, fulfillFilmRequest)
- Modify: `app/tests/actions/film-requests.test.ts` (add submit + fulfill tests)

- [ ] **Step 1: Write the failing tests — append to existing test file**

```typescript
// Append to app/tests/actions/film-requests.test.ts

// ── submitFilmRequest ───────────────────────────────────────────────────────

vi.mock("@/lib/supabase/service-role", () => ({
  serviceRoleClient: vi.fn(),
}));

import { submitFilmRequest, fulfillRequest } from "@/lib/actions/film-requests";
import { serviceRoleClient } from "@/lib/supabase/service-role";

const mockServiceRoleClient = vi.mocked(serviceRoleClient);

function makeServiceClient(overrides: Record<string, any> = {}) {
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    in: vi.fn().mockReturnThis(),
    ...overrides,
  });
  return { from } as any;
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
    const svc = makeServiceClient();
    svc.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "film-abc" }, error: null }),
    });
    mockServiceRoleClient.mockReturnValue(svc);

    const result = await submitFilmRequest(BASE_INPUT);

    expect(result).toEqual({ status: "already_in_catalog", filmId: "film-abc" });
  });

  it("returns ok and inserts when no existing film or request", async () => {
    let callCount = 0;
    const svc = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockResolvedValue({ data: { id: "req-1" }, error: null }),
          single: vi.fn().mockResolvedValue({ data: { id: "req-1" }, error: null }),
        };
      }),
    } as any;
    mockServiceRoleClient.mockReturnValue(svc);

    const result = await submitFilmRequest(BASE_INPUT);

    expect(result).toEqual({ status: "ok" });
  });
});

describe("fulfillRequest", () => {
  it("updates status and inserts notifications for opted-in users", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const svc = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "film_request_users") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [{ user_id: "u1" }, { user_id: "u2" }], error: null,
            }),
          };
        }
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [
                { id: "u1", notify_film_requests: true },
                { id: "u2", notify_film_requests: false },
              ], error: null,
            }),
          };
        }
        if (table === "notifications") return { insert: insertMock };
        if (table === "film_requests") return { update: updateMock };
        return {};
      }),
    } as any;

    await fulfillRequest(svc, "req-1", "film-abc", "The Fly");

    // Only u1 opted in — one notification
    expect(insertMock).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: "u1", kind: "film_request_fulfilled" }),
    ]);
    // Not called with u2
    const calls = insertMock.mock.calls[0][0];
    expect(calls.some((n: any) => n.user_id === "u2")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — verify new ones fail**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/film-requests.test.ts
```

Expected: new describe blocks FAIL — functions not exported yet.

- [ ] **Step 3: Implement `submitFilmRequest`, `fulfillRequest`, `fulfillFilmRequest`**

Append to `app/lib/actions/film-requests.ts`:

```typescript
import { revalidatePath } from "next/cache";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { requireAdmin } from "@/lib/auth/require-admin";
import { adminCreateFilm } from "@/lib/actions/admin/films";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface FilmRequestInput {
  title: string;
  year: number | null;
  source: "itunes" | "tmdb" | "manual";
  needs_itunes_id: boolean;
  itunes_id: number | null;
  tmdb_id: number | null;
  artwork_url: string | null;
  director: string | null;
  description: string | null;
  runtime_min: number | null;
  genre_primary: string | null;
  content_advisory: string | null;
  itunes_url: string | null;
}

export type SubmitFilmRequestResult =
  | { status: "ok" }
  | { status: "already_in_catalog"; filmId: string }
  | { status: "already_requested"; requestCount: number }
  | { status: "already_on_list" }
  | { status: "error"; message: string };

export async function submitFilmRequest(input: FilmRequestInput): Promise<SubmitFilmRequestResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Not signed in." };

  const svc = serviceRoleClient();

  // 1. Already in catalog?
  let filmQuery = svc.from("films").select("id");
  if (input.itunes_id) {
    filmQuery = (filmQuery as any).eq("itunes_id", input.itunes_id);
  } else {
    filmQuery = (filmQuery as any).eq("title", input.title).eq("year", input.year);
  }
  const { data: existingFilm } = await (filmQuery as any).maybeSingle();
  if (existingFilm) return { status: "already_in_catalog", filmId: existingFilm.id };

  // 2. Already requested?
  let reqQuery = svc.from("film_requests").select("id, request_count").eq("status", "pending");
  if (input.itunes_id) {
    reqQuery = (reqQuery as any).eq("itunes_id", input.itunes_id);
  } else {
    reqQuery = (reqQuery as any).eq("title", input.title).eq("year", input.year);
  }
  const { data: existingReq } = await (reqQuery as any).maybeSingle();

  if (existingReq) {
    // Check if this user is already on the list
    const { data: alreadyUser } = await svc
      .from("film_request_users")
      .select("user_id")
      .eq("request_id", existingReq.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (alreadyUser) return { status: "already_on_list" };

    // Add user to the request + increment count
    await svc.from("film_request_users").insert({ request_id: existingReq.id, user_id: user.id });
    await svc
      .from("film_requests")
      .update({ request_count: existingReq.request_count + 1, updated_at: new Date().toISOString() })
      .eq("id", existingReq.id);

    return { status: "already_requested", requestCount: existingReq.request_count + 1 };
  }

  // 3. New request
  const { data: newReq, error: insertErr } = await svc
    .from("film_requests")
    .insert({
      title: input.title,
      year: input.year,
      source: input.source,
      needs_itunes_id: input.needs_itunes_id,
      itunes_id: input.itunes_id,
      tmdb_id: input.tmdb_id,
      artwork_url: input.artwork_url,
      director: input.director,
      description: input.description,
      runtime_min: input.runtime_min,
      genre_primary: input.genre_primary,
      content_advisory: input.content_advisory,
      itunes_url: input.itunes_url,
    } as never)
    .select("id")
    .single();

  if (insertErr || !newReq) {
    return { status: "error", message: insertErr?.message ?? "Failed to save request." };
  }

  await svc.from("film_request_users").insert({ request_id: newReq.id, user_id: user.id });

  return { status: "ok" };
}

// Shared helper: mark fulfilled + notify requesters
export async function fulfillRequest(
  svc: Client,
  requestId: string,
  filmId: string,
  filmTitle: string,
): Promise<void> {
  // Mark fulfilled
  await svc
    .from("film_requests")
    .update({ status: "fulfilled", fulfilled_film_id: filmId, updated_at: new Date().toISOString() } as never)
    .eq("id", requestId);

  // Get all requesters
  const { data: requesters } = await svc
    .from("film_request_users")
    .select("user_id")
    .eq("request_id", requestId);
  if (!requesters || requesters.length === 0) return;

  const userIds = requesters.map(r => r.user_id);

  // Filter to opted-in users
  const { data: profiles } = await svc
    .from("profiles")
    .select("id, notify_film_requests")
    .in("id", userIds);
  const optedIn = (profiles ?? []).filter(p => p.notify_film_requests !== false).map(p => p.id);
  if (optedIn.length === 0) return;

  // Batch insert notifications
  await svc.from("notifications").insert(
    optedIn.map(userId => ({
      user_id: userId,
      kind: "film_request_fulfilled" as const,
      actor_user_id: null,
      payload: { film_id: filmId, film_title: filmTitle, request_id: requestId },
    })) as never,
  );
}

// Admin: fulfill an iTunes-confirmed request directly (no form needed)
export async function fulfillFilmRequest(requestId: string): Promise<
  | { ok: true; filmId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const svc = serviceRoleClient();

  const { data: req, error: fetchErr } = await svc
    .from("film_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) return { ok: false, error: "Request not found." };
  if (req.status === "fulfilled") return { ok: false, error: "Already fulfilled." };

  const createResult = await adminCreateFilm({
    itunes_id: req.itunes_id,
    title: req.title,
    director: req.director ?? "",
    year: req.year ?? 0,
    runtime_min: req.runtime_min ?? 0,
    genre_primary: req.genre_primary ?? "",
    description: req.description ?? "",
    content_advisory: req.content_advisory ?? "",
    artwork_url: req.artwork_url ?? "",
    itunes_url: req.itunes_url ?? "",
    tracking: true,
    available: true,
  });

  if (!createResult.ok) return createResult;

  await fulfillRequest(svc, requestId, createResult.filmId, req.title);
  revalidatePath("/admin/film-requests");
  revalidatePath("/films");

  return { ok: true, filmId: createResult.filmId };
}
```

- [ ] **Step 4: Run all tests**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/film-requests.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/lib/actions/film-requests.ts app/tests/actions/film-requests.test.ts
printf 'feat(film-requests): submitFilmRequest, fulfillRequest, fulfillFilmRequest actions\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>' > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

## Task 6: FilmRequestSheet Component

**Files:**
- Create: `app/components/FilmRequestSheet.tsx`

- [ ] **Step 1: Create the component**

```typescript
// app/components/FilmRequestSheet.tsx
"use client";

import { useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import { searchFilmForRequest, submitFilmRequest } from "@/lib/actions/film-requests";
import type { FilmRequestCandidate, SearchForRequestResult } from "@/lib/actions/film-requests";
import { useToast } from "@/components/ToastProvider";

interface Props {
  query: string;
  onClose: () => void;
}

export default function FilmRequestSheet({ query, onClose }: Props) {
  const { toast } = useToast();
  const [stage, setStage] = useState<"searching" | "confirm" | "submitting" | "done">("searching");
  const [candidate, setCandidate] = useState<FilmRequestCandidate | null>(null);
  const [manualTitle, setManualTitle] = useState(query);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Kick off search on mount
  useState(() => {
    startTransition(async () => {
      const res: SearchForRequestResult = await searchFilmForRequest(query);
      if (!res.ok) {
        setResultMsg(res.error);
        setStage("done");
        return;
      }
      setCandidate(res.result);
      setStage("confirm");
    });
  });

  async function handleSubmit() {
    if (!candidate) return;
    setStage("submitting");

    const input = candidate.source === "itunes"
      ? {
          title: candidate.hit.title,
          year: candidate.hit.year,
          source: "itunes" as const,
          needs_itunes_id: false,
          itunes_id: candidate.hit.itunes_id,
          tmdb_id: null,
          artwork_url: candidate.hit.artwork_url,
          director: candidate.hit.director,
          description: candidate.hit.description,
          runtime_min: candidate.hit.runtime_min,
          genre_primary: candidate.hit.genre_primary,
          content_advisory: candidate.hit.content_advisory,
          itunes_url: candidate.hit.itunes_url,
        }
      : candidate.source === "tmdb"
      ? {
          title: candidate.hit.title,
          year: candidate.hit.year,
          source: "tmdb" as const,
          needs_itunes_id: true,
          itunes_id: null,
          tmdb_id: candidate.hit.tmdb_id,
          artwork_url: candidate.hit.poster_url,
          director: null,
          description: candidate.hit.overview,
          runtime_min: null,
          genre_primary: null,
          content_advisory: null,
          itunes_url: null,
        }
      : {
          title: manualTitle.trim(),
          year: null,
          source: "manual" as const,
          needs_itunes_id: true,
          itunes_id: null,
          tmdb_id: null,
          artwork_url: null,
          director: null,
          description: null,
          runtime_min: null,
          genre_primary: null,
          content_advisory: null,
          itunes_url: null,
        };

    const result = await submitFilmRequest(input);

    if (result.status === "ok") {
      toast("Request sent. We'll notify you when it's added.");
      onClose();
      return;
    }
    if (result.status === "already_in_catalog") {
      setResultMsg(`already_in_catalog:${result.filmId}`);
    } else if (result.status === "already_requested") {
      setResultMsg(`already_requested:${result.requestCount}`);
    } else if (result.status === "already_on_list") {
      setResultMsg("already_on_list");
    } else {
      setResultMsg(`error:${result.message}`);
    }
    setStage("done");
  }

  const artworkUrl =
    candidate?.source === "itunes" ? candidate.hit.artwork_url
    : candidate?.source === "tmdb" ? candidate.hit.poster_url
    : null;
  const title =
    candidate?.source === "itunes" ? candidate.hit.title
    : candidate?.source === "tmdb" ? candidate.hit.title
    : null;
  const year =
    candidate?.source === "itunes" ? candidate.hit.year
    : candidate?.source === "tmdb" ? candidate.hit.year
    : null;
  const director =
    candidate?.source === "itunes" ? candidate.hit.director : null;

  return (
    <BottomSheet title="Request a Film" onClose={onClose}>
      <div style={{ padding: "0 20px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

        {stage === "searching" && (
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", textAlign: "center", paddingTop: 20 }}>
            Searching…
          </p>
        )}

        {stage === "confirm" && candidate && candidate.source !== "manual" && (
          <>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              {artworkUrl && (
                <img
                  src={artworkUrl}
                  alt={title ?? ""}
                  style={{ width: 64, height: 96, objectFit: "cover", borderRadius: 4, flexShrink: 0, border: "1px solid #333" }}
                />
              )}
              <div>
                <div className="head" style={{ fontSize: 18, lineHeight: 1.2 }}>{title}</div>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                  {[year, director].filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15 }}>
              This the one?
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" onClick={handleSubmit} disabled={stage !== "confirm"}>
                Request it
              </button>
              <button className="btn btn-outline" onClick={onClose}>
                Not quite
              </button>
            </div>
          </>
        )}

        {stage === "confirm" && candidate?.source === "manual" && (
          <>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, color: "var(--muted)" }}>
              We couldn't find this film in any database. You can still request it by title:
            </p>
            <input
              className="input"
              value={manualTitle}
              onChange={e => setManualTitle(e.target.value)}
              placeholder="Film title"
              style={{ fontSize: 15 }}
            />
            <button className="btn" onClick={handleSubmit} disabled={!manualTitle.trim()}>
              Request it
            </button>
          </>
        )}

        {stage === "submitting" && (
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", textAlign: "center" }}>
            Sending request…
          </p>
        )}

        {stage === "done" && resultMsg && (() => {
          if (resultMsg.startsWith("already_in_catalog:")) {
            const filmId = resultMsg.replace("already_in_catalog:", "");
            return (
              <p style={{ fontFamily: "var(--font-serif)", fontSize: 15 }}>
                Already in the catalog.{" "}
                <a href={`/film/${filmId}`} style={{ color: "var(--accent)" }}>View it →</a>
              </p>
            );
          }
          if (resultMsg.startsWith("already_requested:")) {
            const count = Number(resultMsg.replace("already_requested:", ""));
            return (
              <p style={{ fontFamily: "var(--font-serif)", fontSize: 15 }}>
                Already requested by {count} {count === 1 ? "person" : "people"} — you're now on the list.
              </p>
            );
          }
          if (resultMsg === "already_on_list") {
            return (
              <p style={{ fontFamily: "var(--font-serif)", fontSize: 15 }}>
                You've already requested this one.
              </p>
            );
          }
          const errMsg = resultMsg.startsWith("error:") ? resultMsg.replace("error:", "") : resultMsg;
          return (
            <p style={{ fontFamily: "var(--font-serif)", fontSize: 15, color: "var(--blood)" }}>
              {errMsg}
            </p>
          );
        })()}

      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/FilmRequestSheet.tsx
printf 'feat(film-requests): FilmRequestSheet component\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>' > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

## Task 7: Films Page Empty State

**Files:**
- Modify: `app/app/films/page.tsx`

- [ ] **Step 1: Update the empty state**

Find the empty state block in `app/app/films/page.tsx` (around line 67):

```typescript
// BEFORE:
{films.length === 0 ? (
  <div style={{ textAlign: "center", padding: 60, fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
    No films match. The void returned nothing.
  </div>
) : (
```

Replace with:

```typescript
// AFTER:
{films.length === 0 ? (
  <FilmsEmptyState query={q} isSignedIn={!!user} />
) : (
```

- [ ] **Step 2: Add `FilmsEmptyState` as a client component — create new file**

```typescript
// app/components/FilmsEmptyState.tsx
"use client";

import { useState } from "react";
import FilmRequestSheet from "@/components/FilmRequestSheet";

interface Props {
  query: string;
  isSignedIn: boolean;
}

export default function FilmsEmptyState({ query, isSignedIn }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div style={{ textAlign: "center", padding: 60, fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
      <div>No films match. The void returned nothing.</div>
      {isSignedIn && query && (
        <div style={{ marginTop: 20 }}>
          <button
            className="btn btn-outline"
            style={{ fontFamily: "var(--font-ui)", fontStyle: "normal", fontSize: 13 }}
            onClick={() => setSheetOpen(true)}
          >
            Request this film →
          </button>
        </div>
      )}
      {sheetOpen && (
        <FilmRequestSheet query={query} onClose={() => setSheetOpen(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the import to `films/page.tsx`**

Add near the top of `app/app/films/page.tsx`:

```typescript
import FilmsEmptyState from "@/components/FilmsEmptyState";
```

- [ ] **Step 4: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/app/films/page.tsx app/components/FilmsEmptyState.tsx
printf 'feat(film-requests): empty state request button on /films\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>' > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

## Task 8: Notification Rendering

**Files:**
- Modify: `app/components/notifications/NotificationRow.tsx`

- [ ] **Step 1: Add `film_request_fulfilled` to `targetFor`**

In `targetFor`, add before the closing brace of the `switch`:

```typescript
case "film_request_fulfilled": {
  const filmId = (n.payload as { film_id?: string }).film_id;
  return filmId ? `/film/${filmId}` : "/home";
}
```

- [ ] **Step 2: Add `film_request_fulfilled` to `copyFor`**

In `copyFor`, add before the closing brace of the `switch`:

```typescript
case "film_request_fulfilled": {
  const filmTitle = (n.payload as { film_title?: string }).film_title ?? "A film you requested";
  return <><em>{filmTitle}</em> was just added to the catalog.</>;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/notifications/NotificationRow.tsx
printf 'feat(film-requests): film_request_fulfilled notification rendering\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>' > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

## Task 9: Settings Toggle

**Files:**
- Modify: `app/app/settings/SettingsForm.tsx`

- [ ] **Step 1: Add the toggle**

In `SettingsForm.tsx`, find the `notify_comment_likes` checkbox block. Add directly after it:

```typescript
<label className="check-zine">
  <input type="checkbox" name="notify_film_requests" defaultChecked={profile.notify_film_requests ?? true} />
  <span className="check-zine__box" aria-hidden="true" />
  <span className="caps" style={{ fontSize: 11 }}>Notify me when a film I requested is added</span>
</label>
```

- [ ] **Step 2: Add `notify_film_requests` to the `save()` call**

In the `save` FormData extraction block, find:
```typescript
notify_comment_likes: fd.get("notify_comment_likes") === "on",
```
Add after it:
```typescript
notify_film_requests: fd.get("notify_film_requests") === "on",
```

- [ ] **Step 3: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/app/settings/SettingsForm.tsx
printf 'feat(film-requests): notify_film_requests settings toggle\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>' > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

## Task 10: Admin Queue Page + Dashboard Tile

**Files:**
- Create: `app/app/admin/film-requests/page.tsx`
- Modify: `app/app/admin/page.tsx`

- [ ] **Step 1: Create the admin queue page**

```typescript
// app/app/admin/film-requests/page.tsx
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import TopNav from "@/components/TopNav";
import FilmRequestActions from "./FilmRequestActions";

export default async function FilmRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ show_fulfilled?: string }>;
}) {
  const sp = await searchParams;
  const showFulfilled = sp.show_fulfilled === "1";

  const supabase = await createClient();
  await requireAdmin(supabase);
  const svc = serviceRoleClient();

  let query = svc
    .from("film_requests")
    .select("*")
    .order("request_count", { ascending: false })
    .order("created_at", { ascending: false });

  if (!showFulfilled) {
    query = (query as any).eq("status", "pending");
  }

  const { data: requests } = await query;
  const rows = requests ?? [];

  const { count: fulfilledCount } = await svc
    .from("film_requests")
    .select("*", { count: "exact", head: true })
    .eq("status", "fulfilled");

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="admin" />
      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(24px, 4vw, 48px)" }}>Film Requests.</h1>
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, color: "var(--void)", opacity: 0.7, marginTop: 6 }}>
            {rows.length} {showFulfilled ? "total" : "pending"} request{rows.length !== 1 ? "s" : ""}.
          </p>
        </div>
      </section>

      <section style={{ padding: "20px 0 60px" }}>
        <div className="container-wide" style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          <div style={{ marginBottom: 8 }}>
            <a
              href={showFulfilled ? "/admin/film-requests" : "/admin/film-requests?show_fulfilled=1"}
              style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--muted)", textDecoration: "underline" }}
            >
              {showFulfilled ? "Hide fulfilled" : `Show fulfilled (${fulfilledCount ?? 0})`}
            </a>
          </div>

          {rows.length === 0 && (
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", padding: "40px 0" }}>
              No requests yet.
            </p>
          )}

          {rows.map(req => (
            <div
              key={req.id}
              style={{
                display: "flex", gap: 16, alignItems: "flex-start",
                background: "#111", border: "1px solid #2a2a2a", borderRadius: 6, padding: 16,
                opacity: req.status === "fulfilled" ? 0.5 : 1,
              }}
            >
              {req.artwork_url ? (
                <img
                  src={req.artwork_url}
                  alt={req.title}
                  style={{ width: 48, height: 72, objectFit: "cover", borderRadius: 3, flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: 48, height: 72, background: "#222", borderRadius: 3, flexShrink: 0 }} />
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="head" style={{ fontSize: 16 }}>{req.title}</div>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                  {[req.year, req.director].filter(Boolean).join(" · ")}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{
                    fontFamily: "var(--font-ui)", fontSize: 10, textTransform: "uppercase",
                    letterSpacing: "0.08em", padding: "2px 6px", borderRadius: 3,
                    background: req.source === "itunes" ? "#1a2a1a" : "#2a1a1a",
                    color: req.source === "itunes" ? "#6f6" : "#f96",
                  }}>
                    {req.source}
                  </span>
                  {req.needs_itunes_id && (
                    <span style={{
                      fontFamily: "var(--font-ui)", fontSize: 10, textTransform: "uppercase",
                      letterSpacing: "0.08em", padding: "2px 6px", borderRadius: 3,
                      background: "#2a1a00", color: "#fa0",
                    }}>
                      ⚠ needs iTunes ID
                    </span>
                  )}
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)" }}>
                    {req.request_count} {req.request_count === 1 ? "request" : "requests"}
                  </span>
                </div>
              </div>

              {req.status === "pending" && (
                <div style={{ flexShrink: 0 }}>
                  <FilmRequestActions request={req as any} />
                </div>
              )}

              {req.status === "fulfilled" && (
                <div style={{ flexShrink: 0, fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)" }}>
                  Added ✓
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Create the client actions component**

```typescript
// app/app/admin/film-requests/FilmRequestActions.tsx
"use client";

import { useRouter } from "next/navigation";
import { fulfillFilmRequest } from "@/lib/actions/film-requests";

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

  if (request.needs_itunes_id) {
    return (
      <a
        href={`/admin/films/new?request_id=${request.id}`}
        className="btn btn-sm btn-outline"
        style={{ fontSize: 12, whiteSpace: "nowrap" }}
      >
        Review & Add
      </a>
    );
  }

  return (
    <button
      className="btn btn-sm"
      style={{ fontSize: 12, whiteSpace: "nowrap" }}
      onClick={handleDirectAdd}
    >
      Add to catalog
    </button>
  );
}
```

- [ ] **Step 3: Add tile to admin dashboard**

In `app/app/admin/page.tsx`, add after the Goblin Pick tile:

```typescript
<Tile href="/admin/film-requests" title="Film Requests" blurb="Review and fulfill user requests for films not yet in the catalog." />
```

- [ ] **Step 4: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/app/admin/film-requests/ app/app/admin/page.tsx
printf 'feat(film-requests): admin queue page at /admin/film-requests\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>' > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

## Task 11: AddFilmClient Pre-fill + Fulfill on Save

When admin navigates to `/admin/films/new?request_id=<id>`, the form pre-fills with stored request metadata and calls `fulfillRequest` on save.

**Files:**
- Modify: `app/app/admin/films/new/AddFilmClient.tsx`
- Modify: `app/lib/actions/admin/films.ts`

- [ ] **Step 1: Update `adminCreateFilm` to accept optional `requestId`**

In `app/lib/actions/admin/films.ts`, update the `adminCreateFilm` signature and add fulfillment:

```typescript
// Add import at top
import { fulfillRequest } from "@/lib/actions/film-requests";
import { serviceRoleClient } from "@/lib/supabase/service-role";

// Update the function signature
export async function adminCreateFilm(
  fields: FilmFormFields,
  requestId?: string,
): Promise<
  | { ok: true; filmId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const err = validateForm(fields);
  if (err) return { ok: false, error: err };

  const payload = {
    itunes_id: fields.itunes_id,
    title: fields.title.trim(),
    director: fields.director.trim(),
    year: fields.year,
    runtime_min: fields.runtime_min,
    genre_primary: fields.genre_primary.trim(),
    description: fields.description,
    content_advisory: fields.content_advisory,
    artwork_url: fields.artwork_url.trim(),
    itunes_url: fields.itunes_url.trim(),
    tracking: fields.tracking,
    available: fields.available,
  };

  const { data, error } = await supabase
    .from("films")
    .insert(payload as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // Fulfill pending request if one triggered this add
  if (requestId) {
    const svc = serviceRoleClient();
    await fulfillRequest(svc, requestId, data.id, fields.title.trim());
    revalidatePath("/admin/film-requests");
  }

  revalidatePath("/admin/films");
  return { ok: true, filmId: data.id };
}
```

- [ ] **Step 2: Update `AddFilmClient` to read `request_id` and pre-fill**

```typescript
// app/app/admin/films/new/AddFilmClient.tsx
"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import FilmForm from "../FilmForm";
import AppleTvSearchBox from "../AppleTvSearchBox";
import ITunesPasteBox from "../iTunesPasteBox";
import TmdbSearchBox from "../TmdbSearchBox";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import type { ITunesSearchHit } from "@/lib/actions/admin/films";
import type { FilmFormFields } from "@/lib/actions/admin/films";

const BLANK: FilmFormFields = {
  itunes_id: null,
  title: "",
  director: "",
  year: 0,
  runtime_min: 0,
  genre_primary: "",
  description: "",
  content_advisory: "",
  artwork_url: "",
  itunes_url: "",
  tracking: false,
  available: true,
};

export default function AddFilmClient({ onSuccess }: { onSuccess?: () => void } = {}) {
  const searchParams = useSearchParams();
  const requestId = searchParams.get("request_id");

  const [initial, setInitial] = useState<FilmFormFields | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [requestTitle, setRequestTitle] = useState<string | null>(null);

  // If request_id present, fetch stored metadata and pre-fill
  useEffect(() => {
    if (!requestId) return;
    fetch(`/api/admin/film-request?id=${requestId}`)
      .then(r => r.json())
      .then((req: any) => {
        if (!req) return;
        setRequestTitle(req.title);
        setInitial({
          itunes_id: req.itunes_id ?? null,
          title: req.title ?? "",
          director: req.director ?? "",
          year: req.year ?? 0,
          runtime_min: req.runtime_min ?? 0,
          genre_primary: req.genre_primary ?? "",
          description: req.description ?? "",
          content_advisory: req.content_advisory ?? "",
          artwork_url: req.artwork_url ?? "",
          itunes_url: req.itunes_url ?? "",
          tracking: false,
          available: true,
        });
        setFormKey(k => k + 1);
      })
      .catch(() => {});
  }, [requestId]);

  function prefillFromHit(hit: ITunesSearchHit) {
    setInitial({
      itunes_id: hit.itunes_id,
      title: hit.title,
      director: hit.director,
      year: hit.year,
      runtime_min: hit.runtime_min,
      genre_primary: hit.genre_primary,
      description: hit.description,
      content_advisory: hit.content_advisory,
      artwork_url: hit.artwork_url,
      itunes_url: hit.itunes_url,
      tracking: true,
      available: true,
    });
    setFormKey(k => k + 1);
  }

  function startManual() {
    setInitial({ ...BLANK });
    setFormKey(k => k + 1);
  }

  return (
    <div style={{ display: "grid", gap: 28 }}>
      {requestId && requestTitle && (
        <div style={{
          background: "#1a1500", border: "1px solid #3a2a00", borderRadius: 6,
          padding: "12px 16px", fontFamily: "var(--font-ui)", fontSize: 13,
        }}>
          <span style={{ color: "#fa0" }}>⚠</span>{" "}
          Fulfilling request for <strong>&ldquo;{requestTitle}&rdquo;</strong>.
          {!initial?.itunes_id && " iTunes ID not set — film will be unavailable until added."}
        </div>
      )}

      {!initial && (
        <>
          <section>
            <h2 className="head" style={{ fontSize: 22, marginBottom: 10 }}>Option 1 — Search Apple TV</h2>
            <AppleTvSearchBox onPick={prefillFromHit} />
          </section>
          <section>
            <h2 className="head" style={{ fontSize: 22, marginBottom: 10 }}>Option 2 — Paste Apple TV URL or trackId</h2>
            <ITunesPasteBox onPick={prefillFromHit} />
          </section>
          <section>
            <h2 className="head" style={{ fontSize: 22, marginBottom: 10 }}>Option 3 — No Apple TV match? Search TMDB</h2>
            <TmdbSearchBox onPick={fields => { setInitial(fields); setFormKey(k => k + 1); }} />
            <div style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={startManual}>
                Skip — enter completely manually
              </button>
            </div>
          </section>
        </>
      )}

      {initial && (
        <section>
          {!requestId && (
            <div style={{ marginBottom: 14 }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setInitial(null)}>
                ← Start over
              </button>
            </div>
          )}
          <FilmForm key={formKey} mode="create" initial={initial} requestId={requestId ?? undefined} onSuccess={onSuccess} />
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the API route for fetching a request by ID**

```typescript
// app/app/api/admin/film-request/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json(null, { status: 400 });
  const svc = serviceRoleClient();
  const { data } = await svc.from("film_requests").select("*").eq("id", id).single();
  return NextResponse.json(data ?? null);
}
```

- [ ] **Step 4: Update `FilmForm` to pass `requestId` to `adminCreateFilm`**

In `app/app/admin/films/FilmForm.tsx`, find the props type and the submit handler:

Add `requestId?: string` to the props interface:
```typescript
interface Props {
  mode: "create" | "edit";
  initial: FilmFormFields;
  filmId?: string;
  requestId?: string;
  onSuccess?: () => void;
}
```

In the submit handler (where `adminCreateFilm` is called), pass `requestId`:
```typescript
const result = await adminCreateFilm(fields, props.requestId);
```

- [ ] **Step 5: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/app/admin/films/new/AddFilmClient.tsx app/lib/actions/admin/films.ts app/app/api/admin/film-request/route.ts app/app/admin/films/FilmForm.tsx
printf 'feat(film-requests): AddFilmClient request pre-fill + adminCreateFilm fulfillment on save\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>' > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

## Task 12: Full Run + Deploy

- [ ] **Step 1: Run all tests**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: all existing tests pass, new film-requests tests pass.

- [ ] **Step 2: Full typecheck**

```bash
cd app && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Smoke test the user flow manually**
  - Sign in, go to `/films`, search for a film not in the catalog (e.g. "The Fly")
  - Confirm "The void returned nothing" appears with "Request this film →"
  - Click button — sheet opens, poster + title shown
  - Click "Request it" — toast confirms
  - Search same title again — sheet shows "Already requested" state

- [ ] **Step 4: Smoke test the admin flow**
  - Go to `/admin/film-requests` — pending request visible
  - Click "Add to catalog" on an iTunes-confirmed request — row disappears, `/films` shows the film
  - Navigate to `/admin/films/new?request_id=<id>` for a TMDB request — form pre-fills, warning banner visible

- [ ] **Step 5: Deploy**

```bash
npx vercel deploy --prod --yes
```

Expected: build succeeds, deployed to https://film-goblin.vercel.app.
