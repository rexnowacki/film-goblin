# FROM THE PIT: Seal Avatar + Three-Tier Feed Treatment — Design

**Date:** 2026-07-07
**Status:** Approved
**Sub-project:** Upgrade system feed events ("FROM THE PIT" posts) to render as official product omens rather than posts from a user: a new seal avatar, a three-tier visual treatment derived from event type (whisper/standard/full), an assembly-layer cadence cap on full cards, and a goblin-action-first copy voice rule.

## Problem

System feed events currently render as a single flat tier: a small "FG" SVG badge, a "FROM THE PIT" caption, and plain copy — visually indistinguishable in weight from a user's own activity row regardless of whether the event is a rare, high-value signal (an all-time-low price) or routine ambient noise (a minor price twitch). Nothing about the current rendering communicates "this is the product speaking, with varying urgency" — every Pit post competes for the same visual attention.

Explicitly deferred (see "Out of scope" below): true per-viewer personal relevance (watchlist/coven-scoped tier boosting) — `feed_events` is architected as a fully anonymous global broadcast with zero per-viewer join today; adding one is a real query-layer expansion and belongs in its own spec, not bolted onto this one.

## Decision summary

| Decision | Choice |
|---|---|
| Tier basis | Derived from `event_type` alone (a `PIT_TYPE_CONFIG` lookup table), not true per-viewer relevance — the data doesn't support the latter yet |
| Personal-relevance tier language | Reinterpreted as "how big a deal is this, generically" for this pass |
| Scope: landing page | Both `/home` (`SystemEventRow`) and the anon `LandingFeedCard` get tiered, with a compact variant on the latter |
| Pit color identity | Fixed (`--pit-magenta` etc.), never theme-switched — the Pit is the product's own voice, distinct from the viewer's chosen `--accent` theme |
| Seal asset | Raster `app/public/pit-seal.png`, flat 40px display everywhere it appears (standard + full), no enlarging |
| Cadence window unit | Sliding window over 8 *feed* items (user rows count toward the gap, not just system rows) |
| Cadence algorithm | Single forward pass over the final composed array; demote (not drop) excess full-card candidates |
| Watchlist relevance | Deferred to an immediate follow-up sub-project (see Out of scope) |

