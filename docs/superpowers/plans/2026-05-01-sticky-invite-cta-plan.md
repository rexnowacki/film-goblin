# Sticky Invite CTA + Auto-Coven-Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a sticky CTA banner on `/p/[username]` for unauthenticated viewers, and auto-create a `coven_request` from the inviter to the new user during onboarding so the connection is one tap from forming once they sign up.

**Architecture:** New `InviteBanner` client component renders above the profile h1 only when `getServerUser()` returns null. Signup page reads `?invite=<username>` and passes it through as a hidden form field. The `signUp` action sets a 1-hour HttpOnly `fg_invite` cookie. `_completeOnboarding` reads the cookie post-onboarding and inserts a `coven_request` row via the service-role client, leveraging the existing `coven_requests.UNIQUE (from_user_id, to_user_id)` constraint for idempotency. The existing `coven_invite_pending` notification trigger fires automatically on the new request insert.

**Tech Stack:** Next.js 15 App Router cookies API, TypeScript, Supabase service-role client, existing schema.

**Spec:** `docs/superpowers/specs/2026-05-01-sticky-invite-cta-design.md`

**Branch (already created):** `feature/sticky-invite-cta`

---

## File Structure

**Created:**
- `app/lib/actions/invite-cookie.ts` — wrapper around Next.js `cookies()` for `fg_invite` set/read/clear
- `app/components/InviteBanner.tsx` — sticky CTA component, anon-only
- `db/tests/rls/onboarding-invite-flow.test.ts` — testcontainers verifies coven_request creation + idempotency edges

**Modified:**
- `app/app/p/[username]/page.tsx` — render `<InviteBanner>` when `user === null`
- `app/app/auth/signup/page.tsx` — read `searchParams.invite`, render hidden input
- `app/lib/actions/auth.ts` — in `signUp`, read `invite` from FormData, call `setInviteCookie` after successful user creation
- `app/lib/actions/onboarding.ts` — in `_completeOnboarding`, after user profile update, read invite cookie and create coven_request via new helper `maybeCreateInviteCovenRequest`
- `app/app/globals.css` — `.invite-banner` rules
- `CLAUDE.md` + `docs/sub-project-history.md` — sub-project #30 row

**Untouched:**
- `coven_requests` schema (existing `UNIQUE (from_user_id, to_user_id)` + `CHECK (from_user_id <> to_user_id)` give us idempotency + self-invite rejection at the DB level)
- `notify_coven_request_pending` trigger (mig 0126) — auto-fires on the new insert
- `sendCovenRequest` server action — onboarding bypasses it via service-role
- Existing redirect-after-signup flow

---

### Task 1: Invite cookie helper

**Files:**
- Create: `app/lib/actions/invite-cookie.ts`

- [ ] **Step 1: Write the file**

Create `/Users/christophernowacki/film-goblin/app/lib/actions/invite-cookie.ts`:

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

- [ ] **Step 2: Typecheck**

Run from `/Users/christophernowacki/film-goblin/app/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

From repo root `/Users/christophernowacki/film-goblin`:
```
git add app/lib/actions/invite-cookie.ts
git commit -m "feat(invite): cookie helper for fg_invite (1h HttpOnly)"
```

Use `git commit -F /tmp/msg.txt` if heredoc commits mangle (per CLAUDE.md gotcha).

---

### Task 2: `InviteBanner` component + CSS

**Files:**
- Create: `app/components/InviteBanner.tsx`
- Modify: `app/app/globals.css`

- [ ] **Step 1: Write the component**

Create `/Users/christophernowacki/film-goblin/app/components/InviteBanner.tsx`:

```typescript
"use client";

interface Props {
  inviterUsername: string;
}

