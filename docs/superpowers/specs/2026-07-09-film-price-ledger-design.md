# Film Page Price Ledger — Design

**Date:** 2026-07-09
**Status:** Draft — awaiting owner review
**Sub-project:** A chronological logbook of price changes on `/film/[id]`, derived from the existing `price_history` captures — sub-project #4 of the five sketched from the owner's FROM THE PIT cadence feedback, **as redefined by the owner on 2026-07-09** (see Problem).

## Problem

**This spec supersedes the original #4 concept.** The owner's original cadence brief sketched "Ledger" as a personal-utility aggregation surface: "All your watchlist price drops / Free on your services / Leaving soon / Threshold alerts." On 2026-07-09 the owner explicitly redefined it: *"Skip the ledger on home. The ledger I'm thinking of is on film detail pages and is basically a logbook of price changes (history)."* The original aggregation-page concept is retired; its global-deals role is absorbed by the Pit tab (sub-project #5), and its personal-alerting role already exists in fragments (the `LedgerPanel` sidebar on `/home`, `watchlists.max_price_usd` threshold alerts, price-drop notifications) that this sub-project deliberately does not touch.

What #4 now is: the film page's "Price Scroll · 180 Days" section shows a stat block (now / peak / steal) and a deliberately subordinate sparkline, but no *narrative* of what happened — a visitor can see the film hit $4.99 at some point, but not when it dropped, what it dropped from, or how often the price moves. The raw material already exists: `price_history` holds one capture per worker sweep (`film_id, price_usd, hd_price_usd, is_sale, captured_at`), and the page already fetches 180 days of it via `getLatestPriceHistory`. The ledger renders that series as a scannable list of discrete change events: "Jul 3 · dropped to $4.99 (was $14.99)".

## Decision summary

