# Apple Data Source Worker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the standalone price-tracking worker that polls iTunes Search API for Film Goblin's tracked films and writes price changes + alerts to Postgres. Ends at "a `price_alert` row exists in the database."

**Architecture:** A TypeScript Node.js package under `worker/` at the repo root. Pure-function libraries for parsing, diffing, and alerting. Thin DB layer against Postgres (via `pg`). CLI runners for invocation during development; the HTTP cron mount is deferred to the sub-project-3 Next.js scaffold. Tests are TDD: Vitest for unit tests, MSW for HTTP mocking, pg-mem for DB-integration tests.

**Tech Stack:** TypeScript · Node 20 · Vitest · MSW v2 · pg-mem v3 · node-postgres (`pg`) · `@sentry/node` · `tsx` · `dotenv`

---

## File Structure

```
worker/
├── package.json                  # Separate from Vite app; worker has its own deps
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── .gitignore
├── README.md
├── migrations/
│   ├── 0001_films.sql            # films table + indexes
│   ├── 0002_price_history.sql    # append-only price_history
│   └── 0003_watchlists_stub.sql  # minimal watchlists; owned by sub-project 2, stubbed here
├── src/
│   ├── types.ts                  # Film, PriceHistoryRow, WatchlistRow, ITunesResult, Digest, ...
│   ├── itunes.ts                 # fetchPrices, searchFilms, upscaleArtworkUrl, parseFilm
│   ├── diff.ts                   # computeDiff, shouldAlert (pure)
│   ├── db.ts                     # selectFilmsToRefresh, latestPriceHistory, upsertFilm,
│   │                             # insertPriceHistory, markUnavailable, updateLastChecked,
│   │                             # findWatchlistsForFilm, insertPriceAlert+updateLastAlertedAt (txn)
│   ├── digest.ts                 # Digest accumulator
│   ├── worker.ts                 # runOnce orchestrator
│   ├── seed.ts                   # seedFilms — curated searches + upserts
│   └── migrate.ts                # readMigrations, applyMigrations
├── scripts/
│   ├── run-migrate.ts            # CLI: apply migrations
│   ├── run-seed.ts               # CLI: run seed searches
│   ├── run-worker.ts             # CLI: run one pass of the worker
│   └── add-film.ts               # CLI: admin override, add by iTunes trackId
└── tests/
    ├── fixtures/
    │   └── itunes-responses.ts   # canned lookup/search responses
    ├── helpers/
    │   ├── db.ts                 # makeTestDb() returns pg Client wired to pg-mem
    │   └── http.ts               # setupMswServer() with lookup/search handlers
    ├── itunes.test.ts
    ├── diff.test.ts
    ├── db.test.ts
    ├── digest.test.ts
    ├── worker.test.ts            # end-to-end pipeline with pg-mem + MSW
    └── seed.test.ts
```

---

