# Film Page Price Sticker — Design

**Date:** 2026-07-07
**Status:** Approved
**Sub-project:** Make the current price on `/film/[id]` register immediately instead of being buried in the Buy button label.

## Problem

The film detail page shows the current price in exactly two places: appended to the Buy CTA label (`Buy on Apple TV · $9.99 →`, `app/app/film/[id]/page.tsx` ~line 204) and in the "Price Scroll" stat block near the bottom of the page. The owner reports the button-label price is easy to glance over — the price of a film should register the moment the page loads, since price tracking is the product's core.

**Constraint from settled history:** an on-poster price/buy overlay was tried and deliberately removed (PRs #50/#51, see `docs/sub-project-history.md` row 18 and the failure-archaeology entry "On-poster buy pill — FLIP-FLOPPED, settled"). Price affordances live in text/caption space, never overlaid on poster artwork. This design respects that: the sticker sits in the hero *text column*, not on the poster.

Explicitly deferred: any change to poster-grid price affordances elsewhere (`/watchlist` caption links, `PosterDropBadge`), and any change to the Price Scroll section.

## Decision summary

| Decision | Choice |
|---|---|
| Placement | Hero text column, between `FilmTagsRow` and the action cluster |
| Visual language | Die-cut vinyl sticker: accent background, void border, offset block shadow, `rotate(-6deg)`, `border-radius: 2px` — same family as the OG share card sticker (`app/app/api/og/film/[id]/route.tsx`) |
| Content | Price + one context beat derived from existing 180-day history |
| Interactivity | None — informational only; Buy button stays the sole CTA (PR #175 one-solid-accent rule) |
| Buy button label | Simplified to `Buy on Apple TV →` (price no longer duplicated in the label) |
| Data | Reuses the `history` array already fetched by the page; no new queries |

Rejected alternatives:
- **Price in the bone header band metadata row** — first thing seen but small text in a busy row; risks the same glance-over problem the sticker solves.
- **On-poster overlay** — settled against (PR #51).
- **Rounded pill styling** — clashes with the zine-brutalist design system; the rotated hard-edged sticker matches the OG card so the share card and the page tell the same story.
- **Clickable sticker** — the original on-poster pill failed partly because users didn't realize it was tappable; keeping it informational avoids a second ambiguous affordance.

## 1. Component: `FilmPriceSticker`

New file `app/components/FilmPriceSticker.tsx`. Server-renderable (no `"use client"` — it is pure display).

Props:

```ts
{
  price: number;              // current price, dollars
  history: { price_usd: number | string; captured_at: string }[]; // oldest→newest, 180-day window (as fetched by the page)
}
```

Rendering (all user-facing copy says "Apple TV", never "iTunes"):

- Big price line: `$9.99` — ~28–32px, weight 800, `var(--void)` on `var(--accent)`.
- Context beat beneath, small caps (~11px, letter-spaced uppercase), chosen by priority:
  1. **`lowest in 180 days`** — when `price` equals the minimum price in `history` (compare on `Number(price_usd)`; ties count as lowest).
  2. **`▼ down from $14.99`** — when the most recent price *change* in `history` was a drop: walk backward from the end to the first row whose price differs from the current price; if that prior price is greater, show it.
  3. **`on Apple TV`** — fallback when neither applies (flat or rising).
- Container: `display: inline-flex`, column, centered; `background: var(--accent)`; `border: 3px solid var(--void)`; `box-shadow: 6px 6px 0 var(--void)`; `transform: rotate(-6deg)`; `border-radius: 2px`; padding ~`12px 20px`.
- Not a link, no `onClick`, no cursor affordance.

Edge cases:
- `history` with a single row → beat 1 fires (it is trivially the 180-day low). Acceptable and honest.
- The component is only mounted when a price exists (see §2), so it never renders an empty state.

## 2. Page wiring — `app/app/film/[id]/page.tsx`

- Render `<FilmPriceSticker price={currentPrice} history={history} />` between the `FilmTagsRow` block and the `.hero-actions` cluster, wrapped in a margin div (~`margin: 4px 0 28px`). The rotation needs a little breathing room so the shadow/corner doesn't clip against neighbors.
- Mount condition: `film.itunes_url && currentPrice != null` — the same condition family as the Buy button. No store link or no price → no sticker; the page reads exactly as today.
- Simplify the Buy button label to the constant `Buy on Apple TV →` (remove the `currentPrice` ternary from the label).

Responsive behavior: the hero already collapses via the `stackable` single-breakpoint helper; the sticker is inline-flow (no absolute positioning), so it stacks naturally. Slight rotation must not cause horizontal overflow on narrow screens — keep the element `inline-flex` and modestly sized so the rotated bounding box stays well inside the column.

## 3. Testing

- `app/` typecheck (`npm run typecheck`) and existing vitest suite must stay green.
- Unit test for the context-beat selection logic (extract as a small pure helper, e.g. `pickPriceBeat(price, history)`, exported from the component file or a sibling module): cases for lowest-in-window, drop-from-prior, flat/rising fallback, single-row history, string `price_usd` coercion.
- Manual smoke: a priced film (sticker + simplified button), a TMDB-only film with no `itunes_url` (no sticker), signed-out view of a priced film (sticker renders — component is anonymous-safe since it reads no user data).

## Out of scope (deferred)

- Price in the bone header band (redundant echo — revisit only if the sticker alone proves insufficient).
- Any tap/buy behavior on the sticker.
- Poster-grid price affordances on other pages.
- Price Scroll section changes.
