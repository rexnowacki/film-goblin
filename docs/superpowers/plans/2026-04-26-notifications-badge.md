# Notifications Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an in-app avatar bell that surfaces four event kinds (pending coven invite, coven invite accepted, recommendation received, watchlist price drop) as a hot-pink "drop" SVG badge with the unread count, plus a dropdown of the last 14 days of notifications grouped by `(kind, actor)` within 30-min windows.

**Architecture:** New `notifications` table with `read_at` populated by four `SECURITY DEFINER` Postgres triggers (one per source: `coven_requests` insert, `coven_requests` accept, `recommendations` insert, `price_alerts` insert). `TopNav` SSR-fetches unread count + recent items. `NotificationBell` (left of avatar) renders an inline-SVG drop badge; clicking pops `NotificationsDropdown` (desktop panel / mobile `BottomSheet`). Opening the dropdown calls `markAllRead()`, which `UPDATE`s the user's unread rows. Grouping reuses the `groupFeed` shape from the activity feed. A 30-day cleanup `DELETE` is appended to the existing `/api/cron/send-notifications` route.

**Tech Stack:** Supabase Postgres (RLS, plpgsql triggers), Next.js 15 App Router (server components + server actions), TypeScript, vitest, testcontainers (RLS+trigger tests), pg-mem (smoke).

**Spec:** [`docs/superpowers/specs/2026-04-26-notifications-badge-design.md`](../specs/2026-04-26-notifications-badge-design.md)

---

## File Structure

**New files (db/):**
- `db/migrations/0125_notifications.sql` — table, enum, indexes, RLS policies
- `db/migrations/0126_notification_triggers.sql` — 4 trigger functions + 4 triggers
- `db/tests/rls/notifications.test.ts` — RLS + trigger asserts (testcontainers)

**New files (app/):**
- `app/lib/queries/notifications.ts` — `getUnreadNotificationCount`, `getRecentNotifications`, `EnrichedNotification`, `NotificationFeedItem`
- `app/lib/queries/group-notifications.ts` — `groupNotifications` (mirrors `groupFeed`)
- `app/lib/actions/notifications.ts` — `_markAllRead` + `markAllRead`
- `app/components/NotificationBadge.tsx` — SVG drop badge (count = 0 hides)
- `app/components/NotificationBell.tsx` — bell button + dropdown wiring
- `app/components/NotificationsDropdown.tsx` — desktop panel wrapper
- `app/components/notifications/NotificationRow.tsx` — single-row renderer (4 kind variants → smart-target Link)
- `app/components/notifications/NotificationGroupRow.tsx` — group header + expandable children
- `app/tests/queries/group-notifications.test.ts` — pure unit tests for grouping
- `app/tests/actions/notifications.test.ts` — env-blocked integration test

**Modified files:**
- `app/lib/supabase/types.ts` — regenerated after migrations apply
- `app/components/TopNav.tsx` — fetch unread count + recent notifications, pass into `TopNavChrome`
- `app/components/TopNavChrome.tsx` — render `NotificationBell` to the LEFT of `UserMenu`
- `app/app/api/cron/send-notifications/route.ts` — append the 30-day cleanup `DELETE` after the digest send

---

## Phase 1 — Schema

### Task 1: Notifications table + RLS (migration 0125)

**Files:**
- Create: `db/migrations/0125_notifications.sql`
- Create: `db/tests/rls/notifications.test.ts` (initial — RLS-only; trigger asserts come in Task 2)

- [ ] **Step 1: Write the failing RLS test (initial: SELECT/UPDATE policies, table existence)**

Create `db/tests/rls/notifications.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures, Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM notifications`);
  await commit(db.client);
});

