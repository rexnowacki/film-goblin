# Film Social Meta + Share Button + Sticky CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenGraph metadata + a share button + `?from=<username>` attribution + a sticky CTA banner for anon viewers to `/film/[id]`, so any shared film URL unfurls into a poster card with personal context and converts anon viewers via the existing #30 invite-cookie flow.

**Architecture:** `generateMetadata` returns OG/Twitter card meta with the film's iTunes artwork as `og:image`. `ShareFilmButton` wraps `navigator.share` with a clipboard fallback and constructs the URL with `?from=<viewer-username>` when logged in. `getSharerWatchForFilm` is a service-role query helper (bypasses RLS by design — explicit-share consent overrides `broadcast_watched`) that fetches the sharer's most recent watch row for the film. `SharerWatchPin` renders the result above the hero. `FilmCTABanner` mirrors the #30 InviteBanner shape, with copy and Sign-up href that adapt to whether `?from=` is present.

**Tech Stack:** Next.js 15 App Router (`generateMetadata`, async `searchParams`), TypeScript, existing Supabase service-role client.

**Spec:** `docs/superpowers/specs/2026-05-01-film-social-meta-share-design.md`

**Branch (already created):** `feature/film-social-meta-share`

---

## File Structure

**Created:**
- `app/components/ShareFilmButton.tsx` — share button with Web Share + clipboard fallback. Exports a pure helper `buildShareUrl` for testability.
- `app/components/FilmCTABanner.tsx` — sticky CTA banner for anon viewers, copy adapts to `?from=` presence.
- `app/components/SharerWatchPin.tsx` — small inset card rendering the sharer's most recent watch + note + verdict.
- `app/lib/queries/sharer-watch.ts` — service-role helper `getSharerWatchForFilm`.
- `app/tests/components/share-film-button.test.ts` — pure-function test of URL construction.
- `app/tests/queries/sharer-watch.test.ts` — env-skipIf integration verifying the helper's lookup logic.

**Modified:**
- `app/app/film/[id]/page.tsx` — add `generateMetadata`, fetch viewer profile (for `?from=`-target username), parse `?from=`, fetch sharer watch, render banner + pin + share button.
- `app/app/globals.css` — add `.sharer-watch-pin` rules.
- `CLAUDE.md` + `docs/sub-project-history.md` — sub-project #31 row.

**Untouched:**
- `coven_requests`, `_completeOnboarding`, `setInviteCookie`, `InviteBanner` — all reused as-is by the `?invite=` chain when the FilmCTABanner's Sign up link fires.
- The `.invite-banner` CSS class — `FilmCTABanner` reuses it.
- `FilmActions` component shape.

---

### Task 1: Pure URL-builder helper + unit test for `ShareFilmButton`

**Files:**
- Create: `app/components/ShareFilmButton.tsx` (helper-only first; component in Task 2)
- Create: `app/tests/components/share-film-button.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/christophernowacki/film-goblin/app/tests/components/share-film-button.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildShareUrl, buildShareMessage } from "@/components/ShareFilmButton";

describe("buildShareUrl", () => {
  it("returns plain film URL when no sharer username", () => {
    expect(buildShareUrl("abc123", null)).toBe("https://film-goblin.vercel.app/film/abc123");
  });

  it("appends ?from= when sharer username is present", () => {
    expect(buildShareUrl("abc123", "teethtony")).toBe("https://film-goblin.vercel.app/film/abc123?from=teethtony");
  });

  it("URL-encodes the sharer username", () => {
    expect(buildShareUrl("abc123", "weird.name")).toBe("https://film-goblin.vercel.app/film/abc123?from=weird.name");
  });
});

describe("buildShareMessage", () => {
  it("formats title, year, and URL", () => {
    expect(buildShareMessage("Suspiria", 2018, "https://example.com/x")).toBe("the goblin's calling: Suspiria (2018). https://example.com/x");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `/Users/christophernowacki/film-goblin/app/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/components/share-film-button.test.ts
