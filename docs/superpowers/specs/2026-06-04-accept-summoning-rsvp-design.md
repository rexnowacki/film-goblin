# Accept a Summoning — RSVP to a Shared Gazing — Design

**Date:** 2026-06-04
**Status:** Approved (design), pending implementation plan
**Scope:** v1 — accept/decline a gazing summon, post an "attending" feed card, show a roster, notify the host

## Summary

The "Summon the coven" feature (shipped 2026-06-03, PR #164) lets a goblin broadcast a Loft
showtime to the coven feed as a `gazing_invited` card linking to `/gazing/[token]`. This adds the
other half: **accepting** a summon.

A logged-in goblin can tap **"I'm in"** on either the `/gazing/[token]` page or the feed summon
card. Accepting:

1. Records an RSVP (one per goblin per invite; reversible — tapping again backs out).
2. Posts a new `gazing_attending` card to the timeline: *"{actor} is attending a ritual gazing of
   {film} — The Loft · Fri 8:30 PM with {host}."*
3. Notifies the host that someone is in.
4. Adds the goblin to a **"who's in"** roster shown on the gazing page and the summon card.

Backing out (toggle off) removes the RSVP and **retracts** the `gazing_attending` card. The host
notification persists as a point-in-time event.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Where you can accept | **Gazing page AND the feed summon card** |
| Reversibility | **Toggle + retract** — un-accepting removes the attendee row and deletes the `gazing_attending` card |
| "Who's in" roster | **Yes** — on both the gazing page and the summon card |
| Notify the host | **Yes** — a `gazing_rsvp` notification to the inviter on accept |
| Emission mechanism | **DB triggers** (consistent with every feed kind, incl. the summon) |
| Host self-RSVP | Rejected — the host is shown as host, not as an acceptor |
| Notification on retract | **Not** retracted — point-in-time "they accepted" event |

## How it fits the existing pattern

Feed kinds are rows in the `activity` table (`kind` enum + jsonb `payload`), emitted by
`AFTER INSERT` triggers on a source table; notifications are rows in `notifications`
(`notification_kind` enum), also emitted by SECURITY DEFINER triggers
(`db/migrations/0126_notification_triggers.sql`). Retraction mirrors the watchlist-delete activity
cleanup (`db/migrations/0168_watchlist_delete_activity_cleanup.sql`). The feed enrichment in
`app/lib/queries/activity.ts` already resolves a "recipient" profile from `payload.to_user_id`
(used by `recommendation_sent`) — we reuse that to render "with {host}". Notifications render per
kind in `app/components/notifications/NotificationRow.tsx`.

`gazing_attendees` is the natural source table, so this stays fully consistent.

## Data model

### `gazing_attendees`

```sql
CREATE TABLE gazing_attendees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id   uuid NOT NULL REFERENCES gazing_invites(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invite_id, user_id)
);
CREATE INDEX gazing_attendees_invite_idx ON gazing_attendees (invite_id);
```

Toggle semantics: an RSVP is the presence of a row. Accept = insert, back out = delete. The
`UNIQUE (invite_id, user_id)` makes a double-tap safe.

**RLS:**
- `SELECT TO authenticated USING (true)` — any logged-in goblin can see who's in. Rosters are
  social, and summons are already coven-broadcast. The gazing page reads rosters via the
  service-role client, so logged-out visitors also see counts.
- `INSERT TO authenticated WITH CHECK (user_id = auth.uid())` — RSVP only as yourself.
- `DELETE TO authenticated USING (user_id = auth.uid())` — back out only your own RSVP.
- No UPDATE.
- `GRANT SELECT, INSERT, DELETE ON gazing_attendees TO authenticated;`

### New enum values

- `activity_kind` gains `'gazing_attending'`.
- `notification_kind` gains `'gazing_rsvp'`.

### `gazing_attending` activity payload

Built by the insert trigger by reading the invite snapshot:

```json
{
  "invite_id":    "<uuid>",
  "film_id":      "<uuid>",
  "token":        "<gazing token>",
  "theater_name": "The Loft Cinema",
  "starts_at":    "2026-06-05T20:30:00-07:00",
  "format_label": "70mm",
  "to_user_id":   "<host = gazing_invites.created_by>"
}
```

`actor_user_id` is the accepting goblin. `to_user_id` (the host) reuses the feed's existing
recipient resolution. `invite_id` lets the retract trigger match precisely.

## Triggers (migration `0201`)

All SECURITY DEFINER, `SET search_path = public`.

1. **`on_gazing_attendee_insert` → activity.** Reads `gazing_invites` by `NEW.invite_id`; inserts
   the `gazing_attending` activity (actor `NEW.user_id`, payload above).
2. **`on_gazing_attendee_insert_notify` → notification.** Inserts a `gazing_rsvp` notification to
   the host (`user_id = invite.created_by`, `actor_user_id = NEW.user_id`, payload
   `{invite_id, film_id, token}`). Skipped when `invite.created_by = NEW.user_id` (defensive — the
   action already blocks host self-RSVP).
3. **`on_gazing_attendee_delete` → retract.**
   ```sql
   DELETE FROM activity
   WHERE actor_user_id = OLD.user_id
     AND kind = 'gazing_attending'
     AND payload->>'invite_id' = OLD.invite_id::text;
   ```

Both insert effects can live in one trigger function or two; the plan will use one function doing a
single invite SELECT then both inserts, to avoid double-reading the invite.

Migration split: `0200_gazing_rsvp_kinds.sql` adds the two enum values (must commit before any
function references them); `0201_gazing_attendees.sql` creates the table, RLS, grants, and triggers.

## Server action — `toggleGazingRsvp(token)`

In `app/lib/actions/gazing.ts` (alongside `createGazingInvite` / `summonCoven`), following the
`_private`/`public` split:

- `requireAuthUser(client)`.
- Resolve the invite by `token` via the service-role client → `{ invite_id, created_by }`. Throw a
  friendly error if the token is unknown.
- If `created_by === user.id`, throw `"You're hosting this gazing"` (the UI hides the button for the
  host, so this is a guard).
- Look up an existing `gazing_attendees` row for `(invite_id, user.id)`. If present → delete
  (back out); else → insert (accept). On a UNIQUE violation during insert, treat as already-in.
- Return `{ attending: boolean }`.
- Public wrapper `revalidatePath`s `/home` and `/gazing/${token}`.

## Surfaces

### Gazing page (`/gazing/[token]`)

- **RSVP toggle** in the hero CTA cluster: `"I'm in 👁"` ↔ `"You're in — tap to back out"`. Auth-gated
  (logged-out → signup preserving intent). For the host, render a `"You're the host"` chip instead of
  the toggle. New client component `GazingRsvpButton` wraps `toggleGazingRsvp`.
- **"Who's in" roster:** host (badged "host") + attendee avatars + count ("3 goblins are in"). Read
  attendees + their profiles via the service-role client the page already uses.

### Feed summon card (`ActivityGazingInvited`)

- The same toggle (a small embedded client button) + a compact roster (avatars + count).
- `getEnrichedActivity` enrichment for `gazing_invited` rows gains an attendee summary
  (`count`, a few avatar profiles) and `viewerIsIn`, batched in the existing `Promise.all` exactly
  like reactions/`likedByMe`. The card stays a server component with the button as a client island.

### New attending card (`ActivityGazingAttending`)

- *"{actor} is attending a ritual gazing of {film} — The Loft · Fri 8:30 PM with {host}."* Reuses
  `formatSummonMeta(theaterName, startsAt, formatLabel)`; poster thumb + links to `/gazing/[token]`.
  Registered in `app/components/activity/ActivityRow.tsx`. The enriched variant is
  `{ kind: "gazing_attending"; film: FilmLite; host: RecipientLite; token: string; theaterName: string; startsAt: string; formatLabel: string | null }`.

### Notifications (TopNav bell)

- New `gazing_rsvp` case in `app/components/notifications/NotificationRow.tsx`:
  *"{actor} is in for your gazing of {film}"* → links to `/gazing/[token]`. The notifications query
  in `app/lib/notifications` enriches the actor + film the same way other kinds do.

## Reuse

- `formatSummonMeta` (`app/lib/gazing/summon-meta.ts`) — the attending card + summon card meta line.
- Film enrichment + recipient (`to_user_id`) resolution in `activity.ts`.
- The service-role invite read already used by the gazing page and `summonCoven`
  (`loadInviteSnapshot` neighbor in `gazing.ts`).

## Error handling

- Host self-RSVP → action throws `"You're hosting this gazing"`; UI prevents the tap.
- Double-tap / race on the toggle → UNIQUE makes insert safe; a unique violation is treated as
  already-in.
- Unknown/inactive token → action throws; the surface toasts a failure.
- Logged-out tap → signup redirect preserving the return path, on both surfaces.
- Back out → retracts the `gazing_attending` card; the host notification persists.

## Testing (vitest + DB/RLS, existing patterns)

- **DB/RLS:** inserting a `gazing_attendees` row creates exactly one `gazing_attending` activity
  (actor = attendee, payload incl. `invite_id` + `to_user_id` = host) and exactly one `gazing_rsvp`
  notification to the host; deleting the row removes the activity but leaves the notification; a user
  cannot insert or delete another user's RSVP; UNIQUE blocks duplicates; a host RSVPing their own
  invite emits no self-notification.
- **Action:** `toggleGazingRsvp` inserts then (on second call) deletes, returning the right
  `attending` boolean; host self-RSVP is rejected; unknown token throws.
- **Enrichment unit:** a `gazing_attending` raw row enriches into the right shape (film + host +
  meta), dropped gracefully if the film is missing; `gazing_invited` rows gain the attendee
  summary + `viewerIsIn`.

## Out of scope (v1, noted for later)

- Declining explicitly (vs. simply not accepting) and a "maybe" state.
- Capacity limits / waitlists on a gazing.
- Comment/chat thread scoped to a gazing.
- Calendar export (.ics) for an accepted gazing.
- Reminders as the showtime approaches (could reuse the rate-reminder cron pattern).
- Retracting the host notification when an attendee backs out.