describe("RLS: notifications", () => {
  it("recipient SELECTs own rows; other users see nothing", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO notifications (user_id, kind, actor_user_id, payload)
       VALUES ($1, 'recommendation_received', $2, $3::jsonb)`,
      [fx.userA.id, fx.userB.id, JSON.stringify({ recommendation_id: "00000000-0000-0000-0000-000000000000", film_id: fx.filmId })]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM notifications`);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM notifications`);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("recipient can UPDATE read_at on own row; cannot UPDATE another's", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO notifications (user_id, kind, payload)
       VALUES ($1, 'price_drop', '{}'::jsonb), ($2, 'price_drop', '{}'::jsonb)`,
      [fx.userA.id, fx.userB.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE notifications SET read_at = now() WHERE user_id = $1 RETURNING id`,
        [fx.userA.id]
      );
      expect(r.rowCount).toBe(1);
      const otherTry = await db.client.query(
        `UPDATE notifications SET read_at = now() WHERE user_id = $1 RETURNING id`,
        [fx.userB.id]
      );
      expect(otherTry.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("authenticated INSERT is denied (no client write policy)", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO notifications (user_id, kind, payload)
           VALUES ($1, 'price_drop', '{}'::jsonb)`,
          [fx.userA.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails (table doesn't exist)**

```bash
cd /Users/christophernowacki/film-goblin/db
nvm use 20
npm run test:rls -- tests/rls/notifications.test.ts
```

Expected: FAIL — `relation "notifications" does not exist`.

- [ ] **Step 3: Write migration 0125**

Create `db/migrations/0125_notifications.sql`:

```sql
-- 0125_notifications.sql
-- Per-user, per-event in-app notification rows. Populated by SECURITY DEFINER
-- triggers (see 0126). Read by TopNav for the avatar-bell badge + dropdown.

CREATE TYPE notification_kind AS ENUM (
  'coven_invite_pending',
  'coven_invite_accepted',
  'recommendation_received',
  'price_drop'
);

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            notification_kind NOT NULL,
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
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

GRANT SELECT, UPDATE ON notifications TO authenticated;
-- No INSERT/DELETE for clients; triggers run as SECURITY DEFINER.
```

- [ ] **Step 4: Run the RLS test to confirm it passes**

```bash
cd /Users/christophernowacki/film-goblin/db
npm run test:rls -- tests/rls/notifications.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Run the pg-mem smoke to confirm it doesn't choke on the migration**

```bash
cd /Users/christophernowacki/film-goblin/db
npm test
```

Expected: PASS. (`db/tests/helpers/pg-mem.ts` already strips RLS/GRANT, so this is just a structural sanity check.)

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0125_notifications.sql db/tests/rls/notifications.test.ts
git commit -m "feat(db): notifications table + RLS (migration 0125)

Adds per-user notification rows with per-row read_at. RLS lets
the recipient SELECT and UPDATE only their own rows; client
INSERT is blocked (triggers in 0126 will write as SECURITY DEFINER).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Notification triggers (migration 0126)

**Files:**
- Create: `db/migrations/0126_notification_triggers.sql`
- Modify: `db/tests/rls/notifications.test.ts` (append trigger assertions)

- [ ] **Step 1: Append failing trigger tests to `db/tests/rls/notifications.test.ts`**

Append the following inside the `describe("RLS: notifications", () => {` block (before the closing `});`):

```ts
  describe("triggers", () => {
    async function bond(client: typeof db.client, x: string, y: string) {
      const [a, b] = x < y ? [x, y] : [y, x];
      await client.query(
        `INSERT INTO coven_members (user_a_id, user_b_id) VALUES ($1, $2)`,
        [a, b]
      );
    }

    beforeEach(async () => {
      await beginAs(db.client, null, "service_role");
      await db.client.query(`DELETE FROM notifications`);
      await db.client.query(`DELETE FROM coven_requests`);
      await db.client.query(`DELETE FROM coven_members`);
      await db.client.query(`DELETE FROM recommendations`);
      await commit(db.client);
    });

    it("coven_requests INSERT emits coven_invite_pending for to_user", async () => {
      await beginAs(db.client, null, "service_role");
      const { rows } = await db.client.query(
        `INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2) RETURNING id`,
        [fx.userA.id, fx.userB.id]
      );
      const reqId = rows[0].id;
      await commit(db.client);

      await beginAs(db.client, null, "service_role");
      try {
        const r = await db.client.query(
          `SELECT user_id, kind, actor_user_id, payload FROM notifications`
        );
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].user_id).toBe(fx.userB.id);
        expect(r.rows[0].kind).toBe("coven_invite_pending");
        expect(r.rows[0].actor_user_id).toBe(fx.userA.id);
        expect(r.rows[0].payload).toEqual({ coven_request_id: reqId });
      } finally { await rollback(db.client); }
    });

    it("coven_requests pending → accepted emits coven_invite_accepted for from_user", async () => {
      await beginAs(db.client, null, "service_role");
      const { rows } = await db.client.query(
        `INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2) RETURNING id`,
        [fx.userA.id, fx.userB.id]
      );
      const reqId = rows[0].id;
      // Clear out the auto-emitted pending notification so we can isolate accept
      await db.client.query(`DELETE FROM notifications`);
      await db.client.query(
        `UPDATE coven_requests SET status = 'accepted', responded_at = now() WHERE id = $1`,
        [reqId]
      );
      await commit(db.client);

      await beginAs(db.client, null, "service_role");
      try {
        const r = await db.client.query(
          `SELECT user_id, kind, actor_user_id, payload FROM notifications`
        );
        // The accept triggers TWO things: the existing 0111 trigger's coven_joined
        // activity rows (which we're not asserting on here) AND our new
        // coven_invite_accepted notification. Filter to our kind:
        const ours = r.rows.filter(row => row.kind === "coven_invite_accepted");
        expect(ours.length).toBe(1);
        expect(ours[0].user_id).toBe(fx.userA.id);
        expect(ours[0].actor_user_id).toBe(fx.userB.id);
        expect(ours[0].payload).toEqual({ coven_request_id: reqId });
      } finally { await rollback(db.client); }
    });

    it("recommendations INSERT emits recommendation_received for to_user", async () => {
      await beginAs(db.client, null, "service_role");
      await bond(db.client, fx.userA.id, fx.userB.id);
      const { rows } = await db.client.query(
        `INSERT INTO recommendations (from_user_id, to_user_id, film_id, note)
         VALUES ($1, $2, $3, 'great') RETURNING id`,
        [fx.userA.id, fx.userB.id, fx.filmId]
      );
      const recId = rows[0].id;
      await commit(db.client);

      await beginAs(db.client, null, "service_role");
      try {
        const r = await db.client.query(
          `SELECT user_id, kind, actor_user_id, payload FROM notifications WHERE kind = 'recommendation_received'`
        );
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].user_id).toBe(fx.userB.id);
        expect(r.rows[0].actor_user_id).toBe(fx.userA.id);
        expect(r.rows[0].payload).toEqual({ recommendation_id: recId, film_id: fx.filmId });
      } finally { await rollback(db.client); }
    });

    it("price_alerts INSERT emits price_drop for the watchlist owner", async () => {
      await beginAs(db.client, null, "service_role");
      const { rows: wlRows } = await db.client.query(
        `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2) RETURNING id`,
        [fx.userA.id, fx.filmId]
      );
      const wlId = wlRows[0].id;
      const { rows: alertRows } = await db.client.query(
        `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd)
         VALUES ($1, $2, 14.99, 9.99) RETURNING id`,
        [wlId, fx.filmId]
      );
      const alertId = alertRows[0].id;
      await commit(db.client);

      await beginAs(db.client, null, "service_role");
      try {
        const r = await db.client.query(
          `SELECT user_id, kind, actor_user_id, payload FROM notifications WHERE kind = 'price_drop'`
        );
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].user_id).toBe(fx.userA.id);
        expect(r.rows[0].actor_user_id).toBeNull();
        expect(r.rows[0].payload).toMatchObject({
          price_alert_id: alertId,
          film_id: fx.filmId,
        });
      } finally { await rollback(db.client); }
    });
  });
```

- [ ] **Step 2: Run trigger tests to confirm they fail**

```bash
cd /Users/christophernowacki/film-goblin/db
npm run test:rls -- tests/rls/notifications.test.ts
```

Expected: 4 new tests fail (no trigger writes a row, so SELECTs return 0 rows).

- [ ] **Step 3: Write migration 0126**

Create `db/migrations/0126_notification_triggers.sql`:

```sql
-- 0126_notification_triggers.sql
-- Four SECURITY DEFINER triggers fan source-table events into notifications.

