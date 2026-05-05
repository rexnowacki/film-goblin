# Onboarding Ritual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-page onboarding form with a three-step ritual (taste → films → coven) that seeds lane preferences, watchlist, and social graph so new users land on `/home` with a meaningful feed.

**Architecture:** A new `OnboardingWizard` client component replaces `OnboardingForm`. Step components are created first so their types are importable by the page server component. The `completeOnboarding` action gains `laneTagIds` + `starterFollowIds` and drops `thresholdPct`. A new `getFollowedActivity` query powers a "From the Goblins" strip on `/home`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgREST), Vitest

---

## Codebase Orientation

Read before starting any task:

- **Spec:** `docs/superpowers/specs/2026-05-04-onboarding-ritual-design.md`
- **Existing onboarding action:** `app/lib/actions/onboarding.ts` — `_completeOnboarding` is the testable core; `completeOnboarding` is the server action wrapper that calls `redirect("/home")`.
- **Existing onboarding page:** `app/app/onboarding/page.tsx` — server component, imports `OnboardingForm`
- **Existing onboarding form:** `app/app/onboarding/OnboardingForm.tsx` — this file gets deleted in Task 2
- **Activity query:** `app/lib/queries/activity.ts` — study `getEnrichedActivity`; `getFollowedActivity` uses the same enrichment pattern scoped to `follows` (not `coven_members`)
- **`follows` table columns:** `follower_user_id` and `followed_user_id` (NOT `follower_id`/`followed_id`)
- **Flavor tag names:** `folk horror`, `giallo`, `witchcraft`, `body horror`, `cosmic horror`, `religious horror`, `arthouse`, `midnight movie`
- **`editorial_starter`** is an existing boolean column on `films`
- **`lane_tag_ids`** is an existing `string[]` column on `profiles`
- **Test pattern:** integration tests use `describe.skipIf(!hasEnv)` + `if (!hasEnv) return;` guards in ALL lifecycle hooks — see `app/tests/actions/onboarding.test.ts`
- **Commit messages:** write to `/tmp/msg.txt` then `git commit -F /tmp/msg.txt` (heredoc mangling bug)
- **Node:** `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH` prefix for all commands

**Task order is intentional:** step logic files (Tasks 5–7) are created before the page (Task 8) so the page can import their types. Do not reorder.

---

## Task 1: Migration — `is_starter` + `starter_order` on profiles

**Files:**
- Create: `db/migrations/0163_starter_profiles.sql`
- Modify: `app/lib/supabase/types.ts`

- [ ] **Step 1: Create the migration**

Create `db/migrations/0163_starter_profiles.sql`:

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_starter    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS starter_order INT;
```

- [ ] **Step 2: Smoke-test the migration**

```bash
cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: all existing tests pass.

- [ ] **Step 3: Add `is_starter` and `starter_order` to `types.ts`**

In `app/lib/supabase/types.ts`, find the `profiles` Row block (search for `lane_tag_ids: string[]`). Insert the two new fields immediately before `lane_tag_ids`:

Row section — add:
```ts
          is_starter: boolean
          starter_order: number | null
```

Insert section — add:
```ts
          is_starter?: boolean
          starter_order?: number | null
```

Update section — add:
```ts
          is_starter?: boolean
          starter_order?: number | null
```

- [ ] **Step 4: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cat > /tmp/msg.txt << 'EOF'
feat(onboarding): add is_starter + starter_order to profiles (mig 0163)
EOF
git add db/migrations/0163_starter_profiles.sql app/lib/supabase/types.ts
git commit -F /tmp/msg.txt
```

---

## Task 2: Extend `completeOnboarding` action

**Files:**
- Modify: `app/lib/actions/onboarding.ts`
- Delete: `app/app/onboarding/OnboardingForm.tsx`
- Modify: `app/app/onboarding/page.tsx` (stub — full rewrite in Task 8)
- Modify: `app/tests/actions/onboarding.test.ts`

**Why delete `OnboardingForm.tsx` here:** the form calls `completeOnboarding` with the old `thresholdPct` signature. Deleting it now prevents type errors from the old file breaking future typechecks. The page is stubbed to a redirect so the app stays compilable until the wizard is wired in Task 8.

- [ ] **Step 1: Write the updated test**

Replace the entire content of `app/tests/actions/onboarding.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _completeOnboarding } from "../../lib/actions/onboarding";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let user: TestUser;
let starterUser: TestUser;
let filmA: string;
let filmB: string;
let tagId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  [user, starterUser] = await Promise.all([createTestUser(), createTestUser()]);
  const admin = adminClient();
  const [a, b] = await Promise.all([
    admin.from("films").insert({ itunes_id: 700000 + Math.floor(Math.random() * 10000), title: "A", director: "D", year: 2024 }).select("id").single(),
    admin.from("films").insert({ itunes_id: 700000 + Math.floor(Math.random() * 10000), title: "B", director: "D", year: 2024 }).select("id").single(),
  ]);
  filmA = a.data!.id;
  filmB = b.data!.id;
  const tag = await admin.from("tags").select("id").limit(1).single();
  tagId = tag.data!.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("watchlists").delete().eq("user_id", user.id);
  await admin.from("follows").delete().eq("follower_user_id", user.id);
  await admin.from("films").delete().in("id", [filmA, filmB]);
  await deleteTestUser(user.id);
  await deleteTestUser(starterUser.id);
});

