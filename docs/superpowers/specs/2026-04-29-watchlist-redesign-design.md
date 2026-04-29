# Watchlist Redesign — Design

**Status:** spec
**Date:** 2026-04-29
**Sub-project:** 18 (next after activity comments at 17). Pure UI; no schema, no new server actions, no migration.

## Goal

Bring `/watchlist` into visual parity with `/library` and `/films` (poster grid, chip-row sort, spare hero) and make the page's reason-to-exist — *track films, buy when they go on sale* — visible at a glance via two new poster overlays: a **drop badge** ("23% OFF") top-right, and a **buy pill** ("$9.99 →") bottom-right that opens the iTunes URL in a new tab. The current row layout, native `<select>` sort, and bare `×` remove are all retired.

## What ships

1. **Page rewrite** — `/watchlist` becomes a poster grid identical in shape to `/library` and `/films`: `repeat(auto-fill, minmax(140px, 1fr))` at `var(--grid-gap)`, `<FilmPoster size="md">` with `aspectRatio: "2/3"`, two-line caption beneath (`{year} · {director}`).
2. **Spare hero** — headline only (`The Scroll.`), no toolbar, no count. Matches `/library`. The total-tracked count and the per-row remove affordance both disappear from this page.
3. **Chip-row sort** — new client component `WatchlistSortChips` cloned from `FilmsSortChips`. Reuses the existing `.films-sort-chips` / `.films-sort-chip` CSS classes (layout-agnostic despite the name). Four chips: **Drop %** (default), **Recently added**, **Lowest price**, **A→Z**. The existing `WatchlistSort` type and `sortWatchlist` function stay as-is.
4. **`PosterDropBadge`** — new presentational component. Renders a small accent pill in the top-right corner of the poster with caps text "**N% OFF**" when `dropPct >= 0.10`, hidden otherwise. Hidden when `max_price_usd` is null (no price history to drop from).
5. **`BuyOnAppleTvPill`** — new component. Renders an accent-bg `<a target="_blank" rel="noreferrer">` in the bottom-right corner of the poster showing **`$9.99 →`** when `latestPrice` is non-null, or **`Apple TV →`** when `latestPrice` is null. Anchor sits as a *sibling* of the wrapping `<Link>` (not nested) so the click target is unambiguous. Always visible on mobile (no hover); fades in on hover on desktop via CSS.
6. **CSS cleanup** — delete the entire `.watchlist-row*`, `.watchlist-toolbar`, `.watchlist-list`, `.watchlist-remove`, `.watchlist-row-buy*`, `.watchlist-row-was-price`, `.watchlist-row-dropped` block (~110 lines, both desktop and ≤720px sections). Add ~40 lines of new `.poster-drop-badge` and `.buy-on-apple-tv-pill` styles.
7. **Two file deletions** — `WatchlistRow.tsx` and `WatchlistSortSelect.tsx` are no longer referenced and go away entirely. Their data shapes (`WatchlistRowData`, `computeDropPct`) stay; only the rendering layer is gone.

## Out of scope

- **In-grid remove affordance.** Users remove from watchlist via the existing `WatchlistButton` toggle on `/film/[id]`. One mutation surface, not two. (Rationale: `/library` has no in-grid remove either, and the symmetry is the point.)
- **Price line in the caption.** The buy pill carries the price; doubling it in the caption is noise. Caption stays `{year} · {director}` to match `/library` exactly.
- **Drop-percent or buy-pill on `/films` Discovery cards.** Discovery already has `PosterQuickAdd`'s `+` overlay; stacking another bottom-right pill conflicts. Decide later, after the pattern proves out on `/watchlist`.
- **Drop-percent or buy-pill on `/library` cards.** Library is "I own these"; buy doesn't apply.
- **A new `WatchlistEmpty` design.** Keep the existing "The Scroll is empty." headline + italic + CTA. (Tangential cross-page empty-state standardization is a separate sub-project.)
- **Eyebrow consistency across other pages' heroes.** `/coven` keeps its `Chapter IV · The Covenfolk` eyebrow; the rest stay bare. Cross-cutting; not blocking this redesign.
- **Sort change for the on-sale-first behavior.** The existing `sortWatchlist`'s `"drop"` case already puts dropped films first (sorted by % desc) then non-dropped (sorted by recency desc). No code change needed.
- **`PosterQuickAdd` integration on `/watchlist`.** Quick-add is a Discovery affordance — adding to the watchlist from the watchlist itself is meaningless. Keep `/watchlist` cards plain (no `+` overlay).
- **Hover-fade buy pill on touch-only browsers.** CSS-only solution: `@media (hover: hover)` gates the fade-in; mobile (no hover) sees the pill at full opacity always.

