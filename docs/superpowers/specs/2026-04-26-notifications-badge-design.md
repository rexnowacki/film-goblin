# Notifications Badge — Design

**Date:** 2026-04-26
**Status:** Approved (brainstorm)
**Implementation plan:** TBD (writing-plans next)

## Goal

Surface four kinds of events to a user via an in-app **bell badge** anchored to the avatar in the top nav:

1. **Pending coven invite** — someone sent you a coven request
2. **Coven invite accepted** — someone you invited has joined your coven
3. **Recommendation received** — a coven mate recommended you a film
4. **Price drop** — a film on your watchlist dropped in price

The bell sits **left of the profile avatar** in `TopNavChrome` on both desktop and mobile. The badge itself is a hot-pink "blood-drop" SVG with the unread count inside (1-9, then `9+`). When count = 0, the badge is hidden.

The existing `Coven` nav-link badge (`getPendingInviteCount`) stays as a separate persistent affordance — pending invites are *actionable* and the user shouldn't lose the cue when they read past the bell. The bell answers "is anything new?"; the Coven badge answers "do I owe someone a yes/no?"

## Out of scope (v1)

- Email notifications for kinds other than price drops (the existing notifier package keeps its current scope)
- Web push / Realtime live updates — the badge re-renders on each page navigation only
- Per-kind mute toggles — bell is always on
- Persistent (>30-day) notification history
- Profile-level "mark unread" / per-row dismiss

## Locked decisions (from brainstorm)

| # | Question | Decision |
|---|---|---|
| 1 | Avatar bell vs Coven nav badge | **Both.** Bell = informational unread count across 4 kinds; Coven badge = pending invites only. |
| 2 | Dropdown content | Last **14 days**; opening the dropdown marks all unread rows as read. |
| 3 | Row click target | **Per-kind smart target** (see §5). |
| 4 | Burst grouping | **Group by `(kind, actor_user_id)` within a 30-min window**, min size 3, 24-hr span ceiling. Mirrors existing `groupFeed`. Group is the read unit. |
| 5 | Settings / mute | **Always on**, no settings v1. |
| 6 | Real-time freshness | **SSR-only**: count rendered on each navigation. No focus-refetch, no Realtime. |
| 7 | Read-state model | **Per-row `read_at` column** on `notifications`. |

## Architecture

```
[event] coven_requests INSERT          ──┐
[event] coven_requests UPDATE→accepted ──┤
[event] recommendations INSERT         ──┼─→ trigger → notifications row
[event] price_alerts INSERT            ──┘                │
                                                          ▼
                                        TopNav SSR: COUNT(*) WHERE user_id = me AND read_at IS NULL
                                                          │
                                                          ▼
                                                    Avatar bell badge
```

Trigger functions are `SECURITY DEFINER` so they fire regardless of RLS. RLS on `notifications` lets the recipient SELECT/UPDATE their own rows; no client INSERT policy.

## Data model

### `0125_notifications.sql`

```sql
CREATE TYPE notification_kind AS ENUM (
  'coven_invite_pending',
  'coven_invite_accepted',
  'recommendation_received',
  'price_drop'
);

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- recipient
  kind            notification_kind NOT NULL,
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,          -- who caused it; null for system events (price_drop)
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,                          -- per-kind shape, see §3
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_unread_idx
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX notifications_user_recent_idx
  ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_read ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notifications_update ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No INSERT policy: only SECURITY DEFINER triggers write to this table.
```

**Aging out:** a daily cron (or appended to `/api/cron/send-notifications` since that already runs daily) does:

```sql
DELETE FROM notifications WHERE created_at < now() - INTERVAL '30 days';
```

The dropdown query reads only the last 14 days — the extra 16-day buffer means a notification stays visible after read but ages out within a month.

## Triggers (the four event sources)

### `0126_notification_triggers.sql`

```sql
-- a) coven_invite_pending: AFTER INSERT on coven_requests
CREATE OR REPLACE FUNCTION public.notify_coven_invite_pending()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  VALUES (NEW.to_user_id, 'coven_invite_pending', NEW.from_user_id,
          jsonb_build_object('coven_request_id', NEW.id));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_coven_request_insert_notify
AFTER INSERT ON coven_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_coven_invite_pending();

-- b) coven_invite_accepted: AFTER UPDATE on coven_requests when pending → accepted
CREATE OR REPLACE FUNCTION public.notify_coven_invite_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO notifications (user_id, kind, actor_user_id, payload)
    VALUES (NEW.from_user_id, 'coven_invite_accepted', NEW.to_user_id,
            jsonb_build_object('coven_request_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_coven_request_accept_notify
AFTER UPDATE ON coven_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_coven_invite_accepted();

-- c) recommendation_received: AFTER INSERT on recommendations
CREATE OR REPLACE FUNCTION public.notify_recommendation_received()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  VALUES (NEW.to_user_id, 'recommendation_received', NEW.from_user_id,
          jsonb_build_object('recommendation_id', NEW.id, 'film_id', NEW.film_id));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_recommendation_insert_notify
AFTER INSERT ON recommendations
FOR EACH ROW EXECUTE FUNCTION public.notify_recommendation_received();

-- d) price_drop: AFTER INSERT on price_alerts (fan out to watchlist owner)
CREATE OR REPLACE FUNCTION public.notify_price_drop()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  SELECT wl.user_id, 'price_drop', NULL,
         jsonb_build_object(
           'price_alert_id', NEW.id,
           'film_id', NEW.film_id,
           'old_price_usd', NEW.old_price_usd,
           'new_price_usd', NEW.new_price_usd
         )
  FROM watchlists wl
  WHERE wl.id = NEW.watchlist_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_price_alert_insert_notify
AFTER INSERT ON price_alerts
FOR EACH ROW EXECUTE FUNCTION public.notify_price_drop();
```

