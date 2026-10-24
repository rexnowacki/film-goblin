# Mobile bottom nav — design

**Status:** Approved 2026-04-28
**Owner:** This session
**Replaces:** none (additive at the mobile breakpoint)
**Related:**
- Mobile responsive (Tier-A) — `2026-04-23-mobile-responsive-design.md` (the 720px breakpoint + `.mobile-only`/`.desktop-only` utilities this spec builds on)
- Covenfolk merge — `2026-04-26-covenfolk-merge-design.md` (the IA shift this redesign continues — top-level surfaces collapsing into fewer destinations)
- HOARD unification (deferred) — see memory `project_hoard_unification_deferred.md` for the future `/library` + `/watchlist` consolidation that the HOARD tab points at conceptually but doesn't implement here

## Problem

Today's mobile chrome is a top-only nav: drippy wordmark + notification bell + avatar + a hamburger button that opens a drawer with six items (Home, Discovery, Watchlist, Your Grimoire, Diary, Covenfolk). Primary navigation requires two taps (open hamburger → choose item) and the drawer hides the rest of the page while open. This redesign moves primary mobile navigation to a bottom tab bar — fewer taps, always-visible — and trims the top chrome to the wordmark + bell + avatar.

## Goal

Add a four-tab bottom nav at the 720px breakpoint covering FEED / DISCOVERY / COVEN / HOARD. Trim the mobile top chrome to just the wordmark + drop + avatar. Move secondary destinations (Your Grimoire, Diary) into the avatar dropdown. Keep the desktop top nav untouched.

## Non-goals (this sub-project)

- **HOARD unification.** `/library` + `/watchlist` consolidating into a tabbed page is its own sub-project. HOARD here routes directly to `/watchlist`. The pill-toggle + always-visible stats from the AI mockup come later.
- **Diary on profile.** Moving `/watched` into `/p/<handle>` is its own sub-project. Diary stays at `/watched`, reachable via the avatar dropdown.
- **Visual aesthetic shift.** The AI-driven mockup is cleaner / more app-like (card containers, rounded corners, less grain) than the existing zine system. Out of scope here; bottom nav matches the established palette and stroke vocabulary.
- **Tablet (720–1024px).** The existing 720px breakpoint is the only switch. Tablets get the desktop top nav.
- **Anon viewers.** No bottom nav for unauthed users (matches today: anon viewers see only DISCOVERY in the existing TopNav and nothing more).
- **iOS PWA top safe-area.** Already handled by `TopNavChrome`'s existing `paddingTop: env(safe-area-inset-top)`.

## Decisions locked during brainstorming

| # | Decision | Choice |
|---|---|---|
| 1 | HOARD destination in v1 | `/watchlist` (no `/hoard` URL) |
| 2 | Where `/library` and `/watched` live | Avatar dropdown (UserMenu) only |
| 3 | UserMenu shape | Flat list, ordered "your stuff" → utility |
| 4 | Active-state on secondary routes | Preserve source tab — `/film/[id]` keeps DISCOVERY lit, `/p/[handle]` keeps COVEN lit |
| 5 | Architecture | New `BottomNav` component, rendered per-page alongside `TopNav`, both accept the same `current` prop |

## Bottom nav tabs

| Tab | `current` value (incoming) | Click target | Source-tab inheritance |
|---|---|---|---|
| FEED | `"home"` | `/home` | — |
| DISCOVERY | `"films"` | `/films` | `/film/[id]` passes `current="films"` |
| COVEN | `"coven"` | `/coven` | `/p/[handle]` passes `current="coven"` |
| HOARD | `"watchlist"`, `"library"`, or `"watched"` | `/watchlist` | `/library` and `/watched` (when reached via avatar menu) pass `current="library"` or `current="watched"` |

Pages that don't map (e.g., `/settings`, `/admin/*`, `/auth/*`) leave all four tabs unlit. The bottom nav silently shows nothing as active rather than guessing.

**No new `current` ids.** Both `TopNav` and `BottomNav` accept the existing 6-id space (`"home"`, `"films"`, `"coven"`, `"watchlist"`, `"library"`, `"watched"`, plus `"admin"`/undefined for everything else). `TopNav` styles its inline links by id; `BottomNav` maps internally:

