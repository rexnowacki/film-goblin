# Mobile Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap between Tier-A "usable on a phone" and "designed for a phone" on feed, film detail, and settings via seven targeted CSS/markup fixes.

**Architecture:** CSS-driven changes, no new components. All edits stay within `app/` (Next.js App Router). Font family switches, clamp retunes, markup reordering, a reusable custom-checkbox class. Zero runtime logic touched.

**Tech Stack:** Next.js 15 App Router, TypeScript, CSS custom properties, single 720px breakpoint.

**Spec:** `docs/superpowers/specs/2026-04-23-mobile-polish-design.md`.

---

## Preamble: worktree setup

**Before starting any task:** create a worktree at `.worktrees/polish` on branch `feat/mobile-polish` so work is isolated from master.

```bash
cd /home/cthulhulemon/film_goblin
git worktree add .worktrees/polish -b feat/mobile-polish master
cd .worktrees/polish
```

All file paths below are relative to the worktree root (`/home/cthulhulemon/film_goblin/.worktrees/polish`).

Node 20 is required. Before running `npm run typecheck` / `npm run build` / `npm run dev`, either `nvm use 20` in the shell or prefix with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`.

---

## File structure

| File | Role |
|------|------|
| `app/app/globals.css` | Token + class definitions. Owns `.h-display` clamp, `--film-hero-poster-size` mobile clamp, new `.check-zine` custom-checkbox class, font-usage + secondary-button rule comments. |
| `app/app/home/page.tsx` | "The Feed" heading markup. Switches inline style for `.h-display` class. |
| `app/components/FeedTabs.tsx` | Tab strip. Refresh button removed. |
| `app/app/film/[id]/page.tsx` | Film detail hero. Title font swap + clamp change + mobile stack-order reorder. |
| `app/components/SettingsForm.tsx` | Settings form. Checkbox markup swap + input/textarea border bump. |

No new files. No deletions.

---

## Task 1: Globals — `.h-display` clamp + font-usage comment

**Files:**
- Modify: `app/app/globals.css:155-162`

- [ ] **Step 1: Read the current `.h-display` block**

Open `app/app/globals.css` and locate:

```css
/* Fluid display typography — use on pages where big headers should scale. */
.h-display {
  font-family: var(--font-display);
  font-size: clamp(48px, 9vw, 112px);
  line-height: 0.88;
  letter-spacing: -0.02em;
  margin: 0;
}
```

- [ ] **Step 2: Replace with ratcheted clamp + usage comment**

Replace the block above with:

```css
/* Fluid display typography — use on pages where big headers should scale.
   Font-usage rule: Rubik Wet Paint (var(--font-display)) is for page
   titles and chrome — static page headers ("Settings", "The Feed"),
   landing wordmark. DM Serif Display (var(--font-head)) is for content
   titles — film titles, review titles, list titles. Film titles
   rendered in Rubik Wet Paint blob at small sizes (illegible "e"/"n"),
   so dynamic content uses the head face. */
