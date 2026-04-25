# Watchlist page (`/watchlist`) — design

**Status:** approved 2026-04-24. First new route since the Lane B ship earlier today. Fills a glaring UX dead-end: users can add films to their watchlist from anywhere (film detail, posters, search), but have no dedicated page to see or manage the watchlist.

## Problem

`WatchlistButton` + `addToWatchlist` + `removeFromWatchlist` exist. `watchlists` table exists with per-row `max_price_usd` (alert threshold), `last_alerted_at`, and RLS-scoped owner reads. `price_alerts` table captures every drop. But there's no `/watchlist` route — nowhere for users to see what they're tracking. Side effect: `max_price_usd` is always `null` today because the add-button never passes it and no UI lets users edit it.

The page is for **triage** ("what's dropped / what should I buy right now"), not discovery.

## Approach

New authenticated route `/watchlist` showing an editorial list (not a poster grid) of tracked films. Drop-first default sort surfaces the actionable items at the top. Inline per-row threshold editor fills the `max_price_usd` gap. Minimal per-row metadata: poster · title · dir/year · current price · threshold editor · remove. Two-state visual signal for drops. Zine-voice empty state for cold-start users.

## Decisions

- **Layout:** editorial list rows (not a poster grid). Each row is a single horizontal line on desktop, two-row card on mobile. Reuses the zine palette; not a data grid.
- **Sort default:** drop-first (rows where `latest_price ≤ max_price_usd`, ordered by % drop DESC; non-dropped fall below in `created_at DESC`). User-overridable via `?sort=` query param. Allowed values: `drop` (default) | `recency` | `price-low` | `alphabetical`. Mirror of `FilmsSortSelect` pattern.
- **Threshold editing:** inline pencil + mini-editor per row. Click threshold → input appears → save on Enter/blur, cancel on Escape. Empty submission clears the threshold. New server action `setWatchlistThreshold(filmId, maxPriceUsd | null)`.
- **Drop visual signal:** two-state only. Dropped rows render the current price in `var(--accent)` + a `"▼ DROP"` caps badge. Non-dropped rows render neutral. No "close to threshold" intermediate state.
- **Empty state:** zine-voice editorial copy — `The Scroll is empty.` display-type + italic-serif subcopy + a single CTA button to `/films`.
- **Nav placement:** top-nav link labeled `Watchlist` (plain, industry-standard label), inserted between `Films` and `Lists`. Gated on auth (matches existing pattern for auth-only nav items).
- **Page header:** `The Scroll` in display type, with `Films you're tracking` eyebrow/subcopy for first-time clarity.
- **Per-row metadata:** poster (48×72) · title · dir/year · current price (with drop treatment) · inline threshold editor · remove ×. No per-row "Buy on Apple TV" button (that path stays on the film detail page).

## Out of scope

- "Buy on Apple TV" direct button per row.
- Price-drop history annotation ("last dropped Oct 2025").
- "Close to threshold" intermediate visual tier.
- Seeded empty-state recommendations from coven.
- Bulk actions (remove multiple, change thresholds in bulk).
- Editing alert cadence or SD-vs-HD price preferences.
- Public watchlist visibility (watchlists remain private; RLS-owner-only).
- In-app notifications for price alerts (separate sub-project).

## Architecture

### Files touched

```
app/app/watchlist/
  page.tsx                         (NEW — server component, reads ?sort= param)
  WatchlistRow.tsx                 (NEW — client; threshold editor + remove)
  WatchlistSortSelect.tsx          (NEW — client; URL-param sort — mirror of
                                           app/app/films/FilmsSortSelect.tsx)
  WatchlistEmpty.tsx               (NEW — empty-state subcomponent, may inline
                                           into page.tsx if it stays small)

app/components/
  TopNavChrome.tsx                 (EDIT — add "Watchlist" link after "Films")

app/lib/queries/
  watchlists.ts                    (EDIT — add getMyWatchlistWithFilms)
  sort-watchlist.ts                (NEW — pure sort function, testable in isolation)

app/lib/actions/
  watchlists.ts                    (EDIT — add _setWatchlistThreshold + public wrapper;
                                           add revalidatePath("/watchlist") to
                                           addToWatchlist and removeFromWatchlist)

app/
  middleware.ts                    (EDIT — add /watchlist to protected routes matcher)
  app/globals.css                  (EDIT — .watchlist-* class set)

app/tests/actions/
  watchlists.test.ts               (EDIT — 5 tests for setWatchlistThreshold)

app/tests/queries/                 (NEW subdirectory — first tests under this path)
  sort-watchlist.test.ts           (NEW — 6 pure-function tests)
  watchlists.test.ts               (NEW — 1 test for numeric coercion in query)

app/tests/
  middleware.test.ts               (EDIT — 1 case for /watchlist redirect)
```

