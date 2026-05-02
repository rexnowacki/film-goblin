# Film social meta + share button + sticky CTA

**Date:** 2026-05-01
**Status:** Spec
**Sub-project:** #31

## Background

Sub-projects #29 (`InviteFriendButton` on `/coven`) and #30 (sticky invite CTA + auto-coven-request) gave us a friend-invite loop where the SMS link → profile → signup → bond happens with one tap each end. The mirror image — sharing a *film* with a friend — has no such infrastructure.

If a user wants to text "you'd love this" to a non-FilmGoblin friend today, they paste an Apple TV URL and lose every piece of FilmGoblin context (their watch, their note, the coven score). The film page itself has no OpenGraph metadata, so even sharing the FilmGoblin URL produces a generic Vercel preview card in iMessage. There's no share button anywhere.

This sub-project adds the full loop:
1. **OpenGraph + Twitter card meta** on `/film/[id]` so any shared film URL unfurls into a poster card in iMessage / Slack / Discord / Twitter.
2. **`ShareFilmButton`** in the film actions row — Web Share API on mobile (native share sheet → SMS / Mail / AirDrop), clipboard fallback on desktop. Pre-formatted message with flavor copy.
3. **`?from=<username>` attribution** — when the sharer is logged in, the share URL includes their username. The film page reads it and renders a "<sharer> watched this in February — '<note>'" pin so the recipient sees personal context, not just a poster.
4. **Sticky CTA banner for anon viewers** — same pattern as #30's `InviteBanner`, with copy that adapts to whether `?from=` is present (referral-style if yes, generic-signup if no). When `?from=` is present, the Sign up link threads through to `/auth/signup?invite=<sharer>` so the existing #30 flow auto-creates the coven request on signup. Two PRs of infrastructure compound into one tap.

The compound payoff: a film share from Tony to Bob via SMS unfurls into a poster card. Bob taps. He sees Tony's watch + note pinned at the top, the full film context below, and a banner inviting him to sign up. He taps Sign up. He completes onboarding. He wakes up to a pending invite from Tony at the top of `/coven`. One tap accepts. They're bonded. Every step here uses infrastructure already shipped — #31 is connective tissue, not new mass.

## Goals

- Every shared `/film/[id]` URL unfurls into a clean poster card in iMessage, Slack, Discord, Twitter.
- The film page's actions row gets a `ShareFilmButton` that opens the OS share sheet on mobile (or copies to clipboard on desktop) with pre-formatted message + URL.
- When the sharer is logged in, the URL includes `?from=<their-username>`, and the recipient's view of the film page shows a personal pin with the sharer's most recent watch of that film + note + verdict.
- Anonymous visitors to `/film/[id]` see a sticky CTA banner. When `?from=<username>` is present, the banner is referral-flavored and the Sign up link wires through to the existing #30 invite-cookie flow.

## Non-goals

