# Film Watchers — "Who's Watching" Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Watching" strip to the film detail page that shows coven members who have the film on their watchlist or in their library, plus a tappable count of other discoverable users doing the same.

**Architecture:** New `discoverable` boolean column on `profiles` (migration `0160`). Two new parallel queries in `app/lib/queries/film-watchers.ts`. New `FilmWatchersStrip` client component rendered inside the film hero block, below the action buttons. Settings toggle wired via the existing `ProfileFields` spread pattern.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase Postgres (PostgREST), existing `BottomSheet` + `Avatar` + `pill-row` components.

---

## File Map

| File | Action |
|---|---|
| `db/migrations/0160_discoverable.sql` | Create — adds `discoverable` column |
| `app/lib/supabase/types.ts` | Modify — add `discoverable` to profiles Row/Insert/Update |
| `app/lib/actions/profile.ts` | Modify — add `discoverable` to `ProfileFields` |
| `app/lib/queries/film-watchers.ts` | Create — two query functions |
| `app/tests/queries/film-watchers.test.ts` | Create — integration tests (skip without env) |
| `app/components/FilmWatchersStrip.tsx` | Create — the strip + BottomSheet component |
| `app/app/film/[id]/page.tsx` | Modify — add queries + render strip |
| `app/app/settings/SettingsForm.tsx` | Modify — add discoverable checkbox |

---

## Task 1: Migration + type updates

**Files:**
- Create: `db/migrations/0160_discoverable.sql`
- Modify: `app/lib/supabase/types.ts`
- Modify: `app/lib/actions/profile.ts`

- [ ] **Step 1: Write the migration**

Create `db/migrations/0160_discoverable.sql`:

```sql
ALTER TABLE profiles
  ADD COLUMN discoverable BOOLEAN NOT NULL DEFAULT true;
```

- [ ] **Step 2: Apply the migration**

```bash
cd db
set -a; source ../app/.env.local; set +a
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
```

Expected: `Applied: 0160_discoverable.sql`

- [ ] **Step 3: Update profiles Row type in `app/lib/supabase/types.ts`**

Find the `profiles` table `Row` type (search for `broadcast_library`) and add `discoverable` after the existing boolean columns:

```ts
// Before (excerpt):
broadcast_library: boolean
broadcast_watchlist_adds: boolean
broadcast_watched: boolean

// After (add one line):
broadcast_library: boolean
broadcast_watchlist_adds: boolean
broadcast_watched: boolean
discoverable: boolean
```

Find the `profiles` table `Insert` type and add:
```ts
discoverable?: boolean
```

Find the `profiles` table `Update` type and add:
```ts
discoverable?: boolean
```

- [ ] **Step 4: Add `discoverable` to `ProfileFields` in `app/lib/actions/profile.ts`**

The `ProfileFields` interface is at line 11. Add one field:

```ts
export interface ProfileFields {
  username?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  broadcast_watchlist_adds?: boolean;
  broadcast_library?: boolean;
  broadcast_watched?: boolean;
  email_price_drops?: boolean;
  email_coven_recs?: boolean;
  email_comments?: boolean;
  email_coven_invites?: boolean;
  notify_rate_reminders?: boolean;
  notify_comment_likes?: boolean;
  discoverable?: boolean;           // ← add this
}
```

- [ ] **Step 5: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0160_discoverable.sql app/lib/supabase/types.ts app/lib/actions/profile.ts
```

Write to `/tmp/msg.txt`:
```
feat(profiles): add discoverable column for film-page social visibility
```

```bash
git commit -F /tmp/msg.txt
```

---

## Task 2: Query layer + tests

**Files:**
- Create: `app/lib/queries/film-watchers.ts`
- Create: `app/tests/queries/film-watchers.test.ts`

- [ ] **Step 1: Write the test file first**

Create `app/tests/queries/film-watchers.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  getCovenWatchersForFilm,
  getOtherWatchersForFilm,
} from "@/lib/queries/film-watchers";
import type { Database } from "@/lib/supabase/types";

const hasEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

type AdminClient = ReturnType<typeof createClient<Database>>;

// Stable test-only UUIDs — won't collide with real data
const FILM_ID = "f1lm0000-0000-0000-0000-000000000001";
const OTHER_FILM_ID = "f1lm0000-0000-0000-0000-000000000002";
let USER_A: string; // viewer
let USER_B: string; // coven of A — has film on watchlist
let USER_C: string; // coven of A — has film in library
let USER_D: string; // NOT coven, discoverable = true — has film on watchlist
let USER_E: string; // NOT coven, discoverable = false — has film on watchlist

