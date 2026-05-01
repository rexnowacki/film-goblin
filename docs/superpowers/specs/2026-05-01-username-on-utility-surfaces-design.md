# Username on utility surfaces; display_name only on profile h1

**Date:** 2026-05-01
**Status:** Spec
**Sub-project:** #26

## Background

Comments now show username (sub-project #25 PR #84). Looking around, ~46 other render sites in the codebase use the pattern `display_name ?? username` to render a person's name. This produces an inconsistent experience: a user named "Tony T." (display_name) shows as "Tony T." on a feed row but "teethtony" (username) on a comment.

PR #65 (sub-project #21) already dropped display_name from the signup form — new users have `display_name = username` via the `on_auth_user` trigger's COALESCE. Existing users may still have a custom display_name set via /settings.

## Goal

Standardize on **username** for all utility surfaces. Reserve **display_name** for one specific place: the user's own profile page h1 (`/p/[username]`). This is the only surface where a "human-friendly" custom name adds real value.

This is a UI-only change. No schema, no migration, no types change. The `display_name` column stays. The `/settings` "Display name" input stays editable.

## Scope decisions (locked during brainstorming)

| Decision | Choice | Reason |
|---|---|---|
| `display_name` rendering on utility surfaces | Drop the fallback chain; render bare `username` | Single rule, no per-surface ambiguity |
| `Avatar name={...}` prop on utility surfaces | Same — pass `username` | Keeps fallback initial letter consistent with the text rendered below |
| `/p/[username]` h1 + main avatar | Keep `display_name ?? username` | The one place a human-friendly name is meaningful |
| `/settings` Display name input | Keep editable | Users can still customize their h1 — feature stays a real concept |
| `/settings` user-avatar preview | Keep `display_name ?? username` | Consistent with the input they're editing on the same screen |
| `/admin/users/*` Display name field | Keep as-is (labeled field showing `display_name`) | Admin needs full record visibility |
| `<RecommendModal>` viewer-displayName plumbing | Leave the prop name; not a render decision | Cosmetic at most |
| `ActivityFooter` → `CommentSheet` `viewerDisplayName` prop | Leave the prop plumbing alone | Drives an Avatar `name` fallback initial; passing display_name or username yields the same letter for default users |

## Non-goals

- No `display_name` column drop. (Open path for future, but not this work.)
- No backfill that nukes custom display_names. (User can still set one in /settings.)
- No changes to system-notification fallbacks (`?? "Someone"`, `?? "System"` in NotificationRow — those handle a missing `actor` row, unrelated to display_name).
- No changes to admin surfaces.

## Files affected

**Flipping** (~17 files, ~32 individual edits — both rendered text and `Avatar name={...}` prop on each surface):

Activity feed components (10):
- `app/components/activity/ActivityWatchlistAdded.tsx`
- `app/components/activity/ActivityWatchLogged.tsx`
- `app/components/activity/ActivityRecommendationSent.tsx`
- `app/components/activity/ActivityListCreated.tsx`
- `app/components/activity/ActivityListFilmAdded.tsx`
- `app/components/activity/ActivityReviewPublished.tsx`
- `app/components/activity/ActivityCovenJoined.tsx` (two name renders: actor + other)
- `app/components/activity/ActivityLibraryAdded.tsx`
- `app/components/activity/ActivityWatchlistAddedGroup.tsx`
- `app/components/activity/ActivityWatchLoggedGroup.tsx`

Other components (5):
- `app/components/LikersBottomSheet.tsx` (lines 22, 27)
- `app/components/SearchPersonRow.tsx` (lines 64, 67)
- `app/components/TopNavChrome.tsx` (line 56) — drop the `display_name` part of the chain. Keep `?? "You"` final fallback (renders before profile loads).
- `app/components/notifications/NotificationRow.tsx` (lines 36, 78) — drop `display_name` part. Keep `?? "Someone"` fallback (system notifications have no actor).
- `app/components/notifications/NotificationGroupRow.tsx` (lines 16, 76) — drop `display_name` part. Keep `?? "System"` fallback.

Pages (2):
- `app/app/coven/page.tsx` (lines 80, 91, 124, 132, 144) — invitations + members + the `otherDisplayName` prop on coven actions.
- `app/app/p/[username]/page.tsx` line 88 — coven-member chips on someone else's profile (utility on a profile surface).

**Not changing:**
- `app/app/p/[username]/page.tsx` lines 59 + 64 — main avatar + h1
- `app/app/settings/SettingsForm.tsx` line 159 — user's own avatar preview
- `app/app/admin/users/page.tsx`, `app/app/admin/users/[id]/page.tsx`, `app/app/admin/users/new/CreateUserClient.tsx` — admin surfaces
- `app/components/RecommendModal.tsx` — display_name appears as a prop name only, not in user-visible render
- `app/components/CommentSheet.tsx`, `app/components/CommentList.tsx`, `app/components/activity/ActivityFooter.tsx` — already standardized on username (PR #84)
- `app/lib/queries/*` and `app/lib/actions/*` — query types still select display_name; rendering is the only thing changing
- `app/lib/supabase/types.ts` — no change

## Mechanical replacement rules

For each flipping file:

1. Find every `display_name ?? username` and `display_name || username` expression. Replace the whole expression with the corresponding `username` (still scoped to the same actor/profile/recipient/member object).
2. The `Avatar name={...}` prop on the same line (or nearby) gets the same treatment.
3. Where the original expression was `actor.display_name ?? actor.username`, the result is just `actor.username`.
4. Where there's a longer chain like `actor?.display_name ?? actor?.username ?? "Someone"`, drop the `display_name` link only: `actor?.username ?? "Someone"`. The terminal literal fallback stays.
5. Where the same person is referenced twice in one file (e.g., text + `Avatar name`), both sites get the same edit so the fallback initial matches the rendered text.

## Tests

- `cd app && npm run typecheck` — clean (the type of `profile.username` is `string`, not `string | null`, in all affected query types — verify there are no nullability surprises).
- `cd app && npm test` — clean. No tests assert these specific render strings; nothing should break.
- Manual smoke on Vercel preview after merge: feed rows, /coven, notifications, top-nav user dropdown — all render bare username. /p/[username] h1 still shows display_name. /settings still has the editable Display name input.

## Commit strategy

Two commits for cleaner history:

1. `feat(activity): standardize on username for feed components` — the 10 activity files.
2. `feat(ui): standardize on username for utility surfaces` — everything else (LikersBottomSheet, SearchPersonRow, TopNavChrome, notifications, /coven, /p/[username] coven chips).

Then PR. Squash-merge the PR per repo convention (recent merges all squash).

## Risk

- **Visual regression for users with custom display_names.** A user named "Tony T." (display_name) who has username "teethtony" will see "teethtony" in feed rows, comment threads, etc. Profile h1 stays "Tony T." This is the intended outcome of the rule.
- **Zero schema risk.**
- **Reversibility.** Each edit is a one-line revert. If we change our minds, easy to back out per-surface or wholesale.

## Open questions

None. All scope decisions locked.
