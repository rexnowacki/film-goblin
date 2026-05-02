# Coven Page Chip Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compress `/coven`'s left pane from per-member cards to a chip-row + search UX with a "See all" BottomSheet for the full coven. "Find People" right pane untouched.

**Architecture:** Three new client-rendered pieces (chip row, see-all sheet) plus one new server-side query helper that ranks covenfolk by 90-day interaction score (recommendations sent + reactions + comments). Reuses `filterCovenMembers` from sub-project #29 and `BottomSheet` primitive.

**Tech Stack:** Next.js 15 App Router (RSC + client islands), Supabase Postgres reads via existing `@/lib/supabase/server`, no new deps.

**Spec:** `docs/superpowers/specs/2026-05-02-coven-page-chip-rework-design.md`. Read it first.

---

## Task 1: `getRankedCovenfolk` query helper + tests

**Files:**
- Create: `app/lib/queries/coven-interactions.ts`
- Test: `app/tests/queries/coven-interactions.test.ts`

- [ ] **Step 1: Write the query helper**

```typescript
// app/lib/queries/coven-interactions.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { getMyCovenMembers } from "./coven";

type Client = SupabaseClient<Database>;

export interface CovenfolkRanked {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  score: number;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Returns the user's coven members ordered by 90-day interaction score:
 * recommendations sent to them + reactions on their activity + comments
 * on their activity, equally weighted. Ties break alphabetically by
 * username. Coven members with score 0 sort last alphabetically.
 *
 * Aggregation runs in app code because PostgREST has no GROUP BY.
 * Promote to an RPC if a user ever has thousands of covenfolk × hundreds
 * of interactions per pair.
 */
export async function getRankedCovenfolk(
  client: Client,
  userId: string,
): Promise<CovenfolkRanked[]> {
  const since = new Date(Date.now() - NINETY_DAYS_MS).toISOString();

  // 1. The viewer's coven members (canonical list — anything outside this
  //    isn't shown).
  const members = await getMyCovenMembers(client, userId);
  const memberById = new Map(members.map(m => [m.id, m]));
  const score = new Map<string, number>(members.map(m => [m.id, 0]));

  // 2. Recommendations sent to them.
  const recs = await client
    .from("activity")
    .select("payload")
    .eq("actor_user_id", userId)
    .eq("kind", "recommendation_sent")
    .gte("created_at", since);
  if (recs.error) throw recs.error;
  for (const row of recs.data ?? []) {
    const toId = (row.payload as { to_user_id?: string })?.to_user_id;
    if (toId && score.has(toId)) score.set(toId, score.get(toId)! + 1);
  }

  // 3. Reactions on their activity.
  const reacts = await client
    .from("activity_reactions")
    .select("activity:activity!inner(actor_user_id)")
    .eq("user_id", userId)
    .gte("created_at", since);
  if (reacts.error) throw reacts.error;
  for (const row of reacts.data ?? []) {
    const actorId = (row as unknown as { activity: { actor_user_id: string } }).activity.actor_user_id;
    if (actorId && score.has(actorId)) score.set(actorId, score.get(actorId)! + 1);
  }

  // 4. Comments on their activity.
  const comments = await client
    .from("activity_comments")
    .select("activity:activity!inner(actor_user_id)")
    .eq("user_id", userId)
    .gte("created_at", since);
  if (comments.error) throw comments.error;
  for (const row of comments.data ?? []) {
    const actorId = (row as unknown as { activity: { actor_user_id: string } }).activity.actor_user_id;
    if (actorId && score.has(actorId)) score.set(actorId, score.get(actorId)! + 1);
  }

  // 5. Sort: score DESC, alphabetical ASC for ties / zero-score tail.
  return members
    .map(m => ({
      id: m.id,
      username: m.username,
      display_name: m.display_name ?? null,
      avatar_url: m.avatar_url ?? null,
      score: score.get(m.id) ?? 0,
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.username.localeCompare(b.username);
    });
}
```

- [ ] **Step 2: Write the integration test**

