# Sticky invite CTA + auto-coven-request on signup

**Date:** 2026-05-01
**Status:** Spec
**Sub-project:** #30

## Background

Sub-project #29's `InviteFriendButton` (PR #97) generates an SMS-shareable invite that points at the inviter's `/p/<username>` profile. The recipient lands on a public profile page and sees the inviter's content firsthand — strong personal context, low friction. But there are two gaps:

1. **No clear next action.** The page renders normally for anonymous viewers, with TopNav offering Sign in / Sign up like any other page. Nothing tells the recipient "you were invited; sign up to bind with this person."
2. **No structural connection on signup.** Even if the recipient signs up, they have to manually navigate to `/coven`, search for the inviter, and send a coven request — undoing the whole point of the soft-referral approach. The link's intent is "let's be coven mates"; the current flow loses that intent at the auth boundary.

This sub-project closes both gaps: a sticky CTA banner on `/p/[username]` for anonymous viewers, and an auto-created `coven_request` from the inviter to the new user during signup.

## Goal

When user A shares an invite link to user B (a non-FilmGoblin person):
1. B lands on A's profile and sees a sticky `<A's username> invited you to Film Goblin → Sign up to bind with their coven.` banner above the profile h1.
2. B taps the banner's Sign up button → arrives at signup with the invite context preserved.
3. B completes signup + onboarding.
4. The system creates a `coven_request` from A → B.
5. B sees a pending invite from A at the top of `/coven` and a `coven_invite_pending` bell notification (the existing trigger fires automatically on the request insert).
6. B taps Accept → bond formed via the standard flow → A gets the existing `coven_invite_accepted` notification.

The connection is a single tap from being formed once B has signed up.

## Non-goals

- Tracking invite-click → conversion metrics. Analytics is out of scope.
- A `source` column on `coven_requests` distinguishing invite-link requests from manual ones. The mental model for both is identical from the recipient's POV; the distinction can be added later if a real product question requires it.
- Auto-binding (option C from brainstorming): skipping the request and inserting `coven_members` directly. Bidirectional explicit consent matches the existing schema design and the user's mental model of "I accepted them."
- Sending the new user a welcome notification mentioning the inviter beyond the standard `coven_invite_pending` row.
- Cookie banner / consent flow. The 1-hour signup-flow cookie is strictly-necessary tied to user-initiated action.

## Scope decisions (locked during brainstorming)

| Decision | Choice | Reason |
|---|---|---|
| Auto-bind vs auto-request vs manual | Auto-create `coven_request` from inviter → new user (option B) | Threads the needle: inviter expressed intent by generating the link; new user expressed intent by signing up via the link; the explicit accept-tap on the pending invite is the final consent |
| Banner placement | Sticky at the top of `/p/[username]`, only when `user === null` | First thing visible; survives scrolling the profile content |
| Invite token storage | Short-lived `fg_invite` HttpOnly cookie set at signup-form-submit, 1 hour TTL | Survives email-confirm bounce; cleaner than threading query params through redirects; honors HttpOnly + Secure |
| When the request is created | In `_completeOnboarding`, after the user finishes onboarding | User profile is fully created; if they bail mid-onboarding, no orphan request |
| Insert privilege | Service-role client inserts the `coven_request` row | RLS scopes inserts to the inviter's session; the inviter isn't logged in during the new user's onboarding. Direct service-role insert is the only path |
| Idempotency | Skip if request already exists in either direction OR users are already coven members OR inviter == new user OR inviter username doesn't exist | All silent skips; never breaks signup |
| Username regex on the param | `/^[a-z0-9._]+$/` (existing constraint) | Treat anything else as absent; no error path needed |
| Notification | The existing trigger on `coven_requests` insert fires `coven_invite_pending` automatically | No new notification kind |

## Architecture

### Sticky banner component — `app/components/InviteBanner.tsx`

```tsx
"use client";

interface Props {
  inviterUsername: string;
}

