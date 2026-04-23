# Social Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the existing social schema to work from the UI — /people browse, /p/[handle] profiles, /coven pending+members, follow/coven actions, per-kind activity renderers, coven-member recommend picker. Ships with a logout button so multi-account testing works from day one.

**Architecture:** Server Components for the new pages (profile, people, coven), thin client islands for the interactive buttons. New workspace-less: everything lives inside `app/`. One small migration (0116) adds a coven delete policy and tightens the recommendations insert policy to require coven membership. Existing server-action pattern (`_impl(client, ...) + public wrapper + revalidatePath`) is reused verbatim.

**Tech Stack:** Next.js 15 App Router · Server Components + Client Islands · `@supabase/ssr` · `pg` for test queries · Vitest · local Supabase stack

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `db/migrations/0116_coven_leave_and_recommendations_scope.sql` | Create | Coven delete policy + tighten recommendations insert to coven-only |
| `app/lib/actions/follows.ts` | Create | `_follow` / `_unfollow` + public wrappers |
| `app/lib/actions/coven.ts` | Create | `_sendCovenRequest` / `_acceptCovenRequest` / `_declineCovenRequest` / `_leaveCoven` + wrappers |
| `app/lib/queries/coven.ts` | Create | `getPendingInvites` / `getMyCovenMembers` / `getPendingInviteCount` / `getCovenStateBetween` |
| `app/lib/queries/profiles.ts` | Modify | Add `getProfilesBySearch`, `getPublicProfileBundle` (keep existing `getMyProfile`, `getProfileByHandle`) |
| `app/lib/queries/activity.ts` | Modify | Replace `getFeed` with `getEnrichedFeed` (joined, discriminated union result) |
| `app/app/p/[handle]/page.tsx` | Create | Public profile Server Component |
| `app/app/people/page.tsx` | Create | Browse + search profiles |
| `app/app/coven/page.tsx` | Create | Pending invites + current coven members |
| `app/components/FollowButton.tsx` | Create | Client island: toggles follow state |
| `app/components/CovenButton.tsx` | Create | Client island: Invite / Pending / In Coven state machine |
| `app/components/CovenInviteActions.tsx` | Create | Accept / Decline pair for pending invites |
| `app/components/LeaveCovenButton.tsx` | Create | Leave-coven with confirm |
| `app/components/PeopleSearch.tsx` | Create | URL-syncing search input (mirrors `FilmsSearch`) |
| `app/components/UserMenu.tsx` | Create | Avatar dropdown — Settings + Sign out |
| `app/components/activity/ActivityRow.tsx` | Create | Discriminated-union dispatcher |
| `app/components/activity/ActivityRecommendationSent.tsx` | Create | Per-kind renderer |
| `app/components/activity/ActivityReviewPublished.tsx` | Create | Per-kind renderer |
| `app/components/activity/ActivityWatchlistAdded.tsx` | Create | Per-kind renderer |
| `app/components/activity/ActivityListCreated.tsx` | Create | Per-kind renderer |
| `app/components/activity/ActivityListFilmAdded.tsx` | Create | Per-kind renderer |
| `app/components/activity/ActivityCovenJoined.tsx` | Create | Per-kind renderer |
| `app/components/activity/relativeTime.ts` | Create | Small util for "2h ago" formatting |
| `app/components/FeedTabs.tsx` | Rewrite | Replace JSON dump with ActivityRow rendering; add Refresh button; URL-tab state |
| `app/components/TopNav.tsx` | Modify | Add People + Coven links, pending-invite badge, swap avatar link for UserMenu dropdown |
| `app/app/settings/SettingsForm.tsx` | Modify | Add Sign out button at the bottom |
| `app/app/film/[id]/page.tsx` | Modify | Load viewer's coven members; pass into RecommendModal |
| `app/components/RecommendModal.tsx` | Modify | Replace UUID input with `<select>` of coven members + empty state |
| `app/app/home/page.tsx` | Modify | Use `getEnrichedFeed`; pass result to FeedTabs |
| `app/middleware.ts` | Modify | Add `/coven` to AUTH_REQUIRED |
| `app/tests/actions/follows.test.ts` | Create | 3 tests |
| `app/tests/actions/coven.test.ts` | Create | 5 tests |
| `app/tests/actions/recommendations.test.ts` | Modify | Existing test becomes coven-aware; add non-coven rejection test |

---

## Task 1: Logout UI (pretask)

Small pretask so multi-account testing works from T2 onward. Reuses the existing `signOut` action from `app/lib/actions/auth.ts`.

**Files:**
- Create: `app/components/UserMenu.tsx`
- Modify: `app/components/TopNav.tsx`
- Modify: `app/app/settings/SettingsForm.tsx`

- [ ] **Step 1: Create `app/components/UserMenu.tsx`**

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import { signOut } from "@/lib/actions/auth";

interface Props {
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
}

export default function UserMenu({ handle, displayName, avatarUrl }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Open account menu"
        style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
      >
        <Avatar name={displayName || handle} color="var(--accent)" size={36} />
      </button>
      {open && (
        <div style={{
          position: "absolute",
          right: 0,
          top: "calc(100% + 8px)",
          background: "var(--bone)",
          color: "var(--void)",
          border: "2px solid var(--void)",
          boxShadow: "4px 4px 0 var(--accent)",
          minWidth: 160,
          zIndex: 50,
        }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--void)", fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            @{handle}
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            style={{ display: "block", padding: "10px 14px", color: "var(--void)", textDecoration: "none", fontFamily: "var(--font-ui)", fontSize: 12 }}
          >
            Settings
          </Link>
          <form action={async () => { await signOut(); }}>
            <button
              type="submit"
              style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "transparent", border: 0, cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--blood)" }}
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Modify `app/components/TopNav.tsx` to use UserMenu**

Read the existing file first. Find the block rendering the avatar link to `/settings` for authed users. Replace that `<Link>`-to-`/settings` around the Avatar with:

```tsx
<UserMenu
  handle={profile?.handle ?? "you"}
  displayName={profile?.display_name ?? profile?.handle ?? "You"}
  avatarUrl={profile?.avatar_url}
/>
```

Before TopNav can pass profile data, extend its data fetch. Near the top of the component (where it already calls `supabase.auth.getUser()`), also fetch the profile:

```tsx
let profile: { handle: string; display_name: string | null; avatar_url: string | null } | null = null;
if (user) {
  const { data } = await supabase
    .from("profiles")
    .select("handle, display_name, avatar_url")
    .eq("id", user.id)
    .single();
  profile = data;
}
```

Add `import UserMenu from "./UserMenu";` at the top.

- [ ] **Step 3: Add Sign out button to SettingsForm**

Open `app/app/settings/SettingsForm.tsx`. Below the existing "Save" button block (before the closing `</form>`), add:

```tsx
      </form>
      <form action={async () => { "use server"; const { signOut } = await import("@/lib/actions/auth"); await signOut(); }} style={{ marginTop: 32 }}>
        <button type="submit" style={{ background: "transparent", color: "var(--blood)", border: "2px solid var(--blood)", padding: "10px 18px", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
          Sign out
        </button>
      </form>
```

Wait — `SettingsForm.tsx` is a client component; `"use server"` inline doesn't work there. Use a different approach — import the server action and call it from a form action prop:

```tsx
// At top of SettingsForm.tsx, with other imports:
import { signOut } from "@/lib/actions/auth";
```

Then at the end of the JSX, OUTSIDE the existing `<form action={save}>`:

```tsx
      <form action={signOut} style={{ marginTop: 32 }}>
        <button type="submit" style={{ background: "transparent", color: "var(--blood)", border: "2px solid var(--blood)", padding: "10px 18px", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
          Sign out
        </button>
      </form>
```

Note: the existing `</div>` and `</div>` closing tags (for `container-wide` and the outer background wrapper) are in `app/app/settings/page.tsx`, not SettingsForm. So the new sign-out form lives at the end of `SettingsForm.tsx`'s return value, after the `</form>` tag that closes the profile-edit form.

- [ ] **Step 4: Typecheck + build**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

Expected: exit 0 + build success.

- [ ] **Step 5: Manual local verify**

`npm run dev`. Visit `/home` while signed in. Avatar top-right opens dropdown with `@handle`, Settings, Sign out. Click Sign out → redirects to landing. Sign back in, visit `/settings`, confirm the red-outlined Sign out button at the bottom of the settings form works.

- [ ] **Step 6: Commit**

Write `/tmp/t1-msg.txt`:
```
feat(app): logout button in TopNav dropdown + Settings

TopNav's avatar link becomes a small dropdown with @handle label,
Settings link, and a Sign out button. Settings page gains a redundant
Sign out button at the bottom. Both use the existing signOut server
action from lib/actions/auth.ts (which was always there but never
surfaced in UI). No new action code; pure wiring.
```

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/components/UserMenu.tsx app/components/TopNav.tsx app/app/settings/SettingsForm.tsx
git commit -F /tmp/t1-msg.txt
```

---

## Task 2: Migration 0116 — coven delete + recommendations tightening

**Files:**
- Create: `db/migrations/0116_coven_leave_and_recommendations_scope.sql`

- [ ] **Step 1: Write the migration**

Write `/home/cthulhulemon/film_goblin/.worktrees/social/db/migrations/0116_coven_leave_and_recommendations_scope.sql`:

```sql
-- Lets either participant leave a coven by deleting the members row.
CREATE POLICY coven_members_delete ON coven_members
  FOR DELETE TO authenticated
  USING (auth.uid() IN (user_a_id, user_b_id));

-- Tighten recommendations INSERT: senders must be coven-bound with the recipient.
-- Drops the old policy (if any) and replaces it with the coven-gated version.
DROP POLICY IF EXISTS recommendations_insert ON recommendations;
CREATE POLICY recommendations_insert ON recommendations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = from_user_id
    AND EXISTS (
      SELECT 1 FROM coven_members cm
      WHERE cm.user_a_id = LEAST(from_user_id, to_user_id)
        AND cm.user_b_id = GREATEST(from_user_id, to_user_id)
    )
  );
```

- [ ] **Step 2: Apply to local Supabase**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social/db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run migrate
```

Expected: `Applied: 0116_coven_leave_and_recommendations_scope.sql`.

- [ ] **Step 3: Apply to hosted staging**

Write `/tmp/t2-migrate-staging.sh`:
```bash
#!/bin/bash
set -e
ENCODED_PASS=$(PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH node -e "console.log(encodeURIComponent('xaW\$AEMcY3cvv#K'))")
export DATABASE_URL="postgresql://postgres.wktylpissdjinccbwzha:${ENCODED_PASS}@aws-1-us-west-1.pooler.supabase.com:5432/postgres"
cd /home/cthulhulemon/film_goblin/.worktrees/social/db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
```

Then `bash /tmp/t2-migrate-staging.sh`. Expected: `Applied: 0116_...`.

- [ ] **Step 4: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add db/migrations/0116_coven_leave_and_recommendations_scope.sql
git commit -m "feat(db): coven delete policy + tighten recommendations to coven-only

Adds FOR DELETE policy on coven_members so either participant can
leave the coven. Replaces the recommendations INSERT policy with one
that requires the sender and recipient to already be coven-bound —
the SQL-layer enforcement of sub-project 6's Q3 scope decision."
```

---

## Task 3: follows actions + tests

**Files:**
- Create: `app/lib/actions/follows.ts`
- Create: `app/tests/actions/follows.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// app/tests/actions/follows.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _follow, _unfollow } from "../../lib/actions/follows";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  alice = await createTestUser();
  bob = await createTestUser();
});