- `"home"` → FEED active
- `"films"` → DISCOVERY active
- `"coven"` → COVEN active
- `"watchlist"` | `"library"` | `"watched"` → HOARD active
- `"admin"` | `undefined` → none active

For the **lit-when-on-canonical-route** behavior, pages already pass the right ids today (e.g., `/library` already passes `current="library"` to its TopNav), so BottomNav inherits that for free. The only new per-page prop additions are for **source-tab inheritance** on detail routes that don't currently pass any `current`:

- `/film/[id]` → add `current="films"` so DISCOVERY stays lit when you tap into a film from the Discovery grid.
- `/p/[handle]` → add `current="coven"` so COVEN stays lit when you tap into a profile.

These two pages each gain one prop on their existing `<TopNav>` call (and the same value flows to the new `<BottomNav>`).

## Component structure

### `app/components/BottomNav.tsx` (new, client)

```tsx
"use client";

import Link from "next/link";
import { HomeIcon, DiscoverIcon, CovenIcon, CollectionsIcon } from "./BottomNavIcons";

interface Props {
  current?: string; // shares the existing 6-id space; see mapping above
}

const HOARD_IDS = new Set(["watchlist", "library", "watched"]);

function activeTab(current: string | undefined): "feed" | "discovery" | "coven" | "hoard" | null {
  if (current === "home") return "feed";
  if (current === "films") return "discovery";
  if (current === "coven") return "coven";
  if (current && HOARD_IDS.has(current)) return "hoard";
  return null;
}

export default function BottomNav({ current }: Props) {
  const active = activeTab(current);
  const tabs = [
    { id: "feed", label: "Feed", href: "/home", Icon: HomeIcon },
    { id: "discovery", label: "Discovery", href: "/films", Icon: DiscoverIcon },
    { id: "coven", label: "Coven", href: "/coven", Icon: CovenIcon },
    { id: "hoard", label: "Hoard", href: "/watchlist", Icon: CollectionsIcon },
  ] as const;

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {tabs.map(t => (
        <Link
          key={t.id}
          href={t.href}
          className="bottom-nav__item"
          aria-current={active === t.id ? "page" : undefined}
        >
          <t.Icon className="bottom-nav__icon" />
          <span className="bottom-nav__label">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
```

### `app/components/BottomNavIcons.tsx` (new, server-safe)

Inline 26×26 React SVG components — copies of the four files in `~/Downloads/goblin svg/`. `viewBox="0 0 64 64"`, `stroke="currentColor"`, `strokeWidth="2.5"`, `strokeLinecap="round"`, `strokeLinejoin="round"`, `fill="none"`. Each accepts `className?: string` so the parent can size them. Exports: `HomeIcon`, `DiscoverIcon`, `CovenIcon`, `CollectionsIcon`. (The collections icon retains its layered-cards-with-skull design from the source SVG, including the two `<mask>` elements that hide overlapping card backs.)

### `app/components/TopNavChrome.tsx` (modify)

At ≤720px, drop the inline nav (already `.desktop-only`, no change needed) and remove the hamburger button + drawer:

- Delete the `<button className="mobile-only" ...>` that opens the drawer (lines ~81-93 in the current file).
- Delete the entire `{open && <div className="mobile-only" ...>...</div>}` drawer block (lines ~96-132).
- Delete the `useState` for `open` and the two `useEffect`s that close the drawer + lock body scroll.
- Delete the `HamburgerIcon` component at the bottom of the file (no other consumers).
- Keep wordmark, NotificationBell, UserMenu — they already render correctly on both breakpoints.

### `app/components/UserMenu.tsx` (modify)

The dropdown today is: `@handle` (links to `/p/<handle>`, doubles as the identity header), `Admin` (conditional), `Settings`, `Sign out`. The redesign inserts two new rows after the `@handle` header and before `Admin`:

```
@handle                → /p/<handle>      (existing — profile + header)
Your Grimoire          → /library         (NEW)
Diary                  → /watched         (NEW)
Admin                  → /admin           (existing — conditional on isAdmin)
Settings               → /settings        (existing)
Sign out               (existing — server action)
```

Visible on both mobile and desktop. The two new items use the same row styling as the existing `Settings` row (font-ui, 12px, var(--void) text, 10px 14px padding, hairline divider above).

