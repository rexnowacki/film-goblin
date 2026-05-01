# Comments bottom sheet — sub-project 25 design

**Date:** 2026-05-01
**Status:** spec

## Problem

Activity comments today expand **inline** beneath the feed row that owns them. On mobile (and especially on iOS PWA standalone, where most usage actually happens) this has compounding problems:

1. **The row you tapped scrolls out of view.** Inline expansion pushes everything below the row down. The user taps "comment" to read or post, and the row's header / actor / context disappears off the top of the viewport.
2. **The keyboard hides the input.** When the inline composer focuses, iOS pushes content up so the input clears the keyboard, but the surrounding thread context is now jammed against the top of the viewport. On a long thread the user is typing into a sliver.
3. **Long threads bloat the feed.** A row with 8 comments is 8× taller than its neighbors. Scroll rhythm breaks.
4. **The interaction model is fragile.** PR #71 already had to fix a Post-button race (`getUser()` network call vs. fast tap). The deferred-thread auto-expand-on-deep-link logic in `/home` adds further state surface.

Inline commenting works on a desktop reader-first product. It does not work on a feed-first mobile product.

## Decision

Replace the inline thread with a **bottom sheet** opened from the existing `<CommentButton />`. The thread lives inside the sheet; the feed row stays put.

Single sheet behavior on all viewports — no mobile/desktop branch. (Bottom sheet on desktop is fine; we already render `LikersBottomSheet` that way and it reads as a clean modal.)

### Why bottom sheet, not modal

| | Bottom sheet | Modal |
|---|---|---|
| iOS PWA feel | Native; matches Twitter/Bluesky/IG | Foreign; desktop pattern |
| Keyboard handling | Sheet sits above keyboard via `env(keyboard-inset-height)` | iOS scrolls the modal around; cursor escapes |
| Context preservation | Feed visible behind dimmed backdrop | Feed gone |
| Existing primitive | `BottomSheet.tsx` already shipped | Would need new chrome |

### Sheet anatomy

```
┌─────────────────────────────────────┐
│  ▔▔                                  │  drag handle
│                                      │
│  Comments · 4                        │  caps eyebrow
│  ─────────────────────────────────── │
│                                      │
│  @goblin · 2h                        │  scrollable thread list
│  Wow.                       [delete] │  (own rows show delete pill)
│  ─────────────────────────────────── │
│  @witch · 1h                         │
│  felt that.                          │
│  ...                                 │
│                                      │
│ ─────────────────────────────────── │
│ [ Add a comment...           ] [Post]│  sticky footer above keyboard
└─────────────────────────────────────┘
       (backdrop dims feed; tap to dismiss)
```

- `max-height: 90dvh`, content-sized below that. Single open/closed state — no multi-snap detents.
- Body: `var(--bone)`. Chrome: void hairline borders. Matches existing `BottomSheet` aesthetic.
- Thread list scrolls inside the sheet. Footer (input + Post) is sticky, padded with `env(keyboard-inset-height, 0px)`.
- Dismiss: tap backdrop, drag handle down, or system back gesture.
- Always-visible composer at the bottom — not a "tap to expand" affordance. One less tap to post; matches Twitter/Bluesky.

## Component shape

- **`<CommentSheet activityId, viewerUserId, open, onClose />`** — new. Owns the open/close, fetches the thread, holds optimistic state.
- **`<CommentList comments, viewerUserId, onDelete />`** — extracted from current `ActivityCommentThread`'s render half. Pure presentation.
- **`<CommentComposer onSubmit, pending, error />`** — extracted likewise. Single-line input, 140-char counter on focus, Post disabled when empty/pending.
- **`<CommentButton />`** — same component, same placement on `<ActivityFooter />`. Click handler changes from `setExpanded(true)` to `setSheetOpen(true)`.
- **`<BottomSheet />`** — reused unchanged.

Optimistic count update: when the sheet posts/deletes, it broadcasts the new count back through a callback prop on `<CommentButton />` so the feed-row badge stays in sync without waiting for the next `revalidatePath`.

## Interaction details

### Loading + empty + error
- Sheet opens **immediately** with 3 ghost rows (skeleton). Comments fetch in parallel. Avoids a "tap → blank sheet → 500ms → content" flash.
- Empty state: italic muted "No comments yet. Be the first."
- Post failure: input text preserved, blood-outline error pill above the input. No auto-dismiss.

### Deep-link contract
Today: `/home?activity=<id>` auto-expands the inline thread on mount.
After: same URL, same handler — but it sets `sheetOpenForActivity = <id>` instead of `expandedActivityId`. The targeted `<CommentButton />` reads that and opens its sheet on mount. Notification bell deep-links keep working without callsite changes.

### Sheet routing
The sheet is component-level state, not a real Next route. No `?comments=open` URL parameter. (Mirrors `LikersBottomSheet` / `NotificationsDropdown`'s mobile sheet.) iOS back gesture closes the sheet via `popstate` if we want to be polite about it, but v1 can simply use the existing tap-backdrop-to-close.

### Composer behavior on submit
Optimistic insert: comment row renders immediately at the bottom of the list with a faint pending opacity until the server action resolves. Same pattern `ActivityCommentThread` uses today — extracted intact.

## What stays the same

- DB schema (`activity_comments` table + RLS policies)
- Server actions (`addComment`, `deleteComment`)
- Notification trigger (`comment_on_activity`)
- 140-char limit
- Flat threading (no replies)
- Self-delete-only authorization
- Optimistic-insert UX

## What gets removed

- `ActivityCommentThread.tsx` as a single component — split into `<CommentList />` + `<CommentComposer />` consumed by the sheet
- The expanded/collapsed inline state machine inside that component
- The `expanded` prop wiring through `FeedRow` → `ActivityFooter`
- Auto-expand-on-mount logic in `/home/page.tsx` — replaced by sheet auto-open with the same query param contract
- The "Hide" pill (sheet has its own dismiss via backdrop / drag / back gesture)

## Open follow-ups (deferred from prior sessions, not v1 scope)

Carried forward from CLAUDE.md unchanged:
- Threaded replies
- Comment editing
- @-mentions / markdown
- Email notifications for comments
- Comments on grouped feed rows
- Comment pagination
- Spam reporting

## Out of scope for this PR

- Multi-snap-detent sheets (half-height + full-height bottom-sheet pattern). Single-state suffices for a 140-char comment thread.
- Reactions on individual comments. Activity reactions exist on the row; per-comment reactions are a separate sub-project.
- Read-only "view comments" preview row inline before opening the sheet (e.g. show the first 1–2 comments inline + "View all"). Defensible feature; deliberately deferred to keep v1 a clean swap. Watch usage.
- Desktop-specific layout (e.g. side-rail thread). Single sheet on all viewports for v1.

## Migrations

None. Pure UI refactor.

## Why one PR (not two)

- No DB or schema change; everything is component-level
- The inline path and the sheet path can't coexist cleanly — the `expanded` state and the `sheetOpen` state conflict on the same trigger button. Cleanest swap is atomic.
- Blast radius is bounded: comments are non-critical; if the sheet has a bug, no commenting is the worst case (not "no one can sign in")
