# Onboarding Redesign — Design

**Status:** spec
**Date:** 2026-04-29
**Sub-project:** 19 (next after watchlist redesign at 18). Pure UI consolidation; no schema, no new server actions, no migration. Server-action surface narrows; no broadening.

## Goal

Collapse the five-chapter "ritual" at `/onboarding` into a single-page form that asks the user for the three things the system actually needs — handle, alert threshold, three watchlist seeds — and ships the user into `/home` in well under a minute. Drop every section that collects data the backend doesn't persist (genres, storefronts) or duplicates a feature that already lives elsewhere (follow-seeding, which `/coven` Find People supports natively post-#16). Drop the certificate / blood-pact / signature theatrics, the chapter framing, the progress bar, and the bespoke top + bottom sticky chrome — none of which match the editorial tone of the rest of the authenticated site (`/library`, `/watchlist`, `/settings` are all single-page-spare-hero-plus-form).

## What ships

1. **Page rewrite** — `/onboarding` becomes one server-rendered page with one client-island form. Three sections stacked in source order; all visible at first paint.
2. **Hero (matches `/library` / `/watchlist`)** — bone-on-void strip, headline-only: `Welcome to the Coven.` with one italic-serif subhead beneath: `Bind your handle, set your alert threshold, pick three films to start.` No "Chapter Zero", no progress bar, no "The Ritual" subtitle.
3. **Section 1 — Handle** — single text input. Eyebrow `Your Handle`. Lowercase + dots, max 24 chars. Same validation rules as today (the `coven` field renamed). Required.
4. **Section 2 — Alert threshold** — keep the slider as-is, the one piece of UI on this page that's well-made. Eyebrow `Alert Threshold`. Min 10, max 75, step 5, default 30. Big `−30%` accent display + slider + caption ("a flinch / a real deal / a gift" labels) all preserved verbatim.
5. **Section 3 — Seed your watchlist** — same `repeat(auto-fill, minmax(140px, 1fr))` poster grid as today (and as `/films` and `/library` and the new `/watchlist`). Server-fetched film list (limit 24, `tracking=true && available=true`). Search input narrows the list client-side. **Replace the tilt-rotate selection animation with a corner check pill** that visually rhymes with `PosterQuickAdd`'s `+` overlay vocabulary on `/films`. Required: 3+ films; max 10.
6. **Single CTA** — full-width `.btn btn-lg` at the bottom: `Enter →`. Disabled until handle is non-empty AND watchlist has 3+ films selected. Italic-serif copy beneath when disabled, naming the missing requirement: `"Choose a handle."` / `"Pick three films to begin."` / `"Choose a handle, and pick three films."`
7. **Server-rendering** — the films query (`tracking=true && available=true`, limit 24) moves to the page's server component. Page boundary becomes `app/app/onboarding/page.tsx` (server) → `app/app/onboarding/OnboardingForm.tsx` (client island for state + slider + submit). `auth.getUser()` runs server-side as a `redirect("/auth/signin")` guard, mirroring `/library` and `/watched` patterns.
8. **Server-action narrowing** — `OnboardingPayload` drops `genres`, `storefronts`, `followUserIds`. `_completeOnboarding` becomes ~25 lines: profile update (handle + display_name + broadcast_watchlist_adds=true) + watchlist inserts (with computed `max_price_usd` from threshold). The follows-insert loop is deleted. No data is lost compared to today — genres/storefronts were never persisted; follows are now created on `/coven` instead.
9. **Net deletions** — `/onboarding/page.tsx` shrinks from ~723 lines to ~250 (server component + client form). `_completeOnboarding` shrinks. Zero new files outside the page itself. No CSS in `globals.css` survives that's onboarding-specific (the existing `.onboarding-store-row`, `.onboarding-coven-seed`, `.onboarding-oath` classes — if they exist there — get removed).

## Out of scope

