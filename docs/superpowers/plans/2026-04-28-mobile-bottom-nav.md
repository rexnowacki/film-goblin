# Mobile Bottom Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a four-tab mobile bottom nav (FEED / DISCOVERY / COVEN / HOARD) at the 720px breakpoint, trim the mobile top chrome to wordmark + drop + avatar, and move /library + /watched into the avatar dropdown — without changing the desktop top nav.

**Architecture:** New `BottomNav.tsx` (server component that fetches user; renders null for anon viewers) and `BottomNavIcons.tsx` (inline 26×26 SVG components copied from `~/Downloads/goblin svg/`). Both rendered per-page alongside `TopNav`, sharing the same `current` prop. CSS in `globals.css` makes the bar `display: none` by default and `display: flex` at `@media (max-width: 720px)`. `TopNavChrome` loses its hamburger button and drawer. `UserMenu` gains two rows: Your Grimoire and Diary.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase SSR, plain CSS in `globals.css` (no Tailwind, no CSS modules).

**Spec:** `docs/superpowers/specs/2026-04-28-mobile-bottom-nav-design.md`

---

### Task 0: Branch off fresh master

**Files:**
- (no source changes)

- [ ] **Step 1: Sync master and branch**

```bash
git fetch origin
git checkout master
git merge --ff-only origin/master
git checkout -b feature/mobile-bottom-nav
```

Expected: `Switched to a new branch 'feature/mobile-bottom-nav'`.

---

### Task 1: BottomNavIcons component (inline SVGs)

**Files:**
- Create: `app/components/BottomNavIcons.tsx`

The four icons live at `~/Downloads/goblin svg/` — `home.svg`, `discover.svg`, `coven.svg`, `collections.svg`. Inline them as React components (no extra HTTP fetch per icon, `currentColor` already drives the stroke). Each accepts `className?: string` so the parent can size/color via CSS.

- [ ] **Step 1: Write the icons file**

Create `app/components/BottomNavIcons.tsx` with this content:

```tsx
import type { SVGProps } from "react";

const baseProps: Pick<SVGProps<SVGSVGElement>, "viewBox" | "fill" | "stroke" | "strokeWidth" | "strokeLinecap" | "strokeLinejoin"> = {
  viewBox: "0 0 64 64",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function HomeIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M8 28 L32 8 L56 28" />
      <path d="M14 26 L14 54 L50 54 L50 26" />
      <path d="M26 54 L26 38 L38 38 L38 54" />
    </svg>
  );
}

export function DiscoverIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <circle cx="32" cy="28" r="18" />
      <path d="M24 22 Q22 26 24 30" strokeWidth="2" opacity="0.7" />
      <path d="M14 50 L20 44" />
      <path d="M50 50 L44 44" />
      <path d="M12 54 L52 54" />
      <path d="M20 44 Q32 50 44 44" />
    </svg>
  );
}

export function CovenIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <ellipse cx="32" cy="22" rx="22" ry="3" />
      <path d="M 11 23 Q 9 38 16 50 Q 22 56 32 56 Q 42 56 48 50 Q 55 38 53 23" />
      <path d="M 18 56 Q 14 58 14 60 Q 14 61.5 16 61" />
      <path d="M 46 56 Q 50 58 50 60 Q 50 61.5 48 61" />
      <path d="M 10 22 Q 7 22 7 25" />
      <path d="M 54 22 Q 57 22 57 25" />
    </svg>
  );
}

export function CollectionsIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <defs>
        <mask id="bn-behind-middle">
          <rect width="64" height="64" fill="white" />
          <rect x="19" y="12" width="26" height="38" rx="3" fill="black" />
        </mask>
        <mask id="bn-behind-front">
          <rect width="64" height="64" fill="white" />
          <rect x="28" y="14" width="26" height="38" rx="3" transform="rotate(12 41 33)" fill="black" />
        </mask>
      </defs>
      <g mask="url(#bn-behind-middle)">
        <g mask="url(#bn-behind-front)">
          <rect x="10" y="14" width="26" height="38" rx="3" transform="rotate(-12 23 33)" />
        </g>
      </g>
      <g mask="url(#bn-behind-front)">
        <rect x="19" y="12" width="26" height="38" rx="3" />
      </g>
      <g transform="rotate(12 41 33)">
        <rect x="28" y="14" width="26" height="38" rx="3" />
        <path d="M 33 30 C 33 25, 36.5 22, 41 22 C 45.5 22, 49 25, 49 30 C 49 33, 47.5 35, 46 36 L 46 39 L 44 39 L 44 41 L 42 41 L 42 39 L 40 39 L 40 41 L 38 41 L 38 39 L 36 39 L 36 36 C 34.5 35, 33 33, 33 30 Z" />
        <ellipse cx="38" cy="29.5" rx="1.5" ry="2" fill="currentColor" stroke="none" />
        <ellipse cx="44" cy="29.5" rx="1.5" ry="2" fill="currentColor" stroke="none" />
        <path d="M 41 32 L 40 34 L 42 34 Z" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: clean (no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add app/components/BottomNavIcons.tsx
git commit -m "feat(ui): BottomNavIcons — inline 64-viewbox SVG components"
```