describe.skipIf(!hasEnv)("getCovenWatchersForFilm", () => {
  let client: AdminClient;

  beforeAll(async () => {
    if (!hasEnv) return;
    client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Create 5 test users via admin API
    const create = async (username: string, discoverable = true) => {
      const { data, error } = await client.auth.admin.createUser({
        email: `${username}-fw-test@filmgoblin.test`,
        password: "testpass123",
        email_confirm: true,
      });
      if (error) throw error;
      const id = data.user.id;
      await client.from("profiles").update({ username, discoverable }).eq("id", id);
      return id;
    };

    USER_A = await create("fw-user-a");
    USER_B = await create("fw-user-b");
    USER_C = await create("fw-user-c");
    USER_D = await create("fw-user-d");
    USER_E = await create("fw-user-e", false); // not discoverable

    // Bond A↔B and A↔C (coven_members requires user_a_id < user_b_id)
    const bond = async (x: string, y: string) => {
      const [a, b] = x < y ? [x, y] : [y, x];
      await client.from("coven_members").insert({ user_a_id: a, user_b_id: b });
    };
    await bond(USER_A, USER_B);
    await bond(USER_A, USER_C);

    // B has FILM_ID on watchlist
    await client.from("watchlists").insert({ user_id: USER_B, film_id: FILM_ID });
    // C has FILM_ID in library
    await client.from("library").insert({ user_id: USER_C, film_id: FILM_ID });
    // D has FILM_ID on watchlist (not coven, discoverable)
    await client.from("watchlists").insert({ user_id: USER_D, film_id: FILM_ID });
    // E has FILM_ID on watchlist (not coven, NOT discoverable)
    await client.from("watchlists").insert({ user_id: USER_E, film_id: FILM_ID });
  });

  afterAll(async () => {
    if (!hasEnv) return;
    // Clean up in reverse dependency order
    await client.from("watchlists").delete().in("user_id", [USER_B, USER_D, USER_E]);
    await client.from("library").delete().eq("user_id", USER_C);
    const [ab_a, ab_b] = USER_A < USER_B ? [USER_A, USER_B] : [USER_B, USER_A];
    const [ac_a, ac_b] = USER_A < USER_C ? [USER_A, USER_C] : [USER_C, USER_A];
    await client.from("coven_members").delete().eq("user_a_id", ab_a).eq("user_b_id", ab_b);
    await client.from("coven_members").delete().eq("user_a_id", ac_a).eq("user_b_id", ac_b);
    for (const id of [USER_A, USER_B, USER_C, USER_D, USER_E]) {
      await client.auth.admin.deleteUser(id);
    }
  });

  it("returns coven members who have the film on watchlist", async () => {
    const result = await getCovenWatchersForFilm(
      client as any, USER_A, FILM_ID,
    );
    const ids = result.map(r => r.id);
    expect(ids).toContain(USER_B);
  });

  it("returns coven members who have the film in library", async () => {
    const result = await getCovenWatchersForFilm(
      client as any, USER_A, FILM_ID,
    );
    const ids = result.map(r => r.id);
    expect(ids).toContain(USER_C);
  });

  it("does not return non-coven users", async () => {
    const result = await getCovenWatchersForFilm(
      client as any, USER_A, FILM_ID,
    );
    const ids = result.map(r => r.id);
    expect(ids).not.toContain(USER_D);
    expect(ids).not.toContain(USER_E);
  });

  it("returns empty array when no coven members have the film", async () => {
    const result = await getCovenWatchersForFilm(
      client as any, USER_A, OTHER_FILM_ID,
    );
    expect(result).toHaveLength(0);
  });

  it("returns profile shape: id, username, avatar_url", async () => {
    const result = await getCovenWatchersForFilm(
      client as any, USER_A, FILM_ID,
    );
    expect(result[0]).toMatchObject({ id: expect.any(String), username: expect.any(String) });
    expect("avatar_url" in result[0]).toBe(true);
  });
});