### Payload shapes

| `kind` | `payload` keys |
|---|---|
| `coven_invite_pending` | `coven_request_id` |
| `coven_invite_accepted` | `coven_request_id` |
| `recommendation_received` | `recommendation_id`, `film_id` |
| `price_drop` | `price_alert_id`, `film_id`, `old_price_usd`, `new_price_usd` |

## UI

### Bell anchor

`NotificationBell` (new client component) placed **left of the avatar** in `TopNavChrome`. On both desktop and mobile.

```
desktop: [wordmark | nav links] ............ [bell+drop] [avatar] 
mobile:  [wordmark] ........... [bell+drop] [avatar] [hamburger]
```

The bell *is* the drop badge — there is no separate bell icon when the badge is hidden. When `count === 0` the entire `NotificationBell` renders nothing. This matches the zine aesthetic (no "empty" UI elements taking up chrome space) and saves space on the mobile top nav.

When `count > 0`, the badge is a small button (44×44 hit target on mobile) containing the SVG drop. Clicking opens the dropdown.

### Drop badge component

```tsx
// app/components/NotificationBadge.tsx
interface Props { count: number; }

export default function NotificationBadge({ count }: Props) {
  if (count <= 0) return null;
  const display = count > 9 ? "9+" : String(count);
  // Inline SVG: drop path filled with var(--accent), stroked with var(--void),
  // white highlight ellipse top-left, count text inside in var(--font-display).
}
```

CSS tokens drive fill/stroke so the existing accent-switching machinery (`[data-accent="..."]`) keeps working — the drop turns yellow/orange/blood when the user picks a different accent in the tweaks panel.

### Dropdown

`NotificationsDropdown` (new client component):

- **Desktop:** absolute-positioned panel, `right: 0; top: calc(100% + 8px)`, styled like `UserMenu` (bone bg, void border, 4px accent box-shadow).
- **Mobile (≤720px):** uses the existing `<BottomSheet>` primitive.

**Items:**

- Group header rows (kind + actor + count): e.g. `Sarah recommended you 3 films` with stacked posters; click expands inline. Tapping the header (collapsed) routes to the first child's target (per §5).
- Single-event rows: avatar + 1-line text + small per-kind icon stamp + relative time (sentence-case, `var(--muted)`, matching the activity-feed footer style we just standardized).
- No empty state in v1: the dropdown is unreachable when the bell is hidden (count = 0), so we don't ship empty-state copy. If a future change exposes an always-visible bell, add the empty state then.

**Read flow:**

1. User clicks bell → dropdown opens.
2. Client calls `markAllRead()` server action: `UPDATE notifications SET read_at = now() WHERE user_id = auth.uid() AND read_at IS NULL`.
3. Optimistic update: badge count drops to 0 immediately on the client.
4. On dropdown close, `router.refresh()` revalidates the page so the SSR'd count stays consistent.

## Per-kind row click → smart target

| kind | target | notes |
|---|---|---|
| `coven_invite_pending` | `/coven#requests` | the page that has Accept/Decline buttons |
| `coven_invite_accepted` | `/p/<actor.handle>` | the new coven mate's profile |
| `recommendation_received` | `/film/<payload.film_id>` | film page already shows the rec note |
| `price_drop` | `/film/<payload.film_id>` | film page shows current price + Apple TV CTA |

Routing is client-side in `NotificationsDropdown` from `row.kind + row.payload`. No server-side route table.

For group rows, the **header** routes to the same target as the first child. Each expanded child routes to its own target.

## Grouping logic

Mirror `app/lib/queries/group-activity.ts`:

```ts
// app/lib/queries/group-notifications.ts
type NotificationFeedItem =
  | { kind: 'single'; notification: EnrichedNotification }
  | { kind: 'group'; actor: ActorLite | null; notifKind: NotificationKind;
      items: EnrichedNotification[]; latestAt: string; count: number };

export function groupNotifications(rows: EnrichedNotification[]): NotificationFeedItem[]
```

Rules:

- Sort newest → oldest.
- Group consecutive rows with same `(kind, actor_user_id)` where each row is within **30 min** of the previous row in the group.
- **Min group size: 3**; smaller clusters render as singles (same as `groupFeed`).
- **Span ceiling: 24 hr** for the whole group.
- `price_drop` actor is `NULL` — group key uses `(kind, NULL)`. So a worker run that fires 4 alerts on watchlisted films collapses into one group.