---

### Task 2: BottomNav component

**Files:**
- Create: `app/components/BottomNav.tsx`

`BottomNav` is a server component that fetches the current user (matching `TopNav`'s pattern) and returns `null` for anon viewers. The render is a static four-link nav; mapping logic for the `current` prop lives inline.

- [ ] **Step 1: Write the component**

Create `app/components/BottomNav.tsx` with this content:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { HomeIcon, DiscoverIcon, CovenIcon, CollectionsIcon } from "./BottomNavIcons";

interface Props {
  current?: string; // shares the existing 6-id space used by TopNav
}

const HOARD_IDS = new Set(["watchlist", "library", "watched"]);

function activeTab(current: string | undefined): "feed" | "discovery" | "coven" | "hoard" | null {
  if (current === "home") return "feed";
  if (current === "films") return "discovery";
  if (current === "coven") return "coven";
  if (current && HOARD_IDS.has(current)) return "hoard";
  return null;
}

export default async function BottomNav({ current }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null; // anon viewers: no bottom nav

  const active = activeTab(current);
  const tabs = [
    { id: "feed",      label: "Feed",      href: "/home",      Icon: HomeIcon },
    { id: "discovery", label: "Discovery", href: "/films",     Icon: DiscoverIcon },
    { id: "coven",     label: "Coven",     href: "/coven",     Icon: CovenIcon },
    { id: "hoard",     label: "Hoard",     href: "/watchlist", Icon: CollectionsIcon },
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

- [ ] **Step 2: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/components/BottomNav.tsx
git commit -m "feat(ui): BottomNav — four-tab mobile nav (server component, anon-skip)"
```

---

### Task 3: CSS in globals.css

**Files:**
- Modify: `app/app/globals.css` (insert a new block; existing `.poster-quick-add` block is the closest precedent for placement)

- [ ] **Step 1: Add the bottom-nav CSS**

Find the `.poster-quick-add` block in `app/app/globals.css` (around line 837 in the current file). Insert the bottom-nav block immediately AFTER it, before the existing `.films-sort-chips` block. The new block:

```css
/* Mobile bottom nav (≤720px). Hidden by default; shown at the breakpoint.
   Each tab is icon + uppercase label; the active tab swaps color via aria-current.
   Padding includes env(safe-area-inset-bottom) so the iOS home indicator doesn't
   overlap the icons in standalone PWA mode. */
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

- [ ] **Step 2: Commit**

```bash
git add app/app/globals.css
git commit -m "style(nav): bottom-nav CSS — mobile-only, safe-area-aware"
```

---

### Task 4: Strip hamburger + drawer from TopNavChrome

**Files:**
- Modify: `app/components/TopNavChrome.tsx`

At ≤720px the redesign drops the hamburger button and its drawer. The desktop inline nav (already `.desktop-only`) stays untouched. The `useState`/`useEffect`s that managed the drawer are removed too — without the drawer, they have no consumers.

- [ ] **Step 1: Replace `TopNavChrome.tsx`**

Replace the file contents with this version (which removes lines pertaining to `open` state, the drawer, and `HamburgerIcon`):

```tsx
"use client";

import Link from "next/link";
import UserMenu from "./UserMenu";
import NotificationBell from "./NotificationBell";
import type { NotificationFeedItem } from "@/lib/queries/notifications";

interface NavItem { id: string; label: string; href: string; badge?: number }
interface ProfileShape { handle: string; display_name: string | null; avatar_url: string | null }

interface Props {
  items: NavItem[];
  current?: string;
  user: boolean;
  profile: ProfileShape | null;
  isAdmin: boolean;
  unreadNotifCount: number;
  notifItems: NotificationFeedItem[];
}

export default function TopNavChrome({ items, current, user, profile, isAdmin, unreadNotifCount, notifItems }: Props) {
  return (
    <div style={{ borderBottom: "1px solid #2a2a2a", background: "var(--void-2)", position: "sticky", top: 0, zIndex: 20, paddingTop: "env(safe-area-inset-top)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", maxWidth: 1280, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28, minWidth: 0 }}>
          <Link href={user ? "/home" : "/"} style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1, color: "var(--bone)", textDecoration: "none", flexShrink: 0 }}>
            Film<span style={{ color: "var(--accent)" }}>Goblin</span>
          </Link>
          <nav className="desktop-only" style={{ display: "flex", gap: 22 }}>
            {items.map(it => (
              <Link key={it.id} href={it.href} className="caps" style={{
                fontSize: 11,
                color: current === it.id ? "var(--accent)" : "var(--bone)",
                borderBottom: current === it.id ? "2px solid var(--accent)" : "2px solid transparent",
                paddingBottom: 4,
                textDecoration: "none",
                position: "relative",
                whiteSpace: "nowrap",
              }}>
                {it.label}
                {it.badge && it.badge > 0 ? (
                  <span style={{ marginLeft: 6, padding: "1px 6px", background: "var(--accent)", color: "var(--accent-ink)", fontSize: 9, fontWeight: 700, borderRadius: 999 }}>
                    {it.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {user ? (
            <>
              <NotificationBell unreadCount={unreadNotifCount} items={notifItems} />
              <UserMenu
                handle={profile?.handle ?? "you"}
                displayName={profile?.display_name ?? profile?.handle ?? "You"}
                avatarUrl={profile?.avatar_url}
                isAdmin={isAdmin}
              />
            </>
          ) : (
            <Link href="/auth/signin" className="btn btn-dark btn-sm" style={{ textDecoration: "none" }}>
              Sign In
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: clean. (`useState`, `useEffect`, `usePathname` are no longer imported. `HamburgerIcon` helper is gone.)

- [ ] **Step 3: Commit**

```bash
git add app/components/TopNavChrome.tsx
git commit -m "refactor(nav): drop hamburger + drawer from TopNavChrome (mobile)"
```

---

### Task 5: Add Your Grimoire + Diary to UserMenu

**Files:**
- Modify: `app/components/UserMenu.tsx`

Two new rows go between the existing `@handle` header and the existing `Admin` row, styled to match the existing `Settings` row (font-ui, 12px, var(--void) text, 10px 14px padding, hairline divider above). The order locked in the spec is: `@handle` → Your Grimoire → Diary → Admin (conditional) → Settings → Sign Out.

- [ ] **Step 1: Insert the two rows**

In `app/components/UserMenu.tsx`, find the `<Link href="/settings" ...>` block (around line 65). Immediately ABOVE the `{isAdmin && (...)}` block (around line 56), insert these two rows so the order ends up @handle → Your Grimoire → Diary → Admin → Settings → Sign Out:

Replace:

```tsx
          <Link
            href={`/p/${handle}`}
            onClick={() => setOpen(false)}
            style={{ display: "block", padding: "10px 14px", borderBottom: "1px solid var(--void)", fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--void)", textDecoration: "none" }}
          >
            @{handle}
          </Link>
          {isAdmin && (
```

With:

```tsx
          <Link
            href={`/p/${handle}`}
            onClick={() => setOpen(false)}
            style={{ display: "block", padding: "10px 14px", borderBottom: "1px solid var(--void)", fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--void)", textDecoration: "none" }}
          >
            @{handle}
          </Link>
          <Link
            href="/library"
            onClick={() => setOpen(false)}
            style={{ display: "block", padding: "10px 14px", color: "var(--void)", textDecoration: "none", fontFamily: "var(--font-ui)", fontSize: 12, borderBottom: "1px solid var(--void)" }}
          >
            Your Grimoire
          </Link>
          <Link
            href="/watched"
            onClick={() => setOpen(false)}
            style={{ display: "block", padding: "10px 14px", color: "var(--void)", textDecoration: "none", fontFamily: "var(--font-ui)", fontSize: 12, borderBottom: "1px solid var(--void)" }}
          >
            Diary
          </Link>
          {isAdmin && (
```

- [ ] **Step 2: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/components/UserMenu.tsx
git commit -m "feat(nav): UserMenu adds Your Grimoire + Diary"
```

---

### Task 6: Wire BottomNav into all pages that render TopNav

**Files (modify each, one-line addition):**
- `app/app/home/page.tsx`
- `app/app/films/page.tsx`
- `app/app/coven/page.tsx`
- `app/app/watchlist/page.tsx`
- `app/app/library/page.tsx`
- `app/app/watched/page.tsx`
- `app/app/lists/page.tsx`
- `app/app/settings/page.tsx`
- `app/app/film/[id]/page.tsx`
- `app/app/p/[handle]/page.tsx`
- `app/app/admin/layout.tsx`

The pattern: import `BottomNav` and render it immediately AFTER the existing `<TopNav ... />`, passing the same `current` value (or `undefined` when TopNav doesn't pass one — Task 7 fixes the missing-current cases).

- [ ] **Step 1: Add the import + render in `home/page.tsx`**

In `app/app/home/page.tsx`, add the import next to the existing TopNav import:

```tsx
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
```

And add the BottomNav render right after the TopNav line:

```tsx
<TopNav current="home" />
<BottomNav current="home" />
```

- [ ] **Step 2: Same pattern in `films/page.tsx`** — `current="films"`

```tsx
import BottomNav from "@/components/BottomNav";
// ...
<TopNav current="films" />
<BottomNav current="films" />
```

- [ ] **Step 3: Same in `coven/page.tsx`** — `current="coven"`

```tsx
import BottomNav from "@/components/BottomNav";
// ...
<TopNav current="coven" />
<BottomNav current="coven" />
```

- [ ] **Step 4: Same in `watchlist/page.tsx`** — `current="watchlist"` (Task 7 also adds `current="watchlist"` to the existing TopNav call)

```tsx
import BottomNav from "@/components/BottomNav";
// ...
<TopNav current="watchlist" />
<BottomNav current="watchlist" />
```

- [ ] **Step 5: Same in `library/page.tsx`** — `current="library"`

```tsx
import BottomNav from "@/components/BottomNav";
// ...
<TopNav current="library" />
<BottomNav current="library" />
```

- [ ] **Step 6: Same in `watched/page.tsx`** — `current="watched"`

```tsx
import BottomNav from "@/components/BottomNav";
// ...
<TopNav current="watched" />
<BottomNav current="watched" />
```

- [ ] **Step 7: Same in `lists/page.tsx`** — `current="lists"` (no bottom-nav tab maps to this; the bar renders with no tab lit)

```tsx
import BottomNav from "@/components/BottomNav";
// ...
<TopNav current="lists" />
<BottomNav current="lists" />
```

- [ ] **Step 8: Same in `settings/page.tsx`** — `current="settings"` (no bottom-nav tab maps; renders unlit)

```tsx
import BottomNav from "@/components/BottomNav";
// ...
<TopNav current="settings" />
<BottomNav current="settings" />
```

- [ ] **Step 9: Same in `film/[id]/page.tsx`** — `current="films"` (Task 7 also adds `current="films"` to the existing TopNav call)

```tsx
import BottomNav from "@/components/BottomNav";
// ...
<TopNav current="films" />
<BottomNav current="films" />
```

- [ ] **Step 10: Same in `p/[handle]/page.tsx`** — `current="coven"` (Task 7 also adds `current="coven"` to the existing TopNav call)

```tsx
import BottomNav from "@/components/BottomNav";
// ...
<TopNav current="coven" />
<BottomNav current="coven" />
```

- [ ] **Step 11: Same in `admin/layout.tsx`** — `current="admin"` (no bottom-nav tab maps; renders unlit; the layout wraps all `/admin/*` routes)

```tsx
import BottomNav from "@/components/BottomNav";
// ...
<TopNav current="admin" />
<BottomNav current="admin" />
```

- [ ] **Step 12: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: clean.

- [ ] **Step 13: Commit**

```bash
git add app/app/home/page.tsx app/app/films/page.tsx app/app/coven/page.tsx app/app/watchlist/page.tsx app/app/library/page.tsx app/app/watched/page.tsx app/app/lists/page.tsx app/app/settings/page.tsx app/app/film/\[id\]/page.tsx app/app/p/\[handle\]/page.tsx app/app/admin/layout.tsx
git commit -m "feat(nav): render BottomNav alongside TopNav on every authed page"
```

---

### Task 7: Fix missing `current` props on existing TopNav calls

**Files:**
- Modify: `app/app/watchlist/page.tsx` (TopNav has no `current`)
- Modify: `app/app/film/[id]/page.tsx` (TopNav has no `current`)
- Modify: `app/app/p/[handle]/page.tsx` (TopNav has no `current`)

Three pages call `<TopNav />` with no `current` today. Without `current`, neither TopNav nor BottomNav can light a tab. Adding the prop is a one-character change per page (already done as part of Task 6 since the BottomNav line uses the same value).

NOTE: Task 6's per-page snippets already showed `<TopNav current="..." />` — Task 6 deliberately set the `current` prop on these three pages to make Tasks 6 and 7 land in the same diff. **If Task 6 was implemented exactly as written above, Task 7 is already done; verify and skip.**

- [ ] **Step 1: Verify TopNav `current` props**

```bash
cd app
grep -n "TopNav" app/watchlist/page.tsx app/film/\[id\]/page.tsx app/p/\[handle\]/page.tsx
```

Expected: each shows `<TopNav current="watchlist" />`, `<TopNav current="films" />`, `<TopNav current="coven" />` respectively. If any still show `<TopNav />`, edit them per Task 6 step 4/9/10 and commit.

---

### Task 8: Local dev-server smoke

**Files:**
- (no source changes)

- [ ] **Step 1: Start the dev server**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

- [ ] **Step 2: Manual checks**

Open http://localhost:3000 and run through these checks. **Skip dev-server smoke if it's not feasible to run locally** — report DONE with a note.

Resize the browser to ≤720px width (or use device emulation):

- `/home` → FEED tab is lit (pink); other three tabs in bone color.
- Tap each tab in turn:
  - FEED → lands on `/home` (already there)
  - DISCOVERY → `/films`, DISCOVERY lit
  - COVEN → `/coven`, COVEN lit
  - HOARD → `/watchlist`, HOARD lit
- `/film/<id>` (tap any film card from `/films`) → DISCOVERY stays lit.
- `/p/<handle>` (tap any avatar) → COVEN stays lit.
- `/library` → HOARD lit (mapped from `current="library"`).
- `/watched` → HOARD lit.
- `/settings` → no tab lit.
- `/lists` → no tab lit.
- Tap avatar → dropdown shows: @handle, Your Grimoire, Diary, [Admin], Settings, Sign out. Tap Your Grimoire → routes to `/library`.
- Hamburger button is gone at mobile widths; no drawer can be opened.
- iOS PWA standalone (if testable): bottom nav sits above the home indicator; FEED page content scrolls without being clipped by the nav.

Resize ≥721px:

- Top nav inline links visible (Home, Discovery, Watchlist, Your Grimoire, Diary, Covenfolk).
- Bottom nav not visible.
- Hamburger button not visible.

- [ ] **Step 3: Verify anon viewer**

Sign out. On mobile width:
- `/films` (anon) → bottom nav not rendered (BottomNav returns null).
- `/auth/signin` (anon) → bottom nav not rendered.

- [ ] **Step 4: Stop dev server**

`Ctrl+C` in the terminal running `npm run dev`.

---

### Task 9: Push, PR, merge, deploy

**Files:**
- (no source changes)

- [ ] **Step 1: Push branch**

```bash
git fetch origin
git rebase origin/master  # if master moved while you worked
git push -u origin feature/mobile-bottom-nav
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(nav): mobile bottom nav + simplified top chrome" --body "$(cat <<'EOF'
## Summary
- New 4-tab mobile bottom nav at the 720px breakpoint: FEED / DISCOVERY / COVEN / HOARD
- HOARD routes directly to /watchlist (HOARD-unification deferred — see memory)
- Mobile top chrome trims to wordmark + drop + avatar (hamburger + drawer removed)
- UserMenu gains Your Grimoire and Diary rows
- BottomNav rendered per-page alongside TopNav, sharing the same \`current\` prop
- Source-tab inheritance: /film/[id] keeps DISCOVERY lit, /p/[handle] keeps COVEN lit
- Spec: docs/superpowers/specs/2026-04-28-mobile-bottom-nav-design.md
- Plan: docs/superpowers/plans/2026-04-28-mobile-bottom-nav.md

## Test plan
- [ ] Mobile (≤720px): four-tab bottom nav appears; tapping each tab routes correctly
- [ ] /film/<id>: DISCOVERY stays lit
- [ ] /p/<handle>: COVEN stays lit
- [ ] /library, /watched: HOARD lit
- [ ] Avatar dropdown: Your Grimoire + Diary appear and route correctly
- [ ] Hamburger gone at mobile widths
- [ ] Desktop ≥721px: top nav unchanged; bottom nav not visible
- [ ] Anon viewer: no bottom nav

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Squash-merge and delete branch**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 4: Sync local master + deploy from repo root**

```bash
git checkout master
git pull --ff-only origin master
ls -la .vercel/project.json && pwd
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel deploy --prod --yes
```

Expected: ✓ Ready. Visit https://film-goblin.vercel.app/home on a phone (or DevTools mobile emulation) to confirm the bottom nav.

---

## Acceptance criteria (manual)

- ✓ Bottom nav appears only at ≤720px and only for authed users
- ✓ Four tabs (FEED/DISCOVERY/COVEN/HOARD) route to /home, /films, /coven, /watchlist
- ✓ Active-tab styling via `aria-current="page"` + `var(--accent)` color swap
- ✓ Source-tab inheritance: /film/[id] → DISCOVERY; /p/[handle] → COVEN; /library /watched → HOARD
- ✓ Hamburger button + drawer gone at mobile widths
- ✓ Avatar dropdown gains Your Grimoire + Diary
- ✓ Desktop top nav unchanged
- ✓ iOS PWA: bottom nav sits above the home indicator (safe-area-inset-bottom honored)
- ✓ Body content not obscured by the bottom nav (mobile body padding-bottom in effect)

## Notes for the executor

- **Pure presentational change.** No DB migrations, no actions, no RLS, no types regen.
- **Per-page render pattern matches TopNav.** Don't try to render BottomNav in `app/app/layout.tsx` — that conflicts with the brainstorm decision to use the explicit `current` prop.
- **`BottomNav` is a server component** because it does its own `auth.getUser()` to short-circuit anon viewers. Don't add `"use client"`.
- **Task 6 is the bulk of the work** (11 small file edits). It's tempting to commit them one-by-one, but a single commit at the end keeps the diff readable and the bisect-friendliness intact.
- **The collections.svg icon uses two `<mask>` elements** with ids `bn-behind-middle` and `bn-behind-front` — namespaced from the original ids (`behindMiddle`, `behindFront`) to avoid collision if the same icon gets rendered twice on a page. Don't rename without checking.
- **CSS body padding** at the breakpoint (64px + safe-area) is a guess. If pages feel cramped or have extra whitespace, adjust the literal — `60px` if tighter, `72px` if more breathing room is needed.