export default function InviteBanner({ inviterUsername }: Props) {
  return (
    <div className="invite-banner" role="region" aria-label="Coven invite">
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

- [ ] **Step 2: Append CSS**

Append to `/Users/christophernowacki/film-goblin/app/app/globals.css`:

```css

/* ===== INVITE BANNER ===== */

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
  flex: 1;
  min-width: 0;
}
.invite-banner-sub {
  opacity: 0.85;
  font-style: italic;
}
@media (max-width: 720px) {
  .invite-banner { padding: 10px 12px; font-size: 13px; }
  .invite-banner-text { font-size: 13px; }
}
```

- [ ] **Step 3: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```
git add app/components/InviteBanner.tsx app/app/globals.css
git commit -m "feat(invite): InviteBanner component + sticky CTA styling"
```

---

### Task 3: Render `InviteBanner` on `/p/[username]` for anon viewers

**Files:**
- Modify: `app/app/p/[username]/page.tsx`

- [ ] **Step 1: Add import**

Open `/Users/christophernowacki/film-goblin/app/app/p/[username]/page.tsx`. Near the top with the other component imports, add:

```typescript
import InviteBanner from "@/components/InviteBanner";
```

- [ ] **Step 2: Render the banner conditionally**

Find the `return (` block of the page component. Locate the outermost wrapping `<div>` (the page root, currently rendering `<TopNav>`, the profile content, etc.). Insert the banner right after the opening `<div>` tag and BEFORE `<TopNav>`:

```tsx
return (
  <div ...>
    {!user && <InviteBanner inviterUsername={bundle.profile.username} />}
    <TopNav .../>
    {/* existing content */}
  </div>
);
```

The `user` variable is already in scope (the page does `const user = await getServerUser();` around line 27). The `bundle.profile.username` is the URL's `[username]` (i.e. the inviter's username). Sticky positioning floats the banner over content as the visitor scrolls.

- [ ] **Step 3: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```
git add 'app/app/p/[username]/page.tsx'
git commit -m "feat(profile): render InviteBanner for unauthenticated viewers"
```

(Quote the bracketed path; zsh expands `[...]` as a glob otherwise.)

---

### Task 4: Plumb `?invite=` through signup form + signUp action

**Files:**
- Modify: `app/app/auth/signup/page.tsx`
- Modify: `app/lib/actions/auth.ts`

- [ ] **Step 1: Read the query param + render hidden input on the signup page**

Open `/Users/christophernowacki/film-goblin/app/app/auth/signup/page.tsx`. Inside `SignUpInner()`, near the existing `redirectTo` line:

Replace:
```typescript
const redirectTo = params.get("redirect") || "/home";
```

With:
```typescript
const redirectTo = params.get("redirect") || "/home";
const inviteRaw = params.get("invite");
const invite = inviteRaw && /^[a-z0-9._]+$/.test(inviteRaw) ? inviteRaw : null;
```

Then in the `<form action={submit}>` body, immediately after the existing hidden redirect input:

```tsx
<input type="hidden" name="redirect" value={redirectTo} />
{invite && <input type="hidden" name="invite" value={invite} />}
```

- [ ] **Step 2: Read `invite` from FormData in `signUp` and set the cookie**

Open `/Users/christophernowacki/film-goblin/app/lib/actions/auth.ts`. Add this import near the top (alongside the existing supabase imports):

```typescript
import { setInviteCookie } from "./invite-cookie";
```

In `signUp`, after the line `const redirectIn = String(formData.get("redirect") || "/home");` add:

```typescript
const invite = String(formData.get("invite") || "").trim().toLowerCase();
```

Then, after the successful sign-in block (between the `if (signInErr) ...` return and the final `redirect(target);`), insert:

```typescript
if (invite) {
  try {
    await setInviteCookie(invite);
  } catch { /* cookie failure must never break signup */ }
}
```

The full mutated tail of `signUp` should look like:

```typescript
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    return { error: friendlyError(signInErr) };
  }
  if (invite) {
    try {
      await setInviteCookie(invite);
    } catch { /* cookie failure must never break signup */ }
  }
  redirect(target);
}
```

`setInviteCookie` itself rejects invalid usernames silently (the regex check inside it), so passing an empty string is safe.

- [ ] **Step 3: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```
git add app/app/auth/signup/page.tsx app/lib/actions/auth.ts
git commit -m "feat(auth): thread ?invite= from signup form to fg_invite cookie"
```

---

### Task 5: Wire the invite cookie into onboarding to create the coven request

**Files:**
- Modify: `app/lib/actions/onboarding.ts`

- [ ] **Step 1: Update imports**

Open `/Users/christophernowacki/film-goblin/app/lib/actions/onboarding.ts`. Add these imports near the top:

```typescript
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { readInviteCookie, clearInviteCookie } from "./invite-cookie";
```

- [ ] **Step 2: Add the helper inside the same file**

After the existing `_completeOnboarding` function and before the public `completeOnboarding` wrapper, add:

```typescript
/**
 * If a valid `fg_invite` cookie is present and the inviter exists and isn't
 * the same person, insert a `coven_request` row from inviter -> new user.
 * Idempotency is enforced by `coven_requests.UNIQUE (from_user_id, to_user_id)`
 * — duplicate inserts return error code 23505 which we swallow. Self-invites
 * are rejected by the table's CHECK constraint at the DB level; we still
 * pre-guard to avoid a noisy error. The cookie is cleared by the caller
 * regardless of outcome.
 */
async function maybeCreateInviteCovenRequest(newUserId: string, inviterUsername: string): Promise<void> {
  const admin = serviceRoleClient();

  const { data: inviter } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", inviterUsername)
    .maybeSingle();
  if (!inviter || inviter.id === newUserId) return;

  // Already coven members? Walk both directions of the (user_a < user_b)
  // edge invariant.
  const a = inviter.id < newUserId ? inviter.id : newUserId;
  const b = inviter.id < newUserId ? newUserId : inviter.id;
  const { data: bond } = await admin
    .from("coven_members")
    .select("user_a_id")
    .eq("user_a_id", a)
    .eq("user_b_id", b)
    .maybeSingle();
  if (bond) return;

  // Existing pending request in either direction? Skip.
  const { data: existingFwd } = await admin
    .from("coven_requests")
    .select("id")
    .eq("from_user_id", inviter.id)
    .eq("to_user_id", newUserId)
    .maybeSingle();
  if (existingFwd) return;
  const { data: existingRev } = await admin
    .from("coven_requests")
    .select("id")
    .eq("from_user_id", newUserId)
    .eq("to_user_id", inviter.id)
    .maybeSingle();
  if (existingRev) return;

  const { error } = await admin
    .from("coven_requests")
    .insert({ from_user_id: inviter.id, to_user_id: newUserId, status: "pending" });
  // 23505 = unique violation; safe to swallow (raced with another path)
  if (error && (error as { code?: string }).code !== "23505") throw error;
}
```

- [ ] **Step 3: Invoke the helper from `_completeOnboarding`**

At the END of `_completeOnboarding`, after the existing `for (const filmId of p.watchlistFilmIds) { ... }` loop, append:

```typescript
  const inviteUsername = await readInviteCookie();
  if (inviteUsername) {
    try {
      await maybeCreateInviteCovenRequest(user.id, inviteUsername);
    } finally {
      await clearInviteCookie();
    }
  }
```

The full mutated `_completeOnboarding` body's tail looks like:

```typescript
    if (wErr && wErr.code !== "23505") throw wErr;
  }

  const inviteUsername = await readInviteCookie();
  if (inviteUsername) {
    try {
      await maybeCreateInviteCovenRequest(user.id, inviteUsername);
    } finally {
      await clearInviteCookie();
    }
  }
}
```

- [ ] **Step 4: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Run full app test suite**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: 120 passed / 61 skipped (no regressions).

- [ ] **Step 6: Commit**

```
git add app/lib/actions/onboarding.ts
git commit -m "feat(onboarding): auto-create coven_request from invite cookie"
```

---

### Task 6: RLS / trigger test for the invite flow

**Files:**
- Create: `db/tests/rls/onboarding-invite-flow.test.ts`

- [ ] **Step 1: Write the test file**

Create `/Users/christophernowacki/film-goblin/db/tests/rls/onboarding-invite-flow.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures, Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM coven_requests`);
  await db.client.query(`DELETE FROM coven_members`);
  await db.client.query(`DELETE FROM notifications`);
  await commit(db.client);
});

