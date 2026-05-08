# iTunes Availability Cron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a weekly cron that checks TMDB-only films (rows in `films` with `itunes_id IS NULL`) for iTunes availability, auto-promoting high-confidence matches and queueing fuzzy ones for admin review.

**Architecture:** New schema (mig 0175) adds `tmdb_id` / `theatrical_release_date` / `last_itunes_check_at` columns on `films`, restores the partial unique index on `films.itunes_id`, and creates a new `itunes_candidates` table. A pure scoring function lives in `app/lib/itunes-availability/score.ts`. The orchestrator hits iTunes Search per film, scores results, and either updates the films row directly (auto-promote, ≥0.85) or writes a candidate row (0.45–0.85). Admin reviews queued candidates at `/admin/itunes-candidates`.

**Tech Stack:** Next.js 15 App Router, Supabase Postgres, TypeScript, Vitest + MSW for tests, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-05-08-itunes-availability-cron-design.md`

---

## Task 1: Schema migration

**Files:**
- Create: `db/migrations/0175_itunes_availability_check.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0175_itunes_availability_check.sql
--
-- Adds the columns and table needed by the weekly iTunes availability cron.
-- See docs/superpowers/specs/2026-05-08-itunes-availability-cron-design.md.

-- 1. Films: cron timing and TMDB origin tracking.
ALTER TABLE films
  ADD COLUMN IF NOT EXISTS tmdb_id INT,
  ADD COLUMN IF NOT EXISTS theatrical_release_date DATE,
  ADD COLUMN IF NOT EXISTS last_itunes_check_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS films_tmdb_id_idx ON films(tmdb_id)
  WHERE tmdb_id IS NOT NULL;

-- Cron read pattern: pull untracked theatrical-aged films cheaply.
CREATE INDEX IF NOT EXISTS films_itunes_check_pending_idx
  ON films(last_itunes_check_at NULLS FIRST, theatrical_release_date)
  WHERE itunes_id IS NULL AND tracking = FALSE;

-- 2. Restore the unique-itunes-id invariant. Original constraint was dropped
-- in mig 0118 when itunes_id became nullable. Partial unique index handles
-- the nullable case correctly.
CREATE UNIQUE INDEX IF NOT EXISTS films_itunes_id_unique
  ON films(itunes_id) WHERE itunes_id IS NOT NULL;

-- 3. Candidates table for fuzzy matches awaiting admin review.
CREATE TABLE IF NOT EXISTS itunes_candidates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id             UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  itunes_id           BIGINT NOT NULL,
  itunes_url          TEXT NOT NULL,
  match_title         TEXT NOT NULL,
  match_year          INT,
  match_artwork_url   TEXT,
  confidence          NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  match_type          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','rejected')),
  reviewed_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One pending candidate per film at a time.