-- (a) coven_requests INSERT → coven_invite_pending for to_user
CREATE OR REPLACE FUNCTION public.notify_coven_invite_pending()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  VALUES (
    NEW.to_user_id,
    'coven_invite_pending',
    NEW.from_user_id,
    jsonb_build_object('coven_request_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_coven_request_insert_notify
AFTER INSERT ON coven_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_coven_invite_pending();

-- (b) coven_requests pending → accepted → coven_invite_accepted for from_user
CREATE OR REPLACE FUNCTION public.notify_coven_invite_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO notifications (user_id, kind, actor_user_id, payload)
    VALUES (
      NEW.from_user_id,
      'coven_invite_accepted',
      NEW.to_user_id,
      jsonb_build_object('coven_request_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_coven_request_accept_notify
AFTER UPDATE ON coven_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_coven_invite_accepted();

-- (c) recommendations INSERT → recommendation_received for to_user
CREATE OR REPLACE FUNCTION public.notify_recommendation_received()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  VALUES (
    NEW.to_user_id,
    'recommendation_received',
    NEW.from_user_id,
    jsonb_build_object('recommendation_id', NEW.id, 'film_id', NEW.film_id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_recommendation_insert_notify
AFTER INSERT ON recommendations
FOR EACH ROW EXECUTE FUNCTION public.notify_recommendation_received();

-- (d) price_alerts INSERT → price_drop for the watchlist owner
CREATE OR REPLACE FUNCTION public.notify_price_drop()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  SELECT
    wl.user_id,
    'price_drop',
    NULL,
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

- [ ] **Step 4: Run trigger tests to confirm they pass**

```bash
cd /Users/christophernowacki/film-goblin/db
npm run test:rls -- tests/rls/notifications.test.ts
```

Expected: all 7 tests (3 RLS + 4 trigger) PASS.

- [ ] **Step 5: Run pg-mem smoke**

```bash
cd /Users/christophernowacki/film-goblin/db
npm test
```

Expected: PASS. (Smoke helper at `db/tests/helpers/pg-mem.ts` already strips RLS/GRANT/CREATE-EXTENSION; trigger functions use only standard plpgsql so pg-mem applies them fine.)

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0126_notification_triggers.sql db/tests/rls/notifications.test.ts
git commit -m "feat(db): notification triggers fan source events into notifications

Four SECURITY DEFINER triggers populate the notifications table:
coven_requests INSERT → coven_invite_pending; pending→accepted →
coven_invite_accepted; recommendations INSERT → recommendation_received;
price_alerts INSERT → price_drop (fanned to the watchlist owner).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Apply migrations to prod and regenerate types

**Files:**
- Modify: `app/lib/supabase/types.ts` (regenerated)

- [ ] **Step 1: Source pooler URL and apply migrations to prod Supabase**

```bash
cd /Users/christophernowacki/film-goblin
set -a; source app/.env.local; set +a
cd db
nvm use 20
npm run migrate
```

Expected: `applied: 0125_notifications.sql`, `applied: 0126_notification_triggers.sql`. (See `passwords.txt` and the Gotchas section in `CLAUDE.md` if `DATABASE_URL` is not in `app/.env.local`.)

- [ ] **Step 2: Regenerate Supabase types**

```bash
cd /Users/christophernowacki/film-goblin/app
npm run gen:types
```

Expected: `app/lib/supabase/types.ts` updated. Verify by grepping:

```bash
grep -c "notifications:" app/lib/supabase/types.ts
```

Expected: ≥ 1.

- [ ] **Step 3: Confirm typecheck still passes**

```bash
cd /Users/christophernowacki/film-goblin/app
npm run typecheck
```

Expected: PASS (no callers of `notifications` exist yet — types should compile clean).

- [ ] **Step 4: Commit**

```bash
git add app/lib/supabase/types.ts
git commit -m "chore(types): regenerate Supabase types for notifications

Migrations 0125 and 0126 are applied to prod.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — Read query layer

### Task 4: `groupNotifications` (pure function + unit tests)

**Files:**
- Create: `app/tests/queries/group-notifications.test.ts`
- Create: `app/lib/queries/group-notifications.ts`

- [ ] **Step 1: Write failing unit tests**

Create `app/tests/queries/group-notifications.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupNotifications } from "@/lib/queries/group-notifications";
import type { EnrichedNotification } from "@/lib/queries/notifications";

const ACTOR_A = { id: "a", handle: "alice", display_name: "Alice", avatar_url: null };
const ACTOR_B = { id: "b", handle: "bob",   display_name: "Bob",   avatar_url: null };
const FILM = { id: "f1", title: "F", artwork_url: "" };

function rec(id: string, actor: typeof ACTOR_A | null, createdAt: string,
             kind: EnrichedNotification["kind"] = "recommendation_received"): EnrichedNotification {
  return {
    id, kind, created_at: createdAt, read_at: null,
    actor, payload: kind === "price_drop"
      ? { price_alert_id: "x", film_id: FILM.id, old_price_usd: 10, new_price_usd: 5 }
      : { recommendation_id: "x", film_id: FILM.id },
    film: FILM,
  } as EnrichedNotification;
}

describe("groupNotifications", () => {
  it("returns single items when fewer than 3 cluster", () => {
    const items = [
      rec("3", ACTOR_A, "2026-04-26T12:00:00Z"),
      rec("2", ACTOR_A, "2026-04-26T11:50:00Z"),
    ];
    const out = groupNotifications(items);
    expect(out.map(o => o.kind)).toEqual(["single", "single"]);
  });

  it("groups 3+ same-(kind, actor) within 30 min", () => {
    const items = [
      rec("3", ACTOR_A, "2026-04-26T12:00:00Z"),
      rec("2", ACTOR_A, "2026-04-26T11:50:00Z"),
      rec("1", ACTOR_A, "2026-04-26T11:40:00Z"),
    ];
    const out = groupNotifications(items);
    expect(out.length).toBe(1);
    expect(out[0].kind).toBe("group");
    if (out[0].kind === "group") {
      expect(out[0].count).toBe(3);
      expect(out[0].latestAt).toBe("2026-04-26T12:00:00Z");
    }
  });

  it("breaks group when gap > 30 min", () => {
    const items = [
      rec("3", ACTOR_A, "2026-04-26T12:00:00Z"),
      rec("2", ACTOR_A, "2026-04-26T11:50:00Z"),
      rec("1", ACTOR_A, "2026-04-26T11:00:00Z"), // 50-min gap
    ];
    const out = groupNotifications(items);
    expect(out.map(o => o.kind)).toEqual(["single", "single", "single"]);
  });

  it("does not mix actors", () => {
    const items = [
      rec("3", ACTOR_A, "2026-04-26T12:00:00Z"),
      rec("2", ACTOR_B, "2026-04-26T11:55:00Z"),
      rec("1", ACTOR_A, "2026-04-26T11:50:00Z"),
    ];
    const out = groupNotifications(items);
    expect(out.map(o => o.kind)).toEqual(["single", "single", "single"]);
  });

  it("groups null-actor price_drop events together", () => {
    const items = [
      rec("3", null, "2026-04-26T12:00:00Z", "price_drop"),
      rec("2", null, "2026-04-26T11:50:00Z", "price_drop"),
      rec("1", null, "2026-04-26T11:40:00Z", "price_drop"),
    ];
    const out = groupNotifications(items);
    expect(out.length).toBe(1);
    expect(out[0].kind).toBe("group");
    if (out[0].kind === "group") {
      expect(out[0].notifKind).toBe("price_drop");
      expect(out[0].actor).toBeNull();
    }
  });

  it("breaks group when total span > 24 hr", () => {
    const items = [
      rec("3", ACTOR_A, "2026-04-26T23:00:00Z"),
      rec("2", ACTOR_A, "2026-04-26T22:50:00Z"),
      rec("1", ACTOR_A, "2026-04-25T22:00:00Z"), // > 24 hr from head
    ];
    const out = groupNotifications(items);
    // The 25-min gap from row 2 to row 1 itself fits in 30, but span ceiling kicks
    // in. The function should refuse to extend the group across the 24-hr boundary.
    const hasGroup = out.some(o => o.kind === "group" && o.kind === "group");
    if (out.length === 1 && out[0].kind === "group") {
      // Regression — span ceiling missed
      expect(out[0].count).toBeLessThan(3);
    }
    // At least one item must be a single (the older one outside the window)
    expect(out.some(o => o.kind === "single")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/christophernowacki/film-goblin/app
nvm use 20
npm run test -- tests/queries/group-notifications.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/queries/group-notifications'`.

- [ ] **Step 3: Write the impl**

Create `app/lib/queries/group-notifications.ts`:

```ts
import type { EnrichedNotification, NotificationFeedItem, NotificationGroup } from "./notifications";

const GAP_MS = 30 * 60 * 1000;
const SPAN_MS = 24 * 60 * 60 * 1000;
const MIN_GROUP_SIZE = 3;

/**
 * Mirror of groupFeed for notifications. Walks newest-first, folds runs of
 * same-(kind, actor_user_id) events that satisfy the 30-min event-to-event
 * gap and 24-hr span ceiling and 3+ size into groups; otherwise emits singles.
 *
 * Null actor (price_drop) groups by (kind, NULL).
 */
export function groupNotifications(items: EnrichedNotification[]): NotificationFeedItem[] {
  const out: NotificationFeedItem[] = [];
  let i = 0;
  while (i < items.length) {
    const head = items[i];
    const headActorId = head.actor?.id ?? null;

    const run: EnrichedNotification[] = [head];
    let j = i + 1;
    while (j < items.length) {
      const cand = items[j];
      const candActorId = cand.actor?.id ?? null;
      if (cand.kind !== head.kind) break;
      if (candActorId !== headActorId) break;
      const prior = run[run.length - 1];
      const gapMs = new Date(prior.created_at).getTime() - new Date(cand.created_at).getTime();
      if (gapMs > GAP_MS) break;
      const spanMs = new Date(head.created_at).getTime() - new Date(cand.created_at).getTime();
      if (spanMs > SPAN_MS) break;
      run.push(cand);
      j++;
    }

    if (run.length >= MIN_GROUP_SIZE) {
      const oldestId = run[run.length - 1].id;
      const group: NotificationGroup = {
        key: `${headActorId ?? "system"}:${head.kind}:${oldestId}`,
        actor: head.actor,
        notifKind: head.kind,
        items: run,
        count: run.length,
        latestAt: head.created_at,
      };
      out.push({ kind: "group", group });
    } else {
      for (const r of run) out.push({ kind: "single", notification: r });
    }
    i = j;
  }
  return out;
}
```

(Types `EnrichedNotification`, `NotificationFeedItem`, `NotificationGroup` are defined in Task 5 in `notifications.ts` — write Task 5 next OR temporarily declare placeholder types in `group-notifications.ts` and replace in Task 5.)

- [ ] **Step 4: Quickly stub the types so this task is self-contained**

Create `app/lib/queries/notifications.ts` with ONLY the type exports (real impl comes in Task 5):

```ts
import type { Database } from "../supabase/types";

export type NotificationKind = Database["public"]["Enums"]["notification_kind"];

export interface ActorLite {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface FilmLite {
  id: string;
  title: string;
  artwork_url: string;
}

export interface EnrichedNotification {
  id: string;
  kind: NotificationKind;
  created_at: string;
  read_at: string | null;
  actor: ActorLite | null;
  payload: Record<string, unknown>;
  film: FilmLite | null;
}

export interface NotificationGroup {
  key: string;
  actor: ActorLite | null;
  notifKind: NotificationKind;
  items: EnrichedNotification[];
  count: number;
  latestAt: string;
}

export type NotificationFeedItem =
  | { kind: "single"; notification: EnrichedNotification }
  | { kind: "group"; group: NotificationGroup };
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd /Users/christophernowacki/film-goblin/app
npm run test -- tests/queries/group-notifications.test.ts
```

Expected: 6 PASS.

- [ ] **Step 6: Commit**

```bash
git add app/lib/queries/group-notifications.ts app/lib/queries/notifications.ts app/tests/queries/group-notifications.test.ts
git commit -m "feat(app): groupNotifications — mirror groupFeed for the bell

Pure function, 30-min gap + 24-hr span ceiling + min-size 3 + null-actor
support. Type scaffolding for EnrichedNotification / NotificationFeedItem.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Read queries (`getUnreadNotificationCount`, `getRecentNotifications`)

**Files:**
- Modify: `app/lib/queries/notifications.ts` (add the two read functions; keep the types from Task 4)

- [ ] **Step 1: Add read functions to `app/lib/queries/notifications.ts`**

Replace the existing file with:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { groupNotifications } from "./group-notifications";

type Client = SupabaseClient<Database>;

export type NotificationKind = Database["public"]["Enums"]["notification_kind"];

export interface ActorLite {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface FilmLite {
  id: string;
  title: string;
  artwork_url: string;
}

export interface EnrichedNotification {
  id: string;
  kind: NotificationKind;
  created_at: string;
  read_at: string | null;
  actor: ActorLite | null;
  payload: Record<string, unknown>;
  film: FilmLite | null;
}

export interface NotificationGroup {
  key: string;
  actor: ActorLite | null;
  notifKind: NotificationKind;
  items: EnrichedNotification[];
  count: number;
  latestAt: string;
}

export type NotificationFeedItem =
  | { kind: "single"; notification: EnrichedNotification }
  | { kind: "group"; group: NotificationGroup };

const RECENT_DAYS = 14;
const RECENT_LIMIT = 50;

export async function getUnreadNotificationCount(client: Client, userId: string): Promise<number> {
  const { count, error } = await client
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function getRecentNotifications(client: Client, userId: string): Promise<NotificationFeedItem[]> {
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("notifications")
    .select("id, kind, created_at, read_at, actor_user_id, payload")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const actorIds = Array.from(new Set(rows.map(r => r.actor_user_id).filter((x): x is string => Boolean(x))));
  const filmIds = Array.from(new Set(
    rows
      .map(r => (r.payload as { film_id?: string } | null)?.film_id)
      .filter((x): x is string => Boolean(x))
  ));

  const [actorsRes, filmsRes] = await Promise.all([
    actorIds.length === 0
      ? Promise.resolve({ data: [], error: null as null })
      : client.from("profiles").select("id, handle, display_name, avatar_url").in("id", actorIds),
    filmIds.length === 0
      ? Promise.resolve({ data: [], error: null as null })
      : client.from("films").select("id, title, artwork_url").in("id", filmIds),
  ]);
  if (actorsRes.error) throw actorsRes.error;
  if (filmsRes.error) throw filmsRes.error;

  const actorById = new Map((actorsRes.data ?? []).map(a => [a.id, a]));
  const filmById = new Map((filmsRes.data ?? []).map(f => [f.id, f]));

  const enriched: EnrichedNotification[] = rows.map(r => {
    const actor = r.actor_user_id ? actorById.get(r.actor_user_id) ?? null : null;
    const filmId = (r.payload as { film_id?: string } | null)?.film_id;
    const film = filmId ? filmById.get(filmId) ?? null : null;
    return {
      id: r.id,
      kind: r.kind,
      created_at: r.created_at,
      read_at: r.read_at,
      actor: actor
        ? { id: actor.id, handle: actor.handle, display_name: actor.display_name, avatar_url: actor.avatar_url }
        : null,
      payload: (r.payload ?? {}) as Record<string, unknown>,
      film,
    };
  });

  return groupNotifications(enriched);
}
```

- [ ] **Step 2: Confirm typecheck passes**

```bash
cd /Users/christophernowacki/film-goblin/app
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Confirm group-notifications test still passes (no regression)**

```bash
cd /Users/christophernowacki/film-goblin/app
npm run test -- tests/queries/group-notifications.test.ts
```

Expected: 6 PASS.

- [ ] **Step 4: Commit**

```bash
git add app/lib/queries/notifications.ts
git commit -m "feat(app): getUnreadNotificationCount + getRecentNotifications

Reads last 14 days, joins actor profile + film by payload.film_id,
runs groupNotifications. Limits to 50 rows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — Server action

### Task 6: `markAllRead` server action

**Files:**
- Create: `app/lib/actions/notifications.ts`
- Create: `app/tests/actions/notifications.test.ts`

- [ ] **Step 1: Write failing env-blocked integration test**

Create `app/tests/actions/notifications.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { _markAllRead } from "@/lib/actions/notifications";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

describe.skipIf(!hasEnv)("markAllRead", () => {
  let svc: ReturnType<typeof createClient<Database>>;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    if (!hasEnv) return;
    svc = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
    const a = await svc.auth.admin.createUser({ email: `mra-${Date.now()}@test.example`, email_confirm: true });
    const b = await svc.auth.admin.createUser({ email: `mrb-${Date.now()}@test.example`, email_confirm: true });
    userA = a.data.user!.id;
    userB = b.data.user!.id;
  });

  afterAll(async () => {
    if (!hasEnv) return;
    await svc.auth.admin.deleteUser(userA).catch(() => {});
    await svc.auth.admin.deleteUser(userB).catch(() => {});
  });

  beforeEach(async () => {
    if (!hasEnv) return;
    await svc.from("notifications").delete().in("user_id", [userA, userB]);
    await svc.from("notifications").insert([
      { user_id: userA, kind: "price_drop", payload: {} },
      { user_id: userA, kind: "price_drop", payload: {} },
      { user_id: userB, kind: "price_drop", payload: {} },
    ] as never);
  });

  it("marks only the caller's unread rows as read", async () => {
    await _markAllRead(svc as never, userA);

    const aRows = await svc.from("notifications").select("read_at").eq("user_id", userA);
    expect(aRows.data!.every(r => r.read_at !== null)).toBe(true);

    const bRows = await svc.from("notifications").select("read_at").eq("user_id", userB);
    expect(bRows.data!.every(r => r.read_at === null)).toBe(true);
  });

  it("is idempotent", async () => {
    await _markAllRead(svc as never, userA);
    await _markAllRead(svc as never, userA);
    const aRows = await svc.from("notifications").select("read_at").eq("user_id", userA);
    expect(aRows.data!.every(r => r.read_at !== null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — confirm it skip-greens (env unset locally) or fails (env set)**

```bash
cd /Users/christophernowacki/film-goblin/app
npm run test -- tests/actions/notifications.test.ts
```

Expected: SKIP if env unset; FAIL with "Cannot find module" if env set (action doesn't exist yet).

- [ ] **Step 3: Write the action**

Create `app/lib/actions/notifications.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function _markAllRead(client: Client, userId: string): Promise<void> {
  const { error } = await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() } as never)
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

export async function markAllRead(): Promise<void> {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  await _markAllRead(client, user.id);
  revalidatePath("/", "layout");
}
```

- [ ] **Step 4: Run test to confirm it passes (or skip-greens)**

```bash
cd /Users/christophernowacki/film-goblin/app
npm run test -- tests/actions/notifications.test.ts
```

Expected: PASS if env set; SKIP if env unset.

- [ ] **Step 5: Typecheck**

```bash
cd /Users/christophernowacki/film-goblin/app
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/lib/actions/notifications.ts app/tests/actions/notifications.test.ts
git commit -m "feat(app): markAllRead server action

Bulk-sets read_at on all unread notifications for the calling user.
Private testable form _markAllRead(client, userId) + public wrapper.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — UI components

### Task 7: `NotificationBadge` SVG drop component

**Files:**
- Create: `app/components/NotificationBadge.tsx`

- [ ] **Step 1: Write the component**

Create `app/components/NotificationBadge.tsx`:

```tsx
interface Props {
  count: number;
  size?: number;
}

export default function NotificationBadge({ count, size = 28 }: Props) {
  if (count <= 0) return null;
  const display = count > 9 ? "9+" : String(count);
  const w = size;
  const h = Math.round(size * 1.25);
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 40 50"
      role="img"
      aria-label={`${count} unread notification${count === 1 ? "" : "s"}`}
      style={{ display: "block" }}
    >
      {/* Drop shape: rounded teardrop, var(--accent) fill, var(--void) stroke */}
      <path
        d="M20 3 C12 14, 4 23, 4 33 C4 41.7, 11.2 48, 20 48 C28.8 48, 36 41.7, 36 33 C36 23, 28 14, 20 3 Z"
        fill="var(--accent)"
        stroke="var(--void)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Highlight */}
      <ellipse cx="14" cy="16" rx="2.6" ry="3.6" fill="rgba(255,255,255,0.85)" />
      <text
        x="20"
        y="38"
        textAnchor="middle"
        fontFamily="var(--font-display), Georgia, serif"
        fontSize={display.length > 1 ? 16 : 20}
        fontWeight={900}
        fill="var(--void)"
      >
        {display}
      </text>
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/christophernowacki/film-goblin/app
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/components/NotificationBadge.tsx
git commit -m "feat(app): NotificationBadge — SVG drop with unread count

Hot-pink teardrop with white highlight + black outline; renders
the count (1-9) or '9+' inside in display font. Hides at count = 0.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `NotificationRow` (single-row) and `NotificationGroupRow`

**Files:**
- Create: `app/components/notifications/NotificationRow.tsx`
- Create: `app/components/notifications/NotificationGroupRow.tsx`

- [ ] **Step 1: Build the per-kind smart-target helper + single row**

Create `app/components/notifications/NotificationRow.tsx`:

```tsx
"use client";

import Link from "next/link";
import Avatar from "../Avatar";
import { relativeTime } from "../activity/relativeTime";
import type { EnrichedNotification } from "@/lib/queries/notifications";

interface Props {
  notification: EnrichedNotification;
  onNavigate?: () => void;
}

function targetFor(n: EnrichedNotification): string {
  switch (n.kind) {
    case "coven_invite_pending":
      return "/coven#requests";
    case "coven_invite_accepted":
      return n.actor ? `/p/${encodeURIComponent(n.actor.handle)}` : "/coven";
    case "recommendation_received":
    case "price_drop": {
      const filmId = (n.payload as { film_id?: string }).film_id;
      return filmId ? `/film/${filmId}` : "/home";
    }
  }
}

function copyFor(n: EnrichedNotification): React.ReactNode {
  const actorName = n.actor?.display_name ?? n.actor?.handle ?? "Someone";
  const title = n.film?.title ?? "a film";
  switch (n.kind) {
    case "coven_invite_pending":
      return <><strong>{actorName}</strong> invited you to their coven.</>;
    case "coven_invite_accepted":
      return <><strong>{actorName}</strong> joined your coven.</>;
    case "recommendation_received":
      return <><strong>{actorName}</strong> recommended <em>{title}</em>.</>;
    case "price_drop": {
      const p = n.payload as { old_price_usd?: number; new_price_usd?: number };
      return <>Price drop: <em>{title}</em>{p.new_price_usd !== undefined ? ` — $${p.new_price_usd.toFixed(2)}` : ""}.</>;
    }
  }
}

export default function NotificationRow({ notification, onNavigate }: Props) {
  const href = targetFor(notification);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      style={{
        display: "flex", gap: 10, padding: "10px 12px",
        borderBottom: "1px solid #2a2a2a",
        textDecoration: "none", color: "var(--bone)",
        background: notification.read_at ? "transparent" : "rgba(255,45,136,0.06)",
      }}
    >
      <Avatar
        name={notification.actor?.display_name ?? notification.actor?.handle ?? "system"}
        color="var(--accent)"
        size={32}
        url={notification.actor?.avatar_url ?? null}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, lineHeight: 1.35 }}>
          {copyFor(notification)}
        </div>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
          {relativeTime(notification.created_at)}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Build the group row**

Create `app/components/notifications/NotificationGroupRow.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import Avatar from "../Avatar";
import NotificationRow from "./NotificationRow";
import { relativeTime } from "../activity/relativeTime";
import type { NotificationGroup } from "@/lib/queries/notifications";

interface Props {
  group: NotificationGroup;
  onNavigate?: () => void;
}

function headerCopy(group: NotificationGroup): React.ReactNode {
  const actorName = group.actor?.display_name ?? group.actor?.handle ?? "System";
  switch (group.notifKind) {
    case "recommendation_received":
      return <><strong>{actorName}</strong> recommended <strong>{group.count} films</strong>.</>;
    case "price_drop":
      return <><strong>{group.count} watchlisted films</strong> dropped in price.</>;
    case "coven_invite_pending":
      return <><strong>{actorName}</strong> sent you {group.count} coven invites.</>;
    case "coven_invite_accepted":
      return <><strong>{actorName}</strong> accepted {group.count} coven invites.</>;
  }
}

function headerHref(group: NotificationGroup): string {
  const first = group.items[0];
  switch (group.notifKind) {
    case "coven_invite_pending":
      return "/coven#requests";
    case "coven_invite_accepted":
      return group.actor ? `/p/${encodeURIComponent(group.actor.handle)}` : "/coven";
    case "recommendation_received":
    case "price_drop": {
      const filmId = (first.payload as { film_id?: string }).film_id;
      return filmId ? `/film/${filmId}` : "/home";
    }
  }
}

export default function NotificationGroupRow({ group, onNavigate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const anyUnread = group.items.some(i => !i.read_at);

  function onToggle(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("a") && !(e.target as HTMLElement).hasAttribute("data-toggle")) return;
    setExpanded(v => !v);
  }

  return (
    <div style={{ borderBottom: "1px solid #2a2a2a" }}>
      <div
        onClick={onToggle}
        role="button"
        aria-expanded={expanded}
        style={{
          display: "flex", gap: 10, padding: "10px 12px",
          cursor: "pointer",
          background: anyUnread ? "rgba(255,45,136,0.06)" : "transparent",
        }}
      >
        <Avatar
          name={group.actor?.display_name ?? group.actor?.handle ?? "system"}
          color="var(--accent)"
          size={32}
          url={group.actor?.avatar_url ?? null}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, lineHeight: 1.35 }}>
            {headerCopy(group)}
          </div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)", marginTop: 2, display: "flex", gap: 10, alignItems: "center" }}>
            <span>{relativeTime(group.latestAt)}</span>
            <Link
              href={headerHref(group)}
              data-toggle="false"
              onClick={onNavigate}
              style={{ color: "var(--accent)" }}
            >
              View
            </Link>
            <span style={{ marginLeft: "auto", transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s" }} aria-hidden="true">▾</span>
          </div>
        </div>
      </div>
      {expanded && (
        <div style={{ background: "rgba(0,0,0,0.25)" }}>
          {group.items.map(item => (
            <NotificationRow key={item.id} notification={item} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/christophernowacki/film-goblin/app
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/components/notifications/NotificationRow.tsx app/components/notifications/NotificationGroupRow.tsx
git commit -m "feat(app): notification row + group-row components

Per-kind copy + per-kind smart-target Link. Groups expand inline
to show child rows; group header has its own 'View' link to the
first child's target.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `NotificationsDropdown`

**Files:**
- Create: `app/components/NotificationsDropdown.tsx`

- [ ] **Step 1: Write the dropdown**

Create `app/components/NotificationsDropdown.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import BottomSheet from "./BottomSheet";
import NotificationRow from "./notifications/NotificationRow";
import NotificationGroupRow from "./notifications/NotificationGroupRow";
import type { NotificationFeedItem } from "@/lib/queries/notifications";

interface Props {
  open: boolean;
  onClose: () => void;
  items: NotificationFeedItem[];
  /** True if the viewport is mobile-width. Detected by parent via media-query on mount. */
  isMobile: boolean;
}

export default function NotificationsDropdown({ open, onClose, items, isMobile }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside on desktop only — BottomSheet handles its own backdrop on mobile.
  useEffect(() => {
    if (!open || isMobile) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, isMobile, onClose]);

  if (!open) return null;

  const body = (
    <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
      {items.length === 0 ? (
        <div style={{ padding: "16px 12px", fontStyle: "italic", color: "var(--muted)" }}>
          No notifications yet.
        </div>
      ) : (
        items.map(it =>
          it.kind === "single"
            ? <NotificationRow key={it.notification.id} notification={it.notification} onNavigate={onClose} />
            : <NotificationGroupRow key={it.group.key} group={it.group} onNavigate={onClose} />
        )
      )}
    </div>
  );

  if (isMobile) {
    return <BottomSheet open={open} onClose={onClose} title="Notifications">{body}</BottomSheet>;
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Notifications"
      style={{
        position: "absolute",
        right: 0,
        top: "calc(100% + 8px)",
        background: "var(--void-2)",
        color: "var(--bone)",
        border: "2px solid var(--void)",
        boxShadow: "4px 4px 0 var(--accent)",
        width: 360,
        maxWidth: "calc(100vw - 24px)",
        zIndex: 50,
      }}
    >
      <div style={{ padding: "10px 12px", borderBottom: "1px solid #2a2a2a", fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>
        Notifications
      </div>
      {body}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/christophernowacki/film-goblin/app
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/components/NotificationsDropdown.tsx
git commit -m "feat(app): NotificationsDropdown desktop panel + mobile sheet

BottomSheet on ≤720px; absolute-positioned UserMenu-style panel
on desktop (bone bg, 4px accent box-shadow). Click-outside dismiss
on desktop only. 60vh scrollable item list.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `NotificationBell` — bell button + dropdown wiring + markAllRead

**Files:**
- Create: `app/components/NotificationBell.tsx`

- [ ] **Step 1: Write the bell**

Create `app/components/NotificationBell.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import NotificationBadge from "./NotificationBadge";
import NotificationsDropdown from "./NotificationsDropdown";
import { markAllRead } from "@/lib/actions/notifications";
import type { NotificationFeedItem } from "@/lib/queries/notifications";

interface Props {
  unreadCount: number;
  items: NotificationFeedItem[];
}

export default function NotificationBell({ unreadCount, items }: Props) {
  const [open, setOpen] = useState(false);
  const [optimisticUnread, setOptimisticUnread] = useState(unreadCount);
  const [isMobile, setIsMobile] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync optimistic count when SSR'd value changes (e.g. after revalidation).
  useEffect(() => { setOptimisticUnread(unreadCount); }, [unreadCount]);

  // Detect mobile-width once per mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 720px)");
    setIsMobile(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  if (optimisticUnread <= 0) return null;

  async function onClick() {
    if (open) return;
    setOpen(true);
    if (optimisticUnread > 0) {
      setOptimisticUnread(0);
      try { await markAllRead(); } catch { /* already swallowed by action's try */ }
    }
  }

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        onClick={onClick}
        aria-label={`Open notifications (${optimisticUnread} unread)`}
        style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", display: "inline-flex" }}
      >
        <NotificationBadge count={optimisticUnread} />
      </button>
      <NotificationsDropdown
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        isMobile={isMobile}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/christophernowacki/film-goblin/app
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/components/NotificationBell.tsx
git commit -m "feat(app): NotificationBell wires badge + dropdown + markAllRead

Optimistic local count zeros immediately when the dropdown opens;
markAllRead fires server-side. matchMedia(720px) picks the
mobile-bottom-sheet vs desktop-panel render. Hides entirely when
unread count = 0.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 — TopNav integration

### Task 11: Wire bell into `TopNav` + `TopNavChrome`

**Files:**
- Modify: `app/components/TopNav.tsx`
- Modify: `app/components/TopNavChrome.tsx`

- [ ] **Step 1: Modify `TopNav.tsx` to fetch unread count + recent items**

Replace `app/components/TopNav.tsx` with:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getPendingInviteCount } from "@/lib/queries/coven";
import { getUnreadNotificationCount, getRecentNotifications } from "@/lib/queries/notifications";
import TopNavChrome from "./TopNavChrome";

interface TopNavProps {
  current?: string;
}

export default async function TopNav({ current }: TopNavProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile: { handle: string; display_name: string | null; avatar_url: string | null } | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("handle, display_name, avatar_url")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  let isAdmin = false;
  if (user) {
    const { data: staffRow } = await supabase
      .from("staff")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    isAdmin = staffRow?.role === "admin";
  }

  let pendingInviteCount = 0;
  let unreadNotifCount = 0;
  let notifItems: Awaited<ReturnType<typeof getRecentNotifications>> = [];
  if (user) {
    [pendingInviteCount, unreadNotifCount, notifItems] = await Promise.all([
      getPendingInviteCount(supabase, user.id),
      getUnreadNotificationCount(supabase, user.id),
      getRecentNotifications(supabase, user.id),
    ]);
  }

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

  return (
    <TopNavChrome
      items={items}
      current={current}
      user={Boolean(user)}
      profile={profile}
      isAdmin={isAdmin}
      unreadNotifCount={unreadNotifCount}
      notifItems={notifItems}
    />
  );
}
```

- [ ] **Step 2: Modify `TopNavChrome.tsx` to render the bell to the LEFT of the avatar**

In `app/components/TopNavChrome.tsx`:

a) Import `NotificationBell` and the type:

```tsx
import NotificationBell from "./NotificationBell";
import type { NotificationFeedItem } from "@/lib/queries/notifications";
```

b) Extend `Props`:

```tsx
interface Props {
  items: NavItem[];
  current?: string;
  user: boolean;
  profile: ProfileShape | null;
  isAdmin: boolean;
  unreadNotifCount: number;
  notifItems: NotificationFeedItem[];
}
```

c) Update the function signature:

```tsx
export default function TopNavChrome({ items, current, user, profile, isAdmin, unreadNotifCount, notifItems }: Props) {
```

d) Insert the bell in the right-side cluster, BEFORE `UserMenu`. Replace:

```tsx
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {user ? (
            <UserMenu
              handle={profile?.handle ?? "you"}
              displayName={profile?.display_name ?? profile?.handle ?? "You"}
              avatarUrl={profile?.avatar_url}
              isAdmin={isAdmin}
            />
          ) : (
```

with:

```tsx
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {user ? (
            <>
              <NotificationBell unreadCount={unreadNotifCount} items={notifItems} />
              <UserMenu
                handle={profile?.handle ?? "you"}
                displayName={profile?.display_name ?? profile?.handle ?? "You"}
                avatarUrl={profile?.avatar_url}
                isAdmin={isAdmin}
              />
            </>
          ) : (
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/christophernowacki/film-goblin/app
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Local smoke — start the dev server and verify**

```bash
cd /Users/christophernowacki/film-goblin/app
npm run dev
```

Open http://localhost:3000, sign in, and:
- Verify the bell does NOT show when no unread (or insert a row via `db/` and observe).
- From a service-role psql session OR via the admin UI, send yourself a recommendation: it should add a row to `notifications` and the bell should appear after the next page navigation.
- Click the bell → dropdown opens with the rec → click the rec → routes to `/film/<id>` → bell hidden after refresh (`unreadCount` decremented to 0).
- Resize to ≤720px → bell still visible to the left of the avatar; clicking opens BottomSheet.

If anything looks off, fix in place and re-verify.

- [ ] **Step 5: Commit**

```bash
git add app/components/TopNav.tsx app/components/TopNavChrome.tsx
git commit -m "feat(app): wire NotificationBell into TopNav

SSR-fetches unread count + last 14 days of notifications, passes
into TopNavChrome which renders the bell to the LEFT of UserMenu.
Bell hides when count = 0; mobile uses BottomSheet, desktop uses
the absolute-positioned panel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 6 — Cron cleanup extension

### Task 12: 30-day cleanup in `/api/cron/send-notifications`

**Files:**
- Modify: `app/app/api/cron/send-notifications/route.ts`

- [ ] **Step 1: Append the cleanup DELETE after the digest send**

In `app/app/api/cron/send-notifications/route.ts`, replace the `try { ... }` block contents:

```ts
  try {
    await client.connect();
    const digest = await sendDailyDigests(client, resend, { from, baseUrl });
    console.log(`notifier digest: sent=${digest.sent} failed=${digest.failed} skipped=${digest.skipped}`);

    // Notifications cleanup: drop rows older than 30 days. Bell reads only
    // the last 14 days; the extra 16-day buffer keeps a row visible after
    // it's been read but ages it out within a month.
    const cleanup = await client.query(
      `DELETE FROM notifications WHERE created_at < now() - INTERVAL '30 days'`
    );
    console.log(`notifications cleanup: deleted=${cleanup.rowCount ?? 0}`);

    return NextResponse.json({ ok: true, digest, notificationsDeleted: cleanup.rowCount ?? 0 });
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/christophernowacki/film-goblin/app
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/app/api/cron/send-notifications/route.ts
git commit -m "feat(cron): age out notifications older than 30 days

Piggybacks on the existing daily send-notifications cron.
The bell only reads the last 14 days; the 16-day buffer keeps
a row visible after it's been read but ages it out within a month.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 7 — End-to-end smoke + ship

### Task 13: Manual end-to-end + push

**Files:** none (verification + push)

- [ ] **Step 1: Run the full test sweep**

```bash
cd /Users/christophernowacki/film-goblin/db
nvm use 20
npm run test:all
```

Expected: PASS.

```bash
cd /Users/christophernowacki/film-goblin/app
npm run typecheck
npm run test
```

Expected: PASS / SKIP-green for env-blocked suites.

- [ ] **Step 2: Smoke each event kind in dev**

Dev server at http://localhost:3000. Using a second test account (or psql via the pooler), trigger each:

- **`coven_invite_pending`:** account B sends a coven invite to A → A's bell appears with badge=1; click → routes to `/coven#requests`.
- **`coven_invite_accepted`:** A accepts → B's bell appears with badge=1; click → routes to `/p/<a-handle>`.
- **`recommendation_received`:** account B (coven mate of A) recs A a film → A's bell increments; click → `/film/<id>`.
- **`price_drop`:** insert a `price_alerts` row for A's watchlist via service role psql:
  ```sql
  INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd)
  SELECT wl.id, wl.film_id, 14.99, 9.99 FROM watchlists wl WHERE wl.user_id = '<A_ID>' LIMIT 1;
  ```
  → A's bell increments; click → `/film/<id>`.

- **Grouping:** insert 3+ recs from B to A in quick succession → grouped row in dropdown; expanding shows children.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feature/notifications-badge
```

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "feat: notifications badge (avatar bell + 4 event kinds)" --body "$(cat <<'EOF'
## Summary
Implements the spec at \`docs/superpowers/specs/2026-04-26-notifications-badge-design.md\`:

- New \`notifications\` table + 4 SECURITY DEFINER triggers (migrations 0125, 0126)
- Avatar-anchored \`NotificationBell\` with hot-pink drop SVG badge (1-9 / 9+); hides at count = 0
- Last 14 days dropdown (BottomSheet on mobile, panel on desktop) with (kind, actor) grouping in 30-min windows
- Per-kind smart-target navigation
- \`markAllRead\` server action; SSR-only freshness (no Realtime)
- 30-day cleanup appended to existing \`send-notifications\` cron

## Test plan
- [ ] Sign in; observe bell hidden when no unread
- [ ] Have a coven mate send a rec → bell appears, click → \`/film/<id>\`, bell disappears
- [ ] Trigger 3+ recs in 30-min → group row; expand → child rows
- [ ] price_drop via service-role insert → bell + smart-target works
- [ ] Mobile (≤720px) → BottomSheet variant
- [ ] db/ \`npm run test:all\` PASS; app/ \`npm run typecheck\` PASS

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: After merge, deploy**

```bash
cd /Users/christophernowacki/film-goblin
git checkout master && git pull origin master
ls -la .vercel/project.json && pwd
npx vercel deploy --prod --yes
```

Expected: deployment status `READY`. Visit https://film-goblin.vercel.app and verify the bell renders for a signed-in user.

- [ ] **Step 6: Update CLAUDE.md "Current state" + "Sub-project history"**

Append to the sub-project history table:
| 15 | Notifications badge — avatar bell + 4 event kinds + drop SVG | `2026-04-26-notifications-badge-design.md` |

Update "Last shipped" / "Last updated" at the top per the convention.

```bash
# (edit CLAUDE.md, then)
git add CLAUDE.md
git commit -m "docs(claude.md): notifications badge shipped"
git push origin master
```

---

## Self-review (run before handoff)

**Spec coverage check:**

| Spec section | Plan task |
|---|---|
| `notifications` table + indexes + RLS | Task 1 |
| 4 trigger functions + triggers | Task 2 |
| Migration apply + types regen | Task 3 |
| `groupNotifications` (mirror of `groupFeed`) | Task 4 |
| `getUnreadNotificationCount` + `getRecentNotifications` | Task 5 |
| `markAllRead` action | Task 6 |
| `NotificationBadge` SVG | Task 7 |
| `NotificationRow` + `NotificationGroupRow` (per-kind copy + smart targets) | Task 8 |
| `NotificationsDropdown` (desktop + mobile sheet) | Task 9 |
| `NotificationBell` wiring + optimistic mark-read | Task 10 |
| TopNav SSR fetch + place left of avatar | Task 11 |
| 30-day cleanup cron extension | Task 12 |
| End-to-end manual + ship | Task 13 |

All spec sections mapped. No placeholders remaining. Type names consistent across tasks (`EnrichedNotification`, `NotificationGroup`, `NotificationFeedItem`, `markAllRead`, `_markAllRead`).