```
Expected: FAIL — `ShareFilmButton` module not found.

- [ ] **Step 3: Write the minimal helper module**

Create `/Users/christophernowacki/film-goblin/app/components/ShareFilmButton.tsx`:

```typescript
"use client";

import { useToast } from "./ToastProvider";

const SITE_ORIGIN = "https://film-goblin.vercel.app";

export function buildShareUrl(filmId: string, sharerUsername: string | null): string {
  const base = `${SITE_ORIGIN}/film/${filmId}`;
  return sharerUsername ? `${base}?from=${encodeURIComponent(sharerUsername)}` : base;
}

export function buildShareMessage(title: string, year: number, url: string): string {
  return `the goblin's calling: ${title} (${year}). ${url}`;
}

interface Props {
  filmId: string;
  title: string;
  year: number;
  sharerUsername: string | null;
}

export default function ShareFilmButton({ filmId, title, year, sharerUsername }: Props) {
  const { toast } = useToast();
  const url = buildShareUrl(filmId, sharerUsername);
  const message = buildShareMessage(title, year, url);

  async function share() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text: message });
        toast("Sharing…");
        return;
      }
      await navigator.clipboard.writeText(message);
      toast("Link copied");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") return;
      toast("Copy failed");
    }
  }

  return (
    <button type="button" className="btn btn-sm" onClick={share}>
      ✦ Share
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/components/share-film-button.test.ts
```
Expected: PASS (4 specs).

- [ ] **Step 5: Typecheck the rest of the codebase**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

From repo root `/Users/christophernowacki/film-goblin`:
```
git add app/components/ShareFilmButton.tsx app/tests/components/share-film-button.test.ts
git commit -m "feat(film): ShareFilmButton + URL helper unit test"
```

Use `git commit -F /tmp/msg.txt` if heredoc commits mangle.

---

### Task 2: `getSharerWatchForFilm` service-role query helper + integration test

**Files:**
- Create: `app/lib/queries/sharer-watch.ts`
- Create: `app/tests/queries/sharer-watch.test.ts`

- [ ] **Step 1: Write the helper**

Create `/Users/christophernowacki/film-goblin/app/lib/queries/sharer-watch.ts`:

```typescript
import { serviceRoleClient } from "@/lib/supabase/service-role";

export interface SharerWatch {
  username: string;
  watched_at: string;
  note: string | null;
  recommended: boolean | null;
}

/**
 * Fetches the named user's most recent watch row for the given film.
 *
 * Uses the service-role client to BYPASS RLS by design. Rationale: when a
 * user explicitly taps Share on a film page, that tap is the consent
 * signal; their `broadcast_watched` setting governs the passive coven
 * feed, not explicit shares. The recipient — who is typically outside the
 * sharer's coven — needs to see the watch context for the share to be
 * meaningful at all.
 *
 * Containing this single privacy override to one helper makes the
 * exposure auditable. Returns null silently for invalid usernames,
 * unknown users, or users with no watch row for this film.
 */
export async function getSharerWatchForFilm(
  username: string,
  filmId: string,
): Promise<SharerWatch | null> {
  const admin = serviceRoleClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, username")
    .ilike("username", username)
    .maybeSingle();
  if (!profile) return null;

  const { data: watch } = await admin
    .from("watched")
    .select("watched_at, note, recommended")
    .eq("user_id", profile.id)
    .eq("film_id", filmId)
    .order("watched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!watch) return null;

  return {
    username: profile.username,
    watched_at: watch.watched_at,
    note: watch.note,
    recommended: watch.recommended,
  };
}
```

- [ ] **Step 2: Write the integration test**

Create `/Users/christophernowacki/film-goblin/app/tests/queries/sharer-watch.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getSharerWatchForFilm } from "@/lib/queries/sharer-watch";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let filmId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ itunes_id: 950000 + Math.floor(Math.random() * 50000), title: "Sharer Test", director: "D", year: 2024 })
    .select("id")
    .single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  if (filmId) await adminClient().from("films").delete().eq("id", filmId);
  if (userA?.id) await deleteTestUser(userA.id);
});