afterAll(async () => {
  const admin = adminClient();
  await admin.from("follows").delete().eq("follower_user_id", alice.id);
  await deleteTestUser(alice.id);
  await deleteTestUser(bob.id);
});

describe("actions/follows", () => {
  it("follow inserts a row owned by the caller", async () => {
    const c = await signedInClient(alice.email, alice.password);
    await _follow(c, bob.id);
    const admin = adminClient();
    const { data } = await admin.from("follows").select("*")
      .eq("follower_user_id", alice.id).eq("followed_user_id", bob.id);
    expect(data).toHaveLength(1);
  });

  it("follow is idempotent", async () => {
    const c = await signedInClient(alice.email, alice.password);
    await _follow(c, bob.id);
    await _follow(c, bob.id);
    const admin = adminClient();
    const { data } = await admin.from("follows").select("*")
      .eq("follower_user_id", alice.id).eq("followed_user_id", bob.id);
    expect(data).toHaveLength(1);
  });

  it("unfollow deletes the row", async () => {
    const c = await signedInClient(alice.email, alice.password);
    await _follow(c, bob.id);
    await _unfollow(c, bob.id);
    const admin = adminClient();
    const { data } = await admin.from("follows").select("*")
      .eq("follower_user_id", alice.id).eq("followed_user_id", bob.id);
    expect(data).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — expect 3 failures (module not found)**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/follows.test.ts
```

- [ ] **Step 3: Implement actions/follows.ts**

```typescript
// app/lib/actions/follows.ts
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function _follow(client: Client, followedUserId: string): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  const { error } = await client
    .from("follows")
    .insert({ follower_user_id: user.id, followed_user_id: followedUserId });
  // 23505 = unique violation. Already following — treat as no-op.
  if (error && error.code !== "23505") throw error;
}

export async function _unfollow(client: Client, followedUserId: string): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  const { error } = await client
    .from("follows")
    .delete()
    .eq("follower_user_id", user.id)
    .eq("followed_user_id", followedUserId);
  if (error) throw error;
}

export async function follow(followedUserId: string, targetHandle?: string) {
  const c = await createClient();
  await _follow(c, followedUserId);
  revalidatePath("/home");
  if (targetHandle) revalidatePath(`/p/${targetHandle}`);
}

export async function unfollow(followedUserId: string, targetHandle?: string) {
  const c = await createClient();
  await _unfollow(c, followedUserId);
  revalidatePath("/home");
  if (targetHandle) revalidatePath(`/p/${targetHandle}`);
}
```

- [ ] **Step 4: Run — expect 3/3 passing**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/follows.test.ts
```

- [ ] **Step 5: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/lib/actions/follows.ts app/tests/actions/follows.test.ts
git commit -m "feat(app): follow / unfollow server actions + tests

Follow catches 23505 silently so re-following is a no-op. Unfollow
is idempotent by nature (DELETE with no match is a no-op). Both rely
on RLS policies from migration 0103 for identity enforcement. Public
wrappers revalidate /home and optionally /p/[handle]."
```

---

## Task 4: coven actions + tests

**Files:**
- Create: `app/lib/actions/coven.ts`
- Create: `app/tests/actions/coven.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// app/tests/actions/coven.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  _sendCovenRequest,
  _acceptCovenRequest,
  _declineCovenRequest,
  _leaveCoven,
} from "../../lib/actions/coven";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  alice = await createTestUser();
  bob = await createTestUser();
});

afterAll(async () => {
  const admin = adminClient();
  await admin.from("coven_requests").delete().in("from_user_id", [alice.id, bob.id]);
  await admin.from("coven_members").delete()
    .or(`user_a_id.eq.${alice.id},user_b_id.eq.${alice.id},user_a_id.eq.${bob.id},user_b_id.eq.${bob.id}`);
  await deleteTestUser(alice.id);
  await deleteTestUser(bob.id);
});

describe("actions/coven", () => {
  it("sendCovenRequest inserts a pending row", async () => {
    const c = await signedInClient(alice.email, alice.password);
    const { id } = await _sendCovenRequest(c, bob.id);
    const admin = adminClient();
    const { data } = await admin.from("coven_requests").select("*").eq("id", id).single();
    expect(data?.status).toBe("pending");
    expect(data?.from_user_id).toBe(alice.id);
    expect(data?.to_user_id).toBe(bob.id);
    await admin.from("coven_requests").delete().eq("id", id);
  });

  it("self-invite rejects via CHECK constraint", async () => {
    const c = await signedInClient(alice.email, alice.password);
    await expect(_sendCovenRequest(c, alice.id)).rejects.toThrow();
  });

  it("acceptCovenRequest transitions status and creates a coven_members row", async () => {
    const admin = adminClient();
    const { data: req } = await admin.from("coven_requests")
      .insert({ from_user_id: alice.id, to_user_id: bob.id, status: "pending" })
      .select("id").single();
    const requestId = req!.id as string;
    const c = await signedInClient(bob.email, bob.password);
    await _acceptCovenRequest(c, requestId);
    const updated = await admin.from("coven_requests").select("status").eq("id", requestId).single();
    expect(updated.data?.status).toBe("accepted");
    const pair = await admin.from("coven_members").select("*")
      .or(`and(user_a_id.eq.${alice.id},user_b_id.eq.${bob.id}),and(user_a_id.eq.${bob.id},user_b_id.eq.${alice.id})`);
    expect(pair.data?.length).toBe(1);
    // cleanup
    await admin.from("coven_members").delete()
      .or(`and(user_a_id.eq.${alice.id},user_b_id.eq.${bob.id}),and(user_a_id.eq.${bob.id},user_b_id.eq.${alice.id})`);
    await admin.from("coven_requests").delete().eq("id", requestId);
  });

  it("declineCovenRequest transitions status without creating a coven_members row", async () => {
    const admin = adminClient();
    const { data: req } = await admin.from("coven_requests")
      .insert({ from_user_id: alice.id, to_user_id: bob.id, status: "pending" })
      .select("id").single();
    const requestId = req!.id as string;
    const c = await signedInClient(bob.email, bob.password);
    await _declineCovenRequest(c, requestId);
    const updated = await admin.from("coven_requests").select("status").eq("id", requestId).single();
    expect(updated.data?.status).toBe("declined");
    const pair = await admin.from("coven_members").select("*")
      .or(`and(user_a_id.eq.${alice.id},user_b_id.eq.${bob.id}),and(user_a_id.eq.${bob.id},user_b_id.eq.${alice.id})`);
    expect(pair.data?.length).toBe(0);
    await admin.from("coven_requests").delete().eq("id", requestId);
  });

  it("leaveCoven deletes the coven_members row", async () => {
    const admin = adminClient();
    const ua = alice.id < bob.id ? alice.id : bob.id;
    const ub = alice.id < bob.id ? bob.id : alice.id;
    await admin.from("coven_members").insert({ user_a_id: ua, user_b_id: ub });
    const c = await signedInClient(alice.email, alice.password);
    await _leaveCoven(c, bob.id);
    const pair = await admin.from("coven_members").select("*").eq("user_a_id", ua).eq("user_b_id", ub);
    expect(pair.data?.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect 5 failures (module not found)**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/coven.test.ts
```

- [ ] **Step 3: Implement actions/coven.ts**

```typescript
// app/lib/actions/coven.ts
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function _sendCovenRequest(client: Client, toUserId: string): Promise<{ id: string }> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  if (user.id === toUserId) throw new Error("cannot invite yourself to your own coven");
  const { data, error } = await client
    .from("coven_requests")
    .insert({ from_user_id: user.id, to_user_id: toUserId, status: "pending" })
    .select("id").single();
  if (error) throw error;
  return { id: data!.id };
}

export async function _acceptCovenRequest(client: Client, requestId: string): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  const { error } = await client
    .from("coven_requests")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) throw error;
}

export async function _declineCovenRequest(client: Client, requestId: string): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  const { error } = await client
    .from("coven_requests")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) throw error;
}

export async function _leaveCoven(client: Client, otherUserId: string): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  const a = user.id < otherUserId ? user.id : otherUserId;
  const b = user.id < otherUserId ? otherUserId : user.id;
  const { error } = await client
    .from("coven_members")
    .delete()
    .eq("user_a_id", a)
    .eq("user_b_id", b);
  if (error) throw error;
}

export async function sendCovenRequest(toUserId: string, targetHandle?: string) {
  const c = await createClient();
  const result = await _sendCovenRequest(c, toUserId);
  revalidatePath("/coven");
  if (targetHandle) revalidatePath(`/p/${targetHandle}`);
  return result;
}

export async function acceptCovenRequest(requestId: string) {
  const c = await createClient();
  await _acceptCovenRequest(c, requestId);
  revalidatePath("/coven");
  revalidatePath("/home");
}

export async function declineCovenRequest(requestId: string) {
  const c = await createClient();
  await _declineCovenRequest(c, requestId);
  revalidatePath("/coven");
}

export async function leaveCoven(otherUserId: string, targetHandle?: string) {
  const c = await createClient();
  await _leaveCoven(c, otherUserId);
  revalidatePath("/coven");
  if (targetHandle) revalidatePath(`/p/${targetHandle}`);
}
```

- [ ] **Step 4: Run — expect 5/5 passing**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/coven.test.ts
```

