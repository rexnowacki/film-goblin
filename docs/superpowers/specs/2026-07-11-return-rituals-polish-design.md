# Return Rituals Polish — Design

**Date:** 2026-07-11
**Status:** Approved by owner request
**Sub-project:** Finish daily NEXT IN THE PIT browsing, add a durable Gazings index, and remove cancelled gazings from active surfaces without deleting history.

## Problem

Three connected pieces of the Return Rituals loop are incomplete:

1. NEXT IN THE PIT wraps forever after all five cards have been reviewed. Its IntersectionObserver records analytics, but no durable UI-completion state exists.
2. Gazings have token detail pages but no collection page. A user can lose an explicit invite until a later reminder because there is no persistent place to find every visible gazing.
3. Cancelling updates `gazing_invites.status`, but frozen `gazing_invited` / `gazing_attending` activity rows still render, and the cancelled token page still exposes RSVP.

The existing Return Rituals design deliberately retains cancelled invite and RSVP history. “Removed” therefore means absent from active discovery, navigation, prompts, and join actions—not hard-deleted from the database.

## Decision summary

| Decision | Choice |
|---|---|
| Queue completion | Local UI progress stored per authenticated user and UTC day |
| When a card counts as reviewed | When the user leaves it by arrow/swipe or activates its primary action—not on initial visibility |
| New same-day candidate | Reopens the queue if its key has not been reviewed |
| Gazings home | Authenticated `/coven/gazings` collection page |
| Entry points | `Your Gazings` in the account menu plus a prominent Coven-page CTA |
| Cancelled history | Preserve direct token tombstone and source rows |
| Cancelled active surfaces | Exclude from Gazings index and `/home` enrichment; hide/reject RSVP |
| Database hardening | Mig 0220 makes attendee INSERT/DELETE/UPDATE status-aware while preserving aftermath confirmation |

## 1. Daily queue completion

Add a pure progress helper backed by injected storage. Store `{ utcDay, reviewedKeys }` under a key namespaced by authenticated user ID **and UTC day**, so an older open tab cannot overwrite the next day's record. Storage errors fail open; an in-memory set still completes the current mount and is merged across same-user/same-day server revalidation.

The home server component captures one `now`, uses it for queue resolution and derives the same UTC day key passed to `NextInThePit`. Browsing away from the active card records that key. If every current key is reviewed, the component unmounts instead of wrapping. Activating the card CTA records it before navigation. On reload, the queue starts at the first unseen key or stays hidden if all current keys were reviewed. A newly resolved key is not in progress and reopens the module, protecting urgent gazings.

The existing IntersectionObserver remains analytics-only. Using it as completion state would make the fifth card disappear immediately upon rendering and would auto-hide a one-card queue before the user could act.

## 2. Gazings index and access

Add `/coven/gazings`, authenticated and force-dynamic. It reads explicit `gazing_invites` columns through the viewer client; existing RLS already limits rows to hosted, explicitly invited, RSVP’d, or eligible coven-broadcast gazings. The query explicitly excludes `cancelled` and splits the remaining rows into:

- **Open gazings:** future scheduled sessions, soonest first.
- **Aftermath:** happened or overdue scheduled sessions, newest first.

Reuse batched gazing roster hydration for `HOSTING`, `YOU’RE IN`, and `SUMMONED` state plus compact attendee avatars. Add `Your Gazings` to `UserMenu` and a visible `Your gazings →` CTA beside the Coven social promise. Keep the four-slot bottom navigation and existing desktop primary nav unchanged.

The existing theatrical share flow is a private bearer link: the server can identify the invite by its high-entropy token, but a first-time recipient is not yet visible to participant RLS. On the recipient's first authenticated RSVP, the server action validates the token, scheduled state, and non-host user, then idempotently materializes that bearer as a `gazing_invitees` participant through service role. The actual attendee read/write remains on the viewer client, so mig 0220 still enforces status and unrelated users still cannot write directly.

Player-facing copy stays clear with light goblin register: “Your Gazings.”, “Every watch night you host, join, or still need to answer.”, and “No gazings are gathering yet.”

## 3. Cancellation invariant

Do not delete `gazing_invites`, `gazing_attendees`, `gazing_invitees`, or `activity` rows. Activity deletion would cascade through comments/reactions and erase discussion history.

Instead:

- Batch-hydrate live invite status for both gazing activity kinds and omit cancelled or RLS-invisible rows during feed enrichment. This applies to initial and paginated `/home` reads.
- Exclude cancelled rows in the Gazings index query. The second live-status hydration is authoritative during query races: missing rows are dropped, and a scheduled→happened transition moves to Aftermath.
- Hide already-emitted reminder/aftermath notifications when their gazing is cancelled or no longer RLS-visible. Stored notification rows and RSVP-history notifications remain intact.
- Hide RSVP UI on non-scheduled token pages.
- Reject `_toggleGazingRsvp` unless the invite is scheduled.
- Close with a scheduled-status compare-and-swap so two terminal actions cannot overwrite one another. Attendance confirmation performs that scheduled→happened transition **before** writing attendance, so a concurrent cancellation cannot leave confirmed attendance on a cancelled row; a later attendee-write failure is safely retryable against `happened`.
- Mig 0220 makes attendee mutations status-aware: RSVP INSERT/DELETE stays scheduled-only; attendance INSERT/UPDATE remains available for the scheduled/happened aftermath path; cancelled rows reject every mutation. Host-after-happened confirmation remains valid.
- After host cancellation, replace the token page with `/coven/gazings`; old shared links continue to render the cancelled tombstone.
- Revalidate `/coven/gazings` from every create/RSVP/close/attendance mutation wrapper.

NEXT IN THE PIT and reminder jobs already filter by live status and need no cancellation change.

## 4. Testing

- Pure progress tests: same-day persistence, UTC reset, account isolation, corrupt/unavailable storage, first-unseen resume, new-key reopening, and completion.
- Query tests: cancelled Gazings rows are excluded and sections sort correctly.
- Feed/roster tests: status is hydrated; scheduled rows render and cancelled/missing rows are omitted; hydrated status wins a read race.
- Action tests: token bearers become invitees before a viewer-scoped RSVP; cancelled RSVP/attendance writes reject; terminal close is compare-and-swap.
- Notification tests: cancelled/missing reminder and aftermath rows disappear from recent/unread results without deleting history.
- Real-Postgres RLS tests: direct token-only writes stay denied, a server-mediated claim unlocks participant access, cancelled INSERT/DELETE/UPDATE is denied while history remains, and host attendance after `happened` still works.
- App full suite, typecheck, production build; DB pg-mem smoke, typecheck, and testcontainers RLS suite/CI.
- Manual mobile/desktop pass: discover index from Coven/account menu, cancel returns to index, cancelled card disappears from index/feed, old token shows tombstone without RSVP, queue collapses after reviewing every current card and reopens for a new key.

## Rollout

Migration first, then app. The old app tolerates the tighter attendee INSERT policy; the new app also guards in UI/action code, but applying the policy first closes the direct-client bypass before the new surface ships. No generated type change is needed.

## Out of scope

- Hard-deleting cancelled gazing history.
- Adding a fifth bottom-nav tab or another desktop primary-nav item.
- Notifications at explicit-invite creation time.
- Cross-device synchronization of NEXT IN THE PIT review progress.