## Locked design decisions (clarifying-question outcomes)

| Q | Decision |
|---|---|
| Layout | Poster grid, identical to `/library` |
| Hero | Spare — headline only (`The Scroll.`); no count; no toolbar |
| Sort control | Chip row (clone of `FilmsSortChips`); reuses `.films-sort-chip` CSS |
| Sort options & order | Drop %, Recently added, Lowest price, A→Z |
| Default sort | `drop` (unchanged from today) |
| Drop badge text | `N% OFF` (caps), e.g. `23% OFF` |
| Drop badge color | Accent pill on bone background |
| Drop badge placement | Top-right corner of the poster |
| Drop badge threshold | Render only when `dropPct >= 0.10` |
| Drop badge when `max_price_usd` null | Hide the badge |
| Buy pill text (price known) | `$9.99 →` |
| Buy pill text (price null, URL known) | `Apple TV →` |
| Buy pill when no `itunes_url` | Hide the pill entirely |
| Buy pill placement | Bottom-right corner of the poster |
| Buy pill visibility | Always visible on mobile; opacity 0 → hover fade-in on desktop |
| Buy pill DOM structure | Sibling of wrapping `<Link>`, not child, so click target is unambiguous |
| Caption | `{year} · {director}` — match `/library` exactly |
| In-grid remove | Removed from this page; lives only on `/film/[id]` |
| Empty state | Keep existing `WatchlistEmpty` |
| New views/migrations/server actions | None |

## Section 1 — Data

No schema change. All data already shipped on `WatchlistRowData`:
- `row.film.latest_price` — current Apple TV price (nullable; populated by the worker pipeline)
- `row.max_price_usd` — peak observed price since the user added the film (nullable when no price history)
- `row.film.itunes_url` — buy link (nullable; some catalog films have no Apple TV URL)
- `computeDropPct(row)` — already in `app/lib/queries/sort-watchlist.ts`. Returns `(max - latest) / max` when both prices exist *and* `latest <= max`; returns `null` otherwise. Reuse verbatim — the badge threshold gate (`>= 0.10`) lives in `PosterDropBadge`, not in this helper.

`getMyWatchlistWithFilms` returns the row shape unchanged. No query layer edits.

## Section 2 — Components

Two new presentational components in `app/components/`. Both are tiny and surface-agnostic so they can later move to other poster surfaces without rewrites.

### `app/components/PosterDropBadge.tsx`

```tsx
interface Props {
  dropPct: number | null; // pre-computed by caller via computeDropPct
}

export default function PosterDropBadge({ dropPct }: Props) {
  if (dropPct == null || dropPct < 0.10) return null;
  const pct = Math.round(dropPct * 100);
  return (
    <span className="poster-drop-badge caps" aria-label={`${pct} percent off`}>
      {pct}% OFF
    </span>
  );
}
```

Server-rendered. No interactivity. Renders nothing when threshold not met.

### `app/components/BuyOnAppleTvPill.tsx`

```tsx
interface Props {
  url: string;
  price: number | null; // null is fine — render "Apple TV →"
}

export default function BuyOnAppleTvPill({ url, price }: Props) {
  const label = price != null ? `$${price.toFixed(2)}` : "Apple TV";
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="buy-on-apple-tv-pill caps"
      aria-label={`Buy on Apple TV${price != null ? ` for $${price.toFixed(2)}` : ""}`}
    >
      {label} →
    </a>
  );
}
```