**Colocation note:** page-specific components (`WatchlistRow`, `WatchlistSortSelect`, `WatchlistEmpty`) live under `app/app/watchlist/` alongside `page.tsx`, following the precedent set by `/films` (which colocates `FilmsSortSelect.tsx` in `app/app/films/`) and `/admin/films/new` (colocates `AddFilmClient.tsx`). Components in `app/components/` are reserved for cross-page reusable primitives (`FilmPoster`, `WatchlistButton`, `TopNav`, etc.).

### Module boundaries

- **`getMyWatchlistWithFilms(client)`** — single PostgREST nested-select returning rows joined to `films_with_stats`. Coerces `max_price_usd` and `film.latest_price` from SDK string to `number | null` at the boundary (Supabase-numeric-as-string gotcha). Returns rows in `created_at DESC` natural order; page component re-sorts in JS.
- **`sortWatchlist(rows, sort)`** — pure function. No Supabase, no DOM. Exports discriminated sort-key union and the computeDropPct helper.
- **`setWatchlistThreshold(filmId, maxPriceUsd | null)`** — private + public pair matching the established action pattern. Validates value (`null` OR `0 < n ≤ 1000`). RLS enforces owner scoping on the UPDATE; action also `.eq("user_id", user.id)` defensively.
- **Page component** — fetches, validates `?sort=` param against allowlist, sorts in JS, maps to rows. Server-rendered.
- **`WatchlistRow`** — client component. Owns inline threshold editor state + remove pending state. Uses `useTransition` for both mutations.
- **`WatchlistSortSelect`** — client component. Mirror of `FilmsSortSelect`. `router.replace("/watchlist?sort=<value>")` on change.
- **Middleware** — one matcher addition: `/watchlist` joins the existing auth-gated list.

## Components

### `app/lib/queries/watchlists.ts` — new function

