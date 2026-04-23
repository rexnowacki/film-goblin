# Mobile Responsive — Design Spec

**Sub-project:** post-MVP, first roadmap-HIGH item.
**Status:** design.
**Predecessors:** the six production-rebuild sub-projects + auth-polish + profile-pictures.
**Successors:** a mobile polish pass (future spec) restores zine aesthetic at small sizes.

## Goal

Make every Film Goblin route usable on a phone. "Usable" means: no
horizontal scroll on the document, all content readable at a phone
width, all interactive targets tappable, no content hidden behind
overflow. Ends when a user on a 375×667 iPhone SE can sign up, onboard,
browse films, add to watchlist, visit a profile, send a coven invite,
and change settings without zooming, panning, or rotating the device.

## Scope

- **In:** Every user-facing route at viewport widths 320–720px. Layout
  collapses, grids reflow, typography scales, nav becomes a hamburger,
  content stacks. One breakpoint at 720px. Done-ness target is "usable,"
  not "polished" or "pixel-perfect parity."
- **Out:** Zine-aesthetic polish at mobile sizes (rotated marquee
  posters, deliberate per-chapter onboarding layouts, etc.) — its own
  future sub-project. Also out: tablet-specific layer, touch/gesture
  interactions, PWA/mobile-native affordances, performance tuning,
  accessibility deep pass, landscape-phone optimization, dark/light
  mode, print styles, `prefers-reduced-motion` support.

## Architecture

### Styling approach

Inline styles stay the default per the project's existing pattern. Two
augmentations:

1. **CSS custom properties swapped via `@media (max-width: 720px)`.**
   Values that need to change at mobile — container padding, grid gap,
   column minima — get declared in `:root` in `app/app/globals.css` and
   swapped in the media block. Inline styles reference the variable:
   `padding: "0 var(--container-pad)"`. Per-element changes are one-line.

2. **Utility classes for semantic intent that doesn't belong inline.**
   Small named set in `globals.css`:
   - `.mobile-only` / `.desktop-only` — show/hide by breakpoint.
   - `.grid-auto` — `grid-template-columns: repeat(auto-fill, minmax(var(--grid-min, 180px), 1fr))`.
   - `.stackable` — grid that forces `1fr` at mobile regardless of
     desktop template.
   - `.h-display` / `.h-head` — shared clamp() typography for big
     headers so we don't edit every call site individually.

No Tailwind, no CSS-in-JS library, no rewrite. Components keep their
`style={{...}}` shape.

### Breakpoint

Single breakpoint: **720px**. Below = mobile, above = desktop. No
intermediate tablet tier. `repeat(auto-fill, minmax(...))` grids
interpolate naturally between widths, so most layouts don't need an
explicit tablet case.

### Typography

Display and head fonts use `clamp(mobile-min, fluid-vw, desktop-max)`
everywhere — e.g., `font-size: clamp(56px, 10vw, 112px)` for the
archive "Every Film, Indexed" headline. Small UI text (11–14px eyebrows,
`.caps` labels, form field text) stays at fixed px — it's already at
mobile-readable sizes.

Implementation: extract the big-header sizing into `.h-display` and
`.h-head` classes in globals.css. Existing call sites swap
`style={{ fontSize: 112 }}` for `className="h-display"` or `className="h-head"`.

### Grids

`repeat(N, 1fr)` → `repeat(auto-fill, minmax(X, 1fr))` across all grid
pages. Minimum width chosen per surface:
- Film poster grids: `minmax(140px, 1fr)` — 2 cols at 375px, 4–6 at
  desktop.
- Profile/list card grids: `minmax(220px, 1fr)` — 1 col at 375px,
  3–4 at desktop.
- Coven member cards: `minmax(220px, 1fr)`.

Multi-column hero layouts (`/p/[handle]`, `/film/[id]`, `/home`) use
`.stackable` class with an inline `--stack-template` var. Below 720,
CSS forces `grid-template-columns: 1fr !important`.

## Per-route strategy

### Tier 1 — trivial

**`/auth/signin`, `/auth/signup`, `/auth/forgot`, `/auth/reset`.** Centered
420px-max-width cards. Container padding already shrinks via the
`.container-wide` media rule. Tighten the card's own padding (40px →
24px below 720), reduce `boxShadow` offset (`12px 12px 0 var(--accent)`
→ `6px 6px 0 var(--accent)`), consider dropping the `-0.5deg` rotation
on the card (adds overflow). Buttons are already full-width; inputs too.

### Tier 2 — grid pages

**`/films`** — 6-column → `auto-fill minmax(140px, 1fr)`.
**`/lists`**, **`/people`**, **`/coven`** — 4-column → `auto-fill minmax(220px, 1fr)`.
Landing page "Chapter II · Grimoires" and `/p/[handle]` "Their Grimoires"
— same `minmax(220px, 1fr)` treatment.

### Tier 3 — multi-column hero layouts

**`/home`.** `220px | 1fr | 320px` → `.stackable` with
`--stack-template: 220px 1fr 320px` on desktop. Mobile stacks. Decision
during implementation: hide the left "Your Ledger" and right "Popular
Grimoires" asides on mobile entirely (they're placeholders; the main
feed is what matters). Lean toward hide for now, bring back when the
widgets themselves land.

**`/p/[handle]` hero.** `140px | 1fr` → stacks to centered avatar above
name/bio/buttons. Avatar size stays at 140 (fits 375px with margin).

**`/film/[id]` hero.** `340px | 1fr` → stacks. Below 720, poster gets a
size reduction via `--film-hero-poster-size` var (340px → 220px, or
`clamp(220px, 60vw, 340px)`).

