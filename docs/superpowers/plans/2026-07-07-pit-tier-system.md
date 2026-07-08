# FROM THE PIT: Seal Avatar + Three-Tier Feed Treatment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render system feed events ("FROM THE PIT" posts) at one of three tiers (whisper/standard/full) derived from event type, with a new seal avatar, an assembly-layer cadence cap on full cards, and a goblin-action-first copy voice rule — on both `/home` and the anon landing page.

**Architecture:** Two new pure modules (`tier.ts` for per-event tier/kicker/price-var resolution, `pitCadence.ts` for the feed-level sliding-window demotion pass) sit beside the existing `feed-events/` files and are consumed by both feed renderers. `SystemEventRow` and `LandingFeedCard` become dumb — they receive a resolved `tier` prop and branch their markup, with zero tier logic inside either component. A small, necessary type change widens `LandingFeedRow`'s "system" variant to carry the full `SystemFeedEvent` (needed so the landing page can resolve tier/kicker/price at all — the flattened shape it uses today drops `event_type` and `payload`).

**Tech Stack:** Next.js 15 (App Router), TypeScript, vitest, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-07-07-pit-tier-system-design.md`

## Global Constraints

- **Node 20 required.** Prefix every `npm`/`npx` command with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`.
- All commands run from `app/` unless stated otherwise.
- **Correction to the spec's CSS filename:** the spec says `220-pit-tiers.css`, but `220-landing.css` already exists (created after the spec's numbering assumption). Use **`230-pit-tiers.css`** instead — same content, corrected number. This plan is the source of truth for the number; no need to re-edit the spec file.
- **Pit colors are fixed, never theme-switched.** New `--pit-*` tokens go in `00-core.css`'s base `:root` block only — never inside a `[data-accent="…"]` block or the Midsommar `@media`/class override.
- **Seal is flat 40px everywhere except the landing card, where it's 32px** (per spec §6) — never enlarged beyond 40px, never used below ~32px (tested legibility floor).
- **Whisper tier renders no avatar element at all** (not hidden — omitted from the row's flex children) on both surfaces.
- **Copy template edits are forward-only.** `copy.ts`'s existing contract: copy is frozen at emission. Editing `TEMPLATES` only changes what *future* events say: never touch stored `feed_events.copy` rows.
- **Kicker/tier are resolved outside any component** — `getPitTier`/`getPitKicker` (per-event) and `resolvePitTiers` (per-feed, cadence-aware) are the only places tier logic lives. `SystemEventRow` and `LandingFeedCard` only branch on an already-resolved `tier` prop.
- Branch: `feature/pit-tier-system` (already exists; spec committed as `c4e8892`).
- Commit-message gotcha: heredoc commit messages get mangled in this repo — use a single-line `-m` or write to a file and `git commit -F`.

---

### Task 1: Tier/kicker/price-var resolution — `tier.ts`

**Files:**
- Create: `app/lib/feed-events/tier.ts`
- Test: `app/tests/feed-events/tier.test.ts`

**Interfaces:**
- Consumes: `FeedEventType` from `@/lib/feed-events/copy`; `SystemFeedEvent` from `@/lib/feed-events/types`.
- Produces (Tasks 2, 5, 6 import these from `@/lib/feed-events/tier`):
  - `export type PitTier = "whisper" | "standard" | "full";`
  - `export const PIT_TYPE_CONFIG: Record<FeedEventType, { tier: PitTier; kicker: string }>`
  - `export function getPitTier(event: SystemFeedEvent): PitTier`
  - `export function getPitKicker(event: SystemFeedEvent, tier: PitTier): string`
  - `export function getPitPriceVars(event: SystemFeedEvent): { price: number | null; oldPrice: number | null }`
  - `export interface PitBadge { label: string; filled?: boolean }`
  - `export function getPitBadges(event: SystemFeedEvent): PitBadge[]`

- [ ] **Step 1: Write the failing test**

Create `app/tests/feed-events/tier.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getPitTier, getPitKicker, getPitPriceVars, getPitBadges, PIT_TYPE_CONFIG } from "../../lib/feed-events/tier";
import type { SystemFeedEvent } from "../../lib/feed-events/types";
import type { FeedEventType } from "../../lib/feed-events/copy";

function ev(type: FeedEventType, payload: Record<string, unknown> = {}): SystemFeedEvent {
  return { id: `e-${type}`, event_type: type, film_id: null, payload, copy: "x", priority: 0, created_at: "2026-07-07T00:00:00Z", film: null };
}

const EXPECTED_TIERS: Record<FeedEventType, "whisper" | "standard" | "full"> = {
  all_time_low: "full",
  price_drop: "standard",
  price_rise: "whisper",
  now_free: "standard",
  left_free: "standard",
  new_film: "standard",
  now_on_apple: "standard",
  now_at_theater: "standard",
  last_showing: "standard",
  verdict_anointed: "standard",
  goblin_pick: "standard",
  anniversary: "whisper",
  milestone: "whisper",
  full_moon: "whisper",
  monthly_communion: "whisper",
};

describe("getPitTier", () => {
  it("returns the configured tier for every event type", () => {
    for (const type of Object.keys(EXPECTED_TIERS) as FeedEventType[]) {
      expect(getPitTier(ev(type)), type).toBe(EXPECTED_TIERS[type]);
    }
  });

  it("has exactly one full-tier type (all_time_low)", () => {
    const fullTypes = (Object.keys(PIT_TYPE_CONFIG) as FeedEventType[]).filter(
      t => PIT_TYPE_CONFIG[t].tier === "full",
    );
    expect(fullTypes).toEqual(["all_time_low"]);
  });
});

describe("getPitKicker", () => {
  it("returns the type's natural kicker when tier matches config", () => {
    expect(getPitKicker(ev("all_time_low"), "full")).toBe("LEDGER OMEN");
    expect(getPitKicker(ev("now_free"), "standard")).toBe("NO TITHE");
    expect(getPitKicker(ev("price_rise"), "whisper")).toBe("WHISPER");
  });

  it("falls back to LEDGER ECHO for a demoted full->standard event", () => {
    expect(getPitKicker(ev("all_time_low"), "standard")).toBe("LEDGER ECHO");
  });
});

describe("getPitPriceVars", () => {
  it("extracts price and old_price from payload.vars", () => {
    const e = ev("all_time_low", { vars: { title: "Suspiria", price: 4.99, old_price: 14.99 } });
    expect(getPitPriceVars(e)).toEqual({ price: 4.99, oldPrice: 14.99 });
  });

  it("returns nulls when vars is missing or malformed", () => {
    expect(getPitPriceVars(ev("all_time_low", {}))).toEqual({ price: null, oldPrice: null });
    expect(getPitPriceVars(ev("all_time_low", { vars: "not an object" }))).toEqual({ price: null, oldPrice: null });
    expect(getPitPriceVars(ev("all_time_low", { vars: { price: "4.99" } }))).toEqual({ price: null, oldPrice: null });
  });
});

describe("getPitBadges", () => {
  it("now_free returns a FREE badge (filled) and a service badge", () => {
    const e = ev("now_free", { vars: { title: "Lamb", service: "YouTube" } });
    expect(getPitBadges(e)).toEqual([
      { label: "FREE", filled: true },
      { label: "YouTube" },
    ]);
  });

  it("left_free returns only a service badge, no FREE badge", () => {
    const e = ev("left_free", { vars: { title: "Raw", service: "AMC+" } });
    expect(getPitBadges(e)).toEqual([{ label: "AMC+" }]);
  });

  it("price_drop returns a filled price badge", () => {
    const e = ev("price_drop", { vars: { title: "Suspiria", price: 4.99 } });
    expect(getPitBadges(e)).toEqual([{ label: "$4.99", filled: true }]);
  });

  it("last_showing and now_at_theater return a theater badge", () => {
    expect(getPitBadges(ev("last_showing", { vars: { theater: "The Loft" } }))).toEqual([{ label: "The Loft" }]);
    expect(getPitBadges(ev("now_at_theater", { vars: { theater: "The Loft" } }))).toEqual([{ label: "The Loft" }]);
  });

  it("returns no badges for types with no badge-worthy vars, or missing vars", () => {
    expect(getPitBadges(ev("verdict_anointed", { vars: { title: "Hereditary" } }))).toEqual([]);
    expect(getPitBadges(ev("now_free", {}))).toEqual([{ label: "FREE", filled: true }]); // service absent, FREE still shown
    expect(getPitBadges(ev("price_drop", {}))).toEqual([]); // no price, no badge
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/tier.test.ts`
Expected: FAIL — cannot resolve `../../lib/feed-events/tier`.

- [ ] **Step 3: Write the implementation**

Create `app/lib/feed-events/tier.ts`:

```ts
// Pit tier/kicker resolution (spec 2026-07-07 "FROM THE PIT" three-tier
// treatment). Tier is a pure function of event_type — resolved ONCE here,
// never decided inside a component. Cadence-based demotion (feed-level,
// requires seeing neighboring items) lives in pitCadence.ts, not here.
import type { FeedEventType } from "./copy";
import type { SystemFeedEvent } from "./types";

export type PitTier = "whisper" | "standard" | "full";

interface PitTypeConfig {
  tier: PitTier;
  kicker: string;
}

// FULL is reserved for event types carrying a genuine price ledger
// (price + old_price) — currently only all_time_low. This keeps full
// cards rare by construction, not just by the cadence window.
export const PIT_TYPE_CONFIG: Record<FeedEventType, PitTypeConfig> = {
  all_time_low: { tier: "full", kicker: "LEDGER OMEN" },
  price_drop: { tier: "standard", kicker: "TITHE LOWERED" },
  price_rise: { tier: "whisper", kicker: "WHISPER" },
  now_free: { tier: "standard", kicker: "NO TITHE" },
  left_free: { tier: "standard", kicker: "GRACE ENDED" },
  new_film: { tier: "standard", kicker: "NEW TO THE PIT" },
  now_on_apple: { tier: "standard", kicker: "CROSSED OVER" },
  now_at_theater: { tier: "standard", kicker: "NOW HAUNTING" },
  last_showing: { tier: "standard", kicker: "LAST RITES" },
  verdict_anointed: { tier: "standard", kicker: "ANOINTED" },
  goblin_pick: { tier: "standard", kicker: "GOBLIN'S COUNSEL" },
  anniversary: { tier: "whisper", kicker: "WHISPER" },
  milestone: { tier: "whisper", kicker: "WHISPER" },
  full_moon: { tier: "whisper", kicker: "WHISPER" },
  monthly_communion: { tier: "whisper", kicker: "WHISPER" },
};

export function getPitTier(event: SystemFeedEvent): PitTier {
  return PIT_TYPE_CONFIG[event.event_type].tier;
}

// `tier` is the RESOLVED (possibly demoted) tier, not necessarily the
// type's natural one — a demoted full->standard event must not keep
// "LEDGER OMEN". Deliberately distinct wording from both "LEDGER OMEN"
// (full) and "WHISPER" (whisper tier) so it can't be mistaken for either.
export function getPitKicker(event: SystemFeedEvent, tier: PitTier): string {
  const natural = PIT_TYPE_CONFIG[event.event_type];
  if (tier === natural.tier) return natural.kicker;
  return "LEDGER ECHO";
}

// payload is `Record<string, unknown>` (JSON from the DB) — this is the
// only place that reaches into payload.vars, with runtime type guards
// since nothing enforces the shape at the type level.
export function getPitPriceVars(event: SystemFeedEvent): { price: number | null; oldPrice: number | null } {
  const raw = (event.payload as { vars?: unknown }).vars;
  const vars = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const price = typeof vars.price === "number" ? vars.price : null;
  const oldPrice = typeof vars.old_price === "number" ? vars.old_price : null;
  return { price, oldPrice };
}

export interface PitBadge {
  label: string;
  filled?: boolean;
}

function rawVars(event: SystemFeedEvent): Record<string, unknown> {
  const raw = (event.payload as { vars?: unknown }).vars;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

// Source/FREE/price badges for standard-tier rows (spec §"Standard row").
// Conservative by design: only render a badge when the underlying var is
// actually present — never fabricate a source (e.g. all_time_low has no
// distinct "source," it's implicitly Apple TV, so it gets no badge here).
export function getPitBadges(event: SystemFeedEvent): PitBadge[] {
  const vars = rawVars(event);
  const badges: PitBadge[] = [];
  const service = typeof vars.service === "string" ? vars.service : null;
  const theater = typeof vars.theater === "string" ? vars.theater : null;
  const price = typeof vars.price === "number" ? vars.price : null;

  if (event.event_type === "now_free") {
    badges.push({ label: "FREE", filled: true });
    if (service) badges.push({ label: service });
  } else if (event.event_type === "left_free") {
    if (service) badges.push({ label: service });
  } else if (event.event_type === "price_drop") {
    if (price != null) badges.push({ label: `$${price.toFixed(2)}`, filled: true });
  } else if (event.event_type === "last_showing" || event.event_type === "now_at_theater") {
    if (theater) badges.push({ label: theater });
  }
  return badges;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/tier.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/feed-events/tier.ts app/tests/feed-events/tier.test.ts
git commit -m "feat(pit-tiers): getPitTier/getPitKicker/getPitPriceVars/getPitBadges resolution"
```

---

### Task 2: Cadence pass — `pitCadence.ts`

**Files:**
- Create: `app/lib/feed-events/pitCadence.ts`
- Test: `app/tests/feed-events/pitCadence.test.ts`

**Interfaces:**
- Consumes: `getPitTier`, `PitTier` from `@/lib/feed-events/tier` (Task 1); `ComposedItem` from `@/lib/feed-events/compose`.
- Produces (Tasks 5, 6 import from `@/lib/feed-events/pitCadence`):
  - `export const PIT_FULL_CARD_WINDOW = 8;`
  - `export function resolvePitTiers<U>(items: Array<ComposedItem<U>>): Map<string, PitTier>`

- [ ] **Step 1: Write the failing test**

Create `app/tests/feed-events/pitCadence.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolvePitTiers, PIT_FULL_CARD_WINDOW } from "../../lib/feed-events/pitCadence";
import type { SystemFeedEvent } from "../../lib/feed-events/types";
import type { ComposedItem } from "../../lib/feed-events/compose";
import type { FeedEventType } from "../../lib/feed-events/copy";

function sysItem(id: string, type: FeedEventType): ComposedItem<{ id: string }> {
  const event: SystemFeedEvent = { id, event_type: type, film_id: null, payload: {}, copy: "x", priority: 0, created_at: "2026-07-07T00:00:00Z", film: null };
  return { type: "system", event };
}
function userItem(id: string): ComposedItem<{ id: string }> {
  return { type: "user", item: { id } };
}

describe("resolvePitTiers", () => {
  it("keeps a single full-tier event as full", () => {
    const out = resolvePitTiers([sysItem("a", "all_time_low")]);
    expect(out.get("a")).toBe("full");
  });

  it("demotes a second full candidate inside the 8-item window", () => {
    const items = [
      sysItem("a", "all_time_low"),
      ...Array.from({ length: 3 }, (_, i) => userItem(`u${i}`)),
      sysItem("b", "all_time_low"), // 4 items after a — inside window
    ];
    const out = resolvePitTiers(items);
    expect(out.get("a")).toBe("full");
    expect(out.get("b")).toBe("standard");
  });

  it("keeps a full candidate that lands exactly at the window boundary", () => {
    const items = [
      sysItem("a", "all_time_low"),
      ...Array.from({ length: PIT_FULL_CARD_WINDOW }, (_, i) => userItem(`u${i}`)),
      sysItem("b", "all_time_low"), // exactly PIT_FULL_CARD_WINDOW items after a
    ];
    const out = resolvePitTiers(items);
    expect(out.get("a")).toBe("full");
    expect(out.get("b")).toBe("full");
  });

  it("counts user items toward the window gap, not just system items", () => {
    const items = [
      sysItem("a", "all_time_low"),
      ...Array.from({ length: 2 }, (_, i) => userItem(`u${i}`)),
      sysItem("b", "all_time_low"), // 3 items after a — inside window despite most being user rows
    ];
    const out = resolvePitTiers(items);
    expect(out.get("b")).toBe("standard");
  });

  it("never demotes whisper or standard tiers", () => {
    const items = [sysItem("a", "all_time_low"), sysItem("b", "price_rise"), sysItem("c", "now_free")];
    const out = resolvePitTiers(items);
    expect(out.get("b")).toBe("whisper");
    expect(out.get("c")).toBe("standard");
  });

  it("handles an all-system feed with no user items", () => {
    const items = [sysItem("a", "all_time_low"), sysItem("b", "all_time_low"), sysItem("c", "all_time_low")];
    const out = resolvePitTiers(items);
    expect(out.get("a")).toBe("full");
    expect(out.get("b")).toBe("standard");
    expect(out.get("c")).toBe("standard");
  });

  it("returns an empty map for an empty feed", () => {
    expect(resolvePitTiers([]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/pitCadence.test.ts`
Expected: FAIL — cannot resolve `../../lib/feed-events/pitCadence`.

- [ ] **Step 3: Write the implementation**

Create `app/lib/feed-events/pitCadence.ts`:

```ts
// Feed-level cadence cap on full Pit cards (spec 2026-07-07 "FROM THE PIT").
// Runs once, after composeFeed (untouched) produces the final interleaved
// array. Cadence demotion is inherently feed-level: no single event can
// know its own final tier without seeing whether an earlier item already
// consumed the window — this is why it's a separate pass from getPitTier,
// not folded into it.
import { getPitTier, type PitTier } from "./tier";
import type { ComposedItem } from "./compose";

export const PIT_FULL_CARD_WINDOW = 8;

export function resolvePitTiers<U>(items: Array<ComposedItem<U>>): Map<string, PitTier> {
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

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/pitCadence.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/feed-events/pitCadence.ts app/tests/feed-events/pitCadence.test.ts
git commit -m "feat(pit-tiers): resolvePitTiers sliding-window cadence pass"
```

---

### Task 3: Copy voice-rule template rewrites

**Files:**
- Modify: `app/lib/feed-events/copy.ts` (the `TEMPLATES` object, lines ~49–106)
- Modify: `app/tests/feed-events/copy.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports — `renderCopy`'s output strings change for the 4 rewritten variants only. Nothing downstream depends on the exact old strings (confirmed: `copy.test.ts` has no existing assertions on these 4 variants' text).

- [ ] **Step 1: Add the voice-rule comment and rewrite the 4 templates**

In `app/lib/feed-events/copy.ts`, add this comment directly above the `const TEMPLATES` declaration (line 49):

```ts
// Voice rule: goblin ACTION verb first, then the concrete fact — never a
// goblin FEELING. "The goblin gnawed off the price tag. X is free." is
// good; "The goblin mourns. X was taken back." is bad (states a feeling,
// not an action). Apply this to any new template added below.
```

Then apply these 4 exact replacements within `TEMPLATES` (leave every other variant untouched):

`price_drop` — replace the 3rd array element:
```ts
    v => `**${v.title}** just fell to ${usd(v.price)}. The goblin noticed. Now you have too.`,
```
with:
```ts
    v => `The goblin marked **${v.title}**'s fall to ${usd(v.price)}. Now you know too.`,
```

`all_time_low` — replace the 2nd array element:
```ts
    v => `**${v.title}** hits ${usd(v.price)} — the lowest the goblin has ever seen. Strike.`,
```
with:
```ts
    v => `**${v.title}** drops its guard to ${usd(v.price)}. The goblin strikes.`,
```

`new_film` — replace the 1st array element:
```ts
    v => `Summoned to the pit: **${v.title}** (${v.year}). The goblin has been waiting for this one.`,
```
with:
```ts
    v => `The goblin dragged **${v.title}** (${v.year}) into the pit by the collar.`,
```

`left_free` — replace the 2nd array element:
```ts
    v => `${v.service} took **${v.title}** back. The goblin mourns. The goblin also watches the price.`,
```
with:
```ts
    v => `The goblin let **${v.title}** slip back to ${v.service}'s vault. Still watching the price.`,
```

- [ ] **Step 2: Add tests for the rewritten variants**

Append to `app/tests/feed-events/copy.test.ts`, inside the existing `describe("renderCopy", ...)` block (add as new `it` cases alongside the existing ones — do not remove any existing test):

```ts
  it("price_drop variant 2 leads with a goblin action, not a feeling", () => {
    expect(renderCopy("price_drop", { title: "Suspiria", price: 4.99 }, 2)).toBe(
      "The goblin marked **Suspiria**'s fall to $4.99. Now you know too."
    );
  });

  it("all_time_low variant 1 leads with a goblin action, not a feeling", () => {
    expect(renderCopy("all_time_low", { title: "Suspiria", price: 4.99 }, 1)).toBe(
      "**Suspiria** drops its guard to $4.99. The goblin strikes."
    );
  });

  it("new_film variant 0 leads with a goblin action, not a feeling", () => {
    expect(renderCopy("new_film", { title: "Raw", year: 2016 }, 0)).toBe(
      "The goblin dragged **Raw** (2016) into the pit by the collar."
    );
  });

  it("left_free variant 1 leads with a goblin action, not a feeling", () => {
    expect(renderCopy("left_free", { title: "Raw", service: "AMC+" }, 1)).toBe(
      "The goblin let **Raw** slip back to AMC+'s vault. Still watching the price."
    );
  });
```

- [ ] **Step 3: Run the tests**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/copy.test.ts`
Expected: PASS, all existing tests plus the 4 new ones (verify the existing-test count in the output didn't drop — confirms no accidental deletion).

- [ ] **Step 4: Commit**

```bash
git add app/lib/feed-events/copy.ts app/tests/feed-events/copy.test.ts
git commit -m "feat(pit-tiers): rewrite 4 copy templates for goblin-action voice rule"
```

---

### Task 4: Design tokens + tier stylesheet

**Files:**
- Modify: `app/app/styles/00-core.css` (add tokens to the base `:root` block, ~line 6–34)
- Create: `app/app/styles/230-pit-tiers.css`
- Modify: `app/app/globals.css` (add the `@import` line)

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties and classes consumed by Task 5's `SystemEventRow` and Task 6's `LandingFeedCard`: `--pit-magenta`, `--pit-magenta-bright`, `--pit-plum-bg`, `--pit-plum-line`, `--pit-plum-wash-start`, `--pit-plum-wash-end`, `--pit-whisper-tint`, `--pit-cream`, `--pit-cream-dim`; classes `.pit-row`, `.pit-whisper`, `.pit-standard`, `.pit-full`, `.pit-kicker`, `.pit-copy`.

- [ ] **Step 1: Add the tokens**

In `app/app/styles/00-core.css`, find the base `:root { ... }` block (starts at line 6, contains `--bone`, `--void`, `--muted`, etc. — ends before the `[data-accent="pink"]` rule around line 52). Add these lines inside that same `:root` block, near the other color tokens (do NOT add them inside any `[data-accent="…"]` rule or the Midsommar theme block further down the file):

```css
  /* FROM THE PIT — fixed brand identity, deliberately NOT theme-switched
     (unlike --accent). The Pit is the product's own voice, distinct from
     whatever accent theme the viewer has picked. */
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

- [ ] **Step 2: Create the tier stylesheet**

Create `app/app/styles/230-pit-tiers.css`:

```css
/* ============================================================
   FROM THE PIT — three-tier system-event treatment
   (spec 2026-07-07-pit-tier-system-design.md)
   ============================================================ */

.pit-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.pit-kicker {
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--pit-magenta-bright);
}

.pit-copy {
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.4;
}

.pit-whisper {
  border-left: 2px solid var(--pit-magenta);
  background: var(--pit-whisper-tint);
  padding: 8px 12px;
}
.pit-whisper .pit-copy {
  color: var(--pit-cream-dim);
}

.pit-standard {
  border-radius: 16px;
  background: linear-gradient(90deg, var(--pit-plum-wash-start), var(--pit-plum-wash-end));
  padding: 12px;
}
.pit-standard .pit-copy {
  color: var(--pit-cream);
}

.pit-full {
  border-radius: 16px;
  background: var(--pit-plum-bg);
  border: 1px solid var(--pit-plum-line);
  padding: 12px;
}
.pit-full .pit-copy {
  color: var(--pit-cream);
}

.pit-price-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 11px;
  color: var(--pit-cream);
  margin-top: 6px;
}
.pit-price-chip .pit-price-old {
  color: var(--pit-cream-dim);
  text-decoration: line-through;
}
```

- [ ] **Step 3: Import the new stylesheet**

In `app/app/globals.css`, add this line immediately after `@import "./styles/220-landing.css";` (the current last import):

```css
@import "./styles/230-pit-tiers.css";
```

- [ ] **Step 4: Verify the build picks it up**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: exit 0 (CSS changes don't affect typecheck, but this confirms nothing else broke from editing these two files).

- [ ] **Step 5: Commit**

```bash
git add app/app/styles/00-core.css app/app/styles/230-pit-tiers.css app/app/globals.css
git commit -m "feat(pit-tiers): pit-* design tokens and tier stylesheet"
```

---

### Task 5: Seal asset wiring + `SystemEventRow` tier rendering + `FeedTabs` wiring

**Files:**
- Modify: `app/components/activity/systemEventParts.tsx` (replace `PitSigil` with `PitSeal`)
- Modify: `app/components/activity/SystemEventRow.tsx`
- Modify: `app/components/FeedTabs.tsx`

**Interfaces:**
- Consumes: `getPitKicker`, `getPitPriceVars`, `getPitBadges`, `PitTier` from `@/lib/feed-events/tier` (Task 1); `resolvePitTiers` from `@/lib/feed-events/pitCadence` (Task 2); CSS classes + the existing `.chip`/`.chip-filled` classes from Task 4.
- Produces: `SystemEventRow` now requires a `tier: PitTier` prop (breaking change to its existing signature — Task 6 does not use this component, so no other caller needs updating besides `FeedTabs`, confirmed by grep in Task 6's context).

**Important:** `app/public/pit-seal.png` is a placeholder you do not have — the project owner provides the real artwork separately. To keep this task's typecheck/tests green without a real file, create a 1×1 placeholder PNG at that path (or any valid PNG) so the `<img>` reference doesn't 404 in manual testing; note in your report that the owner must replace it before this ships to real users. Do NOT attempt to generate seal artwork yourself.

- [ ] **Step 1: Replace `PitSigil` with `PitSeal` in `systemEventParts.tsx`**

In `app/components/activity/systemEventParts.tsx`, replace the entire `PitSigil` function (the last function in the file, currently rendering an SVG "FG" badge) with:

```tsx
// Wax-seal avatar for standard/full tier Pit rows (spec 2026-07-07).
// Flat 40 everywhere on /home; LandingFeedCard uses its own smaller size
// via the same component. Whisper tier renders no avatar at all — callers
// simply omit PitSeal rather than calling it with a tiny size.
export function PitSeal({ size }: { size: number }) {
  return (
    <img
      src="/pit-seal.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, display: "inline-block" }}
    />
  );
}
```

- [ ] **Step 2: Create a placeholder seal asset**

Run (from repo root): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH node -e "require('fs').writeFileSync('app/public/pit-seal.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))"`

