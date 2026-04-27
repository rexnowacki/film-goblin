# Covenfolk Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `/people` and `/coven` into a single page at `/coven` with TopNav label "Covenfolk", a top pending-invites strip, two-pane "Your Coven | Find People" body, and inline four-state invite buttons on each search result.

**Architecture:** Repurpose `app/app/coven/page.tsx` as the host route. `/people` page collapses to a one-line `redirect()`. Add `excludeUserIds` to `getProfilesBySearch` and a new `getRelationshipMap` helper modeled on existing `getCovenStateBetween`. New client component `SearchPersonRow` renders each search result with a state-driven button (`+ Invite` / `Pending` / `Accept` / `In Coven`) that fires existing server actions. No schema changes, no new RLS, no new server actions.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase SSR, Vitest (mock-client unit tests for query helpers; manual UI smoke for components and pages).

**Type alignment note:** The spec referred to button states as `outgoing-pending` / `incoming-pending`. The existing codebase already defines `CovenState = "none" | "pending_outbound" | "pending_inbound" | "member"` in `app/lib/queries/coven.ts:20`. The plan uses the existing `CovenState` names to avoid parallel vocabularies. UI labels remain user-facing as designed in the spec (`+ Invite` / `Pending` / `Accept` / `In Coven`).

---

## File Structure

**New files:**
- `app/components/SearchPersonRow.tsx` — client component, renders one search result with state-driven inline button.
- `app/tests/queries/profiles.test.ts` — mock-client unit tests for `getProfilesBySearch` (new file; no existing tests for this query).
- `app/tests/queries/relationship-map.test.ts` — mock-client unit tests for `getRelationshipMap`.

**Modified files:**
- `app/lib/queries/profiles.ts` — extend `getProfilesBySearch` with optional `excludeUserIds` arg.
- `app/lib/queries/coven.ts` — add `getRelationshipMap(client, currentUserId, profileIds)` helper.
- `app/app/coven/page.tsx` — full body rewrite: hero → pending strip → two-pane (Your Coven | Find People).
- `app/app/people/page.tsx` — collapse body to `redirect("/coven")`.
- `app/components/TopNav.tsx` — drop the `people` nav item, rename `coven` label from "Coven" to "Covenfolk".

**Untouched:**
- All server actions (`inviteToCoven`, `acceptCovenInvite`, `declineCovenInvite`, `leaveCoven`).
- `PeopleSearch` component (reused as the search input on the new right pane).
- `CovenInviteActions`, `LeaveCovenButton` (reused as-is).
- `/p/[handle]` profile pages (canonical detail view, untouched).
- All migrations, RLS policies, types.

---

## Task 1: Extend `getProfilesBySearch` with `excludeUserIds`

**Files:**
- Modify: `app/lib/queries/profiles.ts:28-44`
- Test: `app/tests/queries/profiles.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `app/tests/queries/profiles.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { getProfilesBySearch } from "@/lib/queries/profiles";

function makeClient(rows: any[]) {
  const builder: any = {
    _calls: { not: [] as Array<{ col: string; op: string; value: string }> },
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    not: vi.fn(function (col: string, op: string, value: string) {
      builder._calls.not.push({ col, op, value });
      return builder;
    }),
    then: (resolve: any) => resolve({ data: rows, error: null }),
  };
  return {
    from: vi.fn().mockReturnValue(builder),
    _builder: builder,
  } as any;
}