export default function InviteBanner({ inviterUsername }: Props) {
  return (
    <div className="invite-banner">
      <div className="invite-banner-text">
        <strong>@{inviterUsername}</strong> invited you to Film Goblin.{" "}
        <span className="invite-banner-sub">Sign up to bind with their coven.</span>
      </div>
      <a
        href={`/auth/signup?invite=${encodeURIComponent(inviterUsername)}`}
        className="btn btn-sm"
      >
        Sign up
      </a>
    </div>
  );
}
```

Wired into `app/app/p/[username]/page.tsx`: render at the top of the page when `user === null`. It already fetches the user via `getServerUser()` for follow/coven state.

CSS in `globals.css`:
```css
.invite-banner {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--accent);
  color: var(--accent-ink);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  border-bottom: 2px solid var(--void);
}
.invite-banner-text {
  font-family: var(--font-ui);
  font-size: 14px;
}
.invite-banner-sub {
  opacity: 0.85;
  font-style: italic;
}
@media (max-width: 720px) {
  .invite-banner { padding: 10px 12px; font-size: 13px; }
}
```

### Invite cookie helper — `app/lib/actions/invite-cookie.ts`

Small wrapper around Next.js `cookies()`:

```typescript
"use server";

import { cookies } from "next/headers";

const NAME = "fg_invite";
const MAX_AGE_SECONDS = 60 * 60; // 1 hour

const USERNAME_RE = /^[a-z0-9._]+$/;

