# Mobile Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Film Goblin route usable at 375px viewport width — no horizontal scroll, all content readable, all taps work — via a single 720px breakpoint, CSS custom properties, and a small utility-class set. Target is "usable, not polished."

**Architecture:** Inline styles + `var(--x)` tokens swapped in `@media (max-width: 720px)` in `globals.css`. Small utility classes for intent (`.mobile-only`, `.grid-auto`, `.stackable`, `.h-display`, `.h-head`). Grids use `repeat(auto-fill, minmax(X, 1fr))` so they interpolate between widths. Hero layouts with fixed-column templates use `.stackable` which forces `1fr` below 720. Zero behavior changes; regression signal is the existing automated test suite staying green.

**Tech Stack:** Next.js 15 App Router · CSS custom properties · `@media` queries · inline styles · no new packages

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `app/components/TopNavChrome.tsx` | Already created (uncommitted) | Mobile hamburger + drawer; Task 1 commits |
| `app/components/TopNav.tsx` | Already modified (uncommitted) | Server-component wrapper that passes data to TopNavChrome |
| `app/app/globals.css` | Modify | Responsive tokens, utility classes, typography classes |
| `app/app/auth/signin/page.tsx` | Modify | Tier 1: card padding/shadow/rotation on mobile |
| `app/app/auth/signup/page.tsx` | Modify | Tier 1 |
| `app/app/auth/forgot/page.tsx` | Modify | Tier 1 |
| `app/app/auth/reset/page.tsx` | Modify | Tier 1 |
| `app/app/films/page.tsx` | Modify | Tier 2 — fluid film-poster grid |
| `app/app/lists/page.tsx` | Modify | Tier 2 — fluid list-card grid |
| `app/app/people/page.tsx` | Modify | Tier 2 — fluid profile-card grid |
| `app/app/coven/page.tsx` | Modify | Tier 2 — fluid member grid |
| `app/app/page.tsx` | Modify | Tier 2 — landing grimoires grid + tier 4 hero |
| `app/app/p/[handle]/page.tsx` | Modify | Tier 3 hero + grimoires grid + coven strip |
| `app/app/home/page.tsx` | Modify | Tier 3 — stack 3-column below 720 |
| `app/app/film/[id]/page.tsx` | Modify | Tier 3 — hero stack + poster size |
| `app/app/settings/SettingsForm.tsx` | Modify | Tier 3 — form wraps cleanly |
| `app/app/onboarding/page.tsx` | Modify | Tier 4 — per-chapter grids |
| `app/components/RecommendModal.tsx` | Modify | Tier 5 — modal padding/rotation on mobile |
| `app/components/AvatarEditor.tsx` | Modify | Tier 5 — modal padding on mobile |

---

## Task 1: Commit the in-progress TopNav + globals foundation

**Files (already modified, uncommitted):**
- `app/components/TopNav.tsx`
- `app/components/TopNavChrome.tsx` (new)
- `app/app/globals.css` (partial additions)

- [ ] **Step 1: Verify typecheck + build still pass**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

Expected: both exit 0.

- [ ] **Step 2: Visual verification at 375px**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Open Chrome DevTools → iPhone SE (375×667). Visit http://localhost:3000/home (sign in first if needed). Confirm:
- Hamburger icon appears top-right next to avatar.
- Clicking it opens a vertical drawer with all nav links.
- Links close the drawer when clicked.
- Route change closes the drawer.

- [ ] **Step 3: Commit the existing changes**

```
cd /home/cthulhulemon/film_goblin
git add app/components/TopNavChrome.tsx app/components/TopNav.tsx app/app/globals.css
git commit -m "feat(app): responsive TopNav with mobile hamburger + base responsive utilities

TopNav splits into an async Server Component (data fetch) that feeds a
new TopNavChrome Client Component (interactive shell). Below 720px the
horizontal link list is replaced by a hamburger that opens a vertical
drawer. Body scroll locks while the drawer is open. Route change closes.

globals.css gains .mobile-only / .desktop-only / .mobile-only-flex
helpers plus a @media rule reducing .container / .container-wide
padding from 32px to 16px below 720. Foundation for the remaining
mobile-responsive work."
```

---

## Task 2: Extend globals.css with responsive tokens + classes

**Files:**
- Modify: `app/app/globals.css`

- [ ] **Step 1: Read current `:root` block**

```
grep -n ':root\|@media' /home/cthulhulemon/film_goblin/app/app/globals.css | head -10
```

You'll see `:root` at line ~6 and `@media` blocks added in Task 1 near line ~245 and below `.container-wide`.

- [ ] **Step 2: Append responsive tokens to the main `:root` block**

Find the `:root` block (line ~6) that declares `--bone`, `--void`, etc. At the END of that block (before the closing `}`), add:

```css
  /* Responsive tokens — swapped at @media (max-width: 720px) below. */
  --container-pad: 32px;
  --grid-gap: 20px;
  --card-shadow-offset: 12px;
  --modal-pad: 32px;
  --card-rotation: -0.5deg;
  --film-hero-poster-size: 340px;
```

- [ ] **Step 3: Add a single `@media (max-width: 720px)` override block for the tokens**

Place this block AFTER the existing `[data-accent="..."]` lines (around line ~38) and BEFORE `* { box-sizing: border-box; }`:

```css
@media (max-width: 720px) {
  :root {
    --container-pad: 16px;
    --grid-gap: 14px;
    --card-shadow-offset: 6px;
    --modal-pad: 20px;
    --card-rotation: 0deg;
    --film-hero-poster-size: clamp(200px, 60vw, 280px);
  }
}
```

- [ ] **Step 4: Add `.h-display` and `.h-head` classes**

Find a reasonable spot in globals.css (near the existing `.display` / `.head` / `.eyebrow` utility classes — grep for `\.display \{` to locate). Append:

```css
/* Fluid display typography — use on pages where big headers should scale. */
.h-display {
  font-family: var(--font-display);
  font-size: clamp(48px, 9vw, 112px);
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
```

- [ ] **Step 5: Add `.grid-auto` and `.stackable` utility classes**

Append to the utility-classes section (after the existing `.container / .container-wide` rules):

```css
/* Fluid card grids. Override --grid-min inline to tune the minimum column width. */
.grid-auto {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--grid-min, 180px), 1fr));
  gap: var(--grid-gap);
}

/* Stackable multi-column layouts. Override --stack-template inline for desktop;
   mobile forces 1fr regardless. */
.stackable {
  display: grid;
  grid-template-columns: var(--stack-template, 1fr);
  gap: var(--stack-gap, var(--grid-gap));
}
@media (max-width: 720px) {
  .stackable { grid-template-columns: 1fr !important; }
}
```

- [ ] **Step 6: Verify the existing `.container` / `.container-wide` padding swap from Task 1 uses the token**

Find the existing rule from Task 1:

```css
@media (max-width: 720px) {
  .container, .container-wide { padding: 0 16px; }
}
```

Replace with the variable form so future changes touch one place:

```css
.container { padding: 0 var(--container-pad); }
.container-wide { padding: 0 var(--container-pad); }
```

(Keep the existing `max-width` and `margin: 0 auto` lines on `.container` / `.container-wide`.) The `@media` block above already swaps `--container-pad` to `16px`, so the explicit `@media .container` rule can be deleted.

- [ ] **Step 7: Typecheck + build**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

Both exit 0.

- [ ] **Step 8: Commit**

```
cd /home/cthulhulemon/film_goblin
git add app/app/globals.css
git commit -m "feat(app): responsive design tokens + .grid-auto / .stackable / .h-display classes

Adds CSS custom properties (--container-pad, --grid-gap, --card-shadow-offset,
--modal-pad, --card-rotation, --film-hero-poster-size) with @media
overrides at 720px. Three utility classes: .grid-auto for fluid card
grids, .stackable for multi-column layouts that collapse to 1fr on
mobile, .h-display / .h-head for fluid clamp() typography on big
headers. Foundation for per-route mobile tasks."
```

---

## Task 3: Auth pages — tier 1

**Files:**
- Modify: `app/app/auth/signin/page.tsx`
- Modify: `app/app/auth/signup/page.tsx`
- Modify: `app/app/auth/forgot/page.tsx`
- Modify: `app/app/auth/reset/page.tsx`

Each file has the same card-wrapper shape:

```tsx
<div style={{
  background: "var(--bone)", color: "var(--void)",
  border: "3px solid var(--void)", padding: "40px 32px",
  boxShadow: "12px 12px 0 var(--accent)",
  transform: "rotate(-0.5deg)",
  maxWidth: 420, width: "100%",
}} className="grain-light">
```

Four things change across all four files, mechanically:
1. `padding: "40px 32px"` → `padding: "var(--card-pad, 40px) var(--card-pad-x, 32px)"`. Then we add the vars below the existing `:root` additions — actually, simpler: just inline the values as mobile-reduced fixed pxs. Keep the change local per file. Use `padding: "clamp(24px, 6vw, 40px) clamp(20px, 5vw, 32px)"`.
2. `boxShadow: "12px 12px 0 var(--accent)"` → `boxShadow: "var(--card-shadow-offset) var(--card-shadow-offset) 0 var(--accent)"`.
3. `transform: "rotate(-0.5deg)"` → `transform: "rotate(var(--card-rotation))"`.
4. No change to `maxWidth: 420, width: "100%"` — already responsive.

- [ ] **Step 1: Modify `signin/page.tsx`**

Find the `<div style={{...}} className="grain-light">` wrapper. Replace the three properties above with the clamped / var-driven versions:

```tsx
<div style={{
  background: "var(--bone)", color: "var(--void)",
  border: "3px solid var(--void)",
  padding: "clamp(24px, 6vw, 40px) clamp(20px, 5vw, 32px)",
  boxShadow: "var(--card-shadow-offset) var(--card-shadow-offset) 0 var(--accent)",
  transform: "rotate(var(--card-rotation))",
  maxWidth: 420, width: "100%",
}} className="grain-light">
```

- [ ] **Step 2: Modify `signup/page.tsx`** — same change at the same wrapper div

- [ ] **Step 3: Modify `forgot/page.tsx`** — same change

- [ ] **Step 4: Modify `reset/page.tsx`** — same change

- [ ] **Step 5: Verify at 375px**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Open Chrome DevTools → iPhone SE (375×667). Visit `/auth/signin`, `/auth/signup`, `/auth/forgot`, `/auth/reset`. Confirm on each:
- Card fits within viewport (no horizontal scroll).
- Card has reduced shadow offset and no rotation.
- Padding feels tight but not cramped.
- Buttons are full-width (they were already).

- [ ] **Step 6: Typecheck + build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

Both exit 0.

- [ ] **Step 7: Commit**

```
cd /home/cthulhulemon/film_goblin
git add app/app/auth/signin/page.tsx app/app/auth/signup/page.tsx app/app/auth/forgot/page.tsx app/app/auth/reset/page.tsx
git commit -m "feat(app): auth cards responsive at 375px

All four auth cards (signin, signup, forgot, reset) share the same
wrapper shape. Padding becomes clamp(24px, 6vw, 40px) vertical /
clamp(20px, 5vw, 32px) horizontal. boxShadow offset and rotation
flow through --card-shadow-offset and --card-rotation vars from
globals.css, which shrink to 6px offset and 0deg rotation below 720."
```

---

## Task 4: Browse pages — tier 2 grids

**Files:**
- Modify: `app/app/films/page.tsx`
- Modify: `app/app/lists/page.tsx`
- Modify: `app/app/people/page.tsx`
- Modify: `app/app/coven/page.tsx`

- [ ] **Step 1: `/films`**

Find `gridTemplateColumns: "repeat(6, 1fr)"` and replace with `gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))"`. Also change `gap: 20` to `gap: "var(--grid-gap)"`.

Final style for that grid:
```tsx
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--grid-gap)" }}>
```

- [ ] **Step 2: `/lists`**

Find `gridTemplateColumns: "repeat(4, 1fr)"`. Replace with `gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))"`. Same gap change.

- [ ] **Step 3: `/people`**

Find `gridTemplateColumns: "repeat(4, 1fr)"`. Same treatment: `repeat(auto-fill, minmax(220px, 1fr))`.

- [ ] **Step 4: `/coven` members grid**

Find `gridTemplateColumns: "repeat(4, 1fr)"` (the "Your Coven" members grid, not the pending-invites section which is already `display: grid; gap: 16`). Replace with `repeat(auto-fill, minmax(220px, 1fr))`.

- [ ] **Step 5: Verify at 375px**

Dev server running. Visit each:
- `/films`: ~2 columns of 140px posters. No horizontal scroll.
- `/lists`: 1 column of 220px cards.
- `/people`: 1 column of profile cards.
- `/coven`: pending invites as vertical list (already was), members as 1 column.

- [ ] **Step 6: Typecheck + build**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

- [ ] **Step 7: Commit**

```
cd /home/cthulhulemon/film_goblin
git add app/app/films/page.tsx app/app/lists/page.tsx app/app/people/page.tsx app/app/coven/page.tsx
git commit -m "feat(app): tier-2 browse page grids reflow via auto-fill

/films, /lists, /people, /coven-members all switch from repeat(N, 1fr)
to repeat(auto-fill, minmax(X, 1fr)) — 140px for film posters, 220px
for card-based surfaces. Grids now flow 2-col at 375px (films), 1-col
on text-dense cards, 4-6 col on desktop. Gap threads through --grid-gap
which shrinks to 14px on mobile."
```

---

## Task 5: Landing grimoires grid + /p/[handle] grimoires grid

**Files:**
- Modify: `app/app/page.tsx` (grimoires section only in this task)
- Modify: `app/app/p/[handle]/page.tsx` (grimoires section only)

- [ ] **Step 1: Landing page grimoires**