describe.skipIf(!hasEnv)("getOtherWatchersForFilm", () => {
  // Reuses the same fixtures — USER_* and client are module-level
  // and set up by the first describe's beforeAll. These tests run
  // after the coven-watchers suite so fixtures exist.
  let client: AdminClient;

  beforeAll(async () => {
    if (!hasEnv) return;
    client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  });

  it("returns non-coven discoverable users who have the film", async () => {
    const result = await getOtherWatchersForFilm(
      client as any, USER_A, FILM_ID,
    );
    const ids = result.users.map(r => r.id);
    expect(ids).toContain(USER_D);
  });

  it("excludes non-discoverable users", async () => {
    const result = await getOtherWatchersForFilm(
      client as any, USER_A, FILM_ID,
    );
    const ids = result.users.map(r => r.id);
    expect(ids).not.toContain(USER_E);
  });

  it("excludes the current user", async () => {
    // Add USER_A's own watchlist entry
    await client.from("watchlists").insert({ user_id: USER_A, film_id: FILM_ID });
    const result = await getOtherWatchersForFilm(
      client as any, USER_A, FILM_ID,
    );
    const ids = result.users.map(r => r.id);
    expect(ids).not.toContain(USER_A);
    await client.from("watchlists").delete().eq("user_id", USER_A).eq("film_id", FILM_ID);
  });

  it("excludes coven members", async () => {
    const result = await getOtherWatchersForFilm(
      client as any, USER_A, FILM_ID,
    );
    const ids = result.users.map(r => r.id);
    expect(ids).not.toContain(USER_B);
    expect(ids).not.toContain(USER_C);
  });

  it("returns correct totalCount", async () => {
    const result = await getOtherWatchersForFilm(
      client as any, USER_A, FILM_ID,
    );
    // USER_D is the only non-coven discoverable user with the film
    expect(result.totalCount).toBe(1);
    expect(result.users).toHaveLength(1);
  });

  it("orders users by username", async () => {
    const result = await getOtherWatchersForFilm(
      client as any, USER_A, FILM_ID,
    );
    const usernames = result.users.map(r => r.username);
    expect(usernames).toEqual([...usernames].sort());
  });
});
```

- [ ] **Step 2: Run tests — verify they skip cleanly**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/film-watchers.test.ts
```

Expected: all tests skipped (no env), 0 failures.

- [ ] **Step 3: Implement `app/lib/queries/film-watchers.ts`**

Create `app/lib/queries/film-watchers.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export interface WatcherProfile {
  id: string;
  username: string;
  avatar_url: string | null;
}

export interface OtherWatchersResult {
  users: WatcherProfile[];
  totalCount: number;
}

/**
 * Returns up to 4 coven members of `userId` who have `filmId` on their
 * watchlist or in their library. The `discoverable` flag is NOT checked —
 * coven members always appear regardless of their privacy settings.
 */
export async function getCovenWatchersForFilm(
  client: Client,
  userId: string,
  filmId: string,
): Promise<WatcherProfile[]> {
  const { data: edges, error: edgeErr } = await client
    .from("coven_members")
    .select("user_a_id, user_b_id")
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
  if (edgeErr) throw edgeErr;

  const covenIds = (edges ?? []).map(r =>
    r.user_a_id === userId ? r.user_b_id : r.user_a_id,
  );
  if (covenIds.length === 0) return [];

  const [{ data: wl }, { data: lib }] = await Promise.all([
    client.from("watchlists").select("user_id").eq("film_id", filmId).in("user_id", covenIds),
    client.from("library").select("user_id").eq("film_id", filmId).in("user_id", covenIds),
  ]);

  const watcherSet = new Set([
    ...(wl ?? []).map(r => r.user_id),
    ...(lib ?? []).map(r => r.user_id),
  ]);
  if (watcherSet.size === 0) return [];

  const { data: profiles, error: pErr } = await client
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", Array.from(watcherSet))
    .limit(4);
  if (pErr) throw pErr;
  return profiles ?? [];
}

/**
 * Returns non-coven, discoverable users who have `filmId` on their watchlist
 * or in their library, excluding `userId` (the current user) and their coven
 * members. Results are ordered by username; capped at `limit` (default 50).
 * `totalCount` is the uncapped count for the "and N more" footer.
 */
export async function getOtherWatchersForFilm(
  client: Client,
  userId: string,
  filmId: string,
  limit = 50,
): Promise<OtherWatchersResult> {
  // Build the exclusion set: current user + all coven members
  const { data: edges } = await client
    .from("coven_members")
    .select("user_a_id, user_b_id")
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
  const excludeIds = new Set<string>([userId]);
  for (const r of edges ?? []) {
    excludeIds.add(r.user_a_id === userId ? r.user_b_id : r.user_a_id);
  }

  // All users who have the film (watchlist union library)
  const [{ data: wl }, { data: lib }] = await Promise.all([
    client.from("watchlists").select("user_id").eq("film_id", filmId),
    client.from("library").select("user_id").eq("film_id", filmId),
  ]);

  const allIds = new Set([
    ...(wl ?? []).map(r => r.user_id),
    ...(lib ?? []).map(r => r.user_id),
  ]);
  for (const id of excludeIds) allIds.delete(id);
  if (allIds.size === 0) return { users: [], totalCount: 0 };

  // Fetch profiles for remaining ids, filter to discoverable, order by username
  const { data: profiles, error } = await client
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", Array.from(allIds))
    .eq("discoverable", true)
    .order("username");
  if (error) throw error;

  const all = profiles ?? [];
  return {
    users: all.slice(0, limit),
    totalCount: all.length,
  };
}
```