export async function setInviteCookie(username: string): Promise<void> {
  if (!USERNAME_RE.test(username)) return;
  const c = await cookies();
  c.set(NAME, username, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function readInviteCookie(): Promise<string | null> {
  const c = await cookies();
  return c.get(NAME)?.value ?? null;
}

export async function clearInviteCookie(): Promise<void> {
  const c = await cookies();
  c.delete(NAME);
}
```

### Signup form — `app/app/auth/signup/page.tsx`

Read `searchParams.invite`. Pass through to the form as a hidden input. The existing `signUp` server action already accepts FormData; pull the invite username from there and call `setInviteCookie` if valid.

Pseudocode for the form:
```tsx
const inviteRaw = (await searchParams).invite;
const invite = inviteRaw && /^[a-z0-9._]+$/.test(inviteRaw) ? inviteRaw : null;

return (
  <form action={signUp}>
    {/* existing fields */}
    {invite && <input type="hidden" name="invite" value={invite} />}
  </form>
);
```

In `signUp` action: after successful user creation, if `formData.get("invite")` is a valid username, `setInviteCookie(invite)`. Wrapped in try/catch so a cookie failure never breaks signup.

### Onboarding — `app/lib/actions/onboarding.ts`

After the existing `_completeOnboarding` body finishes (user profile populated, `onboarded_at` set), do the invite handoff:

```typescript
const inviteUsername = await readInviteCookie();
if (inviteUsername) {
  try {
    await maybeCreateInviteCovenRequest({
      newUserId: user.id,
      inviterUsername: inviteUsername,
    });
  } finally {
    await clearInviteCookie();
  }
}
```

`maybeCreateInviteCovenRequest` is a new helper (in the same file or a sibling) that:
1. Looks up the inviter by username via service-role client.
2. If not found, return silently.
3. If `inviter.id === newUserId`, return silently.
4. Check `coven_members` for an existing bond in either direction. If exists, return silently.
5. Check `coven_requests` for an existing pending request in either direction. If exists, return silently.
6. INSERT into `coven_requests` (`from_user_id = inviter.id`, `to_user_id = newUserId`, `status = 'pending'`) via service-role.
7. The existing `notify_coven_request_pending` trigger on `coven_requests` insert (mig 0126 area) fires the `coven_invite_pending` notification automatically. No work needed here.

The service-role client is already used in this file for the username uniqueness pre-check at signup time; the pattern is established.

### `/p/[username]/page.tsx` integration

```tsx
const user = await getServerUser();
const isAnon = !user;
return (
  <div ...>
    {isAnon && <InviteBanner inviterUsername={bundle.profile.username} />}
    <TopNav .../>
    {/* existing content */}
  </div>
);
```

The banner sits ABOVE TopNav (sticky position naturally floats it over content as the visitor scrolls). On a logged-in viewer, it's not rendered, no layout shift.

### Files affected

**New:**
- `app/components/InviteBanner.tsx`
- `app/lib/actions/invite-cookie.ts`
- `db/tests/rls/onboarding-invite-flow.test.ts` (testcontainers)

**Modified:**
- `app/app/p/[username]/page.tsx` (render banner for anon viewers)
- `app/app/auth/signup/page.tsx` (read query param, pass through to form)
- `app/lib/actions/auth.ts` or wherever `signUp` lives (call `setInviteCookie` after successful user creation)
- `app/lib/actions/onboarding.ts` (in `_completeOnboarding`: read cookie, call `maybeCreateInviteCovenRequest`, clear cookie)
- `app/app/globals.css` (add `.invite-banner` rules)
- `CLAUDE.md` + `docs/sub-project-history.md` (sub-project #30 row)

**Untouched:**
- `coven_requests` schema. Existing `(from_user_id, to_user_id, status, ...)` shape is sufficient.
- `sendCovenRequest` server action. Onboarding bypasses it.
- `coven_invite_pending` notification trigger. Auto-fires on the new request.
- `InviteFriendButton` (PR #97). The link target stays `/p/<username>`; the banner is what changes.
- `redirect-after-signup` flow. Onboarding-then-home stays the same.

## Tests

**New: `db/tests/rls/onboarding-invite-flow.test.ts`** — testcontainers Postgres, exercises the helper logic via service-role inserts + RLS reads:

1. Happy path: insert two profiles (A, B). Service-role insert a `coven_request` from A → B. Confirm row exists. Confirm `coven_invite_pending` notification appears for B (existing trigger).
2. Idempotency — duplicate request: insert one request, attempt second, confirm only one row remains (or the helper should skip; either is acceptable per `coven_requests`'s unique constraint, if one exists; if not, the helper is responsible for the dedupe).
3. Idempotency — already coven members: bond A and B via `coven_members`, attempt the helper, confirm zero `coven_requests` inserted.
4. Idempotency — request in opposite direction: insert B → A, attempt helper for A → B, confirm no second row.
5. Self-invite skipped: invite username equals new user's username, helper returns no-op.

**Manual smoke required (post-merge on Vercel preview):**
- Tap invite link in incognito → land on `/p/<inviter>` → banner visible at top, sticky on scroll.
- Tap Sign up → land on `/auth/signup?invite=<inviter>`.
- Complete signup + onboarding (use a throwaway email).
- Open `/coven` as the new user → pending invite from `<inviter>` shown at the top.
- Tap Accept → bond visible in Your Coven section. Inviter (logged in on another device) gets the `coven_invite_accepted` notification.

## Risks

- **Cookie set timing.** The cookie must be set BEFORE the user submits the email-confirm flow if email-confirm is enabled (it isn't currently — synthetic-email signups bypass it). If you re-enable email-confirm later, the 1-hour TTL covers a typical inbox check; longer than that, the user re-clicks the invite link or onboards without the connection.
- **Service-role client in onboarding.** Already used for username uniqueness pre-checks. Reusing the existing pattern.
- **Inviter spoofing.** `?invite=<username>` is user-controllable. Worst case: an attacker spams signups with `?invite=tony` and Tony gets unwanted coven requests. Same outcome as Tony genuinely sharing a link to a stranger. Tony can decline.
- **Race: inviter deletes their account between link share and recipient's signup.** Service-role lookup returns null → silent skip. Recipient signs up normally with no inviter binding. Acceptable.
- **`/p/[username]` cache.** The page is a server component; the banner renders based on `getServerUser()` (request-scoped cache). No CDN caching at the route level (auth-aware), so anon vs. logged-in renders correctly per request.

## Open questions

None. All scope decisions locked during brainstorming.