In `app/app/page.tsx`, find the grimoires section (search for `gridTemplateColumns: "repeat(4, 1fr)"` — there's one). Replace with `repeat(auto-fill, minmax(220px, 1fr))`. Change `gap: 20` to `gap: "var(--grid-gap)"`.

The `transform: rotate([-1.5, 0.5, -0.8, 1.2][i]deg)` on individual grimoire cards stays for aesthetic on desktop. Cards still rotate on mobile — that's actually fine at 1-col because they don't overlap.

- [ ] **Step 2: /p/[handle] grimoires**

Same change in `app/app/p/[handle]/page.tsx`. Find its `gridTemplateColumns: "repeat(4, 1fr)"` (there's exactly one — the "Their Grimoires" section). Replace with `repeat(auto-fill, minmax(220px, 1fr))`, gap to var.

- [ ] **Step 3: Verify at 375px**

Visit `/` (landing) and any `/p/<existing-handle>`. Grimoires grid is 1 column. Cards still have slight rotation.

- [ ] **Step 4: Typecheck + build + commit**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
cd ..
git add app/app/page.tsx 'app/app/p/[handle]/page.tsx'
git commit -m "feat(app): grimoires grids reflow on landing + public profile"
```

---

## Task 6: /home — stack the 3-column layout

**Files:**
- Modify: `app/app/home/page.tsx`

- [ ] **Step 1: Replace the container grid**

Find:
```tsx
<div className="container-wide" style={{ padding: 32, display: "grid", gridTemplateColumns: "220px 1fr 320px", gap: 32 }}>
```

Replace with:
```tsx
<div className="container-wide stackable" style={{ padding: "32px 0", "--stack-template": "220px 1fr 320px", "--stack-gap": "32px" } as React.CSSProperties}>
```

Note the removal of `padding: 32` horizontally — `.container-wide` already handles horizontal padding via `--container-pad`. The `32px 0` keeps vertical padding. The cast `as React.CSSProperties` is required because TypeScript doesn't know about CSS custom property keys.

- [ ] **Step 2: Hide the placeholder asides on mobile**

The two `<aside>` elements are placeholder copy until the Your Ledger + Popular Grimoires widgets land. Hide them below 720 to save space. Add `className="desktop-only"` to each aside:

```tsx
<aside className="desktop-only">
  <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12 }}>Your Ledger</div>
  ...
</aside>
```

(Both of them.)

- [ ] **Step 3: Verify at 375px**

Visit `/home`. Expected: only the `<main>` column visible, full-width. "The Feed" header + FeedTabs flush to the container edges.

- [ ] **Step 4: Typecheck + build + commit**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
cd ..
git add app/app/home/page.tsx
git commit -m "feat(app): /home 3-column stacks + hides placeholder asides on mobile

Uses .stackable with --stack-template: 220px 1fr 320px for desktop;
CSS forces 1fr on mobile. Left and right asides carry .desktop-only
since they're still placeholder copy — revisit when Your Ledger +
Popular Grimoires widgets land."
```

---

## Task 7: /p/[handle] hero stack

**Files:**
- Modify: `app/app/p/[handle]/page.tsx` (hero section only)

- [ ] **Step 1: Replace the hero grid**

Find the hero container:
```tsx
<div className="container-wide" style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 32, alignItems: "center" }}>
```

Replace with:
```tsx
<div className="container-wide stackable" style={{ "--stack-template": "140px 1fr", "--stack-gap": "32px", alignItems: "center" } as React.CSSProperties}>
```

- [ ] **Step 2: Center avatar on mobile**

Below 720 the avatar stacks above the text block. Add a wrapping `<div>` around the `<Avatar>` call so we can center it:

Before:
```tsx
<Avatar name={bundle.profile.display_name ?? bundle.profile.handle} color="var(--accent)" size={140} url={bundle.profile.avatar_url} />
<div>
  ...
```

After:
```tsx
<div style={{ display: "flex", justifyContent: "center" }}>
  <Avatar name={bundle.profile.display_name ?? bundle.profile.handle} color="var(--accent)" size={140} url={bundle.profile.avatar_url} />
</div>
<div>
  ...
```

The `justifyContent: "center"` has no effect on desktop (grid cell is exactly 140px wide); on mobile it centers the avatar in the full-width cell.

- [ ] **Step 3: Verify at 375px**

Visit `/p/<a-handle-that-exists>`. Avatar centered above name/bio. Buttons wrap (they already had `flexWrap` applied implicitly via flex gap; verify).

If buttons overflow, update their container to wrap:
```tsx
<div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
```

- [ ] **Step 4: Typecheck + build + commit**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
cd ..
git add 'app/app/p/[handle]/page.tsx'
git commit -m "feat(app): /p/[handle] hero stacks on mobile"
```

---

## Task 8: /film/[id] hero stack + poster sizing

**Files:**
- Modify: `app/app/film/[id]/page.tsx`

- [ ] **Step 1: Read the hero structure**

```
grep -n 'gridTemplateColumns\|FilmPoster\|size="xl"' /home/cthulhulemon/film_goblin/app/app/film/[id]/page.tsx | head -10
```

You'll find a `"340px 1fr"` grid template and a `FilmPoster` at `size="xl"` (340px).

- [ ] **Step 2: Convert hero to stackable**

Replace:
```tsx
<div className="container-wide" style={{ padding: "48px 32px", display: "grid", gridTemplateColumns: "340px 1fr", gap: 48, alignItems: "start" }}>
```

with:
```tsx
<div className="container-wide stackable" style={{ padding: "48px 0", "--stack-template": "340px 1fr", "--stack-gap": "48px", alignItems: "start" } as React.CSSProperties}>
```

- [ ] **Step 3: Replace the fixed `size="xl"` poster with a responsive wrapper**

The existing poster call looks like:
```tsx
<div style={{ transform: "rotate(-2deg)" }}>
  <FilmPoster film={film as any} size="xl" />