In practice, only `recommendation_received` and `price_drop` cluster — coven invites are 1:1 per (from, to) pair so they almost always render as singles.

### Read-on-group-open

Opening a group row counts as reading all of its children. Since the dropdown auto-marks-all on open (§ Read flow), this is a no-op in v1 — but the abstraction holds if we ever switch to per-row dismiss.

## Read query

`app/lib/queries/notifications.ts`:

```ts
// SSR-called from TopNav for the badge count
export async function getUnreadNotificationCount(client, userId): Promise<number>

// SSR-called from NotificationsDropdown's parent
export async function getRecentNotifications(client, userId): Promise<NotificationFeedItem[]>
//   selects last 14 days, joins actor profile + film as needed for payload enrichment,
//   then runs groupNotifications over the result
```

`EnrichedNotification` includes:

- `id, kind, payload, created_at, read_at`
- `actor: { handle, display_name, avatar_url } | null`
- For kinds with `film_id` in payload: `film: { id, title, artwork_url }`

The enrichment query reads `profiles` and `films` per row; for v1 the dropdown caps at 50 rows so this stays cheap. If usage grows, switch to a single denormalized view.

## Server action

`app/lib/actions/notifications.ts`:

```ts
// public wrapper + private testable form, per established convention
async function _markAllRead(client: SupabaseClient, userId: string): Promise<void>
export async function markAllRead(): Promise<void>  // calls _markAllRead, revalidates "/"
```

## Testing

- **`db/tests/rls/notifications.test.ts`** (testcontainers Postgres). Insert into each of the four source tables; assert the right notification row was emitted with the right `user_id`, `kind`, `actor_user_id`, `payload`. Cross-check that RLS lets the recipient `SELECT` their row and lets an unrelated user see nothing.
- **`app/tests/queries/group-notifications.test.ts`** — mirror `group-activity.test.ts` shape: ungrouped, one group, mixed groups + singles, span ceiling, min-size enforcement, null-actor (`price_drop`) grouping.
- **`app/tests/actions/notifications.test.ts`** — `describe.skipIf(!hasEnv)` per established convention. Asserts only the caller's unread rows update; another user's unread stays unread.
- **Component-level smoke**: render `NotificationsDropdown` with seeded fixtures via Next dev server (manual verify); we don't have RTL set up and don't need to add it for this scope.

## Conventions followed

- Action: private `_markAllRead(client, userId)` + public `markAllRead()` wrapper that builds the server client and calls `revalidatePath`.
- RLS bootstrap: testcontainers; `bond()` helper if the test needs coven mates (it does for the recs and pending-invite cases).
- pg-mem smoke: `db/tests/helpers/pg-mem.ts` already strips RLS / GRANT / DROP VIEW; the new migration is plain `CREATE TABLE / TRIGGER`, so the smoke needs no changes — but verify before assuming.
- `films_with_stats` view: not touched. Notifications are per-user state, not film aggregates.

## Migration plan

1. `db/migrations/0125_notifications.sql` — table + indexes + RLS.
2. `db/migrations/0126_notification_triggers.sql` — four trigger functions + four `CREATE TRIGGER` stmts.
3. Apply both to prod via `db/ npm run migrate`. (Requires sourcing `passwords.txt`'s pooler URL; see `app/.env.local` and the Gotchas section in `CLAUDE.md`.)
4. Regenerate types: `cd app && npm run gen:types`.
5. Backfill is **not needed** — events from before 0126 simply don't show in the bell. The bell reads "last 14 days" so any pre-launch backfill would be cosmetic.
6. Aging-out cron: extend `/api/cron/send-notifications` (already daily) to also run the 30-day `DELETE FROM notifications WHERE created_at < now() - INTERVAL '30 days'` after the digest send. Single cron, no `vercel.json` change.

## Risks / gotchas

- **Trigger amplification on price_alerts:** the worker can fire dozens of `price_alerts` in one cron run if many watchlisted films drop. Each triggers an `INSERT` into `notifications` per watchlist owner. Bench: today's max watchlists per film is small (single-digit), and the `groupNotifications` collapse keeps the dropdown sane. If volume grows we'd add a worker-side batch path that writes a single notification per (user, run).
- **Read-on-open race:** if the user opens the dropdown twice in quick succession, two concurrent `markAllRead` calls race. Both `UPDATE` the same rows; idempotent — no actual problem.
- **Coven nav-link badge stays separate** from the bell. If the user dismisses pending-invite notifications via the bell but never visits `/coven`, the Coven nav badge keeps surfacing them — that's intentional (they're actionable).
- **Bell hidden when count = 0:** the badge takes up no chrome space when empty. Consequence: there's no clickable affordance to "see notification history" when the user has nothing unread. Fine for v1 (the dropdown is meant for new stuff). If users complain we'll add a faded/empty drop variant.
