# Apple TV search provider (Lane B) — design

**Status:** approved 2026-04-24. Implements Lane B from the pre-spec sketch at `docs/superpowers/specs/2026-04-24-apple-tv-add-film-helpers-sketch.md`. Targets the admin "Add Film" flow.

## Problem

iTunes Search (`itunes.apple.com/search`) has a stale/incomplete index for modern Apple TV titles — Suspiria 2018, Midsommar, Send Help, and others return zero results across every region tested (US/GB/CA/AU/IE/NZ/DE/FR/IT/ES/SE/NL). The films are sellable on Apple TV (the iOS Apple TV app finds them via its internal `uts/v3/*` API), but no anonymous server-side API exposes the same catalog.

Today's admin Add Film flow has three options: Search iTunes (broken for the above), Paste Apple TV URL (works but admin has to find the URL themselves), or Manual entry (tedious). Lane B automates finding the Apple TV page for a title the admin types.

## Approach

Route around iTunes Search by using Brave Search as an index of the Apple TV website. Admin types a title; server queries Brave with a `site:`-restricted search; harvests `tv.apple.com/us/movie/*/umc.cmc.*` URLs from the top results; fetches each candidate page server-side; extracts the `adamId` (iTunes trackId) from the embedded JSON. Returns candidates with the same shape the existing iTunes search flow uses.

Brave is the sole search provider. An iTunes-first cascade was designed but removed during integration testing: iTunes Search rarely returns zero for missing films — it returns irrelevant near-matches (e.g. "You Can't Run Forever" for "the thing carpenter"), so the fallback-on-zero trigger never fired and Brave was never reached. Partial-success candidates (some extract cleanly, some are streaming-only) surface only the working ones.

## Decisions

- **Provider:** Brave Search API (2000 free queries/month, 1 req/sec free-tier limit). Signup requires a credit card even on the free tier. Selected over Google CSE (100/day hard cap, more setup) and SerpAPI (per-call paid from the start).
- **UI:** Single search widget replacing today's `iTunesSearchBox`. Backend goes straight to Brave after auth and empty-input checks. Candidate cards have no source badge — there is only one source.
- **Region:** US only, hardcoded via `APPLE_TV_SEARCH_REGION = "us"` constant at the top of the server-action file.
- **Caching:** None. At admin volume (single-digit searches per day) the Brave quota math is a non-issue. Caching is complexity on spec.
- **Error posture:** Server-side `console.*` logs for extraction failures; admin sees only working candidates. Zero-survivor case distinguishes "Brave returned nothing" (`brave-empty`) from "Brave returned results but all streaming-only" (`all-streaming-only`) from "Brave unreachable" (`brave-error`) — each gets specific admin-facing copy.
- **Env var:** `BRAVE_SEARCH_API_KEY`, app-only, pushed to Vercel with `--sensitive`. Rotation note added to `CLAUDE.md` Gotchas.
- **Testing:** Vitest in `app/` following the existing `vi.mock` pattern used by `tests/routes/cron-refresh-prices.test.ts` and other admin/action tests. Global `fetch` is stubbed per-test via `vi.spyOn(globalThis, "fetch")`; `film-goblin-worker` is mocked via `vi.mock("film-goblin-worker")`. No MSW dependency — the existing codebase doesn't use it and adding it would be inconsistent. Pure functions and server action only. No React component testing.
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
  apple-tv-search.test.ts           (NEW — Vitest + vi.mock, 10 tests)
  resolve-adam-id.test.ts           (NEW — pure-function tests, 4 tests)

app/tests/fixtures/
  apple-tv-page-valid.html          (NEW)
  apple-tv-page-streaming-only.html (NEW)
  brave-search-response.json        (NEW)
  brave-search-empty.json           (NEW)

(Existing — no changes needed: app/vitest.config.ts, vitest devDep)

Environment:
  BRAVE_SEARCH_API_KEY              (NEW — app/.env.local + Vercel, sensitive)

