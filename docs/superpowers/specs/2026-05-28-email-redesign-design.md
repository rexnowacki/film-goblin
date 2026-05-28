# Price-drop digest email redesign

**Date:** 2026-05-28
**Status:** Approved (prototype reviewed)
**Area:** `notifier/src/render.ts`

## Problem

The daily price-drop digest email (`renderDigestEmail`) renders a **light cream
"zine" layout** with dated chrome — "Issue nº1", "Chapter I · The Pit", an 8px
black slab rule, oversized 150px posters. It predates the app's current visual
system and reads as a different product. The app today is a dark "Mörk Borg
meets Letterboxd" zine with a defined token palette and type system
(`app/app/styles/00-core.css`).

## Decision

Adopt the **refined-light** direction: keep the cream/newsprint identity (it
suits a digest in the inbox and stays readable across clients), but modernize
spacing, type scale, pricing, and footer, and drop the dated issue/chapter
chrome. Prototype lives at `notifier/prototypes/email-light.html` and is the
visual source of truth. A dark variant (`email-dark.html`) was also prototyped
but not chosen.

This is HTML/text rendering only — no schema, query, or send-path changes.

## Layout

Single 600px-max card, `#f3ecd8` paper on `#e8dfc4` page, 2px `#0a0a0a` frame.

1. **Header** — `FILM GOBLIN` wordmark (DM Serif Display; "GOBLIN" in deep pink
   `#d01666`), right-aligned mono kicker "Watch Weirder", a 3px black rule below.
2. **Intro** — mono eyebrow `⛧ The pit coughed up N drop(s)` in deep pink, then
   a sans body line greeting the user by name. Singular/plural variants (see
   below).
3. **Film blocks** (repeat per alert) — 118×177 poster (2px black frame,
   `object-fit:cover`) on the left; on the right: DM Serif title, sans
   `director · year · runtime min` meta, mono pricing
   (`strikethrough old → new` with new in deep pink), a black-on-yellow
   `N% OFF` stamp, then a black `Summon on Apple TV →` CTA and a muted
   `Details` link. Thin `#d8cfb4` divider between blocks.
4. **Footer** — black bar: mono `FILM GOBLIN` label in yellow, explainer line,
   `Unsubscribe` · `Manage preferences` links.

## Copy

- **Eyebrow / intro** are pluralized:
  - 1 film: `⛧ The pit coughed up a drop` / "…a film you've been stalking just
    got cheaper on Apple TV. Move before the price crawls back up."
  - N films: `⛧ The pit coughed up N drops` / "…N films you've been stalking
    just got cheaper…".
- **Subject** unchanged from current behavior (singular: `A film just dropped:
  <title>`; plural: `N films from your watchlist just dropped`).
- User addressed by `user.username` (escaped).

## Type & color

Pulled from `00-core.css` tokens, hardcoded as hex inline (email clients don't
read CSS vars):

- Display/titles: `DM Serif Display`, fallback `Georgia, serif`.
- Body/UI: `IBM Plex Sans`, fallback `system-ui, sans-serif`.
- Pricing/labels: `IBM Plex Mono`, fallback `ui-monospace, monospace`.
- Paper `#f3ecd8` / page `#e8dfc4`; ink `#0a0a0a`; muted `#6b6558` / `#8a8578`;
  price + brand accent **deep** pink `#d01666` (AA-contrast on cream — the
  bright `#ff2d88` does not pass on paper); stamp `#f5d300` on black.

Web fonts are linked via `<link>` for capable clients (Apple Mail); all other
clients fall back to the inline serif/sans/mono stacks. This matches the current
template's limitation — no regression.

## Implementation notes

- All structure stays table-based with inline styles (current approach).
- Reuse existing helpers `escapeHtml`, `pctOff`, and the `AlertLite`/`UserLite`
  types. No new dependencies.
- Posters come from `films.artwork_url` (real iTunes `mzstatic` art is squarish,
  letterboxed by Apple); `object-fit:cover` in the tall frame crops it — verified
  acceptable in the prototype with real catalog art.
- Refresh the plaintext (`text`) body's header line to match copy; keep its
  structure.
- `renderAlertBlockHtml` / `renderAlertBlockText` keep their signatures.

## Testing

Update `notifier/tests/render.test.ts`:
- Assert new structural markers (wordmark, eyebrow text, stamp, CTA label).
- Cover singular vs plural intro copy.
- Keep existing assertions for escaping, price formatting, and link URLs
  (unsubscribe, settings, itunes, film page).

## Out of scope

- Dark email variant / theme-switching in email.
- Any non-digest email (none exist today).
- Send path, query, schema (`resend.ts`, `query.ts`, migrations) — untouched.
