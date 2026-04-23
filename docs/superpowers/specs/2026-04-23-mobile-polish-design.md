# Mobile Polish Pass — Design Spec

**Status:** ready for implementation planning.
**Predecessor:** `2026-04-23-mobile-responsive-design.md` (Tier-A "usable") shipped 2026-04-23.
**Follow-up-to:** `2026-04-23-mobile-polish-followup.md` (user + external UX reviewer notes).
**Scope:** seven concrete fixes across feed, film detail, settings. Non-redesign.

## Goal

Close the gap between "usable on a phone" and "feels designed for a phone"
on the three highest-traffic surfaces: feed, film detail, settings.
Address specific complaints from the 2026-04-23 smoke: oversized display
typography, film titles rendered illegibly in Rubik Wet Paint, "Refresh"
reading as a tab, film detail's primary actions below the fold at
375×667, native-blue checkboxes breaking the zine palette, muddy input
contrast. No new breakpoints. No redesign.

## Non-goals

- Pull-to-refresh gesture. Deferred. Focus-refresh handles the returning-tab
  case; no explicit manual-refresh control is needed in this pass.
- New breakpoints. Stay on single 720px boundary.
- Dark/light mode, PWA, touch gestures, landscape mode.
- Synopsis font change. Reviewer suggested dropping italic-serif-on-black;
  rejected — core zine aesthetic retained.
- General audit-and-tighten pass across every mobile page. Ship these
  seven fixes first; smoke; open a follow-up only if specific pain points
  remain.
- Toggle-switch component for notification preferences. Custom CSS
  checkboxes are in scope; toggles are a separate design conversation.

## The seven fixes

### 1. Film titles switch from Rubik Wet Paint to DM Serif Display

**Problem:** Dynamic film titles ("Undertone", etc.) render with
illegible blobs in Rubik Wet Paint — the "e" and "n" glyphs merge. Works
for static page titles ("Settings", "The Feed") but not for content that
changes per film.

**Fix:** On `/film/[id]` only, the title `<h1>` moves from `.display`
(Rubik Wet Paint) to `var(--font-head)` (DM Serif Display). Rubik Wet
Paint stays everywhere else.

**Rule, documented as a comment in `globals.css`:** Rubik Wet Paint is
for page titles and chrome (page headers like "Settings", "The Feed",
landing wordmark). DM Serif Display is for content titles (film titles,
review titles, list titles).

**Files:** `app/app/film/[id]/page.tsx` (class change + clamp — see fix 4).

### 2. Remove Refresh button from feed

**Problem:** Reviewer reads the Refresh `<button>` as a fifth tab because
it shares border, padding, and caps styling with the tab row. It's
already a separate element (`marginLeft: auto`) but the visual grouping
says "tab."

**Fix:** Delete the button outright. The existing
`window focus → router.refresh()` effect in `FeedTabs.tsx` already handles
the "I came back to the tab" case, which is the common refresh trigger.

**Result:** tab strip is exactly four pills (All / Reviews / Recs /
Lists). Fits one line at 375px.

**Files:** `app/components/FeedTabs.tsx`.

### 3. Ratchet `.h-display` clamp + wire feed page header into it

**Problem:** `.h-display` is `clamp(48px, 9vw, 112px)`. At 375px width
that resolves to ~48px — acceptable but still tall. User complaint is
consistent ("eats the first screen") across the pages that use it.

Separately, `/home` uses hardcoded `fontSize: 42` for "The Feed" rather
than `.h-display`, so tuning the class wouldn't reach that page.

**Fix (two parts):**
- `globals.css`: change `.h-display` from
  `clamp(48px, 9vw, 112px)` to `clamp(36px, 7vw, 112px)`. Desktop ceiling
  unchanged; mobile floor drops 12px; mid-range slope eases.
- `app/app/home/page.tsx`: replace the inline `fontSize: 42` with
  `className="h-display"` on the "The Feed" heading.

**Risk:** `.h-display` is used on landing and browse pages too. Floor
reduction applies there as well, by design — the user's complaint
referenced the class of page headers, not just one.

**Files:** `app/app/globals.css`, `app/app/home/page.tsx`.

### 4. Film detail mobile reorder + shrink

**Problem:** At 375×667, today's stack is nav → genre eyebrow → title
(~72px) → metadata → synopsis (italic serif, ~6 lines = ~180px) →
buttons. Watchlist + Recommend buttons land ~250-300px below the fold.

**Fix:** On mobile (≤720px) the stack order becomes:

    poster → title → metadata → buttons → synopsis

Desktop (>720px) order unchanged (two columns, poster left, text-block
right with synopsis above buttons). Implementation uses the existing
`.stackable` grid and either a CSS `order:` override inside the text
block or restructures the mobile layout as a single column with explicit
order.

**Sizing changes:**
- `--film-hero-poster-size` mobile value:
  `clamp(200px, 60vw, 280px)` → `clamp(160px, 50vw, 240px)`.