This writes a valid, minimal 1×1 transparent PNG so `<PitSeal>` doesn't 404 during manual testing. Verify: `file app/public/pit-seal.png` should report `PNG image data, 1 x 1`.

- [ ] **Step 3: Rewrite `SystemEventRow.tsx` with tier branching**

Replace the full contents of `app/components/activity/SystemEventRow.tsx`:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import type { SystemFeedEvent } from "@/lib/feed-events/types";
import { relativeTime } from "./relativeTime";
import { renderCopyText, PitSeal } from "./systemEventParts";
import { getPitKicker, getPitPriceVars, getPitBadges, type PitTier } from "@/lib/feed-events/tier";

export default function SystemEventRow({ event, tier }: { event: SystemFeedEvent; tier: PitTier }) {
  const kicker = getPitKicker(event, tier);
  const { price, oldPrice } = getPitPriceVars(event);
  const badges = tier === "standard" ? getPitBadges(event) : [];

  const poster = event.film ? (
    <Link prefetch={false} href={`/film/${event.film.id}`}>
      {event.film.artwork_url ? (
        <Image
          src={event.film.artwork_url}
          alt={event.film.title}
          width={40}
          height={60}
          style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }}
        />
      ) : (
        <span style={{ display: "block", width: 40, height: 60, background: "var(--void-3, #1a1a1a)", border: "1px solid var(--void)" }} />
      )}
    </Link>
  ) : null;

  return (
    <div
      data-system-event={event.event_type}
      data-pit-tier={tier}
      className={`pit-row pit-${tier}`}
      style={{ borderBottom: tier === "whisper" ? undefined : "1px solid #2a2a2a", padding: tier === "whisper" ? undefined : "12px 0" }}
    >
      {tier !== "whisper" && <PitSeal size={40} />}
      <div style={{ flex: 1 }}>
        <div className="pit-kicker">FROM THE PIT · {kicker}</div>
        <div className="pit-copy" style={{ marginTop: 2 }}>
          {renderCopyText(event.copy, event.film?.id)}
        </div>
        {tier === "full" && price != null && oldPrice != null && (
          <div className="pit-price-chip">
            <span>${price.toFixed(2)}</span>
            <span className="pit-price-old">was ${oldPrice.toFixed(2)}</span>
          </div>
        )}
        {badges.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {badges.map((b, i) => (
              <span key={i} className={b.filled ? "chip chip-filled" : "chip"}>{b.label}</span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 4 }}>
          <span className="activity-footer-time" style={{ fontFamily: "var(--font-ui)", color: "var(--muted)" }}>
            {relativeTime(event.created_at)}
          </span>
        </div>
      </div>
      {tier !== "whisper" && poster}
    </div>
  );
}
```

Note: the old rendering had a separate `From the Pit` caption span next to the timestamp — that's now folded into the kicker line (`FROM THE PIT · {KICKER}` already says "FROM THE PIT"), so it's removed to avoid saying it twice. Whisper tier omits the poster thumbnail as well as the seal (compact treatment, per spec — the whisper row is deliberately terse).

- [ ] **Step 4: Wire `resolvePitTiers` into `FeedTabs.tsx`**

In `app/components/FeedTabs.tsx`, add the import alongside the existing `composeFeed`/`SystemFeedEvent` imports:

```tsx
import { resolvePitTiers } from "@/lib/feed-events/pitCadence";
```

Find the `composed` `useMemo` (currently ends with `.map(c => c.type === "system" ? { type: "system" as const, event: c.event } : c.item.item);`). Add a second `useMemo` directly after it that resolves tiers from the same composed array:

```tsx
  const pitTiers = useMemo(() => resolvePitTiers(composed), [composed]);
```

Then find where `SystemEventRow` is rendered (`<SystemEventRow key={item.event.id} event={item.event} />`) and pass the resolved tier:

```tsx
              <SystemEventRow key={item.event.id} event={item.event} tier={pitTiers.get(item.event.id) ?? "whisper"} />
```

(The `?? "whisper"` fallback is defensive only — every system item in `composed` is, by construction, also a key in the `pitTiers` map, since `resolvePitTiers` iterates the exact same array.)

- [ ] **Step 5: Typecheck**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add app/components/activity/systemEventParts.tsx app/components/activity/SystemEventRow.tsx app/components/FeedTabs.tsx app/public/pit-seal.png
git commit -m "feat(pit-tiers): PitSeal + tier-branched SystemEventRow, wired in FeedTabs"
```

---

### Task 6: `LandingFeedRow` type widen + `LandingFeedCard` compact tier rendering

**Files:**
- Modify: `app/lib/queries/landing.ts`
- Modify: `app/tests/queries/landing.test.ts`
- Modify: `app/components/LandingFeedCard.tsx`

**Interfaces:**
- Consumes: `getPitTier`, `getPitKicker`, `getPitPriceVars`, `PitTier` from `@/lib/feed-events/tier` (Task 1); `resolvePitTiers` from `@/lib/feed-events/pitCadence` (Task 2); `PitSeal` from `./activity/systemEventParts` (Task 5).
- Produces: `LandingFeedRow`'s "system" variant changes shape (see Step 1) — no other file in the repo reads `LandingFeedRow`'s system branch besides `LandingFeedCard.tsx` and its own test file (confirmed by grep during design).

**Why this task is necessary (not just a nice-to-have):** the current "system" variant only carries `{ copy, film }`, dropping `event_type` and `payload` — without those, tier/kicker/price cannot be resolved on the landing page at all. This is the "smallest change to the event type" the original brief asked to flag before implementing.

- [ ] **Step 1: Widen the type and simplify the merge**

In `app/lib/queries/landing.ts`, replace the "system" branch of the `LandingFeedRow` union (currently lines 46–52):

```ts
  | {
      kind: "system";
      id: string;
      created_at: string;
      copy: string;
      film: LandingFilm | null;
    };
```

with:

```ts
  | {
      kind: "system";
      id: string;
      created_at: string;
      event: SystemFeedEvent;
    };
```

Add the import at the top of the file (alongside the existing `getRecentSystemEvents`/`composeFeed` imports):

```ts
import type { SystemFeedEvent } from "@/lib/feed-events/types";
```

Then replace the `merged` construction (currently):

```ts
  const merged: LandingFeedRow[] = composed.map(c =>
    c.type === "system"
      ? { kind: "system", id: c.event.id, created_at: c.event.created_at, copy: c.event.copy, film: c.event.film }
      : c.item,
  );
```

with:

```ts
  const merged: LandingFeedRow[] = composed.map(c =>
    c.type === "system"
      ? { kind: "system", id: c.event.id, created_at: c.event.created_at, event: c.event }
      : c.item,
  );
```

- [ ] **Step 2: Update the existing test's assertions**

In `app/tests/queries/landing.test.ts`, find these two lines (from the grep during design, at approximately lines 130 and 154):

```ts
    expect(sysRow.copy).toContain("Suspiria");
    expect(sysRow.film?.title).toBe("Suspiria");
```

Change to:

```ts
    expect(sysRow.event.copy).toContain("Suspiria");
    expect(sysRow.event.film?.title).toBe("Suspiria");
```

And:

```ts
    expect(sysRow.film).toBeNull();
```

Change to:

```ts
    expect(sysRow.event.film).toBeNull();
```

- [ ] **Step 3: Run the query test**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/queries/landing.test.ts`
Expected: PASS. If this test is env-gated (`describe.skipIf`) and skips in this environment, that's expected — rely on Step 6's typecheck as the real signal for this step, and note the skip in your report.

- [ ] **Step 4: Rewrite `LandingFeedCard.tsx`**

Replace the full contents of `app/components/LandingFeedCard.tsx`:

```tsx
import Link from "next/link";
import Image from "next/image";
import Avatar from "./Avatar";
import { relativeTime } from "./activity/relativeTime";
import { renderCopyText, PitSeal } from "./activity/systemEventParts";
import { getPitTier, getPitKicker, getPitPriceVars, type PitTier } from "@/lib/feed-events/tier";
import { resolvePitTiers } from "@/lib/feed-events/pitCadence";
import type { LandingFeedRow, LandingFilm } from "@/lib/queries/landing";

// Pre-login landing page feed card. Static server-rendered snapshot of real
// site activity (cached 5 min upstream) — timestamps are as-of cache time.

function Title({ film }: { film: LandingFilm }) {
  return <em className="head">{film.title}</em>;
}

function Sentence({ row }: { row: LandingFeedRow }) {
  switch (row.kind) {
    case "watch_logged":
      return <><b>{row.actor.username}</b> watched <Title film={row.film} /> 👁</>;
    case "review_published":
      return <><b>{row.actor.username}</b> published a review of <Title film={row.film} /></>;
    case "recommendation_sent":
      return <><b>{row.actor.username}</b> pressed <Title film={row.film} /> on <b>{row.recipient.username}</b></>;
    case "watchlist_added":
      return <><b>{row.actor.username}</b> is stalking <Title film={row.film} /></>;
    case "library_added":
      return <><b>{row.actor.username}</b> now owns <Title film={row.film} /></>;
    case "system":
      return <>{renderCopyText(row.event.copy, row.event.film?.id)}</>;
  }
}

function Thumb({ film }: { film: LandingFilm | null }) {
  if (!film) return <span style={{ width: 30, flexShrink: 0 }} />;
  return (
    <Link href={`/film/${film.id}`} prefetch={false} style={{ marginLeft: "auto", flexShrink: 0 }}>
      {film.artwork_url ? (
        <Image
          src={film.artwork_url}
          alt={film.title}
          width={30}
          height={44}
          style={{ width: 30, height: 44, objectFit: "cover", border: "1.5px solid var(--bone)", display: "block" }}
        />
      ) : (
        <span style={{ display: "block", width: 30, height: 44, background: "var(--void-3)", border: "1.5px solid var(--bone)" }} />
      )}
    </Link>
  );
}

export default function LandingFeedCard({ rows }: { rows: LandingFeedRow[] }) {
  const pitTiers = resolvePitTiers(
    rows.map(row => row.kind === "system" ? { type: "system" as const, event: row.event } : { type: "user" as const, item: row }),
  );

  return (
    <div className="landing-feed-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span className="caps" style={{ fontSize: 11, color: "var(--highlight)" }}><span aria-hidden="true">⛧</span> The Feed</span>
        <span className="caps" style={{ fontSize: 9, color: "var(--muted)" }}>live · unhallowed hours</span>
      </div>
      {rows.map(row => {
        if (row.kind !== "system") {
          return (
            <div key={row.id} className="landing-feed-row">
              <Avatar name={row.actor.display_name || row.actor.username} url={row.actor.avatar_url} size={26} />
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, lineHeight: 1.35 }}>
                <Sentence row={row} />
                <div className="caps" style={{ fontSize: 8, color: "var(--muted)", marginTop: 3 }}>
                  {relativeTime(row.created_at)}
                </div>
              </div>
              <Thumb film={row.film} />
            </div>
          );
        }
        const tier: PitTier = pitTiers.get(row.event.id) ?? "whisper";
        const kicker = getPitKicker(row.event, tier);
        const { price, oldPrice } = getPitPriceVars(row.event);
        return (
          <div key={row.id} className={`landing-feed-row pit-${tier}`}>
            {tier !== "whisper" && <PitSeal size={32} />}
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, lineHeight: 1.35, flex: 1 }}>
              <div className="pit-kicker" style={{ fontSize: 8 }}>FROM THE PIT · {kicker}</div>
              <div style={{ marginTop: 2 }}>
                <Sentence row={row} />
                {tier === "full" && price != null && oldPrice != null && (
                  <span style={{ marginLeft: 6, color: "var(--pit-cream-dim)" }}>
                    (${price.toFixed(2)}, was ${oldPrice.toFixed(2)})
                  </span>
                )}
              </div>
              <div className="caps" style={{ fontSize: 8, color: "var(--muted)", marginTop: 3 }}>
                {relativeTime(row.created_at)}
              </div>
            </div>
            <Thumb film={row.event.film} />
          </div>
        );
      })}
    </div>
  );
}
```

Note: unlike `SystemEventRow`, this compact variant folds the full-tier price into the existing single-line copy (via the parenthetical span) rather than a separate chip row, per spec §6 — there's no vertical room in this 5-row card for an extra line. Standard-tier source/FREE/price badges (`getPitBadges`) are deliberately omitted here for the same reason — the card's rows are already terse (`fontSize: 13`, one line of copy); a badge row would break that rhythm. This is a scope decision, not an oversight — flag it if you'd rather have badges here too.

- [ ] **Step 5: Typecheck and full test suite**

Run (from `app/`):
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck` — Expected: exit 0.
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` — Expected: all pass, no new failures.

- [ ] **Step 6: Commit**

```bash
git add app/lib/queries/landing.ts app/tests/queries/landing.test.ts app/components/LandingFeedCard.tsx
git commit -m "feat(pit-tiers): widen LandingFeedRow system variant, tier LandingFeedCard"
```

---

### Task 7: Docs, manual verification, screenshot

**Files:**
- Modify: `CLAUDE.md` (root — "Current state" section)
- Modify: `docs/sub-project-history.md` (append next row — check the current last row number first)

**Interfaces:**
- Consumes: shipped state from Tasks 1–6.
- Produces: session documentation + the Definition of Done's required screenshot.

- [ ] **Step 1: Manual verification (dev server)**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev`

