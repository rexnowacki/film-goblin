# Film Page Price Sticker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a die-cut vinyl price sticker in the `/film/[id]` hero so the current price registers immediately, and simplify the Buy button label.

**Architecture:** A pure beat-selection helper (`app/lib/price-beat.ts`) picks one context line from the 180-day price history the page already fetches. A new server-rendered display component (`app/components/FilmPriceSticker.tsx`) shows the price plus that beat, styled after the OG share card's rotated sticker. `page.tsx` mounts it between the tags row and the action cluster and drops the price from the Buy button label. No migrations, no new queries, no server actions.

**Tech Stack:** Next.js 15 (App Router, server component), TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-07-07-film-page-price-sticker-design.md`

## Global Constraints

- **Node 20 required.** Prefix every `npm`/`tsx` command with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH` (background bash calls don't share shell state).
- All commands run from `app/` unless stated otherwise.
- **Copy rule:** user-facing strings say "Apple TV", never "iTunes". Internal identifiers keep `itunes_` names.
- **No `"use client"`** in the new component — it is pure display with no hooks or handlers (precedent: `app/components/PriceStatBlock.tsx` has no directive).
- No migrations; do not touch `app/lib/supabase/types.ts`.
- Branch: `feature/film-page-price-sticker` (already exists; spec committed as `4ad833e`).
- Commit-message gotcha: heredoc `git commit -m "$(cat <<'EOF' ...)"` intermittently mangles messages in this repo — write the message to a temp file and use `git commit -F <file>`, or use a simple single-line `-m`.

---

### Task 1: `pickPriceBeat` pure helper

**Files:**
- Create: `app/lib/price-beat.ts`
- Test: `app/tests/price-beat.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `pickPriceBeat(price: number, history: { price_usd: number | string }[]): PriceBeat` where `PriceBeat = { kind: "lowest" } | { kind: "drop"; from: number } | { kind: "plain" }`. Task 2 imports both the function and the type from `@/lib/price-beat`.

Beat selection rules (from the spec §1):
1. `lowest` — current price equals (or is below) the minimum price in the window; ties count as lowest.
2. `drop` — otherwise, walk backward from the end of history to the first row whose price differs from the current price; if that prior price is greater, it's a drop from that price.
3. `plain` — everything else (flat, rising, or empty history).

- [ ] **Step 1: Write the failing test**

Create `app/tests/price-beat.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickPriceBeat } from "../lib/price-beat";

const rows = (...prices: (number | string)[]) => prices.map(p => ({ price_usd: p }));