- `?from=` on activity rows, posters, non-film pages.
- Custom-composited OG cards (overlay text, FilmGoblin branding) via Next.js's `ImageResponse`. The bare iTunes poster is enough for v1; movie posters ARE the brand for the film.
- `og:video` for trailers (would tie into the unrelated, currently untracked `fg-trailers` work).
- Generating actual `image/png` files to share via `Web Share Files API` (`navigator.share({ files: [...] })`). iOS support is flaky; the OG-card preview in iMessage is the same UX with way less infrastructure.
- A shared `Banner` primitive abstracting `InviteBanner` (#30) and `FilmCTABanner`. Two banners doesn't justify a primitive yet.

## Scope decisions (locked during brainstorming)

| Decision | Choice | Reason |
|---|---|---|
| Scope tier | A + B + C (OG meta + share button + `?from=` attribution + sticky CTA) | The full loop. Each piece compounds with the others; shipping any subset feels half-done |
| OG image | Bare `artwork_url` (already absolute HTTPS from iTunes) | Movie posters are the brand for the film; custom cards usually look worse |
| Share button placement | `/film/[id]` actions row only | Activity-row + poster-grid shares deferred to their own sub-project |
| Sharer-watch visibility | Service-role read, ignore `broadcast_watched` | Tapping the share button IS the consent signal; `broadcast_watched` governs the passive feed, explicit shares override |
| Referral chaining (`?from=` → `?invite=`) | Yes — banner Sign up link rewrites to `/auth/signup?invite=<from>` so the existing #30 cookie + onboarding-time `coven_request` flow fires | Reuses every piece of #30; recipient who signs up via film share gets a coven request from the sharer waiting |
| Banner primitive | Don't extract yet | Two consumers with diverging copy doesn't justify abstraction |
| OG cache invalidation | Accept staleness for re-ingested artwork | iMessage caches aggressively; not worth working around for a rare case |
| Anonymous viewers' film page | Stays public (no auth gate added) | Matches `/p/[username]` precedent + the entire "share to non-users" use case requires it |

## Architecture

### A. OG + Twitter card metadata

Add `generateMetadata` to `app/app/film/[id]/page.tsx`. Next.js App Router pattern; runs server-side at request time:

```ts
import type { Metadata } from "next";

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

The hardcoded `https://film-goblin.vercel.app` mirrors the choice in `InviteFriendButton`. Move to `process.env.NEXT_PUBLIC_SITE_URL` later if domains change.

### B. ShareFilmButton + `?from=` attribution

**`app/components/ShareFilmButton.tsx`** — sibling of `InviteFriendButton`, identical fallback logic:

```ts
"use client";

import { useToast } from "./ToastProvider";

const TEMPLATE = (title: string, year: number, url: string) =>
  `the goblin's calling: ${title} (${year}). ${url}`;

interface Props {
  filmId: string;
  title: string;
  year: number;
  sharerUsername: string | null;
}

export default function ShareFilmButton({ filmId, title, year, sharerUsername }: Props) {
  const { toast } = useToast();
  const base = `https://film-goblin.vercel.app/film/${filmId}`;
  const url = sharerUsername ? `${base}?from=${encodeURIComponent(sharerUsername)}` : base;
  const message = TEMPLATE(title, year, url);

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

Renders in the existing FilmActions row alongside Recommend / Watchlist / Owned / Watched. Visible to both logged-in and anonymous viewers (anon shares get a clean URL without `?from=`).

**`?from=` plumbing on `/film/[id]/page.tsx`:**

```ts
const fromRaw = (await searchParams).from;
const fromUsername = fromRaw && /^[a-z0-9._]+$/.test(fromRaw) ? fromRaw.toLowerCase() : null;

let sharerWatch: SharerWatch | null = null;
if (fromUsername) {
  sharerWatch = await getSharerWatchForFilm(fromUsername, film.id);
}
```

`getSharerWatchForFilm(username, filmId)` is a new helper (in `app/lib/queries/watched.ts` or a new file) that uses a **service-role client** to:
1. Look up the user by username via `profiles`. If not found, return null.
2. SELECT the user's most recent `watched` row for this film: `id, watched_at, note, recommended`.
3. Return `{ username, watched_at, note, recommended }` or null if no watch row exists.

The service-role bypass of RLS is intentional — see Scope decisions.

**`SharerWatchPin` component** renders the result above the existing film hero (or as a small inset card under it):

```tsx
<div className="sharer-watch-pin">
  <div className="sharer-watch-pin-line">
    ✦ <Link href={`/p/${username}`}>{username}</Link> watched this in {monthName(watched_at)}.
  </div>
  {note && (
    <div className="sharer-watch-pin-note">&ldquo;{note}&rdquo;</div>
  )}
  {recommended !== null && (
    <span className={`sharer-watch-pin-verdict ${recommended ? "loved" : "didnt"}`}>
      {recommended ? "loved it" : "didn't love it"}
    </span>
  )}
</div>
```

Styling lives in `globals.css`. Same pink-on-bone or muted-on-dark palette as the rest of the page, depending on context.

### C. Sticky CTA banner for anon viewers

**`app/components/FilmCTABanner.tsx`** — mirror of `InviteBanner` shape, different copy:

```tsx
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

Reuses the existing `.invite-banner` CSS class from #30. No new CSS needed for the banner itself.

Rendered at the top of `/film/[id]` only when `user === null`. Sits above `<TopNav>` like `InviteBanner` does on `/p/[username]`.

### Files affected

**New:**
- `app/components/ShareFilmButton.tsx`
- `app/components/FilmCTABanner.tsx`
- `app/components/SharerWatchPin.tsx`
- `app/lib/queries/sharer-watch.ts` (or extend `app/lib/queries/watched.ts`) — `getSharerWatchForFilm` helper using service-role

**Modified:**
- `app/app/film/[id]/page.tsx` — add `generateMetadata`, read `?from=`, fetch + render `<SharerWatchPin>`, render `<FilmCTABanner>` for anon, render `<ShareFilmButton>` in actions row
- `app/lib/queries/films.ts` — make sure `getFilm` returns `description` field (verify; if not, add it to the SELECT)
- `app/app/globals.css` — `.sharer-watch-pin` rules
- `CLAUDE.md` + `docs/sub-project-history.md` — sub-project #31 row

**Untouched:**
- `coven_requests`, `_completeOnboarding`, `setInviteCookie` — all reused as-is by the `?invite=` chain
- `InviteBanner` from #30 — different shape, different consumer; not refactoring
- The `.invite-banner` CSS class from #30 — `FilmCTABanner` reuses it directly
- `FilmActions` component shape — adding one new button alongside existing ones

### Privacy notes

- The `?from=<username>` parameter is in plaintext and visible to anyone who sees the URL. Username is already public on `/p/<username>` so no new disclosure.
- The sharer-watch-pin reveals the sharer's note + verdict to the recipient. The sharer explicitly tapped Share, which is the consent signal. `broadcast_watched` does NOT gate this — it governs the passive coven feed.
- An attacker could construct `/film/<id>?from=tony` URLs without Tony's involvement. Worst case: Tony's note for that film is shown to an arbitrary visitor. Same disclosure as Tony's profile page if they have any public watches there. Acceptable.

## Tests

**New:**
- `app/tests/components/share-film-button.test.ts` — pure-function test of the URL construction (logged-in vs anon, with/without `?from=`).
- `app/tests/queries/sharer-watch.test.ts` (env-skipIf integration) — verify `getSharerWatchForFilm` returns the user's most recent watch row, returns null when user doesn't exist, returns null when the user has no watches for that film.
- `db/tests/rls/sharer-watch-service-role-bypass.test.ts` — document and verify the service-role read bypasses RLS for cross-coven readers (i.e., the pin works for non-coven recipients).

**Manual smoke (Vercel preview):**
- Open `/film/<id>` while logged in → tap **✦ Share** → on mobile, share sheet has the message + URL with `?from=<your-username>`. On desktop, clipboard has same.
- Paste the URL into iMessage → unfurls into a poster card with title + description.
- Tap the URL in incognito → film page renders with sticky banner ("@<your-username> shared this with you. Sign up to bind with their coven.") AND a sharer-watch-pin near the top showing your most recent watch + note + verdict (or no pin if you've never logged this film).
- Tap Sign up → URL is `/auth/signup?invite=<your-username>` → existing #30 flow takes it from there.
- Sign up + complete onboarding → land on /home → check /coven → pending invite from the sharer at the top.

## Risks

- **iMessage OG cache.** Already noted. Films with re-ingested artwork keep the old preview on shared links until the cache evicts.
- **Service-role read.** `getSharerWatchForFilm` bypasses RLS by design. Containing the service-role usage to one query helper that's only invoked from the film page makes this auditable. The function's contract is clearly "I am intentionally exposing a watch row regardless of broadcast settings, because the sharer tapped Share."
- **`?from=` spoofing.** Already in privacy notes. Acceptable — the sharer-watch-pin is the only effect, and it shows the same data their public profile would show if they have a public watch there.
- **The `invite-banner` CSS dependency.** `FilmCTABanner` borrows `.invite-banner`'s class. If a future sub-project diverges the banner styling for `/p/[username]`, this class will need to either fork or be renamed to something neutral like `.cta-banner`. Note for future-self.
- **Description fallback when iTunes data is sparse.** `film.description` is sometimes empty or boilerplate. The fallback `"<director>, <year>."` is short and clean — accept the reduction in unfurl prose for those films.

## Out of scope (deferred)

- `og:video` trailers integration with the `fg-trailers` work.
- Custom OG card composited via `ImageResponse` (overlay text, FilmGoblin lockup, accent border). The bare poster works.
- `?from=` on activity rows, poster grids, profile-page film mentions.
- A general-purpose `Banner` primitive abstracting `InviteBanner` + `FilmCTABanner`.
- Tracking which `?from=` clicks convert to signups.

## Open questions

None. All scope decisions locked during brainstorming.