- **Genres + storefronts as `/settings` fields.** Per Path B: drop now. The day a feature reads either, that sub-project adds the columns + types + `SettingsForm` fields together. No dead-data plumbing.
- **`profiles.alert_threshold_pct` column.** The threshold remains a per-watchlist `max_price_usd` — same semantic as today. Persisting a global threshold is a separate sub-project (would let users change all alert levels at once via `/settings`).
- **Confetti / "you're sworn in" moment on `/home` after submit.** If the certificate flourish has to live somewhere, this is the natural spot — but it's a follow-up, not part of the redesign.
- **Migration to drop the in-flight payload fields.** `OnboardingPayload` is a TypeScript-only interface (no DB column). Removing fields is a code change, not a migration.
- **Editing onboarding answers later.** Handle and broadcast settings already live in `/settings`. Threshold doesn't (per above). Watchlist edits via the existing `WatchlistButton`. Re-running onboarding is not a feature.
- **Follow-seeding from a "Coven" preview.** `/coven` Find People is the steady-state surface; preempting it during onboarding adds a path that has to stay parallel-feature with the real one. Drop entirely.
- **Mobile-specific overrides.** The new layout (hero + three stacked sections + button) is naturally fluid; no `@media (max-width: 720px)` rules needed beyond what the existing utility classes provide. The poster grid auto-fills, the slider is fluid, the input is full-width. Verify at 720px during QA, but don't pre-write overrides.
- **Auth-state edge cases.** If a user lands on `/onboarding` after they've already submitted, today's flow re-runs the action and inserts duplicates (caught by `23505` unique-violation). Behavior unchanged. The page is reachable only post-signup; existing redirects in `auth/callback` already handle this. Out of scope.
- **`Caveat` font load.** The signature font fallback bug becomes moot — there's no signature.

## Locked design decisions

| Q | Decision |
|---|---|
| Path forward for genres + storefronts | **Drop entirely.** Re-introduce as part of whatever feature first reads them. |
| Page structure | Single page, three stacked sections, all visible at first paint. |
| Hero | Spare bone-on-void strip; headline `Welcome to the Coven.` + italic-serif subhead. |
| Chapter / Roman-numeral / "Ritual" framing | All gone. |
| Progress bar | Gone. |
| Sticky bottom Prev/Next bar | Gone. |
| Custom top header (wordmark + abandon button) | Replace with bare bone hero strip; no nav, no abandon — `/home` is one click away post-submit. |
| Genre selection | Gone from onboarding. |
| Storefront selection | Gone from onboarding. |
| Coven follow-seeding | Gone — handled on `/coven`. |
| Blood pact / certificate / signature | Gone. |
| Handle input | Single text input, eyebrow `Your Handle`, lowercase + dots, max 24. |
| Threshold slider | Kept verbatim (10–75 step 5, default 30, big −N% accent display). |
| Watchlist seed | Kept; replace tilt-rotate animation with a corner check pill matching `PosterQuickAdd` vocabulary. |
| Watchlist requirement | 3+, max 10 (same as today). |
| Submit CTA | Single `.btn btn-lg` reading `Enter →`, disabled until requirements met. |
| Disabled-state copy | Italic-serif, names the missing requirement. |
| Data fetching | Server-rendered films query; client form receives `initialFilms` as a prop. |
| `OnboardingPayload` shape | `{ handle, watchlistFilmIds, thresholdPct }`. `genres`, `storefronts`, `followUserIds`, `broadcastWatchlistAdds` all gone (broadcast defaults to true server-side). |

## Section 1 — Data

No schema change. No migration. The `OnboardingPayload` interface narrows; the server action's writes shrink to two: (1) profile update, (2) watchlist inserts.

**Server-action diff:**

```ts
// before
export interface OnboardingPayload {
  handle: string;
  genres: string[];          // captured but not persisted
  storefronts: string[];     // captured but not persisted
  watchlistFilmIds: string[];
  followUserIds: string[];
  thresholdPct: number;
  broadcastWatchlistAdds: boolean;
}

// after
export interface OnboardingPayload {
  handle: string;
  watchlistFilmIds: string[];
  thresholdPct: number;
}
```