- [ ] **Step 4: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Run tests again**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/film-watchers.test.ts
```

Expected: skipped (no env) or passing (with env). 0 failures.

- [ ] **Step 6: Commit**

```bash
git add app/lib/queries/film-watchers.ts app/tests/queries/film-watchers.test.ts
```

Write to `/tmp/msg.txt`:
```
feat(queries): getCovenWatchersForFilm + getOtherWatchersForFilm
```

```bash
git commit -F /tmp/msg.txt
```

---

## Task 3: FilmWatchersStrip component

**Files:**
- Create: `app/components/FilmWatchersStrip.tsx`

- [ ] **Step 1: Create the component**

Create `app/components/FilmWatchersStrip.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import BottomSheet from "@/components/BottomSheet";
import type { WatcherProfile } from "@/lib/queries/film-watchers";

interface Props {
  covenWatchers: WatcherProfile[];
  otherWatchers: WatcherProfile[];
  otherCount: number;
}

export default function FilmWatchersStrip({
  covenWatchers,
  otherWatchers,
  otherCount,
}: Props) {
  const [open, setOpen] = useState(false);

  if (covenWatchers.length === 0 && otherCount === 0) return null;

  const othersLabel =
    covenWatchers.length > 0
      ? `+ ${otherCount} other${otherCount === 1 ? "" : "s"} →`
      : `${otherCount} goblin${otherCount === 1 ? "" : "s"} tracking this →`;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
        <span
          className="caps"
          style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0 }}
        >
          Watching
        </span>
        {covenWatchers.length > 0 && (
          <div style={{ display: "flex" }}>
            {covenWatchers.map((w, i) => (
              <div key={w.id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                <Avatar
                  name={w.username}
                  color="var(--accent)"
                  size={24}
                  url={w.avatar_url}
                />
              </div>
            ))}
          </div>
        )}
        {otherCount > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              color: "var(--accent)",
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            {othersLabel}
          </button>
        )}
      </div>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Also Watching"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px 4px" }}>
          {otherWatchers.map(w => (
            <div key={w.id} className="pill-row">
              <Avatar
                name={w.username}
                color="var(--accent)"
                size={32}
                url={w.avatar_url}
              />
              <Link
                prefetch={false}
                href={`/p/${encodeURIComponent(w.username)}`}
                style={{
                  flex: 1,
                  color: "var(--bone)",
                  textDecoration: "none",
                  fontFamily: "var(--font-ui)",
                  fontSize: 14,
                }}
              >
                {w.username}
              </Link>
            </div>
          ))}
          {otherCount > otherWatchers.length && (
            <p
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: 13,
                color: "var(--muted)",
                textAlign: "center",
                margin: "8px 0 0",
              }}
            >
              and {otherCount - otherWatchers.length} more
            </p>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/FilmWatchersStrip.tsx
```

Write to `/tmp/msg.txt`:
```
feat(ui): FilmWatchersStrip — coven chip row + others BottomSheet
```

```bash
git commit -F /tmp/msg.txt
```

---

## Task 4: Film page integration

**Files:**
- Modify: `app/app/film/[id]/page.tsx`

The film page already runs two `Promise.all` batches. The second batch (lines ~78–87) runs when `user` is present. Add the two new queries there.

- [ ] **Step 1: Add imports at top of `app/app/film/[id]/page.tsx`**

After the existing query imports (around line 12), add:

```ts
import { getCovenWatchersForFilm, getOtherWatchersForFilm } from "@/lib/queries/film-watchers";
import FilmWatchersStrip from "@/components/FilmWatchersStrip";
```

- [ ] **Step 2: Add the two queries to the auth-gated `Promise.all`**

The current block (lines ~78–87) looks like:

```ts
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
```

Replace with:

```ts
const [covenMembers, onList, owned, watchCount, topCovenMemberIds, myProfile, covenWatchers, otherWatchersResult] = user
  ? await Promise.all([
      getMyCovenMembers(supabase, user.id),
      isOnWatchlist(supabase, id),
      isInLibrary(supabase, user.id, id),
      getWatchCountForFilm(supabase, user.id, id),
      getTopRecommendedCovenMemberIds(supabase, user.id),
      getMyProfile(supabase),
      getCovenWatchersForFilm(supabase, user.id, id),
      getOtherWatchersForFilm(supabase, user.id, id),
    ])
  : [[], false, false, 0, [] as string[], null, [], { users: [], totalCount: 0 }];