- Title clamp: `clamp(72px, 8vw, 128px)` →
  `clamp(40px, 10vw, 96px)`. DM Serif Display reads larger per px than
  Rubik Wet Paint, so 40px floor remains dramatic.

**Synopsis:** unchanged. Italic IBM Plex Serif, 22px, lives below the
buttons on mobile.

**Files:** `app/app/globals.css`, `app/app/film/[id]/page.tsx`.

### 5. Custom checkboxes in zine palette

**Problem:** Settings form renders native `<input type="checkbox">` —
browser-default blue squares against the dark zine palette.

**Fix:** CSS-only custom pattern added as a reusable class
(e.g. `.check-zine`) in `globals.css`:
- Native `<input type="checkbox">` visually hidden but still owns
  state + keyboard focus + screen reader label.
- Sibling `::before` or a wrapping `.check-zine` label draws a 16px
  square with 2px `var(--void)` border on `var(--bone)` fill.
- Checked state: tick drawn in `var(--accent)` (pink).
- Focus ring visible via `:focus-visible` on the native input — box
  outline styled in `var(--accent)`.

**Reuse:** the class goes in `globals.css` so future forms
(onboarding preferences, notification panes) pick it up automatically.

**Files:** `app/app/globals.css`, `app/components/SettingsForm.tsx`
(two checkboxes: broadcast_watchlist_adds, email_notifications).

### 6. Settings input contrast bump

**Problem:** All text inputs use `border: 1px solid #333` against
`background: var(--void-2)`. Dark-on-dark borders force users to hunt
for tap targets.

**Fix:** Change border to `2px solid var(--muted)` across all text
inputs and the textarea on settings. `var(--muted)` is `#8a8578` — warm
gray, reads cleanly against void without shouting.

**Covered:** Handle, Display Name, Bio, Current password, New password,
Confirm new password.

**Files:** `app/components/SettingsForm.tsx`.

### 7. Codify the secondary-button rule

**Problem:** Reviewer flagged "Replace" (bone outline) and "Remove"
(blood outline) on settings as inconsistent. In practice the codebase
uses a rough rule already — destructive uses blood, non-destructive
uses bone — but it isn't documented and there's nothing preventing
drift.

**Fix:** Add a comment block to `globals.css` defining the rule:

> Secondary buttons: destructive actions (Remove, Sign out, Leave,
> Desanctify) use `2px solid var(--blood)` outline with `color:
> var(--blood)`. Non-destructive actions (Replace, Cancel, etc.) use
> `2px solid var(--bone)` outline with `color: var(--bone)`. Primary
> CTAs use the `.btn` family (accent-filled).

The rule is mostly documentation — current code already follows it
(Remove = blood, Sign out = blood, Replace = bone). The only code
change is ensuring no regression lands during this pass.

**Files:** `app/app/globals.css` (comment only).

## Files summary

| File | Changes |
|------|---------|
| `app/app/globals.css` | `.h-display` clamp, `--film-hero-poster-size` mobile clamp, `.check-zine` class, font-usage comment, secondary-button rule comment |
| `app/app/home/page.tsx` | Inline `fontSize: 42` → `className="h-display"` |
| `app/components/FeedTabs.tsx` | Delete Refresh button |
| `app/app/film/[id]/page.tsx` | `<h1>` font class swap + clamp + mobile reorder |
| `app/components/SettingsForm.tsx` | Input/textarea border, two checkbox markup swaps |

## Testing approach

No unit tests — all CSS and markup. Verification is:
- 375×667 browser smoke (dev tools or real iPhone) comparing each fix
  before/after. Checklist per surface:
  - `/home`: tab strip single-line, no Refresh button, "The Feed" not
    eating the first screen, focus-refresh still works when tab
    regains focus.
  - `/film/[id]`: watchlist + recommend buttons visible in first 667px
    alongside poster + title + metadata. Title legible. Synopsis
    appears below buttons.
  - `/settings`: checkboxes match brand palette, inputs have visible
    borders, Remove/Replace/Sign out buttons follow the rule.
- Desktop sanity pass at 1280+ to confirm two-column film detail
  unchanged, `.h-display` still reads dramatic on landing + browse.
- Vercel preview deploy → iPhone smoke before merge.

## Success criteria

At 375×667 on the three surfaces above:
- Feed: title + full tab strip + first feed row all visible in the
  first viewport.
- Film detail: poster + title + metadata + action controls all visible
  in the first viewport. Synopsis reads below.
- Settings: checkboxes are zine-palette, inputs obviously-tappable,
  secondary-button styling follows the rule.
- Zero horizontal document scroll retained from Tier-A.

## Out-of-scope reminder

The followup spec (`2026-04-23-mobile-polish-followup.md`) listed
"opportunistic spacing polish elsewhere" as priority 6. That's dropped
from this pass by explicit choice — ship the seven fixes, smoke, decide
afterward whether more polish is warranted.