## Task 1: Scaffold the worker package

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/vitest.config.ts`
- Create: `worker/.env.example`
- Create: `worker/.gitignore`
- Create: `worker/src/index.ts` (placeholder so tsc has something to compile)

- [ ] **Step 1: Write package.json**

```json
{
  "name": "film-goblin-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "migrate": "tsx scripts/run-migrate.ts",
    "seed": "tsx scripts/run-seed.ts",
    "worker": "tsx scripts/run-worker.ts",
    "add-film": "tsx scripts/add-film.ts"
  },
  "dependencies": {
    "@sentry/node": "^8.47.0",
    "dotenv": "^16.4.7",
    "pg": "^8.13.1"
  },
  "devDependencies": {
    "@types/node": "^20.17.10",
    "@types/pg": "^8.11.10",
    "msw": "^2.7.0",
    "pg-mem": "^3.0.4",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*", "scripts/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Write vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write .env.example and .gitignore**

`.env.example`:
```
DATABASE_URL=postgres://user:pass@localhost:5432/filmgoblin
SENTRY_DSN=
```

`.gitignore`:
```
node_modules
.env
dist
coverage
```

- [ ] **Step 5: Write placeholder src/index.ts**

```typescript
// Film Goblin price-tracking worker. Entry points live in scripts/.
export const WORKER_VERSION = "0.1.0";
```

- [ ] **Step 6: Install and verify**

Run from repo root:
```
cd worker && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm install && npm run typecheck
```
Expected: no errors, `typecheck` exits 0.

- [ ] **Step 7: Commit**

```
git add worker/package.json worker/tsconfig.json worker/vitest.config.ts worker/.env.example worker/.gitignore worker/src/index.ts worker/package-lock.json
git commit -m "chore(worker): scaffold worker package with TypeScript + Vitest"
```

---

## Task 2: Type definitions

**Files:**
- Create: `worker/src/types.ts`

- [ ] **Step 1: Write types.ts**

```typescript
// Rows as stored in our Postgres.
export interface FilmRow {
  id: string;                      // uuid
  itunes_id: number;
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
  first_seen_at: Date;
  last_checked_at: Date | null;
  last_priced_at: Date | null;
}

export interface PriceHistoryRow {
  id: string;
  film_id: string;
  captured_at: Date;
  price_usd: number;
  hd_price_usd: number | null;
  is_sale: boolean;
}

export interface WatchlistRow {
  id: string;
  user_id: string;
  film_id: string;
  max_price_usd: number | null;   // alert only if current price is at-or-below this (null = any drop)
  last_alerted_at: Date | null;
}

export interface PriceAlertRow {
  id: string;
  watchlist_id: string;
  film_id: string;
  old_price_usd: number;
  new_price_usd: number;
  created_at: Date;
}

// iTunes Search API raw response shapes.
export interface ITunesLookupResponse {
  resultCount: number;
  results: ITunesResult[];
}

export interface ITunesResult {
  wrapperType?: string;
  kind?: string;                   // "feature-movie" for what we want
  trackId: number;
  trackName: string;
  artistName: string;
  releaseDate: string;             // ISO string
  trackTimeMillis?: number;
  primaryGenreName?: string;
  longDescription?: string;
  shortDescription?: string;
  contentAdvisoryRating?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
  trackPrice?: number | null;
  trackHdPrice?: number | null;
  trackRentalPrice?: number | null;
  collectionId?: number;
  collectionName?: string;
}

// Parsed shape — what we persist (minus id/timestamps the DB assigns).
export interface ParsedFilm {
  itunes_id: number;
  title: string;
  director: string;
  year: number;
  runtime_min: number;
  genre_primary: string;
  description: string;
  content_advisory: string;
  artwork_url: string;
  itunes_url: string;
  price_usd: number;
  hd_price_usd: number | null;
}
```

- [ ] **Step 2: Typecheck**

Run from `worker/`: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```
git add worker/src/types.ts
git commit -m "feat(worker): define row and response types"
```

---

## Task 3: Artwork URL upscaler

**Files:**
- Create: `worker/tests/itunes.test.ts`
- Modify: `worker/src/itunes.ts` (create in this task, extend in later tasks)

- [ ] **Step 1: Write the failing test**

`worker/tests/itunes.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { upscaleArtworkUrl } from "../src/itunes.js";

describe("upscaleArtworkUrl", () => {
  it("swaps 100x100bb.jpg to 600x600bb.jpg", () => {
    const url = "https://is1-ssl.mzstatic.com/image/thumb/Video/abc/100x100bb.jpg";
    expect(upscaleArtworkUrl(url)).toBe("https://is1-ssl.mzstatic.com/image/thumb/Video/abc/600x600bb.jpg");
  });

  it("leaves unrecognized URLs unchanged", () => {
    const url = "https://example.com/poster.png";
    expect(upscaleArtworkUrl(url)).toBe(url);
  });

  it("handles empty string", () => {
    expect(upscaleArtworkUrl("")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `worker/`: `npm test -- tests/itunes.test.ts`
Expected: FAIL with "Cannot find module '../src/itunes.js'" or equivalent.

- [ ] **Step 3: Write minimal implementation**

`worker/src/itunes.ts`:
```typescript
export function upscaleArtworkUrl(url: string): string {
  if (!url) return url;
  return url.replace("/100x100bb.jpg", "/600x600bb.jpg");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/itunes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```
git add worker/src/itunes.ts worker/tests/itunes.test.ts
git commit -m "feat(worker): upscale iTunes artwork URLs 100→600"
```

---

## Task 4: iTunes response parser

**Files:**
- Modify: `worker/tests/itunes.test.ts`
- Modify: `worker/src/itunes.ts`
- Create: `worker/tests/fixtures/itunes-responses.ts`

- [ ] **Step 1: Write fixture data**

`worker/tests/fixtures/itunes-responses.ts`:
```typescript
import type { ITunesResult } from "../../src/types.js";

export const midsommarResult: ITunesResult = {
  wrapperType: "track",
  kind: "feature-movie",
  trackId: 1468845007,
  trackName: "Midsommar",
  artistName: "Ari Aster",
  releaseDate: "2019-07-03T07:00:00Z",
  trackTimeMillis: 8820000,
  primaryGenreName: "Horror",
  longDescription: "A grief-stricken couple travels to Sweden...",
  shortDescription: "A couple travels to Sweden.",
  contentAdvisoryRating: "R",
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Video/mid/100x100bb.jpg",
  trackViewUrl: "https://tv.apple.com/us/movie/midsommar/umc.cmc.abc",
  trackPrice: 4.99,
  trackHdPrice: 4.99,
  trackRentalPrice: 3.99,
};

export const invalidPriceResult: ITunesResult = {
  ...midsommarResult,
  trackId: 9999999,
  trackName: "Invalid Price Film",
  trackPrice: 0,
};

export const nullPriceResult: ITunesResult = {
  ...midsommarResult,
  trackId: 9999998,
  trackName: "Null Price Film",
  trackPrice: null,
};

export const wrongKindResult: ITunesResult = {
  ...midsommarResult,
  trackId: 9999997,
  kind: "music-video",
  trackName: "Music Video",
};

export const missingArtworkResult: ITunesResult = {
  ...midsommarResult,
  trackId: 9999996,
  artworkUrl100: undefined,
};
```

- [ ] **Step 2: Write failing tests for parseFilm**

Append to `worker/tests/itunes.test.ts`:
```typescript
import { parseFilm } from "../src/itunes.js";
import {
  midsommarResult, invalidPriceResult, nullPriceResult,
  wrongKindResult, missingArtworkResult,
} from "./fixtures/itunes-responses.js";

describe("parseFilm", () => {
  it("parses a valid feature-movie result", () => {
    const result = parseFilm(midsommarResult);
    expect(result).not.toBeNull();
    expect(result!.itunes_id).toBe(1468845007);
    expect(result!.title).toBe("Midsommar");
    expect(result!.director).toBe("Ari Aster");
    expect(result!.year).toBe(2019);
    expect(result!.runtime_min).toBe(147);
    expect(result!.price_usd).toBe(4.99);
    expect(result!.hd_price_usd).toBe(4.99);
    expect(result!.artwork_url).toContain("600x600bb.jpg");
  });

  it("returns null for price = 0 (invalid read)", () => {
    expect(parseFilm(invalidPriceResult)).toBeNull();
  });

  it("returns null for price = null (invalid read)", () => {
    expect(parseFilm(nullPriceResult)).toBeNull();
  });

  it("returns null for price < $0.50 (invalid read)", () => {
    expect(parseFilm({ ...midsommarResult, trackPrice: 0.25 })).toBeNull();
  });

  it("returns null when kind is not feature-movie", () => {
    expect(parseFilm(wrongKindResult)).toBeNull();
  });

  it("uses shortDescription when longDescription is absent", () => {
    const result = parseFilm({ ...midsommarResult, longDescription: undefined });
    expect(result!.description).toBe("A couple travels to Sweden.");
  });

  it("handles missing artwork gracefully", () => {
    const result = parseFilm(missingArtworkResult);
    expect(result!.artwork_url).toBe("");
  });

  it("handles missing hd price", () => {
    const result = parseFilm({ ...midsommarResult, trackHdPrice: undefined });
    expect(result!.hd_price_usd).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify failures**

Run: `npm test -- tests/itunes.test.ts`
Expected: the new 8 tests FAIL (parseFilm not exported).

- [ ] **Step 4: Implement parseFilm**

Append to `worker/src/itunes.ts`:
```typescript
import type { ITunesResult, ParsedFilm } from "./types.js";

const MIN_VALID_PRICE = 0.5;

export function parseFilm(raw: ITunesResult): ParsedFilm | null {
  if (raw.kind !== "feature-movie") return null;

  const price = raw.trackPrice;
  if (price == null || price < MIN_VALID_PRICE) return null;

  const year = raw.releaseDate ? new Date(raw.releaseDate).getUTCFullYear() : 0;
  const runtime_min = raw.trackTimeMillis ? Math.round(raw.trackTimeMillis / 60000) : 0;

  return {
    itunes_id: raw.trackId,
    title: raw.trackName,
    director: raw.artistName,
    year,
    runtime_min,
    genre_primary: raw.primaryGenreName ?? "",
    description: raw.longDescription ?? raw.shortDescription ?? "",
    content_advisory: raw.contentAdvisoryRating ?? "",
    artwork_url: raw.artworkUrl100 ? upscaleArtworkUrl(raw.artworkUrl100) : "",
    itunes_url: raw.trackViewUrl ?? "",
    price_usd: price,
    hd_price_usd: raw.trackHdPrice ?? null,
  };
}
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm test -- tests/itunes.test.ts`
Expected: PASS (11 tests total).

- [ ] **Step 6: Commit**

```
git add worker/src/itunes.ts worker/tests/itunes.test.ts worker/tests/fixtures/itunes-responses.ts
git commit -m "feat(worker): parse iTunes results with invalid-read filtering"
```

---

## Task 5: iTunes HTTP fetcher

**Files:**
- Create: `worker/tests/helpers/http.ts`
- Modify: `worker/tests/itunes.test.ts`
- Modify: `worker/src/itunes.ts`

- [ ] **Step 1: Write MSW setup helper**

`worker/tests/helpers/http.ts`:
```typescript
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { ITunesLookupResponse } from "../../src/types.js";
import { midsommarResult } from "../fixtures/itunes-responses.js";

export function makeLookupHandler(
  response: Partial<ITunesLookupResponse> | (() => Response)
) {
  return http.get("https://itunes.apple.com/lookup", () => {
    if (typeof response === "function") return response();
    return HttpResponse.json({
      resultCount: response.resultCount ?? 1,
      results: response.results ?? [midsommarResult],
    });
  });
}

export function makeServer(...handlers: ReturnType<typeof http.get>[]) {
  return setupServer(...handlers);
}
```

- [ ] **Step 2: Write failing tests for fetchPrices**

Append to `worker/tests/itunes.test.ts`:
```typescript
import { afterAll, afterEach, beforeAll } from "vitest";
import { http, HttpResponse } from "msw";
import { fetchPrices } from "../src/itunes.js";
import { makeLookupHandler, makeServer } from "./helpers/http.js";

describe("fetchPrices", () => {
  const server = makeServer(makeLookupHandler({}));
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("returns results on 200", async () => {
    const res = await fetchPrices([1468845007]);
    expect(res.resultCount).toBe(1);
    expect(res.results[0].trackId).toBe(1468845007);
  });

  it("sends comma-joined ids and country=US", async () => {
    let capturedUrl = "";
    server.use(
      http.get("https://itunes.apple.com/lookup", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ resultCount: 0, results: [] });
      })
    );
    await fetchPrices([111, 222, 333]);
    expect(capturedUrl).toContain("id=111%2C222%2C333");
    expect(capturedUrl).toContain("country=US");
    expect(capturedUrl).toContain("entity=movie");
  });

  it("retries on 429 with backoff and eventually succeeds", async () => {
    let calls = 0;
    server.use(
      http.get("https://itunes.apple.com/lookup", () => {
        calls++;
        if (calls < 3) return new HttpResponse(null, { status: 429 });
        return HttpResponse.json({ resultCount: 0, results: [] });
      })
    );
    const res = await fetchPrices([1], { backoffMs: 1 });
    expect(calls).toBe(3);
    expect(res.resultCount).toBe(0);
  });

  it("throws after 3 failed retries", async () => {
    server.use(
      http.get("https://itunes.apple.com/lookup", () => new HttpResponse(null, { status: 500 }))
    );
    await expect(fetchPrices([1], { backoffMs: 1 })).rejects.toThrow(/itunes.*500/i);
  });
});
```

- [ ] **Step 3: Run to verify failures**

Run: `npm test -- tests/itunes.test.ts`
Expected: 4 new tests FAIL.

- [ ] **Step 4: Implement fetchPrices**

Append to `worker/src/itunes.ts`:
```typescript
import type { ITunesLookupResponse } from "./types.js";

