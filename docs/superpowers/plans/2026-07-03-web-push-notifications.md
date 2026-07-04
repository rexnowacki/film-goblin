# Web Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver in-app notifications (social kinds + price drops) as Web Push to subscribed devices, opt-in via a single Settings toggle.

**Architecture:** An `AFTER INSERT` trigger on `notifications` fires an async `pg_net` POST to `/api/push/fanout`, which filters by a kind allowlist, builds a goblin-voiced payload, and sends via the `web-push` library to every `push_subscriptions` row for that user. A minimal service worker (`/sw.js`) displays notifications and deep-links on tap. Spec: `docs/superpowers/specs/2026-07-03-web-push-notifications-design.md`.

**Tech Stack:** Next.js 15 App Router route handler, Supabase (Postgres + pg_net + RLS), `web-push` npm package, plain service worker (no caching).

## Global Constraints

- Node 20: prefix all npm/node commands with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH` (run from the package dir stated in each step).
- Branch: all work on `feature/web-push-notifications` (already exists, spec committed).
- Never commit to master; commit after every task. If `git commit -m` mangles the message, use `git commit -F /tmp/msg.txt` (root CLAUDE.md gotcha).
- User-facing copy says **"Apple TV"**, never "iTunes" (`app/components/CLAUDE.md`).
- Do NOT edit `app/lib/supabase/types.ts` (two-machine collision hot spot). Use the established cast pattern `client as unknown as { from: (t: string) => any }` for the new table, as `app/lib/actions/admin/films.ts` does.
- Server actions follow the `_private`/public split (`app/lib/actions/CLAUDE.md`); `requireAuthUser` from `@/lib/auth/require-auth-user`.
- Rollout order (Task 7): **app deploy first, then migration 0208, then insert the config row.**
- New env vars: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_FANOUT_SECRET`.

---

### Task 1: Migration 0208 — `push_subscriptions`, config table, pg_net trigger

**Files:**
- Create: `db/migrations/0208_push_subscriptions.sql`
- Modify: `db/tests/helpers/pg-mem.ts` (strip `CREATE EXTENSION pg_net`)
- Test: `db/tests/rls/push_subscriptions.test.ts`

**Interfaces:**
- Produces: table `push_subscriptions(id, user_id, endpoint UNIQUE, p256dh, auth, user_agent, created_at)`; table `push_fanout_config(id, url, secret)` (service-role only); trigger `on_notification_insert_push` calling `/api/push/fanout` with JSON body `{"notification_id": "<uuid>"}` and header `Authorization: Bearer <secret>`.

- [ ] **Step 1: Write the failing RLS test**

Create `db/tests/rls/push_subscriptions.test.ts`:

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
  await db.client.query(`DELETE FROM push_subscriptions`);
  await commit(db.client);
});

function sub(userId: string, endpoint: string) {
  return {
    text: `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
           VALUES ($1, $2, 'p256dh-key', 'auth-key')`,
    values: [userId, endpoint],
  };
}