</div>
```

FilmPoster's `size="xl"` is a fixed 340px. On a 375px mobile viewport, that's too big after padding. Swap the wrapper to constrain width:

```tsx
<div style={{ transform: "rotate(var(--card-rotation, -2deg))", maxWidth: "var(--film-hero-poster-size)", margin: "0 auto" }}>
  <FilmPoster film={film as any} size="xl" />
</div>
```

The `--film-hero-poster-size` var is `340px` on desktop and `clamp(200px, 60vw, 280px)` on mobile (set up in Task 2). `maxWidth` clamps the wrapper; `FilmPoster`'s own 340px width is fluid-capped visually because it's inside a wrapper whose max-width shrinks. Actually, FilmPoster renders with hardcoded `width: s.w` which is 340px — that WON'T respect the wrapper. Need a different approach.

Simpler: stop using `size="xl"` on mobile and use `size="lg"` (240px) or let the parent determine size. Instead, wrap in `<div>` with `width: var(--film-hero-poster-size)` and scale via CSS transform OR just use size prop dynamically... the cleanest path:

**Keep `size="xl"`** (340px poster), **wrap the poster in a container with `maxWidth: 100%`** and let `FilmPoster`'s internal `width: s.w` be scaled via inline style. Since FilmPoster sets width in pixels, it won't shrink. So we need an extra wrapper with an `overflow: hidden` or use CSS scale.

Actual cleanest path: make the wrapper `width: 100%, maxWidth: "var(--film-hero-poster-size)", margin: "0 auto"` and CHANGE FilmPoster to accept a `style.width: "100%"` override. FilmPoster already takes a `style` prop — we can pass `style={{ width: "100%", height: "auto", aspectRatio: "2 / 3" }}` to override the internal fixed sizes.

Do this:

```tsx
<div style={{
  transform: "rotate(var(--card-rotation, -2deg))",
  width: "100%",
  maxWidth: "var(--film-hero-poster-size)",
  margin: "0 auto",
}}>
  <FilmPoster
    film={film as any}
    size="xl"
    style={{ width: "100%", height: "auto", aspectRatio: "2 / 3" }}
  />
</div>
```

The `style` override on FilmPoster gets spread onto its outer div (already supported per the component's `style` prop). The fluid sizing overrides the fixed-px defaults.

Note: `aspectRatio: "2 / 3"` preserves poster proportions when height becomes auto. FilmPoster's internal children use percentage-based positioning already (`left: "10%"` etc.), so their rendering stays correct.

- [ ] **Step 4: Verify at 375px**

Visit a film detail page (e.g. `/film/<some-id>`). Poster stacks above metadata, no horizontal scroll, proportions preserved.

- [ ] **Step 5: Typecheck + build + commit**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
cd ..
git add 'app/app/film/[id]/page.tsx'
git commit -m "feat(app): /film/[id] hero stacks and poster sizes fluidly on mobile

Stackable container with --stack-template: 340px 1fr. Poster wrapper
constrains width to --film-hero-poster-size (clamp(200px, 60vw, 280px)
on mobile, 340px on desktop); FilmPoster gets a style override
setting width:100% and aspect-ratio:2/3 so it fills the wrapper
instead of using its hardcoded 340px."
```

---

## Task 9: /settings — wrap avatar row + change-password section

**Files:**
- Modify: `app/app/settings/SettingsForm.tsx`

- [ ] **Step 1: Wrap the avatar row**

Find:
```tsx
<div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 24 }}>
  <Avatar ... />
  <div>
    ...Upload/Replace/Remove buttons...
  </div>
</div>
```

Add `flexWrap: "wrap"`:

```tsx
<div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
```

The Upload/Replace/Remove button row inside should also wrap; find the inner `<div style={{ display: "flex", gap: 8 }}>` and add `flexWrap: "wrap"`.

- [ ] **Step 2: Change-password form width**

The change-password form has `maxWidth: 420`. That's fine on mobile (container padding handles overflow). No edit needed. But confirm by reading.

- [ ] **Step 3: Verify at 375px**

Visit `/settings`. Scroll through:
- Avatar row: avatar + buttons wrap to next line if needed.
- Handle / Display Name / Bio form: inputs stretch full-width.
- Change Password section: inputs stretch full-width; Update button fits.
- Sign out button at bottom: visible, tappable.