describe.skipIf(!hasEnv)("actions/onboarding", () => {
  it("sets username, lane_tag_ids, null max_price_usd watchlists, and follows", async () => {
    if (!hasEnv) return;
    const c = await signedInClient(user.email, user.password);
    await _completeOnboarding(c, {
      username: "moss.witch",
      watchlistFilmIds: [filmA, filmB],
      laneTagIds: [tagId],
      starterFollowIds: [starterUser.id],
    });

    const admin = adminClient();
    const p = await admin.from("profiles").select("username, broadcast_watchlist_adds, onboarded_at, lane_tag_ids").eq("id", user.id).single();
    expect(p.data?.username).toBe("moss.witch");
    expect(p.data?.broadcast_watchlist_adds).toBe(true);
    expect(p.data?.onboarded_at).not.toBeNull();
    expect(p.data?.lane_tag_ids).toContain(tagId);

    const wl = await admin.from("watchlists").select("film_id, max_price_usd").eq("user_id", user.id);
    expect(wl.data).toHaveLength(2);
    expect(wl.data!.every(w => w.max_price_usd === null)).toBe(true);

    const follows = await admin.from("follows").select("followed_user_id").eq("follower_user_id", user.id);
    expect(follows.data?.map(f => f.followed_user_id)).toContain(starterUser.id);
  });

  it("empty arrays still complete successfully", async () => {
    if (!hasEnv) return;
    const user2 = await createTestUser();
    try {
      const c = await signedInClient(user2.email, user2.password);
      await _completeOnboarding(c, {
        username: `u${Date.now()}`,
        watchlistFilmIds: [],
        laneTagIds: [],
        starterFollowIds: [],
      });
      const admin = adminClient();
      const p = await admin.from("profiles").select("onboarded_at").eq("id", user2.id).single();
      expect(p.data?.onboarded_at).not.toBeNull();
    } finally {
      await deleteTestUser(user2.id);
    }
  });
});
```

- [ ] **Step 2: Run tests — expect fail (wrong payload type)**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/onboarding.test.ts
```
Expected: FAIL or type error.

- [ ] **Step 3: Replace `app/lib/actions/onboarding.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";
import { readInviteCookie, clearInviteCookie } from "./invite-cookie";

type Client = SupabaseClient<Database>;

export interface OnboardingPayload {
  username: string;
  watchlistFilmIds: string[];
  laneTagIds: string[];
  starterFollowIds: string[];
}

const USERNAME_RE = /^[a-z0-9._]+$/;

export async function _completeOnboarding(client: Client, p: OnboardingPayload): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  const username = p.username.trim();
  if (!USERNAME_RE.test(username)) {
    throw new Error("Invalid username: lowercase letters, numbers, dots, underscores only.");
  }

  const { error: pErr } = await client
    .from("profiles")
    .update({
      username,
      lane_tag_ids: p.laneTagIds,
      broadcast_watchlist_adds: true,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (pErr) throw pErr;

  for (const filmId of p.watchlistFilmIds) {
    const { error: wErr } = await client
      .from("watchlists")
      .insert({ user_id: user.id, film_id: filmId, max_price_usd: null });
    if (wErr && wErr.code !== "23505") throw wErr;
  }

  for (const targetId of p.starterFollowIds) {
    const { error: fErr } = await client
      .from("follows")
      .insert({ follower_user_id: user.id, followed_user_id: targetId });
    if (fErr && fErr.code !== "23505") throw fErr;
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

async function maybeCreateInviteCovenRequest(newUserId: string, inviterUsername: string): Promise<void> {
  const admin = serviceRoleClient();
  const { data: inviter } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", inviterUsername)
    .maybeSingle();
  if (!inviter || inviter.id === newUserId) return;

  const a = inviter.id < newUserId ? inviter.id : newUserId;
  const b = inviter.id < newUserId ? newUserId : inviter.id;
  const { data: bond } = await admin
    .from("coven_members")
    .select("user_a_id")
    .eq("user_a_id", a)
    .eq("user_b_id", b)
    .maybeSingle();
  if (bond) return;

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
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function completeOnboarding(payload: OnboardingPayload) {
  const c = await createClient();
  await _completeOnboarding(c, payload);
  redirect("/home");
}
```

- [ ] **Step 4: Delete `OnboardingForm.tsx` and stub the page**

```bash
rm app/app/onboarding/OnboardingForm.tsx
```

Replace `app/app/onboarding/page.tsx` with a minimal stub so the app compiles while we build the wizard:

```tsx
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/cached";

export default async function OnboardingPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/signin?next=/onboarding");
  // Wizard coming in a later task
  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>Loading ritual…</p>
    </div>
  );
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/onboarding.test.ts
```
Expected: PASS (or green-skipped without env).

- [ ] **Step 6: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cat > /tmp/msg.txt << 'EOF'
feat(onboarding): extend action — laneTagIds + starterFollowIds, drop thresholdPct