```typescript
// app/tests/queries/coven-interactions.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getRankedCovenfolk } from "@/lib/queries/coven-interactions";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = !!(url && serviceKey);

describe.skipIf(!hasEnv)("getRankedCovenfolk", () => {
  if (!hasEnv) return;
  // Test bootstrap creates: viewer (V) + 3 covenfolk (A, B, C), bonded.
  // Seed signals: V→A 2 recs, V reacts to B's activity, V comments on C's
  // activity. Expected order: A (score 2) > B/C (score 1, alphabetical).
  // Implementer follows the existing pattern in app/tests/queries/film-tags.test.ts
  // for setup/teardown — env-skipIf gate, beforeAll seed, afterAll cleanup,
  // beforeEach reset.

  // Spec contract:
  it("orders covenfolk by score DESC, then alphabetical for ties", async () => { /* … */ });
  it("includes zero-score covenfolk in the alphabetical tail", async () => { /* … */ });
  it("excludes self-reactions / self-comments from the score", async () => { /* … */ });
  it("ignores activity older than 90 days", async () => { /* … */ });
});
```

The implementer fills in the test bodies using the bootstrap pattern from `app/tests/queries/film-tags.test.ts` (creates a film, three users, two coven bonds via service-role, etc.). Tests are env-skipIf-gated; report green-skipped without env.

- [ ] **Step 3: Typecheck + commit**

```bash
cd app && npm run typecheck
git add app/lib/queries/coven-interactions.ts app/tests/queries/coven-interactions.test.ts
git commit -m "feat(queries): getRankedCovenfolk — 90-day interaction score per coven mate"
```

---

## Task 2: `<CovenChipRow>` client component

**Files:**
- Create: `app/components/coven/CovenChipRow.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import LeaveCovenButton from "@/components/LeaveCovenButton";
import CovenSeeAllSheet from "@/components/coven/CovenSeeAllSheet";
import { filterCovenMembers } from "@/lib/recommend-filter";
import type { CovenfolkRanked } from "@/lib/queries/coven-interactions";

const TOP_CHIP_COUNT = 4;

interface Props {
  members: CovenfolkRanked[];
}

export default function CovenChipRow({ members }: Props) {
  const [query, setQuery] = useState("");
  const [seeAllOpen, setSeeAllOpen] = useState(false);

  if (members.length === 0) {
    return (
      <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
        Your coven is empty. Search to your right to find souls to bind with.
      </div>
    );
  }

  const topChips = members.slice(0, TOP_CHIP_COUNT);
  const showSeeAll = members.length > TOP_CHIP_COUNT;
  const showSearch = members.length > TOP_CHIP_COUNT;
  const filtered = query.trim()
    ? filterCovenMembers(
        members.map(m => ({ id: m.id, username: m.username, display_name: m.display_name, avatar_url: m.avatar_url })),
        query,
      )
    : [];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, gap: 12 }}>
        <h2 className="eyebrow" style={{ fontSize: 14, color: "var(--accent)", margin: 0 }}>
          Your Coven {members.length > 1 && <span style={{ color: "var(--muted)", fontWeight: "normal" }}>({members.length})</span>}
        </h2>
        {showSeeAll && (
          <button
            type="button"
            onClick={() => setSeeAllOpen(true)}
            style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--accent)", background: "transparent", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0 }}
          >
            See all ({members.length})
          </button>
        )}
      </div>

      <div className="coven-chip-row" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: showSearch ? 20 : 0 }}>
        {topChips.map(m => (
          <Link
            key={m.id}
            href={`/p/${encodeURIComponent(m.username)}`}
            className="coven-chip"
          >
            <Avatar name={m.username} color="var(--accent)" size={36} url={m.avatar_url} />
            <span style={{ fontFamily: "var(--font-ui)", fontSize: 12 }}>{m.username}</span>
          </Link>
        ))}
      </div>

      {showSearch && (
        <>
          <div style={{ display: "flex", gap: 0, border: "1px solid var(--muted)", background: "var(--void-2)", marginBottom: 16 }}>
            <span style={{ padding: "12px 14px", color: "var(--muted)", lineHeight: 1, display: "inline-flex", alignItems: "center" }} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.5" y2="16.5" />
              </svg>
            </span>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search your coven…"
              style={{ flex: 1, padding: "10px 0", background: "transparent", border: "none", color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 14, outline: "none" }}
            />
          </div>
          {query.trim() && (
            filtered.length === 0 ? (
              <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6, fontSize: 14 }}>
                No covenfolk match.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {filtered.map(m => (
                  <CovenCompactRow key={m.id} member={members.find(x => x.id === m.id)!} />
                ))}
              </div>
            )
          )}
        </>
      )}

      <CovenSeeAllSheet open={seeAllOpen} onClose={() => setSeeAllOpen(false)} members={members} />
    </>
  );
}

export function CovenCompactRow({ member }: { member: CovenfolkRanked }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", border: "1px solid var(--muted)" }}>
      <Avatar name={member.username} color="var(--accent)" size={32} url={member.avatar_url} />
      <Link
        href={`/p/${encodeURIComponent(member.username)}`}
        style={{ flex: 1, color: "var(--bone)", textDecoration: "none", fontFamily: "var(--font-ui)", fontSize: 14 }}
      >
        {member.username}
      </Link>
      <LeaveCovenButton
        otherUserId={member.id}
        otherUsername={member.username}
        otherDisplayName={member.username}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add CSS to `app/app/globals.css`**

Append:

```css
.coven-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 6px;
  background: var(--void-2);
  border: 1px solid var(--muted);
  color: var(--bone);
  text-decoration: none;
  border-radius: 0;
  transition: border-color 120ms ease;
}
.coven-chip:hover { border-color: var(--accent); }
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd app && npm run typecheck
git add app/components/coven/CovenChipRow.tsx app/app/globals.css
git commit -m "feat(coven): CovenChipRow — top-4 chips + search + inline results"
```

---

## Task 3: `<CovenSeeAllSheet>` BottomSheet

**Files:**
- Create: `app/components/coven/CovenSeeAllSheet.tsx`

- [ ] **Step 1: Write the component**

Read `app/components/BottomSheet.tsx` first to understand the props (`open`, `onClose`, `title`, children). Then:

```tsx
"use client";