- [ ] **Step 4: Typecheck + build + commit**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
cd ..
git add app/app/settings/SettingsForm.tsx
git commit -m "feat(app): /settings avatar row + button row wrap on mobile"
```

---

## Task 10: Landing hero — absolute poster stack + display sizing

**Files:**
- Modify: `app/app/page.tsx`

- [ ] **Step 1: Read the hero section**

```
grep -n 'HERO\|position: "absolute"\|marqueeFilms' /home/cthulhulemon/film_goblin/app/app/page.tsx | head -10
```

Find the HERO section. It has a 2-column grid (`1.4fr 1fr`) with big text on the left and three absolutely-positioned rotated posters on the right.

- [ ] **Step 2: Make the hero grid stackable**

Replace:
```tsx
<div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 40, alignItems: "stretch" }}>
```

with:
```tsx
<div className="stackable" style={{ "--stack-template": "1.4fr 1fr", "--stack-gap": "40px", alignItems: "stretch" } as React.CSSProperties}>
```

- [ ] **Step 3: Make the poster column's positioning static on mobile**

The right column currently:
```tsx
<div style={{ position: "relative", minHeight: 560 }}>
  {marqueeFilms.slice(0, 3).map((f, i) => (
    <div key={f.id} style={{
      position: "absolute",
      top: i === 0 ? 20 : i === 1 ? 180 : "auto",
      ...
    }}>
      ...
    </div>
  ))}