describe("RLS: push_subscriptions", () => {
  it("owner can INSERT own subscription", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const q = sub(fx.userA.id, "https://push.example/a1");
      await db.client.query(q.text, q.values);
      const r = await db.client.query(`SELECT * FROM push_subscriptions`);
      expect(r.rowCount).toBe(1);
      await commit(db.client);
    } catch (e) { await rollback(db.client); throw e; }
  });

  it("user cannot INSERT a subscription for someone else", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const q = sub(fx.userB.id, "https://push.example/b1");
      await expect(db.client.query(q.text, q.values)).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("user cannot SELECT another user's subscriptions", async () => {
    await beginAs(db.client, null, "service_role");
    const q = sub(fx.userA.id, "https://push.example/a2");
    await db.client.query(q.text, q.values);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM push_subscriptions`);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("owner can DELETE own subscription; cannot delete another's", async () => {
    await beginAs(db.client, null, "service_role");
    const qa = sub(fx.userA.id, "https://push.example/a3");
    const qb = sub(fx.userB.id, "https://push.example/b3");
    await db.client.query(qa.text, qa.values);
    await db.client.query(qb.text, qb.values);
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      // Deleting B's row silently affects 0 rows under RLS.
      const rb = await db.client.query(
        `DELETE FROM push_subscriptions WHERE endpoint = 'https://push.example/b3'`
      );
      expect(rb.rowCount).toBe(0);
      const ra = await db.client.query(
        `DELETE FROM push_subscriptions WHERE endpoint = 'https://push.example/a3'`
      );
      expect(ra.rowCount).toBe(1);
      await commit(db.client);
    } catch (e) { await rollback(db.client); throw e; }

    await beginAs(db.client, null, "service_role");
    const left = await db.client.query(`SELECT endpoint FROM push_subscriptions`);
    await commit(db.client);
    expect(left.rows.map(r => r.endpoint)).toEqual(["https://push.example/b3"]);
  });

  it("anon cannot read push_fanout_config (deny-all RLS)", async () => {
    await beginAs(db.client, null, "anon");
    try {
      // Either 0 rows (RLS) or permission denied (no grant) — both prove denial.
      const r = await db.client
        .query(`SELECT * FROM push_fanout_config`)
        .then(res => res.rowCount)
        .catch(() => 0);
      expect(r).toBe(0);
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

From `db/` (Docker/Colima must be running — see memory note `reference_db_url_and_testcontainers`):

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/rls/push_subscriptions.test.ts
```

Expected: FAIL with `relation "push_subscriptions" does not exist`.

- [ ] **Step 3: Write the migration**

Create `db/migrations/0208_push_subscriptions.sql`:

```sql
-- Web Push subscriptions + fanout trigger.
-- One push_subscriptions row per device/browser. The Settings toggle
-- subscribes/unsubscribes the current device; row existence is the state.
--
-- Fanout: AFTER INSERT on notifications fires an async pg_net POST to the
-- app's /api/push/fanout route. Fail-soft by design: if config is missing or
-- the endpoint is down, the notification insert still succeeds.
--
-- push_fanout_config holds the fanout URL + shared secret. The secret is NOT
-- in this file — insert the single row manually post-migration (see
-- docs/superpowers/plans/2026-07-03-web-push-notifications.md Task 7).

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_owner_select ON push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY push_subscriptions_owner_insert ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY push_subscriptions_owner_delete ON push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON push_subscriptions TO authenticated;

-- Single-row config table. RLS enabled with NO policies and NO grants:
-- only service_role (bypasses RLS) and the SECURITY DEFINER trigger read it.
CREATE TABLE push_fanout_config (
  id     BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  url    TEXT NOT NULL,
  secret TEXT NOT NULL
);

ALTER TABLE push_fanout_config ENABLE ROW LEVEL SECURITY;

-- search_path must include `extensions`: pg_net's net.http_post lives there
-- in Supabase (same lesson as mig 0176 / pgcrypto).
CREATE OR REPLACE FUNCTION public.notify_push_fanout()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, net AS $$
DECLARE
  cfg RECORD;
BEGIN
  SELECT url, secret INTO cfg FROM push_fanout_config WHERE id;
  IF NOT FOUND THEN
    RAISE WARNING 'notify_push_fanout: push_fanout_config row missing; push skipped for notification %', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := cfg.url,
    body    := jsonb_build_object('notification_id', NEW.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cfg.secret
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_notification_insert_push
AFTER INSERT ON notifications
FOR EACH ROW EXECUTE FUNCTION public.notify_push_fanout();
```

- [ ] **Step 4: Teach pg-mem to skip pg_net**

In `db/tests/helpers/pg-mem.ts`, the statement filter chain (around line 112–133) already strips `CREATE TRIGGER` and plpgsql functions. Add one filter alongside the existing `.filter(stmt => !/CREATE\s+TRIGGER\b/i.test(stmt))` line:

```ts
      // pg-mem throws on unknown extensions; pg_net is Supabase infra.
      .filter(stmt => !/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pg_net\b/i.test(stmt))
```

- [ ] **Step 5: Run both db suites**

From `db/`:

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/rls/push_subscriptions.test.ts
```

Expected: pg-mem smoke PASS (0208 tables present); RLS suite PASS (all 5 tests).

Note: if the testcontainers helper applies migrations against real Postgres and `CREATE EXTENSION pg_net` fails there (plain `postgres` image has no pg_net), guard the extension line instead:

```sql
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pg_net unavailable (non-Supabase environment): %', SQLERRM;
END $$;
```

and wrap the `PERFORM net.http_post(...)` call in the same `BEGIN…EXCEPTION WHEN undefined_function THEN RAISE WARNING…END` pattern so the trigger stays fail-soft where pg_net is absent. Use this guarded form only if the plain form breaks `test:rls`.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0208_push_subscriptions.sql db/tests/helpers/pg-mem.ts db/tests/rls/push_subscriptions.test.ts
git commit -m "feat(db): push_subscriptions + pg_net fanout trigger (mig 0208)"
```

---

### Task 2: Push payload builder (pure module)

**Files:**
- Create: `app/lib/push/payload.ts`
- Test: `app/tests/push/payload.test.ts`

**Interfaces:**
- Consumes: `notificationTarget` from `@/lib/notifications/display` (existing; maps kind+payload → app path).
- Produces:
  - `PUSH_KINDS: ReadonlySet<string>` — the v1 allowlist.
  - `buildPushPayload(input: PushPayloadInput): PushPayload | null` where

```ts
export interface PushPayloadInput {
  kind: string;
  payload: Record<string, unknown>;
  actor: { username: string; display_name: string | null } | null;
  filmTitle: string | null;
}
export interface PushPayload {
  title: string;
  body: string;
  url: string;   // app-relative path, e.g. /film/<id>
  tag: string;   // stable per event so repeats collapse
}
```

- [ ] **Step 1: Write the failing tests**

Create `app/tests/push/payload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PUSH_KINDS, buildPushPayload } from "@/lib/push/payload";

const actor = { username: "moss.witch", display_name: "Moss Witch" };

describe("PUSH_KINDS", () => {
  it("contains exactly the v1 allowlist", () => {
    expect([...PUSH_KINDS].sort()).toEqual([
      "comment_on_activity",
      "coven_invite_accepted",
      "coven_invite_pending",
      "gazing_rsvp",
      "price_drop",
      "recommendation_received",
      "reply_on_comment",
    ]);
  });
});

describe("buildPushPayload", () => {
  it("returns null for non-allowlisted kinds", () => {
    expect(buildPushPayload({ kind: "rate_reminder", payload: {}, actor: null, filmTitle: null })).toBeNull();
    expect(buildPushPayload({ kind: "like_on_comment", payload: {}, actor, filmTitle: null })).toBeNull();
  });

  it("coven invite pending", () => {
    const p = buildPushPayload({
      kind: "coven_invite_pending",
      payload: { coven_request_id: "cr-1" },
      actor,
      filmTitle: null,
    });
    expect(p).toEqual({
      title: "A summons to your coven",
      body: "Moss Witch wants to join your coven.",
      url: "/coven#requests",
      tag: "coven_invite_pending:cr-1",
    });
  });

  it("coven invite accepted deep-links to the actor profile", () => {
    const p = buildPushPayload({
      kind: "coven_invite_accepted",
      payload: { coven_request_id: "cr-2" },
      actor,
      filmTitle: null,
    });
    expect(p!.url).toBe("/p/moss.witch");
    expect(p!.body).toBe("Moss Witch accepted your summons.");
    expect(p!.tag).toBe("coven_invite_accepted:cr-2");
  });

  it("recommendation received", () => {
    const p = buildPushPayload({
      kind: "recommendation_received",
      payload: { recommendation_id: "r-1", film_id: "f-1" },
      actor,
      filmTitle: "Terrifier 2",
    });
    expect(p).toEqual({
      title: "A film is pressed into your hands",
      body: "Moss Witch recommends Terrifier 2.",
      url: "/film/f-1",
      tag: "recommendation_received:r-1",
    });
  });

  it("comment on activity truncates the body to 90 chars", () => {
    const long = "x".repeat(200);
    const p = buildPushPayload({
      kind: "comment_on_activity",
      payload: { activity_id: "a-1", comment_id: "c-1", body: long },
      actor,
      filmTitle: null,
    });
    expect(p!.title).toBe("Moss Witch commented");
    expect(p!.body.length).toBeLessThanOrEqual(91); // 90 + ellipsis char
    expect(p!.url).toBe("/home?activity=a-1");
    expect(p!.tag).toBe("comment_on_activity:c-1");
  });

  it("reply on comment", () => {
    const p = buildPushPayload({
      kind: "reply_on_comment",
      payload: { activity_id: "a-2", comment_id: "c-2", body: "agreed" },
      actor,
      filmTitle: null,
    });
    expect(p!.title).toBe("Moss Witch replied");
    expect(p!.body).toBe("agreed");
  });

  it("gazing rsvp deep-links to the gazing token page", () => {
    const p = buildPushPayload({
      kind: "gazing_rsvp",
      payload: { invite_id: "i-1", film_id: "f-2", token: "tok123" },
      actor,
      filmTitle: "Suspiria",
    });
    expect(p).toEqual({
      title: "Another gazer joins",
      body: "Moss Witch will be there for Suspiria.",
      url: "/gazing/tok123",
      tag: "gazing_rsvp:i-1",
    });
  });

  it("price drop says Apple TV and formats dollars", () => {
    const p = buildPushPayload({
      kind: "price_drop",
      payload: { price_alert_id: "pa-1", film_id: "f-3", old_price_usd: 14.99, new_price_usd: 4.99 },
      actor: null,
      filmTitle: "The Witch",
    });
    expect(p).toEqual({
      title: "The Witch — the price fell",
      body: "Now $4.99 on Apple TV (was $14.99).",
      url: "/film/f-3",
      tag: "price_drop:pa-1",
    });
  });

  it("falls back to username when display_name is null", () => {
    const p = buildPushPayload({
      kind: "coven_invite_pending",
      payload: { coven_request_id: "cr-3" },
      actor: { username: "ghoul", display_name: null },
      filmTitle: null,
    });
    expect(p!.body).toBe("ghoul wants to join your coven.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

From `app/`:

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/push/payload.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/push/payload'`.

- [ ] **Step 3: Implement the module**

Create `app/lib/push/payload.ts`:

```ts
// Pure payload builder for Web Push. Consumed by /api/push/fanout.
// v1 allowlist = social kinds + price drops (spec 2026-07-03). Kinds outside
// the set return null — the fanout drops them silently.

export const PUSH_KINDS: ReadonlySet<string> = new Set([
  "coven_invite_pending",
  "coven_invite_accepted",
  "recommendation_received",
  "comment_on_activity",
  "reply_on_comment",
  "gazing_rsvp",
  "price_drop",
]);

export interface PushPayloadInput {
  kind: string;
  payload: Record<string, unknown>;
  actor: { username: string; display_name: string | null } | null;
  filmTitle: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

const BODY_MAX = 90;

function truncate(s: string): string {
  return s.length > BODY_MAX ? `${s.slice(0, BODY_MAX)}…` : s;
}

function usd(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "a new low";
}

export function buildPushPayload(input: PushPayloadInput): PushPayload | null {
  const { kind, payload, actor, filmTitle } = input;
  if (!PUSH_KINDS.has(kind)) return null;

  const who = actor ? (actor.display_name ?? actor.username) : "Someone";
  const film = filmTitle ?? "a film";
  const str = (k: string): string | null =>
    typeof payload[k] === "string" ? (payload[k] as string) : null;

  switch (kind) {
    case "coven_invite_pending":
      return {
        title: "A summons to your coven",
        body: `${who} wants to join your coven.`,
        url: "/coven#requests",
        tag: `coven_invite_pending:${str("coven_request_id") ?? "x"}`,
      };
    case "coven_invite_accepted":
      return {
        title: "Your coven grows",
        body: `${who} accepted your summons.`,
        url: actor ? `/p/${encodeURIComponent(actor.username)}` : "/coven",
        tag: `coven_invite_accepted:${str("coven_request_id") ?? "x"}`,
      };
    case "recommendation_received":
      return {
        title: "A film is pressed into your hands",
        body: `${who} recommends ${film}.`,
        url: str("film_id") ? `/film/${str("film_id")}` : "/home",
        tag: `recommendation_received:${str("recommendation_id") ?? "x"}`,
      };
    case "comment_on_activity":
    case "reply_on_comment": {
      const activityId = str("activity_id");
      return {
        title: kind === "comment_on_activity" ? `${who} commented` : `${who} replied`,
        body: truncate(str("body") ?? ""),
        url: activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home",
        tag: `${kind}:${str("comment_id") ?? "x"}`,
      };
    }
    case "gazing_rsvp":
      return {
        title: "Another gazer joins",
        body: `${who} will be there for ${film}.`,
        url: str("token") ? `/gazing/${str("token")}` : "/home",
        tag: `gazing_rsvp:${str("invite_id") ?? "x"}`,
      };
    case "price_drop":
      return {
        title: `${film} — the price fell`,
        body: `Now ${usd(payload.new_price_usd)} on Apple TV (was ${usd(payload.old_price_usd)}).`,
        url: str("film_id") ? `/film/${str("film_id")}` : "/home",
        tag: `price_drop:${str("price_alert_id") ?? "x"}`,
      };
    default:
      return null;
  }
}
```

Note: URL shapes deliberately mirror `notificationTarget` in
`app/lib/notifications/display.tsx` so a push tap and a bell tap land on the
same surface. `notificationTarget` isn't imported directly because it takes a
UI-enriched notification object; keep the two in sync if either changes.

- [ ] **Step 4: Run tests to verify they pass**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/push/payload.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/push/payload.ts app/tests/push/payload.test.ts
git commit -m "feat(push): payload builder + v1 kind allowlist"
```

---

### Task 3: Fanout route

**Files:**
- Modify: `app/package.json` (add `web-push` + `@types/web-push`)
- Create: `app/app/api/push/fanout/route.ts`
- Create: `app/lib/push/send.ts`
- Test: `app/tests/push/fanout-auth.test.ts`

**Interfaces:**
- Consumes: `PUSH_KINDS`, `buildPushPayload` (Task 2); `serviceRoleClient` from `@/lib/supabase/service-role`; table `push_subscriptions` (Task 1).
- Produces: `POST /api/push/fanout` accepting `{"notification_id": "<uuid>"}` with `Authorization: Bearer $PUSH_FANOUT_SECRET`; `sendToSubscriptions(subs, payload)` in `send.ts`.

- [ ] **Step 1: Install web-push**

From `app/`:

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm install web-push
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm install -D @types/web-push
```

- [ ] **Step 2: Write the failing auth test**

Create `app/tests/push/fanout-auth.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// The route imports web-push and the service-role client at module scope;
// stub env before importing so module init doesn't throw.
beforeEach(() => {
  vi.stubEnv("PUSH_FANOUT_SECRET", "test-secret");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-priv");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
});

function req(auth: string | null, body: unknown): Request {
  return new Request("http://localhost/api/push/fanout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/push/fanout auth", () => {
  it("401 without Authorization header", async () => {
    const { POST } = await import("@/app/api/push/fanout/route");
    const res = await POST(req(null, { notification_id: "n-1" }));
    expect(res.status).toBe(401);
  });

  it("401 with wrong secret", async () => {
    const { POST } = await import("@/app/api/push/fanout/route");
    const res = await POST(req("Bearer wrong", { notification_id: "n-1" }));
    expect(res.status).toBe(401);
  });

  it("400 with correct secret but missing notification_id", async () => {
    const { POST } = await import("@/app/api/push/fanout/route");
    const res = await POST(req("Bearer test-secret", {}));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/push/fanout-auth.test.ts
```

Expected: FAIL — cannot resolve `@/app/api/push/fanout/route`.

- [ ] **Step 4: Implement the send helper**

Create `app/lib/push/send.ts`:

```ts
import webpush, { WebPushError } from "web-push";
import type { PushPayload } from "./payload";

export interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendOutcome {
  sent: number;
  failed: number;
  /** subscription ids whose endpoints are gone (404/410) — delete these rows */
  dead: string[];
}

let vapidConfigured = false;

function configureVapid(): void {
  if (vapidConfigured) return;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    throw new Error("VAPID env vars missing (VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export async function sendToSubscriptions(
  subs: SubscriptionRow[],
  payload: PushPayload,
): Promise<SendOutcome> {
  configureVapid();
  const outcome: SendOutcome = { sent: 0, failed: 0, dead: [] };
  const body = JSON.stringify(payload);

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      );
      outcome.sent += 1;
    } catch (err) {
      if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
        outcome.dead.push(s.id);
      } else {
        outcome.failed += 1;
        console.warn("push send failed:", err instanceof Error ? err.message : err);
      }
    }
  }));

  return outcome;
}
```

- [ ] **Step 5: Implement the route**

Create `app/app/api/push/fanout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { buildPushPayload } from "@/lib/push/payload";
import { sendToSubscriptions, type SubscriptionRow } from "@/lib/push/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by the pg_net trigger on notifications INSERT (mig 0208). pg_net
// does not retry and there is no useful failure signal to return to it, so
// every handled outcome after auth/validation is a 200.
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.PUSH_FANOUT_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let notificationId: string | null = null;
  try {
    const body = await request.json();
    if (typeof body?.notification_id === "string") notificationId = body.notification_id;
  } catch {
    // fall through to 400
  }
  if (!notificationId) {
    return NextResponse.json({ error: "notification_id required" }, { status: 400 });
  }

  const svc = serviceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = svc as unknown as { from: (t: string) => any };

  const { data: n, error: nErr } = await c
    .from("notifications")
    .select("id, user_id, kind, actor_user_id, payload")
    .eq("id", notificationId)
    .maybeSingle();
  if (nErr) {
    console.error("push fanout: notification load failed:", nErr.message);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
  if (!n) return NextResponse.json({ ok: true, dropped: "not_found" }, { status: 200 });

  const { data: subs, error: sErr } = await c
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", n.user_id);
  if (sErr) {
    console.error("push fanout: subscriptions load failed:", sErr.message);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, dropped: "no_subscriptions" }, { status: 200 });
  }

  const payload = (n.payload ?? {}) as Record<string, unknown>;
  const filmId = typeof payload.film_id === "string" ? payload.film_id : null;

  const [actorRes, filmRes] = await Promise.all([
    n.actor_user_id
      ? c.from("profiles").select("username, display_name").eq("id", n.actor_user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    filmId
      ? c.from("films").select("title").eq("id", filmId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const push = buildPushPayload({
    kind: n.kind,
    payload,
    actor: actorRes.data ?? null,
    filmTitle: filmRes.data?.title ?? null,
  });
  if (!push) return NextResponse.json({ ok: true, dropped: "kind" }, { status: 200 });

  const outcome = await sendToSubscriptions(subs as SubscriptionRow[], push);

  if (outcome.dead.length > 0) {
    const { error: delErr } = await c
      .from("push_subscriptions")
      .delete()
      .in("id", outcome.dead);
    if (delErr) console.warn("push fanout: dead-subscription prune failed:", delErr.message);
  }

  return NextResponse.json({ ok: true, sent: outcome.sent, failed: outcome.failed, pruned: outcome.dead.length });
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/push/fanout-auth.test.ts
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: 3 tests PASS; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add app/package.json app/package-lock.json app/lib/push/send.ts app/app/api/push/fanout/route.ts app/tests/push/fanout-auth.test.ts
git commit -m "feat(push): fanout route + web-push sender"
```

---

### Task 4: Service worker

**Files:**
- Create: `app/public/sw.js`

**Interfaces:**
- Consumes: push messages whose JSON body is a `PushPayload` (`{title, body, url, tag}` — Task 2 shape).
- Produces: `/sw.js` at site root (scope `/`), registered by `PushToggle` (Task 6).

- [ ] **Step 1: Write the worker**

Create `app/public/sw.js`:

```js
/* Film Goblin push service worker. Single-purpose: display push
   notifications and deep-link on tap. NO caching / fetch handling —
   offline behavior is out of scope by design (see spec 2026-07-03). */

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  if (!payload || !payload.title) return;
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body || "",
      tag: payload.tag || undefined,
      icon: "/icons/icon-192.png",
      data: { url: payload.url || "/home" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/home";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).pathname === url.split("?")[0] && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
```

- [ ] **Step 2: Sanity-check it parses**

From `app/`:

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH node --check public/sw.js
```

Expected: no output (parses clean). Behavioral verification is the Task 7 smoke — service workers aren't unit-testable in this repo's setup.

- [ ] **Step 3: Commit**

```bash
git add app/public/sw.js
git commit -m "feat(push): service worker (display + deep link only)"
```

---

### Task 5: Subscribe/unsubscribe server actions

**Files:**
- Create: `app/lib/actions/push.ts`
- Test: `app/tests/actions/push.test.ts` (env-blocked integration)

**Interfaces:**
- Consumes: `requireAuthUser`, `serviceRoleClient`, `createClient` from `@/lib/supabase/server`; table `push_subscriptions` (Task 1).
- Produces (consumed by `PushToggle`, Task 6):

```ts
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export async function subscribeToPush(input: PushSubscriptionInput, userAgent?: string): Promise<{ ok: boolean; error?: string }>;
export async function unsubscribeFromPush(endpoint: string): Promise<{ ok: boolean; error?: string }>;
```

- [ ] **Step 1: Write the failing integration test**

Create `app/tests/actions/push.test.ts` following the env-blocked template (`app/lib/actions/CLAUDE.md`) — copy the auth/user bootstrap from `app/tests/actions/library.test.ts` (create the test user the same way that file does, then adapt):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { _subscribeToPush, _unsubscribeFromPush } from "@/lib/actions/push";

const hasEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!hasEnv)("push subscription actions", () => {
  // Bootstrap: mirror app/tests/actions/library.test.ts — create a throwaway
  // user via service role, sign in a user-scoped client, clean up in afterAll.
  // (Copy that file's beforeAll/afterAll verbatim, adjusting table cleanup to
  // `push_subscriptions`.)
  let userClient: ReturnType<typeof createClient>;
  let svc: ReturnType<typeof createClient>;
  let userId: string;

  beforeAll(async () => {
    if (!hasEnv) return;
    // ... library.test.ts bootstrap ...
  });

  afterAll(async () => {
    if (!hasEnv) return;
    await svc.from("push_subscriptions").delete().eq("user_id", userId);
    // ... library.test.ts user teardown ...
  });

  const sub = (endpoint: string) => ({
    endpoint,
    keys: { p256dh: "test-p256dh", auth: "test-auth" },
  });

  it("subscribe inserts a row; resubscribe with same endpoint replaces it", async () => {
    if (!hasEnv) return;
    await _subscribeToPush(userClient, svc, sub("https://push.example/int-1"), "vitest");
    await _subscribeToPush(userClient, svc, sub("https://push.example/int-1"), "vitest");
    const { data } = await svc
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", "https://push.example/int-1");
    expect(data).toHaveLength(1);
  });

  it("rejects a non-https endpoint", async () => {
    if (!hasEnv) return;
    await expect(
      _subscribeToPush(userClient, svc, sub("http://insecure.example/x"), "vitest"),
    ).rejects.toThrow(/https/i);
  });

  it("unsubscribe deletes the row", async () => {
    if (!hasEnv) return;
    await _subscribeToPush(userClient, svc, sub("https://push.example/int-2"), "vitest");
    await _unsubscribeFromPush(userClient, "https://push.example/int-2");
    const { data } = await svc
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", "https://push.example/int-2");
    expect(data).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it (skips without env, fails with env)**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/actions/push.test.ts
```

Expected without local Supabase env: SKIPPED (file green, 0 run). With env: FAIL — module not found.

- [ ] **Step 3: Implement the actions**

Create `app/lib/actions/push.ts`:

```ts
"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { requireAuthUser } from "@/lib/auth/require-auth-user";

type Client = SupabaseClient<Database>;

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function validate(input: PushSubscriptionInput): void {
  let url: URL;
  try {
    url = new URL(input.endpoint);
  } catch {
    throw new Error("endpoint is not a valid URL");
  }
  if (url.protocol !== "https:") throw new Error("endpoint must be https");
  if (!input.keys?.p256dh || !input.keys?.auth) throw new Error("subscription keys missing");
}

/**
 * The delete-by-endpoint runs via SERVICE ROLE, not the caller: a device
 * re-subscribing under a different account must clear the previous owner's
 * row, which owner-scoped RLS cannot do (endpoint is UNIQUE). Endpoints are
 * unguessable push-service URLs — possession proves device control.
 */
export async function _subscribeToPush(
  client: Client,
  svc: Client,
  input: PushSubscriptionInput,
  userAgent: string | null,
): Promise<void> {
  const user = await requireAuthUser(client);
  validate(input);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = svc as unknown as { from: (t: string) => any };
  const { error: delErr } = await s
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", input.endpoint);
  if (delErr) throw delErr;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (t: string) => any };
  const { error: insErr } = await c.from("push_subscriptions").insert({
    user_id: user.id,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    user_agent: userAgent,
  });
  if (insErr) throw insErr;
}

export async function _unsubscribeFromPush(client: Client, endpoint: string): Promise<void> {
  await requireAuthUser(client);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (t: string) => any };
  // Owner-scoped RLS: deleting someone else's endpoint silently affects 0 rows.
  const { error } = await c.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw error;
}

export async function subscribeToPush(
  input: PushSubscriptionInput,
  userAgent?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await _subscribeToPush(supabase, serviceRoleClient(), input, userAgent ?? null);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "subscribe failed" };
  }
}

export async function unsubscribeFromPush(endpoint: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await _unsubscribeFromPush(supabase, endpoint);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unsubscribe failed" };
  }
}
```

(No `revalidatePath` — nothing rendered reads subscriptions.)

- [ ] **Step 4: Run tests + typecheck**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/actions/push.test.ts
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: PASS (or SKIP without env — then run the full suite to confirm nothing broke); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add app/lib/actions/push.ts app/tests/actions/push.test.ts
git commit -m "feat(push): subscribe/unsubscribe server actions"
```

---

### Task 6: PushToggle component + Settings wiring

**Files:**
- Create: `app/components/settings/PushToggle.tsx`
- Modify: `app/app/settings/page.tsx` (add nav entry + section)

**Interfaces:**
- Consumes: `subscribeToPush`, `unsubscribeFromPush` (Task 5); `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; `/sw.js` (Task 4).

- [ ] **Step 1: Write the component**

Create `app/components/settings/PushToggle.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/actions/push";

type State =
  | "loading"
  | "unsupported"   // no PushManager (e.g. iOS Safari outside Home-Screen install)
  | "denied"        // browser permission denied
  | "off"
  | "on"
  | "busy";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export default function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!cancelled) setState(sub ? "on" : "off");
    })();
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    setState("busy");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("push is not configured");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("browser returned an incomplete subscription");
      }
      const res = await subscribeToPush(
        { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
        navigator.userAgent,
      );
      if (!res.ok) throw new Error(res.error ?? "subscribe failed");
      setState("on");
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not enable push");
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await unsubscribeFromPush(endpoint);
      }
      setState("off");
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not disable push");
      setState("on");
    }
  }

  if (state === "loading") return null;

  if (state === "unsupported") {
    return (
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
        Push isn&apos;t available in this browser. On iPhone, install Film Goblin
        to your Home Screen (Share → Add to Home Screen), then enable push here.
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
        Notifications are blocked for Film Goblin in your browser settings.
        Allow them there, then return here.
      </p>
    );
  }

  const on = state === "on";
  return (
    <div>
      <button
        type="button"
        className="btn btn-outline-bone"
        disabled={state === "busy"}
        onClick={on ? disable : enable}
        aria-pressed={on}
      >
        {state === "busy" ? "…" : on ? "Push: on — disable" : "Enable push notifications"}
      </button>
      <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>
        Coven news, recommendations, gazing RSVPs, and price drops — sent to
        this device.
      </p>
      {error && (
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--blood, #c33)" }}>{error}</p>
      )}
    </div>
  );
}
```

Before finishing, check `app/styles/00-core.css` for the exact secondary
button class (`.btn-outline-bone` per `app/components/CLAUDE.md`) and match
the section markup below to how neighboring settings sections are structured
(read the `#notifications` section in `app/app/settings/page.tsx` and copy
its heading/container pattern exactly).

- [ ] **Step 2: Wire into the settings page**

In `app/app/settings/page.tsx`:

1. Add to `SETTINGS_NAV` after the `#notifications` entry:

```ts
  { href: "#push", label: "Push" },
```

2. Import the component:

```ts
import PushToggle from "@/components/settings/PushToggle";
```

3. Add a section next to the existing `#notifications` section, copying the surrounding section wrapper markup used by its neighbors, with:

```tsx
<section id="push">
  {/* heading in the same style as sibling sections, text: "Push notifications" */}
  <PushToggle />
</section>
```

- [ ] **Step 3: Verify**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: clean. Then a quick visual check:

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Open `http://localhost:3000/settings` signed in — the Push section renders; in a plain desktop browser without env keys the toggle should surface the "push is not configured" error only on click, and the unsupported/denied branches should read correctly (test by toggling browser notification permission).

- [ ] **Step 4: Commit**

```bash
git add app/components/settings/PushToggle.tsx app/app/settings/page.tsx
git commit -m "feat(push): settings toggle + opt-in flow"
```

---

### Task 7: Env, deploy, migrate, config row, smoke (runbook)

**Files:**
- Modify: `app/.env.local` (add 4 vars)
- Modify: root `CLAUDE.md` (Current state + Open threads: push env rotation note)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Generate VAPID keys and set env**

From repo root:

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx web-push generate-vapid-keys
openssl rand -base64 32   # → PUSH_FANOUT_SECRET
```

Append to `app/.env.local`: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:nowacki.chris@gmail.com`, `PUSH_FANOUT_SECRET`. Then add each to Vercel (all environments; private key + fanout secret as Sensitive):

```bash
cd .. && for v in NEXT_PUBLIC_VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT PUSH_FANOUT_SECRET; do
  PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel env add $v production
done
```

(Also add to `preview` if preview deploys should push — not required for v1.)

- [ ] **Step 2: Open PR, merge after review, deploy app FIRST**

```bash
git push -u origin feature/web-push-notifications
gh pr create --title "feat: web push notifications" --body "Spec: docs/superpowers/specs/2026-07-03-web-push-notifications-design.md. Rollout: app deploy FIRST, then mig 0208, then config row insert."
# after merge:
git checkout master && git fetch origin && git merge --ff-only origin/master
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel deploy --prod --yes   # from repo root — never app/
```

- [ ] **Step 3: Apply migration 0208 to prod**

```bash
set -a; source app/.env.local; set +a
cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
```

(Uses the session-mode pooler `DATABASE_URL` — see `db/migrations/CLAUDE.md`.)

- [ ] **Step 4: Insert the fanout config row**

Via the db pg pattern (psql-less; see film-goblin-run-and-operate), with values from `.env.local`:

```sql
INSERT INTO push_fanout_config (url, secret)
VALUES ('https://film-goblin.vercel.app/api/push/fanout', '<PUSH_FANOUT_SECRET value>')
ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, secret = EXCLUDED.secret;
```

- [ ] **Step 5: Smoke test end-to-end**

1. Route auth: `curl -s -o /dev/null -w "%{http_code}" -X POST https://film-goblin.vercel.app/api/push/fanout` → expect `401`.
2. On the owner's iPhone (Home-Screen install): Settings → enable push → permission prompt → toggle reads "on". Confirm the row: `SELECT user_id, left(endpoint, 40), user_agent FROM push_subscriptions;`
3. Have moss.witch (owner signs in — QA account, password never stored) send the owner a recommendation. Expect: push arrives on the phone; tapping opens the film page.
4. Desktop Chrome pass: enable on desktop, repeat.
5. If nothing arrives: check `SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;` (pg_net's response log) — a 401 there means the config-row secret mismatches Vercel's; no rows means the trigger didn't fire (check `push_fanout_config` has its row).

- [ ] **Step 6: Update root CLAUDE.md and commit**

Add to "Open threads": VAPID key rotation invalidates all subscriptions (users must re-toggle); `PUSH_FANOUT_SECRET` rotation = regenerate → update Vercel env + `push_fanout_config` row + `.env.local` → redeploy. Update "Current state" per the wrapup convention.

```bash
git checkout -b docs/web-push-wrapup && git add CLAUDE.md && git commit -m "docs: record web push ship" && git push -u origin docs/web-push-wrapup && gh pr create --fill
```

---

## Self-review notes

- **Spec coverage:** migration/RLS (Task 1), allowlist + payload + goblin copy + "Apple TV" naming (Task 2), fanout + dead-subscription pruning + always-200 (Task 3), minimal SW (Task 4), actions + service-role endpoint takeover (Task 5), toggle + iOS hint + denied state (Task 6), env/rollout-order/config-row/smoke + rotation docs (Task 7). Out-of-scope items untouched. ✓
- **Types:** `PushPayload` (T2) is the SW message shape (T4) and `sendToSubscriptions` body (T3); `PushSubscriptionInput` (T5) matches `PushSubscription.toJSON()` fields used in T6; `SubscriptionRow` matches the T1 column names. ✓
- **Known judgment call:** pg_net availability in the testcontainers image — Task 1 Step 5 carries the guarded fallback rather than pretending it can't happen.