Rejected alternatives:
- **Fixed buckets (0–7, 8–15, …) for the cadence cap** — allows two full cards to sit adjacent across a bucket boundary, exactly the clustering `compose.ts`'s existing anti-stacking rule works to avoid. Sliding window chosen instead.
- **Tier resolved entirely inside a single `getPitTier(event)` call** — cadence demotion is inherently feed-level (item 12's final tier depends on whether item 6 was already kept as full); no single-event function can know this. Split into `getPitTier` (natural, per-event) + `resolvePitTiers` (feed-level cadence pass) instead — both still outside any component.
- **Reusing the existing `--plum: #9d6fc4` token** for the tier backgrounds — that token is a light lavender already used for the "Cursed Artifact" rank band and film-tag borders; the Pit's reference plum is a near-black background tint, a different role entirely. New `--pit-*` tokens instead.
- **Pit styling following the viewer's `--accent` theme** — would make the Pit look like "the user's own accent," undermining the "this is the product talking" framing the whole redesign is for.

## 1. Tier & kicker resolution — `app/lib/feed-events/tier.ts`

```ts
export type PitTier = "whisper" | "standard" | "full";

interface PitTypeConfig {
  tier: PitTier;
  kicker: string; // used when the event renders at ITS natural tier
}

export const PIT_TYPE_CONFIG: Record<FeedEventType, PitTypeConfig> = {
  all_time_low:      { tier: "full",     kicker: "LEDGER OMEN" },
  price_drop:        { tier: "standard", kicker: "TITHE LOWERED" },
  price_rise:        { tier: "whisper",  kicker: "WHISPER" },
  now_free:          { tier: "standard", kicker: "NO TITHE" },
  left_free:         { tier: "standard", kicker: "GRACE ENDED" },
  new_film:          { tier: "standard", kicker: "NEW TO THE PIT" },
  now_on_apple:      { tier: "standard", kicker: "CROSSED OVER" },
  now_at_theater:    { tier: "standard", kicker: "NOW HAUNTING" },
  last_showing:      { tier: "standard", kicker: "LAST RITES" },
  verdict_anointed:  { tier: "standard", kicker: "ANOINTED" },
  goblin_pick:       { tier: "standard", kicker: "GOBLIN'S COUNSEL" },
  anniversary:       { tier: "whisper",  kicker: "WHISPER" },
  milestone:         { tier: "whisper",  kicker: "WHISPER" },
  full_moon:         { tier: "whisper",  kicker: "WHISPER" },
  monthly_communion: { tier: "whisper",  kicker: "WHISPER" },
};

export function getPitTier(event: SystemFeedEvent): PitTier {
  return PIT_TYPE_CONFIG[event.event_type].tier;
}

// tier is the RESOLVED (possibly demoted) tier, not necessarily the natural
// one — a demoted full→standard event must NOT keep "LEDGER OMEN".
export function getPitKicker(event: SystemFeedEvent, tier: PitTier): string {
  if (tier === PIT_TYPE_CONFIG[event.event_type].tier) {
    return PIT_TYPE_CONFIG[event.event_type].kicker;
  }
  // Demoted full → standard: fall back to a generic standard-tier kicker
  // rather than inventing per-type demoted copy. Deliberately distinct from
  // both "LEDGER OMEN" (full) and "WHISPER" (whisper tier) so it can't be
  // mistaken for either at a glance.
  return "LEDGER ECHO";
}
```

`FULL` is reserved for event types that carry a genuine price ledger (`price` + `old_price` in payload) — currently only `all_time_low`. This keeps the cadence cap meaningful: full cards are rare by construction, not just by the window rule.

## 2. Cadence pass — `app/lib/feed-events/pitCadence.ts`

```ts
export const PIT_FULL_CARD_WINDOW = 8;

export function resolvePitTiers<U>(
  items: Array<ComposedItem<U>>,
): Map<string, PitTier> {
  const result = new Map<string, PitTier>();
  let indexSinceLastFull = Infinity;
  for (const item of items) {
    indexSinceLastFull++;
    if (item.type !== "system") continue;
    const natural = getPitTier(item.event);
    if (natural === "full" && indexSinceLastFull < PIT_FULL_CARD_WINDOW) {
      result.set(item.event.id, "standard");
    } else {
      result.set(item.event.id, natural);
      if (natural === "full") indexSinceLastFull = 0;
    }
  }
  return result;
}
```

Runs once, after `composeFeed` (untouched) produces the final interleaved array, over the *whole* array — every feed item (user rows included) counts toward the 8-item gap, not just system rows. Whispers and standards are never touched by this pass — only full-tier candidates can be demoted (to standard), never dropped.

Callers (`FeedTabs`, `LandingFeedCard`) call `resolvePitTiers` once per composed array and pass each system row its resolved tier as a prop — no component computes its own tier.

## 3. Design tokens — `app/app/styles/00-core.css`

Added once to `:root`, **not** inside any `[data-accent="…"]` block or the Midsommar override — fixed regardless of the viewer's theme:

```css
--pit-magenta: #f00070;
--pit-magenta-bright: #ff1a7e;
--pit-plum-bg: #17091f;
--pit-plum-line: #2a0f38;
--pit-plum-wash-start: rgba(58, 15, 74, 0.30);
--pit-plum-wash-end: rgba(58, 15, 74, 0.10);
--pit-whisper-tint: rgba(58, 15, 74, 0.14);
--pit-cream: #f0d8bc;
--pit-cream-dim: #9c8b78;
```

## 4. Tier visual specs — new `app/app/styles/220-pit-tiers.css`

**Whisper** (`.pit-whisper`): no avatar column at all (not hidden — omitted from the flex layout). `border-left: 2px solid var(--pit-magenta)`, `background: var(--pit-whisper-tint)`, tighter padding (`8px 12px`). Kicker `FROM THE PIT · WHISPER` in `var(--pit-magenta-bright)`; copy in `var(--pit-cream-dim)`.

**Standard** (`.pit-standard`): 40px seal in the avatar slot. Rounded container, `border-radius: 16px`. `background: linear-gradient(90deg, var(--pit-plum-wash-start), var(--pit-plum-wash-end))`. Kicker `FROM THE PIT · {KICKER}` in `var(--pit-magenta-bright)`; copy in `var(--pit-cream)`. Source/FREE/price badges reuse the existing `.chip`/`.chip-filled` classes.

**Full** (`.pit-full`): 40px seal, **flat 40 — same as standard, never enlarged**. `background: var(--pit-plum-bg)`, `border: 1px solid var(--pit-plum-line)`, same 16px radius. Kicker `FROM THE PIT · LEDGER OMEN`. Price chip renders `${price} · was ${old_price}` (both already present on `all_time_low` events).

Seal rendering: `<img src="/pit-seal.png" width={40} height={40} style={{ objectFit: "contain" }} />`, replacing `PitSigil`'s SVG entirely for standard/full. `app/public/pit-seal.png` is provided by the project owner, not generated by this sub-project.

## 5. Copy voice rule — `app/lib/feed-events/copy.ts`

Rule: goblin **action** verb first, then the concrete fact — never a goblin **feeling**. Four existing template variants violate this and are rewritten (copy is frozen at emission per the file's existing contract — **this only affects events emitted after deploy**; stored rows are untouched, same non-retroactive precedent as `stripLeadingEmoji`):

| Type/variant | Before | After |
|---|---|---|
| `left_free` v2 | "{service} took **title** back. The goblin mourns. The goblin also watches the price." | "The goblin let **{title}** slip back to {service}'s vault. Still watching the price." |
| `all_time_low` v2 | "**title** hits $X — the lowest the goblin has ever seen. Strike." | "**{title}** drops its guard to $X. The goblin strikes." |
| `new_film` v1 | "Summoned to the pit: **title** (year). The goblin has been waiting for this one." | "The goblin dragged **{title}** (year) into the pit by the collar." |
| `price_drop` v3 | "**title** just fell to $X. The goblin noticed. Now you have too." | "The goblin marked **{title}**'s fall to $X. Now you know too." |

All other templates already comply and are unchanged. A one-line comment documenting the rule is added above `TEMPLATES` so future additions follow it without re-deriving from examples.

## 6. Component wiring

- **`SystemEventRow.tsx`** gains a `tier: PitTier` prop (resolved by `FeedTabs` via `resolvePitTiers` and passed down); branches its markup into the three tier specs from §4 instead of the current single rendering.
- **`FeedTabs.tsx`**: after `composeFeed`, call `resolvePitTiers(composed)` once (memoized alongside the existing `composed`/`filtered` `useMemo`s), pass each system row its tier.
- **`LandingFeedCard.tsx`**: same `resolvePitTiers` pipeline, compact variant — full tier keeps the plum-solid background and kicker but folds the old→new price into the existing single-line copy rather than a separate chip row (no vertical room in the 5-row card). Seal size 32px here (under the 40px standard but at your tested legibility floor), not 40px — the card's existing rows are already smaller (`fontSize: 13`) than the `/home` feed.
- **`PitSigil`** (the current "FG" SVG) is removed once nothing references it; `renderCopyText` is unchanged (title-linking behavior is orthogonal to tiering).

## 7. Testing

- `app/tests/feed-events/tier.test.ts` — `getPitTier`/`getPitKicker` table-driven over all 15 `FeedEventType`s, plus the demoted-kicker fallback path.
- `app/tests/feed-events/pitCadence.test.ts` — `resolvePitTiers`: single full card (no demotion), a second full card inside the 8-item window (demoted), a second full card outside the window (kept full), whispers/standards never demoted, an all-system feed with no user items, an empty feed.
- `compose.ts` and its existing tests are untouched.

## Out of scope (deferred)

- **Watchlist/coven relevance boosting (immediate follow-up sub-project).** Sketch for that spec: fetch the viewer's watchlist+library film IDs alongside the existing feed query, cross-reference against each system event's `film_id` at composition time, and promote an otherwise-standard event a tier when the film matches — all while keeping `feed_events` itself a flat, anonymous-safe broadcast (the join happens at the read/compose layer, per-request, not by adding viewer-scoped columns to the table). Needs its own RLS/performance consideration before design.
- Editing/backfilling copy on already-emitted events.
- Enlarging the seal beyond 40px anywhere, or using it below the tested legibility floor (~32px).
- Any change to `composeFeed`'s ratio-cap or anti-clustering rules themselves.