describe.skipIf(!hasEnv)("getSharerWatchForFilm", () => {
  it("returns null when username doesn't exist", async () => {
    const result = await getSharerWatchForFilm("nonexistent_user_xyz", filmId);
    expect(result).toBeNull();
  });

  it("returns null when user exists but has no watches for this film", async () => {
    const result = await getSharerWatchForFilm(userA.username, filmId);
    expect(result).toBeNull();
  });

  it("returns the most recent watch when one exists", async () => {
    const admin = adminClient();
    await admin.from("watched").insert([
      { user_id: userA.id, film_id: filmId, watched_at: "2026-02-01", note: "the older one", recommended: true },
      { user_id: userA.id, film_id: filmId, watched_at: "2026-04-15", note: "the newer one", recommended: true },
    ]);

    const result = await getSharerWatchForFilm(userA.username, filmId);
    expect(result).not.toBeNull();
    expect(result?.username).toBe(userA.username);
    expect(result?.watched_at).toBe("2026-04-15");
    expect(result?.note).toBe("the newer one");
    expect(result?.recommended).toBe(true);

    await admin.from("watched").delete().eq("user_id", userA.id).eq("film_id", filmId);
  });

  it("ignores broadcast_watched (service-role bypass)", async () => {
    const admin = adminClient();
    await admin.from("profiles").update({ broadcast_watched: false }).eq("id", userA.id);
    await admin.from("watched").insert({ user_id: userA.id, film_id: filmId, watched_at: "2026-03-01", note: "private", recommended: false });

    const result = await getSharerWatchForFilm(userA.username, filmId);
    expect(result).not.toBeNull();
    expect(result?.note).toBe("private");

    await admin.from("watched").delete().eq("user_id", userA.id).eq("film_id", filmId);
    await admin.from("profiles").update({ broadcast_watched: true }).eq("id", userA.id);
  });
});
```

- [ ] **Step 3: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS.

- [ ] **Step 4: Run the test (will skip locally without env)**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/sharer-watch.test.ts
```
Expected: skipped locally OR pass if env present. `describe.skipIf` reports green-skipped.

- [ ] **Step 5: Commit**

```
git add app/lib/queries/sharer-watch.ts app/tests/queries/sharer-watch.test.ts
git commit -m "feat(queries): getSharerWatchForFilm + service-role privacy override"
```

---

### Task 3: `SharerWatchPin` component + CSS

**Files:**
- Create: `app/components/SharerWatchPin.tsx`
- Modify: `app/app/globals.css`

- [ ] **Step 1: Write the component**

Create `/Users/christophernowacki/film-goblin/app/components/SharerWatchPin.tsx`:

```typescript
import Link from "next/link";
import type { SharerWatch } from "@/lib/queries/sharer-watch";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthName(isoDate: string): string {
  const m = Number(isoDate.slice(5, 7));
  return Number.isFinite(m) && m >= 1 && m <= 12 ? MONTHS[m - 1] : "the past";
}

interface Props {
  watch: SharerWatch;
}

export default function SharerWatchPin({ watch }: Props) {
  return (
    <div className="sharer-watch-pin">
      <div className="sharer-watch-pin-line">
        ✦{" "}
        <Link href={`/p/${encodeURIComponent(watch.username)}`} className="sharer-watch-pin-username">
          {watch.username}
        </Link>{" "}
        watched this in {monthName(watch.watched_at)}.
        {watch.recommended !== null && (
          <span className={`sharer-watch-pin-verdict ${watch.recommended ? "loved" : "didnt"}`}>
            {watch.recommended ? "loved it" : "didn't love it"}
          </span>
        )}
      </div>
      {watch.note && (
        <div className="sharer-watch-pin-note">&ldquo;{watch.note}&rdquo;</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Append CSS**

Append to `/Users/christophernowacki/film-goblin/app/app/globals.css`:

```css