CLAUDE.md
  Gotchas                           (EDIT — add Brave key rotation note)
```

### Module boundaries

- `app/lib/apple-tv/resolve-adam-id.ts` — pure utilities. Exports `extractAdamIdFromHtml(html)` (sync, pure) and `resolveAdamIdFromAppleTvUrl(url)` (fetch + extract). No auth, no DB, no Brave.
- `app/lib/actions/admin/apple-tv-search.ts` — server action + orchestration. Exports `adminSearchAppleTv(term)`. Internal helpers: Brave search, URL filter, parallel page fetches, error categorization.
- `app/app/admin/films/AppleTvSearchBox.tsx` — client component. Mirrors today's `iTunesSearchBox` UX. Differentiates error copy by `reason` code. No `via` badge (single source).

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
import { parseFilm, fetchPrices, type ParsedFilm } from "film-goblin-worker";
import { extractAdamIdFromHtml } from "@/lib/apple-tv/resolve-adam-id";
import type { ITunesSearchHit } from "./films";

const APPLE_TV_SEARCH_REGION = "us";
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const CANDIDATE_LIMIT = 5;
const APPLE_TV_URL_RE = new RegExp(
  `^https://tv\\.apple\\.com/${APPLE_TV_SEARCH_REGION}/movie/[a-z0-9-]+/umc\\.cmc\\.[a-z0-9]+$`
);

export type SearchCandidate = ITunesSearchHit;

export type SearchResult =
  | { ok: true; candidates: SearchCandidate[] }
  | { ok: false; reason: "brave-empty" | "all-streaming-only" | "brave-error"; message: string };

export async function adminSearchAppleTv(term: string): Promise<SearchResult> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const trimmed = term.trim();
  if (!trimmed) return { ok: true, candidates: [] };

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
10. Otherwise return `{ ok: true, candidates }`.

### `app/app/admin/films/AppleTvSearchBox.tsx`

Mirrors today's `iTunesSearchBox` verbatim (input styling, candidate card grid, `onPick` shape). Two UX deltas:

- Placeholder: `"Search Apple TV (title)…"`
- Error rendering switches on `result.reason`:
  - `brave-empty` → `"No Apple TV results for '<term>'. Try a different spelling or use manual entry."`
  - `all-streaming-only` → `"Apple TV has results for '<term>' but none are buyable (all streaming-only)."`
  - `brave-error` → `"Search unavailable — try again in a moment."`

No `via` badge on candidate cards — there is only one source (Brave → Apple TV page).

### `AddFilmClient.tsx` edits

- Import `AppleTvSearchBox` instead of `iTunesSearchBox`.
- Update Option 1 heading text: `"Search iTunes"` → `"Search Apple TV"`.
- No other changes. `onPick` contract, `prefillFromHit`, `startManual`, and `FilmForm` flow are untouched.

## Data flow

### Happy path (Brave rescues)

```
Admin types "Midsommar"
  → adminSearchAppleTv("Midsommar")
      → requireAdmin
      → tryBraveSearch:
          → GET brave /res/v1/web/search?q=site:tv.apple.com/us/movie "Midsommar"
          → 200 OK, 8 URLs
          → filter by APPLE_TV_URL_RE → 5 match
          → Promise.all: fetch 5 pages, extract adamId, lookup price
          → 3 survive (2 streaming-only dropped silently + logged)
          → return { ok: true, candidates: [3] }
  → 3 cards render (no via badge).
```

### Failure matrix

| Trigger | Server returns | Admin sees |
|---|---|---|
| Empty input | `{ ok: true, candidates: [] }` | Form unchanged |
| Brave 2xx + valid candidates | `{ ok: true, candidates: [...] }` | Candidate cards (no via badge) |
| Brave 2xx, filter-zero | `{ ok: false, reason: "brave-empty" }` | "No Apple TV results for '<term>'…" |
| Brave 2xx, all `adamId` extraction fails | `{ ok: false, reason: "all-streaming-only" }` | "Results exist but all streaming-only." |
| Brave 401/429/5xx/network | `{ ok: false, reason: "brave-error" }` | "Search unavailable — try again." |