Checklist against the spec's Definition of Done:
- `/home` "all" tab: whisper rows show no avatar, magenta left border, dimmed copy; standard rows show the 40px seal (placeholder image is fine for this check) and a plum wash background; if any `all_time_low` event exists in test data, confirm it renders as a full card with the price-chip line.
- Landing page (signed out, `/`): system rows in the feed card show the compact tier treatment (32px seal for standard/full, no seal for whisper).
- Confirm no visual regression in the surrounding user-activity rows (unchanged by this plan).
- If no real `all_time_low` event exists in whatever DB this dev server points at, this is fine to note as unverified in the report — the unit tests in Tasks 1–2 already cover the full-tier logic exhaustively.

- [ ] **Step 2: Screenshot**

Using the `claude-in-chrome` tools (or equivalent), capture one mobile-width (390px or similar) screenshot of `/home`'s "all" tab showing at least one whisper, one standard, and (if available) one full-tier row interleaved with ordinary user activity rows. Save it and reference the path in your report — this satisfies the Definition of Done's explicit screenshot requirement. If a full-tier example isn't available in test data, screenshot whisper+standard and note the gap.

- [ ] **Step 3: Update root `CLAUDE.md`**

Add a new "Last shipped" paragraph (demoting the prior one to "Previously shipped" per the file's established convention; bump `**Last updated:**`). Content: three-tier FROM THE PIT treatment (whisper/standard/full, `getPitTier`/`getPitKicker` in `app/lib/feed-events/tier.ts`, sliding-window cadence cap `resolvePitTiers` in `pitCadence.ts`, N=8), new seal avatar (`PitSeal`, replacing the "FG" SVG `PitSigil`; real artwork owed — a 1×1 placeholder shipped in this branch), fixed (non-theme-switched) `--pit-*` tokens, 4 copy templates rewritten for the goblin-action voice rule, `LandingFeedRow`'s system variant widened to carry the full event (needed for tier resolution on the landing page). Note the deferred watchlist-relevance follow-up sub-project. Cite spec + plan paths. **Explicitly flag the placeholder seal asset as an open thread** — the real `pit-seal.png` must be dropped in before this is considered visually complete.

- [ ] **Step 4: Append the sub-project-history row**

Check the current last row number in `docs/sub-project-history.md` first (`grep -n "^| [0-9]" docs/sub-project-history.md | tail -1`), then append the next row summarizing this sub-project in the established dense style, citing the spec filename.

- [ ] **Step 5: Final verification**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/sub-project-history.md
git commit -m "docs: record FROM THE PIT three-tier feed treatment ship"
```

**Ship sequence:** app-only change, no migrations — merge, then `npx vercel deploy --prod --yes` from the repo root. **Before shipping to real users, the placeholder `app/public/pit-seal.png` must be replaced with the real seal artwork** — this is a hard blocker on visual completeness even though it's not a code blocker.