Deletes OnboardingForm.tsx; page stubbed pending wizard.
EOF
git add app/lib/actions/onboarding.ts app/tests/actions/onboarding.test.ts app/app/onboarding/page.tsx
git rm app/app/onboarding/OnboardingForm.tsx
git commit -F /tmp/msg.txt
```

---

## Task 3: `getFollowedActivity` query

**Files:**
- Create: `app/lib/queries/followed-activity.ts`
- Create: `app/tests/queries/followed-activity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/tests/queries/followed-activity.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getFollowedActivity } from "@/lib/queries/followed-activity";
import type { Database } from "@/lib/supabase/types";

const hasEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.TEST_SUPABASE_SERVICE_ROLE_KEY,
);

describe.skipIf(!hasEnv)("getFollowedActivity", () => {
  let client: ReturnType<typeof createClient<Database>>;
  let viewer: string;
  let followedA: string;
  let unfollowed: string;
  let filmId: string;
  let activityFollowed: string;
  let activityUnfollowed: string;

  beforeAll(async () => {
    if (!hasEnv) return;
    client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const mkUser = async (name: string) => {
      const { data } = await client.auth.admin.createUser({
        email: `${name}-fa-test@filmgoblin.test`,
        password: "testpass123",
        email_confirm: true,
      });
      return data.user!.id;
    };
    [viewer, followedA, unfollowed] = await Promise.all([
      mkUser("viewer-fa"),
      mkUser("followed-fa"),
      mkUser("unfollowed-fa"),
    ]);
    await client.from("follows").insert({ follower_user_id: viewer, followed_user_id: followedA });

    const film = await client.from("films")
      .insert({ itunes_id: 888888 + Math.floor(Math.random() * 10000), title: "FA Film", director: "D", year: 2024 })
      .select("id").single();
    filmId = film.data!.id;

    const actA = await client.from("activity")
      .insert({ actor_user_id: followedA, kind: "watchlist_added", payload: { film_id: filmId } })
      .select("id").single();
    activityFollowed = actA.data!.id;

    const actU = await client.from("activity")
      .insert({ actor_user_id: unfollowed, kind: "watchlist_added", payload: { film_id: filmId } })
      .select("id").single();
    activityUnfollowed = actU.data!.id;
  });

  afterAll(async () => {
    if (!hasEnv) return;
    await client.from("activity").delete().in("id", [activityFollowed, activityUnfollowed]);
    await client.from("follows").delete().eq("follower_user_id", viewer);
    await client.from("films").delete().eq("id", filmId);
    await Promise.all([
      client.auth.admin.deleteUser(viewer),
      client.auth.admin.deleteUser(followedA),
      client.auth.admin.deleteUser(unfollowed),
    ]);
  });

  it("returns activity from followed users only", async () => {
    if (!hasEnv) return;
    const items = await getFollowedActivity(client, viewer);
    const ids = items.map(i => i.id);
    expect(ids).toContain(activityFollowed);
    expect(ids).not.toContain(activityUnfollowed);
  });

  it("returns empty array when viewer follows nobody", async () => {
    if (!hasEnv) return;
    const items = await getFollowedActivity(client, unfollowed);
    expect(items).toEqual([]);
  });

  it("returned items have actor and film enrichment", async () => {
    if (!hasEnv) return;
    const items = await getFollowedActivity(client, viewer);
    const item = items.find(i => i.id === activityFollowed);
    expect(item).toBeDefined();
    expect(item!.actor.id).toBe(followedA);
    if (item!.kind === "watchlist_added") {
      expect(item!.film.id).toBe(filmId);
    }
  });
});
```

- [ ] **Step 2: Run the test — expect fail (module not found)**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/followed-activity.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `getFollowedActivity`**

Create `app/lib/queries/followed-activity.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { EnrichedActivity } from "./activity";
import { getReactionsForActivities } from "./activity-reactions";
import { getCommentSummariesForActivities } from "./activity-comments";

type Client = SupabaseClient<Database>;