**`/settings`.** Single form column already. Just verify inputs stretch,
Change-password section's inline layout wraps, avatar+upload row wraps
on narrow widths.

### Tier 4 — custom

**Landing hero (absolute-positioned marquee posters).** Below 720,
switch the right column's `position: absolute` posters to
`position: static`, drop rotations, stack vertically. The column's
`min-height: 560` drops to `auto`. The rotated transform gets zeroed
via a mobile-specific inline style conditional on a media-queried
CSS var: `transform: var(--marquee-rotation, rotate(-4deg))`, with
`--marquee-rotation: none` at mobile.

**Landing marquee strip.** Horizontal-scroll animation, already
flow-friendly at any width. Verify container padding reduces and the
"Chapter I" eyebrow + display header wrap.

**`/onboarding`.** Five chapters, each its own layout. Per-chapter
mobile treatment:
- Chapter I (handle input): already form-like, trivial.
- Chapter II (genre chips): chip grid uses `repeat(3, 1fr)` in a
  980px container → swap to `repeat(auto-fill, minmax(110px, 1fr))`.
- Chapter III (watchlist films): 6-col → `auto-fill minmax(140px, 1fr)`.
- Chapter IV (coven picker): 6-col avatars → `auto-fill minmax(120px, 1fr)`.
- Chapter V (threshold slider): slider + broadcast toggle. Native
  `<input type="range">` is already touch-friendly.

### Tier 5 — components

**`TopNav` / `TopNavChrome`** — hamburger + drawer. Already scaffolded in
the uncommitted T1 work; just commit and verify.

**`FilmPoster`** — fixed px variants (`xs` 54, `sm` 88, `md` 160, `lg`
240, `xl` 340). No component change. Callers' grid changes do the
work: a `md` poster at 160px fits a 375px 2-col grid (`(375 - 16*2 - gap) / 2 = ~160`).

**`RecommendModal`, `AvatarEditor`** — centered modals with
`maxWidth: 560` / `520` and `padding: 20/24`. Drop the `-0.5deg`
rotation on mobile (the transform adds a few px of horizontal
overflow). Shrink modal padding from 32 → 20 below 720.

## globals.css additions

Consolidating the in-progress changes + new additions:

```css
/* Breakpoint-responsive tokens */
:root {
  --container-pad: 32px;
  --grid-gap: 20px;
  --grid-gap-mobile: 14px;
  --card-shadow-offset: 12px;
  --modal-pad: 32px;
  --card-rotation: -0.5deg;
}
@media (max-width: 720px) {
  :root {
    --container-pad: 16px;
    --grid-gap: 14px;
    --card-shadow-offset: 6px;
    --modal-pad: 20px;
    --card-rotation: 0deg;
  }
}

/* Utility classes */
.mobile-only { display: none; }
.desktop-only { display: initial; }
@media (max-width: 720px) {
  .mobile-only { display: initial; }
  .desktop-only { display: none !important; }
}

.grid-auto {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--grid-min, 180px), 1fr));
  gap: var(--grid-gap);
}

.stackable {
  display: grid;
  grid-template-columns: var(--stack-template, 1fr);
  gap: var(--stack-gap, 20px);
}
@media (max-width: 720px) {
  .stackable { grid-template-columns: 1fr !important; }
}

/* Fluid display typography */
.h-display {
  font-family: var(--font-display);
  font-size: clamp(56px, 10vw, 112px);
  line-height: 0.88;
  letter-spacing: -0.02em;
  margin: 0;
}
.h-head {
  font-family: var(--font-head);
  font-size: clamp(32px, 5vw, 72px);
  line-height: 1;
  margin: 0;
}

/* Container padding swap (already in-progress) */
@media (max-width: 720px) {
  .container, .container-wide { padding: 0 16px; }
}
```

Existing files reference these via `className` or inline
`style={{ padding: "0 var(--container-pad)" }}`.

## Testing

No new automated tests. Responsive work is visual; unit tests on CSS
changes catch nothing real.

**Manual verification per route** — iPhone SE emulation (375×667) in
Chrome DevTools, then iPad (768×1024), then real device at the end:

1. `document.scrollingElement.scrollWidth === window.innerWidth` (no
   horizontal scroll).
2. All interactive targets ≥ 40px tall.
3. No content clipped or hidden.
4. Typography readable (≥14px effective for body text; ≥11px for
   labels).

**Regression signal:** existing automated tests keep passing. A broken
test while doing CSS work means something reached into behavior.

**Real-device smoke at deploy:** walk the full signup → onboarding →
watchlist → film detail → coven flow on an actual phone.

## Deliverable

One sub-project, landed incrementally. Implementation plan will break
into ~12–15 task-per-route commits so each is reviewable in isolation
and mobile improvements ship progressively rather than as one giant PR.

The uncommitted TopNav mobile nav + partial globals.css additions get
committed as Task 1 — they align with all design decisions made here.

Estimated total: 8–10 hours (revised down from 10–12 since the
architecture decisions are now locked and much of the work is
mechanical).

## Out of scope — explicit

- Mobile polish pass (zine aesthetic at small sizes) — future spec.
- Tablet-specific tier — add later if specific pages need it.
- Touch/gesture interactions (swipe, pinch, pull-to-refresh).
- PWA manifest + service worker + install prompts.
- Performance tuning for mobile networks (lazy loading beyond
  Next.js defaults, font subsetting, CLS minimization).
- Accessibility deep pass (WCAG AA) — separate sub-project.
- Landscape phone optimization.
- Dark/light mode toggle.
- Print stylesheets.
- `prefers-reduced-motion` respect — backlog.
