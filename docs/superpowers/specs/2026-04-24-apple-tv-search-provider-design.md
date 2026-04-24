# Apple TV search provider (Lane B) — design

**Status:** approved 2026-04-24. Implements Lane B from the pre-spec sketch at `docs/superpowers/specs/2026-04-24-apple-tv-add-film-helpers-sketch.md`. Targets the admin "Add Film" flow.

## Problem

iTunes Search (`itunes.apple.com/search`) has a stale/incomplete index for modern Apple TV titles — Suspiria 2018, Midsommar, Send Help, and others return zero results across every region tested (US/GB/CA/AU/IE/NZ/DE/FR/IT/ES/SE/NL). The films are sellable on Apple TV (the iOS Apple TV app finds them via its internal `uts/v3/*` API), but no anonymous server-side API exposes the same catalog.

Today's admin Add Film flow has three options: Search iTunes (broken for the above), Paste Apple TV URL (works but admin has to find the URL themselves), or Manual entry (tedious). Lane B automates finding the Apple TV page for a title the admin types.

## Approach

Route around iTunes Search by using Brave Search as an index of the Apple TV website. Admin types a title; server queries Brave with a `site:`-restricted search; harvests `tv.apple.com/us/movie/*/umc.cmc.*` URLs from the top results; fetches each candidate page server-side; extracts the `adamId` (iTunes trackId) from the embedded JSON. Returns candidates with the same shape the existing iTunes search flow uses.

iTunes Search is tried first (free, no quota). Brave is the fallback only when iTunes returns zero. Partial-success candidates (some extract cleanly, some are streaming-only) surface only the working ones.

## Decisions

- **Provider:** Brave Search API (2000 free queries/month, 1 req/sec free-tier limit). Signup requires a credit card even on the free tier. Selected over Google CSE (100/day hard cap, more setup) and SerpAPI (per-call paid from the start).
- **UI:** Single search widget replacing today's `iTunesSearchBox`. Backend tries iTunes first, falls back to Brave. Each candidate card shows a `via iTunes` or `via Apple TV search` badge.
- **Region:** US only, hardcoded via `APPLE_TV_SEARCH_REGION = "us"` constant at the top of the server-action file.
- **Caching:** None. At admin volume (single-digit searches per day) the Brave quota math is a non-issue. Caching is complexity on spec.
- **Error posture:** Server-side `console.*` logs for extraction failures; admin sees only working candidates. Zero-survivor case distinguishes "Brave returned nothing" (`brave-empty`) from "Brave returned results but all streaming-only" (`all-streaming-only`) from "Brave unreachable" (`brave-error`) — each gets specific admin-facing copy.
- **Env var:** `BRAVE_SEARCH_API_KEY`, app-only, pushed to Vercel with `--sensitive`. Rotation note added to `CLAUDE.md` Gotchas.
- **Testing:** Vitest + MSW in `app/` (establishes the pattern — no tests exist in `app/` today). Pure functions and server action only. No React component testing.
- **Code organization:** New `app/lib/apple-tv/resolve-adam-id.ts` (extracted from `films.ts`, shared between URL-paste flow and Brave flow). New `app/lib/actions/admin/apple-tv-search.ts` for the server action.

## Out of scope