| Decision | Choice |
|---|---|
| What it is | A text logbook of price *changes* (not captures, not a chart) inside the existing "Price Scroll" section on `/film/[id]` |
| Change extraction | New pure function `extractPriceChanges(history)` in a new `app/lib/price-ledger.ts` — consecutive-capture comparison, oldest→newest; the first capture becomes a "first sighted" entry |
| Placement | Below `PriceStatBlock`, same section — no new route, no layout change elsewhere |
| Prominence | Capped initial render: **5 most recent changes**, with a "Show full ledger" expander revealing the rest — the section must stay subordinate to the film hero (see PR #175 constraint below) |
| Voice | Utility register: plain dates + prices, scannable. Light goblin seasoning only in the sub-header ("The ledger remembers."). "Apple TV" naming, never "iTunes" |
| Data window | The page's existing 180-day fetch — no new query |
| SD vs HD price | SD (`price_usd`) only in v1; `hd_price_usd` ignored |
| Sale flag | `is_sale = true` captures get a small "sale" chip on their entry |
| Audience | Public — renders for anonymous visitors, same as the sticker and Price Scroll |

Rejected alternatives:
- **A fuller chart or timeline visualization** — PR #175 deliberately demoted the full price chart to a stepped sparkline (the design note at the head of `app/app/styles/10-price-stat.css` records this); resurrecting chart-like prominence would reverse a settled decision. The ledger is text, and stays visually quieter than the stat block above it.
- **A new all-time query** — the page fetches 180 days and every consumer in the section shares that window. All-time history would need a second query and makes the section's "· 180 Days" label a lie for one subcomponent. Consistency wins; if 180 days proves too short in practice, widening the shared fetch is a one-line change later.
- **Showing every capture** (not just changes) — the worker captures on every sweep whether or not the price moved; most rows are flat. A logbook of "still $14.99" entries is noise. Change-points only.
- **Per-user features** (annotations, "you bought here" markers tied to `library.price_paid_usd`) — real ideas, out of scope; the ledger is public and identical for everyone in v1.

## 1. Change extraction — `app/lib/price-ledger.ts`

New pure module, sibling in spirit to `price-beat.ts` (same input shape, same testing style):

```ts
export interface PriceChange {
  at: string;                    // captured_at of the capture where the change was observed
  price: number;
  previousPrice: number | null;  // null only for direction "first"
  direction: "drop" | "rise" | "first";
  isSale: boolean;               // the capture's is_sale flag
}

// Walks the capture series oldest→newest (the order getLatestPriceHistory
// already returns) and emits one entry per observed change. The first
// capture in the window emits a "first" entry — within a 180-day window
// this reads as "first sighted", which is honest: it is the first price
// the pit observed in the period shown.
export function extractPriceChanges(
  history: { price_usd: number | string; is_sale?: boolean | null; captured_at: string }[],
): PriceChange[] {
  const changes: PriceChange[] = [];
  let prev: number | null = null;
  for (const h of history) {
    const price = Number(h.price_usd);
    if (!Number.isFinite(price)) continue;
    if (prev === null) {
      changes.push({ at: h.captured_at, price, previousPrice: null, direction: "first", isSale: h.is_sale === true });
    } else if (price !== prev) {
      changes.push({
        at: h.captured_at,
        price,
        previousPrice: prev,
        direction: price < prev ? "drop" : "rise",
        isSale: h.is_sale === true,
      });
    }
    prev = price;
  }
  return changes;
}
```

Notes:
- `price_usd` handled as `number | string` (PostgREST NUMERIC), same coercion discipline as `pickPriceBeat`.
- Non-finite coercions are skipped rather than emitted, so a malformed row can't produce a `NaN` entry.
- Strict `!==` comparison is safe here for the same reason it is in `price-beat.ts`: both sides come from `Number(...)` over the same NUMERIC string representation.

## 2. Rendering — `FilmPriceLedger` component

New `app/components/FilmPriceLedger.tsx`, a client component (it holds one piece of state: expanded/collapsed). Props: `{ history }` — the same array the page already passes to `PriceStatBlock`.

- Calls `extractPriceChanges(history)`, reverses to newest-first for display.
- Renders nothing at all when there are fewer than 2 entries (a lone "first sighted" line under the stat block adds nothing the NOW stat doesn't already say — the ledger earns its space only when there's movement).
- Entry line anatomy (utility register, `--font-ui`, small):
  - drop: `Jul 3 · dropped to $4.99 (was $14.99)` — price in `var(--accent)`
  - rise: `Jun 12 · rose to $14.99 (was $9.99)` — muted
  - first: `Apr 20 · first sighted at $19.99` — muted
  - sale captures append a small `sale` chip (existing `.chip` class).
- Dates via the section's existing short format convention (`toLocaleDateString("en-US", { month: "short", day: "numeric" })`, lowercase to match `PriceStatBlock`'s `formatMonth` styling).
- **Cap: 5 most recent changes rendered initially.** More than that exists behind a `Show full ledger (N)` text-link expander (plain button, not `.btn` — this is a quiet affordance). Justification: the Price Scroll section sits below the fold and was deliberately made subordinate (PR #175); a film with a volatile price could have 20+ changes in 180 days, and an unbounded list would make this section the tallest thing on the page. Five changes cover the recent story; the expander preserves completeness without prominence.
- Sub-header inside the section, above the list: small caps `The ledger remembers.` — the one goblin-seasoned line; every entry below it is plain.

## 3. Page wiring — `app/app/film/[id]/page.tsx`

Inside the existing Price Scroll section, immediately after `<PriceStatBlock history={history} />`, add `<FilmPriceLedger history={history} />`. Same data, no new fetch, no server-side change. The existing empty-state ("No price history yet…") branch is untouched — when `history` is empty, neither component renders content.

## 4. Edge cases

- **Single-capture history** → `extractPriceChanges` yields one "first" entry → component renders nothing (below the 2-entry floor). Correct: nothing has happened yet.
- **Flat history** (many captures, one price) → same single "first" entry → nothing rendered.
- **`is_sale`** → chip on the entry, no separate copy. A sale that reverts shows as a drop entry (sale chip) followed by a rise entry — the honest shape of what happened.
- **`hd_price_usd`** → ignored in v1. The whole page's price surface (sticker, stat block, sparkline, buy button) is SD-price-based; introducing a second price track in one subcomponent would contradict every neighboring number. Documented for a future "HD track" sub-project if ever wanted.
- **Anonymous visitors** → full ledger, no gate.

## 5. Testing

- `app/tests/price-ledger.test.ts` — pure `extractPriceChanges`:
  - flat series → single "first" entry only
  - single capture → single "first" entry
  - drop then rise sequence → correct directions, `previousPrice` chaining, chronological order
  - string `price_usd` coercion (PostgREST NUMERIC)
  - non-finite rows skipped without corrupting the `prev` chain
  - `is_sale` propagated onto the entry that observed the sale price
- Component-level behavior (render floor, cap, expander) verified by typecheck + manual smoke per house convention for thin display components (the logic worth unit-testing lives entirely in the pure function).

## Out of scope (deferred / retired)

- **The original #4 aggregation page** — retired by owner decision 2026-07-09; global deals belong to the Pit tab (#5), personal alerts already exist (`LedgerPanel`, threshold notifications).
- Per-user annotations or "you bought here" markers (`library.price_paid_usd` overlay).
- Price predictions or trend commentary.
- HD price track.
- Any change to `price_history` schema, the worker's capture cadence, `PriceStatBlock`, the sparkline, or the price sticker.
