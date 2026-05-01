# Recommend Modal Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `RecommendModal`'s native `<select>` with an in-sheet picker — search input + horizontal chip row of "top covenfolk" (people the user has recommended to most often) + a substring-filtered list of remaining covenfolk as the user types.

**Architecture:** New read query `getTopRecommendedCovenMemberIds` aggregates `activity` rows of `kind = 'recommendation_sent'` for the current user and returns the most-recommended-to coven member IDs. `/film/[id]` adds it to the existing `Promise.all` block. `RecommendModal` lifts member selection into `useState`, renders a custom picker UI, and submits via component state instead of FormData. Search filter extracted as a pure function for testability.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase SSR client, existing `Avatar` and `BottomSheet` primitives.

**Spec:** `docs/superpowers/specs/2026-05-01-recommend-modal-picker-design.md`

**Branch (already created):** `feature/recommend-modal-picker`

---

## File Structure

**Created:**
- `app/lib/queries/recommendations.ts` — new query file. Exports `getTopRecommendedCovenMemberIds`. (No existing query file for recommendations — actions live in `app/lib/actions/recommendations.ts` but the read side hasn't existed until now.)
- `app/components/recommend-modal-search.ts` — pure-function `filterCovenMembers` used by the modal. Extracted from JSX for testability.
- `app/tests/queries/recommendations.test.ts` — env-skipIf integration test for the new query.
- `app/tests/components/recommend-modal-search.test.ts` — pure unit test of the filter helper.

**Modified:**
- `app/components/RecommendModal.tsx` — full body rewrite. Drops `<select>`, adds chip row + search + filtered list, lifts selection to state.
- `app/app/film/[id]/page.tsx` — adds `getTopRecommendedCovenMemberIds` to the existing `Promise.all`, threads `topCovenMemberIds` and `avatar_url` into `<RecommendModal>`.
- `CLAUDE.md` and `docs/sub-project-history.md` — sub-project #29 row.

**Untouched:**
- `BottomSheet`, `Avatar`, `ToastProvider` primitives.
- `app/lib/actions/recommendations.ts` — server action API stays the same.
- All other modals.
- Schema.

---

### Task 1: Pure search-filter helper + unit test

**Files:**
- Create: `app/components/recommend-modal-search.ts`
- Create: `app/tests/components/recommend-modal-search.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/christophernowacki/film-goblin/app/tests/components/recommend-modal-search.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { filterCovenMembers, type Searchable } from "@/components/recommend-modal-search";

const A: Searchable = { id: "a", username: "alice", display_name: "Alice" };
const B: Searchable = { id: "b", username: "bob",   display_name: "Bobby Bones" };
const C: Searchable = { id: "c", username: "cici",  display_name: null };
const ALL = [A, B, C];

describe("filterCovenMembers", () => {
  it("empty query returns empty array", () => {
    expect(filterCovenMembers(ALL, "")).toEqual([]);
    expect(filterCovenMembers(ALL, "   ")).toEqual([]);
  });

  it("matches a substring of username", () => {
    expect(filterCovenMembers(ALL, "lic").map(m => m.id)).toEqual(["a"]);
  });

  it("matches a substring of display_name", () => {
    expect(filterCovenMembers(ALL, "bone").map(m => m.id)).toEqual(["b"]);
  });

  it("is case-insensitive", () => {
    expect(filterCovenMembers(ALL, "ALICE").map(m => m.id)).toEqual(["a"]);
    expect(filterCovenMembers(ALL, "BoBbY").map(m => m.id)).toEqual(["b"]);
  });

  it("returns multiple matches preserving input order", () => {
    expect(filterCovenMembers(ALL, "i").map(m => m.id)).toEqual(["a", "c"]);
  });

  it("members with null display_name match by username only", () => {
    expect(filterCovenMembers(ALL, "cici").map(m => m.id)).toEqual(["c"]);
    expect(filterCovenMembers(ALL, "nope").map(m => m.id)).toEqual([]);
  });

  it("trims whitespace before matching", () => {
    expect(filterCovenMembers(ALL, "  bob  ").map(m => m.id)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `app/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/components/recommend-modal-search.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `/Users/christophernowacki/film-goblin/app/components/recommend-modal-search.ts`:

```typescript
export interface Searchable {
  id: string;
  username: string;
  display_name: string | null;
}

/**
 * Case-insensitive substring match against username AND display_name.
 * Empty / whitespace-only query returns []. Order of input is preserved.
 *
 * Extracted from RecommendModal so the matching logic is unit-testable
 * without mounting the component.
 */
export function filterCovenMembers<T extends Searchable>(members: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  return members.filter(m =>
    m.username.toLowerCase().includes(q) ||
    (m.display_name?.toLowerCase().includes(q) ?? false)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/components/recommend-modal-search.test.ts
```
Expected: PASS (7 specs).

- [ ] **Step 5: Commit**

From `/Users/christophernowacki/film-goblin`:
```
git add app/components/recommend-modal-search.ts app/tests/components/recommend-modal-search.test.ts
git commit -m "feat(recommend): pure filterCovenMembers helper + unit tests"
```

Use `git commit -F /tmp/msg.txt` if heredoc commits mangle (per CLAUDE.md gotcha).

---

### Task 2: `getTopRecommendedCovenMemberIds` query + integration test

**Files:**
- Create: `app/lib/queries/recommendations.ts`
- Create: `app/tests/queries/recommendations.test.ts`

- [ ] **Step 1: Write the query**

Create `/Users/christophernowacki/film-goblin/app/lib/queries/recommendations.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

/**
 * IDs of coven members the current user has sent recommendations to,
 * ordered by recommendation count (descending). Returns up to `limit`
 * IDs. Empty array if the user has never sent a recommendation.
 *
 * Aggregation runs in app code because PostgREST doesn't support GROUP BY
 * natively. Fine at this scale (~hundreds of recommendations per user
 * worst case). Promote to an RPC or materialized view if a user ever
 * surpasses ~10k sent recommendations.
 */
export async function getTopRecommendedCovenMemberIds(
  client: Client,
  userId: string,
  limit = 8,
): Promise<string[]> {
  const { data, error } = await client
    .from("activity")
    .select("payload")
    .eq("actor_user_id", userId)
    .eq("kind", "recommendation_sent");
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const toId = (row.payload as { to_user_id?: string })?.to_user_id;
    if (toId) counts.set(toId, (counts.get(toId) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}
```

- [ ] **Step 2: Write the integration test**

Create `/Users/christophernowacki/film-goblin/app/tests/queries/recommendations.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTopRecommendedCovenMemberIds } from "@/lib/queries/recommendations";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let userB: TestUser;
let userC: TestUser;
let filmId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  userB = await createTestUser();
  userC = await createTestUser();

  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ itunes_id: 900000 + Math.floor(Math.random() * 100000), title: "T", director: "D", year: 2024 })
    .select("id")
    .single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  if (filmId) await adminClient().from("films").delete().eq("id", filmId);
  if (userA?.id) await deleteTestUser(userA.id);
  if (userB?.id) await deleteTestUser(userB.id);
  if (userC?.id) await deleteTestUser(userC.id);
});

describe.skipIf(!hasEnv)("getTopRecommendedCovenMemberIds", () => {
  it("ranks coven members by recommendation count, descending", async () => {
    const admin = adminClient();
    // userA recommends filmId twice to userB and once to userC.
    await admin.from("activity").insert([
      { kind: "recommendation_sent", actor_user_id: userA.id, payload: { film_id: filmId, to_user_id: userB.id } as never },
      { kind: "recommendation_sent", actor_user_id: userA.id, payload: { film_id: filmId, to_user_id: userB.id } as never },
      { kind: "recommendation_sent", actor_user_id: userA.id, payload: { film_id: filmId, to_user_id: userC.id } as never },
    ]);
    const ids = await getTopRecommendedCovenMemberIds(admin as never, userA.id);
    expect(ids).toEqual([userB.id, userC.id]);

    await admin.from("activity").delete().eq("actor_user_id", userA.id);
  });

  it("returns empty array for users who have never recommended", async () => {
    const admin = adminClient();
    const ids = await getTopRecommendedCovenMemberIds(admin as never, userA.id);
    expect(ids).toEqual([]);
  });

  it("respects the limit parameter", async () => {
    const admin = adminClient();
    await admin.from("activity").insert([
      { kind: "recommendation_sent", actor_user_id: userA.id, payload: { film_id: filmId, to_user_id: userB.id } as never },
      { kind: "recommendation_sent", actor_user_id: userA.id, payload: { film_id: filmId, to_user_id: userC.id } as never },
    ]);
    const ids = await getTopRecommendedCovenMemberIds(admin as never, userA.id, 1);
    expect(ids).toHaveLength(1);

    await admin.from("activity").delete().eq("actor_user_id", userA.id);
  });
});
```

- [ ] **Step 3: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS.

- [ ] **Step 4: Run the new tests (will SKIP locally)**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/recommendations.test.ts
```
Expected: skipped (no `TEST_SUPABASE_*` env locally) OR pass if env is present. `describe.skipIf` reports green-skipped, never red.

- [ ] **Step 5: Commit**

```
git add app/lib/queries/recommendations.ts app/tests/queries/recommendations.test.ts
git commit -m "feat(queries): getTopRecommendedCovenMemberIds + env-skipIf integration"
```

---

### Task 3: Wire query into `/film/[id]` and thread `avatar_url`

**Files:**
- Modify: `app/app/film/[id]/page.tsx`

- [ ] **Step 1: Add import**

Open `/Users/christophernowacki/film-goblin/app/app/film/[id]/page.tsx`. Near the top, add:

```typescript
import { getTopRecommendedCovenMemberIds } from "@/lib/queries/recommendations";
```

(The page already imports `getMyCovenMembers`, `isOnWatchlist`, `isInLibrary`, `getWatchCountForFilm` from `@/lib/queries/...` — match that style.)

- [ ] **Step 2: Add the query to the existing Promise.all block**

Find the block (around lines 28–35):

```typescript
  const [covenMembers, onList, owned, watchCount] = user
    ? await Promise.all([
        getMyCovenMembers(supabase, user.id),
        isOnWatchlist(supabase, id),
        isInLibrary(supabase, user.id, id),
        getWatchCountForFilm(supabase, user.id, id),
      ])
    : [[], false, false, 0];
```

Replace with:

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

- [ ] **Step 3: Update the `<RecommendModal>` call site**

Find the existing call (around line 96):

```typescript
{user && <RecommendModal filmId={film.id} filmTitle={film.title} covenMembers={covenMembers.map(m => ({ id: m.id, username: m.username, display_name: m.display_name }))} />}
```

Replace with:

```typescript
{user && <RecommendModal
  filmId={film.id}
  filmTitle={film.title}
  covenMembers={covenMembers.map(m => ({ id: m.id, username: m.username, display_name: m.display_name, avatar_url: m.avatar_url }))}
  topCovenMemberIds={topCovenMemberIds}
/>}
```

(The map now includes `avatar_url`. `getMyCovenMembers` already selects `avatar_url` from `profiles`; verify by grepping if uncertain — `grep -n "avatar_url" app/lib/queries/coven.ts | head` — but the field has been on `CovenMember` rows for the whole project's life.)

- [ ] **Step 4: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: TypeScript will complain at the `<RecommendModal>` call site because the new `topCovenMemberIds` prop and `avatar_url` field don't exist on the component yet. This is EXPECTED — Task 4 fixes it. As long as the only errors are about RecommendModal's prop shape, this task's wiring is correct.

- [ ] **Step 5: Hold the commit**

Don't commit yet. Combine with Task 4's commit since the two are tightly coupled and master must compile after each commit.

---

### Task 4: Rewrite `RecommendModal` body — chips + search + filtered list

**Files:**
- Modify: `app/components/RecommendModal.tsx`

- [ ] **Step 1: Replace the entire file**

Open `/Users/christophernowacki/film-goblin/app/components/RecommendModal.tsx`. Replace its full contents with:

```typescript
"use client";

import { useMemo, useState, useTransition } from "react";
import { recommendFilm } from "@/lib/actions/recommendations";
import { useToast } from "./ToastProvider";
import BottomSheet from "./BottomSheet";
import Avatar from "./Avatar";
import { filterCovenMembers } from "./recommend-modal-search";

interface CovenMember {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props {
  filmId: string;
  filmTitle: string;
  covenMembers: CovenMember[];
  topCovenMemberIds: string[];
}

export default function RecommendModal({ filmId, filmTitle, covenMembers, topCovenMemberIds }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  // Order chips by topCovenMemberIds; if the user has never recommended,
  // fall back to alphabetical by username so the chip row is still useful
  // for new accounts.
  const { chipMembers } = useMemo(() => {
    const byId = new Map(covenMembers.map(m => [m.id, m]));
    const top = topCovenMemberIds
      .map(id => byId.get(id))
      .filter((m): m is CovenMember => m !== undefined);
    if (top.length > 0) {
      return { chipMembers: top.slice(0, 8) };
    }
    const alpha = [...covenMembers].sort((a, b) => a.username.localeCompare(b.username));
    return { chipMembers: alpha.slice(0, 8) };
  }, [covenMembers, topCovenMemberIds]);

  const filtered = useMemo(
    () => filterCovenMembers(covenMembers, search),
    [covenMembers, search],
  );

  function close() {
    setOpen(false);
    setSelectedUserId(null);
    setSearch("");
    setSent(false);
    setError(null);
    setNote("");
  }

  function pick(id: string) {
    setSelectedUserId(prev => (prev === id ? null : id));
  }

  function send() {
    if (!selectedUserId) return;
    start(async () => {
      setError(null);
      try {
        await recommendFilm(filmId, selectedUserId, note);
        setSent(true);
        toast("Recommendation sent");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      }
    });
  }

  if (!open) {
    return <button className="btn btn-lg" onClick={() => setOpen(true)}>✦ Recommend To A Coven Member</button>;
  }

  const title = (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
      <span>Cast the Rune</span>
      <span className="dot-accent">•</span>
      <span style={{ fontSize: 18, color: "var(--muted)", fontFamily: "var(--font-ui)", fontWeight: 400 }}>
        {filmTitle}
      </span>
    </span>
  );

  return (
    <BottomSheet open={open} onClose={close} title={title}>
      {covenMembers.length === 0 ? (
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15, lineHeight: 1.5, padding: "12px 0" }}>
          You have no coven yet. Visit <a href="/coven" style={{ color: "var(--accent)", textDecoration: "underline" }}>/coven</a> to bind with someone, then come back.
        </div>
      ) : sent ? (
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", padding: "12px 0" }}>
          Sent. They&rsquo;ll see it in their feed.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 0 4px" }}>
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search covenfolk…"
            className="recommend-picker-search"
          />

          {/* Top chips */}
          <div className="recommend-picker-chips">
            {chipMembers.map(m => {
              const selected = m.id === selectedUserId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pick(m.id)}
                  className={`recommend-picker-chip ${selected ? "is-selected" : ""}`}
                  aria-pressed={selected}
                >
                  <Avatar
                    name={m.username}
                    color="var(--accent)"
                    size={44}
                    url={m.avatar_url}
                  />
                  <span className="recommend-picker-chip-name">{m.username}</span>
                </button>
              );
            })}
          </div>

          {/* Filtered list (only when search is non-empty) */}
          {filtered.length > 0 && (
            <div className="recommend-picker-list">
              {filtered.map(m => {
                const selected = m.id === selectedUserId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pick(m.id)}
                    className={`recommend-picker-row ${selected ? "is-selected" : ""}`}
                    aria-pressed={selected}
                  >
                    <Avatar
                      name={m.username}
                      color="var(--accent)"
                      size={36}
                      url={m.avatar_url}
                    />
                    <span className="recommend-picker-row-text">
                      <span className="recommend-picker-row-username">{m.username}</span>
                      {m.display_name && (
                        <span className="recommend-picker-row-display">{m.display_name}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {search.trim().length > 0 && filtered.length === 0 && (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)", padding: "4px 0" }}>
              No covenfolk match.
            </div>
          )}

          {/* Whisper */}
          <div>
            <div className="caps" style={{ fontSize: 11, marginBottom: 8, color: "var(--muted)" }}>A Whisper</div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="watch this one alone, with the lights off…"
              style={{
                width: "100%",
                border: "1px solid var(--muted)",
                background: "transparent",
                color: "var(--bone)",
                padding: 10,
                fontFamily: "var(--font-serif)",
                fontSize: 14,
                resize: "none",
                outline: "none",
              }}
            />
          </div>

          {error && (
            <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13 }}>{error}</div>
          )}

          <button
            type="button"
            disabled={pending || !selectedUserId}
            onClick={send}
            className="btn"
            style={{ width: "100%", justifyContent: "center" }}
          >
            {pending ? "Sealing…" : "✦ Seal & Send"}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
```

Key differences from the old file:
- New props: `topCovenMemberIds: string[]`. `CovenMember` interface gains `avatar_url: string | null`.
- Selection lifted to `useState<string | null>(null)`.
- `filterCovenMembers` from Task 1 powers the search.
- Form is no longer a `<form action={send}>` — Submit is a `<button onClick={send}>` reading from state.
- Submit disabled until a member is picked. The pre-existing "Pick a coven member." inline error path is no longer reachable; left in place defensively but won't fire.
- `close()` resets selection and search alongside the existing `sent`/`error`/`note`.

- [ ] **Step 2: Add the picker CSS**

Append to `/Users/christophernowacki/film-goblin/app/app/globals.css`:

```css

/* ===== RECOMMEND MODAL PICKER ===== */

.recommend-picker-search {
  width: 100%;
  border: 1px solid var(--muted);
  background: transparent;
  color: var(--bone);
  padding: 10px 14px;
  border-radius: 999px;
  font-family: var(--font-ui);
  font-size: 14px;
  outline: none;
}
.recommend-picker-search::placeholder {
  color: var(--muted);
}

.recommend-picker-chips {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.recommend-picker-chips::-webkit-scrollbar { display: none; }

.recommend-picker-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 0;
  padding: 4px;
  cursor: pointer;
  flex-shrink: 0;
}
.recommend-picker-chip > :first-child {
  border-radius: 999px;
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: outline-color 120ms ease-out;
}
.recommend-picker-chip.is-selected > :first-child {
  outline-color: var(--accent);
}
.recommend-picker-chip-name {
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bone);
  max-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recommend-picker-chip.is-selected .recommend-picker-chip-name {
  color: var(--accent);
}

.recommend-picker-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  max-height: 240px;
  overflow-y: auto;
}
.recommend-picker-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  padding: 8px 0;
  cursor: pointer;
  text-align: left;
}
.recommend-picker-row.is-selected {
  background: rgba(255, 45, 136, 0.08);
}
.recommend-picker-row-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.recommend-picker-row-username {
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 14px;
  color: var(--bone);
}
.recommend-picker-row.is-selected .recommend-picker-row-username {
  color: var(--accent);
}
.recommend-picker-row-display {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--muted);
}
```

- [ ] **Step 3: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS. The Task 3 wiring at `/film/[id]/page.tsx` should now match the new prop shape, and the import paths resolve.

- [ ] **Step 4: Run full test suite**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: 113 + 7 = ~120 specs pass. (`recommend-modal-search.test.ts` adds 7 specs from Task 1.) `recommendations.test.ts` from Task 2 reports skipped without env. No regressions.

- [ ] **Step 5: Commit Tasks 3 + 4 together**

From repo root:
```
git add app/components/RecommendModal.tsx app/app/globals.css app/app/film/[id]/page.tsx
git commit -m "feat(recommend): chips + fuzzy search picker, replace native select"
```

---

### Task 5: Update CLAUDE.md + open PR

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/sub-project-history.md`

- [ ] **Step 1: Append sub-project #29 row**

Open `/Users/christophernowacki/film-goblin/docs/sub-project-history.md`. Find the row for `| 28 |` and append:

```markdown
| 29 | RecommendModal picker — replace native `<select>` with in-sheet UI: search input + horizontal "top covenfolk" avatar chips (people the user has recommended to most often, computed from `activity` rows of `kind = 'recommendation_sent'`) + a substring-filtered list of remaining covenfolk that appears as the user types. Selection lifted to component state; submit disabled until a member is picked. New query `getTopRecommendedCovenMemberIds`; new pure-function `filterCovenMembers` extracted for testability. Falls back to alphabetical chips for users with no recommendation history. | `2026-05-01-recommend-modal-picker-design.md` |
```

- [ ] **Step 2: Update CLAUDE.md "Last updated"**

In `/Users/christophernowacki/film-goblin/CLAUDE.md`:

```markdown
**Last updated:** 2026-05-01 (sub-projects #25–#29 — comment polish+likes, username standardization, like_on_comment notification, modal visual unification, RecommendModal picker)
```

- [ ] **Step 3: Commit + push**

```
git add CLAUDE.md docs/sub-project-history.md
git commit -m "docs(claude): note sub-project #29 — RecommendModal picker"
git push -u origin feature/recommend-modal-picker
```

- [ ] **Step 4: Open PR**

Write the body to `/tmp/pr-body-29.md`:

```markdown
## Summary

Sub-project #29 — RecommendModal picker. Replaces the native `<select>` (which renders as the iOS wheel picker, ignoring our styling) with an in-sheet UI that lives entirely inside the BottomSheet.

- **Search input** at the top — substring match (case-insensitive) against username + display_name. Pure-function `filterCovenMembers` extracted for testability (7 unit specs).
- **Top covenfolk chips** — horizontal-scroll row of up to 8 avatar+username chips showing the people the user has recommended to most often. Powered by new query `getTopRecommendedCovenMemberIds`, which aggregates `activity` rows of `kind = 'recommendation_sent'` with the user as actor.
- **Filtered list** — appears below the chips as the user types. Same pick semantics as chips. Empty search → no list. No matches → italic "No covenfolk match."
- **Selection state** lifted to React state. Submit disabled until a member is picked. The pre-existing "Pick a coven member." error path is no longer reachable.
- **Fallback** — users who have never sent a recommendation still see useful chips (first 8 covenfolk alphabetically by username).

## Test plan

- [x] `cd app && npm run typecheck`
- [x] `cd app && npm test` — 7 new picker-search specs + 3 env-skipIf integration specs for the query
- [ ] Manual smoke on Vercel preview: open RecommendModal with a coven, verify chips render and are tappable, search filters, selection toggles, Submit disabled until picked, send + close + reopen → fresh state.
```

Then run:
```
gh pr create --title "feat: RecommendModal picker — top-covenfolk chips + fuzzy search" --body-file /tmp/pr-body-29.md
```

- [ ] **Step 5: Done.** Report PR URL back to the controller.

---

## Self-Review

**1. Spec coverage:**
- Spec §"Data: new query" → Task 2.
- Spec §"Component: existing `RecommendModal.tsx`" → Task 4.
- Spec §"UI inside the sheet body" → Task 4 (JSX + Task 4 Step 2 CSS).
- Spec §"Selection lifecycle" → Task 4 (state hooks + `close()` + `pick()` + Submit-disabled-until-selected).
- Spec §"Search filter" → Task 1 (pure helper) + Task 4 (consumed via `filterCovenMembers`).
- Spec §"Caller wiring" → Task 3.
- Spec §"Tests / unit test of filter" → Task 1.
- Spec §"Tests / integration of query" → Task 2.
- Spec §"Tests / manual smoke" → Task 5 PR body's manual checklist.
- Spec §"Risk register / Top-covenfolk computation cost" — query implementation aggregates in app code at the documented scale; comment in the query file warns when to promote.
- Spec §"Risk register / Avatar shape on chip" — addressed via `outline-offset: 2px` on the chip's selection ring (sits outside the avatar, not overlapping initials).
- Spec §"Risk register / Long usernames clipping" — addressed via `max-width: 64px; overflow: hidden; text-overflow: ellipsis` on `.recommend-picker-chip-name`.

All spec sections covered.

**2. Placeholder scan:** No "TBD" / "TODO" / "Similar to Task N" markers. Every code block contains the literal replacement content. Manual smoke checklist in PR body is concrete.

**3. Type consistency:**
- `Searchable` interface in Task 1's helper has the same three fields (`id`, `username`, `display_name`) that `CovenMember` extends in Task 4. `filterCovenMembers<T extends Searchable>` accepts the wider `CovenMember` type without cast.
- `topCovenMemberIds: string[]` declared in Task 3's wiring matches Task 4's `Props` interface.
- `getTopRecommendedCovenMemberIds(client, userId, limit?)` signature consistent across Tasks 2 and 3.
- `avatar_url: string | null` consistent with `Avatar`'s existing `url?: string | null` prop and the existing `CovenMember` shape from `getMyCovenMembers` (assumed — verified via the spec's "field has been on `CovenMember` rows for the whole project's life" note in Task 3).

No drift detected.