- Caching (search results or page fetches).
- Multi-region fanout.
- Admin-configurable query template.
- Affiliate tagging on Buy-on-Apple-TV links (separate decision — Lane C prerequisite, not Lane B's concern).
- Batch import mode.
- Chrome extension (Lane A — separate spec).
- EPF bulk catalog (Lane C — separate spec, approval-gated).

## Architecture

### Files touched

```
app/lib/apple-tv/
  resolve-adam-id.ts                (NEW — extracted from films.ts)

app/lib/actions/admin/
  apple-tv-search.ts                (NEW — Brave-backed server action)
  films.ts                          (EDIT — remove inline helper, import shared)

app/app/admin/films/
  AppleTvSearchBox.tsx              (NEW — replaces iTunesSearchBox)
  iTunesSearchBox.tsx               (DELETE — superseded)
  new/AddFilmClient.tsx             (EDIT — swap widget, update copy)

app/tests/admin/
  apple-tv-search.test.ts           (NEW — Vitest + MSW, 10 tests)
  resolve-adam-id.test.ts           (NEW — pure-function tests, 4 tests)

app/tests/fixtures/
  apple-tv-page-valid.html          (NEW)
  apple-tv-page-streaming-only.html (NEW)
  brave-search-response.json        (NEW)
  brave-search-empty.json           (NEW)

app/vitest.config.ts                (NEW — first Vitest config in app/)
app/package.json                    (EDIT — add vitest, msw, @types/node if absent)

Environment:
  BRAVE_SEARCH_API_KEY              (NEW — app/.env.local + Vercel, sensitive)

CLAUDE.md
  Gotchas                           (EDIT — add Brave key rotation note)
```

### Module boundaries

- `app/lib/apple-tv/resolve-adam-id.ts` — pure utilities. Exports `extractAdamIdFromHtml(html)` (sync, pure) and `resolveAdamIdFromAppleTvUrl(url)` (fetch + extract). No auth, no DB, no Brave.
- `app/lib/actions/admin/apple-tv-search.ts` — server action + orchestration. Exports `adminSearchAppleTv(term)`. Internal helpers: iTunes-first call (via `film-goblin-worker`'s `searchFilms`), Brave fallback, URL filter, parallel page fetches, error categorization.
- `app/app/admin/films/AppleTvSearchBox.tsx` — client component. Mirrors today's `iTunesSearchBox` UX. Adds per-candidate `via` badge. Differentiates error copy by `reason` code.

## Components

### `app/lib/apple-tv/resolve-adam-id.ts`

```ts
export function extractAdamIdFromHtml(html: string): number | null {
  const m = html.match(/"adamId":"(\d+)"/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

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

Migration: `films.ts` loses its inline copy of the helper and imports from `@/lib/apple-tv/resolve-adam-id`. Behavior-preserving refactor.

### `app/lib/actions/admin/apple-tv-search.ts`

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { searchFilms, parseFilm, fetchPrices, type ParsedFilm } from "film-goblin-worker";
import { extractAdamIdFromHtml } from "@/lib/apple-tv/resolve-adam-id";
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

  const itunesCandidates = await tryItunesSearch(trimmed);
  if (itunesCandidates.length > 0) return { ok: true, candidates: itunesCandidates };

  return await tryBraveSearch(trimmed);
}
```

Internal pipeline for `tryBraveSearch`:

1. Verify `process.env.BRAVE_SEARCH_API_KEY` exists. Missing → `console.error` + return `brave-error`.
2. Build query: `site:tv.apple.com/${APPLE_TV_SEARCH_REGION}/movie "<term>"`.
3. `fetch(BRAVE_ENDPOINT + "?q=" + encodeURIComponent(query), { headers: { "X-Subscription-Token": key, Accept: "application/json" }})`.
4. Non-2xx / network error / malformed JSON → `console.error` + return `brave-error`.
5. Extract `web.results[].url`, filter against `APPLE_TV_URL_RE`, take top `CANDIDATE_LIMIT`.
6. Zero survive filter → return `brave-empty`.
7. `Promise.all` over candidates: fetch page, extract adamId; if adamId present, call `fetchPrices([adamId])` + `parseFilm` to build `ITunesSearchHit`. Drop nulls at every stage.
8. `console.log` count of drops (`"apple-tv-search: dropped N/M candidates"`) if any.
9. Zero survivors after page-fetch → return `all-streaming-only`.
10. Otherwise tag each candidate `via: "apple-tv-search"` and return `{ ok: true, candidates }`.

`tryItunesSearch` wraps the existing `searchFilms` + `parseFilm` pipeline and tags hits `via: "itunes"`. Throws from `searchFilms` are caught, logged, and treated as zero results (so Brave still runs).

### `app/app/admin/films/AppleTvSearchBox.tsx`

Mirrors today's `iTunesSearchBox` verbatim (input styling, candidate card grid, `onPick` shape). Three UX deltas:

- Placeholder: `"Search Apple TV (title)…"`
- Each candidate card gets a tiny `caps`-styled badge with `opacity: 0.5` near the "Pick →" label: `via iTunes` or `via Apple TV search`.
- Error rendering switches on `result.reason`:
  - `brave-empty` → `"No Apple TV results for '<term>'. Try a different spelling or use manual entry."`
  - `all-streaming-only` → `"Apple TV has results for '<term>' but none are buyable (all streaming-only)."`
  - `brave-error` → `"Search unavailable — try again in a moment."`

### `AddFilmClient.tsx` edits

- Import `AppleTvSearchBox` instead of `iTunesSearchBox`.
- Update Option 1 heading text: `"Search iTunes"` → `"Search Apple TV"`.
- No other changes. `onPick` contract, `prefillFromHit`, `startManual`, and `FilmForm` flow are untouched.

## Data flow

### Happy path (iTunes hits)

```
Admin types "The Thing"
  → adminSearchAppleTv("The Thing")
      → requireAdmin
      → searchFilms("The Thing", { limit: 10 })
      → parseFilm(...) × results, drop nulls
      → ≥1 parsed → tag via: "itunes", return { ok: true, candidates }
  → Cards render with "via iTunes" badge. Zero Brave quota burned.
```

### Fallback path (iTunes blind, Brave rescues)

```
Admin types "Midsommar"
  → adminSearchAppleTv("Midsommar")
      → requireAdmin
      → searchFilms("Midsommar") → []
      → tryBraveSearch:
          → GET brave /res/v1/web/search?q=site:tv.apple.com/us/movie "Midsommar"
          → 200 OK, 8 URLs
          → filter by APPLE_TV_URL_RE → 5 match
          → Promise.all: fetch 5 pages, extract adamId, lookup price
          → 3 survive (2 streaming-only dropped silently + logged)
          → return { ok: true, candidates: [3, via: "apple-tv-search"] }
  → 3 cards render with "via Apple TV search" badge.
```

### Failure matrix

| Trigger | Server returns | Admin sees |
|---|---|---|
| Empty input | `{ ok: true, candidates: [] }` | Form unchanged |
| iTunes has hits | `{ ok: true, candidates: [...itunes] }` | Cards, "via iTunes" badge |
| iTunes empty, Brave 2xx + valid candidates | `{ ok: true, candidates: [...brave] }` | Cards, "via Apple TV search" badge |
| iTunes empty, Brave 2xx, filter-zero | `{ ok: false, reason: "brave-empty" }` | "No Apple TV results for '<term>'…" |
| iTunes empty, Brave 2xx, all `adamId` extraction fails | `{ ok: false, reason: "all-streaming-only" }` | "Results exist but all streaming-only." |
| iTunes empty, Brave 401/429/5xx/network | `{ ok: false, reason: "brave-error" }` | "Search unavailable — try again." |

## Error handling

- **Auth:** `requireAdmin` throws through to Next.js (redirect to sign-in). Not caught.
- **Empty input:** server returns `{ ok: true, candidates: [] }` defensively.
- **iTunes `searchFilms` throws:** caught, `console.warn`, treated as zero results, falls through to Brave.
- **Missing `BRAVE_SEARCH_API_KEY`:** `console.error`, return `brave-error`. Do not leak "key missing" to admin.
- **Brave HTTP error (401 / 429 / 5xx / network / timeout / malformed JSON):** single catch, `console.error` with status, return `brave-error`. No differentiation of 429 vs 500 in admin copy (same action: retry later).
- **Brave empty or filter-zero:** return `brave-empty`.
- **Individual candidate fetch failure** (404, network): silent drop, `console.log` URL.
- **`adamId` extraction returns null** (streaming-only page): silent drop, `console.log` URL.
- **Post-adamId iTunes Lookup failure:** silent drop, `console.log`.
- **All candidates drop:** return `all-streaming-only`.
- **Partial success:** return survivors, `console.log` the drop count.
- **Timeouts:** no explicit `AbortController` in v1. Revisit if stuck admin UIs appear in production.
- **Logging prefix:** all server logs prefix `"apple-tv-search:"` for Vercel greppability.

## Testing

### Runtime setup (first Vitest in `app/`)

- `app/vitest.config.ts` — Node environment, `globals: true`, path alias `@` → `./` matching `tsconfig.json`.
- Dev deps added if absent: `vitest`, `msw`, `@types/node`.
- Tests under `app/tests/` (mirrors `worker/` and `notifier/`).

### Fixtures (`app/tests/fixtures/`)

- `apple-tv-page-valid.html` — trimmed real Apple TV page HTML with `"adamId":"123456789"` embedded.
- `apple-tv-page-streaming-only.html` — trimmed `umc.cmc.*` page HTML with no `adamId`.
- `brave-search-response.json` — 8 result URLs: 5 valid `/us/movie/<slug>/umc.cmc.<hash>`, 3 noise (TV show, category page, non-US region).
- `brave-search-empty.json` — Brave response with `web.results: []`.

### `app/tests/admin/resolve-adam-id.test.ts` (4 tests, pure, no mocking)

1. `extractAdamIdFromHtml` returns `123456789` from valid fixture HTML.
2. `extractAdamIdFromHtml` returns `null` from streaming-only fixture HTML.
3. `extractAdamIdFromHtml` returns `null` from empty string.
4. `extractAdamIdFromHtml` returns `null` when regex match payload is non-numeric (defensive).

### `app/tests/admin/apple-tv-search.test.ts` (10 tests, MSW + `vi.mock` for auth only)

**Mocking strategy:**

- MSW handlers stub all HTTP endpoints the code touches: `api.search.brave.com/res/v1/web/search`, `tv.apple.com/*`, `itunes.apple.com/search`, `itunes.apple.com/lookup`. The worker's `searchFilms` / `fetchPrices` run for real against MSW — no module mocking for the worker. This matches how `worker/tests/` already uses MSW and keeps the real parsing logic in play.
- `vi.mock("@/lib/auth/require-admin")` and `vi.mock("@/lib/supabase/server")` to no-op the auth/DB plumbing (not what we're testing, and pulls in server-only runtime).
- Per-test control over iTunes results: adjust the MSW `itunes.apple.com/search` handler's response (empty vs. populated) per test using MSW's `server.use(...)`.

**Test cases:**

1. **iTunes happy path.** MSW `itunes.apple.com/search` returns 3 valid iTunes results. Assert Brave handler *never* called (MSW spy on the Brave endpoint records zero requests). Result `ok: true`, 3 candidates, all `via: "itunes"`.
2. **Brave happy path.** MSW iTunes Search returns `[]`. Brave returns 8-URL fixture. `tv.apple.com/*` pages stub valid HTML. `itunes.apple.com/lookup` returns a parsed-film-shaped response for each adamId. Assert 5 candidates, all `via: "apple-tv-search"`.
3. **URL filter drops noise.** Same as #2; assert the 3 noise URLs (TV show / category / non-US) are absent from candidates and their `tv.apple.com` pages were not fetched.
4. **Partial streaming-only.** 5 URLs; 3 pages valid HTML, 2 streaming-only HTML. Assert `ok: true` with 3 candidates + `console.log` called with `"apple-tv-search: dropped 2/5"` substring.
5. **All streaming-only.** 5 URLs; all 5 return streaming-only HTML. Assert `{ ok: false, reason: "all-streaming-only" }`.
6. **Brave empty.** `web.results: []`. Assert `{ ok: false, reason: "brave-empty" }` + no `tv.apple.com` fetches.
7. **Brave filter-zero.** Only noise URLs. Assert `brave-empty`.
8. **Brave 500.** Assert `brave-error` + `console.error` with status.
9. **Brave 401.** Assert `brave-error` (no differentiation).
10. **Missing env var.** Unset `BRAVE_SEARCH_API_KEY` for the test. Assert `brave-error` + `console.error`. Restore after.

### Not tested (and why)

- `AppleTvSearchBox.tsx` rendering — no React testing library in `app/`; not worth setting up for one component. Manual verification via `npm run dev`.
- `requireAdmin` enforcement — covered by mock; real auth tests out of scope.
- End-to-end real Brave + real Apple TV — covered by manual admin testing post-deploy.

### Total

14 tests (4 + 10), all hermetic, <1s runtime.

## Operational

### Env var setup

```
# Local
app/.env.local:
  BRAVE_SEARCH_API_KEY=<key from brave.com/search/api dashboard>

# Vercel (from repo root)
vercel env add BRAVE_SEARCH_API_KEY production  # prompts, stored as sensitive
vercel env add BRAVE_SEARCH_API_KEY preview
vercel env add BRAVE_SEARCH_API_KEY development
```

### Rotation runbook (for CLAUDE.md Gotchas)

1. Brave dashboard → API keys → Regenerate.
2. `npx vercel env rm BRAVE_SEARCH_API_KEY production` (and preview, development).
3. `npx vercel env add BRAVE_SEARCH_API_KEY production` with the new key. Repeat for preview/development.
4. Redeploy: `npx vercel deploy --prod --yes` from repo root.
5. Update `app/.env.local` with the new key for local dev.

### Brave plan

Free tier: 2000 queries/month, 1 req/sec. At expected admin volume (single-digit searches/day), monthly usage is ~30-150 queries — well under cap. If Lane B is ever exposed to non-admin users or batched, revisit plan and consider caching.

## Implementation estimate

- Env var setup + Brave signup — 20 min (assuming credit card ready).
- `resolve-adam-id.ts` extraction + `films.ts` edit — 20 min.
- `apple-tv-search.ts` server action + helpers — 2.5 hrs.
- `AppleTvSearchBox.tsx` + `AddFilmClient.tsx` edit + `iTunesSearchBox.tsx` delete — 1 hr.
- Vitest setup + MSW wiring + fixtures + 14 tests — 2 hrs.
- `CLAUDE.md` Gotchas edit + manual smoke-test on dev server — 30 min.

**Total: ~6 hours of focused work.** Matches the sketch's "half-day to full day" estimate.