## Error handling

- **Auth:** `requireAdmin` throws through to Next.js (redirect to sign-in). Not caught.
- **Empty input:** server returns `{ ok: true, candidates: [] }` defensively.
- **iTunes:** not called. Brave is the sole provider.
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

### Runtime setup

- `app/vitest.config.ts` already exists (Node env, `@` alias, dotenv loading, 20s timeout) — no changes.
- Vitest 2.1.8 already in devDeps — no new installs.
- Tests under `app/tests/admin/` mirroring existing `tests/admin/require-admin.test.ts` and `tests/admin/layout-guard.test.ts`.

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

### `app/tests/admin/apple-tv-search.test.ts` (11 tests)

**Mocking strategy:**

Follows the established pattern from `tests/routes/cron-refresh-prices.test.ts` and other admin tests:

- `vi.mock("film-goblin-worker", ...)` with hoisted mocks for `parseFilm`, `fetchPrices`. Per-test control via `parseFilmMock.mockImplementation(...)` etc. `searchFilms` is not mocked — it is no longer imported.
- `vi.mock("@/lib/auth/require-admin", ...)` — `requireAdmin` becomes a no-op.
- `vi.mock("@/lib/supabase/server", ...)` — `createClient` returns a stub object (never dereferenced past `requireAdmin`).
- `vi.spyOn(globalThis, "fetch")` with a per-test implementation that branches on URL prefix: Brave endpoint → fixture JSON response, `tv.apple.com/us/movie/...` → fixture HTML by URL, else throws (unexpected URL caught).
- `vi.spyOn(console, "log")` / `vi.spyOn(console, "error")` where log-emission is asserted.
- Import the server action AFTER `vi.mock` calls using `await import(...)`.

**Test cases:**

1. **Empty input.** Assert `fetch` is not called. Result `{ ok: true, candidates: [] }`.
2. **requireAdmin throws.** Assert the error propagates; no downstream work.
3. **Brave empty.** `web.results: []`. Assert `{ ok: false, reason: "brave-empty" }` + no `tv.apple.com` fetches.
4. **Brave filter-zero.** Only noise URLs. Assert `brave-empty`.
5. **Subscription token + query format.** Assert correct `X-Subscription-Token` header and quoted phrase in query string.
6. **Brave happy path (5 candidates).** Fetch spy returns the 8-URL Brave fixture for the Brave endpoint, valid HTML for 5 `tv.apple.com` URLs, and `fetchPricesMock` returns a parsed film per adamId. Assert 5 candidates with correct sorted ids; noise URLs not fetched.
7. **Partial streaming-only.** 5 URLs; 3 return valid HTML, 2 return streaming-only HTML. Assert `ok: true` with 3 candidates + `console.log` called with `"apple-tv-search: dropped 2/5"` substring.
8. **All streaming-only.** 5 URLs; all 5 return streaming-only HTML. Assert `{ ok: false, reason: "all-streaming-only" }`.
9. **Brave 500.** Assert `brave-error` + `console.error` with status.
10. **Brave 401.** Assert `brave-error` (no differentiation from 500 in admin copy).
11. **Missing env var.** Unset `BRAVE_SEARCH_API_KEY` for the test. Assert `brave-error` + `console.error` containing "BRAVE_SEARCH_API_KEY". Restore after.

### Not tested (and why)

- `AppleTvSearchBox.tsx` rendering — no React testing library in `app/`; not worth setting up for one component. Manual verification via `npm run dev`.
- `requireAdmin` enforcement — covered by mock; real auth tests out of scope.
- End-to-end real Brave + real Apple TV — covered by manual admin testing post-deploy.

### Total

15 tests (4 + 11), all hermetic, <1s runtime.

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