export async function getFollowedActivity(
  client: Client,
  userId: string,
  limit = 10,
): Promise<EnrichedActivity[]> {
  const { data: followRows } = await client
    .from("follows")
    .select("followed_user_id")
    .eq("follower_user_id", userId);
  const followedIds = (followRows ?? []).map(r => r.followed_user_id);
  if (followedIds.length === 0) return [];

  const { data: raw, error } = await client
    .from("activity")
    .select("id, kind, payload, created_at, actor_user_id")
    .in("actor_user_id", followedIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!raw || raw.length === 0) return [];

  const actorIds = Array.from(new Set(raw.map(r => r.actor_user_id)));
  const filmIds = Array.from(new Set(raw.map(r => (r.payload as any)?.film_id).filter(Boolean)));
  const recipientIds = Array.from(new Set(raw.map(r => (r.payload as any)?.to_user_id).filter(Boolean)));
  const listIds = Array.from(new Set(raw.map(r => (r.payload as any)?.list_id).filter(Boolean)));

  const [actors, films, recipients, lists, reactionsMap, commentsMap] = await Promise.all([
    actorIds.length ? client.from("profiles").select("id, username, display_name, avatar_url").in("id", actorIds) : Promise.resolve({ data: [] as any[] }),
    filmIds.length ? client.from("films").select("id, title, director, year, artwork_url, itunes_url").in("id", filmIds) : Promise.resolve({ data: [] as any[] }),
    recipientIds.length ? client.from("profiles").select("id, username, display_name, avatar_url").in("id", recipientIds) : Promise.resolve({ data: [] as any[] }),
    listIds.length ? client.from("lists").select("id, title").in("id", listIds) : Promise.resolve({ data: [] as any[] }),
    getReactionsForActivities(client, raw.map(r => r.id), userId),
    getCommentSummariesForActivities(client, raw.map(r => r.id), userId),
  ]);

  const actorMap = new Map((actors.data ?? []).map((r: any) => [r.id, r]));
  const filmMap = new Map((films.data ?? []).map((r: any) => [r.id, r]));
  const recipientMap = new Map((recipients.data ?? []).map((r: any) => [r.id, r]));
  const listMap = new Map((lists.data ?? []).map((r: any) => [r.id, r]));

  const out: EnrichedActivity[] = [];
  for (const r of raw) {
    const actor = actorMap.get(r.actor_user_id);
    if (!actor) continue;
    const payload = r.payload as any;
    const film = payload?.film_id ? filmMap.get(payload.film_id) : undefined;
    const recipient = payload?.to_user_id ? recipientMap.get(payload.to_user_id) : undefined;
    const list = payload?.list_id ? listMap.get(payload.list_id) : undefined;
    const reactions = reactionsMap.get(r.id) ?? { count: 0, likedByMe: false };
    const comments = commentsMap.get(r.id) ?? { count: 0, items: [] };
    const base = { id: r.id, created_at: r.created_at, actor, reactions, comments };

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
      case "watch_logged":
        if (film) out.push({ ...base, kind: "watch_logged", film, note: payload.note ?? null, recommended: typeof payload.recommended === "boolean" ? payload.recommended : null });
        break;
      case "library_added":
        if (film) out.push({ ...base, kind: "library_added", film });
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

- [ ] **Step 4: Run tests — expect pass**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/followed-activity.test.ts
```
Expected: PASS (or green-skipped without env).

- [ ] **Step 5: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cat > /tmp/msg.txt << 'EOF'
feat(home): getFollowedActivity query — follows-scoped enriched activity
EOF
git add app/lib/queries/followed-activity.ts app/tests/queries/followed-activity.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 4: "From the Goblins" panel on `/home`

**Files:**
- Create: `app/components/FollowedActivityFeed.tsx`
- Modify: `app/app/home/page.tsx`

- [ ] **Step 1: Create `FollowedActivityFeed.tsx`**

Create `app/components/FollowedActivityFeed.tsx`:

```tsx
"use client";

import Link from "next/link";
import Avatar from "@/components/Avatar";
import FilmPoster from "@/components/FilmPoster";
import type { EnrichedActivity } from "@/lib/queries/activity";

function activityLine(item: EnrichedActivity): string {
  switch (item.kind) {
    case "watchlist_added":     return `eyeing ${item.film.title}`;
    case "watch_logged":        return `watched ${item.film.title}`;
    case "library_added":       return `owns ${item.film.title}`;
    case "recommendation_sent": return `recommended ${item.film.title}`;
    case "review_published":    return `reviewed ${item.film.title}`;
    case "list_created":        return `created "${item.list.title}"`;
    case "list_film_added":     return `added ${item.film.title} to a list`;
    case "coven_joined":        return `joined a coven`;
    default:                    return "";
  }
}

function filmFromItem(item: EnrichedActivity): { id: string; title: string; artwork_url: string } | null {
  if ("film" in item) return item.film as { id: string; title: string; artwork_url: string };
  return null;
}

interface Props {
  items: EnrichedActivity[];
}

export default function FollowedActivityFeed({ items }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map(item => {
        const film = filmFromItem(item);
        return (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #1a1a1a" }}>
            <Link href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ flexShrink: 0 }}>
              <Avatar name={item.actor.username} color="var(--accent)" size={28} url={item.actor.avatar_url} />
            </Link>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--bone)", flex: 1, minWidth: 0 }}>
              <Link href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                {item.actor.username}
              </Link>
              {" "}
              <span style={{ color: "var(--muted)" }}>{activityLine(item)}</span>
            </span>
            {film && (
              <Link href={`/film/${film.id}`} style={{ flexShrink: 0 }}>
                <FilmPoster film={film as any} size="xs" style={{ width: 28, height: 42, borderRadius: 2 }} />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Update `app/app/home/page.tsx`**

Add imports after the existing imports at the top of the file:
```ts
import { getFollowedActivity } from "@/lib/queries/followed-activity";
import FollowedActivityFeed from "@/components/FollowedActivityFeed";
```

Add data fetch in `HomePage` after the `initialPage` block (after `const initialDone = initialPage.done;`):
```ts
  const followedActivity = user ? await getFollowedActivity(supabase, user.id) : [];
```

Inside the `<main>` element, add this section after `</FeedTabs>`:
```tsx
          {followedActivity.length > 0 && (
            <section style={{ marginTop: 48, paddingBottom: 48 }}>
              <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 14 }}>
                From the Goblins
              </div>
              <FollowedActivityFeed items={followedActivity} />
            </section>
          )}
```

- [ ] **Step 3: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cat > /tmp/msg.txt << 'EOF'
feat(home): "From the Goblins" followed-activity strip
EOF
git add app/components/FollowedActivityFeed.tsx app/app/home/page.tsx
git commit -F /tmp/msg.txt
```

---

## Task 5: TasteStep logic + component

**Files:**
- Create: `app/app/onboarding/taste-step-logic.ts`
- Create: `app/app/onboarding/TasteStep.tsx`
- Create: `app/tests/components/taste-step-logic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/tests/components/taste-step-logic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getSelectedTagIds, FLAVOR_CARDS } from "@/app/onboarding/taste-step-logic";

const TAG_MAP: Record<string, string> = {
  "folk horror":      "uuid-folk",
  "giallo":           "uuid-giallo",
  "witchcraft":       "uuid-witch",
  "body horror":      "uuid-body",
  "cosmic horror":    "uuid-cosmic",
  "religious horror": "uuid-religious",
  "arthouse":         "uuid-arthouse",
  "midnight movie":   "uuid-midnight",
};

describe("FLAVOR_CARDS", () => {
  it("has exactly 8 entries", () => {
    expect(FLAVOR_CARDS).toHaveLength(8);
  });

  it("every card label is unique", () => {
    const labels = FLAVOR_CARDS.map(c => c.label);
    expect(new Set(labels).size).toBe(8);
  });

  it("every card tagName resolves in TAG_MAP", () => {
    for (const card of FLAVOR_CARDS) {
      expect(TAG_MAP[card.tagName]).toBeDefined();
    }
  });
});

describe("getSelectedTagIds", () => {
  it("returns UUIDs for selected card labels", () => {
    const ids = getSelectedTagIds(["Folk Rot", "Velvet Murder"], TAG_MAP);
    expect(ids).toContain("uuid-folk");
    expect(ids).toContain("uuid-giallo");
    expect(ids).toHaveLength(2);
  });

  it("returns empty array for empty selection", () => {
    expect(getSelectedTagIds([], TAG_MAP)).toEqual([]);
  });

  it("ignores cards whose tagName is missing from the map (tag not seeded)", () => {
    const ids = getSelectedTagIds(["Folk Rot"], { "folk horror": "uuid-folk" });
    expect(ids).toEqual(["uuid-folk"]);
  });
});
```

- [ ] **Step 2: Run test — expect fail (module not found)**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/components/taste-step-logic.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Create `taste-step-logic.ts`**

Create `app/app/onboarding/taste-step-logic.ts`:

```ts
export interface FlavorCard {
  label: string;
  tagName: string;
  descriptor: string;
}

export const FLAVOR_CARDS: FlavorCard[] = [
  { label: "Folk Rot",       tagName: "folk horror",      descriptor: "ancient dread, pastoral cursed" },
  { label: "Velvet Murder",  tagName: "giallo",           descriptor: "Italian noir, style-soaked kills" },
  { label: "Witchcraft",     tagName: "witchcraft",       descriptor: "covens, hexes, feminine fury" },
  { label: "Flesh Trouble",  tagName: "body horror",      descriptor: "meat gone wrong, transformation" },
  { label: "Star Madness",   tagName: "cosmic horror",    descriptor: "void, ancient entities, small humans" },
  { label: "Holy Terror",    tagName: "religious horror", descriptor: "faith weaponized, god as monster" },
  { label: "Slow Doom",      tagName: "arthouse",         descriptor: "beautiful, bleak, slow-burning dread" },
  { label: "Trash Magic",    tagName: "midnight movie",   descriptor: "low-budget, wild, cult midnight fare" },
];

export function getSelectedTagIds(
  selectedLabels: string[],
  laneTagMap: Record<string, string>,
): string[] {
  return selectedLabels
    .map(label => {
      const card = FLAVOR_CARDS.find(c => c.label === label);
      return card ? laneTagMap[card.tagName] : undefined;
    })
    .filter((id): id is string => id !== undefined);
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/components/taste-step-logic.test.ts
```
Expected: PASS.

- [ ] **Step 5: Create `TasteStep.tsx`**

Create `app/app/onboarding/TasteStep.tsx`:

```tsx
"use client";

import { useState } from "react";
import { FLAVOR_CARDS, getSelectedTagIds } from "./taste-step-logic";

interface Props {
  initialUsername: string;
  laneTagMap: Record<string, string>;
  onNext: (username: string, laneTagIds: string[]) => void;
}

const USERNAME_RE = /^[a-z0-9._]+$/;

export default function TasteStep({ initialUsername, laneTagMap, onNext }: Props) {
  const [username, setUsername] = useState(initialUsername);
  const [selected, setSelected] = useState<string[]>([]);

  const trimmed = username.trim();
  const usernameOk = trimmed.length > 0 && USERNAME_RE.test(trimmed);
  const usernameError = trimmed.length > 0 && !USERNAME_RE.test(trimmed)
    ? "lowercase letters, numbers, dots, underscores only"
    : "";

  function toggleCard(label: string) {
    setSelected(s => s.includes(label) ? s.filter(l => l !== label) : [...s, label]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <label className="caps" style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 8 }}>
          Your Handle
        </label>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value.toLowerCase())}
          placeholder="your.handle"
          autoCapitalize="none"
          autoCorrect="off"
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 18,
            background: "#111",
            border: "1px solid #333",
            color: "var(--bone)",
            padding: "10px 14px",
            width: "100%",
            boxSizing: "border-box",
          }}
        />
        {usernameError && (
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--accent)", marginTop: 6 }}>
            {usernameError}
          </p>
        )}
      </div>

      <div>
        <p className="caps" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>
          What draws you to horror? (pick any)
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {FLAVOR_CARDS.map(card => {
            const isSelected = selected.includes(card.label);
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => toggleCard(card.label)}
                style={{
                  background: isSelected ? "rgba(255,45,136,0.12)" : "#111",
                  border: `1px solid ${isSelected ? "var(--accent)" : "#333"}`,
                  color: "var(--bone)",
                  padding: "14px 12px",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 4 }}>
                  {card.label}
                </div>
                <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)" }}>
                  {card.descriptor}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onNext(trimmed, getSelectedTagIds(selected, laneTagMap))}
        disabled={!usernameOk}
        className="btn btn-lg"
        style={{ alignSelf: "flex-end", opacity: usernameOk ? 1 : 0.4 }}
      >
        Next →
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cat > /tmp/msg.txt << 'EOF'
feat(onboarding): TasteStep — username input + flavor card selections
EOF
git add app/app/onboarding/taste-step-logic.ts app/app/onboarding/TasteStep.tsx app/tests/components/taste-step-logic.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 6: FilmsStep logic + component

**Files:**
- Create: `app/app/onboarding/films-step-logic.ts`
- Create: `app/app/onboarding/FilmsStep.tsx`
- Create: `app/tests/components/films-step-logic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/tests/components/films-step-logic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { filterFilmsByLanes, type DbFilm } from "@/app/onboarding/films-step-logic";

function makeFilm(id: string, tagIds: string[]): DbFilm {
  return { id, itunes_id: null, title: id, director: "D", year: 2024, genre_primary: "Horror", artwork_url: "", editorial_starter: false, tagIds };
}

const folkId = "uuid-folk";
const gialloId = "uuid-giallo";

describe("filterFilmsByLanes", () => {
  it("returns all films when laneTagIds empty", () => {
    const films = [makeFilm("a", [folkId]), makeFilm("b", [])];
    expect(filterFilmsByLanes(films, [])).toEqual(films);
  });

  it("falls back to all films when fewer than 6 match", () => {
    const films = [makeFilm("a", [folkId]), makeFilm("b", []), makeFilm("c", [])];
    // 1 match < 6 → fallback to all
    expect(filterFilmsByLanes(films, [folkId])).toEqual(films);
  });

  it("returns filtered list when 6+ match", () => {
    const films = Array.from({ length: 8 }, (_, i) => makeFilm(`f${i}`, [folkId]));
    const result = filterFilmsByLanes(films, [folkId]);
    expect(result).toHaveLength(8);
    expect(result.every(f => f.tagIds.includes(folkId))).toBe(true);
  });

  it("matches any of multiple selected lanes", () => {
    const films = [
      ...Array.from({ length: 3 }, (_, i) => makeFilm(`f${i}`, [folkId])),
      ...Array.from({ length: 3 }, (_, i) => makeFilm(`g${i}`, [gialloId])),
    ];
    const result = filterFilmsByLanes(films, [folkId, gialloId]);
    expect(result).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run test — expect fail (module not found)**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/components/films-step-logic.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Create `films-step-logic.ts`**

Create `app/app/onboarding/films-step-logic.ts`:

```ts
export interface DbFilm {
  id: string;
  itunes_id: number | null;
  title: string;
  director: string;
  year: number;
  genre_primary: string;
  artwork_url: string;
  editorial_starter: boolean;
  tagIds: string[];
}

const LANE_FILTER_MIN = 6;

export function filterFilmsByLanes(films: DbFilm[], laneTagIds: string[]): DbFilm[] {
  if (laneTagIds.length === 0) return films;
  const matched = films.filter(f => laneTagIds.some(id => f.tagIds.includes(id)));
  return matched.length >= LANE_FILTER_MIN ? matched : films;
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/components/films-step-logic.test.ts
```
Expected: PASS.

- [ ] **Step 5: Create `FilmsStep.tsx`**

Create `app/app/onboarding/FilmsStep.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import FilmPoster from "@/components/FilmPoster";
import { filterFilmsByLanes, type DbFilm } from "./films-step-logic";

interface Props {
  films: DbFilm[];
  laneTagIds: string[];
  onNext: (filmIds: string[]) => void;
  onBack: () => void;
}

const MIN_PICKS = 3;
const MAX_PICKS = 10;

export default function FilmsStep({ films, laneTagIds, onNext, onBack }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const displayFilms = useMemo(() => filterFilmsByLanes(films, laneTagIds), [films, laneTagIds]);

  function toggleFilm(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : s.length < MAX_PICKS ? [...s, id] : s);
  }

  const canProceed = selected.length >= MIN_PICKS;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <p className="caps" style={{ fontSize: 11, color: "var(--muted)" }}>
        Pick films for your watchlist — at least {MIN_PICKS}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10 }}>
        {displayFilms.map(film => {
          const isSelected = selected.includes(film.id);
          return (
            <button key={film.id} type="button" onClick={() => toggleFilm(film.id)}
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", position: "relative" }}
            >
              <FilmPoster
                film={film as any}
                size="sm"
                style={{
                  width: "100%",
                  height: "auto",
                  aspectRatio: "2 / 3",
                  outline: isSelected ? "3px solid var(--accent)" : "none",
                  outlineOffset: 2,
                  opacity: !canProceed || isSelected ? 1 : 0.6,
                }}
              />
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" onClick={onBack} className="btn btn-outline btn-sm">← Back</button>
        <button type="button" onClick={() => onNext(selected)} disabled={!canProceed}
          className="btn btn-lg" style={{ opacity: canProceed ? 1 : 0.4 }}>
          Next → ({selected.length}/{MIN_PICKS}+)
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cat > /tmp/msg.txt << 'EOF'
feat(onboarding): FilmsStep — lane-filtered poster grid picker
EOF
git add app/app/onboarding/films-step-logic.ts app/app/onboarding/FilmsStep.tsx app/tests/components/films-step-logic.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 7: CovenStep component

**Files:**
- Create: `app/app/onboarding/CovenStep.tsx`

- [ ] **Step 1: Create `CovenStep.tsx`**

Create `app/app/onboarding/CovenStep.tsx`:

```tsx
"use client";

import { useState } from "react";
import Avatar from "@/components/Avatar";

export interface StarterProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props {
  starters: StarterProfile[];
  onSubmit: (followIds: string[]) => void;
  onBack: () => void;
  submitting: boolean;
}

export default function CovenStep({ starters, onSubmit, onBack, submitting }: Props) {
  const [selected, setSelected] = useState<string[]>(starters.map(s => s.id));

  function toggleStarter(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <p className="caps" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>
        Follow the goblins — they'll keep your feed alive
      </p>
      {starters.length === 0 ? (
        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", fontSize: 14 }}>
          No starter accounts yet.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 12 }}>
          {starters.map(s => {
            const isSelected = selected.includes(s.id);
            return (
              <button key={s.id} type="button" onClick={() => toggleStarter(s.id)}
                style={{ background: "transparent", border: "none", padding: "8px 4px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
              >
                <div style={{ borderRadius: "50%", outline: isSelected ? "2px solid var(--accent)" : "2px solid transparent", outlineOffset: 2 }}>
                  <Avatar name={s.username} color="var(--accent)" size={40} url={s.avatar_url} />
                </div>
                <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: isSelected ? "var(--accent)" : "var(--muted)", textAlign: "center", wordBreak: "break-all" }}>
                  {s.username}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" onClick={onBack} className="btn btn-outline btn-sm" disabled={submitting}>← Back</button>
        <button type="button" onClick={() => onSubmit(selected)} disabled={submitting} className="btn btn-lg">
          {submitting ? "Entering…" : "Begin →"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cat > /tmp/msg.txt << 'EOF'
feat(onboarding): CovenStep — starter account follow picker
EOF
git add app/app/onboarding/CovenStep.tsx
git commit -F /tmp/msg.txt
```

---

## Task 8: Onboarding page — fetch starters + wide film set

**Files:**
- Modify: `app/app/onboarding/page.tsx`

**Note:** This task comes after Tasks 5–7 so that `DbFilm` (from `./films-step-logic`) and `StarterProfile` (from `./CovenStep`) already exist. The page imports `OnboardingWizard` which doesn't exist yet — that's fine; the final typecheck happens in Task 9.

- [ ] **Step 1: Rewrite `app/app/onboarding/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import type { DbFilm } from "./films-step-logic";
import type { StarterProfile } from "./CovenStep";
// OnboardingWizard created in the next task
import OnboardingWizard from "./OnboardingWizard";

const FLAVOR_TAG_NAMES = [
  "folk horror",
  "giallo",
  "witchcraft",
  "body horror",
  "cosmic horror",
  "religious horror",
  "arthouse",
  "midnight movie",
] as const;

export default async function OnboardingPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/signin?next=/onboarding");
  const supabase = await createClient();

  // Look up tag UUIDs for the 8 flavor cards
  const { data: tagRows } = await supabase
    .from("tags")
    .select("id, name")
    .in("name", FLAVOR_TAG_NAMES as unknown as string[]);
  const laneTagMap: Record<string, string> = {};
  for (const t of tagRows ?? []) laneTagMap[t.name] = t.id;
  const flavorTagIds = Object.values(laneTagMap);

  // Fetch editorial_starter films and flavor-tagged films separately, then merge
  const [starterFilmsRes, taggedFilmsRes, profileRes, startersRes] = await Promise.all([
    supabase
      .from("films")
      .select("id, itunes_id, title, director, year, genre_primary, artwork_url, editorial_starter, film_tags(tag_id)")
      .eq("editorial_starter", true)
      .eq("available", true)
      .limit(96),
    flavorTagIds.length > 0
      ? supabase
          .from("film_tags")
          .select("film_id, tag_id, film:films!inner(id, itunes_id, title, director, year, genre_primary, artwork_url, editorial_starter, film_tags(tag_id))")
          .in("tag_id", flavorTagIds)
          .limit(96)
      : Promise.resolve({ data: [] as any[], error: null }),
    supabase.from("profiles").select("username").eq("id", user.id).single(),
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("is_starter", true)
      .order("starter_order", { ascending: true, nullsLast: true } as any)
      .limit(20),
  ]);

  // Merge + deduplicate films into DbFilm shape
  const filmMap = new Map<string, DbFilm>();
  for (const f of starterFilmsRes.data ?? []) {
    filmMap.set(f.id, {
      id: f.id,
      itunes_id: f.itunes_id,
      title: f.title,
      director: f.director,
      year: f.year,
      genre_primary: f.genre_primary,
      artwork_url: f.artwork_url,
      editorial_starter: f.editorial_starter,
      tagIds: ((f.film_tags ?? []) as Array<{ tag_id: string }>).map(t => t.tag_id),
    });
  }
  for (const row of taggedFilmsRes.data ?? []) {
    const f = (row as any).film;
    if (!f || filmMap.has(f.id)) continue;
    filmMap.set(f.id, {
      id: f.id,
      itunes_id: f.itunes_id,
      title: f.title,
      director: f.director,
      year: f.year,
      genre_primary: f.genre_primary,
      artwork_url: f.artwork_url,
      editorial_starter: f.editorial_starter,
      tagIds: ((f.film_tags ?? []) as Array<{ tag_id: string }>).map(t => t.tag_id),
    });
  }

  const films = Array.from(filmMap.values());
  const starters = (startersRes.data ?? []) as StarterProfile[];
  const initialUsername = profileRes.data?.username ?? "";

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <OnboardingWizard
        initialUsername={initialUsername}
        films={films}
        starters={starters}
        laneTagMap={laneTagMap}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck (one error expected — OnboardingWizard missing)**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | head -10
```
Expected: one error about `Cannot find module './OnboardingWizard'`. That's the only error — the types from `films-step-logic` and `CovenStep` should resolve cleanly.

- [ ] **Step 3: Commit**

```bash
cat > /tmp/msg.txt << 'EOF'
feat(onboarding): rewrite page to fetch starters + wide film set

Imports types from step logic files; OnboardingWizard wired in next task.
EOF
git add app/app/onboarding/page.tsx
git commit -F /tmp/msg.txt
```

---

## Task 9: OnboardingWizard — final assembly

**Files:**
- Create: `app/app/onboarding/OnboardingWizard.tsx`

- [ ] **Step 1: Create `OnboardingWizard.tsx`**

Create `app/app/onboarding/OnboardingWizard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { completeOnboarding } from "@/lib/actions/onboarding";
import TasteStep from "./TasteStep";
import FilmsStep from "./FilmsStep";
import CovenStep, { type StarterProfile } from "./CovenStep";
import type { DbFilm } from "./films-step-logic";

export type { DbFilm, StarterProfile };

interface Props {
  initialUsername: string;
  films: DbFilm[];
  starters: StarterProfile[];
  laneTagMap: Record<string, string>;
}

export default function OnboardingWizard({ initialUsername, films, starters, laneTagMap }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [username, setUsername] = useState("");
  const [laneTagIds, setLaneTagIds] = useState<string[]>([]);
  const [watchlistFilmIds, setWatchlistFilmIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function handleTasteNext(u: string, tags: string[]) {
    setUsername(u);
    setLaneTagIds(tags);
    setStep(2);
  }

  function handleFilmsNext(filmIds: string[]) {
    setWatchlistFilmIds(filmIds);
    setStep(3);
  }

  async function handleSubmit(followIds: string[]) {
    setSubmitting(true);
    try {
      await completeOnboarding({ username, watchlistFilmIds, laneTagIds, starterFollowIds: followIds });
    } catch {
      setSubmitting(false);
    }
    // On success, completeOnboarding redirects — submitting stays true intentionally
  }

  const dotStyle = (active: boolean): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: active ? "var(--accent)" : "#333",
    display: "inline-block",
  });

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: 560, background: "var(--void-2)", border: "1px solid #222", padding: "32px 28px" }}>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 32 }}>
          <span style={dotStyle(step >= 1)} />
          <span style={dotStyle(step >= 2)} />
          <span style={dotStyle(step >= 3)} />
        </div>

        {step === 1 && (
          <TasteStep
            initialUsername={initialUsername}
            laneTagMap={laneTagMap}
            onNext={handleTasteNext}
          />
        )}
        {step === 2 && (
          <FilmsStep
            films={films}
            laneTagIds={laneTagIds}
            onNext={handleFilmsNext}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <CovenStep
            starters={starters}
            onSubmit={handleSubmit}
            onBack={() => setStep(2)}
            submitting={submitting}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck — expect clean**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: zero errors.

- [ ] **Step 3: Run all tests**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: all pass or green-skipped (no red failures).

- [ ] **Step 4: Commit**

```bash
cat > /tmp/msg.txt << 'EOF'
feat(onboarding): OnboardingWizard — three-step ritual complete

TasteStep → FilmsStep → CovenStep. laneTagIds + starterFollowIds
written to DB on submit via extended completeOnboarding action.
EOF
git add app/app/onboarding/OnboardingWizard.tsx
git commit -F /tmp/msg.txt
```

---

## Final: Apply migration + deploy

- [ ] **Apply migration to production Supabase**

```bash
set -a; source app/.env.local; set +a
cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
```
Expected: `0163_starter_profiles.sql` applied successfully.

- [ ] **Deploy to Vercel from repo root**

```bash
npx vercel deploy --prod --yes
```

- [ ] **Smoke test**

Sign up a new account → confirm the three-step wizard appears on `/onboarding`. Complete all three steps → confirm redirect to `/home`.

---

## Post-ship: mark starter accounts

After deployment, go to Supabase dashboard → `profiles` table → set `is_starter = true` and assign `starter_order` values (1, 2, 3…) on the staff accounts. The CovenStep picker will be empty until at least one profile has `is_starter = true`.
