# Film Page Price Ledger — Implementation Plan

**Goal:** Add a quiet, expandable 180-day text ledger of observed SD price changes directly below the existing `PriceStatBlock` on public film pages.

**Architecture:** A pure `extractPriceChanges` helper converts the already-fetched oldest-to-newest `price_history` window into first/drop/rise entries. A thin client component formats the five newest entries and controls the expander. The film detail page passes its existing history array; no new database query, route, migration, or worker change is introduced.

**Tech stack:** Next.js App Router, TypeScript, Vitest, existing zine-CSS.

**Spec:** `docs/superpowers/specs/2026-07-09-film-price-ledger-design.md`

## Global constraints

- App-only and public: no auth gate, schema change, new query, or environment variable.
- Keep the settled Price Scroll hierarchy: PriceStatBlock and its subordinate sparkline stay as-is; do not rebuild a chart.
- Use only SD `price_usd` in v1. Treat PostgREST NUMERIC as `number | string` at the pure-function boundary.
- Use utility copy and Apple TV naming where storefront language is needed.
- Branch when executing: `codex/film-price-ledger`. Run app tests, typecheck, and build before PR.

---

### Task 1: Extract price-change entries as a pure module

**Files:**
- Create: `app/lib/price-ledger.ts`
- Create: `app/tests/price-ledger.test.ts`

**Interfaces:**

```ts
export interface PriceChange {
  at: string;
  price: number;
  previousPrice: number | null;
  direction: "drop" | "rise" | "first";
  isSale: boolean;
}

export function extractPriceChanges(history: Array<{
  price_usd: number | string;
  is_sale?: boolean | null;
  captured_at: string;
}>): PriceChange[];
```

- [ ] Walk the known oldest-to-newest history order. Emit the first valid capture as `first`, then only material price changes with an accurate previous price and direction.
- [ ] Coerce through `Number`, ignore non-finite captures without corrupting the previous valid price, and carry `is_sale` from the capture where the price was observed.
- [ ] Test single/flat series, drop-then-rise chaining, string numerics, malformed rows, sale propagation, and chronological order.

### Task 2: Build the deliberately subordinate ledger component

**Files:**
- Create: `app/components/FilmPriceLedger.tsx`
- Modify: `app/app/styles/10-price-stat.css`

- [ ] Make `FilmPriceLedger` a small client component receiving the same history shape as `PriceStatBlock`.
- [ ] Derive entries with the pure helper and display newest-first. Render nothing unless the helper finds at least two entries.
- [ ] Render five entries by default; a quiet text button reveals the remainder and reports the hidden count. Do not use a primary `.btn` treatment.
- [ ] Format dates as abbreviated month/day and prices as dollars. Render drop/rise/first copy exactly in the spec's utility register and append an existing-style sale chip where applicable.
- [ ] Add minimal `.price-ledger*` CSS beneath the current Price Scroll styles: readable at desktop/mobile, visually quieter than the PriceStatBlock, no new breakpoint.

### Task 3: Wire the existing film-page data into the ledger

**Files:**
- Modify: `app/app/film/[id]/page.tsx`

- [ ] Import `FilmPriceLedger` and render it immediately after `PriceStatBlock` inside the existing non-empty Price Scroll branch.
- [ ] Pass the existing 180-day `history` unchanged. Keep the current empty-history copy and every neighboring price component unchanged.
- [ ] Verify a public (signed-out) film page still renders the ledger whenever history contains movement.

### Task 4: Validate the UI-only surface and hand off

**Files:**
- Modify: root `AGENTS.md` Current state/Open threads as appropriate
- Modify: `docs/sub-project-history.md` after ship

- [ ] Run `cd app && npm run test -- --cache=false`, `npm run typecheck`, and `npm run build`.
- [ ] Manual smoke on a film with a drop and later rise: verify chronological text, sale chip, five-entry cap/expander, and mobile wrapping. Smoke a flat/single-capture film to confirm the ledger disappears.
- [ ] Confirm the stat block, sparkline, price sticker, Buy CTA, and history query are unchanged by diff review.
- [ ] Ship as a normal app-only deployment, then update root state and append the history row.