describe("getProfilesBySearch", () => {
  it("returns rows unfiltered when excludeUserIds is omitted", async () => {
    const client = makeClient([{ id: "p1", handle: "alice" }]);
    const rows = await getProfilesBySearch(client, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].handle).toBe("alice");
    expect(client._builder._calls.not).toHaveLength(0);
  });

  it("does not call .not() when excludeUserIds is empty", async () => {
    const client = makeClient([{ id: "p1", handle: "alice" }]);
    await getProfilesBySearch(client, { excludeUserIds: [] });
    expect(client._builder._calls.not).toHaveLength(0);
  });

  it("calls .not(id, in, ...) when excludeUserIds is non-empty", async () => {
    const client = makeClient([]);
    await getProfilesBySearch(client, { excludeUserIds: ["u1", "u2"] });
    expect(client._builder._calls.not).toHaveLength(1);
    expect(client._builder._calls.not[0].col).toBe("id");
    expect(client._builder._calls.not[0].op).toBe("in");
    expect(client._builder._calls.not[0].value).toBe("(u1,u2)");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app && npx vitest run tests/queries/profiles.test.ts
```

Expected: FAIL on the third test — `getProfilesBySearch` does not yet accept `excludeUserIds`, so `.not()` is never called. The first two tests may pass coincidentally if the function ignores unknown opts (it currently does).

- [ ] **Step 3: Implement the change**

Replace lines 28-44 of `app/lib/queries/profiles.ts`:

```ts
export async function getProfilesBySearch(
  client: Client,
  opts: { q?: string; limit?: number; excludeUserIds?: string[] } = {},
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
  if (opts.excludeUserIds && opts.excludeUserIds.length > 0) {
    query = query.not("id", "in", `(${opts.excludeUserIds.join(",")})`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd app && npx vitest run tests/queries/profiles.test.ts
```

Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add app/lib/queries/profiles.ts app/tests/queries/profiles.test.ts
git commit -F /tmp/msg.txt
```

Use this commit message via `/tmp/msg.txt` (per CLAUDE.md gotcha):

```
feat(profiles): add excludeUserIds to getProfilesBySearch

Lets the search caller filter out yourself + existing coven members
before the query hits the wire. PostgREST .not("id", "in", ...) syntax.
No-op when the array is empty or omitted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 2: Add `getRelationshipMap` helper

**Files:**
- Modify: `app/lib/queries/coven.ts` (append at bottom)
- Test: `app/tests/queries/relationship-map.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `app/tests/queries/relationship-map.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { getRelationshipMap } from "@/lib/queries/coven";

function makeClient(rows: any[]) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  return {
    from: vi.fn().mockReturnValue(builder),
    _builder: builder,
  } as any;
}

describe("getRelationshipMap", () => {
  it("returns an empty map when profileIds is empty (no query)", async () => {
    const client = makeClient([]);
    const map = await getRelationshipMap(client, "me", []);
    expect(map.size).toBe(0);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("classifies outgoing requests under the to_user_id key", async () => {
    const client = makeClient([
      { id: "r1", from_user_id: "me", to_user_id: "alice", status: "pending" },
    ]);
    const map = await getRelationshipMap(client, "me", ["alice"]);
    expect(map.size).toBe(1);
    expect(map.get("alice")).toEqual({ state: "pending_outbound", requestId: "r1" });
  });

  it("classifies incoming requests under the from_user_id key", async () => {
    const client = makeClient([
      { id: "r2", from_user_id: "bob", to_user_id: "me", status: "pending" },
    ]);
    const map = await getRelationshipMap(client, "me", ["bob"]);
    expect(map.size).toBe(1);
    expect(map.get("bob")).toEqual({ state: "pending_inbound", requestId: "r2" });
  });

  it("handles a mix of outgoing and incoming for different users", async () => {
    const client = makeClient([
      { id: "r1", from_user_id: "me", to_user_id: "alice", status: "pending" },
      { id: "r2", from_user_id: "bob", to_user_id: "me", status: "pending" },
    ]);
    const map = await getRelationshipMap(client, "me", ["alice", "bob"]);
    expect(map.size).toBe(2);
    expect(map.get("alice")?.state).toBe("pending_outbound");
    expect(map.get("bob")?.state).toBe("pending_inbound");
  });

  it("ignores rows that don't match any of the requested profileIds", async () => {
    const client = makeClient([
      { id: "r1", from_user_id: "me", to_user_id: "alice", status: "pending" },
      { id: "r2", from_user_id: "me", to_user_id: "carol", status: "pending" },
    ]);
    const map = await getRelationshipMap(client, "me", ["alice"]);
    expect(map.size).toBe(1);
    expect(map.has("carol")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app && npx vitest run tests/queries/relationship-map.test.ts
```

Expected: FAIL with "getRelationshipMap is not exported" or similar — the function doesn't exist yet.

- [ ] **Step 3: Implement the helper**

Append to `app/lib/queries/coven.ts`:

```ts
export async function getRelationshipMap(
  client: Client,
  currentUserId: string,
  profileIds: string[],
): Promise<Map<string, { state: Extract<CovenState, "pending_outbound" | "pending_inbound">; requestId: string }>> {
  const result = new Map<
    string,
    { state: Extract<CovenState, "pending_outbound" | "pending_inbound">; requestId: string }
  >();
  if (profileIds.length === 0) return result;

  const idList = profileIds.join(",");
  const { data, error } = await client
    .from("coven_requests")
    .select("id, from_user_id, to_user_id, status")
    .eq("status", "pending")
    .or(
      `and(from_user_id.eq.${currentUserId},to_user_id.in.(${idList})),and(to_user_id.eq.${currentUserId},from_user_id.in.(${idList}))`,
    );
  if (error) throw error;

  for (const r of data ?? []) {
    if (r.from_user_id === currentUserId) {
      result.set(r.to_user_id, { state: "pending_outbound", requestId: r.id });
    } else if (r.to_user_id === currentUserId) {
      result.set(r.from_user_id, { state: "pending_inbound", requestId: r.id });
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd app && npx vitest run tests/queries/relationship-map.test.ts
```

Expected: PASS — all five tests green.

- [ ] **Step 5: Commit**

`/tmp/msg.txt`:

```
feat(coven): getRelationshipMap — batch lookup of pending request
state for many profile ids in one round-trip

Mirrors the existing getCovenStateBetween helper but accepts a list
of other-user ids and returns a Map keyed by the other-user id.
Used by /coven's search pane to render four-state inline buttons
without N+1 queries.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

```bash
git add app/lib/queries/coven.ts app/tests/queries/relationship-map.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 3: Build `SearchPersonRow` client component

No tests — the codebase has no React component test pattern. Verified by manual UI smoke in Task 7.

**Files:**
- Create: `app/components/SearchPersonRow.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import Link from "next/link";
import { useTransition } from "react";
import Avatar from "./Avatar";
import { inviteToCoven, acceptCovenInvite } from "@/lib/actions/coven";

type RowState = "none" | "pending_outbound" | "pending_inbound" | "in_coven";

export interface SearchPersonRowProps {
  profile: {
    id: string;
    handle: string;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
  };
  state: RowState;
  incomingRequestId?: string;
}

export default function SearchPersonRow({ profile, state, incomingRequestId }: SearchPersonRowProps) {
  const [pending, startTransition] = useTransition();

  const handleInvite = () => {
    startTransition(async () => {
      await inviteToCoven(profile.id);
    });
  };

  const handleAccept = () => {
    if (!incomingRequestId) return;
    startTransition(async () => {
      await acceptCovenInvite(incomingRequestId);
    });
  };

  const button = (() => {
    if (state === "pending_outbound") {
      return (
        <button className="btn" disabled style={{ opacity: 0.5 }}>
          Pending
        </button>
      );
    }
    if (state === "in_coven") {
      return (
        <button className="btn" disabled style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
          In Coven
        </button>
      );
    }
    if (state === "pending_inbound") {
      return (
        <button className="btn btn-accent" onClick={handleAccept} disabled={pending}>
          {pending ? "..." : "Accept"}
        </button>
      );
    }
    return (
      <button className="btn" onClick={handleInvite} disabled={pending}>
        {pending ? "..." : "+ Invite"}
      </button>
    );
  })();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, border: "2px solid var(--bone)", padding: 16 }}>
      <Link
        href={`/p/${encodeURIComponent(profile.handle)}`}
        style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, textDecoration: "none", color: "inherit" }}
      >
        <Avatar name={profile.display_name ?? profile.handle} color="var(--accent)" size={48} url={profile.avatar_url} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="head" style={{ fontSize: 18, lineHeight: 1 }}>
            {profile.display_name ?? profile.handle}
          </div>
          <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
            @{profile.handle}
          </div>
          {profile.bio && (
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 13,
                fontStyle: "italic",
                color: "var(--bone)",
                opacity: 0.8,
                marginTop: 6,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {profile.bio}
            </div>
          )}
        </div>
      </Link>
      <div onClick={(e) => e.stopPropagation()}>{button}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

```bash
cd app && npx tsc --noEmit
```

Expected: PASS — no type errors. The component uses existing `inviteToCoven` and `acceptCovenInvite` actions from `@/lib/actions/coven`; verify those exports exist via grep if typecheck flags them.

- [ ] **Step 3: Commit**

`/tmp/msg.txt`:

```
feat(coven): SearchPersonRow — client component with four-state
inline button (+ Invite / Pending / Accept / In Coven)

Renders one row in the /coven page's "Find People" pane. Avatar +
name/handle wrap a link to /p/<handle>; the right-side button
fires inviteToCoven or acceptCovenInvite based on relationship
state. useTransition gives the button a brief pending indicator
without blocking the rest of the page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

```bash
git add app/components/SearchPersonRow.tsx
git commit -F /tmp/msg.txt
```

---

## Task 4: Rewrite `app/app/coven/page.tsx`

**Files:**
- Modify: `app/app/coven/page.tsx` (full body rewrite)

- [ ] **Step 1: Replace the file body**

Overwrite `app/app/coven/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getPendingInvites,
  getMyCovenMembers,
  getRelationshipMap,
} from "@/lib/queries/coven";
import { getProfilesBySearch } from "@/lib/queries/profiles";
import TopNav from "@/components/TopNav";
import Avatar from "@/components/Avatar";
import CovenInviteActions from "@/components/CovenInviteActions";
import LeaveCovenButton from "@/components/LeaveCovenButton";
import PeopleSearch from "@/components/PeopleSearch";
import SearchPersonRow from "@/components/SearchPersonRow";
import Link from "next/link";

export default async function CovenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin?redirect=/coven");

  const [invites, members] = await Promise.all([
    getPendingInvites(supabase, user.id),
    getMyCovenMembers(supabase, user.id),
  ]);

  const memberIds = members.map((m) => m.id);
  const profiles = await getProfilesBySearch(supabase, {
    q,
    excludeUserIds: [user.id, ...memberIds],
  });
  const relationshipMap = await getRelationshipMap(
    supabase,
    user.id,
    profiles.map((p) => p.id),
  );

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="coven" />

      <section
        style={{
          background: "var(--bone)",
          color: "var(--void)",
          borderBottom: "3px solid var(--void)",
          padding: "22px 0 18px",
        }}
        className="grain-light"
      >
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>
            Chapter IV · The Covenfolk
          </div>
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            The <em style={{ color: "var(--accent)" }}>Covenfolk</em>.
          </h1>
        </div>
      </section>

      {invites.length > 0 && (
        <section style={{ padding: "24px 0", borderBottom: "3px solid var(--void)" }}>
          <div className="container-wide">
            <h2 className="head" style={{ fontSize: 24, margin: "0 0 16px" }}>Pending Invitations</h2>
            <div style={{ display: "grid", gap: 12 }}>
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  style={{ display: "flex", alignItems: "center", gap: 16, padding: 14, border: "1px solid var(--muted)" }}
                >
                  <Avatar
                    name={inv.from.display_name ?? inv.from.handle}
                    color="var(--accent)"
                    size={44}
                    url={inv.from.avatar_url}
                  />
                  <div style={{ flex: 1 }}>
                    <div className="head" style={{ fontSize: 16, lineHeight: 1 }}>
                      <Link
                        href={`/p/${encodeURIComponent(inv.from.handle)}`}
                        style={{ color: "var(--bone)", textDecoration: "none" }}
                      >
                        {inv.from.display_name ?? inv.from.handle}
                      </Link>
                    </div>
                    <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                      @{inv.from.handle}
                    </div>
                  </div>
                  <CovenInviteActions requestId={inv.id} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section style={{ padding: "32px 0 60px" }}>
        <div className="container-wide">
          <div
            className="stackable"
            style={{ "--stack-template": "1fr 1fr", "--stack-gap": "32px", alignItems: "start" } as React.CSSProperties}
          >
            <div>
              <h2 className="head" style={{ fontSize: 28, margin: "0 0 16px" }}>Your Coven</h2>
              {members.length === 0 ? (
                <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
                  Your coven is empty. Search to your right to find souls to bind with.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {members.map((m) => (
                    <div key={m.id} style={{ border: "1px solid var(--muted)", padding: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <Avatar
                          name={m.display_name ?? m.handle}
                          color="var(--accent)"
                          size={44}
                          url={m.avatar_url}
                        />
                        <div style={{ flex: 1 }}>
                          <Link href={`/p/${encodeURIComponent(m.handle)}`} style={{ color: "var(--bone)", textDecoration: "none" }}>
                            <div className="head" style={{ fontSize: 16, lineHeight: 1 }}>
                              {m.display_name ?? m.handle}
                            </div>
                            <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                              @{m.handle}
                            </div>
                          </Link>
                        </div>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <LeaveCovenButton
                          otherUserId={m.id}
                          otherHandle={m.handle}
                          otherDisplayName={m.display_name ?? m.handle}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="head" style={{ fontSize: 28, margin: "0 0 16px" }}>Find People</h2>
              <div
                style={{
                  display: "flex",
                  border: "3px solid var(--void)",
                  background: "var(--bone)",
                  boxShadow: "6px 6px 0 var(--accent)",
                  marginBottom: 20,
                }}
              >
                <span
                  style={{
                    padding: "14px 16px",
                    fontFamily: "var(--font-display)",
                    fontSize: 24,
                    color: "var(--accent)",
                    lineHeight: 1,
                  }}
                >
                  ✦
                </span>
                <PeopleSearch />
              </div>
              {profiles.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: 40,
                    fontFamily: "var(--font-serif)",
                    fontStyle: "italic",
                    color: "var(--muted)",
                  }}
                >
                  {q ? "No souls match your search." : "No souls in the realm yet."}
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {profiles.map((p) => {
                    const rel = relationshipMap.get(p.id);
                    const state = rel?.state ?? "none";
                    return (
                      <SearchPersonRow
                        key={p.id}
                        profile={p}
                        state={state}
                        incomingRequestId={state === "pending_inbound" ? rel?.requestId : undefined}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd app && npx tsc --noEmit
```

Expected: PASS — no type errors. If `PeopleSearch` import path or props differ from this assumption, adjust the import to match the actual file.

- [ ] **Step 3: Manual smoke — load the page in dev**

```bash
cd app && npm run dev
```

Visit http://localhost:3000/coven (signed in). Verify:
- Hero reads "The Covenfolk."
- If you have pending invites, a strip appears under the hero with accept/decline working.
- Below: two-column "Your Coven" (left) and "Find People" (right).
- Search input on right; typing filters results.
- Each search result has an inline button matching its relationship state.

If something is off cosmetically, tweak inline. Don't go back and reshape the whole architecture — just dial in the spacing/colors against the existing zine vocabulary.

- [ ] **Step 4: Commit**

`/tmp/msg.txt`:

```
feat(coven): rewrite /coven as the merged Covenfolk page

Body becomes hero → pending-invites strip (collapses when empty) →
two-pane "Your Coven | Find People". Search pane filters out
yourself + existing coven members and renders one SearchPersonRow
per result with the right inline button state.

Reuses existing CovenInviteActions, LeaveCovenButton, PeopleSearch.
No new server actions; revalidatePath in the existing actions
re-renders this page after every invite/accept/decline/leave.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

```bash
git add app/app/coven/page.tsx
git commit -F /tmp/msg.txt
```

---

## Task 5: Update TopNav — drop "people", rename "Coven" → "Covenfolk"

**Files:**
- Modify: `app/components/TopNav.tsx:45-57`

- [ ] **Step 1: Edit the items array**

Replace the auth nav block in `app/components/TopNav.tsx` (lines 45-57). Change FROM:

```ts
const items = user
  ? [
      { id: "home", label: "Home", href: "/home" },
      { id: "films", label: "Discovery", href: "/films" },
      { id: "watchlist", label: "Watchlist", href: "/watchlist" },
      { id: "library", label: "Your Grimoire", href: "/library" },
      { id: "watched", label: "Diary", href: "/watched" },
      { id: "people", label: "People", href: "/people" },
      { id: "coven", label: "Coven", href: "/coven", badge: pendingInviteCount },
    ]
  : [
      { id: "films", label: "Discovery", href: "/films" },
    ];
```

TO:

```ts
const items = user
  ? [
      { id: "home", label: "Home", href: "/home" },
      { id: "films", label: "Discovery", href: "/films" },
      { id: "watchlist", label: "Watchlist", href: "/watchlist" },
      { id: "library", label: "Your Grimoire", href: "/library" },
      { id: "watched", label: "Diary", href: "/watched" },
      { id: "coven", label: "Covenfolk", href: "/coven", badge: pendingInviteCount },
    ]
  : [
      { id: "films", label: "Discovery", href: "/films" },
    ];
```

Two changes: `people` row removed; `coven` label is now `"Covenfolk"`.

- [ ] **Step 2: Typecheck**

```bash
cd app && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Manual smoke — verify navbar**

Reload http://localhost:3000/home. Verify:
- "Find Your People" / "People" no longer appears in the nav.
- The Coven slot is labeled "Covenfolk" and still shows the pending-invite badge if any.
- Clicking it routes to `/coven`.

- [ ] **Step 4: Commit**

`/tmp/msg.txt`:

```
chore(nav): drop People nav item, rename Coven → Covenfolk

The merged /coven page subsumes /people. TopNav now has one fewer
slot and the surviving entry uses the eyebrow vocabulary
("Covenfolk") that the page itself uses.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

```bash
git add app/components/TopNav.tsx
git commit -F /tmp/msg.txt
```

---

## Task 6: Redirect `/people` → `/coven`

**Files:**
- Modify: `app/app/people/page.tsx` (full body replace)

- [ ] **Step 1: Replace the page body**

Overwrite `app/app/people/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function PeoplePage() {
  redirect("/coven");
}
```

The page no longer takes searchParams or queries the database. Anyone hitting `/people` (bookmarks, in-app links, shared URLs) gets bounced to `/coven`. Query strings are dropped — acceptable since the new `/coven` search lives at the same `?q=` parameter and users on `/people?q=foo` would just land on `/coven` and re-search.

- [ ] **Step 2: Typecheck**

```bash
cd app && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Smoke — visit /people**

Reload http://localhost:3000/people. Verify the URL bar lands on `/coven` and the page renders.

- [ ] **Step 4: Commit**

`/tmp/msg.txt`:

```
feat(people): redirect /people → /coven

The merged Covenfolk page lives at /coven. Old bookmarks and
in-app links to /people redirect transparently.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

```bash
git add app/app/people/page.tsx
git commit -F /tmp/msg.txt
```

---

## Task 7: Full UI smoke + ship

No automated tests for cross-component flows in this codebase. Walk the manual smoke checklist below.

- [ ] **Step 1: Two-user smoke (signed in as User A and User B in two browsers/profiles)**

Setup:
- User A and User B exist in dev DB. Neither is in the other's coven. No pending requests between them.

Walk through:
1. Sign in as A. Visit `/coven`. Pending strip is hidden. "Your Coven" empty state shows; "Find People" right pane lists profiles including B.
2. Click `+ Invite` on B's row. Button flips to `Pending` (or briefly shows "..." if `useTransition` triggers). Page revalidates; row stays in search results since B is still not a coven member.
3. Sign in as B. Visit `/coven`. Pending strip now shows A's invitation with Accept/Decline buttons.
4. Click Accept. Page reloads; A appears in B's "Your Coven" pane and disappears from B's "Find People" pane.
5. Sign in as A. Visit `/coven`. B appears in "Your Coven" pane and is filtered out of "Find People".
6. Reverse-pending: User C (or A again if you have a third user) invites A. As A, visit `/coven` → C's invite is in the pending strip. Search for C in the right pane → row shows `Accept` button. Click → C joins A's coven; pending strip drops the row.
7. Click `Leave` on B's row in A's "Your Coven". B is removed; search for B → row reappears with `+ Invite`.

- [ ] **Step 2: Mobile smoke (≤720px)**

Resize browser to ≤720px or use device emulation.
1. `/coven` stacks: hero → pending strip → Your Coven → Find People.
2. No horizontal overflow.
3. Tap targets ≥44px on buttons.
4. `+ Invite` / `Accept` buttons fire correctly on tap.

- [ ] **Step 3: Redirect smoke**

1. Visit `/people` directly. URL bar lands on `/coven`.
2. Visit `/people?q=alice`. URL bar lands on `/coven` (query param dropped — acceptable).
3. TopNav contains no "People" / "Find Your People" entry.

- [ ] **Step 4: Typecheck and final test pass**

```bash
cd app && npx tsc --noEmit
cd app && npx vitest run
```

Both should pass. The new query tests from Tasks 1-2 should appear in the Vitest output. No tests were broken by the changes.

- [ ] **Step 5: Final commit gate — verify clean tree**

```bash
git status
git log --oneline origin/master..HEAD
```

Expected: working tree clean (only untracked local files like `.claude/`); commit log shows tasks 1-6 each as their own commit. If any commit batched multiple tasks, that's fine — but no task should be missing a commit.

- [ ] **Step 6: Push branch and open PR**

```bash
git fetch origin
# If origin/master moved during this work, rebase:
# git rebase origin/master   # only if needed
git push -u origin feature/covenfolk-merge
gh pr create --title "feat: merge /people + /coven into Covenfolk" --body "$(cat <<'EOF'
## Summary
- Merges `/people` and `/coven` into one page at `/coven` with TopNav label "Covenfolk".
- Pending-invites strip on top (hides when empty), two-pane "Your Coven | Find People" body.
- Inline four-state invite button on each search result: `+ Invite` / `Pending` / `Accept` / `In Coven`.
- `/people` redirects to `/coven`.

## Files
- New: `SearchPersonRow.tsx`, query helpers `getRelationshipMap` + `excludeUserIds` arg on `getProfilesBySearch`.
- Modified: `app/coven/page.tsx` (full rewrite), `app/people/page.tsx` (redirect), `TopNav.tsx` (dropped slot + label).
- No schema changes, no new RLS, no new server actions.

## Spec
`docs/superpowers/specs/2026-04-26-covenfolk-merge-design.md`

## Test plan
- [ ] `/coven` two-user invite/accept loop end to end.
- [ ] Reverse-pending shows `Accept` inline.
- [ ] `/people` and `/people?q=foo` redirect to `/coven`.
- [ ] Mobile stack order correct, no horizontal overflow.
- [ ] `npx vitest run` and `npx tsc --noEmit` pass in `app/`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Branch name `feature/covenfolk-merge` is suggested but not required — pick whatever fits the existing `feature/*` convention.

---

## Self-review notes (run before handoff)

**Spec coverage check:**
- ✅ Q1 (inline invite button): Task 3 (`SearchPersonRow`).
- ✅ Q2 (pending strip on top, hidden when empty): Task 4 (`{invites.length > 0 && ...}`).
- ✅ Q3 (mobile stack: pending → coven → search): Task 4 (`.stackable` collapses; section order matches).
- ✅ Q4 (route stays `/coven`, label "Covenfolk", `/people` redirect): Tasks 4, 5, 6.
- ✅ Q5 (four-state button): Task 3.
- ✅ Q6 (default search shows all): Task 4 (`getProfilesBySearch` called with empty `q`).
- ✅ Q7 (filter self + coven members): Task 1 + Task 4 (page passes `[user.id, ...memberIds]`).
- ✅ Data layer: Tasks 1, 2.
- ✅ No new server actions, no new RLS, no migrations: confirmed by absence of those tasks.

**Type consistency:**
- `getRelationshipMap` returns map values typed via `Extract<CovenState, "pending_outbound" | "pending_inbound">` — re-uses the existing `CovenState` enum. `SearchPersonRow.state` is `"none" | "pending_outbound" | "pending_inbound" | "in_coven"` (note `in_coven` is the row-component state, distinct from the DB-side `member` enum value; the page never passes `in_coven` because coven members are filtered out). Consistent across tasks.
- `incomingRequestId` is `string | undefined` everywhere it appears.

**Placeholder scan:** No TBDs. Every code step shows the full code. Every command shows expected output.