The `broadcastWatchlistAdds: true` value moves into `_completeOnboarding` as a hard-coded default (matching today's hard-coded `true` from the page). The `followUserIds` loop is deleted. Genre + storefront fields are deleted along with the captured-but-discarded comments.

`max_price_usd` computation per watchlist row stays exactly the same: `latest_price * (1 - thresholdPct / 100)` when there's price history, `null` otherwise.

## Section 2 — Page structure

```
app/app/onboarding/
├── page.tsx              ← server component, fetches films, renders hero + form
└── OnboardingForm.tsx    ← client island: state for handle/threshold/watchlist, submit
```

### `app/app/onboarding/page.tsx` (server component)

- Auth guard: `if (!user) redirect("/auth/signin?next=/onboarding")`. Mirrors `/library`, `/watched`, `/coven`.
- Films query: `supabase.from("films").select("id,itunes_id,title,director,year,genre_primary,artwork_url").eq("tracking",true).eq("available",true).limit(24)`. Same shape as today's client-side fetch in `ChapterWatchlist`.
- Renders: bone hero strip + `<OnboardingForm initialFilms={films} />`.
- No `TopNav`, no `BottomNav` — onboarding is intentionally a chrome-free landing the user only sees once. The bone hero gives it the editorial-strip identity.

### `app/app/onboarding/OnboardingForm.tsx` (client island)

- Three pieces of state: `handle: string`, `threshold: number` (default 30), `watchlist: string[]` (initialized empty).
- `submitting: boolean` for the CTA.
- Receives `initialFilms: DbFilm[]` as a prop. Search filtering happens client-side via `useMemo` over `initialFilms.title.includes(q) || initialFilms.director.includes(q)` — exactly the same pattern as today's `ChapterWatchlist`, just lifted out.
- `canSubmit = handle.trim().length > 0 && watchlist.length >= 3`.
- `onSubmit` calls `completeOnboarding({ handle, watchlistFilmIds: watchlist, thresholdPct: threshold })` and lets the server action `redirect("/home")`.

## Section 3 — Visual treatment

### Hero strip

```tsx
<section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "32px 0 24px" }} className="grain-light">
  <div className="container-wide">
    <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
      Welcome to the <em style={{ color: "var(--accent)" }}>Coven</em>.
    </h1>
    <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 18, opacity: 0.75, marginTop: 12, maxWidth: 640 }}>
      Bind your handle, set your alert threshold, pick three films to start.
    </p>
  </div>
</section>
```

Same hero pattern as `/films`, `/library`, `/watchlist`, `/coven` — accent on a single italicized noun, italic-serif subhead beneath.

### Section spacing

Three `<section>`s after the hero, each `padding: "32px 0"` with `border-bottom: 1px solid #2a2a2a` separating them (matches `/settings`'s section dividers). Each section is wrapped in `<div className="container-wide">` and starts with an eyebrow + minimal explanation, no chapter number.

### Section 1 — Handle

```
Your Handle
[ moss.witch                                 ]
This is what the coven sees when you review.
```

- Eyebrow caps text in `var(--accent-deep)`.
- Input: full-width, `fontSize: 28`, `fontFamily: var(--font-head)`, `padding: 16px 18px`, `border: 2px solid var(--void)`, `background: var(--bone-2)`. Identical to today's coven-name input, just lifted.
- Caption: italic-serif `fontSize: 11`, `opacity: 0.6`.

### Section 2 — Alert threshold

Identical to today's `Thy Threshold Of Pain` block, minus the eyebrow's cargo-cult glyphs (✦) and the renaming. Eyebrow becomes `Alert Threshold`, copy beneath becomes `Alert me when a tracked film drops at least` `−30%`. Slider, range labels (`−10% (a flinch) ↔ −40% (a real deal) ↔ −75% (a gift)`) preserved verbatim — they're well-tuned and on-tone.

### Section 3 — Seed your watchlist

```
Pick Three Films
[ Search the grimoire…                        ] 24 results

[ poster ]  [ poster ]  [ poster ]  ...   ← repeat(auto-fill, minmax(140px, 1fr))
```

- Eyebrow caps text in `var(--accent-deep)`: `Pick Three Films`.
- Search input matches the watchlist-page input style: bone-bg + accent shadow + svg search glyph in the left pad. Reuse the same `<svg>` icon already in `/films` and `/coven`. Right-aligned `N results` caps text.
- Grid: `repeat(auto-fill, minmax(140px, 1fr))` at `var(--grid-gap)`, identical to `/films` and `/library`. Each film is a `<button>` wrapping `<FilmPoster size="md" film={...} style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />`.
- **Selection treatment** — replace today's `transform: translateY(-4px) rotate(-1deg)` + offset-circle star badge with a corner check pill:
  ```tsx
  {selected && (
    <span className="poster-check-pill" aria-hidden>✓</span>
  )}
  ```
  Pill is positioned `top: 6px; right: 6px; background: var(--accent); color: var(--void); width: 24px; height: 24px; border: 1px solid var(--void); display: grid; place-items: center; font-size: 14px; font-weight: 700; z-index: 2`. Mirrors `PosterDropBadge`'s placement language from #18.
- Selected card border: 2px solid `var(--accent)` around the poster (subtle ring) — easier to scan at a glance than relying on a corner pill alone.
- Caption beneath each poster: `{title}` head + `{year} · {director}` caps, matching `/library`. No tilt animation; no offset star.
- Counter beneath the grid (italic-serif): `Sowed: 2 of 3` while incomplete; `Sowed: 3 — ready` when ≥3.

### Submit CTA

```tsx
<div style={{ textAlign: "center", padding: "40px 0 60px" }}>
  <button
    className="btn btn-lg"
    disabled={!canSubmit || submitting}
    onClick={onSubmit}
    style={{ minWidth: 240, opacity: canSubmit && !submitting ? 1 : 0.4 }}
  >
    {submitting ? "Sealing the pact…" : "Enter →"}
  </button>
  <div style={{ marginTop: 12, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, opacity: 0.65 }}>
    {disabledReason}
  </div>
</div>
```

`disabledReason` is computed: `""` when ready, otherwise `"Choose a handle."` / `"Pick three films to begin."` / `"Choose a handle, and pick three films."`. The `"Sealing the pact…"` copy is the one piece of theatrical lift that survives — it's a single state-transition moment, not a sustained tone.

## Section 4 — CSS

Net-zero or net-negative. No new shared CSS classes. Inline styles for the page-specific layout (matching the pattern of `/library`, `/watched`, etc., which keep their layout in JSX). One small new class for the watchlist-seed corner pill if reuse is anticipated:

```css
.poster-check-pill {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  background: var(--accent);
  color: var(--void);
  border: 1px solid var(--void);
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 700;
  z-index: 2;
  pointer-events: none;
}
```

Place near `.poster-drop-badge` in `globals.css` — same family of poster overlays.

If `globals.css` has any onboarding-specific rules today (`.onboarding-store-row`, `.onboarding-coven-seed`, `.onboarding-oath`), grep for them and delete — they're class names referenced inline in the soon-to-be-replaced page.

## Section 5 — Migration order

Single PR. Order of edits:

1. Create `app/app/onboarding/OnboardingForm.tsx` (client island) with the three sections.
2. Rewrite `app/app/onboarding/page.tsx` as a server component fetching films + rendering hero + `<OnboardingForm initialFilms={...} />`.
3. Edit `app/lib/actions/onboarding.ts`: narrow `OnboardingPayload`, delete the follows-insert loop, hard-code `broadcast_watchlist_adds: true` in the profile update.
4. Add `.poster-check-pill` rule to `globals.css`.
5. Grep for `.onboarding-store-row`, `.onboarding-coven-seed`, `.onboarding-oath` in `globals.css`; delete any that exist.
6. `npm run typecheck` — confirms the narrower `OnboardingPayload` doesn't break any stale callers (the only caller is the page itself, which is being rewritten).
7. `npm run build`.
8. Visual QA on a fresh sign-up: fill handle → adjust slider → pick 3 films → submit → land on `/home` with watchlist populated and threshold-derived `max_price_usd` set per row.
9. Verify mobile (≤720px): hero wraps cleanly, three sections stack, poster grid reflows to 2-col, slider is touchable, submit button reaches.

## Section 6 — Risks and follow-ups

**Risk: existing users' onboarding state.** Today's `_completeOnboarding` doesn't track a "completed" boolean — re-running it inserts duplicate watchlist rows (handled by 23505) and updates the profile in place. The new flow has the same idempotency. Existing users who somehow re-land on `/onboarding` won't break.

**Risk: what if a brand-new user has fewer than 24 films available?** The today-flow seeds from `films.tracking=true && available=true` limit 24 — same constraint applies. Worst case the user picks 3 from however many are returned. If `films.length < 3` the user can't complete onboarding; this is already the case today and not blocked by the redesign. Out of scope to address (would imply we have an empty films table, which means a lot more is broken).

**Risk: the surrendered ceremony is a brand asset.** The "Coven" framing is what makes Film Goblin distinct, and onboarding is the highest-leverage moment to set that tone. The new hero (`Welcome to the Coven.`) keeps the noun and the accent on it; the threshold copy (`Alert me when a tracked film drops at least −30%` with "a flinch / a real deal / a gift" labels) keeps the wry voice; the disabled CTA copy (`Sealing the pact…`) keeps a beat of theater. The redesign doesn't bleach the personality — it concentrates it.

**Follow-ups deliberately not in this PR:**
- A one-time "Welcome — N films sown" confirmation banner at the top of `/home` for the first session after submit. (Where the certificate energy could land if you miss it.)
- Persisting `alert_threshold_pct` on `profiles` so users can change all alerts at once via `/settings`.
- A "Discover people" prompt / nudge on the empty-state `/coven` page for users who haven't followed anyone yet (catches what onboarding's "Seed Thy Coven" used to do).
- Re-introducing genres or storefronts whenever a feature actually reads them.
- A `/settings` "Re-run onboarding" entry point. Probably not needed but cheap to add later.

## Section 7 — Done definition

- `/onboarding` is a single-page form with three stacked sections plus a submit button.
- Hero matches the editorial pattern of `/library` / `/watchlist` (bone strip + headline + italic-serif subhead).
- No "Chapter" labels, no Roman numerals, no progress bar, no certificate, no signature, no "Ritual" framing.
- Genres, storefronts, follow-seeding sections are gone.
- `OnboardingPayload` shape is `{ handle, watchlistFilmIds, thresholdPct }`.
- `_completeOnboarding` writes profile + watchlists; nothing else.
- The films query is server-rendered. The form is one client island.
- A new user can complete onboarding in under 30 seconds.
- Typecheck and build are green.
