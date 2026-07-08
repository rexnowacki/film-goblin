# The Claiming — Buy-Click Capture & Purchase Confirmation — Design

**Date:** 2026-07-07
**Status:** Approved
**Sub-project:** Close the loop between a Buy on Apple TV click and the grimoire: capture the clicked price, ask on return whether they purchased, auto-add to the grimoire with price paid, and surface savings data.

## Problem

Clicking Buy on Apple TV is a dead end for the site: the user leaves, and whether they actually bought the film is never learned. Owned films must be added to the grimoire manually (and usually aren't), and the product's core promise — buy at the right price — produces no receipts: no record of what was paid, no savings story. The just-returned moment (memory hot, purchase fresh) is the best possible time to ask, and it is currently wasted.

Explicitly deferred: cross-device prompts (server-side pending table — approach B, can layer on later without unwinding this design); public-profile savings display; any change to poster-grid buy affordances beyond link wrapping.

## Decision summary

| Decision | Choice |
|---|---|
| Pending-click storage | Client-side `localStorage` queue (`fg_pending_buys`), no server state |
| Prompt trigger | Tab refocus (`visibilitychange`) + page load; entries eligible 2min–48h after click |
| No / dismiss semantics | Explicit No clears permanently; dismiss defers once, then drops |
| Capture sites | All Apple TV buy links: film-page Buy button + watchlist caption link, via one shared component |
| Savings math | Read-time only: `GREATEST(peak − paid, 0)`, peak = all-time `MAX(price_usd)` in `price_history` |
| Display | Confirmation modal savings line + `/library` stat strip (claimed / total tithed / total saved) |
| Audience | Signed-in users only; anonymous clicks not captured |
| Schema | Mig 0211: `library.price_paid_usd NUMERIC(6,2)` nullable — nothing else |
| Privacy | `price_paid_usd` inherits existing library row visibility (owner + broadcast-gated coven). Accepted deliberately — no column-level guard |

Rejected alternatives:
- **Server-side `pending_purchases` table** — cross-device prompts, at the cost of a new table, RLS, cleanup job, and a write per click. Deferred, not refused; nothing in this design blocks adding it later.
- **Manual-only "I own it" affordance** — loses the just-returned moment.
- **Storing computed savings** — goes stale the moment `price_history` grows a new peak; compute at read time instead.
- **New `purchase_confirmed` activity kind** — the existing `library_added` activity fires via the same add path; a second kind is noise.

## 1. Data model (mig 0211)

```sql
ALTER TABLE library ADD COLUMN price_paid_usd NUMERIC(6,2);
```

Nullable. Existing rows and manual grimoire adds leave it null. No new RLS: the existing `library_select` policy (owner, or coven member when `broadcast_library` is true) covers the column — price paid is coven-visible alongside the rest of the row, accepted deliberately.

**Rollout order:** migration first, then app deploy (only new code reads the column; same convention as migs 0206/0207).

## 2. Pending-buy queue — pure module

`app/lib/purchase/pending.ts` — pure functions over an injected storage interface (`getItem`/`setItem`/`removeItem`), so vitest covers the logic without a browser. Key `fg_pending_buys`, value `PendingBuy[]`:

```ts
interface PendingBuy {
  filmId: string;
  title: string;
  price: number | null;   // price shown at click time; null if the surface had none
  clickedAt: string;       // ISO
  deferred?: boolean;      // dismissed once already
}
```

Operations:
- `addPendingBuy(storage, buy)` — appends; same `filmId` replaces the older entry; queue capped at 10 (oldest evicted).
- `nextEligibleBuy(storage, now)` — most-recent entry with `2min < (now − clickedAt) < 48h`; expired entries are pruned as a side effect. The 2-minute floor stops the modal from firing on an instant bounce-back from a mis-click.
- `resolvePendingBuy(storage, filmId, outcome)` — `"confirmed" | "declined"` removes the entry; `"dismissed"` sets `deferred: true` if unset, removes if already deferred.

`localStorage` unavailable (private-mode edge): every operation silently no-ops; the feature degrades to today's behavior.

## 3. Click capture — `BuyOnAppleLink` client component

`app/components/BuyOnAppleLink.tsx` (`"use client"`). Props: `{ filmId, title, price, href, className?, style?, children }`. Renders the same `<a target="_blank" rel="noreferrer">` as today — appearance is entirely the caller's, passed through. `onClick` (non-blocking, before navigation proceeds): if `signedIn` prop is true, `addPendingBuy`. Never `preventDefault`.

Wraps both capture sites:
- Film page Buy button (`app/app/film/[id]/page.tsx`) — the `btn btn-lg` anchor.
- Watchlist caption link ("Apple TV · $9.99 →") — locate the caption-link component under the watchlist poster grid and swap its anchor.

The server component passes `signedIn={Boolean(user)}`; anonymous clicks are not captured.

## 4. The prompt — `PurchasePrompt` client component

`app/components/PurchasePrompt.tsx` (`"use client"`), mounted once in the signed-in app layout. On mount and on `visibilitychange` → visible: `nextEligibleBuy`; if present and no prompt already shown this page view, open a `BottomSheet` (house modal):

- Copy (goblin voice): **"Did you claim *{title}*?"** with the captured price ("at $4.99") when known.
- **Claimed it** → `confirmPurchase(filmId, price)`; on success the sheet swaps to the reward line: *"Claimed at $4.99 — $15.00 below its peak."* (savings line omitted when the action returns no peak or price was null), then a Close. `resolvePendingBuy(…, "confirmed")`.
- **Not this time** → `resolvePendingBuy(…, "declined")`, sheet closes.
- Backdrop/close dismiss → `resolvePendingBuy(…, "dismissed")` (defer-once semantics).

One prompt per page view; queue order most-recent-first. If `confirmPurchase` reports the film was already in the grimoire with a price, the sheet closes silently and the entry resolves as confirmed.

## 5. Server action — `confirmPurchase`

In `app/lib/actions/library.ts`, following the `_private`/public split and auth guard:

```ts
export async function _confirmPurchase(
  client: Client, userId: string, filmId: string, pricePaid: number | null
): Promise<{ alreadyOwnedWithPrice: boolean; peak: number | null }>
```

Semantics:
- Not in library → insert row with `price_paid_usd = pricePaid`, emitting the same `library_added` activity `_addToLibrary` emits (reuse its path — call it, then set the price — or share its emit helper; implementation's choice, but exactly one activity row).
- In library with `price_paid_usd IS NULL` → fill the price only. No activity (it was already announced).
- In library with a price → change nothing, return `alreadyOwnedWithPrice: true`.
- `pricePaid` validated server-side: null, or finite 0 < p < 1000.
- `peak`: `MAX(price_usd)` from `price_history` for the film (null when no history).
- `revalidatePath("/library")` and `revalidatePath(`/film/${filmId}`)`.

## 6. Grimoire stats

`app/lib/queries/library.ts` gains `getLibrarySavings(client, userId)` → `{ claimedCount, totalPaid, totalSaved }`: rows with `price_paid_usd NOT NULL`, joined against per-film `MAX(price_usd)` peaks; per-film saving `GREATEST(peak − paid, 0)`, films with no history contribute 0 saved. `/library` renders a small stat strip in the page's existing visual language: **films claimed · total tithed · total saved** (copy in goblin register, e.g. "claimed", "tithed to Apple", "kept from the fire"). Strip hidden when `claimedCount === 0`.

## 7. Edge cases

- Price moves between click and confirm: the *clicked* price is stored — the number they acted on.
- Multiple pending clicks: one modal per page view, most recent first; the rest surface on later loads within their 48h window.
- Film with no `price_history`: modal shows no savings line; stats count it as claimed, $0 saved.
- Signed-out click then later sign-in on same device: entry is in localStorage, prompt fires once signed-in layout mounts — acceptable (it was their click).

## 8. Testing

- `app/tests/purchase/pending.test.ts` — queue module: add/replace/cap, eligibility window (2min floor, 48h expiry, pruning), defer-once resolution, storage-unavailable no-op.
- `app/tests/actions/confirm-purchase.test.ts` — action template: insert path (+1 activity), fill-null path (no activity), no-overwrite path, price validation, peak return.
- Savings aggregation: pure computation tested with mock rows.
- Manual smoke: desktop click→return→confirm loop; iPhone PWA (buy in Apple TV app, return to standalone PWA — verify `visibilitychange` fires there); watchlist caption capture; declined and dismissed paths.

## Out of scope (deferred)

- Cross-device pending prompts (server-side table).
- Public-profile savings display / privacy toggle for it.
- Editing or backfilling price paid on existing grimoire rows (manual affordance).
- Any change to the price sticker, OG card, or Buy button appearance.