```

- [ ] **Step 3: Render the strip in the hero block**

Find the `hero-actions` div (around line 155–174):

```tsx
<div className="hero-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
  {user && <FilmActions ... />}
  {user && <RecommendModal ... />}
  <ShareFilmButton ... />
  {film.itunes_url && <a ...>Buy on Apple TV →</a>}
</div>
```

Add the strip immediately after the closing `</div>` of `hero-actions`:

```tsx
{user && (
  <FilmWatchersStrip
    covenWatchers={covenWatchers}
    otherWatchers={otherWatchersResult.users}
    otherCount={otherWatchersResult.totalCount}
  />
)}
```

- [ ] **Step 4: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Start the dev server and verify on a film page**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Open `http://localhost:3000/film/<any-film-id>` while signed in. Verify:
- If you or another test user has the film on their scroll: the "Watching" strip appears below the action buttons
- Tapping "+ N others →" opens the "Also Watching" BottomSheet
- Rows in the sheet link to `/p/[username]`
- If nobody is watching: the strip is invisible

- [ ] **Step 6: Commit**

```bash
git add app/app/film/[id]/page.tsx
```

Write to `/tmp/msg.txt`:
```
feat(film): render FilmWatchersStrip in hero block
```

```bash
git commit -F /tmp/msg.txt
```

---

## Task 5: Settings toggle

**Files:**
- Modify: `app/app/settings/SettingsForm.tsx`

- [ ] **Step 1: Add `discoverable` to the `save()` call**

Find the `save` function in `SettingsForm.tsx`. It calls `updateProfile({...})`. Add `discoverable` to the object:

```ts
async function save(fd: FormData) {
  setSaving(true);
  try {
    await updateProfile({
      username: String(fd.get("username")),
      display_name: String(fd.get("display_name")),
      bio: String(fd.get("bio") || ""),
      broadcast_watchlist_adds: fd.get("broadcast") === "on",
      broadcast_library: fd.get("broadcast_library") === "on",
      broadcast_watched: fd.get("broadcast_watched") === "on",
      email_price_drops: fd.get("email_price_drops") === "on",
      email_coven_recs: fd.get("email_coven_recs") === "on",
      email_comments: fd.get("email_comments") === "on",
      email_coven_invites: fd.get("email_coven_invites") === "on",
      notify_rate_reminders: fd.get("notify_rate_reminders") === "on",
      notify_comment_likes: fd.get("notify_comment_likes") === "on",
      discoverable: fd.get("discoverable") === "on",   // ← add this line
    });
    toast("Saved");
  } finally { setSaving(false); }
}
```

- [ ] **Step 2: Add the checkbox to the form**

In the form JSX, after the `notify_comment_likes` checkbox and before the `<div style={{ borderTop ...}}>` divider that starts the email section, add:

```tsx
<label className="check-zine">
  <input
    type="checkbox"
    name="discoverable"
    defaultChecked={profile.discoverable ?? true}
  />
  <span className="check-zine__box" aria-hidden="true" />
  <span className="caps" style={{ fontSize: 11 }}>
    Show me in &ldquo;who&rsquo;s watching&rdquo; on film pages
  </span>
</label>
```

- [ ] **Step 3: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Verify in dev server**

Open `http://localhost:3000/settings`. Confirm:
- The "Show me in 'who's watching'" checkbox appears with the other broadcast toggles
- Unchecking + saving removes the user from other-watchers queries
- Toast "Saved" fires on submit

- [ ] **Step 5: Commit**

```bash
git add app/app/settings/SettingsForm.tsx
```

Write to `/tmp/msg.txt`:
```
feat(settings): discoverable toggle — controls film-page who's-watching visibility
```

```bash
git commit -F /tmp/msg.txt
```

---

## Final: deploy

```bash
npx vercel deploy --prod --yes
```

Run from repo root, not from `app/`. Verify on https://film-goblin.vercel.app/film/<any-id> while signed in.
