# Comments Bottom Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline `<ActivityCommentThread />` with a bottom-sheet UX. Tapping the comment button on a feed row opens a sheet (modal-on-desktop, bottom-up sheet-on-mobile) containing the thread + composer. Feed rows stop expanding inline.

**Architecture:** Reuse existing `BottomSheet.tsx`. Split `ActivityCommentThread.tsx` into a presentational `<CommentList />` and a `<CommentComposer />`. New `<CommentSheet />` orchestrates the two inside a `BottomSheet`. `<CommentButton />` and `<ActivityFooter />` swap their `expanded` state for `sheetOpen`. URL deep-link contract (`?activity=<id>`) preserved — auto-opens the sheet on the matching row.

**Tech Stack:** Next.js 15 App Router, TypeScript, React client components, Vitest (no new tests required — UI refactor with no schema/server-action changes; manual smoke test).

**Spec:** `docs/superpowers/specs/2026-05-01-comments-bottom-sheet-design.md`.

---

## File Structure

**New files:**
- `app/components/CommentList.tsx` — presentational thread list. Renders `CommentItem[]`, fires delete callback per row.
- `app/components/CommentComposer.tsx` — input + Post button + char counter + error display. Owns no data fetching, no server actions — pure controlled component.
- `app/components/CommentSheet.tsx` — wraps `BottomSheet` + `CommentList` + `CommentComposer`. Owns optimistic `items` state, calls server actions, broadcasts count changes via `onCountChange` prop.

**Modified files:**
- `app/components/CommentButton.tsx` — rename `expanded`/`onToggle` → `open`/`onOpen`. Aria labels match.
- `app/components/activity/ActivityFooter.tsx` — `expanded` → `sheetOpen`. Render `<CommentSheet />` instead of `<ActivityCommentThread />`. Auto-open-on-mount logic targets `sheetOpen`.
- `app/app/globals.css` — minor: add `.comment-sheet-list` + `.comment-sheet-composer` styles if needed for the sticky-footer-above-keyboard behavior. May not need changes if existing `.bottom-sheet-body` works.

**Deleted files:**
- `app/components/ActivityCommentThread.tsx` — its render code splits into `CommentList` + `CommentComposer`; its state/handlers move into `CommentSheet`.

**Untouched:**
- `app/lib/actions/activity-comments.ts` (server actions unchanged)
- `app/lib/queries/activity-comments.ts` (read helpers unchanged)
- `app/lib/queries/activity.ts` (`comments.items` and `comments.count` shape unchanged)
- `db/migrations/*` (no schema changes)
- `app/components/BottomSheet.tsx` (reused as-is)
- `app/components/CommentButton.tsx` icon SVG (only the prop names change)

---

## Task 1: Create `<CommentList />`

**Files:**
- Create: `app/components/CommentList.tsx`

- [ ] **Step 1: Implement the component**

Extract the rendering loop from `ActivityCommentThread.tsx:107-150`. Pure presentation — receives items, viewer id, actor id, and a delete callback.

```tsx
"use client";

import Link from "next/link";
import Avatar from "./Avatar";
import { relativeTime } from "./activity/relativeTime";
import type { CommentItem } from "@/lib/queries/activity-comments";

interface Props {
  items: CommentItem[];
  viewerId: string | null;
  actorUserId: string;
  onDelete: (id: string) => void;
}

export default function CommentList({ items, viewerId, actorUserId, onDelete }: Props) {
  if (items.length === 0) {
    return (
      <div style={{ padding: "24px 0", fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", textAlign: "center" }}>
        No comments yet. Be the first.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map(c => {
        const canDelete = viewerId !== null && (viewerId === c.user_id || viewerId === actorUserId);
        return (
          <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13 }}>
            <Avatar
              name={c.user.display_name ?? c.user.username}
              color="var(--accent)"
              size={26}
              url={c.user.avatar_url}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div>
                <Link href={`/p/${encodeURIComponent(c.user.username)}`} style={{ color: "var(--void)", fontWeight: 700 }}>
                  @{c.user.username}
                </Link>{" "}
                <span style={{ wordBreak: "break-word" }}>{c.body}</span>
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{relativeTime(c.created_at)}</div>
            </div>
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(c.id)}
                aria-label="Delete comment"
                className="caps"
                style={{
                  background: "transparent",
                  border: "1px solid var(--muted)",
                  color: "var(--muted)",
                  cursor: "pointer",
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 9,
                  letterSpacing: "0.08em",
                }}
              >
                Delete
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

Note: text colors flip from `var(--bone)` (dark feed background) to `var(--void)` because the bottom sheet body is `var(--bone)`.

- [ ] **Step 2: Verify**
  - File compiles standalone (it will until Task 4 wires it in; that's fine)
  - `npm run typecheck` clean

---

## Task 2: Create `<CommentComposer />`

**Files:**
- Create: `app/components/CommentComposer.tsx`

- [ ] **Step 1: Implement the component**

Extract the composer JSX from `ActivityCommentThread.tsx:151-167`. Pure controlled component — no server action calls, no optimistic state. Parent (`CommentSheet`) handles submission.

```tsx
"use client";