### Per-page wiring

Pages that don't currently pass `current` need a one-line addition so the bottom-nav source-tab-stays-lit behavior works:

- `app/app/film/[id]/page.tsx` — add `current="films"` to its `<TopNav>` call (also needed for `<BottomNav>`).
- `app/app/p/[handle]/page.tsx` — add `current="coven"` to its `<TopNav>` call.

Every authed-section page that already passes `current` to `<TopNav>` adds a sibling `<BottomNav current={...} />` immediately after. Pattern:

```tsx
<TopNav current="films" />
<BottomNav current="films" />
{/* page content */}
```

The existing per-page TopNav-rendering pattern (each page imports + renders TopNav) extends to BottomNav. No layout-level magic.

## CSS

New block in `app/app/globals.css`:

```css
/* Mobile bottom nav (≤720px). Hidden by default; shown at the breakpoint. */
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: none;
  background: var(--void-2);
  border-top: 1px solid #2a2a2a;
  padding: 10px 0 calc(10px + env(safe-area-inset-bottom));
  z-index: 30;
}
@media (max-width: 720px) {
  .bottom-nav { display: flex; justify-content: space-around; align-items: center; }
  /* Page padding so content isn't obscured by the nav. */
  body { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
}
.bottom-nav__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
  text-align: center;
  padding: 4px 8px;
  color: var(--bone);
  text-decoration: none;
}
.bottom-nav__item[aria-current="page"] { color: var(--accent); }
.bottom-nav__icon { width: 26px; height: 26px; flex-shrink: 0; }
.bottom-nav__label {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
```

**Body bottom padding** at the breakpoint pushes document content above the fixed nav. The 64px figure (≈50px nav + 14px breathing room) is a starting value — tune in the dev-server pass if it feels tight. Pages with `100dvh` page wrappers (per CLAUDE.md's iOS PWA gotcha) are unaffected: the body padding pushes the document, not the viewport-height calc.

**Z-index:** bottom nav at 30 sits above TopNav (20) so it's always on top of any sticky page chrome.

**iOS PWA safe-area:** the bottom nav's `padding-bottom: env(safe-area-inset-bottom)` keeps icons clear of the home indicator on iPhone X+. Existing `viewportFit: "cover"` + `appleWebApp.statusBarStyle: "black-translucent"` continue to handle the top.

## Testing

This change is presentational and CSS-driven; no DB, no actions, no RLS. Verify manually via `npm run dev`:

- `/home` on mobile (≤720px) — FEED tab is lit; tapping each tab routes to the correct destination.
- `/film/<id>` — DISCOVERY stays lit (source-tab inheritance).
- `/p/<handle>` — COVEN stays lit.
- `/settings` — no tab is lit.
- `/library` — HOARD lit (mapped from `current="library"`).
- `/watched` — HOARD lit (mapped from `current="watched"`).
- Avatar dropdown — Your Grimoire + Diary appear, route correctly.
- Hamburger button is gone at mobile widths; no drawer can be opened.
- Desktop ≥721px — top nav unchanged; bottom nav not visible.
- iOS PWA standalone — bottom nav sits above the home indicator; FEED page content scrolls without being clipped by the nav.

No new automated tests. The change touches three components (one new, two modified) and one CSS block; the existing test suites (typecheck, RLS, action tests) should stay green without modification.

## Migration / rollout

Single PR. No DB changes. No types regen. No prod migration. Standard ship: PR → squash-merge → `npx vercel deploy --prod --yes` from repo root.

## Out of scope / deferred

- HOARD unification (`/library` + `/watchlist` → one tabbed page). See memory `project_hoard_unification_deferred.md`.
- Diary on profile (`/watched` → `/p/<handle>` section).
- Mockup-aesthetic shift (cleaner/cards visual). The bottom nav adheres to existing zine palette + stroke vocabulary.
- Tablet-specific layout (720–1024px). Stays on desktop branch.
- Notification badge on FEED tab (e.g., unread activity count). Defer until activity-feed unread-tracking exists.
- Sticky-show/hide-on-scroll behavior. The bottom nav is always visible at mobile widths in v1.
- Active-tab transition animation. Static color swap for v1.