```ts
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

Existing `getMyWatchlist` stays — it's used by `/home` activity enrichment and doesn't need the film join.

### `app/lib/queries/sort-watchlist.ts` — NEW

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

### `app/lib/actions/watchlists.ts` — additions

```ts
export async function _setWatchlistThreshold(
  client: Client,
  filmId: string,
  maxPriceUsd: number | null,
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

export async function setWatchlistThreshold(filmId: string, maxPriceUsd: number | null) {
  const supabase = await createClient();
  await _setWatchlistThreshold(supabase, filmId, maxPriceUsd);
  revalidatePath("/watchlist");
}
```

Also add `revalidatePath("/watchlist")` to `addToWatchlist` and `removeFromWatchlist` so the page stays fresh after mutations from any surface.

### `app/app/watchlist/page.tsx` — NEW

Server component. Reads `?sort=` from `searchParams`, validates against allowlist, fetches via `getMyWatchlistWithFilms`, sorts via `sortWatchlist`, renders `<TopNav />` + a section with eyebrow + `The Scroll` display header + either `<WatchlistEmpty />` or toolbar + `<WatchlistRow>` list.

`WatchlistEmpty` is a local subcomponent (or sibling file if the page gets busy — judgment call at implementation): display-type `"The Scroll is empty."` + italic-serif subcopy `"No films tracked. Yet."` + `<a className="btn btn-lg" href="/films">Browse the archive →</a>`.

Toolbar: `<div className="watchlist-toolbar">` with `<span className="caps">{rows.length} tracked</span>` on the left and `<WatchlistSortSelect current={sort} />` on the right.

### `app/app/watchlist/WatchlistRow.tsx` — NEW

Client component. Receives `row: WatchlistRowData`. Local state:

```ts
const [editing, setEditing] = useState(false);
const [draft, setDraft] = useState<string>(row.max_price_usd != null ? row.max_price_usd.toFixed(2) : "");
const [editError, setEditError] = useState<string | null>(null);
const [pendingEdit, startEdit] = useTransition();
const [pendingRemove, startRemove] = useTransition();
```

Desktop row grid: `48px auto 1fr auto auto auto` with columns for poster, title/dir-year block, spacer, current price cell, threshold cell, remove button. Mobile ≤720px wraps to 2 rows: poster+title on top, price+threshold+remove as a bottom row.

Drop treatment: if `computeDropPct(row) != null`, the current-price cell renders `color: var(--accent)` and a small `<span className="caps">▼ DROP</span>` badge.

Threshold cell — three display modes:
- `max_price_usd == null && !editing` → `<button>+ Set alert</button>` in muted type.
- `max_price_usd != null && !editing` → `≤ $X.XX` + a pencil icon. Clickable to enter edit mode.
- `editing` → `<input type="number" step="0.01" min="0.01" max="1000">` prefilled with `draft`. Save on Enter/blur (calls `setWatchlistThreshold`); cancel on Escape (resets `draft`, sets `editing=false`). Empty submission → `setWatchlistThreshold(filmId, null)`.

On action error: `setEditError(e.message)` renders a small red-italic note below the input; stays in edit mode.

Remove button: `"×"` icon. Click → `startRemove(() => removeFromWatchlist(filmId))`. No optimistic update; rely on the action's `revalidatePath("/watchlist")`.

### `app/app/watchlist/WatchlistSortSelect.tsx` — NEW

Client. Receives `current: WatchlistSort`. Renders a `<select>` with four `<option>` entries (`drop` / `recency` / `price-low` / `alphabetical`). `onChange` calls `router.replace(`/watchlist?sort=${value}`, { scroll: false })`. Mirror the existing `app/app/films/FilmsSortSelect.tsx` — same JSX shape, same label styling, same URL-param behavior.

### `app/components/TopNavChrome.tsx` — EDIT

Add `{user && <a href="/watchlist">Watchlist</a>}` between the existing Films and Lists nav links (or whatever pattern matches the current TopNav structure — confirm at implementation time).

### `app/middleware.ts` — EDIT

Add `/watchlist` to the list of protected matchers. Existing redirect logic in `decideRedirect` handles the unauthed→signin flow; no new branching needed.

### `app/app/globals.css` — EDIT

New class set:

```
.watchlist-toolbar — flex row, space-between, top margin
.watchlist-list — vertical flex, row gap 12px
.watchlist-row — grid desktop layout, card styling on mobile
.watchlist-row-dropped — applied conditionally for accent price + ▼ DROP badge
.watchlist-threshold-editor — input width, focus ring, error state
.watchlist-remove — × button, muted→accent on hover
.watchlist-empty — centered editorial empty state
```

Mobile (≤720px) overrides that stack the row and preserve the drop treatment.

## Data flow

### Happy path (user with 3 films, 1 dropped)

```
User clicks "Watchlist" in top-nav
  → middleware confirms auth
  → /watchlist page renders
      → getMyWatchlistWithFilms() returns 3 rows with joined film data
      → sortWatchlist(rows, "drop") puts dropped row first, other 2 in recency order
      → page renders toolbar + 3 WatchlistRow children
  → user sees "1 tracked (dropped)" row with ▼ DROP badge at top
  → user clicks threshold pencil on row 2 → enters $8 → Enter
      → setWatchlistThreshold("film-id-2", 8)
      → server UPDATE watchlists SET max_price_usd=8 WHERE user_id=... AND film_id=...
      → revalidatePath("/watchlist")
      → page re-renders; row 2 now shows "≤ $8.00"; sort re-runs; if the film's latest_price ≤ 8, row 2 also moves up into the dropped bucket
```

### Failure branches

| Trigger | Behavior |
|---|---|
| Unauth'd hits `/watchlist` | Middleware → redirect to `/auth/signin?redirect=/watchlist` |
| `getMyWatchlistWithFilms` throws | Bubbles to default Next.js error boundary |
| `setWatchlistThreshold` with invalid value (e.g. "abc", -5, $5000) | Action throws "invalid threshold"; row shows inline red-italic: "Must be between $0.01 and $1000." Input stays editable. |
| `setWatchlistThreshold` transient error (network) | Action throws; row shows "Couldn't save — try again." Input stays editable. |
| `removeFromWatchlist` fails | Error logged; UI stays in pending state until user refreshes. (Same as existing behavior on `WatchlistButton` today.) |
| `film.latest_price == null` (new-tracked film, no history yet) | Current-price cell shows "—" in muted type; row can't be "dropped" (null excluded by `computeDropPct`); threshold still editable |
| Empty watchlist (0 rows) | `WatchlistEmpty` renders instead of toolbar + list; single CTA to `/films` |
| Invalid `?sort=` query param | Server falls back to `drop` without error |

## Testing

### `app/tests/actions/watchlists.test.ts` — EXTEND

5 new tests for `_setWatchlistThreshold`:

1. **Happy path** — authenticated user, valid threshold (e.g., $9.99) → row updated; `max_price_usd` returns as number.
2. **Clear threshold** — pass `null` → DB row's `max_price_usd` becomes `null`.
3. **Invalid values** — parameterized: `-5`, `0`, `1001`, `NaN`, `Infinity` → action throws `"invalid threshold"`; DB unchanged.
4. **Unauthenticated** — no session → action throws `"unauthenticated"`; DB unchanged.
5. **Cross-user attempt** — userA seeds a watchlist row; authenticate as userB; userB calls `_setWatchlistThreshold(client, <userA's film_id>, 5)` → RLS filters out userA's rows, 0 rows updated, no throw; userA's row remains untouched.

### `app/tests/queries/sort-watchlist.test.ts` — NEW

6 pure-function tests:

1. **drop sort** — 5 rows, 2 dropped (different % drops); dropped rows come first in descending % order; rest in recency order.
2. **recency sort** — rows with staggered `created_at` → newest first.
3. **price-low sort** — rows with varied `latest_price`; cheapest first; `null` prices last.
4. **alphabetical sort** — titles in random order → A-Z.
5. **null max_price_usd** — rows where `max_price_usd == null` never appear in the dropped block (drop sort).
6. **null latest_price** — rows where `film.latest_price == null` never appear in the dropped block; in `price-low`, they sort last.

### `app/tests/queries/watchlists.test.ts` — NEW

1 test for `getMyWatchlistWithFilms`:

1. **Numeric coercion** — mock Supabase client returns `max_price_usd: "9.99"` and `film.latest_price: "14.99"` (strings). Query returns numbers.

### `app/tests/middleware.test.ts` — EDIT

1 new case: unauthed hit on `/watchlist` → redirect to `/auth/signin?redirect=/watchlist`. Authed hit on `/watchlist` → no redirect.

### Not tested

- React rendering of `WatchlistRow`, `WatchlistSortSelect`, page — no React testing library in `app/`. Manual browser smoke at implementation time.
- Client-side state transitions on inline threshold editor (edit / save / cancel / error display) — manual verification.
- `FilmsSortSelect`-style `router.replace` behavior — Next.js runtime, not our code.

### Total

**13 new hermetic tests**, all sub-second. No new fixtures, no new mocks beyond the existing `vi.mock` pattern.

## Operational

- No new env vars.
- No schema migrations (the `max_price_usd` column already exists from migration 0105; we're just lighting up the UI for setting it).
- No Vercel config changes.
- No new package dependencies.

## Implementation estimate

- `getMyWatchlistWithFilms` + coercion helpers — 30 min.
- `sortWatchlist` pure function + 6 tests — 45 min.
- `setWatchlistThreshold` action + 5 tests — 45 min.
- `WatchlistRow` component (desktop + mobile layouts + threshold editor + remove) — 2 hrs.
- `WatchlistSortSelect` component — 30 min.
- Page component + empty state — 1 hr.
- CSS — 1 hr.
- `TopNavChrome` edit + `middleware.ts` edit + test — 30 min.
- Manual browser smoke + visual tuning — 1 hr.

**Total: ~7-8 hours** — well within a single focused dev day.

---

## Addendum — 2026-04-24 post-ship pivot

The body of this spec describes a per-row **inline threshold editor** with a `setWatchlistThreshold` server action, Enter/Escape/blur save semantics, and `.watchlist-threshold-*` CSS classes. **That design was removed during integration.** See commits `5f4cdd7` (initial editor), `0f93ca6` (Enter/blur dedup), and **`6266cd2` (pivot)** for the full history.

The shipped feature differs from the body of this spec as follows:

1. **No threshold editor.** User feedback reframed the mental model: "being on your watchlist should imply the alert threshold — alert me if it drops below where I added it." `_addToWatchlist` now auto-captures the current iTunes Lookup price at add time and stores it as `max_price_usd`. There is no user-facing UI for editing the threshold.
2. **No `setWatchlistThreshold` action.** Deleted. Its 5 tests were deleted with it.
3. **Per-row "Buy on Apple TV →" link** (spec originally said "no per-row Buy button, that path stays on the film detail page"). Replaces the editor cell. Pulls from `film.itunes_url`, opens in a new tab.
4. **"▼ DROP" badge → struck-through "was" price.** When `latest_price ≤ max_price_usd`, the row renders the current price in accent color with the add-time price (from `max_price_usd`) line-through beneath it — A24-retail "was/now" pattern.
5. **Fresh iTunes lookup at add time** (commit `c371d15`). `_addToWatchlist` calls `fetchPrices([itunes_id])` to get a fresh price (instead of the stale last-swept price from `films_with_stats`). Falls back to the last-swept price on any iTunes failure. Watchlist inserts never break on transient upstream issues.
6. **Backfill migration `0120`** (commit `ae2f2d1`) lit up the sale indicator on pre-existing watchlist rows by filling their null `max_price_usd` with the most recent `price_history.price_usd`. Applied in production on 2026-04-24.

See `docs/superpowers/plans/2026-04-24-watchlist-page.md` for the matching plan-side addendum.