interface FetchOptions {
  maxAttempts?: number;
  backoffMs?: number;
  fetchImpl?: typeof fetch;
}

export async function fetchPrices(
  iTunesIds: number[],
  opts: FetchOptions = {}
): Promise<ITunesLookupResponse> {
  const max = opts.maxAttempts ?? 3;
  const backoff = opts.backoffMs ?? 500;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const url = new URL("https://itunes.apple.com/lookup");
  url.searchParams.set("id", iTunesIds.join(","));
  url.searchParams.set("country", "US");
  url.searchParams.set("entity", "movie");

  let lastError: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const res = await fetchImpl(url.toString());
      if (res.ok) return (await res.json()) as ITunesLookupResponse;
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`itunes lookup ${res.status}`);
      } else {
        throw new Error(`itunes lookup ${res.status}`);
      }
    } catch (err) {
      lastError = err;
    }
    if (attempt < max) {
      await new Promise(r => setTimeout(r, backoff * Math.pow(2, attempt - 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm test -- tests/itunes.test.ts`
Expected: PASS (15 tests total).

- [ ] **Step 6: Commit**

```
git add worker/src/itunes.ts worker/tests/itunes.test.ts worker/tests/helpers/http.ts
git commit -m "feat(worker): fetchPrices with exponential backoff"
```

---

## Task 6: Diff engine

**Files:**
- Create: `worker/tests/diff.test.ts`
- Create: `worker/src/diff.ts`

- [ ] **Step 1: Write failing tests**

`worker/tests/diff.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { computeDiff, shouldAlert } from "../src/diff.js";
import type { PriceHistoryRow, WatchlistRow } from "../src/types.js";

const historyRow = (price_usd: number, captured_at = new Date()): PriceHistoryRow => ({
  id: "00000000-0000-0000-0000-000000000001",
  film_id: "f1",
  captured_at,
  price_usd,
  hd_price_usd: null,
  is_sale: false,
});

describe("computeDiff", () => {
  it("writeHistory=true when there is no prior history", () => {
    expect(computeDiff(null, 4.99)).toEqual({
      writeHistory: true,
      decreased: false,
      unchanged: false,
    });
  });

  it("writeHistory=false when the price is identical", () => {
    expect(computeDiff(historyRow(4.99), 4.99)).toEqual({
      writeHistory: false,
      decreased: false,
      unchanged: true,
    });
  });

  it("decreased=true when the price dropped", () => {
    expect(computeDiff(historyRow(5.99), 4.99)).toEqual({
      writeHistory: true,
      decreased: true,
      unchanged: false,
    });
  });

  it("writeHistory=true but decreased=false when the price went up", () => {
    expect(computeDiff(historyRow(4.99), 5.99)).toEqual({
      writeHistory: true,
      decreased: false,
      unchanged: false,
    });
  });
});

const watchlist = (overrides: Partial<WatchlistRow> = {}): WatchlistRow => ({
  id: "w1",
  user_id: "u1",
  film_id: "f1",
  max_price_usd: null,
  last_alerted_at: null,
  ...overrides,
});

describe("shouldAlert", () => {
  const now = new Date("2026-04-20T12:00:00Z");

  it("alerts when max_price_usd is null and last_alerted_at is null", () => {
    expect(shouldAlert(watchlist(), 4.99, now)).toBe(true);
  });

  it("does not alert when newPrice exceeds max_price_usd", () => {
    expect(shouldAlert(watchlist({ max_price_usd: 5.00 }), 6.99, now)).toBe(false);
  });

  it("alerts when newPrice equals max_price_usd", () => {
    expect(shouldAlert(watchlist({ max_price_usd: 5.00 }), 5.00, now)).toBe(true);
  });

  it("does not alert when last_alerted_at is within 24 hours", () => {
    const recent = new Date(now.getTime() - 23 * 3600 * 1000);
    expect(shouldAlert(watchlist({ last_alerted_at: recent }), 4.99, now)).toBe(false);
  });

  it("alerts when last_alerted_at is older than 24 hours", () => {
    const old = new Date(now.getTime() - 25 * 3600 * 1000);
    expect(shouldAlert(watchlist({ last_alerted_at: old }), 4.99, now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npm test -- tests/diff.test.ts`
Expected: all 9 tests FAIL.

- [ ] **Step 3: Implement diff.ts**

`worker/src/diff.ts`:
```typescript
import type { PriceHistoryRow, WatchlistRow } from "./types.js";

export interface DiffResult {
  writeHistory: boolean;
  decreased: boolean;
  unchanged: boolean;
}

export function computeDiff(
  latest: PriceHistoryRow | null,
  newPrice: number
): DiffResult {
  if (latest == null) {
    return { writeHistory: true, decreased: false, unchanged: false };
  }
  if (latest.price_usd === newPrice) {
    return { writeHistory: false, decreased: false, unchanged: true };
  }
  return {
    writeHistory: true,
    decreased: newPrice < latest.price_usd,
    unchanged: false,
  };
}

const DAY_MS = 24 * 3600 * 1000;

export function shouldAlert(
  w: WatchlistRow,
  newPrice: number,
  now: Date
): boolean {
  if (w.max_price_usd != null && newPrice > w.max_price_usd) return false;
  if (w.last_alerted_at && now.getTime() - w.last_alerted_at.getTime() < DAY_MS) return false;
  return true;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/diff.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```
git add worker/src/diff.ts worker/tests/diff.test.ts
git commit -m "feat(worker): diff + alert-decision pure functions"
```

---

## Task 7: SQL migrations + migrations runner

**Files:**
- Create: `worker/migrations/0001_films.sql`
- Create: `worker/migrations/0002_price_history.sql`
- Create: `worker/migrations/0003_watchlists_stub.sql`
- Create: `worker/src/migrate.ts`
- Create: `worker/tests/helpers/db.ts`

- [ ] **Step 1: Write 0001_films.sql**

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE films (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itunes_id         BIGINT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  director          TEXT NOT NULL DEFAULT '',
  year              INTEGER NOT NULL DEFAULT 0,
  runtime_min       INTEGER NOT NULL DEFAULT 0,
  genre_primary     TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  content_advisory  TEXT NOT NULL DEFAULT '',
  artwork_url       TEXT NOT NULL DEFAULT '',
  itunes_url        TEXT NOT NULL DEFAULT '',
  tracking          BOOLEAN NOT NULL DEFAULT TRUE,
  available         BOOLEAN NOT NULL DEFAULT TRUE,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at   TIMESTAMPTZ,
  last_priced_at    TIMESTAMPTZ
);

CREATE INDEX films_last_checked_at_idx ON films (last_checked_at NULLS FIRST) WHERE tracking = TRUE;
```

- [ ] **Step 2: Write 0002_price_history.sql**

```sql
CREATE TABLE price_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id       UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  price_usd     NUMERIC(6,2) NOT NULL,
  hd_price_usd  NUMERIC(6,2),
  is_sale       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX price_history_film_id_captured_at_idx
  ON price_history (film_id, captured_at DESC);
```

- [ ] **Step 3: Write 0003_watchlists_stub.sql**

```sql
-- NOTE: The full watchlists + users schema is owned by sub-project 2.
-- This stub defines the minimum surface this worker needs.

CREATE TABLE IF NOT EXISTS watchlists (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  film_id           UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  max_price_usd     NUMERIC(6,2),
  last_alerted_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, film_id)
);

CREATE INDEX watchlists_film_id_idx ON watchlists (film_id);

CREATE TABLE IF NOT EXISTS price_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id    UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  film_id         UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  old_price_usd   NUMERIC(6,2) NOT NULL,
  new_price_usd   NUMERIC(6,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 4: Write the migrate.ts library**

`worker/src/migrate.ts`:
```typescript
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "pg";

export async function applyMigrations(client: Client, migrationsDir: string): Promise<string[]> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const files = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    const r = await client.query(`SELECT 1 FROM _migrations WHERE name = $1`, [file]);
    if (r.rowCount && r.rowCount > 0) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    await client.query(sql);
    await client.query(`INSERT INTO _migrations (name) VALUES ($1)`, [file]);
    applied.push(file);
  }
  return applied;
}
```

- [ ] **Step 5: Write the pg-mem test helper**

`worker/tests/helpers/db.ts`:
```typescript
import { newDb, DataType } from "pg-mem";
import { applyMigrations } from "../../src/migrate.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations"
);

export async function makeTestDb(): Promise<{ client: Client; close: () => Promise<void> }> {
  const mem = newDb();
  // pg-mem silently no-ops CREATE EXTENSION, so register gen_random_uuid ourselves.
  mem.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => randomUUID(),
    impure: true,
  });
  const { Client: PgMemClient } = mem.adapters.createPg();
  const client = new PgMemClient() as unknown as Client;
  await client.connect();
  await applyMigrations(client, MIGRATIONS_DIR);
  return {
    client,
    close: async () => { await client.end(); },
  };
}
```

- [ ] **Step 6: Write a smoke test for migrations**

`worker/tests/db.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { makeTestDb } from "./helpers/db.js";

describe("migrations", () => {
  it("creates the three core tables", async () => {
    const { client, close } = await makeTestDb();
    try {
      const tables = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
      );
      const names = tables.rows.map((r: { table_name: string }) => r.table_name);
      expect(names).toEqual(expect.arrayContaining([
        "_migrations", "films", "price_alerts", "price_history", "watchlists",
      ]));
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 7: Run tests**

Run: `npm test -- tests/db.test.ts`
Expected: PASS (1 test).

- [ ] **Step 8: Commit**

```
git add worker/migrations worker/src/migrate.ts worker/tests/helpers/db.ts worker/tests/db.test.ts
git commit -m "feat(worker): migrations for films, price_history, watchlists stub"
```

---

## Task 8: DB read helpers

**Files:**
- Modify: `worker/src/db.ts` (create)
- Modify: `worker/tests/db.test.ts`

- [ ] **Step 1: Write db.ts with read helpers**

`worker/src/db.ts`:
```typescript
import type { Client } from "pg";
import type { FilmRow, PriceHistoryRow, WatchlistRow, ParsedFilm } from "./types.js";

// Postgres returns NUMERIC as strings by default (because JS has no arbitrary precision).
// We coerce at the read boundary so consumers see numbers.
function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export async function selectFilmsToRefresh(
  client: Client,
  limit: number
): Promise<FilmRow[]> {
  const r = await client.query<FilmRow>(
    `SELECT * FROM films
     WHERE tracking = TRUE
     ORDER BY last_checked_at ASC NULLS FIRST
     LIMIT $1`,
    [limit]
  );
  return r.rows;
}

export async function latestPriceHistory(
  client: Client,
  filmId: string
): Promise<PriceHistoryRow | null> {
  const r = await client.query(
    `SELECT * FROM price_history
     WHERE film_id = $1
     ORDER BY captured_at DESC
     LIMIT 1`,
    [filmId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    ...row,
    price_usd: Number(row.price_usd),
    hd_price_usd: numOrNull(row.hd_price_usd),
  } as PriceHistoryRow;
}

export async function findWatchlistsForFilm(
  client: Client,
  filmId: string
): Promise<WatchlistRow[]> {
  const r = await client.query(
    `SELECT * FROM watchlists WHERE film_id = $1`,
    [filmId]
  );
  return r.rows.map((row: any) => ({
    ...row,
    max_price_usd: numOrNull(row.max_price_usd),
  })) as WatchlistRow[];
}
```

- [ ] **Step 2: Write failing tests for read helpers**

Append to `worker/tests/db.test.ts`:
```typescript
import { selectFilmsToRefresh, latestPriceHistory, findWatchlistsForFilm } from "../src/db.js";

async function insertFilm(client: any, itunes_id: number, opts: any = {}) {
  const r = await client.query(
    `INSERT INTO films (itunes_id, title, last_checked_at, tracking)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [itunes_id, opts.title ?? "T", opts.last_checked_at ?? null, opts.tracking ?? true]
  );
  return r.rows[0].id as string;
}

describe("selectFilmsToRefresh", () => {
  it("orders by last_checked_at ASC NULLS FIRST and respects limit and tracking flag", async () => {
    const { client, close } = await makeTestDb();
    try {
      const a = await insertFilm(client, 1, { last_checked_at: null });
      const b = await insertFilm(client, 2, { last_checked_at: new Date("2020-01-01") });
      const c = await insertFilm(client, 3, { last_checked_at: new Date("2030-01-01") });
      await insertFilm(client, 4, { tracking: false });
      const rows = await selectFilmsToRefresh(client, 10);
      expect(rows.map(r => r.id)).toEqual([a, b, c]);
    } finally { await close(); }
  });
});

describe("latestPriceHistory", () => {
  it("returns null when no history", async () => {
    const { client, close } = await makeTestDb();
    try {
      const id = await insertFilm(client, 1);
      expect(await latestPriceHistory(client, id)).toBeNull();
    } finally { await close(); }
  });

  it("returns the most recent row", async () => {
    const { client, close } = await makeTestDb();
    try {
      const id = await insertFilm(client, 1);
      await client.query(
        `INSERT INTO price_history (film_id, price_usd, captured_at) VALUES ($1, 5.99, $2), ($1, 4.99, $3)`,
        [id, new Date("2026-01-01"), new Date("2026-04-01")]
      );
      const latest = await latestPriceHistory(client, id);
      expect(latest!.price_usd).toBe(4.99);
    } finally { await close(); }
  });
});

describe("findWatchlistsForFilm", () => {
  it("returns all watchlist entries for a film", async () => {
    const { client, close } = await makeTestDb();
    try {
      const film = await insertFilm(client, 1);
      await client.query(
        `INSERT INTO watchlists (user_id, film_id, max_price_usd) VALUES
         (gen_random_uuid(), $1, 5.00),
         (gen_random_uuid(), $1, 8.00)`,
        [film]
      );
      const rows = await findWatchlistsForFilm(client, film);
      expect(rows).toHaveLength(2);
    } finally { await close(); }
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/db.test.ts`
Expected: PASS (4 tests total).

- [ ] **Step 4: Commit**

```
git add worker/src/db.ts worker/tests/db.test.ts
git commit -m "feat(worker): db read helpers"
```

---

## Task 9: DB write helpers

**Files:**
- Modify: `worker/src/db.ts`
- Modify: `worker/tests/db.test.ts`

- [ ] **Step 1: Write failing tests for write helpers**

Append to `worker/tests/db.test.ts`:
```typescript
import {
  upsertFilm, insertPriceHistory, updateLastChecked,
  markUnavailable, createAlertAndMark,
} from "../src/db.js";

const sampleParsed = {
  itunes_id: 1, title: "T", director: "D", year: 2024,
  runtime_min: 100, genre_primary: "Horror", description: "",
  content_advisory: "R", artwork_url: "", itunes_url: "",
  price_usd: 4.99, hd_price_usd: null,
};

describe("upsertFilm", () => {
  it("inserts on first call, updates on second call", async () => {
    const { client, close } = await makeTestDb();
    try {
      const id1 = await upsertFilm(client, sampleParsed);
      const id2 = await upsertFilm(client, { ...sampleParsed, title: "Updated" });
      expect(id1).toBe(id2);
      const r = await client.query(`SELECT title FROM films WHERE id = $1`, [id1]);
      expect(r.rows[0].title).toBe("Updated");
    } finally { await close(); }
  });
});

describe("insertPriceHistory / updateLastChecked / markUnavailable", () => {
  it("insertPriceHistory writes a row and sets last_priced_at", async () => {
    const { client, close } = await makeTestDb();
    try {
      const id = await upsertFilm(client, sampleParsed);
      await insertPriceHistory(client, id, 4.99, null, false);
      const hist = await client.query(`SELECT * FROM price_history WHERE film_id = $1`, [id]);
      expect(hist.rowCount).toBe(1);
      const film = await client.query(`SELECT last_priced_at FROM films WHERE id = $1`, [id]);
      expect(film.rows[0].last_priced_at).not.toBeNull();
    } finally { await close(); }
  });

  it("updateLastChecked bumps only last_checked_at", async () => {
    const { client, close } = await makeTestDb();
    try {
      const id = await upsertFilm(client, sampleParsed);
      await updateLastChecked(client, id);
      const r = await client.query(`SELECT last_checked_at, last_priced_at FROM films WHERE id = $1`, [id]);
      expect(r.rows[0].last_checked_at).not.toBeNull();
      expect(r.rows[0].last_priced_at).toBeNull();
    } finally { await close(); }
  });

  it("markUnavailable flips available and tracking to FALSE", async () => {
    const { client, close } = await makeTestDb();
    try {
      const id = await upsertFilm(client, sampleParsed);
      await markUnavailable(client, id);
      const r = await client.query(`SELECT tracking, available FROM films WHERE id = $1`, [id]);
      expect(r.rows[0].tracking).toBe(false);
      expect(r.rows[0].available).toBe(false);
    } finally { await close(); }
  });
});

describe("createAlertAndMark", () => {
  it("inserts a price_alert and updates watchlist.last_alerted_at in one transaction", async () => {
    const { client, close } = await makeTestDb();
    try {
      const film = await upsertFilm(client, sampleParsed);
      const wl = await client.query(
        `INSERT INTO watchlists (user_id, film_id) VALUES (gen_random_uuid(), $1) RETURNING id`,
        [film]
      );
      const watchlistId = wl.rows[0].id;
      await createAlertAndMark(client, watchlistId, film, 5.99, 4.99);
      const alerts = await client.query(`SELECT * FROM price_alerts WHERE watchlist_id = $1`, [watchlistId]);
      expect(alerts.rowCount).toBe(1);
      const w = await client.query(`SELECT last_alerted_at FROM watchlists WHERE id = $1`, [watchlistId]);
      expect(w.rows[0].last_alerted_at).not.toBeNull();
    } finally { await close(); }
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npm test -- tests/db.test.ts`
Expected: 5 new tests FAIL.

- [ ] **Step 3: Implement the write helpers**

Append to `worker/src/db.ts`:
```typescript
export async function upsertFilm(client: Client, f: ParsedFilm): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO films (
       itunes_id, title, director, year, runtime_min, genre_primary,
       description, content_advisory, artwork_url, itunes_url
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (itunes_id) DO UPDATE SET
       title = EXCLUDED.title,
       director = EXCLUDED.director,
       year = EXCLUDED.year,
       runtime_min = EXCLUDED.runtime_min,
       genre_primary = EXCLUDED.genre_primary,
       description = EXCLUDED.description,
       content_advisory = EXCLUDED.content_advisory,
       artwork_url = EXCLUDED.artwork_url,
       itunes_url = EXCLUDED.itunes_url
     RETURNING id`,
    [
      f.itunes_id, f.title, f.director, f.year, f.runtime_min, f.genre_primary,
      f.description, f.content_advisory, f.artwork_url, f.itunes_url,
    ]
  );
  return r.rows[0].id;
}

export async function insertPriceHistory(
  client: Client,
  filmId: string,
  price_usd: number,
  hd_price_usd: number | null,
  is_sale: boolean
): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO price_history (film_id, price_usd, hd_price_usd, is_sale)
       VALUES ($1, $2, $3, $4)`,
      [filmId, price_usd, hd_price_usd, is_sale]
    );
    await client.query(
      `UPDATE films SET last_checked_at = now(), last_priced_at = now() WHERE id = $1`,
      [filmId]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

export async function updateLastChecked(client: Client, filmId: string): Promise<void> {
  await client.query(`UPDATE films SET last_checked_at = now() WHERE id = $1`, [filmId]);
}

export async function markUnavailable(client: Client, filmId: string): Promise<void> {
  await client.query(
    `UPDATE films SET tracking = FALSE, available = FALSE, last_checked_at = now() WHERE id = $1`,
    [filmId]
  );
}

export async function createAlertAndMark(
  client: Client,
  watchlistId: string,
  filmId: string,
  oldPrice: number,
  newPrice: number
): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd)
       VALUES ($1, $2, $3, $4)`,
      [watchlistId, filmId, oldPrice, newPrice]
    );
    await client.query(
      `UPDATE watchlists SET last_alerted_at = now() WHERE id = $1`,
      [watchlistId]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/db.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```
git add worker/src/db.ts worker/tests/db.test.ts
git commit -m "feat(worker): db write helpers with transactional alert+mark"
```

---

## Task 10: Digest accumulator

**Files:**
- Create: `worker/src/digest.ts`
- Create: `worker/tests/digest.test.ts`

- [ ] **Step 1: Write failing tests**

`worker/tests/digest.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { Digest } from "../src/digest.js";

describe("Digest", () => {
  it("starts with zeroed counters", () => {
    const d = new Digest();
    expect(d.snapshot()).toMatchObject({
      films_refreshed: 0,
      price_changes: 0,
      alerts_fired: 0,
      parse_failures: 0,
      unavailable_marked: 0,
    });
  });

  it("increments counters", () => {
    const d = new Digest();
    d.filmRefreshed();
    d.filmRefreshed();
    d.priceChanged();
    d.alertFired();
    d.parseFailure(123);
    d.markedUnavailable();
    const s = d.snapshot();
    expect(s.films_refreshed).toBe(2);
    expect(s.price_changes).toBe(1);
    expect(s.alerts_fired).toBe(1);
    expect(s.parse_failures).toBe(1);
    expect(s.unavailable_marked).toBe(1);
    expect(s.parse_failure_ids).toEqual([123]);
  });

  it("render() returns human-readable summary", () => {
    const d = new Digest();
    d.filmRefreshed();
    d.alertFired();
    const out = d.render();
    expect(out).toContain("films_refreshed=1");
    expect(out).toContain("alerts_fired=1");
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npm test -- tests/digest.test.ts`
Expected: 3 tests FAIL.

- [ ] **Step 3: Implement digest.ts**

```typescript
export interface DigestSnapshot {
  films_refreshed: number;
  price_changes: number;
  alerts_fired: number;
  parse_failures: number;
  unavailable_marked: number;
  parse_failure_ids: number[];
}

export class Digest {
  private s: DigestSnapshot = {
    films_refreshed: 0,
    price_changes: 0,
    alerts_fired: 0,
    parse_failures: 0,
    unavailable_marked: 0,
    parse_failure_ids: [],
  };

  filmRefreshed() { this.s.films_refreshed++; }
  priceChanged() { this.s.price_changes++; }
  alertFired() { this.s.alerts_fired++; }
  parseFailure(itunesId: number) {
    this.s.parse_failures++;
    this.s.parse_failure_ids.push(itunesId);
  }
  markedUnavailable() { this.s.unavailable_marked++; }

  snapshot(): DigestSnapshot { return { ...this.s, parse_failure_ids: [...this.s.parse_failure_ids] }; }

  render(): string {
    const s = this.s;
    const parts = [
      `films_refreshed=${s.films_refreshed}`,
      `price_changes=${s.price_changes}`,
      `alerts_fired=${s.alerts_fired}`,
      `parse_failures=${s.parse_failures}`,
      `unavailable_marked=${s.unavailable_marked}`,
    ];
    return parts.join(" ");
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/digest.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```
git add worker/src/digest.ts worker/tests/digest.test.ts
git commit -m "feat(worker): digest accumulator"
```

---

## Task 11: Worker orchestrator (runOnce)

**Files:**
- Create: `worker/src/worker.ts`
- Create: `worker/tests/worker.test.ts`

- [ ] **Step 1: Write failing end-to-end test**

`worker/tests/worker.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { makeServer } from "./helpers/http.js";
import { makeTestDb } from "./helpers/db.js";
import { runOnce } from "../src/worker.js";
import { upsertFilm } from "../src/db.js";
import { midsommarResult } from "./fixtures/itunes-responses.js";

const server = makeServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("runOnce", () => {
  it("refreshes films, writes price history on change, fires alert on drop", async () => {
    const { client, close } = await makeTestDb();
    try {
      // Seed film at 5.99, expecting drop to 4.99.
      const filmId = await upsertFilm(client, {
        itunes_id: 1468845007, title: "Midsommar", director: "Ari Aster",
        year: 2019, runtime_min: 147, genre_primary: "Horror",
        description: "", content_advisory: "R", artwork_url: "", itunes_url: "",
        price_usd: 5.99, hd_price_usd: null,
      });
      await client.query(
        `INSERT INTO price_history (film_id, price_usd) VALUES ($1, 5.99)`,
        [filmId]
      );
      await client.query(
        `INSERT INTO watchlists (user_id, film_id, max_price_usd) VALUES (gen_random_uuid(), $1, 6.00)`,
        [filmId]
      );

      server.use(http.get("https://itunes.apple.com/lookup", () =>
        HttpResponse.json({ resultCount: 1, results: [{ ...midsommarResult, trackPrice: 4.99 }] })
      ));

      const digest = await runOnce(client, { batchSize: 10 });

      const snap = digest.snapshot();
      expect(snap.films_refreshed).toBe(1);
      expect(snap.price_changes).toBe(1);
      expect(snap.alerts_fired).toBe(1);

      const hist = await client.query(`SELECT price_usd FROM price_history WHERE film_id = $1 ORDER BY captured_at`, [filmId]);
      expect(hist.rows.map((r: any) => Number(r.price_usd))).toEqual([5.99, 4.99]);

      const alerts = await client.query(`SELECT old_price_usd, new_price_usd FROM price_alerts WHERE film_id = $1`, [filmId]);
      expect(alerts.rows).toHaveLength(1);
      expect(Number(alerts.rows[0].old_price_usd)).toBe(5.99);
      expect(Number(alerts.rows[0].new_price_usd)).toBe(4.99);
    } finally { await close(); }
  });

  it("marks a removed film unavailable when lookup returns resultCount=0", async () => {
    const { client, close } = await makeTestDb();
    try {
      const filmId = await upsertFilm(client, {
        itunes_id: 99999, title: "Removed", director: "", year: 2020,
        runtime_min: 0, genre_primary: "", description: "",
        content_advisory: "", artwork_url: "", itunes_url: "",
        price_usd: 4.99, hd_price_usd: null,
      });
      server.use(http.get("https://itunes.apple.com/lookup", () =>
        HttpResponse.json({ resultCount: 0, results: [] })
      ));

      const digest = await runOnce(client, { batchSize: 10 });

      expect(digest.snapshot().unavailable_marked).toBe(1);
      const r = await client.query(`SELECT tracking, available FROM films WHERE id = $1`, [filmId]);
      expect(r.rows[0].tracking).toBe(false);
      expect(r.rows[0].available).toBe(false);
    } finally { await close(); }
  });

  it("does not write history or alerts when price is unchanged", async () => {
    const { client, close } = await makeTestDb();
    try {
      const filmId = await upsertFilm(client, {
        itunes_id: 1468845007, title: "Midsommar", director: "Ari Aster",
        year: 2019, runtime_min: 147, genre_primary: "Horror",
        description: "", content_advisory: "R", artwork_url: "", itunes_url: "",
        price_usd: 4.99, hd_price_usd: null,
      });
      await client.query(`INSERT INTO price_history (film_id, price_usd) VALUES ($1, 4.99)`, [filmId]);

      server.use(http.get("https://itunes.apple.com/lookup", () =>
        HttpResponse.json({ resultCount: 1, results: [{ ...midsommarResult, trackPrice: 4.99 }] })
      ));

      const digest = await runOnce(client, { batchSize: 10 });

      expect(digest.snapshot().price_changes).toBe(0);
      expect(digest.snapshot().alerts_fired).toBe(0);
      const hist = await client.query(`SELECT count(*)::int AS n FROM price_history WHERE film_id = $1`, [filmId]);
      expect(hist.rows[0].n).toBe(1);
    } finally { await close(); }
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npm test -- tests/worker.test.ts`
Expected: 3 tests FAIL.

- [ ] **Step 3: Implement runOnce**

`worker/src/worker.ts`:
```typescript
import type { Client } from "pg";
import { fetchPrices, parseFilm } from "./itunes.js";
import { computeDiff, shouldAlert } from "./diff.js";
import {
  selectFilmsToRefresh, latestPriceHistory, findWatchlistsForFilm,
  insertPriceHistory, updateLastChecked, markUnavailable, createAlertAndMark,
} from "./db.js";
import { Digest } from "./digest.js";

export interface RunOnceOptions {
  batchSize?: number;
  maxFilms?: number;
}

export async function runOnce(client: Client, opts: RunOnceOptions = {}): Promise<Digest> {
  const batchSize = opts.batchSize ?? 100;
  const maxFilms = opts.maxFilms ?? 10000;
  const digest = new Digest();

  let processed = 0;
  while (processed < maxFilms) {
    const films = await selectFilmsToRefresh(client, batchSize);
    if (films.length === 0) break;

    const ids = films.map(f => f.itunes_id);
    const lookup = await fetchPrices(ids);
    const byItunesId = new Map(lookup.results.map(r => [r.trackId, r]));

    for (const film of films) {
      const raw = byItunesId.get(Number(film.itunes_id));

      if (!raw) {
        // iTunes returned nothing for this id — the film was removed.
        await markUnavailable(client, film.id);
        digest.markedUnavailable();
        digest.filmRefreshed();
        continue;
      }

      const parsed = parseFilm(raw);
      if (!parsed) {
        // Invalid read (kind mismatch, price = 0/null, etc.). Bump last_checked_at and move on.
        digest.parseFailure(film.itunes_id);
        await updateLastChecked(client, film.id);
        digest.filmRefreshed();
        continue;
      }

      const latest = await latestPriceHistory(client, film.id);
      const diff = computeDiff(latest, parsed.price_usd);

      if (!diff.writeHistory) {
        await updateLastChecked(client, film.id);
        digest.filmRefreshed();
        continue;
      }

      // Compute is_sale by comparing against max observed over trailing 180 days.
      const maxRow = await client.query<{ max_price: string }>(
        `SELECT MAX(price_usd) AS max_price FROM price_history
         WHERE film_id = $1 AND captured_at > now() - INTERVAL '180 days'`,
        [film.id]
      );
      const maxPrice = Number(maxRow.rows[0]?.max_price ?? parsed.price_usd);
      const is_sale = parsed.price_usd < maxPrice;

      await insertPriceHistory(client, film.id, parsed.price_usd, parsed.hd_price_usd, is_sale);
      digest.priceChanged();
      digest.filmRefreshed();

      if (diff.decreased) {
        const now = new Date();
        const oldPrice = latest!.price_usd; // already a number — coerced in latestPriceHistory
        const watchlists = await findWatchlistsForFilm(client, film.id);
        for (const w of watchlists) {
          if (!shouldAlert(w, parsed.price_usd, now)) continue;
          await createAlertAndMark(client, w.id, film.id, oldPrice, parsed.price_usd);
          digest.alertFired();
        }
      }
    }

    processed += films.length;
    if (films.length < batchSize) break;
  }

  return digest;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/worker.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add worker/src/worker.ts worker/tests/worker.test.ts
git commit -m "feat(worker): runOnce orchestrator with end-to-end tests"
```

---

## Task 12: Seed script

**Files:**
- Create: `worker/src/seed.ts`
- Create: `worker/tests/seed.test.ts`
- Modify: `worker/src/itunes.ts` (add searchFilms)

- [ ] **Step 1: Add searchFilms to itunes.ts**

Append to `worker/src/itunes.ts`:
```typescript
export async function searchFilms(
  term: string,
  opts: FetchOptions & { limit?: number } = {}
): Promise<ITunesLookupResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("country", "US");
  url.searchParams.set("entity", "movie");
  url.searchParams.set("limit", String(opts.limit ?? 25));
  const res = await fetchImpl(url.toString());
  if (!res.ok) throw new Error(`itunes search ${res.status}`);
  return (await res.json()) as ITunesLookupResponse;
}
```

- [ ] **Step 2: Write failing test**

`worker/tests/seed.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { makeServer } from "./helpers/http.js";
import { makeTestDb } from "./helpers/db.js";
import { seedFilms } from "../src/seed.js";
import { midsommarResult } from "./fixtures/itunes-responses.js";

const server = makeServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("seedFilms", () => {
  it("searches each query term and upserts feature-movie results", async () => {
    const { client, close } = await makeTestDb();
    try {
      let calls = 0;
      server.use(
        http.get("https://itunes.apple.com/search", ({ request }) => {
          calls++;
          const url = new URL(request.url);
          const term = url.searchParams.get("term");
          return HttpResponse.json({
            resultCount: 1,
            results: [{ ...midsommarResult, trackId: 1000 + calls, trackName: `Film for ${term}` }],
          });
        })
      );

      const inserted = await seedFilms(client, ["folk horror", "a24"]);
      expect(inserted).toBe(2);
      expect(calls).toBe(2);

      const films = await client.query(`SELECT count(*)::int AS n FROM films`);
      expect(films.rows[0].n).toBe(2);
    } finally { await close(); }
  });

  it("deduplicates across queries (same trackId upserts once)", async () => {
    const { client, close } = await makeTestDb();
    try {
      server.use(http.get("https://itunes.apple.com/search", () =>
        HttpResponse.json({ resultCount: 1, results: [midsommarResult] })
      ));
      await seedFilms(client, ["term1", "term2"]);
      const r = await client.query(`SELECT count(*)::int AS n FROM films`);
      expect(r.rows[0].n).toBe(1);
    } finally { await close(); }
  });
});
```

- [ ] **Step 3: Run to verify failures**

Run: `npm test -- tests/seed.test.ts`
Expected: 2 tests FAIL.

- [ ] **Step 4: Implement seed.ts**

```typescript
import type { Client } from "pg";
import { searchFilms, parseFilm } from "./itunes.js";
import { upsertFilm } from "./db.js";

export const DEFAULT_SEED_QUERIES = [
  "folk horror",
  "a24",
  "ari aster",
  "robert eggers",
  "kiyoshi kurosawa",
  "midnight movies",
  "giallo",
  "j-horror",
  "body horror",
  "slow cinema",
];

export async function seedFilms(
  client: Client,
  queries: string[] = DEFAULT_SEED_QUERIES
): Promise<number> {
  let count = 0;
  const seen = new Set<number>();
  for (const q of queries) {
    const res = await searchFilms(q, { limit: 50 });
    for (const raw of res.results) {
      if (seen.has(raw.trackId)) continue;
      const parsed = parseFilm(raw);
      if (!parsed) continue;
      await upsertFilm(client, parsed);
      seen.add(raw.trackId);
      count++;
    }
  }
  return count;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/seed.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```
git add worker/src/itunes.ts worker/src/seed.ts worker/tests/seed.test.ts
git commit -m "feat(worker): seedFilms for launch bootstrap"
```

---

## Task 13: CLI runners

**Files:**
- Create: `worker/scripts/run-migrate.ts`
- Create: `worker/scripts/run-seed.ts`
- Create: `worker/scripts/run-worker.ts`
- Create: `worker/scripts/add-film.ts`

Note: no unit tests on the scripts themselves — they're thin adapters. Verified manually in Step 5.

- [ ] **Step 1: Write run-migrate.ts**

```typescript
import "dotenv/config";
import { Client } from "pg";
import { applyMigrations } from "../src/migrate.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const applied = await applyMigrations(client, MIGRATIONS_DIR);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "No pending migrations.");
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Write run-seed.ts**

```typescript
import "dotenv/config";
import { Client } from "pg";
import { seedFilms } from "../src/seed.js";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const n = await seedFilms(client);
    console.log(`Seeded ${n} films.`);
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Write run-worker.ts (with Sentry)**

```typescript
import "dotenv/config";
import { Client } from "pg";
import * as Sentry from "@sentry/node";
import { runOnce } from "../src/worker.js";

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN });
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const digest = await runOnce(client);
    console.log(digest.render());
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err);
  Sentry.captureException(err);
  process.exit(1);
});
```

- [ ] **Step 4: Write add-film.ts**

```typescript
import "dotenv/config";
import { Client } from "pg";
import { fetchPrices, parseFilm } from "../src/itunes.js";
import { upsertFilm } from "../src/db.js";

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: npm run add-film <itunes_track_id>");
    process.exit(2);
  }
  const id = Number(arg);
  if (!Number.isFinite(id)) {
    console.error(`Not a number: ${arg}`);
    process.exit(2);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const res = await fetchPrices([id]);
    if (res.resultCount === 0) {
      console.error(`iTunes returned no results for trackId=${id}`);
      process.exit(1);
    }
    const parsed = parseFilm(res.results[0]);
    if (!parsed) {
      console.error(`trackId=${id} failed parse (wrong kind, invalid price, etc.)`);
      process.exit(1);
    }
    const uuid = await upsertFilm(client, parsed);
    console.log(`Upserted ${parsed.title} (${parsed.year}) as ${uuid}`);
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 5: Typecheck**

Run from `worker/`: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```
git add worker/scripts
git commit -m "feat(worker): CLI runners for migrate, seed, worker, add-film"
```

---

## Task 14: README for the worker

**Files:**
- Create: `worker/README.md`

- [ ] **Step 1: Write README.md**

```markdown
# Film Goblin — Price-tracking Worker

A standalone Node.js package that polls the iTunes Search API for Apple TV
movie prices, diffs against what's in Postgres, writes new `price_history`
rows when prices change, and creates `price_alerts` for watchlisting users
when prices drop.

Implements the spec at `../docs/superpowers/specs/2026-04-20-apple-data-source-design.md`.

## Setup

Requires Node 20 (an `.nvmrc` at the repo root pins it). From `worker/`:

```
npm install
cp .env.example .env        # fill in DATABASE_URL and (optionally) SENTRY_DSN
npm run migrate             # apply SQL migrations
npm run seed                # seed ~500 curated films
```

## Run the worker

```
npm run worker
```

One pass: selects tracked films ordered by stalest `last_checked_at`,
refreshes prices in batches of 100, writes history and alerts, prints a
digest line like:

```
films_refreshed=87 price_changes=12 alerts_fired=4 parse_failures=0 unavailable_marked=1
```

Intended to be invoked every 4 hours. The HTTP cron mount
(`/api/cron/refresh-prices` on Vercel) lands in sub-project 3 when the
Next.js scaffold exists; for now invoke this script directly.

## Admin: add a single film

```
npm run add-film -- 1468845007
```

Looks up by iTunes `trackId`, parses, upserts into `films`. Used when
the seed searches miss something obvious.

## Tests

```
npm test
```

Tests use pg-mem for the database (in-memory Postgres) and MSW for HTTP.
No external services required to run the suite.

## What this worker does NOT do

- **Deliver notifications** (email, push). `price_alerts` is a
  consumption surface for the notification worker in sub-project 5.
- **Host any HTTP endpoint.** The worker is a library + CLI. The
  Next.js cron mount is sub-project 3.
- **Own user/auth/watchlist schema.** `watchlists` is stubbed here
  with the minimum surface required; the full schema lands in
  sub-project 2.
```

- [ ] **Step 2: Commit**

```
git add worker/README.md
git commit -m "docs(worker): README with setup + run instructions"
```

---

## Task 15: Final verification

- [ ] **Step 1: Run the full test suite**

Run from `worker/`: `npm test`
Expected: all tests pass. Note the total count — should be around 35 tests across 6 files.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Walk the spec**

Open `../docs/superpowers/specs/2026-04-20-apple-data-source-design.md` and confirm each requirement has a corresponding task:

- Decision (iTunes Search API, US-only, 4h) → encoded in README + `fetchPrices` URL params.
- Pipeline (select oldest, batch 100, diff, alert) → Task 11.
- Films table columns → Task 7 (0001_films.sql).
- Price_history append-only → Task 7 (0002_price_history.sql).
- Invalid price < $0.50 → null → Task 4 (parseFilm).
- Wrong-kind filter → Task 4.
- Artwork upscale → Task 3.
- Rate-limit backoff → Task 5 (fetchPrices retries).
- Film removal → Task 11 (markUnavailable branch).
- Duplicate alerts suppression → Task 6 (shouldAlert) + Task 11.
- Digest stats → Task 10.
- Seed + admin override → Tasks 12, 13.
- Sentry → Task 13 (run-worker.ts).

- [ ] **Step 4: Commit any incidental fixes discovered during walk-through**

If the walk found gaps, fix them and commit. If no gaps:

```
git status
```
Expected: working tree clean.
```

---

## Self-review notes

- **Spec coverage:** Every spec section maps to at least one task. Sentry coverage is thin (no dedicated test) — acceptable because the DSN branch is a one-line SDK call in a CLI entry point.
- **Deferred items match the spec's "Deferred / future" section:** additional storefronts, HD price UI, cast metadata, affiliate tagging, notification delivery — none implemented here, all explicitly noted as out-of-scope.
- **Watchlists schema:** stubbed with exactly the columns this worker reads and writes (`max_price_usd`, `last_alerted_at`), flagged in 0003's header comment as owned by sub-project 2.
- **`available` column semantics:** when `markUnavailable` fires we set both `tracking = FALSE` and `available = FALSE`. `available = FALSE` is what the UI consumes to render the "no longer on Apple TV" state; `tracking = FALSE` is what this worker consumes to skip future polls. Keeping both explicit.