Server-rendered. The pill is a real `<a>`, not a `<button>` — semantically it's an outbound link, and it inherits the global `touch-action: manipulation` etc. from `<a>` defaults (no extra wrapping needed). Caller is responsible for not rendering this when `url` is falsy.

### `app/app/watchlist/WatchlistSortChips.tsx`

Direct clone of `FilmsSortChips` with three substitutions:
- `WatchlistSort` type from `app/lib/queries/sort-watchlist.ts`
- chip set: `[{value:"drop",label:"Drop %"}, {value:"recency",label:"Recently added"}, {value:"price-low",label:"Lowest price"}, {value:"alphabetical",label:"A→Z"}]`
- default sort key: `"drop"` (omit `?sort=drop` from URL the way `FilmsSortChips` omits `?sort=added`)
- aria-label: `"Sort watchlist"`

Reuses `.films-sort-chips` / `.films-sort-chip` CSS unchanged. Same arrow-key navigation, same tab-stop logic.

## Section 3 — Page rewrite

`app/app/watchlist/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyWatchlistWithFilms } from "@/lib/queries/watchlists";
import { sortWatchlist, computeDropPct, type WatchlistSort } from "@/lib/queries/sort-watchlist";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import FilmPoster from "@/components/FilmPoster";
import PosterDropBadge from "@/components/PosterDropBadge";
import BuyOnAppleTvPill from "@/components/BuyOnAppleTvPill";
import WatchlistSortChips from "./WatchlistSortChips";

const VALID_SORTS: readonly WatchlistSort[] = ["drop", "recency", "price-low", "alphabetical"] as const;

function WatchlistEmpty() { /* unchanged */ }

export default async function WatchlistPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  // ...auth + fetch unchanged...
  // sort default "drop", validation unchanged
  const rows = await getMyWatchlistWithFilms(supabase);
  const sorted = sortWatchlist(rows, sort);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="watchlist" />
      <BottomNav current="watchlist" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            The <em style={{ color: "var(--accent)" }}>Scroll</em>.
          </h1>
        </div>
      </section>

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          {rows.length === 0 ? (
            <WatchlistEmpty />
          ) : (
            <>
              <WatchlistSortChips currentSort={sort} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--grid-gap)" }}>
                {sorted.map(r => {
                  const dropPct = computeDropPct(r);
                  return (
                    <div key={r.id} style={{ position: "relative" }}>
                      <Link href={`/film/${r.film.id}`} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                        <div style={{ position: "relative" }}>
                          <FilmPoster film={r.film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                          <PosterDropBadge dropPct={dropPct} />
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <div className="head" style={{ fontSize: 16, lineHeight: 1.1 }}>{r.film.title}</div>
                          <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                            {r.film.year}
                            {r.film.director ? <span> · {r.film.director}</span> : null}
                          </div>
                        </div>
                      </Link>
                      {r.film.itunes_url && (
                        <BuyOnAppleTvPill url={r.film.itunes_url} price={r.film.latest_price} />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
```

Two notes on structure:
- The drop badge is *inside* the wrapping `<Link>` — that's fine, it's presentational, and tapping it should still navigate to the film detail page.
- The buy pill is *outside* the wrapping `<Link>` (sibling, with `position: absolute` over the poster area), so its click target is unambiguous and not stolen by the surrounding link.

## Section 4 — CSS

Delete `app/app/globals.css` lines ~556–674 (the entire `/watchlist` row-layout block, both desktop and `@media (max-width: 720px)` sections). The whole `.watchlist-row*`, `.watchlist-toolbar`, `.watchlist-list`, `.watchlist-empty` ruleset goes away — `.watchlist-empty` is the lone survivor and stays put (the empty-state component still uses it).

Keep `.watchlist-empty` (used by `WatchlistEmpty`).

Add new rules near the existing `.poster-quick-add*` block (since the badge/pill are conceptually the same family of poster overlays):