/* ===== SHARER WATCH PIN =====
   Small inset card on /film/[id] when ?from=<username> is present and that
   user has a watch row for this film. Service-role read; see
   app/lib/queries/sharer-watch.ts for privacy reasoning. */

.sharer-watch-pin {
  background: rgba(255, 45, 136, 0.08);
  border-left: 3px solid var(--accent);
  padding: 12px 16px;
  margin-bottom: 16px;
  border-radius: 0 4px 4px 0;
}
.sharer-watch-pin-line {
  font-family: var(--font-ui);
  font-size: 14px;
  color: var(--bone);
}
.sharer-watch-pin-username {
  color: var(--accent);
  font-weight: 700;
  text-decoration: none;
}
.sharer-watch-pin-verdict {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 6px;
  font-family: var(--font-ui);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}
.sharer-watch-pin-verdict.loved {
  background: var(--accent);
  color: var(--accent-ink);
}
.sharer-watch-pin-verdict.didnt {
  background: var(--blood);
  color: var(--bone);
}
.sharer-watch-pin-note {
  margin-top: 6px;
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 13px;
  color: var(--bone);
  opacity: 0.9;
}
```

- [ ] **Step 3: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```
git add app/components/SharerWatchPin.tsx app/app/globals.css
git commit -m "feat(film): SharerWatchPin component for ?from= attribution"
```

---

### Task 4: `FilmCTABanner` component (reuses `.invite-banner` CSS)

**Files:**
- Create: `app/components/FilmCTABanner.tsx`

- [ ] **Step 1: Write the component**

Create `/Users/christophernowacki/film-goblin/app/components/FilmCTABanner.tsx`:

```typescript
"use client";

interface Props {
  fromUsername: string | null;
}

export default function FilmCTABanner({ fromUsername }: Props) {
  const isReferral = fromUsername !== null;
  const text = isReferral ? (
    <><strong>@{fromUsername}</strong> shared this with you. Sign up to bind with their coven.</>
  ) : (
    <>Track this on Film Goblin. Get a ping when the price drops.</>
  );
  const href = isReferral
    ? `/auth/signup?invite=${encodeURIComponent(fromUsername)}`
    : `/auth/signup`;

  return (
    <div className="invite-banner" role="region" aria-label="Sign up CTA">
      <div className="invite-banner-text">{text}</div>
      <a href={href} className="btn btn-sm">Sign up</a>
    </div>
  );
}
```

Reuses the existing `.invite-banner` CSS class shipped in sub-project #30. No new CSS needed.

- [ ] **Step 2: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```
git add app/components/FilmCTABanner.tsx
git commit -m "feat(film): FilmCTABanner — sticky CTA for anon viewers w/ ?from= referral chaining"
```

---

### Task 5: Wire everything into `/film/[id]/page.tsx`

**Files:**
- Modify: `app/app/film/[id]/page.tsx`

- [ ] **Step 1: Add imports**

Open `/Users/christophernowacki/film-goblin/app/app/film/[id]/page.tsx`. Near the existing component imports, add:

```typescript
import type { Metadata } from "next";
import { getMyProfile } from "@/lib/queries/profiles";
import { getSharerWatchForFilm } from "@/lib/queries/sharer-watch";
import ShareFilmButton from "@/components/ShareFilmButton";
import SharerWatchPin from "@/components/SharerWatchPin";
import FilmCTABanner from "@/components/FilmCTABanner";
```

- [ ] **Step 2: Add `generateMetadata`**

Insert this function near the top of the file, before `export default async function FilmDetailPage`:

```typescript
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const film = await getFilm(supabase, id);
  if (!film) return { title: "Film Goblin" };

  const title = `${film.title} (${film.year})`;
  const description = film.description?.trim() || `${film.director}, ${film.year}.`;
  const url = `https://film-goblin.vercel.app/film/${film.id}`;

  return {
    title: `${title} — Film Goblin`,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: film.artwork_url, alt: film.title }],
      type: "video.movie",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [film.artwork_url],
    },
  };
}
```

- [ ] **Step 3: Update the page's `searchParams` + viewer-profile fetch**

Find the page function signature. It currently is something like `export default async function FilmDetailPage({ params }: { params: Promise<{ id: string }> })`. Update it to also accept `searchParams`:

```typescript
export default async function FilmDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from: fromRaw } = await searchParams;
  const fromUsername = fromRaw && /^[a-z0-9._]+$/.test(fromRaw) ? fromRaw.toLowerCase() : null;