describe("pickPriceBeat", () => {
  it("returns lowest when current price is the window minimum", () => {
    expect(pickPriceBeat(9.99, rows(14.99, 12.99, 9.99))).toEqual({ kind: "lowest" });
  });

  it("counts ties as lowest", () => {
    expect(pickPriceBeat(9.99, rows(9.99, 14.99, 9.99))).toEqual({ kind: "lowest" });
  });

  it("returns lowest for single-row history", () => {
    expect(pickPriceBeat(12.99, rows(12.99))).toEqual({ kind: "lowest" });
  });

  it("returns drop with the prior price when the last change was a drop but not the low", () => {
    // window low is 7.99, current 9.99 came down from 14.99
    expect(pickPriceBeat(9.99, rows(7.99, 14.99, 9.99))).toEqual({ kind: "drop", from: 14.99 });
  });

  it("skips trailing rows equal to the current price when finding the prior price", () => {
    expect(pickPriceBeat(9.99, rows(7.99, 14.99, 9.99, 9.99, 9.99))).toEqual({ kind: "drop", from: 14.99 });
  });

  it("returns plain when the last change was a rise", () => {
    expect(pickPriceBeat(14.99, rows(7.99, 9.99, 14.99))).toEqual({ kind: "plain" });
  });

  it("returns plain for empty history", () => {
    expect(pickPriceBeat(9.99, rows())).toEqual({ kind: "plain" });
  });

  it("coerces string price_usd values (PostgREST NUMERIC)", () => {
    expect(pickPriceBeat(9.99, rows("14.99", "9.99"))).toEqual({ kind: "lowest" });
    expect(pickPriceBeat(9.99, rows("7.99", "14.99", "9.99"))).toEqual({ kind: "drop", from: 14.99 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/price-beat.test.ts`
Expected: FAIL — cannot resolve `../lib/price-beat`.

- [ ] **Step 3: Write the implementation**

Create `app/lib/price-beat.ts`:

```ts
// One context line for the film-page price sticker, derived from the
// 180-day price_history window (oldest→newest, as getLatestPriceHistory returns it).
export type PriceBeat =
  | { kind: "lowest" }
  | { kind: "drop"; from: number }
  | { kind: "plain" };

export function pickPriceBeat(
  price: number,
  history: { price_usd: number | string }[]
): PriceBeat {
  const prices = history
    .map(h => Number(h.price_usd))
    .filter(n => Number.isFinite(n));

  if (prices.length > 0 && price <= Math.min(...prices)) {
    return { kind: "lowest" };
  }

  for (let i = prices.length - 1; i >= 0; i--) {
    if (prices[i] !== price) {
      return prices[i] > price ? { kind: "drop", from: prices[i] } : { kind: "plain" };
    }
  }
  return { kind: "plain" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/price-beat.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/price-beat.ts app/tests/price-beat.test.ts
git commit -m "feat(film-page): pickPriceBeat helper for price sticker context line"
```

---

### Task 2: `FilmPriceSticker` component

**Files:**
- Create: `app/components/FilmPriceSticker.tsx`

**Interfaces:**
- Consumes: `pickPriceBeat`, `PriceBeat` from `@/lib/price-beat` (Task 1).
- Produces: default export `FilmPriceSticker({ price, history })` — `price: number` (dollars), `history: { price_usd: number | string; captured_at: string }[]`. Task 3 imports it as `import FilmPriceSticker from "@/components/FilmPriceSticker"`.

- [ ] **Step 1: Write the component**

Create `app/components/FilmPriceSticker.tsx` (no `"use client"` — pure display, server-renderable):

```tsx
import { pickPriceBeat } from "@/lib/price-beat";

interface PriceHistoryRow {
  price_usd: number | string;
  captured_at: string;
}

interface Props {
  price: number;
  history: PriceHistoryRow[];
}

// Die-cut vinyl price sticker — same visual family as the OG share card
// (app/api/og/film/[id]/route.tsx), scaled down for the hero column.
// Informational only: the Buy button stays the sole CTA.
export default function FilmPriceSticker({ price, history }: Props) {
  const beat = pickPriceBeat(price, history);
  const beatText =
    beat.kind === "lowest"
      ? "lowest in 180 days"
      : beat.kind === "drop"
        ? `▼ down from $${beat.from.toFixed(2)}`
        : "on Apple TV";

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        background: "var(--accent)",
        color: "var(--void)",
        padding: "12px 20px",
        border: "3px solid var(--void)",
        borderRadius: 2,
        boxShadow: "6px 6px 0 var(--void)",
        transform: "rotate(-6deg)",
      }}
    >
      <div style={{ fontFamily: "var(--font-ui)", fontSize: 30, fontWeight: 800, lineHeight: 1 }}>
        ${price.toFixed(2)}
      </div>
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginTop: 6,
        }}
      >
        {beatText}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/FilmPriceSticker.tsx
git commit -m "feat(film-page): FilmPriceSticker die-cut vinyl component"
```

---

### Task 3: Wire sticker into `/film/[id]` and simplify the Buy button

**Files:**
- Modify: `app/app/film/[id]/page.tsx` (import block ~lines 5–25; hero text column ~lines 158–208)

**Interfaces:**
- Consumes: `FilmPriceSticker` (Task 2). The page already computes `currentPrice: number | null` (~line 98) and fetches `history` via `getLatestPriceHistory(supabase, id, 180)` (~line 87).
- Produces: final user-visible behavior; nothing downstream.

- [ ] **Step 1: Add the import**

In `app/app/film/[id]/page.tsx`, alongside the existing component imports:

```tsx
import FilmPriceSticker from "@/components/FilmPriceSticker";
```

- [ ] **Step 2: Mount the sticker between the tags row and the action cluster**

Current code (~lines 165–170):

```tsx
            <div style={{ marginBottom: 28 }}>
              <FilmTagsRow visible={filmTags.visible} director={film.director} />
            </div>

            {/* Primary action cluster — save/own/log + recommend + share + buy. */}
            <div className="hero-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
```

Becomes:

```tsx
            <div style={{ marginBottom: 28 }}>
              <FilmTagsRow visible={filmTags.visible} director={film.director} />
            </div>

            {/* Price sticker — text-column placement, never on the poster (settled: PR #51). */}
            {film.itunes_url && currentPrice != null && (
              <div style={{ margin: "4px 0 28px" }}>
                <FilmPriceSticker price={currentPrice} history={history} />
              </div>
            )}

            {/* Primary action cluster — save/own/log + recommend + share + buy. */}
            <div className="hero-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
```

- [ ] **Step 3: Simplify the Buy button label**

Current code (~lines 201–207):

```tsx
              {film.itunes_url && (
                <a href={film.itunes_url} target="_blank" rel="noreferrer" className="btn btn-lg">
                  {currentPrice != null
                    ? `Buy on Apple TV · $${currentPrice.toFixed(2)} →`
                    : "Buy on Apple TV →"}
                </a>
              )}
```

Becomes:

```tsx
              {film.itunes_url && (
                <a href={film.itunes_url} target="_blank" rel="noreferrer" className="btn btn-lg">
                  Buy on Apple TV →
                </a>
              )}
```

- [ ] **Step 4: Typecheck and full test suite**

Run (from `app/`):
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: exit 0.
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: all tests pass (including the 8 new price-beat tests); no new failures vs master.

- [ ] **Step 5: Manual smoke (dev server)**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev`
Check at `http://localhost:3000`:
- A priced film's `/film/[id]`: sticker renders above the action buttons with a sensible beat line; Buy button reads `Buy on Apple TV →` with no price.
- A film with no `itunes_url` (TMDB-only): no sticker, page unchanged.
- Signed-out view of a priced film: sticker renders (no user data involved).
- Narrow the window below 720px: hero stacks to one column, sticker does not cause horizontal scroll.

- [ ] **Step 6: Commit**

```bash
git add app/app/film/[id]/page.tsx
git commit -m "feat(film-page): mount price sticker in hero, simplify Buy button label"
```

---

### Task 4: Docs and final verification

**Files:**
- Modify: `CLAUDE.md` (root — "Current state" section)
- Modify: `docs/sub-project-history.md` (append one row)

**Interfaces:**
- Consumes: shipped state from Tasks 1–3.
- Produces: session-close documentation.

- [ ] **Step 1: Add a "Last shipped" paragraph to root `CLAUDE.md`**

Insert a new paragraph at the top of the Current state entries (most-recent-first), one or two sentences in the established style:

```markdown
**Last shipped (2026-07-07):** **Film page price sticker** (`feature/film-page-price-sticker`). The current price on `/film/[id]` now renders as a die-cut vinyl sticker (accent/void, rotate(-6deg), 2px radius — OG-card visual language) in the hero text column above the action cluster, with one context beat from the 180-day history (`pickPriceBeat` in `app/lib/price-beat.ts`: lowest-in-window → ▼ down-from → plain "on Apple TV"). Informational only — Buy button stays the sole CTA, its label simplified to `Buy on Apple TV →` (price no longer duplicated). Mounts only when `itunes_url && currentPrice != null`; never on the poster (PR #51 settled decision holds). New `app/components/FilmPriceSticker.tsx` (server-rendered, no "use client"). No migrations, no new queries. Spec: `docs/superpowers/specs/2026-07-07-film-page-price-sticker-design.md`, plan: `docs/superpowers/plans/2026-07-07-film-page-price-sticker.md`.
```

Also update the `**Last updated:**` line to `2026-07-07`, and demote the previous entry's label from `**Last shipped**` to `**Previously shipped**` if the existing convention in the file does so.

- [ ] **Step 2: Append a row to `docs/sub-project-history.md`**

Append at the end of the table, using the next row number (check the current last row first):

```markdown
| <next#> | Film page price sticker — die-cut vinyl price sticker in the `/film/[id]` hero text column (accent bg, void border, offset shadow, rotate(-6deg), 2px radius — OG-card language). Context beat from 180-day history via new pure helper `pickPriceBeat` (`app/lib/price-beat.ts`, 8 unit tests): lowest-in-window / ▼ down-from-$X / "on Apple TV". Not tappable; Buy button label simplified to drop the price. New `FilmPriceSticker.tsx`. On-poster placement rejected again (PR #51 settled). No migration. | `2026-07-07-film-page-price-sticker-design.md` |
```

- [ ] **Step 3: Final full verification**

Run (from `app/`):
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: both exit 0.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md docs/sub-project-history.md
git commit -m "docs: record film page price sticker ship"
```

**Ship sequence:** app-only change, no migrations — merge PR, then `npx vercel deploy --prod --yes` from the repo root. Nothing to sequence.