- [ ] **Step 5: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/lib/actions/coven.ts app/tests/actions/coven.test.ts
git commit -m "feat(app): coven request / accept / decline / leave actions + tests

All four actions follow the _impl + public wrapper pattern. Self-invite
rejects via CHECK constraint on coven_requests. Accept relies on the
trigger from migration 0111 to create the coven_members row with
canonical (LEAST, GREATEST) ordering. Leave directly deletes the
canonical pair using migration 0116's new DELETE policy."
```

---

## Task 5: Tighten recommendations test

**Files:**
- Modify: `app/tests/actions/recommendations.test.ts`

- [ ] **Step 1: Rewrite the existing test file**

Replace the contents of `app/tests/actions/recommendations.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _recommendFilm } from "../../lib/actions/recommendations";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let sender: TestUser;
let receiver: TestUser;
let stranger: TestUser;
let filmId: string;

beforeAll(async () => {
  sender = await createTestUser();
  receiver = await createTestUser();
  stranger = await createTestUser();

  const admin = adminClient();
  // Bind sender + receiver as coven members so recommendations are allowed.
  const a = sender.id < receiver.id ? sender.id : receiver.id;
  const b = sender.id < receiver.id ? receiver.id : sender.id;
  await admin.from("coven_members").insert({ user_a_id: a, user_b_id: b });

  const { data } = await admin
    .from("films")
    .insert({ itunes_id: 800000 + Math.floor(Math.random() * 100000), title: "R", director: "D", year: 2024 })
    .select("id").single();
  if (!data) throw new Error("film insert failed");
  filmId = data.id;
});

afterAll(async () => {
  const admin = adminClient();
  await admin.from("recommendations").delete().eq("film_id", filmId);
  await admin.from("films").delete().eq("id", filmId);
  const a = sender.id < receiver.id ? sender.id : receiver.id;
  const b = sender.id < receiver.id ? receiver.id : sender.id;
  await admin.from("coven_members").delete().eq("user_a_id", a).eq("user_b_id", b);
  await deleteTestUser(sender.id);
  await deleteTestUser(receiver.id);
  await deleteTestUser(stranger.id);
});