.h-display {
  font-family: var(--font-display);
  font-size: clamp(36px, 7vw, 112px);
  line-height: 0.88;
  letter-spacing: -0.02em;
  margin: 0;
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no output (tsc passes).

- [ ] **Step 4: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/polish
git add app/app/globals.css
git commit -m "style(mobile): ratchet .h-display floor to 36px + document font-usage rule"
```

---

## Task 2: Globals — film-hero poster size + secondary-button rule comment

**Files:**
- Modify: `app/app/globals.css:48-57` (mobile `:root` block)
- Modify: `app/app/globals.css:170` (comment just above `.btn`)

- [ ] **Step 1: Locate the mobile `:root` block**

In `app/app/globals.css`, find:

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

- [ ] **Step 2: Ratchet the poster clamp**

Replace the `--film-hero-poster-size` line with:

```css
    --film-hero-poster-size: clamp(160px, 50vw, 240px);
```

- [ ] **Step 3: Add secondary-button rule comment above `.btn`**

Find:

```css
/* ---------- buttons ---------- */
.btn {
```

Replace with:

```css
/* ---------- buttons ----------
   Secondary-button rule:
   - Destructive actions (Remove, Sign out, Leave, Desanctify): 2px solid var(--blood) outline, color var(--blood).
   - Non-destructive actions (Replace, Cancel): 2px solid var(--bone) outline, color var(--bone).
   - Primary CTAs: .btn family (accent-filled). */
.btn {
```

- [ ] **Step 4: Run typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/polish
git add app/app/globals.css
git commit -m "style(mobile): shrink film-hero poster clamp + document secondary-button rule"
```

---

## Task 3: Globals — custom `.check-zine` checkbox class

**Files:**
- Modify: `app/app/globals.css` (append a new class block near the other form/type utilities)

- [ ] **Step 1: Locate the insertion point**

In `app/app/globals.css`, find the `/* ---------- chips / badges ---------- */` block (near line 205). We'll insert a new block immediately before it.

- [ ] **Step 2: Insert the `.check-zine` class**

Add this block **before** `/* ---------- chips / badges ---------- */`:

```css
/* ---------- custom checkbox (zine palette) ----------
   Usage: wrap a native <input type="checkbox"> in <label class="check-zine">.
   The native input stays in the accessibility tree (keyboard focus, label
   association, screen readers). The .check-zine__box span renders the
   visual square + tick; the native input is visually hidden but tabbable. */
.check-zine {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}
.check-zine input[type="checkbox"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
.check-zine__box {
  display: inline-block;
  width: 18px;
  height: 18px;
  background: var(--bone);
  border: 2px solid var(--void);
  position: relative;
  flex-shrink: 0;
}
.check-zine__box::after {
  content: "";
  position: absolute;
  left: 3px;
  top: 0px;
  width: 6px;
  height: 11px;
  border: solid var(--accent);
  border-width: 0 3px 3px 0;
  transform: rotate(45deg);
  opacity: 0;
  transition: opacity 80ms ease;
}
.check-zine input[type="checkbox"]:checked + .check-zine__box::after {
  opacity: 1;
}
.check-zine input[type="checkbox"]:focus-visible + .check-zine__box {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/polish
git add app/app/globals.css
git commit -m "style(mobile): add .check-zine custom checkbox class"
```

---

## Task 4: Home — "The Feed" heading uses `.h-display`

**Files:**
- Modify: `app/app/home/page.tsx:23`

- [ ] **Step 1: Locate the heading**

In `app/app/home/page.tsx`, line 23 currently reads:

```tsx
          <h2 className="display" style={{ fontSize: 42, margin: "0 0 16px" }}>The Feed</h2>
```

- [ ] **Step 2: Replace with `.h-display`**

Change line 23 to:

```tsx
          <h2 className="h-display" style={{ marginBottom: 16 }}>The Feed</h2>
```

- [ ] **Step 3: Run typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no output.

- [ ] **Step 4: Dev-server sanity (optional — spot check)**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Open http://localhost:3000/home. In devtools, set viewport to 375×667. Confirm "The Feed" no longer dominates the viewport. Kill the dev server with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/polish
git add app/app/home/page.tsx
git commit -m "style(mobile): home feed uses .h-display instead of inline 42px"
```

---

## Task 5: Feed — remove Refresh button

**Files:**
- Modify: `app/components/FeedTabs.tsx:53-55`

- [ ] **Step 1: Locate the Refresh button**

In `app/components/FeedTabs.tsx`, find lines 53-55:

```tsx
        <button onClick={() => router.refresh()} className="caps" style={{ marginLeft: "auto", background: "transparent", color: "var(--muted)", border: "1px solid #333", padding: "6px 12px", fontSize: 10, cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700 }}>
          Refresh
        </button>
```

- [ ] **Step 2: Delete the Refresh button entirely**

Remove lines 53-55. The tab row's outer `<div>` should now contain only the `.map(t => <button …>)` block.

After deletion, lines 43-52 should look like:

```tsx
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
        {(["all", "reviews", "recs", "lists"] as Tab[]).map(t => (
          <button key={t} onClick={() => pickTab(t)} className="caps" style={{
            background: tab === t ? "var(--accent)" : "transparent",
            color: tab === t ? "var(--accent-ink)" : "var(--muted)",
            border: "1px solid " + (tab === t ? "var(--accent)" : "#333"),
            padding: "6px 12px", fontSize: 10, cursor: "pointer",
            fontFamily: "var(--font-ui)", fontWeight: 700,
          }}>{t}</button>
        ))}
      </div>
```

The existing `window focus → router.refresh()` effect at lines 27-31 stays untouched — that's what now handles refresh.

- [ ] **Step 3: Run typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/polish
git add app/components/FeedTabs.tsx
git commit -m "feat(mobile): remove Refresh from FeedTabs (focus-refresh handles it)"
```

---

## Task 6: Film detail — title font + clamp

**Files:**
- Modify: `app/app/film/[id]/page.tsx:51-53`

- [ ] **Step 1: Locate the film title**

In `app/app/film/[id]/page.tsx`, find:

```tsx
            <h1 className="display" style={{ fontSize: "clamp(72px, 8vw, 128px)", margin: 0, lineHeight: 0.86 }}>
              {film.title}
            </h1>
```

- [ ] **Step 2: Swap font + clamp**

Replace with:

```tsx
            <h1 className="head" style={{ fontSize: "clamp(40px, 10vw, 96px)", margin: 0, lineHeight: 0.92 }}>
              {film.title}
            </h1>
```

Notes: `.head` is the existing DM Serif Display class (var(--font-head), line-height 1.02). We override line-height to 0.92 to match the tighter display feel at large sizes. The `className` switch is the font swap; the clamp change does the mobile shrink.

- [ ] **Step 3: Run typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/polish
git add app/app/film/[id]/page.tsx
git commit -m "feat(mobile): film title uses DM Serif Display + smaller clamp"
```

---

## Task 7: Film detail — mobile stack reorder

**Files:**
- Modify: `app/app/film/[id]/page.tsx:47-74`

**Approach:** on desktop (>720px) the layout is already a two-column grid (`.stackable` with `--stack-template: 340px 1fr`). On mobile it collapses to a single column via existing `.stackable { grid-template-columns: 1fr !important; }`. Today the children render in DOM order: poster → text block. Inside the text block, the render order is: eyebrow → title → metadata → synopsis → buttons.

We need mobile order: poster → title → metadata → buttons → synopsis (eyebrow can stay with title; reviewer didn't flag it).

Solution: on mobile, set `display: flex; flex-direction: column;` on the inner text `<div>` and use CSS `order` to promote the buttons above the synopsis paragraph. Desktop keeps default block flow since the grid column only collapses to flex at ≤720px.

This does mean the inner text block becomes a flex container at all widths — that's fine, it's still a single column visually either way, and `order` only fires when we declare it. Simpler than duplicating the markup.

- [ ] **Step 1: Locate the inner text block**

In `app/app/film/[id]/page.tsx`, find the inner `<div>` starting at line 47 (the one containing eyebrow / h1 / metadata / p / buttons). It currently has no `className` and no `style`.

- [ ] **Step 2: Add a className hook for the reorder**

Replace line 47's opening `<div>` with:

```tsx
          <div className="film-hero-text">
```

- [ ] **Step 3: Add the `.film-hero-text` reorder rule in globals.css**

Open `app/app/globals.css`. Find the existing film-hero override block near the bottom of the file:

```css
/* Landing hero posters — on mobile, drop the absolute positioning and rotations. */
@media (max-width: 720px) {
  .hero-posters { min-height: auto !important; }
  .hero-posters .hero-poster {
    position: static !important;
    transform: none !important;
    margin: 0 auto 20px !important;
    top: auto !important;
    right: auto !important;
    bottom: auto !important;
    left: auto !important;
  }
}
```

Add **below** that block:

```css
/* Film detail hero text — on mobile, promote action buttons above the
   synopsis so watchlist + recommend fit above the fold at 375×667.
   Desktop order is unchanged (buttons land below synopsis, which is
   acceptable on a two-column layout with plenty of vertical room). */
@media (max-width: 720px) {
  .film-hero-text {
    display: flex;
    flex-direction: column;
  }
  .film-hero-text > .eyebrow { order: 1; }
  .film-hero-text > h1 { order: 2; }
  .film-hero-text > .caps-row { order: 3; }
  .film-hero-text > .hero-actions { order: 4; }
  .film-hero-text > p { order: 5; }
}
```

- [ ] **Step 4: Tag the metadata row and button row with class hooks**

In `app/app/film/[id]/page.tsx`, line 54 currently:

```tsx
            <div style={{ display: "flex", gap: 18, marginTop: 16, flexWrap: "wrap" }} className="caps">
```

Change to:

```tsx
            <div style={{ display: "flex", gap: 18, marginTop: 16, flexWrap: "wrap" }} className="caps caps-row">
```

And line 64:

```tsx
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
```

Change to:

```tsx
            <div className="hero-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
```

- [ ] **Step 5: Run typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no output.

- [ ] **Step 6: Dev-server sanity check**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Open any film detail URL (e.g. http://localhost:3000/film/<id> — grab an id from `/films`). At 375×667 viewport, confirm:
- Poster appears at the top, smaller than before.
- Title renders in DM Serif Display (not dripping).
- Metadata row (DIR / YEAR / MIN) is below the title.
- Watchlist + Recommend buttons appear above the synopsis paragraph.
- All of poster + title + metadata + buttons fit in the first 667px (may be tight with nav; aim for buttons at least partly visible).

At 1280px viewport, confirm desktop layout is unchanged (two-column, synopsis above buttons).

Kill dev server.

- [ ] **Step 7: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/polish
git add app/app/globals.css app/app/film/[id]/page.tsx
git commit -m "feat(mobile): film detail mobile stack reorder (actions above synopsis)"
```

---

## Task 8: Settings — replace two native checkboxes with `.check-zine`

**Files:**
- Modify: `app/components/SettingsForm.tsx:172-179`

- [ ] **Step 1: Locate the two checkbox labels**

In `app/components/SettingsForm.tsx`, find lines 172-179:

```tsx
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" name="broadcast" defaultChecked={profile.broadcast_watchlist_adds} />
        <span className="caps" style={{ fontSize: 11 }}>Broadcast watchlist adds to followers</span>
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" name="email_notifications" defaultChecked={profile.email_notifications_enabled} />
        <span className="caps" style={{ fontSize: 11 }}>Email me when a watchlist film drops in price</span>
      </label>
```

- [ ] **Step 2: Replace with `.check-zine` markup**

Replace those 8 lines with:

```tsx
      <label className="check-zine">
        <input type="checkbox" name="broadcast" defaultChecked={profile.broadcast_watchlist_adds} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Broadcast watchlist adds to followers</span>
      </label>
      <label className="check-zine">
        <input type="checkbox" name="email_notifications" defaultChecked={profile.email_notifications_enabled} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Email me when a watchlist film drops in price</span>
      </label>
```

- [ ] **Step 3: Run typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no output.

- [ ] **Step 4: Dev-server sanity check**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Open http://localhost:3000/settings (must be signed in). Confirm:
- Checkboxes render as bone-colored squares with void borders (not browser-default blue).
- Tick appears in accent pink when checked.
- Clicking the label toggles the checkbox (native behavior preserved).
- Tabbing to the checkbox shows an accent-pink focus ring.
- Save still works — toggle one, click Save, reload, state persists.

Kill dev server.

- [ ] **Step 5: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/polish
git add app/components/SettingsForm.tsx
git commit -m "feat(mobile): settings checkboxes use .check-zine custom styling"
```

---

## Task 9: Settings — bump input/textarea borders

**Files:**
- Modify: `app/components/SettingsForm.tsx` (six occurrences — Handle, Display Name, Bio, Current password, New password, Confirm new password)

- [ ] **Step 1: Identify the border pattern to replace**

Every `<input>` and `<textarea>` on the form currently has:

```
border: "1px solid #333"
```

as part of its inline style. Six occurrences total (lines 162, 166, 170, 203, 209, 214).

- [ ] **Step 2: Replace all six borders**

Use an editor find-and-replace (or `sed` preview first) scoped to `app/components/SettingsForm.tsx`:

Replace every `border: "1px solid #333"` with:

```
border: "2px solid var(--muted)"
```

Verify the count afterward:

```bash
grep -c 'border: "2px solid var(--muted)"' app/components/SettingsForm.tsx
```

Expected: `6`.

```bash
grep -c 'border: "1px solid #333"' app/components/SettingsForm.tsx
```

Expected: `0`.

Note: leave the other `border: "1px solid #333"` occurrences alone if any exist — the grep above scopes to this file only, and all six matches are the input/textarea styles.

- [ ] **Step 3: Run typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no output.

- [ ] **Step 4: Dev-server sanity check**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Open http://localhost:3000/settings. Confirm Handle, Display Name, Bio, and the three password fields have visibly readable borders (warm gray, 2px thick, cleanly separated from the void-2 fill).

Kill dev server.

- [ ] **Step 5: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/polish
git add app/components/SettingsForm.tsx
git commit -m "style(mobile): bump settings input borders to 2px muted"
```

---

## Task 10: Full-route smoke + deploy

**Files:** none — verification only.

- [ ] **Step 1: Typecheck + build**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/polish/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

Expected: typecheck silent; build succeeds.

- [ ] **Step 2: Local dev smoke at 375×667**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/polish/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Chrome devtools → device toolbar → iPhone SE (375×667). Walk through:

- `/` (landing) — display type still reads dramatic, not cramped.
- `/home` — "The Feed" shrunk, tab strip one line, no Refresh button, feed rows immediately visible.
- `/films` — grid reflows. `.h-display` page title smaller than before, still readable.
- `/film/<id>` — poster ~50vw, title in DM Serif (legible), metadata row tight, watchlist + recommend buttons visible without scroll, synopsis lives below.
- `/p/<handle>` — hero stacks, no regressions.
- `/settings` — checkboxes zine-styled, inputs have visible 2px borders, Save + Sign out still work.
- `/people`, `/lists`, `/coven` — grids/pages reflow, no regressions.

Also sanity-check desktop at 1440px: landing display still dominant, film detail still two-column with synopsis above buttons, settings checkboxes look correct.

Kill dev server.

- [ ] **Step 3: Deploy preview to Vercel**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/polish
mkdir -p .vercel
cp /home/cthulhulemon/film_goblin/.vercel/project.json .vercel/
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel deploy --prod --yes 2>&1 | tee /tmp/polish-deploy.log
```

Capture the deploy URL from the log (will look like `https://film-goblin-<hash>-skulldrinker.vercel.app`).

- [ ] **Step 4: iPhone smoke on deploy URL**

Open the deploy URL in Safari on a real iPhone. Walk through the same routes as Step 2. Confirm no regressions vs. the current master deploy. Pay special attention to:

- Film detail: do action buttons actually fit above the fold on your physical viewport?
- Settings: do the custom checkboxes render correctly on iOS Safari (no layout shift, focus ring works)?

- [ ] **Step 5: Finalize**

Invoke `superpowers:finishing-a-development-branch` to merge `feat/mobile-polish` to master.

---

## Execution order

Tasks 1-3 all modify `globals.css` and can either be done serially (recommended, each commits cleanly) or batched if executing inline. Tasks 4-9 each modify their own file and can be done in any order after globals. Task 10 is always last.

Subagent-driven execution: dispatch tasks in order 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. No dependencies between 4-9, but ordering them by surface (home → feed → film detail → settings) keeps the review narrative clean.

---

## Success criteria

On a 375×667 viewport:
- `/home`: "The Feed" header + full tab strip + first feed row visible in the first viewport.
- `/film/[id]`: poster + title + metadata + watchlist + recommend visible without scrolling; synopsis reads below.
- `/settings`: bone-colored custom checkboxes, 2px muted input borders, secondary buttons follow the destructive-vs-non rule.
- Zero horizontal document scroll retained from Tier-A.

On desktop (1280+):
- No visible regression. Film detail stays two-column with synopsis above buttons. Landing + browse display headers still dramatic.