import BottomSheet from "@/components/BottomSheet";
import { CovenCompactRow } from "@/components/coven/CovenChipRow";
import type { CovenfolkRanked } from "@/lib/queries/coven-interactions";

interface Props {
  open: boolean;
  onClose: () => void;
  members: CovenfolkRanked[];
}

/**
 * Full coven roster in a BottomSheet. Same score order as the chip row
 * (top scorers first, then alphabetical tail). Compact rows: avatar +
 * username + Leave button. Tap username to navigate to /p/<username>.
 */
export default function CovenSeeAllSheet({ open, onClose, members }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose} title={`Your Coven · ${members.length}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px 4px" }}>
        {members.map(m => (
          <CovenCompactRow key={m.id} member={m} />
        ))}
      </div>
    </BottomSheet>
  );
}
```

`CovenCompactRow` is exported from `CovenChipRow.tsx`; both surfaces share the same row component.

- [ ] **Step 2: Typecheck + commit**

```bash
cd app && npm run typecheck
git add app/components/coven/CovenSeeAllSheet.tsx
git commit -m "feat(coven): CovenSeeAllSheet — full coven roster in a BottomSheet"
```

---

## Task 4: Wire into `/coven` page

**Files:**
- Modify: `app/app/coven/page.tsx`

- [ ] **Step 1: Update imports + data fetch**

Add to the imports:

```tsx
import { getRankedCovenfolk } from "@/lib/queries/coven-interactions";
import CovenChipRow from "@/components/coven/CovenChipRow";
```

Remove the import of `LeaveCovenButton` (it now imports from `CovenChipRow`'s row component, not directly used here).

Replace the existing `Promise.all` to also fetch ranked covenfolk:

```tsx
const [invites, members, ranked, myProfile] = await Promise.all([
  getPendingInvites(supabase, user.id),
  getMyCovenMembers(supabase, user.id),
  getRankedCovenfolk(supabase, user.id),
  getMyProfile(supabase),
]);
```

`members` is still used by the right pane's `excludeUserIds` filter (line 39 in current file: `excludeUserIds: [user.id, ...memberIds]`) — keep that.

- [ ] **Step 2: Replace the left pane**

Replace lines 112–151 (the entire `<div>` containing the cards grid and "Your coven is empty" copy) with:

```tsx
<div>
  <CovenChipRow members={ranked} />
</div>
```

The `<h2 className="eyebrow">Your Coven</h2>` header is now rendered inside `CovenChipRow` (it already includes the count + "See all" link), so the parent `<div>` is just a layout slot.

- [ ] **Step 3: Verify typecheck + manual smoke**

```bash
cd app && npm run typecheck
npm run dev
```

Open `/coven` while signed in. Expected:
- 0 covenfolk: italic empty-state copy, no chips, no search.
- 1–4 covenfolk: chip row only, no search, no "See all" link.
- 5+ covenfolk: top 4 chip row + search input + "See all (N)" link in the header. Type into search → inline filtered rows appear. Tap "See all" → BottomSheet opens with the full ranked list.
- Tap any chip → navigate to `/p/<username>`.

- [ ] **Step 4: Commit**

```bash
git add 'app/app/coven/page.tsx'
git commit -m "feat(coven): wire CovenChipRow into /coven page (replaces card grid)"
```

---

## Task 5: PR + deploy

**Files:** none (operational)

- [ ] **Step 1: Update CLAUDE.md + history + roadmap**

Append row 34 to `docs/sub-project-history.md`:

```
| 34 | Coven page chip rework — replaces /coven's left-pane card grid with a top-4 chip row + search + "See all (N)" BottomSheet for full roster. Score = 90-day interaction (recommendations sent + reactions + comments, equal weight, alphabetical tie-break). New `getRankedCovenfolk` query. Reuses `filterCovenMembers` from #29 + `BottomSheet` from #28. Chips navigate to `/p/<username>`. Page scales gracefully past ~5 covenfolk. | `2026-05-02-coven-page-chip-rework-design.md` |
```

Update `CLAUDE.md` "Last updated" + "Last shipped" to mention #34.

Update `docs/roadmap.md` count line (33 → 34).

- [ ] **Step 2: Commit + push**

```bash
git add CLAUDE.md docs/sub-project-history.md docs/roadmap.md
git commit -m "docs: note sub-project #34 — coven page chip rework"
git push -u origin feature/coven-chip-rework
```

(Branch was created during spec stage as `feature/coven-chip-rework-spec` — implementer either renames the branch or starts fresh. If fresh: rebase the spec commit onto a new `feature/coven-chip-rework` branch.)

- [ ] **Step 3: Open PR**

```bash
gh pr create --title "feat(coven): chip rework + search + see-all sheet (sub-project #34)" --body-file /tmp/pr-body-34.md
```

PR body template:

```markdown
## Summary

Sub-project #34 — replaces /coven's left-pane card grid with a top-4 chip row + search + "See all (N)" BottomSheet. Page scales gracefully past ~5 covenfolk; smaller covens still feel right (1–4 = chips only, no search/see-all).

- **`getRankedCovenfolk`** (new query) scores each coven mate by 90-day interaction: recommendations sent + reactions on their activity + comments on their activity. Equal weights. Alphabetical tie-break.
- **`<CovenChipRow>`** — client component, renders top 4 chips + search input + inline results + "See all (N)" trigger. Reuses `filterCovenMembers` helper from sub-project #29.
- **`<CovenSeeAllSheet>`** — `BottomSheet`-based fullscreen modal with the full ranked roster, scrollable. Compact rows (avatar + username + Leave) tap-to-navigate to `/p/<username>`.
- **No schema, no migration, no new deps.** "Find People" right pane untouched.

## Test plan

- [x] `cd app && npm run typecheck` — clean
- [ ] `npx vitest run tests/queries/coven-interactions.test.ts` — 4 specs (env-skipIf-gated)
- [ ] Manual smoke on Vercel preview while signed in: open `/coven`. Verify chip row + search + see-all behave per the spec's empty-case table (0 / 1–4 / 5+ covenfolk). Verify chip taps navigate to /p/<username>. Verify search filters to substring matches and shows "No covenfolk match." for misses. Verify "See all" opens a BottomSheet with the full roster in score order.
```

- [ ] **Step 4: Merge + sync + deploy**

```bash
gh pr merge <pr-number> --squash --delete-branch
git checkout master && git pull --rebase origin master
npx vercel deploy --prod --yes
```

From repo root.

---

## Notes for the implementer

- **Total tasks: 5.** Small project. Tasks 1–3 are independent (query + two components); Task 4 wires them in; Task 5 closes out.
- **`getRankedCovenfolk` runs four queries** (one for coven members + three for signals). At expected scale (~tens of covenfolk × ~hundreds of interactions in 90 days) this is fine. If a profile load on /coven becomes slow, look here first.
- **`CovenCompactRow`** is exported from `CovenChipRow.tsx` and reused by `CovenSeeAllSheet.tsx`. Same row in both surfaces.
- **`BottomSheet` props.** Read `app/components/BottomSheet.tsx` to confirm the prop signature — `title` accepts ReactNode (widened in #25). Pass a string here.
- **Mobile.** The page already stacks at 720px via `.stackable`. Chip row + search are mobile-friendly by construction (chips wrap, search is full-width). No new mobile breakpoint logic.