describe("actions/recommendations", () => {
  it("sender can recommend a film to a coven member", async () => {
    const c = await signedInClient(sender.email, sender.password);
    const { id } = await _recommendFilm(c, filmId, receiver.id, "watch this");
    expect(id).toBeTruthy();
    const admin = adminClient();
    const { data } = await admin.from("recommendations").select("*").eq("id", id).single();
    expect(data?.from_user_id).toBe(sender.id);
    expect(data?.to_user_id).toBe(receiver.id);
    expect(data?.note).toBe("watch this");
  });

  it("rejects self-recommendation", async () => {
    const c = await signedInClient(sender.email, sender.password);
    await expect(_recommendFilm(c, filmId, sender.id, "")).rejects.toThrow(/self/i);
  });

  it("rejects recommendation to a non-coven user", async () => {
    const c = await signedInClient(sender.email, sender.password);
    await expect(_recommendFilm(c, filmId, stranger.id, "hey")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — expect 3/3 passing**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/recommendations.test.ts
```

If the third test fails because the recommendations insert policy wasn't tightened (migration 0116 not applied), re-run Task 2 Step 2.

- [ ] **Step 3: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/tests/actions/recommendations.test.ts
git commit -m "test(app): recommendations now require coven membership

beforeAll seeds sender+receiver as coven members before the happy-path
test. New test asserts that recommending to a non-coven stranger fails
at the RLS layer — the SQL enforcement added in migration 0116."
```

---

## Task 6: queries/coven.ts

**Files:**
- Create: `app/lib/queries/coven.ts`

- [ ] **Step 1: Write the module**

```typescript
// app/lib/queries/coven.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export interface PendingInvite {
  id: string;
  from_user_id: string;
  from: { handle: string; display_name: string | null; avatar_url: string | null };
  created_at: string;
}

export interface CovenMember {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
}

export type CovenState = "none" | "pending_outbound" | "pending_inbound" | "member";

export async function getPendingInvites(client: Client, userId: string): Promise<PendingInvite[]> {
  const { data, error } = await client
    .from("coven_requests")
    .select("id, from_user_id, created_at, from:profiles!coven_requests_from_user_id_fkey(handle, display_name, avatar_url)")
    .eq("to_user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    from_user_id: r.from_user_id,
    from: r.from,
    created_at: r.created_at,
  }));
}

export async function getMyCovenMembers(client: Client, userId: string): Promise<CovenMember[]> {
  // coven_members stores pairs canonically as (LEAST, GREATEST). Fetch both directions.
  const { data, error } = await client
    .from("coven_members")
    .select("user_a_id, user_b_id")
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
  if (error) throw error;
  const otherIds = (data ?? []).map(r => (r.user_a_id === userId ? r.user_b_id : r.user_a_id));
  if (otherIds.length === 0) return [];
  const { data: profiles, error: pErr } = await client
    .from("profiles")
    .select("id, handle, display_name, avatar_url")
    .in("id", otherIds);
  if (pErr) throw pErr;
  return profiles ?? [];
}

export async function getPendingInviteCount(client: Client, userId: string): Promise<number> {
  const { count, error } = await client
    .from("coven_requests")
    .select("*", { count: "exact", head: true })
    .eq("to_user_id", userId)
    .eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}

export async function getCovenStateBetween(
  client: Client,
  viewerId: string,
  otherId: string,
): Promise<{ state: CovenState; requestId: string | null }> {
  if (viewerId === otherId) return { state: "none", requestId: null };
  const a = viewerId < otherId ? viewerId : otherId;
  const b = viewerId < otherId ? otherId : viewerId;
  const { data: member } = await client
    .from("coven_members")
    .select("user_a_id")
    .eq("user_a_id", a).eq("user_b_id", b).maybeSingle();
  if (member) return { state: "member", requestId: null };

  const { data: reqs } = await client
    .from("coven_requests")
    .select("id, from_user_id, to_user_id, status")
    .eq("status", "pending")
    .or(`and(from_user_id.eq.${viewerId},to_user_id.eq.${otherId}),and(from_user_id.eq.${otherId},to_user_id.eq.${viewerId})`);
  const r = (reqs ?? [])[0];
  if (!r) return { state: "none", requestId: null };
  if (r.from_user_id === viewerId) return { state: "pending_outbound", requestId: r.id };
  return { state: "pending_inbound", requestId: r.id };
}
```

- [ ] **Step 2: Typecheck**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: exit 0. If the FK hint `coven_requests_from_user_id_fkey` doesn't resolve (Supabase auto-names FKs — may differ), regenerate types via `npm run gen:types` first; if still wrong, the hint name will be `coven_requests_from_user_id_fkey` literally — check `db/migrations/0104_coven.sql` for exact FK name.

- [ ] **Step 3: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/lib/queries/coven.ts
git commit -m "feat(app): queries for coven invites + members + state

Four helpers: getPendingInvites (inbound pending with sender profiles),
getMyCovenMembers (both directions of the canonical pair, joined to
profiles), getPendingInviteCount (for TopNav badge), getCovenStateBetween
(returns 'none' | 'pending_outbound' | 'pending_inbound' | 'member' for
rendering the CovenButton's state machine on profile pages)."
```

---

## Task 7: queries/profiles.ts extended

**Files:**
- Modify: `app/lib/queries/profiles.ts`

- [ ] **Step 1: Read the existing file + append new functions**

Open `app/lib/queries/profiles.ts`. It currently exports `getMyProfile` and `getProfileByHandle`. Add two new functions at the end:

```typescript
export async function getProfilesBySearch(
  client: Client,
  opts: { q?: string; limit?: number } = {},
) {
  let query = client
    .from("profiles")
    .select("id, handle, display_name, avatar_url, bio, created_at")
    .order("handle", { ascending: true })
    .limit(opts.limit ?? 60);
  if (opts.q && opts.q.trim()) {
    const q = opts.q.trim();
    query = query.or(`handle.ilike.%${q}%,display_name.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export interface ProfileBundle {
  profile: {
    id: string;
    handle: string;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    created_at: string;
  };
  lists: Array<{ id: string; title: string; description: string | null; is_official: boolean; is_public: boolean }>;
  coven: Array<{ id: string; handle: string; display_name: string | null; avatar_url: string | null }>;
  activity: unknown[];
}

export async function getPublicProfileBundle(
  client: Client,
  handle: string,
): Promise<ProfileBundle | null> {
  const { data: profile, error } = await client
    .from("profiles")
    .select("id, handle, display_name, bio, avatar_url, created_at")
    .ilike("handle", handle)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return null;

  const { data: lists } = await client
    .from("lists")
    .select("id, title, description, is_official, is_public")
    .eq("owner_user_id", profile.id)
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  const { data: pairs } = await client
    .from("coven_members")
    .select("user_a_id, user_b_id")
    .or(`user_a_id.eq.${profile.id},user_b_id.eq.${profile.id}`);
  const otherIds = (pairs ?? []).map(p => (p.user_a_id === profile.id ? p.user_b_id : p.user_a_id));
  let coven: Array<{ id: string; handle: string; display_name: string | null; avatar_url: string | null }> = [];
  if (otherIds.length > 0) {
    const { data: cov } = await client
      .from("profiles")
      .select("id, handle, display_name, avatar_url")
      .in("id", otherIds);
    coven = cov ?? [];
  }

  return {
    profile,
    lists: lists ?? [],
    coven,
    activity: [], // populated by getEnrichedFeed variant when rendering the page
  };
}
```

- [ ] **Step 2: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/lib/queries/profiles.ts
git commit -m "feat(app): getProfilesBySearch + getPublicProfileBundle

Search filters handle + display_name ILIKE, limit 60. Bundle loads
profile + their public lists + their coven members as parallel
queries. Activity is fetched separately in the page component via
getEnrichedFeed scoped to the profile's actor id."
```

---

## Task 8: queries/activity.ts — getEnrichedFeed

**Files:**
- Modify: `app/lib/queries/activity.ts`

- [ ] **Step 1: Replace the file**

```typescript
// app/lib/queries/activity.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

interface ActorLite {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface FilmLite {
  id: string;
  title: string;
  director: string;
  year: number;
  artwork_url: string;
  itunes_url: string;
}

interface ListLite {
  id: string;
  title: string;
}

interface RecipientLite {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
}

export type EnrichedActivity =
  | { id: string; kind: "recommendation_sent"; created_at: string; actor: ActorLite; film: FilmLite; recipient: RecipientLite; note: string }
  | { id: string; kind: "review_published"; created_at: string; actor: ActorLite; film: FilmLite; title: string; pullquote: string | null }
  | { id: string; kind: "watchlist_added"; created_at: string; actor: ActorLite; film: FilmLite }
  | { id: string; kind: "list_created"; created_at: string; actor: ActorLite; list: ListLite }
  | { id: string; kind: "list_film_added"; created_at: string; actor: ActorLite; list: ListLite; film: FilmLite }
  | { id: string; kind: "coven_joined"; created_at: string; actor: ActorLite; other: RecipientLite };

interface RawRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
  actor_id: string;
  actor_handle: string;
  actor_display_name: string | null;
  actor_avatar: string | null;
  film_id: string | null;
  film_title: string | null;
  film_year: number | null;
  film_director: string | null;
  film_artwork: string | null;
  film_itunes_url: string | null;
  recipient_id: string | null;
  recipient_handle: string | null;
  recipient_display_name: string | null;
  recipient_avatar: string | null;
  list_id: string | null;
  list_title: string | null;
}

export async function getEnrichedFeed(
  client: Client,
  followerUserId: string,
  limit = 50,
): Promise<EnrichedActivity[]> {
  // Raw SQL executed via an rpc-less path: we run discrete Supabase queries
  // rather than a single SQL JOIN, because supabase-js's select embed is
  // awkward for optional payload-derived joins across three tables.
  const { data: followsRows } = await client
    .from("follows")
    .select("followed_user_id")
    .eq("follower_user_id", followerUserId);
  const followedIds = (followsRows ?? []).map(r => r.followed_user_id);
  if (followedIds.length === 0) return [];

  const { data: raw, error } = await client
    .from("activity")
    .select("id, kind, payload, created_at, actor_user_id")
    .in("actor_user_id", followedIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!raw || raw.length === 0) return [];

  // Collect ids to batch-load the related rows.
  const actorIds = Array.from(new Set(raw.map(r => r.actor_user_id)));
  const filmIds = Array.from(new Set(raw.map(r => (r.payload as any)?.film_id).filter(Boolean)));
  const recipientIds = Array.from(new Set(raw.map(r => (r.payload as any)?.to_user_id).filter(Boolean)));
  const listIds = Array.from(new Set(raw.map(r => (r.payload as any)?.list_id).filter(Boolean)));

  const [actors, films, recipients, lists] = await Promise.all([
    actorIds.length ? client.from("profiles").select("id, handle, display_name, avatar_url").in("id", actorIds) : Promise.resolve({ data: [] as any }),
    filmIds.length ? client.from("films").select("id, title, director, year, artwork_url, itunes_url").in("id", filmIds) : Promise.resolve({ data: [] as any }),
    recipientIds.length ? client.from("profiles").select("id, handle, display_name, avatar_url").in("id", recipientIds) : Promise.resolve({ data: [] as any }),
    listIds.length ? client.from("lists").select("id, title").in("id", listIds) : Promise.resolve({ data: [] as any }),
  ]);

  const actorMap = new Map((actors.data ?? []).map((r: any) => [r.id, r]));
  const filmMap = new Map((films.data ?? []).map((r: any) => [r.id, r]));
  const recipientMap = new Map((recipients.data ?? []).map((r: any) => [r.id, r]));
  const listMap = new Map((lists.data ?? []).map((r: any) => [r.id, r]));

  const out: EnrichedActivity[] = [];
  for (const r of raw) {
    const actor = actorMap.get(r.actor_user_id) as ActorLite | undefined;
    if (!actor) continue;
    const payload = r.payload as any;
    const film = payload?.film_id ? (filmMap.get(payload.film_id) as FilmLite | undefined) : undefined;
    const recipient = payload?.to_user_id ? (recipientMap.get(payload.to_user_id) as RecipientLite | undefined) : undefined;
    const list = payload?.list_id ? (listMap.get(payload.list_id) as ListLite | undefined) : undefined;

    const base = { id: r.id, created_at: r.created_at, actor };

    switch (r.kind) {
      case "recommendation_sent":
        if (film && recipient) out.push({ ...base, kind: "recommendation_sent", film, recipient, note: payload.note ?? "" });
        break;
      case "review_published":
        if (film) out.push({ ...base, kind: "review_published", film, title: payload.title ?? "", pullquote: payload.pullquote ?? null });
        break;
      case "watchlist_added":
        if (film) out.push({ ...base, kind: "watchlist_added", film });
        break;
      case "list_created":
        if (list) out.push({ ...base, kind: "list_created", list });
        break;
      case "list_film_added":
        if (list && film) out.push({ ...base, kind: "list_film_added", list, film });
        break;
      case "coven_joined":
        if (recipient) out.push({ ...base, kind: "coven_joined", other: recipient });
        break;
    }
  }
  return out;
}
```

- [ ] **Step 2: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: exit 0. If TypeScript complains about `getFeed` being removed (the old signature), note that the only caller is `home/page.tsx` and we'll update it in Task 14. For now typecheck may fail until Task 14 lands. If so, leave the old `getFeed` export as a stub that calls `getEnrichedFeed` internally:

```typescript
export async function getFeed(client: Client, limit = 50): Promise<EnrichedActivity[]> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return [];
  return getEnrichedFeed(client, user.id, limit);
}
```

Add that at the end of the file. Now `home/page.tsx`'s existing call compiles AND uses the new enrichment.

- [ ] **Step 3: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/lib/queries/activity.ts
git commit -m "feat(app): getEnrichedFeed replaces getFeed

Batches related-row loads (actors, films, recipients, lists) after
the activity SELECT and assembles a discriminated-union EnrichedActivity
per row. Skips rows whose required related data is missing. Old
getFeed stays as a thin wrapper to avoid breaking home/page.tsx
before Task 14 lands the rich renderers."
```

---

## Task 9: Client islands — FollowButton, CovenButton, CovenInviteActions, LeaveCovenButton

**Files:**
- Create: `app/components/FollowButton.tsx`
- Create: `app/components/CovenButton.tsx`
- Create: `app/components/CovenInviteActions.tsx`
- Create: `app/components/LeaveCovenButton.tsx`

- [ ] **Step 1: FollowButton.tsx**

```tsx
"use client";

import { useState, useTransition } from "react";
import { follow, unfollow } from "@/lib/actions/follows";

interface Props {
  userId: string;
  handle: string;
  initialFollowing: boolean;
}

export default function FollowButton({ userId, handle, initialFollowing }: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      try {
        if (following) {
          await unfollow(userId, handle);
          setFollowing(false);
        } else {
          await follow(userId, handle);
          setFollowing(true);
        }
      } catch (e) { console.error(e); }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className="btn btn-outline"
      style={{ color: "var(--bone)", borderColor: "var(--bone)" }}
    >
      {following ? "✓ Following" : "+ Follow"}
    </button>
  );
}
```

- [ ] **Step 2: CovenButton.tsx**

```tsx
"use client";

import { useState, useTransition } from "react";
import { sendCovenRequest, declineCovenRequest, acceptCovenRequest } from "@/lib/actions/coven";
import type { CovenState } from "@/lib/queries/coven";

interface Props {
  targetUserId: string;
  targetHandle: string;
  initialState: CovenState;
  initialRequestId: string | null;
}

export default function CovenButton({ targetUserId, targetHandle, initialState, initialRequestId }: Props) {
  const [state, setState] = useState<CovenState>(initialState);
  const [requestId, setRequestId] = useState<string | null>(initialRequestId);
  const [pending, start] = useTransition();

  function dispatch(kind: "invite" | "cancel" | "accept" | "decline") {
    start(async () => {
      try {
        if (kind === "invite") {
          const { id } = await sendCovenRequest(targetUserId, targetHandle);
          setRequestId(id);
          setState("pending_outbound");
        } else if (kind === "cancel" && requestId) {
          await declineCovenRequest(requestId);
          setRequestId(null);
          setState("none");
        } else if (kind === "accept" && requestId) {
          await acceptCovenRequest(requestId);
          setRequestId(null);
          setState("member");
        } else if (kind === "decline" && requestId) {
          await declineCovenRequest(requestId);
          setRequestId(null);
          setState("none");
        }
      } catch (e) { console.error(e); }
    });
  }

  const base = { padding: "10px 18px", cursor: "pointer" as const, fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" as const };

  if (state === "none") {
    return <button onClick={() => dispatch("invite")} disabled={pending} className="btn" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: "2px solid var(--accent)" }}>✦ Invite to Coven</button>;
  }
  if (state === "pending_outbound") {
    return <button onClick={() => dispatch("cancel")} disabled={pending} className="btn btn-outline" style={{ color: "var(--bone)", borderColor: "var(--muted)" }}>Cancel invite</button>;
  }
  if (state === "pending_inbound") {
    return (
      <span style={{ display: "inline-flex", gap: 6 }}>
        <button onClick={() => dispatch("accept")} disabled={pending} style={{ ...base, background: "var(--accent)", color: "var(--accent-ink)", border: "2px solid var(--accent)" }}>Accept</button>
        <button onClick={() => dispatch("decline")} disabled={pending} style={{ ...base, background: "transparent", color: "var(--bone)", border: "2px solid var(--muted)" }}>Decline</button>
      </span>
    );
  }
  // member
  return <span className="caps" style={{ fontSize: 11, color: "var(--accent)" }}>✦ In your coven</span>;
}
```

- [ ] **Step 3: CovenInviteActions.tsx**

```tsx
"use client";

import { useTransition } from "react";
import { acceptCovenRequest, declineCovenRequest } from "@/lib/actions/coven";

interface Props { requestId: string; }

export default function CovenInviteActions({ requestId }: Props) {
  const [pending, start] = useTransition();
  const act = (fn: (id: string) => Promise<void>) =>
    start(async () => { try { await fn(requestId); } catch (e) { console.error(e); } });

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={() => act(acceptCovenRequest)} disabled={pending}
        style={{ padding: "8px 14px", background: "var(--accent)", color: "var(--accent-ink)", border: "2px solid var(--accent)", cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Accept
      </button>
      <button onClick={() => act(declineCovenRequest)} disabled={pending}
        style={{ padding: "8px 14px", background: "transparent", color: "var(--bone)", border: "2px solid var(--muted)", cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Decline
      </button>
    </div>
  );
}
```

- [ ] **Step 4: LeaveCovenButton.tsx**

```tsx
"use client";

import { useState, useTransition } from "react";
import { leaveCoven } from "@/lib/actions/coven";

interface Props { otherUserId: string; otherHandle: string; otherDisplayName: string; }

export default function LeaveCovenButton({ otherUserId, otherHandle, otherDisplayName }: Props) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  function onLeave() {
    start(async () => {
      try { await leaveCoven(otherUserId, otherHandle); }
      catch (e) { console.error(e); }
    });
  }

  if (!confirm) {
    return (
      <button onClick={() => setConfirm(true)} className="caps"
        style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--muted)", padding: "6px 10px", fontSize: 10, cursor: "pointer" }}>
        Leave
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button onClick={onLeave} disabled={pending}
        style={{ padding: "6px 10px", background: "var(--blood)", color: "var(--bone)", border: 0, cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Leave {otherDisplayName}?
      </button>
      <button onClick={() => setConfirm(false)}
        style={{ padding: "6px 10px", background: "transparent", color: "var(--muted)", border: "1px solid var(--muted)", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: 10 }}>
        Cancel
      </button>
    </span>
  );
}
```

- [ ] **Step 5: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/components/FollowButton.tsx app/components/CovenButton.tsx app/components/CovenInviteActions.tsx app/components/LeaveCovenButton.tsx
git commit -m "feat(app): follow + coven client islands

FollowButton toggles +/✓. CovenButton is a four-state machine (none,
pending_outbound, pending_inbound, member) driving the right action.
CovenInviteActions pairs Accept+Decline for /coven. LeaveCovenButton
has a confirm-then-submit flow for the mutual-agreement framing."
```

---

## Task 10: /people browse page + PeopleSearch

**Files:**
- Create: `app/components/PeopleSearch.tsx`
- Create: `app/app/people/page.tsx`

- [ ] **Step 1: PeopleSearch.tsx**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export default function PeopleSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [, start] = useTransition();

  function update(next: string) {
    setQ(next);
    start(() => {
      const p = new URLSearchParams(params);
      if (next) p.set("q", next); else p.delete("q");
      router.push(`/people?${p.toString()}`);
    });
  }

  return (
    <input
      value={q}
      onChange={e => update(e.target.value)}
      placeholder="Handle or display name…"
      style={{ flex: 1, background: "transparent", border: 0, fontFamily: "var(--font-serif)", fontSize: 20, padding: "12px 8px", color: "var(--void)", outline: "none" }}
    />
  );
}
```

- [ ] **Step 2: /people page**

```tsx
// app/app/people/page.tsx
import { createClient } from "@/lib/supabase/server";
import { getProfilesBySearch } from "@/lib/queries/profiles";
import TopNav from "@/components/TopNav";
import PeopleSearch from "@/components/PeopleSearch";
import Avatar from "@/components/Avatar";
import Link from "next/link";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const profiles = await getProfilesBySearch(supabase, { q });

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="people" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "44px 0 32px" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>Chapter IV · The Covenfolk</div>
          <h1 className="display" style={{ fontSize: 112, margin: 0, lineHeight: 0.88 }}>
            Find Your <em style={{ color: "var(--accent)" }}>People</em>.
          </h1>
          <div style={{ display: "flex", border: "3px solid var(--void)", background: "var(--bone)", boxShadow: "6px 6px 0 var(--accent)", marginTop: 24 }}>
            <span style={{ padding: "16px 18px", fontFamily: "var(--font-display)", fontSize: 28, color: "var(--accent)", lineHeight: 1 }}>✦</span>
            <PeopleSearch />
          </div>
        </div>
      </section>

      <section style={{ padding: "36px 0 60px" }}>
        <div className="container-wide">
          {profiles.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
              No souls match your search.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
              {profiles.map(p => (
                <Link key={p.id} href={`/p/${encodeURIComponent(p.handle)}`} style={{ display: "block", textDecoration: "none", color: "inherit", border: "2px solid var(--bone)", padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                    <Avatar name={p.display_name ?? p.handle} color="var(--accent)" size={48} />
                    <div>
                      <div className="head" style={{ fontSize: 20, lineHeight: 1 }}>{p.display_name ?? p.handle}</div>
                      <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>@{p.handle}</div>
                    </div>
                  </div>
                  {p.bio && <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontStyle: "italic", color: "var(--bone)", opacity: 0.8, marginTop: 8 }}>{p.bio}</div>}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

Expected: exit 0 for both.

- [ ] **Step 4: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/components/PeopleSearch.tsx app/app/people/page.tsx
git commit -m "feat(app): /people browse page with handle+name search

Same shape as /films — Server Component with a client-island search
input that syncs ?q= to the URL. Shows 4-column grid of profile cards
linked to /p/[handle]. Empty state when no match."
```

---

## Task 11: /p/[handle] public profile page

**Files:**
- Create: `app/app/p/[handle]/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// app/app/p/[handle]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicProfileBundle } from "@/lib/queries/profiles";
import { getCovenStateBetween } from "@/lib/queries/coven";
import { getEnrichedFeed } from "@/lib/queries/activity";
import TopNav from "@/components/TopNav";
import Avatar from "@/components/Avatar";
import FollowButton from "@/components/FollowButton";
import CovenButton from "@/components/CovenButton";
import ActivityRow from "@/components/activity/ActivityRow";
import Link from "next/link";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const supabase = await createClient();
  const bundle = await getPublicProfileBundle(supabase, handle);
  if (!bundle) notFound();

  const { data: { user } } = await supabase.auth.getUser();

  let amFollowing = false;
  let coven = { state: "none" as const, requestId: null as string | null };
  if (user && user.id !== bundle.profile.id) {
    const { data: follow } = await supabase
      .from("follows")
      .select("follower_user_id")
      .eq("follower_user_id", user.id)
      .eq("followed_user_id", bundle.profile.id)
      .maybeSingle();
    amFollowing = !!follow;
    coven = await getCovenStateBetween(supabase, user.id, bundle.profile.id);
  }

  // Fetch this user's own recent activity (their acts, not their feed).
  const { data: ownActivity } = await supabase
    .from("activity")
    .select("id, kind, payload, created_at, actor_user_id")
    .eq("actor_user_id", bundle.profile.id)
    .order("created_at", { ascending: false })
    .limit(10);
  // We reuse getEnrichedFeed's enrichment by faking a follow relationship;
  // simpler here to just enrich inline via a helper query:
  const enrichedOwn = await enrichOwnActivity(supabase, ownActivity ?? [], bundle.profile);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav />

      <section style={{ background: "var(--void-2)", borderBottom: "3px solid var(--void)", padding: "48px 0" }}>
        <div className="container-wide" style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 32, alignItems: "center" }}>
          <Avatar name={bundle.profile.display_name ?? bundle.profile.handle} color="var(--accent)" size={140} />
          <div>
            <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8 }}>Profile</div>
            <h1 className="display" style={{ fontSize: 72, margin: 0, lineHeight: 0.9 }}>
              {bundle.profile.display_name ?? bundle.profile.handle}
            </h1>
            <div className="caps" style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>@{bundle.profile.handle}</div>
            {bundle.profile.bio && <p style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontStyle: "italic", marginTop: 20, maxWidth: 560 }}>{bundle.profile.bio}</p>}
            {user && user.id !== bundle.profile.id && (
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <FollowButton userId={bundle.profile.id} handle={bundle.profile.handle} initialFollowing={amFollowing} />
                <CovenButton targetUserId={bundle.profile.id} targetHandle={bundle.profile.handle} initialState={coven.state} initialRequestId={coven.requestId} />
              </div>
            )}
          </div>
        </div>
      </section>

      <section style={{ background: "var(--bone)", color: "var(--void)", padding: "48px 0", borderBottom: "3px solid var(--void)" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>Their Grimoires</div>
          {bundle.lists.length === 0 ? (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>No public lists.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
              {bundle.lists.map(l => (
                <div key={l.id} style={{ border: "2px solid var(--void)", padding: 20 }}>
                  {l.is_official && <span className="stamp" style={{ background: "var(--accent)", color: "var(--accent-ink)", marginBottom: 12, display: "inline-block" }}>✦ Official</span>}
                  <div className="head" style={{ fontSize: 22, lineHeight: 1.1, marginBottom: 8 }}>{l.title}</div>
                  {l.description && <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, opacity: 0.8 }}>{l.description}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={{ padding: "48px 0", borderBottom: "3px solid var(--void)" }}>
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 10 }}>Their Coven</div>
          {bundle.coven.length === 0 ? (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>No coven yet.</div>
          ) : (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {bundle.coven.map(m => (
                <Link key={m.id} href={`/p/${encodeURIComponent(m.handle)}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "inherit", textDecoration: "none" }}>
                  <Avatar name={m.display_name ?? m.handle} color="var(--accent)" size={56} />
                  <div className="caps" style={{ fontSize: 10 }}>@{m.handle}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={{ padding: "48px 0" }}>
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 10 }}>Recent Activity</div>
          {enrichedOwn.length === 0 ? (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>Nothing yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {enrichedOwn.map(item => <ActivityRow key={item.id} item={item} />)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// Inline enrichment for a single user's own activity. Mirrors the shape
// of getEnrichedFeed but without the follows filter.
async function enrichOwnActivity(supabase: any, rows: any[], profile: any) {
  if (rows.length === 0) return [] as any[];
  const filmIds = Array.from(new Set(rows.map(r => r.payload?.film_id).filter(Boolean)));
  const recipientIds = Array.from(new Set(rows.map(r => r.payload?.to_user_id).filter(Boolean)));
  const listIds = Array.from(new Set(rows.map(r => r.payload?.list_id).filter(Boolean)));

  const [films, recipients, lists] = await Promise.all([
    filmIds.length ? supabase.from("films").select("id, title, director, year, artwork_url, itunes_url").in("id", filmIds) : Promise.resolve({ data: [] }),
    recipientIds.length ? supabase.from("profiles").select("id, handle, display_name, avatar_url").in("id", recipientIds) : Promise.resolve({ data: [] }),
    listIds.length ? supabase.from("lists").select("id, title").in("id", listIds) : Promise.resolve({ data: [] }),
  ]);

  const filmMap = new Map((films.data ?? []).map((r: any) => [r.id, r]));
  const recipMap = new Map((recipients.data ?? []).map((r: any) => [r.id, r]));
  const listMap = new Map((lists.data ?? []).map((r: any) => [r.id, r]));

  const actor = { id: profile.id, handle: profile.handle, display_name: profile.display_name, avatar_url: profile.avatar_url };
  const out: any[] = [];
  for (const r of rows) {
    const base = { id: r.id, created_at: r.created_at, actor };
    const film = r.payload?.film_id ? filmMap.get(r.payload.film_id) : undefined;
    const recipient = r.payload?.to_user_id ? recipMap.get(r.payload.to_user_id) : undefined;
    const list = r.payload?.list_id ? listMap.get(r.payload.list_id) : undefined;
    switch (r.kind) {
      case "recommendation_sent": if (film && recipient) out.push({ ...base, kind: "recommendation_sent", film, recipient, note: r.payload.note ?? "" }); break;
      case "review_published":   if (film) out.push({ ...base, kind: "review_published", film, title: r.payload.title ?? "", pullquote: r.payload.pullquote ?? null }); break;
      case "watchlist_added":    if (film) out.push({ ...base, kind: "watchlist_added", film }); break;
      case "list_created":       if (list) out.push({ ...base, kind: "list_created", list }); break;
      case "list_film_added":    if (list && film) out.push({ ...base, kind: "list_film_added", list, film }); break;
      case "coven_joined":       if (recipient) out.push({ ...base, kind: "coven_joined", other: recipient }); break;
    }
  }
  return out;
}
```

- [ ] **Step 2: Typecheck + build**

Build will fail if ActivityRow isn't created yet — this task depends on Task 13's ActivityRow component. If Task 13 hasn't landed, skip the `import ActivityRow` line and replace the activity-row rendering with `<div>{JSON.stringify(item)}</div>` as a temporary placeholder, or execute Task 13 first (order isn't strict).

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

- [ ] **Step 3: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/app/p/[handle]/page.tsx
git commit -m "feat(app): public profile page /p/[handle]

Server Component loading profile + public lists + coven + last-10
activity. Renders Follow + Coven buttons when viewer is authed and
not viewing themselves. 404s when handle doesn't resolve. Activity
enriched inline (getEnrichedFeed is follows-scoped; we bypass for
the profile-owned activity slice)."
```

---

## Task 12: /coven page

**Files:**
- Create: `app/app/coven/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// app/app/coven/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPendingInvites, getMyCovenMembers } from "@/lib/queries/coven";
import TopNav from "@/components/TopNav";
import Avatar from "@/components/Avatar";
import CovenInviteActions from "@/components/CovenInviteActions";
import LeaveCovenButton from "@/components/LeaveCovenButton";
import Link from "next/link";

export default async function CovenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin?redirect=/coven");

  const [invites, members] = await Promise.all([
    getPendingInvites(supabase, user.id),
    getMyCovenMembers(supabase, user.id),
  ]);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="coven" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "44px 0 32px" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>Chapter V</div>
          <h1 className="display" style={{ fontSize: 112, margin: 0, lineHeight: 0.88 }}>The <em style={{ color: "var(--accent)" }}>Coven</em>.</h1>
        </div>
      </section>

      <section style={{ padding: "48px 0", borderBottom: "3px solid var(--void)" }}>
        <div className="container-wide">
          <h2 className="head" style={{ fontSize: 32, margin: "0 0 20px" }}>Pending Invitations</h2>
          {invites.length === 0 ? (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>No pending invites.</div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {invites.map(inv => (
                <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 20, padding: 18, border: "1px solid var(--muted)" }}>
                  <Avatar name={inv.from.display_name ?? inv.from.handle} color="var(--accent)" size={48} />
                  <div style={{ flex: 1 }}>
                    <div className="head" style={{ fontSize: 18, lineHeight: 1 }}>
                      <Link href={`/p/${encodeURIComponent(inv.from.handle)}`} style={{ color: "var(--bone)", textDecoration: "none" }}>
                        {inv.from.display_name ?? inv.from.handle}
                      </Link>
                    </div>
                    <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>@{inv.from.handle}</div>
                  </div>
                  <CovenInviteActions requestId={inv.id} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={{ padding: "48px 0" }}>
        <div className="container-wide">
          <h2 className="head" style={{ fontSize: 32, margin: "0 0 20px" }}>Your Coven</h2>
          {members.length === 0 ? (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
              Your coven is empty. Visit <Link href="/people" style={{ color: "var(--accent)" }}>/people</Link> to find souls to bind with.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
              {members.map(m => (
                <div key={m.id} style={{ border: "1px solid var(--muted)", padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <Avatar name={m.display_name ?? m.handle} color="var(--accent)" size={48} />
                    <div style={{ flex: 1 }}>
                      <Link href={`/p/${encodeURIComponent(m.handle)}`} style={{ color: "var(--bone)", textDecoration: "none" }}>
                        <div className="head" style={{ fontSize: 18, lineHeight: 1 }}>{m.display_name ?? m.handle}</div>
                        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>@{m.handle}</div>
                      </Link>
                    </div>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <LeaveCovenButton otherUserId={m.id} otherHandle={m.handle} otherDisplayName={m.display_name ?? m.handle} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

- [ ] **Step 3: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/app/coven/page.tsx
git commit -m "feat(app): /coven page — pending invites + your coven

Auth-gated Server Component loading pending invites + current coven
members in parallel. Pending invites show Accept/Decline via
CovenInviteActions. Members show Leave (confirm-then-submit) via
LeaveCovenButton. Empty states for both sections; when both empty,
the members section links to /people."
```

---

## Task 13: Activity renderers + ActivityRow dispatcher

**Files:**
- Create: `app/components/activity/relativeTime.ts`
- Create: `app/components/activity/ActivityRow.tsx`
- Create: `app/components/activity/ActivityRecommendationSent.tsx`
- Create: `app/components/activity/ActivityReviewPublished.tsx`
- Create: `app/components/activity/ActivityWatchlistAdded.tsx`
- Create: `app/components/activity/ActivityListCreated.tsx`
- Create: `app/components/activity/ActivityListFilmAdded.tsx`
- Create: `app/components/activity/ActivityCovenJoined.tsx`

- [ ] **Step 1: relativeTime.ts**

```typescript
// app/components/activity/relativeTime.ts
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
```

- [ ] **Step 2: ActivityRecommendationSent.tsx**

```tsx
import Link from "next/link";
import Avatar from "../Avatar";
import { relativeTime } from "./relativeTime";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "recommendation_sent" }>;

export default function ActivityRecommendationSent({ item }: { item: Item }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.display_name ?? item.actor.handle} color="var(--accent)" size={40} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link href={`/p/${encodeURIComponent(item.actor.handle)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.display_name ?? item.actor.handle}</Link>
          {" recommended "}
          <Link href={`/film/${item.film.id}`} style={{ color: "var(--accent)", fontStyle: "italic" }}>{item.film.title}</Link>
          {" to "}
          <Link href={`/p/${encodeURIComponent(item.recipient.handle)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.recipient.display_name ?? item.recipient.handle}</Link>.
        </div>
        {item.note && <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginTop: 4, color: "var(--muted)" }}>&ldquo;{item.note}&rdquo;</div>}
        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>{relativeTime(item.created_at)}</div>
      </div>
      <Link href={`/film/${item.film.id}`}>
        <img src={item.film.artwork_url} alt={item.film.title} width={40} height={60} style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }} />
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: ActivityReviewPublished.tsx**

```tsx
import Link from "next/link";
import Avatar from "../Avatar";
import { relativeTime } from "./relativeTime";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "review_published" }>;

export default function ActivityReviewPublished({ item }: { item: Item }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.display_name ?? item.actor.handle} color="var(--accent)" size={40} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link href={`/p/${encodeURIComponent(item.actor.handle)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.display_name ?? item.actor.handle}</Link>
          {" published a review of "}
          <Link href={`/film/${item.film.id}`} style={{ color: "var(--accent)", fontStyle: "italic" }}>{item.film.title}</Link>.
        </div>
        {item.pullquote && <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, marginTop: 4, color: "var(--bone)", borderLeft: "2px solid var(--accent)", paddingLeft: 10 }}>&ldquo;{item.pullquote}&rdquo;</div>}
        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>{relativeTime(item.created_at)}</div>
      </div>
      <Link href={`/film/${item.film.id}`}>
        <img src={item.film.artwork_url} alt={item.film.title} width={40} height={60} style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }} />
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: ActivityWatchlistAdded.tsx**

```tsx
import Link from "next/link";
import Avatar from "../Avatar";
import { relativeTime } from "./relativeTime";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "watchlist_added" }>;

export default function ActivityWatchlistAdded({ item }: { item: Item }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.display_name ?? item.actor.handle} color="var(--accent)" size={40} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link href={`/p/${encodeURIComponent(item.actor.handle)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.display_name ?? item.actor.handle}</Link>
          {" added "}
          <Link href={`/film/${item.film.id}`} style={{ color: "var(--accent)", fontStyle: "italic" }}>{item.film.title}</Link>
          {" to their watchlist."}
        </div>
        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>{relativeTime(item.created_at)}</div>
      </div>
      <Link href={`/film/${item.film.id}`}>
        <img src={item.film.artwork_url} alt={item.film.title} width={40} height={60} style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }} />
      </Link>
    </div>
  );
}
```

- [ ] **Step 5: ActivityListCreated.tsx**

```tsx
import Link from "next/link";
import Avatar from "../Avatar";
import { relativeTime } from "./relativeTime";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "list_created" }>;

export default function ActivityListCreated({ item }: { item: Item }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.display_name ?? item.actor.handle} color="var(--accent)" size={40} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link href={`/p/${encodeURIComponent(item.actor.handle)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.display_name ?? item.actor.handle}</Link>
          {" curated a new grimoire: "}
          <Link href="/lists" style={{ color: "var(--accent)", fontStyle: "italic" }}>{item.list.title}</Link>.
        </div>
        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>{relativeTime(item.created_at)}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: ActivityListFilmAdded.tsx**

```tsx
import Link from "next/link";
import Avatar from "../Avatar";
import { relativeTime } from "./relativeTime";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "list_film_added" }>;

export default function ActivityListFilmAdded({ item }: { item: Item }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.display_name ?? item.actor.handle} color="var(--accent)" size={40} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link href={`/p/${encodeURIComponent(item.actor.handle)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.display_name ?? item.actor.handle}</Link>
          {" added "}
          <Link href={`/film/${item.film.id}`} style={{ color: "var(--accent)", fontStyle: "italic" }}>{item.film.title}</Link>
          {" to "}
          <Link href="/lists" style={{ color: "var(--accent)", fontStyle: "italic" }}>{item.list.title}</Link>.
        </div>
        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>{relativeTime(item.created_at)}</div>
      </div>
      <Link href={`/film/${item.film.id}`}>
        <img src={item.film.artwork_url} alt={item.film.title} width={40} height={60} style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }} />
      </Link>
    </div>
  );
}
```

- [ ] **Step 7: ActivityCovenJoined.tsx**

```tsx
import Link from "next/link";
import Avatar from "../Avatar";
import { relativeTime } from "./relativeTime";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "coven_joined" }>;

export default function ActivityCovenJoined({ item }: { item: Item }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.display_name ?? item.actor.handle} color="var(--accent)" size={40} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link href={`/p/${encodeURIComponent(item.actor.handle)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.display_name ?? item.actor.handle}</Link>
          {" joined "}
          <Link href={`/p/${encodeURIComponent(item.other.handle)}`} style={{ color: "var(--accent)", fontWeight: 700 }}>{item.other.display_name ?? item.other.handle}</Link>
          {"'s coven."}
        </div>
        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>{relativeTime(item.created_at)}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: ActivityRow.tsx dispatcher**

```tsx
import type { EnrichedActivity } from "@/lib/queries/activity";
import ActivityRecommendationSent from "./ActivityRecommendationSent";
import ActivityReviewPublished from "./ActivityReviewPublished";
import ActivityWatchlistAdded from "./ActivityWatchlistAdded";
import ActivityListCreated from "./ActivityListCreated";
import ActivityListFilmAdded from "./ActivityListFilmAdded";
import ActivityCovenJoined from "./ActivityCovenJoined";

export default function ActivityRow({ item }: { item: EnrichedActivity }) {
  switch (item.kind) {
    case "recommendation_sent": return <ActivityRecommendationSent item={item} />;
    case "review_published": return <ActivityReviewPublished item={item} />;
    case "watchlist_added": return <ActivityWatchlistAdded item={item} />;
    case "list_created": return <ActivityListCreated item={item} />;
    case "list_film_added": return <ActivityListFilmAdded item={item} />;
    case "coven_joined": return <ActivityCovenJoined item={item} />;
  }
}
```

- [ ] **Step 9: Typecheck + build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

- [ ] **Step 10: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/components/activity/
git commit -m "feat(app): per-kind activity renderers + ActivityRow dispatcher

Six typed renderers (recommendation_sent, review_published,
watchlist_added, list_created, list_film_added, coven_joined) +
relativeTime util + ActivityRow that switches on the discriminant.
Each row: actor avatar + linked handles + verb phrase + film poster
thumbnail where applicable + relative timestamp. Replaces the JSON
dump from sub-project 3's FeedTabs."
```

---

## Task 14: FeedTabs rewrite + home page integration

**Files:**
- Modify: `app/components/FeedTabs.tsx`
- Modify: `app/app/home/page.tsx`

- [ ] **Step 1: Replace FeedTabs.tsx**

```tsx
// app/components/FeedTabs.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ActivityRow from "./activity/ActivityRow";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Tab = "all" | "reviews" | "recs" | "lists";

const MATCHERS: Record<Tab, (k: EnrichedActivity["kind"]) => boolean> = {
  all: () => true,
  reviews: (k) => k === "review_published",
  recs: (k) => k === "recommendation_sent",
  lists: (k) => k === "list_created" || k === "list_film_added",
};

interface Props { items: EnrichedActivity[]; }

export default function FeedTabs({ items }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const urlTab = (params.get("tab") as Tab) || "all";
  const [tab, setTab] = useState<Tab>(urlTab);

  useEffect(() => { setTab(urlTab); }, [urlTab]);

  useEffect(() => {
    function onFocus() { router.refresh(); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);

  function pickTab(next: Tab) {
    const p = new URLSearchParams(params);
    if (next === "all") p.delete("tab"); else p.set("tab", next);
    router.push(`/home?${p.toString()}`);
  }

  const filtered = items.filter(i => MATCHERS[tab](i.kind));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
        {(["all", "reviews", "recs", "lists"] as Tab[]).map(t => (
          <button key={t} onClick={() => pickTab(t)} className="caps" style={{
            background: tab === t ? "var(--accent)" : "transparent",
            color: tab === t ? "var(--accent-ink)" : "var(--muted)",
            border: "1px solid " + (tab === t ? "var(--accent)" : "#333"),
            padding: "6px 12px", fontSize: 10, cursor: "pointer",
            fontFamily: "var(--font-ui)", fontWeight: 700,
          }}>{t}</button>
        ))}
        <button onClick={() => router.refresh()} className="caps" style={{ marginLeft: "auto", background: "transparent", color: "var(--muted)", border: "1px solid #333", padding: "6px 12px", fontSize: 10, cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700 }}>
          Refresh
        </button>
      </div>
      <div style={{ display: "grid", gap: 0 }}>
        {filtered.length === 0 ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6, padding: "20px 0" }}>
            No activity yet. Visit <a href="/people" style={{ color: "var(--accent)" }}>/people</a> to follow someone.
          </div>
        ) : (
          filtered.map(item => <ActivityRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update home/page.tsx**

Open `app/app/home/page.tsx`. Change the imports so it uses `getEnrichedFeed`, and pass the viewer id. Current file calls `getFeed(supabase, 50)`; replace with:

```tsx
import { getEnrichedFeed } from "@/lib/queries/activity";
// ...
const { data: { user } } = await supabase.auth.getUser();
const feed = user ? await getEnrichedFeed(supabase, user.id, 50) : [];
```

Then pass `feed` to `FeedTabs`:

```tsx
<FeedTabs items={feed} />
```

Remove the `as any` cast — with the new typed discriminated union, it's no longer needed.

- [ ] **Step 3: Typecheck + build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

- [ ] **Step 4: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/components/FeedTabs.tsx app/app/home/page.tsx
git commit -m "feat(app): FeedTabs renders real activity; home uses enriched feed

Tab state in URL (?tab=), focus-refresh auto-triggers router.refresh(),
Refresh button for manual pull. Empty state links to /people. Home
page passes getEnrichedFeed output directly — typed, no 'as any'."
```

---

## Task 15: TopNav — People + Coven links + invite badge

**Files:**
- Modify: `app/components/TopNav.tsx`

- [ ] **Step 1: Extend TopNav**

Open `app/components/TopNav.tsx`. Inside the async function, after loading the profile (from Task 1), also load the pending-invite count when user is authed:

```tsx
import { getPendingInviteCount } from "@/lib/queries/coven";
// ...

let pendingInviteCount = 0;
if (user) {
  pendingInviteCount = await getPendingInviteCount(supabase, user.id);
}
```

In the authed nav items list, add two entries between Lists and Settings — People and Coven. The Coven link includes the badge when count > 0:

```tsx
{user && (
  <>
    <Link href="/home" ...>Home</Link>
    <Link href="/films" ...>Films</Link>
    <Link href="/lists" ...>Lists</Link>
    <Link href="/people" ...>People</Link>
    <Link href="/coven" style={{ position: "relative", ...existingLinkStyle }}>
      Coven
      {pendingInviteCount > 0 && (
        <span style={{ marginLeft: 6, padding: "1px 6px", background: "var(--accent)", color: "var(--accent-ink)", fontSize: 9, fontWeight: 700, borderRadius: 999 }}>
          {pendingInviteCount}
        </span>
      )}
    </Link>
  </>
)}
```

Exact merge depends on the file's current shape; preserve the existing `current` highlighting logic (each link receives `style={current === "people" ? highlightStyle : normalStyle}` — look at how Films and Lists do it today and follow the pattern).

- [ ] **Step 2: Typecheck + build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

- [ ] **Step 3: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/components/TopNav.tsx
git commit -m "feat(app): TopNav adds People + Coven links with pending-invite badge

TopNav fetches getPendingInviteCount on each render for authed users.
Coven link carries a small accent-color pill with the count when > 0.
One extra cheap COUNT query per page render; fine at MVP scale."
```

---

## Task 16: RecommendModal coven picker

**Files:**
- Modify: `app/components/RecommendModal.tsx`
- Modify: `app/app/film/[id]/page.tsx`

- [ ] **Step 1: Update RecommendModal.tsx**

The modal currently takes `filmId` + `filmTitle`. Add a `covenMembers` prop. Replace the UUID input with a select, and add an empty-state for users with no coven:

```tsx
// app/components/RecommendModal.tsx
"use client";

import { useState, useTransition } from "react";
import { recommendFilm } from "@/lib/actions/recommendations";

interface CovenMember {
  id: string;
  handle: string;
  display_name: string | null;
}

interface Props {
  filmId: string;
  filmTitle: string;
  covenMembers: CovenMember[];
}

export default function RecommendModal({ filmId, filmTitle, covenMembers }: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  async function send(formData: FormData) {
    start(async () => {
      setError(null);
      try {
        const toUserId = String(formData.get("to_user_id") || "");
        if (!toUserId) { setError("Pick a coven member."); return; }
        const noteVal = String(formData.get("note") || "");
        await recommendFilm(filmId, toUserId, noteVal);
        setSent(true);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    });
  }

  if (!open) {
    return <button className="btn btn-lg" onClick={() => setOpen(true)}>✦ Recommend To A Coven Member</button>;
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.82)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }} onClick={() => setOpen(false)}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bone)", color: "var(--void)", border: "3px solid var(--void)", boxShadow: "12px 12px 0 var(--accent)", maxWidth: 560, width: "100%", padding: "32px 32px 24px", transform: "rotate(-0.5deg)" }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ Cast The Rune ✦</div>
        <h2 className="display" style={{ fontSize: 44, margin: "0 0 16px", lineHeight: 0.9 }}>
          Recommend <em style={{ color: "var(--accent)" }}>{filmTitle}</em>
        </h2>

        {covenMembers.length === 0 ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15, lineHeight: 1.5 }}>
            You have no coven yet. Visit <a href="/people" style={{ color: "var(--accent-deep)", textDecoration: "underline" }}>/people</a> to bind with someone, then come back.
          </div>
        ) : sent ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>Sent. They'll see it in their feed.</div>
        ) : (
          <form action={send}>
            <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Coven Member</div>
            <select name="to_user_id" required defaultValue="" style={{ width: "100%", border: "2px solid var(--void)", padding: "8px 10px", fontFamily: "var(--font-ui)", fontSize: 14, marginBottom: 14, background: "var(--bone)" }}>
              <option value="">Choose someone…</option>
              {covenMembers.map(m => (
                <option key={m.id} value={m.id}>@{m.handle}{m.display_name ? ` · ${m.display_name}` : ""}</option>
              ))}
            </select>
            <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>A Whisper</div>
            <textarea name="note" value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="watch this one alone, with the lights off…"
              style={{ width: "100%", border: "2px solid var(--void)", padding: 10, fontFamily: "var(--font-serif)", fontSize: 14, marginBottom: 16, resize: "none" }} />
            {error && <div style={{ color: "var(--blood)", marginBottom: 12, fontStyle: "italic" }}>{error}</div>}
            <button type="submit" disabled={pending} className="btn btn-dark btn-lg" style={{ width: "100%", justifyContent: "center" }}>
              {pending ? "Sealing…" : "✦ Seal & Send"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update film/[id]/page.tsx**

Open `app/app/film/[id]/page.tsx`. After the existing `const { data: { user } } = await supabase.auth.getUser();`, load coven members when authed:

```tsx
import { getMyCovenMembers } from "@/lib/queries/coven";
// ...
const covenMembers = user ? await getMyCovenMembers(supabase, user.id) : [];
```

Change the RecommendModal usage — it currently reads:

```tsx
{user && <RecommendModal filmId={film.id} filmTitle={film.title} />}
```

to:

```tsx
{user && <RecommendModal filmId={film.id} filmTitle={film.title} covenMembers={covenMembers.map(m => ({ id: m.id, handle: m.handle, display_name: m.display_name }))} />}
```

- [ ] **Step 3: Typecheck + build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

- [ ] **Step 4: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/components/RecommendModal.tsx app/app/film/[id]/page.tsx
git commit -m "feat(app): RecommendModal uses coven-member picker

Replaces UUID paste box with a native <select> populated by the
viewer's coven members (loaded server-side in the film detail page).
Users with empty coven see a zine-styled empty state with a link to
/people. Button label updated to 'Recommend To A Coven Member'."
```

---

## Task 17: Middleware — auth-gate /coven

**Files:**
- Modify: `app/middleware.ts`

- [ ] **Step 1: Extend middleware**

Open `app/middleware.ts`. Find the `AUTH_REQUIRED` array:

```typescript
const AUTH_REQUIRED = ["/home", "/onboarding", "/settings"];
```

Change to:

```typescript
const AUTH_REQUIRED = ["/home", "/onboarding", "/settings", "/coven"];
```

`/people` and `/p/[handle]` stay public so unauthenticated visitors can view them.

- [ ] **Step 2: Update middleware tests**

Open `app/tests/middleware.test.ts`. Add two tests:

```typescript
it("unauthenticated user is redirected from /coven to signin", async () => {
  const res = decideRedirect(null, "/coven");
  expect(res).toEqual({ redirectTo: "/auth/signin?redirect=%2Fcoven" });
});

it("unauthenticated user can view /people", async () => {
  const res = decideRedirect(null, "/people");
  expect(res).toBeNull();
});
```

Match the exact shape of existing tests in that file.

- [ ] **Step 3: Run tests + typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/middleware.test.ts
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: all middleware tests pass (was 6, now 8).

- [ ] **Step 4: Commit**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
git add app/middleware.ts app/tests/middleware.test.ts
git commit -m "feat(app): /coven is auth-gated; /people and /p/[handle] stay public

AUTH_REQUIRED gains /coven. /people and /p/[handle] remain visible to
unauthenticated users so they can browse profiles before signing up.
Two new middleware tests cover both paths."
```

---

## Task 18: Local end-to-end smoke (two-account flow)

**Files:** none (verification only)

This is the full manual-test loop described in the spec's "Manual smoke at deploy" section, but done locally before deploy.

- [ ] **Step 1: Confirm prerequisites**

```
supabase status --workdir /home/cthulhulemon/film_goblin
docker exec -i supabase_db_film_goblin psql -U postgres -d postgres -c "SELECT policyname FROM pg_policies WHERE tablename IN ('coven_members','recommendations');"
```

Expected: local stack up; `coven_members_delete` and `recommendations_insert` policies present (from migration 0116).

- [ ] **Step 2: Create two local users**

Sign up as A at http://localhost:3000/auth/signup (e.g., `moss.witch@test.local` / `pass1234`). Walk through onboarding briefly. Sign out via the TopNav dropdown.

Sign up as B (e.g., `skullflower@test.local` / `pass1234`). Walk through onboarding. Keep this session signed in.

- [ ] **Step 3: A ↔ B social dance**

Still signed in as B:
- Visit `/people`. Search `moss`. Click on moss.witch's card → lands on `/p/moss.witch`.
- Click **+ Follow**. Button flips to **✓ Following**.
- Click **✦ Invite to Coven**. Button flips to **Cancel invite**.

Sign out. Sign in as A.
- Navigate via TopNav. Coven link should show a `(1)` badge.
- Click Coven → `/coven`. See B's pending invite.
- Click **Accept**. Page refreshes. Under "Your Coven" you see skullflower.

Verify in DB:
```
docker exec -i supabase_db_film_goblin psql -U postgres -d postgres -c "SELECT * FROM coven_members;"
```
Expected: one row with the canonical (LEAST, GREATEST) pair.

- [ ] **Step 4: Recommendation flow**

Still as A. Visit `/films`, click any film, click **✦ Recommend To A Coven Member**. The modal opens with a dropdown containing skullflower. Pick them, write a note, send. Modal shows "Sent. They'll see it in their feed."

Sign out. Sign in as B.
- Visit `/home`. Feed shows: "moss.witch recommended [film] to skullflower." with the film poster thumbnail and relative timestamp.
- Click the film link → lands on film detail.

- [ ] **Step 5: Leave coven**

Still as B. Visit `/coven`. Click Leave on moss.witch's card → confirm. Row disappears.

Verify:
```
docker exec -i supabase_db_film_goblin psql -U postgres -d postgres -c "SELECT * FROM coven_members;"
```
Expected: empty.

Try recommending to moss.witch from a film page → the dropdown shows no options (empty coven state shown).

- [ ] **Step 6: Sign-out via both surfaces**

- TopNav avatar → dropdown → Sign out. Redirects to landing.
- Sign back in. Go to `/settings`. Click the Sign out button at the bottom. Redirects to landing.

- [ ] **Step 7: No commit**

Verification only.

---

## Task 19: Deploy to Vercel + production smoke [MANUAL]

**Files:** none committed

- [ ] **Step 1: Deploy**

```
cd /home/cthulhulemon/film_goblin/.worktrees/social
rm -rf .vercel
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH vercel link --yes --project film-goblin
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH vercel --prod
```

Expected: `Aliased: https://film-goblin.vercel.app`.

- [ ] **Step 2: Verify migration 0116 applied to staging**

```
bash /tmp/t2-migrate-staging.sh
```

Should report already-applied (if Task 2 ran it) or Apply it now.

- [ ] **Step 3: Smoke the production flow**

Repeat Task 18's two-account dance but against `https://film-goblin.vercel.app`. Create two test users, follow, coven-invite, accept, recommend, leave. Confirm:
- `/people` and `/p/[handle]` work unauthenticated.
- TopNav Coven badge appears for the invitee.
- Recommendation email goes to the account holder's inbox (because the notifier cron runs daily at 10:00 UTC, this may require waiting for the next scheduled run or manually hitting the cron endpoint with `CRON_SECRET`).

- [ ] **Step 4: No commit**

Verify `git status` is clean.

---

## Self-Review

**Spec coverage:**

- § Goal (social surfaces + logout) → Tasks 1, 10, 11, 12, 16 ✓
- § Architecture (new routes) → Tasks 10, 11, 12 ✓
- § Architecture (server actions) → Tasks 3, 4 ✓
- § Architecture (query modules) → Tasks 6, 7, 8 ✓
- § Architecture (client islands) → Tasks 1, 9, 10 ✓
- § Architecture (activity renderers) → Task 13 ✓
- § Architecture (recommendation picker) → Task 16 ✓
- § Architecture (TopNav updates) → Task 15 ✓
- § Migration 0116 → Task 2 ✓
- § Server action shapes → Tasks 3, 4 ✓
- § Profile page bundle → Tasks 7, 11 ✓
- § /people browse → Task 10 ✓
- § /coven page → Task 12 ✓
- § Activity feed rewrite → Tasks 8, 14 ✓
- § RecommendModal picker → Task 16 ✓
- § Logout (TopNav + Settings) → Task 1 ✓
- § Testing (follows + coven + recommendations) → Tasks 3, 4, 5 ✓
- § Manual smoke → Tasks 18, 19 ✓
- § Middleware auth-gate /coven → Task 17 ✓
- § Out of scope items not implemented → verified none crept in ✓

**Placeholder scan:** no "TBD" / "TODO" / vague guidance. Each code block is complete. Each command has an expected outcome.

**Type consistency:**
- `EnrichedActivity` discriminated union defined in `queries/activity.ts` (Task 8), referenced in renderers (Task 13), matched by ActivityRow switch (Task 13 Step 8), passed from home page (Task 14) and inline-enriched shape in profile page (Task 11).
- `CovenState` defined in `queries/coven.ts` (Task 6), used by CovenButton's state-machine prop (Task 9).
- `ProfileFields` reused from sub-project 5's profile action; not touched here.
- Route handler tests for middleware expect a `decideRedirect` function matching sub-project 3's shape (Task 17 tests).

**Ordering note:** Tasks 11 (profile page) and 14 (home integration) both depend on Task 13 (activity renderers). If an implementer works linearly (T1→T19), T11 lands first — the plan calls out that Task 11 can import `ActivityRow` conditionally or execute Task 13 first. Subagent-driven execution can handle this by completing T13 before T11/T14.

---