CREATE UNIQUE INDEX IF NOT EXISTS itunes_candidates_one_pending_per_film
  ON itunes_candidates(film_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS itunes_candidates_status_idx
  ON itunes_candidates(status, created_at DESC);

-- 4. RLS — admin-only via service role. No policies = no client access.
ALTER TABLE itunes_candidates ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply to prod DB**

```bash
cd /Users/christophernowacki/film-goblin
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel env pull app/.env.production --yes --environment=production
cd db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH set -a && source ../app/.env.production && set +a && npm run migrate
rm ../app/.env.production
```

Expected output: `Applied: 0175_itunes_availability_check.sql`

- [ ] **Step 3: Verify columns exist via REST**

```bash
SUPABASE_URL="https://wktylpissdjinccbwzha.supabase.co"
SERVICE_KEY="<from app/.env.local>"

curl -s -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  "$SUPABASE_URL/rest/v1/films?select=tmdb_id,theatrical_release_date,last_itunes_check_at&limit=1"
```

Expected: `[{"tmdb_id":null,"theatrical_release_date":null,"last_itunes_check_at":null}]` (or any row with these three keys present).

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0175_itunes_availability_check.sql
git commit -m "feat(db): mig 0175 — itunes availability check schema

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Update types.ts hand-edit

**Files:**
- Modify: `app/lib/supabase/types.ts`

The codebase doesn't run `gen:types` on every machine (Docker dependency); per the warning block at the top of the file, we hand-edit. Match mig 0174's pattern.

- [ ] **Step 1: Update the warning block**

Find the `// profiles:` line in the warning comments (around line 11-14) and add a new line below the existing must_change_password line:

```ts
//   films:         horror_adjacent, trailer_label, trailer_source,
//                  trailer_updated_at, trailer_url, trailer_verified,
//                  trailer_youtube_id, tmdb_id, theatrical_release_date,
//                  last_itunes_check_at — added by mig 0175
```

Replace the existing `films:` block in the comments. (Existing trailer columns stay; append the three new ones.)

Add a new line at end of the warning list (before the workflow paragraph):

```ts
//   itunes_candidates: entire table — added by mig 0175
```

- [ ] **Step 2: Add columns to `films` Row/Insert/Update**

In `app/lib/supabase/types.ts`, find `films: { Row: { ... } }` (around line 463). Add three columns to each of `Row`, `Insert`, `Update`:

```ts
// in Row block
last_itunes_check_at: string | null
theatrical_release_date: string | null
tmdb_id: number | null
```

```ts
// in Insert block
last_itunes_check_at?: string | null
theatrical_release_date?: string | null
tmdb_id?: number | null
```

```ts
// in Update block (same as Insert)
last_itunes_check_at?: string | null
theatrical_release_date?: string | null
tmdb_id?: number | null
```

Maintain alphabetical ordering within each block.

- [ ] **Step 3: Add the `itunes_candidates` table type**

Find the `films` table block end (`Relationships: []`, then closing `}`). Insert the new table type immediately after, before the next table:

```ts
      itunes_candidates: {
        Row: {
          confidence: number
          created_at: string
          film_id: string
          id: string
          itunes_id: number
          itunes_url: string
          match_artwork_url: string | null
          match_title: string
          match_type: string
          match_year: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: "pending" | "confirmed" | "rejected"
        }
        Insert: {
          confidence: number
          created_at?: string
          film_id: string
          id?: string
          itunes_id: number
          itunes_url: string
          match_artwork_url?: string | null
          match_title: string
          match_type: string
          match_year?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: "pending" | "confirmed" | "rejected"
        }
        Update: {
          confidence?: number
          created_at?: string
          film_id?: string
          id?: string
          itunes_id?: number
          itunes_url?: string
          match_artwork_url?: string | null
          match_title?: string
          match_type?: string
          match_year?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: "pending" | "confirmed" | "rejected"
        }
        Relationships: [
          {
            foreignKeyName: "itunes_candidates_film_id_fkey"
            columns: ["film_id"]
            isOneToOne: false
            referencedRelation: "films"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 4: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: clean pass, no output beyond the script header.

- [ ] **Step 5: Commit**

```bash
git add app/lib/supabase/types.ts
git commit -m "chore(types): hand-edit for mig 0175

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Score function (TDD)

**Files:**
- Create: `app/lib/itunes-availability/score.ts`
- Test: `app/tests/itunes-availability/score.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/tests/itunes-availability/score.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scoreMatch, type FilmInput, type ItunesCandidate } from "@/lib/itunes-availability/score";

const film = (over: Partial<FilmInput> = {}): FilmInput => ({
  title: "The Substance",
  year: 2024,
  director: "Coralie Fargeat",
  ...over,
});

const cand = (over: Partial<ItunesCandidate> = {}): ItunesCandidate => ({
  trackId: 12345,
  trackName: "The Substance",
  releaseDate: "2024-09-20T07:00:00Z",
  artistName: "Coralie Fargeat",
  trackViewUrl: "https://itunes.apple.com/us/movie/the-substance/id12345",
  artworkUrl100: "https://example.com/100.jpg",
  ...over,
});

describe("scoreMatch", () => {
  it("scores exact title + exact year + director at 1.0", () => {
    const r = scoreMatch(film(), cand());
    expect(r.confidence).toBe(1.0);
    expect(r.matchType).toBe("exact_title_year_director");
  });

  it("scores exact title + exact year (no director) at 0.9", () => {
    const r = scoreMatch(film(), cand({ artistName: "Someone Else" }));
    expect(r.confidence).toBeCloseTo(0.9, 5);
    expect(r.matchType).toBe("exact_title_year");
  });

  it("scores exact title + year ±1 at 0.75", () => {
    const r = scoreMatch(film(), cand({ releaseDate: "2025-01-15T07:00:00Z", artistName: "Nope" }));
    expect(r.confidence).toBeCloseTo(0.75, 5);
    expect(r.matchType).toBe("exact_title_fuzzy_year");
  });

  it("scores normalized title (article diff) + exact year at 0.7", () => {
    const r = scoreMatch(
      film({ title: "The Substance" }),
      cand({ trackName: "Substance", artistName: "Nope" }),
    );
    expect(r.confidence).toBeCloseTo(0.7, 5);
    expect(r.matchType).toBe("normalized_title_year");
  });

  it("scores normalized title (apostrophe diff) + exact year at 0.7", () => {
    const r = scoreMatch(
      film({ title: "Don't Breathe" }),
      cand({ trackName: "Dont Breathe", artistName: "Nope" }),
    );
    expect(r.confidence).toBeCloseTo(0.7, 5);
  });

  it("treats lowercase-only difference as exact match", () => {
    const r = scoreMatch(film(), cand({ trackName: "the substance", artistName: "Nope" }));
    expect(r.confidence).toBeCloseTo(0.9, 5);
    expect(r.matchType).toBe("exact_title_year");
  });

  it("falls below threshold when title doesn't normalize the same", () => {
    const r = scoreMatch(film({ title: "Alien" }), cand({ trackName: "Aliens", artistName: "Nope" }));
    expect(r.confidence).toBeLessThan(0.45);
    expect(r.matchType).toBe("below_threshold");
  });

  it("scores year mismatch >1 as no year score", () => {
    const r = scoreMatch(film(), cand({ releaseDate: "2027-01-15T07:00:00Z", artistName: "Nope" }));
    expect(r.confidence).toBeCloseTo(0.6, 5);
  });

  it("director match adds +0.1 even with fuzzy year", () => {
    const r = scoreMatch(film(), cand({ releaseDate: "2025-09-20T07:00:00Z" }));
    // exact title (0.6) + year ±1 (0.15) + director (0.1) = 0.85
    expect(r.confidence).toBeCloseTo(0.85, 5);
    expect(r.matchType).toBe("exact_title_fuzzy_year_director");
  });

  it("caps confidence at 1.0", () => {
    const r = scoreMatch(film(), cand());
    expect(r.confidence).toBeLessThanOrEqual(1.0);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/itunes-availability/score.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/itunes-availability/score'".

- [ ] **Step 3: Implement `scoreMatch`**

Create `app/lib/itunes-availability/score.ts`:

```ts
export interface FilmInput {
  title: string;
  year: number;
  director: string;
}

export interface ItunesCandidate {
  trackId: number;
  trackName: string;
  releaseDate: string;
  artistName: string;
  trackViewUrl: string;
  artworkUrl100: string;
}

export type MatchType =
  | "exact_title_year_director"
  | "exact_title_year"
  | "exact_title_fuzzy_year_director"
  | "exact_title_fuzzy_year"
  | "normalized_title_year_director"
  | "normalized_title_year"
  | "normalized_title_fuzzy_year_director"
  | "normalized_title_fuzzy_year"
  | "below_threshold";

export interface MatchScore {
  confidence: number;
  matchType: MatchType;
}

const ARTICLES = /^(the|a|an)\s+/i;

function lowercaseOnly(s: string): string {
  return s.toLowerCase().trim();
}

function fullyNormalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(ARTICLES, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYear(iso: string): number | null {
  const m = iso.match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

export function scoreMatch(film: FilmInput, candidate: ItunesCandidate): MatchScore {
  let confidence = 0;
  let titleMode: "exact" | "normalized" | "none" = "none";
  let yearMode: "exact" | "fuzzy" | "none" = "none";
  let directorMatched = false;

  // Title (mutually exclusive: exact takes precedence)
  if (lowercaseOnly(film.title) === lowercaseOnly(candidate.trackName)) {
    confidence += 0.6;
    titleMode = "exact";
  } else if (fullyNormalize(film.title) === fullyNormalize(candidate.trackName)) {
    confidence += 0.4;
    titleMode = "normalized";
  }

  // Year
  const candYear = extractYear(candidate.releaseDate);
  if (candYear !== null) {
    if (candYear === film.year) {
      confidence += 0.3;
      yearMode = "exact";
    } else if (Math.abs(candYear - film.year) === 1) {
      confidence += 0.15;
      yearMode = "fuzzy";
    }
  }

  // Director
  if (
    film.director.trim().length > 0 &&
    lowercaseOnly(film.director) === lowercaseOnly(candidate.artistName)
  ) {
    confidence += 0.1;
    directorMatched = true;
  }

  confidence = Math.min(confidence, 1.0);

  if (confidence < 0.45 || titleMode === "none") {
    return { confidence, matchType: "below_threshold" };
  }

  // Build matchType key
  const titleKey = titleMode === "exact" ? "exact_title" : "normalized_title";
  const yearKey = yearMode === "exact" ? "year" : yearMode === "fuzzy" ? "fuzzy_year" : null;
  if (yearKey === null) {
    return { confidence, matchType: "below_threshold" };
  }
  const key = directorMatched
    ? `${titleKey}_${yearKey}_director`
    : `${titleKey}_${yearKey}`;
  return { confidence, matchType: key as MatchType };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/itunes-availability/score.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/lib/itunes-availability/score.ts app/tests/itunes-availability/score.test.ts
git commit -m "feat(itunes-availability): score function with full test coverage

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: iTunes Search API client

**Files:**
- Create: `app/lib/itunes-availability/itunes-search.ts`

Thin wrapper. Pure fetch + types. No tests at this layer (will be exercised through the orchestrator integration test in Task 11).

- [ ] **Step 1: Implement**

Create `app/lib/itunes-availability/itunes-search.ts`:

```ts
import type { ItunesCandidate } from "./score";

const ENDPOINT = "https://itunes.apple.com/search";

export async function searchItunesMovies(query: string): Promise<ItunesCandidate[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("term", query);
  url.searchParams.set("entity", "movie");
  url.searchParams.set("country", "us");
  url.searchParams.set("limit", "10");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`iTunes search returned ${res.status}`);
  const data = await res.json();

  // iTunes returns { resultCount, results: [...] }. Map to our shape, ignoring
  // entries missing the bits we need.
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .filter((r: any) => typeof r.trackId === "number" && typeof r.trackName === "string")
    .map((r: any): ItunesCandidate => ({
      trackId: r.trackId,
      trackName: r.trackName,
      releaseDate: r.releaseDate ?? "",
      artistName: r.artistName ?? "",
      trackViewUrl: r.trackViewUrl ?? "",
      artworkUrl100: r.artworkUrl100 ?? "",
    }));
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/lib/itunes-availability/itunes-search.ts
git commit -m "feat(itunes-availability): iTunes Search API client

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Add Film modal — capture tmdb_id + theatrical_release_date

**Files:**
- Modify: `app/lib/search/tmdb.ts`
- Modify: `app/lib/actions/admin/films.ts`
- Modify: `app/app/admin/films/FilmForm.tsx`

- [ ] **Step 1: Surface `tmdb_id` and `theatrical_release_date` from `lookupTmdb`**

In `app/lib/search/tmdb.ts`, update `TmdbFilmFields` and the body of `lookupTmdb`:

```ts
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
  tmdb_id: number;
  theatrical_release_date: string | null;
}
```

In the `fields` object built inside `lookupTmdb`, append the two new fields:

```ts
const fields: TmdbFilmFields = {
  // ...existing keys...
  tmdb_id: tmdbId,
  theatrical_release_date: movie.release_date || null,
};
```

(`movie.release_date` is already in scope; it's the same field used for `year`.)

- [ ] **Step 2: Update `FilmFormFields` to include the new columns**

In `app/lib/actions/admin/films.ts`, extend the `FilmFormFields` interface:

```ts
export interface FilmFormFields {
  itunes_id: number | null;
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
  tmdb_id: number | null;
  theatrical_release_date: string | null;
}
```

- [ ] **Step 3: Persist them in `adminCreateFilm` and `adminUpdateFilm`**

In `adminCreateFilm`'s `payload` object, add:

```ts
const payload = {
  // ...existing keys...
  tmdb_id: fields.tmdb_id,
  theatrical_release_date: fields.theatrical_release_date,
};
```

If `adminUpdateFilm` exists in the same file, do the same in its update payload.

- [ ] **Step 4: Update `FilmForm` defaults + form fields**

In `app/app/admin/films/FilmForm.tsx`, ensure `initial` defaults supply `tmdb_id: null, theatrical_release_date: null` for the manual / iTunes paths. The TMDB option populates these from `lookupTmdb` automatically — find where TMDB-derived fields seed the form (likely in `AddFilmClient.tsx` or `TmdbSearchBox.tsx`) and confirm the new fields flow through. No new visible UI fields needed.

If you find the parent uses spread (`{ ...lookupResult }`), the new fields will flow automatically. Verify by reading `app/app/admin/films/new/AddFilmClient.tsx` and checking whether it spreads or picks fields explicitly.

- [ ] **Step 5: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: clean. If errors point to `FilmFormFields` consumers other than FilmForm, fix those too (they may need defaults).

- [ ] **Step 6: Commit**

```bash
git add app/lib/search/tmdb.ts app/lib/actions/admin/films.ts app/app/admin/films/FilmForm.tsx app/app/admin/films/new/AddFilmClient.tsx
git commit -m "feat(admin): capture tmdb_id + theatrical_release_date on Add Film

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Check orchestrator

**Files:**
- Create: `app/lib/itunes-availability/check.ts`

The orchestrator: select candidate films → search iTunes → score → auto-promote or queue → update timestamp. Tests come in Task 11 (integration with MSW).

- [ ] **Step 1: Implement**

Create `app/lib/itunes-availability/check.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { scoreMatch, type FilmInput } from "./score";
import { searchItunesMovies } from "./itunes-search";

const AUTO_PROMOTE_THRESHOLD = 0.85;
const QUEUE_THRESHOLD = 0.45;
const BATCH_LIMIT = 30;

export interface CheckSummary {
  considered: number;
  autoPromoted: number;
  queued: number;
  belowThreshold: number;
  errors: number;
}

interface FilmRow {
  id: string;
  title: string;
  year: number;
  director: string;
  theatrical_release_date: string | null;
}

export async function runItunesAvailabilityCheck(
  client: SupabaseClient<Database>,
): Promise<CheckSummary> {
  const summary: CheckSummary = {
    considered: 0,
    autoPromoted: 0,
    queued: 0,
    belowThreshold: 0,
    errors: 0,
  };

  // Selection — see spec for full rationale on the date windows.
  // We can't express the OR condition cleanly through PostgREST. Use rpc
  // or two queries; here we use rpc-equivalent via a single .or() chain.
  const today = new Date().toISOString().slice(0, 10);
  const minDate = new Date(Date.now() - 365 * 86400 * 1000).toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const minYear = new Date().getUTCFullYear() - 1;
  const cooldownIso = new Date(Date.now() - 6 * 86400 * 1000).toISOString();

  // Two-phase select: first by precise date, then fall back to year-based.
  const precise = await client
    .from("films")
    .select("id, title, year, director, theatrical_release_date")
    .is("itunes_id", null)
    .eq("tracking", false)
    .gte("theatrical_release_date", minDate)
    .lte("theatrical_release_date", maxDate)
    .or(`last_itunes_check_at.is.null,last_itunes_check_at.lt.${cooldownIso}`)
    .order("last_itunes_check_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);
  if (precise.error) throw precise.error;

  const yearFallback = await client
    .from("films")
    .select("id, title, year, director, theatrical_release_date")
    .is("itunes_id", null)
    .is("theatrical_release_date", null)
    .eq("tracking", false)
    .gte("year", minYear)
    .or(`last_itunes_check_at.is.null,last_itunes_check_at.lt.${cooldownIso}`)
    .order("last_itunes_check_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);
  if (yearFallback.error) throw yearFallback.error;

  // Merge, dedupe by id, cap at BATCH_LIMIT.
  const seen = new Set<string>();
  const films: FilmRow[] = [];
  for (const r of [...(precise.data ?? []), ...(yearFallback.data ?? [])]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    films.push(r as FilmRow);
    if (films.length >= BATCH_LIMIT) break;
  }

  // Filter out films with a recent rejected candidate (14-day cooldown).
  if (films.length > 0) {
    const ids = films.map(f => f.id);
    const rejectionCutoff = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
    const rej = await client
      .from("itunes_candidates")
      .select("film_id")
      .in("film_id", ids)
      .eq("status", "rejected")
      .gte("reviewed_at", rejectionCutoff);
    if (rej.error) throw rej.error;
    const rejected = new Set((rej.data ?? []).map((r: { film_id: string }) => r.film_id));
    for (let i = films.length - 1; i >= 0; i--) {
      if (rejected.has(films[i].id)) films.splice(i, 1);
    }
  }

  summary.considered = films.length;

  for (const film of films) {
    try {
      await processFilm(client, film, summary);
    } catch (e) {
      summary.errors++;
      console.error(`itunes-check ${film.id} (${film.title}): ${(e as Error).message}`);
    }
    // Always touch last_itunes_check_at so we don't redo this row next run.
    await client
      .from("films")
      .update({ last_itunes_check_at: new Date().toISOString() })
      .eq("id", film.id);
  }

  return summary;
}

async function processFilm(
  client: SupabaseClient<Database>,
  film: FilmRow,
  summary: CheckSummary,
): Promise<void> {
  const input: FilmInput = { title: film.title, year: film.year, director: film.director };
  const candidates = await searchItunesMovies(film.title);
  if (candidates.length === 0) {
    summary.belowThreshold++;
    return;
  }

  let best: { score: number; matchType: string; cand: typeof candidates[0] } | null = null;
  for (const c of candidates) {
    const r = scoreMatch(input, c);
    if (best === null || r.confidence > best.score) {
      best = { score: r.confidence, matchType: r.matchType, cand: c };
    }
  }
  if (!best || best.score < QUEUE_THRESHOLD) {
    summary.belowThreshold++;
    return;
  }

  if (best.score >= AUTO_PROMOTE_THRESHOLD) {
    await autoPromote(client, film, best);
    summary.autoPromoted++;
    return;
  }

  await queueCandidate(client, film, best);
  summary.queued++;
}

async function autoPromote(
  client: SupabaseClient<Database>,
  film: FilmRow,
  best: { score: number; matchType: string; cand: { trackId: number; trackName: string; trackViewUrl: string; artworkUrl100: string; releaseDate: string } },
): Promise<void> {
  // The CASE-based update preserves existing TMDB metadata and only fills
  // empty fields. We can't do that in a single .update() call cleanly via
  // PostgREST, so fetch first then build the patch in JS.
  const fr = await client.from("films").select("artwork_url, runtime_min, content_advisory").eq("id", film.id).single();
  if (fr.error) throw fr.error;
  const patch: Record<string, unknown> = {
    itunes_id: best.cand.trackId,
    itunes_url: best.cand.trackViewUrl,
    tracking: true,
    available: true,
  };
  if (!fr.data?.artwork_url) patch.artwork_url = best.cand.artworkUrl100.replace(/100x100/, "600x600");
  // runtime + content_advisory aren't returned by Search; leave as-is.

  // Defensive guard: only update if itunes_id still null.
  const upd = await client
    .from("films")
    .update(patch as never)
    .eq("id", film.id)
    .is("itunes_id", null);
  if (upd.error) throw upd.error;
}

async function queueCandidate(
  client: SupabaseClient<Database>,
  film: FilmRow,
  best: { score: number; matchType: string; cand: { trackId: number; trackName: string; trackViewUrl: string; artworkUrl100: string; releaseDate: string } },
): Promise<void> {
  // Replace any prior pending row first (the partial unique index requires this).
  await client
    .from("itunes_candidates")
    .delete()
    .eq("film_id", film.id)
    .eq("status", "pending");

  const matchYearStr = best.cand.releaseDate.match(/^(\d{4})/)?.[1];
  const ins = await client.from("itunes_candidates").insert({
    film_id: film.id,
    itunes_id: best.cand.trackId,
    itunes_url: best.cand.trackViewUrl,
    match_title: best.cand.trackName,
    match_year: matchYearStr ? Number(matchYearStr) : null,
    match_artwork_url: best.cand.artworkUrl100 || null,
    confidence: best.score,
    match_type: best.matchType,
    status: "pending",
  });
  if (ins.error) throw ins.error;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/lib/itunes-availability/check.ts
git commit -m "feat(itunes-availability): orchestrator (select, score, promote/queue)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Cron route handler

**Files:**
- Create: `app/app/api/cron/check-itunes-availability/route.ts`

Mirror `app/app/api/cron/theater-alerts/route.ts` exactly — same auth pattern, same Sentry init, same error wrapping.

- [ ] **Step 1: Implement**

Create `app/app/api/cron/check-itunes-availability/route.ts`:

```ts
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/node";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { runItunesAvailabilityCheck } from "@/lib/itunes-availability/check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header || header !== `Bearer ${secret}`) {
    return unauthorized();
  }

  if (process.env.SENTRY_DSN && !Sentry.isInitialized?.()) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  try {
    const supabase = serviceRoleClient();
    const summary = await runItunesAvailabilityCheck(supabase);
    console.log("check-itunes-availability:", summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cron check-itunes-availability failed:", message);
    Sentry.captureException(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/app/api/cron/check-itunes-availability/route.ts
git commit -m "feat(cron): /api/cron/check-itunes-availability route

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: vercel.json — add cron schedule

**Files:**
- Modify: `app/vercel.json`

- [ ] **Step 1: Add the schedule entry**

Open `app/vercel.json`. Add a new entry to the `crons` array:

```json
{
  "crons": [
    { "path": "/api/cron/refresh-prices", "schedule": "0 9 * * *" },
    { "path": "/api/cron/send-notifications", "schedule": "0 10 * * *" },
    { "path": "/api/cron/send-rate-reminders", "schedule": "0 11 * * *" },
    { "path": "/api/cron/theater-alerts", "schedule": "0 14 * * 1,4" },
    { "path": "/api/cron/check-itunes-availability", "schedule": "0 14 * * 1" }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add app/vercel.json
git commit -m "feat(cron): schedule check-itunes-availability weekly Mondays 14:00 UTC

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Admin candidates queries + actions

**Files:**
- Create: `app/lib/queries/admin/itunes-candidates.ts`
- Create: `app/lib/actions/admin/itunes-candidates.ts`

- [ ] **Step 1: Implement query helper**

Create `app/lib/queries/admin/itunes-candidates.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface PendingCandidateRow {
  id: string;
  film_id: string;
  itunes_id: number;
  itunes_url: string;
  match_title: string;
  match_year: number | null;
  match_artwork_url: string | null;
  confidence: number;
  match_type: string;
  created_at: string;
  film: {
    id: string;
    title: string;
    year: number;
    director: string;
    artwork_url: string;
  };
}

export async function listPendingItunesCandidates(
  client: SupabaseClient<Database>,
): Promise<PendingCandidateRow[]> {
  const { data, error } = await client
    .from("itunes_candidates")
    .select(
      "id, film_id, itunes_id, itunes_url, match_title, match_year, match_artwork_url, confidence, match_type, created_at, film:films!inner(id, title, year, director, artwork_url)",
    )
    .eq("status", "pending")
    .order("confidence", { ascending: false });
  if (error) throw error;
  // PostgREST nested embed types may emit film as array; coerce.
  return (data ?? []).map(r => ({
    ...r,
    film: Array.isArray((r as { film: unknown }).film)
      ? (r as { film: PendingCandidateRow["film"][] }).film[0]
      : ((r as { film: PendingCandidateRow["film"] }).film),
  })) as PendingCandidateRow[];
}
```

- [ ] **Step 2: Implement server actions**

Create `app/lib/actions/admin/itunes-candidates.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export async function adminConfirmItunesCandidate(
  candidateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { user } = await requireAdmin(supabase);

  const sr = serviceRoleClient();

  // Read the candidate
  const cand = await sr
    .from("itunes_candidates")
    .select("id, film_id, itunes_id, itunes_url, match_artwork_url, status")
    .eq("id", candidateId)
    .single();
  if (cand.error) return { ok: false, error: cand.error.message };
  if (cand.data.status !== "pending") return { ok: false, error: "Candidate is not pending." };

  // Read the film to know which optional fields to backfill
  const film = await sr
    .from("films")
    .select("artwork_url")
    .eq("id", cand.data.film_id)
    .single();
  if (film.error) return { ok: false, error: film.error.message };

  const patch: Record<string, unknown> = {
    itunes_id: cand.data.itunes_id,
    itunes_url: cand.data.itunes_url,
    tracking: true,
    available: true,
  };
  if (!film.data.artwork_url && cand.data.match_artwork_url) {
    patch.artwork_url = cand.data.match_artwork_url.replace(/100x100/, "600x600");
  }

  const upd = await sr.from("films").update(patch as never).eq("id", cand.data.film_id).is("itunes_id", null);
  if (upd.error) return { ok: false, error: upd.error.message };

  const mark = await sr
    .from("itunes_candidates")
    .update({ status: "confirmed", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", candidateId);
  if (mark.error) return { ok: false, error: mark.error.message };

  revalidatePath("/admin/itunes-candidates");
  revalidatePath(`/film/${cand.data.film_id}`);
  return { ok: true };
}

export async function adminRejectItunesCandidate(
  candidateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { user } = await requireAdmin(supabase);

  const sr = serviceRoleClient();
  const upd = await sr
    .from("itunes_candidates")
    .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", candidateId)
    .eq("status", "pending");
  if (upd.error) return { ok: false, error: upd.error.message };

  revalidatePath("/admin/itunes-candidates");
  return { ok: true };
}
```

If `requireAdmin` doesn't return `{ user }`, check its signature in `app/lib/auth/require-admin.ts` and adjust (it may need `const { data: { user } } = await supabase.auth.getUser()` separately).

- [ ] **Step 3: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: clean. If `requireAdmin` doesn't return user, add a separate `const { data: { user } } = await supabase.auth.getUser(); if (!user) return ...`.

- [ ] **Step 4: Commit**

```bash
git add app/lib/queries/admin/itunes-candidates.ts app/lib/actions/admin/itunes-candidates.ts
git commit -m "feat(admin): itunes-candidates queries + confirm/reject actions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Admin candidates page UI

**Files:**
- Create: `app/app/admin/itunes-candidates/page.tsx`
- Create: `app/app/admin/itunes-candidates/CandidateRow.tsx`

- [ ] **Step 1: Implement page (server component)**

Create `app/app/admin/itunes-candidates/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listPendingItunesCandidates } from "@/lib/queries/admin/itunes-candidates";
import CandidateRow from "./CandidateRow";

export default async function AdminItunesCandidatesPage() {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const rows = await listPendingItunesCandidates(supabase);

  return (
    <div>
      <h1 className="h-display" style={{ marginBottom: 12 }}>iTunes candidates</h1>
      <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.7, marginBottom: 24 }}>
        Films matched fuzzily to iTunes by the weekly cron. Confirm to populate the iTunes ID and start tracking; reject to skip for 14 days.
      </p>

      {rows.length === 0 ? (
        <p style={{ fontFamily: "var(--font-ui)" }}>Nothing pending.</p>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {rows.map(r => <CandidateRow key={r.id} row={r} />)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement row component (client)**

Create `app/app/admin/itunes-candidates/CandidateRow.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminConfirmItunesCandidate,
  adminRejectItunesCandidate,
} from "@/lib/actions/admin/itunes-candidates";
import type { PendingCandidateRow } from "@/lib/queries/admin/itunes-candidates";

interface Props {
  row: PendingCandidateRow;
}

export default function CandidateRow({ row }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"confirm" | "reject" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy("confirm");
    setErr(null);
    const res = await adminConfirmItunesCandidate(row.id);
    if (!res.ok) {
      setErr(res.error);
      setBusy(null);
      return;
    }
    router.refresh();
  }

  async function handleReject() {
    setBusy("reject");
    setErr(null);
    const res = await adminRejectItunesCandidate(row.id);
    if (!res.ok) {
      setErr(res.error);
      setBusy(null);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{
      border: "1px solid #333",
      background: "var(--void-2)",
      padding: 16,
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16,
    }}>
      <Side
        label="TMDB film"
        title={row.film.title}
        year={row.film.year}
        director={row.film.director}
        artwork={row.film.artwork_url}
      />
      <Side
        label={`iTunes candidate · ${(row.confidence * 100).toFixed(0)}% · ${row.match_type}`}
        title={row.match_title}
        year={row.match_year ?? "—"}
        director="(iTunes provides no director)"
        artwork={row.match_artwork_url?.replace(/100x100/, "300x300") ?? ""}
      />

      <div style={{ gridColumn: "1 / span 2", display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={handleConfirm} disabled={busy !== null} className="btn btn-sm btn-dark">
          {busy === "confirm" ? "Confirming…" : "Confirm match"}
        </button>
        <button onClick={handleReject} disabled={busy !== null} className="btn btn-sm btn-outline">
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </button>
        <a href={row.itunes_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">
          Open on Apple TV ↗
        </a>
        {err && <span style={{ color: "var(--blood)", fontSize: 12 }}>{err}</span>}
      </div>
    </div>
  );
}

function Side({ label, title, year, director, artwork }: {
  label: string;
  title: string;
  year: number | string;
  director: string;
  artwork: string;
}) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {artwork ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artwork} alt="" style={{ width: 80, height: 120, objectFit: "cover", border: "1px solid #444" }} />
      ) : (
        <div style={{ width: 80, height: 120, background: "#222", border: "1px solid #444" }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="caps" style={{ fontSize: 10, color: "var(--accent)", marginBottom: 6 }}>{label}</div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, marginBottom: 4 }}>{title} <span style={{ opacity: 0.6 }}>({year})</span></div>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, opacity: 0.75 }}>{director}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/app/admin/itunes-candidates/
git commit -m "feat(admin): /admin/itunes-candidates review UI

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Integration test for orchestrator

**Files:**
- Create: `app/tests/itunes-availability/check.test.ts`

This test mocks iTunes Search via `fetch` stubbing (vitest's built-in support) and uses the **real** prod-shaped types but a stubbed Supabase client. The codebase pattern (per CLAUDE.md "Env-blocked action tests") uses `describe.skipIf(!hasEnv)` for tests requiring real Supabase. Since this test stubs everything, it doesn't need env.

- [ ] **Step 1: Write the test**

Create `app/tests/itunes-availability/check.test.ts`:

```ts
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
      trackName: "Hereditary Reissue",  // fuzzy title; should land in queue
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
```

NOTE: This stub-based test trades off some fidelity for self-contained execution. If the orchestrator's PostgREST chain doesn't match the stub, the test will fail and you'll need to adjust the stub to match the chain. The stub is intentionally permissive (filters that aren't recognized are ignored) to keep this maintainable.

- [ ] **Step 2: Run tests, verify they pass**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/itunes-availability/check.test.ts
```

Expected: 2 tests pass. If the stub doesn't line up with the orchestrator's exact call pattern, either fix the stub or refactor the orchestrator to be more testable (extract a `selectFilms()` function, etc.).

- [ ] **Step 3: Commit**

```bash
git add app/tests/itunes-availability/check.test.ts
git commit -m "test(itunes-availability): orchestrator integration test

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Deploy + smoke test

- [ ] **Step 1: Final typecheck**

```bash
cd /Users/christophernowacki/film-goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test
```

Expected: clean typecheck. All tests pass.

- [ ] **Step 2: Deploy to prod**

```bash
cd /Users/christophernowacki/film-goblin
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel deploy --prod --yes
```

Expected: build succeeds, alias updates to film-goblin.vercel.app.

- [ ] **Step 3: Smoke-test the cron manually**

Get the prod `CRON_SECRET` from Vercel env if you haven't pulled it:

```bash
cd /Users/christophernowacki/film-goblin
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel env pull app/.env.production --yes --environment=production
grep CRON_SECRET app/.env.production
rm app/.env.production
```

Hit the cron URL:

```bash
CRON_SECRET="<from above>"
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://film-goblin.vercel.app/api/cron/check-itunes-availability | python3 -m json.tool
```

Expected: JSON response with `ok: true` and a summary like:

```json
{
  "ok": true,
  "considered": 5,
  "autoPromoted": 1,
  "queued": 2,
  "belowThreshold": 2,
  "errors": 0
}
```

- [ ] **Step 4: Verify candidates appear in admin UI**

Sign in as admin in a browser, navigate to `https://film-goblin.vercel.app/admin/itunes-candidates`. Pending candidates from the smoke test should be listed. Click "Confirm" on one to verify the action wires through correctly.

- [ ] **Step 5: Update CLAUDE.md "Current state"**

Update `CLAUDE.md` to note the iTunes availability cron is live, schedule, and where the admin queue lives.

- [ ] **Step 6: Final commit**

```bash
git add CLAUDE.md
git commit -m "chore(claude): note iTunes availability cron is live

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

After implementing all tasks, verify:

- [ ] **Spec coverage:** Every spec section has a corresponding task: schema (Task 1), score function (Task 3), cron route (Task 7), schedule (Task 8), admin UI (Task 10), tests (Tasks 3+11), Add Film modal change (Task 5), file map (Tasks 1-10).
- [ ] **Match thresholds match the spec:** auto ≥0.85, queue 0.45–0.85, discard <0.45 — all in `score.ts`/`check.ts` constants.
- [ ] **Cooldowns match the spec:** 6-day re-check cadence, 14-day rejection cooldown — both in `check.ts`.
- [ ] **vercel.json schedule = `0 14 * * 1`** (Monday 14:00 UTC = 7am Phoenix).
- [ ] **Auto-promote uses `WHERE itunes_id IS NULL` defensive guard** — see `check.ts:autoPromote` and the confirm action.
- [ ] **Partial unique index on `films.itunes_id`** is in mig 0175.

Done.