```

Then in the existing block that fetches user-scoped data, add `getMyProfile` and `getSharerWatchForFilm`:

Replace:
```typescript
  const [covenMembers, onList, owned, watchCount, topCovenMemberIds] = user
    ? await Promise.all([
        getMyCovenMembers(supabase, user.id),
        isOnWatchlist(supabase, id),
        isInLibrary(supabase, user.id, id),
        getWatchCountForFilm(supabase, user.id, id),
        getTopRecommendedCovenMemberIds(supabase, user.id),
      ])
    : [[], false, false, 0, [] as string[]];
```

With:
```typescript
  const [covenMembers, onList, owned, watchCount, topCovenMemberIds, myProfile] = user
    ? await Promise.all([
        getMyCovenMembers(supabase, user.id),
        isOnWatchlist(supabase, id),
        isInLibrary(supabase, user.id, id),
        getWatchCountForFilm(supabase, user.id, id),
        getTopRecommendedCovenMemberIds(supabase, user.id),
        getMyProfile(supabase),
      ])
    : [[], false, false, 0, [] as string[], null];

  const sharerWatch = fromUsername ? await getSharerWatchForFilm(fromUsername, id) : null;
```

- [ ] **Step 4: Render the banner + pin + share button**

Find the page's `return (` block. The outermost wrapper is similar to:

```tsx
  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav .../>
      ...
```

Insert the banner immediately after the opening `<div>` and BEFORE `<TopNav>`:

```tsx
      {!user && <FilmCTABanner fromUsername={fromUsername} />}
```

Then locate the place where the film hero / actions row is rendered. Insert the `<SharerWatchPin>` ABOVE the hero (or in the most natural top-of-content spot — likely right under the page header / inside the `container-wide` block before the film title h1). Insert:

```tsx
      {sharerWatch && <SharerWatchPin watch={sharerWatch} />}
```

In the existing `<div className="hero-actions">` block (around line 96), add the share button. It should appear for both logged-in AND anonymous viewers (sharing is universal):

Replace:
```tsx
            <div className="hero-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              {user && <FilmActions filmId={film.id} filmTitle={film.title} initialOnWatchlist={onList} initialOwned={owned} initialWatchCount={watchCount} />}
              {user && <RecommendModal
                filmId={film.id}
                filmTitle={film.title}
                covenMembers={covenMembers.map(m => ({ id: m.id, username: m.username, display_name: m.display_name, avatar_url: m.avatar_url }))}
                topCovenMemberIds={topCovenMemberIds}
              />}
              {film.itunes_url && (
                <a href={film.itunes_url} target="_blank" rel="noreferrer" className="btn btn-lg">
                  Buy on Apple TV →
                </a>
              )}
```

With:
```tsx
            <div className="hero-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              {user && <FilmActions filmId={film.id} filmTitle={film.title} initialOnWatchlist={onList} initialOwned={owned} initialWatchCount={watchCount} />}
              {user && <RecommendModal
                filmId={film.id}
                filmTitle={film.title}
                covenMembers={covenMembers.map(m => ({ id: m.id, username: m.username, display_name: m.display_name, avatar_url: m.avatar_url }))}
                topCovenMemberIds={topCovenMemberIds}
              />}
              <ShareFilmButton
                filmId={film.id}
                title={film.title}
                year={film.year}
                sharerUsername={myProfile?.username ?? null}
              />
              {film.itunes_url && (
                <a href={film.itunes_url} target="_blank" rel="noreferrer" className="btn btn-lg">
                  Buy on Apple TV →
                </a>
              )}
```

`myProfile` is `null` when the viewer is anonymous; the `?? null` ensures the button still renders without a `?from=` parameter for anon shares.

- [ ] **Step 5: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS.

- [ ] **Step 6: Run full app test suite**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: 124 passed / 61 skipped (+ 4 new from Task 1 — `share-film-button.test.ts`). No regressions.

- [ ] **Step 7: Commit**

```
git add 'app/app/film/[id]/page.tsx'
git commit -m "feat(film): wire OG meta + share button + sharer pin + CTA banner into /film/[id]"
```

(Quote the bracketed path; zsh expands `[...]` as a glob otherwise.)

---

### Task 6: Update CLAUDE.md + open PR

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/sub-project-history.md`

- [ ] **Step 1: Append sub-project #31 row to history**

Open `/Users/christophernowacki/film-goblin/docs/sub-project-history.md`. After the `| 30 |` row, append:

```markdown
| 31 | Film social meta + share button + sticky CTA — `generateMetadata` on `/film/[id]` returns OG/Twitter card meta with iTunes artwork as `og:image`, so any shared film URL unfurls into a poster card in iMessage / Slack / Discord / Twitter. New `ShareFilmButton` (Web Share + clipboard fallback) constructs URLs as `/film/<id>?from=<viewer-username>` when logged in. Page reads `?from=`, calls new service-role helper `getSharerWatchForFilm` (deliberately bypasses `broadcast_watched` because the share tap is the consent signal), renders `SharerWatchPin` with the sharer's most recent watch + note + verdict above the hero. Anon viewers also see `FilmCTABanner` — copy adapts to whether `?from=` is present, and when present the Sign up link threads `/auth/signup?invite=<from>` so the existing #30 invite-cookie flow auto-creates a coven request on signup. End-to-end: SMS share → iMessage poster card → tap → film page with sharer's pin + CTA → sign up → onboarding → coven request from sharer waiting. | `2026-05-01-film-social-meta-share-design.md` |
```

- [ ] **Step 2: Update CLAUDE.md "Last updated"**

In `/Users/christophernowacki/film-goblin/CLAUDE.md`:

```markdown
**Last updated:** 2026-05-01 (sub-projects #25–#31 — comment polish+likes, username standardization, like_on_comment notification, modal visual unification, RecommendModal picker, sticky invite CTA + auto-coven-request, film social meta + share)
```

- [ ] **Step 3: Commit + push**

```
git add CLAUDE.md docs/sub-project-history.md
git commit -m "docs(claude): note sub-project #31 — film social meta + share button"
git push -u origin feature/film-social-meta-share
```

- [ ] **Step 4: Open PR**

Write the body to `/tmp/pr-body-31.md`:

```markdown
## Summary

Sub-project #31 — film social meta + share button + sticky CTA. Closes the inverse-loop of #29/#30: instead of inviting a friend, you share a film with them, and the existing #30 infrastructure makes the conversion magic.

- **OpenGraph + Twitter card metadata** on `/film/[id]` via `generateMetadata`. iTunes `artwork_url` as the og:image — iMessage/Slack/Discord/Twitter unfurl shared URLs into clean poster cards.
- **`ShareFilmButton`** in the film actions row: Web Share API on mobile (native share sheet), clipboard fallback on desktop. Pre-formatted message with FilmGoblin flavor copy. URL is `/film/<id>?from=<viewer-username>` when logged in, plain `/film/<id>` when anon.
- **`?from=` attribution**: page reads the param, calls the new `getSharerWatchForFilm` service-role helper (deliberately bypasses `broadcast_watched` because the share tap is the consent signal — see helper docstring for full reasoning), renders `SharerWatchPin` with the sharer's most recent watch + note + verdict above the hero.
- **`FilmCTABanner`** for anon viewers — same shape as #30's InviteBanner, copy adapts: generic "Track this on Film Goblin" when no `?from=`, referral-flavored "@&lt;sharer&gt; shared this with you" when present. The referral path's Sign up link routes to `/auth/signup?invite=<sharer>`, threading directly into the #30 invite-cookie → onboarding → auto-coven-request flow.
- **Compound payoff**: SMS share → iMessage unfurls poster card → recipient taps → sees sharer's watch + note pinned + film context + sign-up banner → signs up → completes onboarding → wakes up to a pending coven invite from the sharer at the top of /coven. Every step uses primitives shipped in #29/#30. No new schema, no new RLS, no new triggers.

## Test plan

- [x] `cd app && npm run typecheck` clean
- [x] `cd app && npm test` — 4 new picker-search-style URL builder specs + 4 env-skipIf integration specs for the sharer-watch query
- [ ] Manual smoke on Vercel preview: open `/film/<id>` while logged in → tap **✦ Share** → on mobile, share sheet has flavor copy + URL with `?from=<your-username>`. Paste into iMessage → unfurls into a poster card. Tap the URL in incognito → film page renders with sharer-watch-pin + sticky CTA banner. Tap Sign up → URL is `/auth/signup?invite=<your-username>` → existing #30 flow → onboarding → /coven shows pending invite.
```

Then run:
```
gh pr create --title "feat: film social meta + share button + sticky CTA" --body-file /tmp/pr-body-31.md
```

- [ ] **Step 5: Done.** Report PR URL back.

---

## Self-Review

**1. Spec coverage:**
- Spec §"A. OpenGraph + Twitter card metadata" → Task 5 Step 2.
- Spec §"B. ShareFilmButton + ?from= attribution" → Task 1 (component + helper) + Task 5 Step 4 (wiring).
- Spec §"C. Sticky CTA banner for anon viewers" → Task 4 (component) + Task 5 Step 4 (wiring).
- Spec §"`?from=` plumbing on `/film/[id]/page.tsx`" → Task 5 Step 3 (searchParams parse) + Task 5 Step 3 (sharer-watch fetch).
- Spec §"SharerWatchPin component" → Task 3.
- Spec §"`getSharerWatchForFilm` service-role" → Task 2.
- Spec §"Privacy notes / service-role bypass" → encoded in helper docstring (Task 2 Step 1) + tested in Task 2 Step 2 (`ignores broadcast_watched (service-role bypass)` spec).
- Spec §"Tests" — Task 1 (URL builder), Task 2 (sharer-watch integration). Manual smoke in Task 6's PR body.
- Spec §"Risks / iMessage OG cache / `?from=` spoofing / banner CSS reuse" — runtime concerns, no specific task action required.
- CLAUDE.md + history → Task 6.

All spec sections covered.

**2. Placeholder scan:** No "TBD" / "TODO" / "Similar to Task N" markers. Every code block is the literal replacement content.

**3. Type consistency:**
- `SharerWatch` interface declared in Task 2 (`app/lib/queries/sharer-watch.ts`), imported in Task 3 (`SharerWatchPin`).
- `buildShareUrl(filmId, sharerUsername | null)` signature consistent across Task 1 (helper + tests) and Task 5 Step 4 (wiring passes `myProfile?.username ?? null`).
- `getSharerWatchForFilm(username, filmId)` signature consistent across Task 2 (definition) and Task 5 Step 3 (call site).
- `fromUsername` prop on `FilmCTABanner` is `string | null`; Task 5 Step 4 passes `fromUsername` (already typed as `string | null`).
- `FilmActions` and `RecommendModal` prop shapes unchanged — only adding `<ShareFilmButton>` alongside.

No drift detected.