</div>
```

Add a `.hero-posters-col` class + corresponding CSS in globals.css. Rather than a global class, use a nested CSS variable pattern:

Change the outer div to:
```tsx
<div style={{ position: "relative", minHeight: "var(--hero-posters-height, 560px)" }}>
```

Change each inner poster div to use `position: "var(--hero-poster-position, absolute)"`:
```tsx
<div key={f.id} style={{
  position: "var(--hero-poster-position, absolute)" as any,
  top: i === 0 ? 20 : i === 1 ? 180 : "auto",
  right: i === 0 ? 40 : i === 2 ? 0 : "auto",
  left: i === 1 ? 0 : "auto",
  bottom: i === 2 ? 20 : "auto",
  transform: `rotate(${[-4, 3, 5][i]}deg)`,
  marginBottom: "var(--hero-poster-margin, 0)",
}}>
```

CSS `position` doesn't actually accept `var()` in most browsers the way layouts expect — it'll often fall back. A more reliable approach: use a class.

**Revised approach** — add a class to the outer column and style via globals.css media query:

Outer poster column:
```tsx
<div className="hero-posters" style={{ position: "relative", minHeight: 560 }}>
  {marqueeFilms.slice(0, 3).map((f, i) => (
    <div key={f.id} className="hero-poster" style={{
      position: "absolute",
      ...
    }}>
```

Then in `app/app/globals.css`, append:

```css
@media (max-width: 720px) {
  .hero-posters { min-height: auto !important; }
  .hero-posters .hero-poster {
    position: static !important;
    transform: none !important;
    margin: 0 auto 20px !important;
    top: auto !important; right: auto !important; bottom: auto !important; left: auto !important;
  }
}
```

`!important` is unattractive but required to override the inline `position: "absolute"` et al. The alternative — a fully conditional render — is more invasive.

- [ ] **Step 4: Scale the huge display headline**

Find:
```tsx
<h1 className="display" style={{ fontSize: "clamp(80px, 11vw, 180px)", margin: 0, color: "var(--void)", lineHeight: 0.82, letterSpacing: "-0.02em" }}>
```

The current `clamp(80px, 11vw, 180px)` minimum is 80px — at 375px viewport that becomes `max(80, 41px)` = 80px. A 2-line display of 80px Rubik Wet Paint is still about 160px tall and looks fine. But "GOBLIN" in 80px might overflow at 375px — measure: 80px × ~0.6 (display font) × 6 chars ≈ 288px. Fits in 343px content width. OK.

Leave as-is — already clamp-fluid.

The subhead `<p className="head" style={{ fontSize: 30 ... }}>` is 30px fixed. Fine.

- [ ] **Step 5: Verify at 375px**

Visit `/`. Expected:
- FILM / GOBLIN display header fluid-scaled, readable.
- Join The Coven + Browse Films buttons on their own row.
- Posters stack BELOW the text, static-positioned, centered, with normal spacing, no rotation.

- [ ] **Step 6: Typecheck + build + commit**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
cd ..
git add app/app/page.tsx app/app/globals.css
git commit -m "feat(app): landing hero stacks, absolute posters become static on mobile

Hero grid (1.4fr | 1fr) uses .stackable. Right column's min-height and
inner posters' absolute positioning are overridden via .hero-posters /
.hero-poster classes with a globals.css @media rule: min-height auto,
position static, transforms zeroed, natural vertical flow with
centered margin. Functional retreat vs desktop's rotated composition;
polish is deferred per spec's 'usable not polished' target."
```

---

## Task 11: Onboarding — per-chapter mobile grids

**Files:**
- Modify: `app/app/onboarding/page.tsx`

- [ ] **Step 1: Read the onboarding page's chapter grids**

```
grep -n 'gridTemplateColumns' /home/cthulhulemon/film_goblin/app/app/onboarding/page.tsx
```

You'll find (from Section 2's spec):
- Chapter II — genre chips: `repeat(3, 1fr)`
- Chapter III — watchlist films: `repeat(6, 1fr)`
- Chapter IV — coven picker: `repeat(6, 1fr)` (check; may be 4)
- A `repeat(3, 1fr)` around line 625 for something else (check context).

- [ ] **Step 2: Convert each `repeat(N, 1fr)` to `auto-fill minmax()`**

For each occurrence, swap:
```tsx
gridTemplateColumns: "repeat(3, 1fr)"  // → minmax(110px, 1fr)
gridTemplateColumns: "repeat(6, 1fr)"  // → minmax(140px, 1fr) for films, minmax(120px, 1fr) for coven avatars
```

Use these specific substitutions:
- Chapter II genre chips (`repeat(3, 1fr)`): `"repeat(auto-fill, minmax(110px, 1fr))"`.
- Chapter III films (`repeat(6, 1fr)`): `"repeat(auto-fill, minmax(140px, 1fr))"`.
- Chapter IV coven (`repeat(6, 1fr)`): `"repeat(auto-fill, minmax(120px, 1fr))"`.
- The other `repeat(3, 1fr)` around line 625 (check context — likely a stat block for the threshold chapter): `"repeat(auto-fill, minmax(110px, 1fr))"`.

Also swap `gap: 14` to `gap: "var(--grid-gap)"` on each.

- [ ] **Step 3: Verify at 375px**

Walk through onboarding at 375px. Each chapter:
- Chapter I (handle): form input, trivially responsive.
- Chapter II (genres): chips flow 3-col → 3-col at ~375px (110px × 3 = 330, fits).
- Chapter III (films): poster grid flows 2-col.
- Chapter IV (coven): avatar grid flows ~3-col.
- Chapter V (threshold): slider works with touch.

If Chapter V's slider+toggle layout breaks, address it inline: most likely the broadcast toggle row uses a flex layout that needs `flexWrap: "wrap"`.

- [ ] **Step 4: Typecheck + build + commit**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
cd ..
git add app/app/onboarding/page.tsx
git commit -m "feat(app): onboarding chapters grids reflow on mobile

Chapter II (genres), Chapter III (films), Chapter IV (coven) grids all
swap repeat(N, 1fr) for auto-fill minmax(). Mobile flows 2-col films,
3-col chips, ~3-col avatars in a 375px viewport. Gap threads through
--grid-gap."
```

---

## Task 12: Modals — RecommendModal + AvatarEditor padding + rotation

**Files:**
- Modify: `app/components/RecommendModal.tsx`
- Modify: `app/components/AvatarEditor.tsx`

- [ ] **Step 1: RecommendModal**

Find the modal-body div:
```tsx
<div onClick={e => e.stopPropagation()} style={{
  background: "var(--bone)", color: "var(--void)",
  border: "3px solid var(--void)",
  boxShadow: "12px 12px 0 var(--accent)",
  maxWidth: 560, width: "100%",
  padding: "32px 32px 24px",
  transform: "rotate(-0.5deg)",
}} className="grain-light">
```

Replace with:
```tsx
<div onClick={e => e.stopPropagation()} style={{
  background: "var(--bone)", color: "var(--void)",
  border: "3px solid var(--void)",
  boxShadow: "var(--card-shadow-offset) var(--card-shadow-offset) 0 var(--accent)",
  maxWidth: 560, width: "100%",
  padding: "var(--modal-pad) var(--modal-pad) calc(var(--modal-pad) - 8px)",
  transform: "rotate(var(--card-rotation))",
}} className="grain-light">
```

- [ ] **Step 2: AvatarEditor**

Same treatment. Find the equivalent inner div:
```tsx
<div onClick={e => e.stopPropagation()} style={{
  background: "var(--bone)", color: "var(--void)",
  border: "3px solid var(--void)",
  boxShadow: "12px 12px 0 var(--accent)",
  maxWidth: 520, width: "100%", padding: "24px",
}} className="grain-light">
```

Note AvatarEditor doesn't currently have a `rotate` transform — keep it that way (rotating a cropper is disorienting). Just thread the shadow var and modal pad var:

```tsx
<div onClick={e => e.stopPropagation()} style={{
  background: "var(--bone)", color: "var(--void)",
  border: "3px solid var(--void)",
  boxShadow: "var(--card-shadow-offset) var(--card-shadow-offset) 0 var(--accent)",
  maxWidth: 520, width: "100%",
  padding: "var(--modal-pad)",
}} className="grain-light">
```

- [ ] **Step 3: Verify at 375px**

- Sign in, go to a film detail page, click "Recommend To A Coven Member". Modal fits in viewport with reduced shadow + no rotation.
- On settings, click "Upload" under Profile picture, pick an image. AvatarEditor modal fits with reduced shadow + reduced padding.

- [ ] **Step 4: Typecheck + build + commit**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
cd ..
git add app/components/RecommendModal.tsx app/components/AvatarEditor.tsx
git commit -m "feat(app): modals fit 375px viewport

RecommendModal + AvatarEditor box-shadows and padding thread through
--card-shadow-offset and --modal-pad, shrinking below 720. RecommendModal
also loses its -0.5deg rotation on mobile (was causing slight horizontal
overflow)."
```

---

## Task 13: Full-route smoke at 375px + deploy

**Files:** none

- [ ] **Step 1: Run the full test suite**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: every test that passed before this sub-project still passes. Any failure is a signal — investigate before proceeding.

- [ ] **Step 2: Start dev server and walk every route at 375px**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Chrome DevTools → iPhone SE. Visit each route; for each, confirm: no horizontal scroll, all tap targets work, no content clipped.

Routes to walk:
- `/` (signed out): hero + marquee + grimoires.
- `/auth/signin`, `/auth/signup`, `/auth/forgot`, `/auth/reset`.
- Sign in. TopNav hamburger opens/closes.
- `/home`: feed renders, tabs tappable, Refresh button.
- `/films`: 2-col grid, film titles readable.
- `/lists`: 1-col list cards.
- `/people`: 1-col profile cards.
- `/p/<yourself>`: hero stacks, grimoires grid 1-col, coven strip wraps, activity rows readable.
- `/coven`: pending invites (if any) + members grid 1-col.
- `/settings`: avatar row wraps, form inputs full-width, change-password stretches, sign out button visible.
- A `/film/<any-film-id>`: poster stacks, hero metadata wraps, watchlist/recommend buttons wrap.
- Trigger RecommendModal + AvatarEditor — fit viewport.
- `/onboarding` (if you have a user that hasn't completed it): each chapter flows 1-2-3 cols reasonably.

- [ ] **Step 3: Spot-check at 768px (iPad portrait)**

Same DevTools but pick "iPad Mini". Every route should render with desktop layout intact (breakpoint is 720, so 768 falls into desktop tier). Nothing exotic expected; just confirm no surprises.

- [ ] **Step 4: Deploy**

```
cd /home/cthulhulemon/film_goblin
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH vercel --prod
```

Expected: `Aliased: https://film-goblin.vercel.app`.

- [ ] **Step 5: Real-device smoke**

On your actual phone, visit `https://film-goblin.vercel.app`. Walk through:
1. Sign in.
2. Visit `/home`, `/films`, a film detail page, `/p/<your-handle>`.
3. Change something in `/settings`.
4. Use the hamburger menu.

Report any visual flaw that breaks the "usable" bar. Those become backlog items for the future polish sub-project — don't patch inline.

- [ ] **Step 6: No commit**

Smoke is verification only. Verify `git status` is clean.

---

## Self-Review

**Spec coverage:**
- § Architecture (inline styles + CSS vars + 720px breakpoint) → Task 2 ✓
- § Typography clamp() → Task 2 ✓
- § Grids auto-fill → Tasks 4, 5, 11 ✓
- § Per-route strategy — all five tiers covered:
  - Tier 1 (auth pages) → Task 3 ✓
  - Tier 2 (browse grids) → Tasks 4, 5 ✓
  - Tier 3 (multi-column heroes — /home, /p/[handle], /film/[id], /settings) → Tasks 6, 7, 8, 9 ✓
  - Tier 4 (landing + onboarding) → Tasks 10, 11 ✓
  - Tier 5 (components — TopNav + modals) → Tasks 1, 12 ✓
- § Testing strategy (manual 375px + iPad spot-check + real-device) → Task 13 ✓

**Placeholder scan:** no "TBD" / "implement later". Each code block is complete. Commands have expected outcomes.

**Type consistency:** CSS custom property names used consistently across tasks: `--container-pad`, `--grid-gap`, `--card-shadow-offset`, `--modal-pad`, `--card-rotation`, `--film-hero-poster-size`, `--grid-min`, `--stack-template`, `--stack-gap`. Utility class names used consistently: `.mobile-only`, `.desktop-only`, `.grid-auto`, `.stackable`, `.h-display`, `.h-head`.

**Ordering:** Task 1 commits existing WIP before any new edits build on it. Task 2 establishes tokens that every subsequent task references. Tasks 3–12 can technically run in any order after T2 (each is self-contained to its route); the plan orders them by risk (simpler first, riskier landing/onboarding later) so regressions are caught early. Task 13 is the final smoke.

---
