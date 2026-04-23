# Mobile Polish — Follow-up Spec

**Status:** queued. Kicks off after the mobile-responsive sub-project (branch `feat/mobile`) merges to master.
**Predecessor:** `2026-04-23-mobile-responsive-design.md` (Tier-A "usable not polished" pass).
**Relation to roadmap:** this is the "mobile polish pass (zine aesthetic at small sizes)" that the responsive spec flagged as out-of-scope and deferred.

## Goal

Shift above-the-fold pages from "desktop-compressed" to "mobile-first" on
375-720px. Keep the zine feel but reduce vertical cost of display
typography and rework the feed filter control so phones reach useful
content faster. Not a redesign — a hierarchy + density pass.

## User feedback snapshot (2026-04-23, post-T13 smoke)

Working well on mobile: top nav (logo + avatar + hamburger read cleanly),
settings form (fields, avatar row, CTA), feed card stacking, poster
thumbs, no obvious overflow.

Not working well: display typography is too tall ("The Feed", film
titles like "Undertone" eat the first screen), feed filter tab row
feels like a desktop toolbar (buttons too wide, uneven spacing,
Refresh reads wrong for mobile), film detail page is
poster-and-title-dominant before action controls.

## Priority order

1. **Feed filter row rework.** Horizontal-scroll pill row, clean two-line
   wrap, or reduced control set with Refresh relocated (overflow menu,
   pull-to-refresh later, or just hoisted off the tab strip). Pick one
   during implementation; lean toward horizontal pill scroll since it
   preserves all tabs.
2. **Display-title sizing.** Ratchet down the fluid clamps for page
   titles on phones. `.h-display` currently `clamp(48px, 9vw, 112px)`;
   likely wants something closer to `clamp(36px, 7vw, 112px)` on
   feed-style page headers so they stop dominating the first screen.
   Review film titles separately — those may need their own class
   because their role differs from page headers.
3. **Film detail page hierarchy.** Shrink poster a notch further on
   mobile (currently `clamp(200px, 60vw, 280px)` via
   `--film-hero-poster-size`; try `clamp(160px, 50vw, 240px)`).
   Scale the title down. Tighten spacing between poster, genre pill,
   title, metadata, and synopsis. Surface the primary action controls
   (watchlist + recommend) higher so they're reachable without a
   scroll on a 667px-tall viewport.
4. **Opportunistic spacing polish** across other mobile views once the
   above land.

## Explicit non-goals

- No new breakpoints. Stay on the single 720px boundary.
- No dark/light mode, PWA, touch gestures, landscape mode.
- No redesign of the zine look. Keep display fonts, grain, halftone,
  rotated badges. Only scale and position.
- No accessibility deep pass — separate sub-project.

## Success criteria

On a 375×667 viewport, for `/home`, `/films`, and a film detail page:
- The primary useful control (feed filter / poster grid / watchlist +
  recommend buttons respectively) is at least partly visible in the
  first viewport without scrolling.
- Display titles feel dramatic but no longer dominate.
- Feed filter row fits the width cleanly without line-2 orphans and
  without Refresh feeling out of place.
- Zero horizontal document scroll retained.

## Out-of-scope reminder

The responsive spec's "Tier-B (Polished)" and "Tier-C (Pixel-perfect
parity)" upgrade path is tracked separately. This spec is the
Tier-B-ish polish layer for above-the-fold only; full parity with
desktop aesthetic is not promised here.

## Second-pass review (external UX input, 2026-04-23)

A second reviewer did a mobile walkthrough after the Tier-A pass landed.
Their notes, reconciled with the user's priority list above. Some overlap;
some net-new items worth folding into the brainstorm.

### Settings screen

- **Checkboxes are browser-default blue.** They break the zine palette
  hard — should be custom-styled in accent/bone/void. Touches onboarding
  preferences too if the same native controls are used there.
- **Input field contrast is muddy.** Handle / Display Name inputs recede
  against the dark background. Brighten the stroke or fill so tap
  targets are findable without hunting.
- **Secondary-button styling is inconsistent.** "Replace" and "Remove"
  on the avatar row use different treatments (white outline vs red
  outline). Pick one secondary/tertiary pattern and apply consistently.
- **What's working:** "Save" CTA is large, thumb-friendly, high-contrast.
  Keep.

### Feed screen

- **"Refresh" as a tab is an IA miscue.** Tabs are for filtering / view
  switching; Refresh is an action. Relocate to a pull-to-refresh
  gesture, an icon button outside the tab strip, or an overflow menu.
  (Already priority #1 in user's list — reviewer's preferred fix is
  pull-to-refresh, which we can treat as a stretch; the minimum is
  "not a tab".)
- **"The Feed" header eats ~25% of the viewport** once you add nav +
  tab strip. Shrink display typography on mobile. (Priority #2 in
  user's list — reviewer confirms.)
- **What's working:** active tab indicator (accent block under
  selection) reads cleanly. List row structure (avatar / action /
  poster thumb) is scannable. Keep both.

### Film detail ("Undertone")

- **Display font is illegible for dynamic film titles.** Rubik Wet
  Paint on lowercase "e"/"n" blobs together; acceptable for static
  page titles like "Settings" but not for titles that change per
  film. Swap film titles to a clean sans-serif head. (Overlaps with
  user's priority #3 but is specifically about *font choice*, not
  just sizing — worth a separate task.)
- **Three display faces fighting on one screen.** Rubik Wet Paint +
  DM Serif Display + IBM Plex Serif italic synopsis is one face too
  many. Reviewer suggests moving the synopsis to a regular-weight
  sans-serif. This mitigates halation (italic serif on pure black
  blurs for many readers). Decision to make during brainstorm:
  synopsis = sans, or keep serif but non-italic and slightly heavier.
- **What's working:** metadata row (DIR / YEAR / MIN) is clean,
  scannable, professional. Poster looks great at its current size —
  but priority is to shrink it so watchlist/recommend surface above
  the fold (user's priority #3). Those two goals don't conflict;
  the poster can stay visually strong at a smaller footprint.

### Reconciled priority list

Merges the user's original priority with the reviewer's adds.

1. **Feed filter row rework** — not-a-tab for Refresh; shrink tab
   strip to one clean line. (User #1 + reviewer.)
2. **Display-title sizing** — ratchet `.h-display` clamp down on
   phones. (User #2 + reviewer.)
3. **Film detail hierarchy** — smaller poster, smaller title,
   watchlist/recommend above the fold at 375×667. (User #3 +
   reviewer confirms.)
4. **Typography pass on film titles + synopsis** — switch film
   titles off Rubik Wet Paint to a clean head face; revisit synopsis
   italic-serif-on-black. (Reviewer-only; promoting because it's a
   readability fix, not a cosmetic preference.)
5. **Settings controls polish** — custom-styled checkboxes in brand
   palette; input field contrast; consistent secondary button
   styling. (Reviewer-only; small surface area, quick win.)
6. **Opportunistic spacing polish elsewhere** — unchanged from
   user's original list.