```css
.poster-drop-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  background: var(--accent);
  color: var(--void);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 4px 7px;
  border: 1px solid var(--void);
  z-index: 2;
  pointer-events: none;
}

.buy-on-apple-tv-pill {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: var(--accent);
  color: var(--void);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 5px 9px;
  border: 1px solid var(--void);
  text-decoration: none;
  z-index: 2;
  transition: opacity 120ms ease;
}

@media (hover: hover) {
  .buy-on-apple-tv-pill { opacity: 0; }
  div:hover > .buy-on-apple-tv-pill,
  .buy-on-apple-tv-pill:focus-visible { opacity: 1; }
}
```

The `@media (hover: hover)` gate is the canonical way to differentiate touch and pointer devices: touch (no hover) sees the pill at full opacity always; pointer devices (trackpad/mouse) see it fade in on hover. The `:focus-visible` rule keeps the keyboard-tab path showing the pill.

## Section 5 — Migration order

A single PR. Touch only `/watchlist`-related files plus the two new components. No DB migration, no server-action edits, no feature flag.

1. Create `PosterDropBadge.tsx` and `BuyOnAppleTvPill.tsx`.
2. Add the two new CSS blocks to `globals.css`.
3. Create `WatchlistSortChips.tsx` (clone of `FilmsSortChips` with the substitutions in §2).
4. Rewrite `app/app/watchlist/page.tsx` to use the new shape.
5. Delete `app/app/watchlist/WatchlistRow.tsx` and `app/app/watchlist/WatchlistSortSelect.tsx`.
6. Delete the `.watchlist-row*` / `.watchlist-toolbar` / `.watchlist-list` rules from `globals.css`.
7. `npm run typecheck` (deletions of `WatchlistRow` and `WatchlistSortSelect` should reveal zero stale imports — they're page-local).
8. `npm run build` to verify no Next.js routing or `next/image` complaints.
9. Visual QA: load `/watchlist` with at least one dropped row, one non-dropped row, one row missing `itunes_url`, one row missing `latest_price`, and an empty state.

## Section 6 — Risks and follow-ups

**Risk: pill obscures poster art.** The buy pill sits over the bottom-right of the poster, which is often where credits or director text live in real Apple TV artwork. Mitigation: pill is small (~70px wide, ~22px tall), accent-on-void contrast is loud enough that you read it as UI not art, and on desktop it stays hidden until hover. If visual review flags this, fall back to the caption-line treatment ("Buy on Apple TV →" beneath the year/director line).

**Risk: drop-badge/buy-pill alignment when both render.** Top-right and bottom-right give them maximum separation; they don't share the same edge. No layout interaction.

**Risk: aspectRatio: 2/3 stretching.** The other grid pages already use this pattern, so the FilmPoster component handles the responsive stretch correctly.

**Risk: stale Apple TV URLs.** Some films may have invalidated `itunes_url`s. The pill opens whatever URL is stored and lets Apple show its 404. Acceptable — same behavior as today's underlined link.

**Follow-ups deliberately not in this PR:**
- Surface `PosterDropBadge` on `/films` and `/library` posters (interesting; do later if the watchlist version proves out).
- Empty-state pattern standardization across `/films`, `/library`, `/watchlist`, `/coven`.
- Eyebrow consistency across heroes.
- `WatchlistEmpty` could itself be promoted to a shared `EmptyState` primitive.
- Drop badge could pulse / animate in on first render, especially if a price drop happened since last visit. Out of scope; would need per-user "last seen" tracking.

## Section 7 — Done definition

- `/watchlist` renders as a poster grid identical in shape to `/library`.
- A film with `dropPct >= 0.10` shows a `N% OFF` accent pill in the poster's top-right corner.
- A film with `itunes_url` shows a buy pill in the poster's bottom-right; on mobile always visible, on desktop visible on hover.
- The native `<select>` sort is gone; chip row is in.
- The bare `×` remove is gone; users remove via `/film/[id]`.
- `WatchlistRow.tsx`, `WatchlistSortSelect.tsx`, and ~110 lines of `.watchlist-row*` CSS are deleted.
- Typecheck and production build are green.