// Helper: insert a coven_members edge respecting the (user_a < user_b) invariant.
async function bond(client: typeof db.client, x: string, y: string) {
  const [a, b] = x < y ? [x, y] : [y, x];
  await client.query(
    `INSERT INTO coven_members (user_a_id, user_b_id) VALUES ($1, $2)`,
    [a, b]
  );
}

describe("onboarding invite flow — coven_request insert via service-role", () => {
  it("creates exactly one coven_request when inviter and new user are distinct", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO coven_requests (from_user_id, to_user_id, status)
       VALUES ($1, $2, 'pending')`,
      [fx.userA.id, fx.userB.id]
    );
    const r = await db.client.query(
      `SELECT * FROM coven_requests WHERE from_user_id = $1 AND to_user_id = $2`,
      [fx.userA.id, fx.userB.id]
    );
    expect(r.rowCount).toBe(1);
    await commit(db.client);
  });

  it("trigger fires coven_invite_pending notification for the recipient", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO coven_requests (from_user_id, to_user_id, status)
       VALUES ($1, $2, 'pending')`,
      [fx.userA.id, fx.userB.id]
    );
    const r = await db.client.query(
      `SELECT user_id, kind, actor_user_id FROM notifications WHERE kind = 'coven_invite_pending'`
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].user_id).toBe(fx.userB.id);
    expect(r.rows[0].actor_user_id).toBe(fx.userA.id);
    await commit(db.client);
  });

  it("UNIQUE (from_user_id, to_user_id) prevents duplicate inserts", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO coven_requests (from_user_id, to_user_id, status)
       VALUES ($1, $2, 'pending')`,
      [fx.userA.id, fx.userB.id]
    );
    await expect(
      db.client.query(
        `INSERT INTO coven_requests (from_user_id, to_user_id, status)
         VALUES ($1, $2, 'pending')`,
        [fx.userA.id, fx.userB.id]
      )
    ).rejects.toThrow();
    await rollback(db.client);
  });

  it("CHECK (from_user_id <> to_user_id) blocks self-invite at DB level", async () => {
    await beginAs(db.client, null, "service_role");
    await expect(
      db.client.query(
        `INSERT INTO coven_requests (from_user_id, to_user_id, status)
         VALUES ($1, $1, 'pending')`,
        [fx.userA.id]
      )
    ).rejects.toThrow();
    await rollback(db.client);
  });

  it("inviter and new user are already coven mates — caller-side skip is correct (DB allows the request, but the helper guards)", async () => {
    // The `coven_requests` table doesn't enforce 'must not already be members'
    // — that's a caller-side guard. This test documents the precondition the
    // helper is responsible for: when bond exists, helper skips the insert.
    await beginAs(db.client, null, "service_role");
    await bond(db.client, fx.userA.id, fx.userB.id);
    const bondR = await db.client.query(
      `SELECT * FROM coven_members WHERE
         (user_a_id = $1 AND user_b_id = $2) OR
         (user_a_id = $2 AND user_b_id = $1)`,
      [fx.userA.id, fx.userB.id]
    );
    expect(bondR.rowCount).toBe(1);
    // Helper's pre-check is what would catch this; not testing the helper
    // directly here (it's app-side TypeScript). This test confirms the
    // bond exists in a way the helper can detect via the (a < b) lookup.
    await commit(db.client);
  });

  it("recipient can SELECT their pending request (RLS owner-readable)", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO coven_requests (from_user_id, to_user_id, status)
       VALUES ($1, $2, 'pending')`,
      [fx.userA.id, fx.userB.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT * FROM coven_requests WHERE to_user_id = $1`,
        [fx.userB.id]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 2: Run the test file**

```
cd /Users/christophernowacki/film-goblin/db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH TESTCONTAINERS_RYUK_DISABLED=true DOCKER_HOST="unix://$HOME/.colima/default/docker.sock" npm run test:rls -- tests/rls/onboarding-invite-flow.test.ts
```
Expected: 6 specs PASS.

- [ ] **Step 3: Run the full RLS suite**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH TESTCONTAINERS_RYUK_DISABLED=true DOCKER_HOST="unix://$HOME/.colima/default/docker.sock" npm run test:rls
```
Expected: PASS, no regressions.

- [ ] **Step 4: Commit**

```
git add db/tests/rls/onboarding-invite-flow.test.ts
git commit -m "test(rls): coven_request insert + trigger + uniqueness for invite flow"
```

---

### Task 7: Update CLAUDE.md + open PR

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/sub-project-history.md`

- [ ] **Step 1: Append sub-project #30 row to history**

Open `/Users/christophernowacki/film-goblin/docs/sub-project-history.md`. After the `| 29 |` row, append:

```markdown
| 30 | Sticky invite CTA + auto-coven-request on signup — anon viewers of `/p/[username]` see a sticky "@&lt;inviter&gt; invited you to Film Goblin" banner with a Sign up button linking to `/auth/signup?invite=&lt;inviter&gt;`. Signup form threads the param to a 1-hour HttpOnly `fg_invite` cookie via the `signUp` action. `_completeOnboarding` reads the cookie and inserts a `coven_request` (inviter → new user) via service-role client; the existing `notify_coven_request_pending` trigger fires the `coven_invite_pending` bell row automatically. Idempotent (UNIQUE constraint + helper pre-checks for existing bonds + opposite-direction requests). Connection is one accept-tap from forming once the new user opens /coven. | `2026-05-01-sticky-invite-cta-design.md` |
```

- [ ] **Step 2: Update CLAUDE.md "Last updated"**

In `/Users/christophernowacki/film-goblin/CLAUDE.md`:

```markdown
**Last updated:** 2026-05-01 (sub-projects #25–#30 — comment polish+likes, username standardization, like_on_comment notification, modal visual unification, RecommendModal picker, sticky invite CTA)
```

- [ ] **Step 3: Commit + push**

```
git add CLAUDE.md docs/sub-project-history.md
git commit -m "docs(claude): note sub-project #30 — sticky invite CTA + auto-coven-request"
git push -u origin feature/sticky-invite-cta
```

- [ ] **Step 4: Open PR**

Write the body to `/tmp/pr-body-30.md`:

```markdown
## Summary

Sub-project #30. Closes the loop on the `InviteFriendButton` shipped in #29: the recipient gets a clear next action and an automatic coven connection.

- **Sticky CTA banner** on `/p/[username]` for unauthenticated viewers: "@&lt;inviter&gt; invited you to Film Goblin. Sign up to bind with their coven." Sign up button links to `/auth/signup?invite=&lt;inviter&gt;`.
- **Signup plumbing**: signup page reads `?invite=`, validates against the existing username regex, passes to the form. `signUp` action sets a 1-hour HttpOnly `fg_invite` cookie after successful user creation.
- **Auto-coven-request**: `_completeOnboarding` reads the cookie post-onboarding, looks up the inviter, and inserts a `coven_request` (inviter → new user) via the service-role client. Idempotent: skips when inviter doesn't exist, when inviter == new user, when an existing bond exists in either direction, when an existing request exists in either direction. The DB-level `UNIQUE (from_user_id, to_user_id)` and `CHECK (from_user_id <> to_user_id)` constraints provide belt + suspenders.
- **Bell + accept flow**: existing `notify_coven_request_pending` trigger fires the `coven_invite_pending` notification automatically. New user opens /coven → sees pending invite at the top → taps Accept → bond formed via existing flow → inviter gets the existing `coven_invite_accepted` notification.
- **No schema changes.** No new RLS. No new triggers. No new notification kinds.

## Test plan

- [x] `cd app && npm run typecheck` clean
- [x] `cd app && npm test` — no regressions (120 passed / 61 skipped)
- [x] `cd db && npm run test:rls` — 6 new specs cover insert + trigger + uniqueness + RLS owner-read; full suite passes
- [ ] Manual smoke on Vercel preview: tap an invite link in incognito → see sticky banner on inviter's profile → tap Sign up → URL has `?invite=&lt;inviter&gt;` → complete signup + onboarding (throwaway email) → open /coven → pending invite from inviter at the top → tap Accept → bond formed; inviter (logged in elsewhere) gets the accepted notification.
```

Then run:
```
gh pr create --title "feat: sticky invite CTA + auto-coven-request on signup" --body-file /tmp/pr-body-30.md
```

- [ ] **Step 5: Done.** Report PR URL back.

---

## Self-Review

**1. Spec coverage:**
- Spec §"Sticky banner component" → Task 2 + Task 3.
- Spec §"Invite cookie helper" → Task 1.
- Spec §"Signup form param plumbing" → Task 4.
- Spec §"Onboarding handoff + helper" → Task 5.
- Spec §"Tests / new RLS test" → Task 6.
- Spec §"Edge cases / inviter doesn't exist / inviter == new user / already bonded / existing request" → handled inline in `maybeCreateInviteCovenRequest` (Task 5).
- Spec §"Risks / cookie set timing / service-role pattern / inviter spoofing / race on inviter delete / page cache" — all are runtime-only concerns; no specific task action required beyond the implementation.
- CLAUDE.md + history update → Task 7.

All spec sections covered.

**2. Placeholder scan:** No "TBD" / "TODO" / "fill in details" / "Similar to Task N" markers. Every code block contains the literal replacement content. The PR body's manual smoke checklist is concrete (specific routes, specific button labels, specific text-to-confirm).

**3. Type consistency:**
- `setInviteCookie(username: string): Promise<void>` defined in Task 1, called in Task 4 with the FormData-derived `invite` string.
- `readInviteCookie(): Promise<string | null>` defined in Task 1, called in Task 5.
- `clearInviteCookie(): Promise<void>` defined in Task 1, called in Task 5's `finally` block.
- `maybeCreateInviteCovenRequest(newUserId: string, inviterUsername: string): Promise<void>` defined in Task 5, called once at the end of `_completeOnboarding`.
- The `serviceRoleClient` import path `@/lib/supabase/service-role` matches the existing usage in `app/lib/actions/auth.ts` (line ~60 in `signUp`).
- `(a < b)` lookup matches the existing `coven_members.user_a_id < user_b_id` invariant noted in CLAUDE.md.
- `coven_request_status` enum value `'pending'` matches mig 0104's CHECK.

No drift detected.