import { useState } from "react";

const MAX_LEN = 140;

interface Props {
  pending: boolean;
  error: string | null;
  onSubmit: (body: string) => void;
}

export default function CommentComposer({ pending, error, onSubmit }: Props) {
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();
  const overLimit = trimmed.length > MAX_LEN;
  const canPost = trimmed.length > 0 && !overLimit && !pending;

  function submit() {
    if (!canPost) return;
    onSubmit(trimmed);
    setDraft("");
  }

  return (
    <div
      style={{
        borderTop: "1px solid var(--muted)",
        paddingTop: 12,
        marginTop: 12,
        paddingBottom: "env(keyboard-inset-height, 0px)",
        background: "var(--bone)",
      }}
    >
      {error && (
        <div style={{ fontSize: 11, color: "var(--blood)", marginBottom: 8, fontFamily: "var(--font-serif)", fontStyle: "italic" }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && canPost) { e.preventDefault(); submit(); } }}
          placeholder="Add a comment…"
          maxLength={MAX_LEN + 1}
          style={{
            flex: 1,
            fontSize: 14,
            padding: "10px 12px",
            background: "var(--void-2)",
            color: "var(--bone)",
            border: "1px solid var(--muted)",
          }}
        />
        <span style={{ fontSize: 10, color: overLimit ? "var(--accent)" : "var(--muted)", minWidth: 38, textAlign: "right" }}>
          {trimmed.length}/{MAX_LEN}
        </span>
        <button type="button" className="btn btn-sm" onClick={submit} disabled={!canPost}>
          {pending ? "…" : "Post"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**
  - `npm run typecheck` clean

---

## Task 3: Create `<CommentSheet />`

**Files:**
- Create: `app/components/CommentSheet.tsx`

- [ ] **Step 1: Implement the component**

Owns the optimistic items state + server-action wiring. Reuses the post/delete logic from `ActivityCommentThread.tsx:33-81`. Wraps `BottomSheet` and renders `CommentList` + `CommentComposer` inside.

```tsx
"use client";

import { useState, useTransition } from "react";
import BottomSheet from "./BottomSheet";
import CommentList from "./CommentList";
import CommentComposer from "./CommentComposer";
import { addActivityComment, deleteActivityComment } from "@/lib/actions/activity-comments";
import type { CommentItem } from "@/lib/queries/activity-comments";

interface Props {
  open: boolean;
  onClose: () => void;
  activityId: string;
  actorUserId: string;
  viewerId: string | null;
  initialItems: CommentItem[];
  onCountChange: (n: number) => void;
}

export default function CommentSheet({
  open, onClose, activityId, actorUserId, viewerId, initialItems, onCountChange,
}: Props) {
  const [items, setItems] = useState<CommentItem[]>(initialItems);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function postComment(body: string) {
    if (!viewerId) return;
    setError(null);
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: CommentItem = {
      id: tempId,
      user_id: viewerId,
      user: { username: "...", display_name: null, avatar_url: null },
      body,
      created_at: new Date().toISOString(),
    };
    setItems(prev => {
      const next = [...prev, optimistic];
      onCountChange(next.length);
      return next;
    });
    startTransition(async () => {
      const result = await addActivityComment(activityId, body);
      if (result.ok) {
        setItems(prev => prev.map(c => c.id === tempId ? result.comment : c));
      } else {
        setItems(prev => {
          const next = prev.filter(c => c.id !== tempId);
          onCountChange(next.length);
          return next;
        });
        setError(result.error);
      }
    });
  }

  function removeComment(id: string) {
    const prev = items;
    setItems(p => {
      const next = p.filter(c => c.id !== id);
      onCountChange(next.length);
      return next;
    });
    startTransition(async () => {
      const result = await deleteActivityComment(id);
      if (!result.ok) {
        setItems(prev);
        onCountChange(prev.length);
        setError(result.error);
      }
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`Comments · ${items.length}`}>
      <div style={{ display: "flex", flexDirection: "column", maxHeight: "70dvh" }}>
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
          <CommentList
            items={items}
            viewerId={viewerId}
            actorUserId={actorUserId}
            onDelete={removeComment}
          />
        </div>
        {viewerId !== null ? (
          <CommentComposer pending={pending} error={error} onSubmit={postComment} />
        ) : (
          <div style={{ padding: "12px 0", fontSize: 12, color: "var(--muted)", fontStyle: "italic", borderTop: "1px solid var(--muted)" }}>
            Sign in to comment.
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
```

Notes:
- The `BottomSheet` already handles scroll-lock, escape-to-close, and `dvh` sizing. We don't repeat that here.
- The 70dvh cap on the inner column leaves room for the sheet's own header + drag handle within the 90dvh outer cap.
- We do **not** add a `?comments=open` URL parameter. Sheet state is component-local.

- [ ] **Step 2: Verify**
  - `npm run typecheck` clean

---

## Task 4: Update `<CommentButton />` prop names

**Files:**
- Modify: `app/components/CommentButton.tsx`

- [ ] **Step 1: Rename props**

Change `expanded` → `open` and `onToggle` → `onOpen`. Aria labels updated accordingly. Visual styling unchanged.

```tsx
"use client";

import { compactCount } from "@/lib/format";

interface Props {
  count: number;
  open: boolean;
  onOpen: () => void;
}

function SpeechIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 18 16" width="16" height="14" aria-hidden="true">
      <path
        d="M2 2 L16 2 L16 11 L9 11 L5 14 L5 11 L2 11 Z"
        fill={filled ? "var(--accent)" : "none"}
        stroke={filled ? "var(--accent)" : "var(--muted)"}
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export default function CommentButton({ count, open, onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`heart-btn ${open ? "heart-liked" : ""}`}
      aria-label="Open comments"
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <SpeechIcon filled={open} />
      {count > 0 && (
        <span className="heart-count" style={{ pointerEvents: "none" }}>{compactCount(count)}</span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Verify**
  - File compiles
  - `npm run typecheck` will fail at `ActivityFooter.tsx` until Task 5 — expected

---

## Task 5: Wire `<CommentSheet />` into `<ActivityFooter />`

**Files:**
- Modify: `app/components/activity/ActivityFooter.tsx`

- [ ] **Step 1: Replace inline thread with sheet**

Swap `expanded` → `sheetOpen`. Replace `<ActivityCommentThread />` with `<CommentSheet />`. Drop the `onCollapse` callback (sheet has its own close affordances). Auto-open-on-URL-match preserved.

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { EnrichedActivity } from "@/lib/queries/activity";
import HeartButton from "../HeartButton";
import CommentButton from "../CommentButton";
import CommentSheet from "../CommentSheet";
import { relativeTime } from "./relativeTime";
import { createClient } from "@/lib/supabase/client";

interface Props {
  item: EnrichedActivity;
}

export default function ActivityFooter({ item }: Props) {
  const params = useSearchParams();
  const focusedId = params?.get("activity");
  const [count, setCount] = useState(item.comments.count);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);

  // Pull viewer once on mount via cached session (no network round-trip).
  useEffect(() => {
    const c = createClient();
    c.auth.getSession().then(({ data }) => setViewerId(data.session?.user?.id ?? null));
  }, []);

  // Auto-open the sheet when this row matches `?activity=<id>` on /home.
  useEffect(() => {
    if (focusedId && focusedId === item.id) setSheetOpen(true);
  }, [focusedId, item.id]);

  return (
    <>
      <div className="activity-footer">
        <span className="activity-footer-time" style={{ fontFamily: "var(--font-ui)", color: "var(--muted)" }}>{relativeTime(item.created_at)}</span>
        <CommentButton count={count} open={sheetOpen} onOpen={() => setSheetOpen(true)} />
        <HeartButton
          activityId={item.id}
          initialCount={item.reactions.count}
          initialLikedByMe={item.reactions.likedByMe}
        />
      </div>
      <CommentSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        activityId={item.id}
        actorUserId={item.actor.id}
        viewerId={viewerId}
        initialItems={item.comments.items}
        onCountChange={setCount}
      />
    </>
  );
}
```

Note: the sheet is rendered unconditionally (with `open={false}` when closed). That's fine — `BottomSheet` early-returns `null` internally when `!open`, so nothing reaches the DOM and there's no perf cost.

- [ ] **Step 2: Verify**
  - `npm run typecheck` clean (now the `CommentButton` rename consumer is happy)

---

## Task 6: Delete `ActivityCommentThread.tsx`

**Files:**
- Delete: `app/components/ActivityCommentThread.tsx`

- [ ] **Step 1: Verify no remaining imports**
  ```bash
  grep -rn "ActivityCommentThread" app/ --include="*.ts" --include="*.tsx"
  ```
  Expected output: empty.

- [ ] **Step 2: Remove the file**
  ```bash
  rm app/components/ActivityCommentThread.tsx
  ```

- [ ] **Step 3: Verify**
  - `npm run typecheck` clean
  - `npm test` passes

---

## Task 7: Manual smoke test

- [ ] **Step 1: Start dev server**
  ```bash
  cd app && npm run dev
  ```

- [ ] **Step 2: Test the golden path**
  1. Navigate to `/home` while signed in
  2. Tap the comment icon on a feed row → sheet rises from the bottom
  3. Type a comment → tap Post → optimistic row appears immediately, settles to server data
  4. Tap delete on your own comment → row disappears, count decrements on the feed-row badge
  5. Tap backdrop → sheet closes
  6. Tap drag handle (mobile) → sheet closes
  7. Press Escape (desktop) → sheet closes

- [ ] **Step 3: Test the deep-link contract**
  1. Navigate to `/home?activity=<some-real-activity-id>` directly
  2. Sheet for that row opens automatically on mount
  3. Closing the sheet does not navigate; URL is unchanged (we deliberately do not strip the param)

- [ ] **Step 4: Test the iOS PWA case**
  1. Open the app via the iOS PWA standalone install
  2. Open a comment sheet
  3. Tap the input — keyboard rises; composer footer sits above it
  4. Post a comment from the keyboard's Return key
  5. Close the sheet — page scroll position is restored to where the user was

- [ ] **Step 5: Test signed-out**
  1. Sign out
  2. Navigate to `/home` (anon view if accessible) or any public page with feed rows
  3. Tap comment icon → sheet opens, composer reads "Sign in to comment."
  4. Existing comments are visible; delete pills are hidden

---

## Verification

- [ ] `cd app && npm run typecheck` — clean
- [ ] `cd app && npm test` — all existing tests pass; no new tests added
- [ ] Manual smoke per Task 7 — all steps green
- [ ] No console errors in browser devtools during the smoke test

---

## Open follow-ups (not in this PR)

Carried from spec, all out of scope here:
- Threaded replies
- Comment editing
- @-mentions / markdown
- Email notifications for comments
- Comments on grouped feed rows (`watchlist_added` group)
- Comment pagination (>20 comments per row)
- Spam reporting
- Multi-snap-detent sheets
- Per-comment reactions
- Read-only inline preview before opening the sheet (1–2 comments inline + "View all")

---

## Out of scope, but worth flagging

- **CSS for `.bottom-sheet-body` may need `padding-bottom: 0`** if the existing rule applies bottom padding that fights `env(keyboard-inset-height)`. Check `app/app/globals.css` for `.bottom-sheet-body` and adjust only if iOS keyboard testing reveals overlap.
- **The `?activity=<id>` query param is not stripped on close.** Acceptable for v1 (refresh re-opens the sheet, which is benign). If we want sticky URL hygiene later, push to `pathname` without the param on `onClose`.
