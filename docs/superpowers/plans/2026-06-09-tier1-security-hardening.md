# Tier 1 Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock down the `profiles` table with column-level grants, add IP-keyed rate limiting to the pre-auth surface, and add DB CHECK constraints so PostgREST writes can't bypass app validation.

**Architecture:** Three migrations (0203 grants, 0204 IP rate-limit table+RPC, 0205 CHECK constraints) plus targeted app changes: one explicit-select fix, new helpers in `lib/rate-limit.ts`, throttle wiring + password-min-8 in the auth actions, a cron cleanup, and friendly length validation. RLS policies are untouched; grants and constraints layer on top.

**Tech Stack:** Postgres column-level privileges, plpgsql SECURITY DEFINER RPC (mirrors mig 0190), Next.js 15 server actions, vitest (app unit tests), testcontainers Postgres (db RLS suite), pg-mem (db smoke).

**Spec:** `docs/superpowers/specs/2026-06-09-tier1-security-hardening-design.md`

**Branch:** `security/tier1-hardening` (already created; spec committed).

---

## Environment notes (read first)

- **Node:** prefix app commands with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH` per root CLAUDE.md. If that nvm version is missing on this machine, system node works for tests/tsc.
- **db RLS tests (testcontainers) need Colima env vars** — export before ANY `test:rls` run:
  ```bash
  export DOCKER_HOST=unix:///Users/christophernowacki/.colima/default/docker.sock
  export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/Users/christophernowacki/.colima/default/docker.sock
  export TESTCONTAINERS_RYUK_DISABLED=true
  ```
  Without these: "Could not find a working container runtime strategy". If Colima isn't running: `colima start`.
- **App vitest loads `app/.env.local`** (prod Supabase). Env-gated integration tests in `app/tests/` hit prod — all their `profiles` reads go through `adminClient()` (service role, `tests/helpers/users.ts`), which is unaffected by the grants. Verified 2026-06-09.
- **Commit messages:** plain `git commit -m "..."` one-liners are fine. Do NOT use `$(cat <<EOF ...)` heredocs (known mangling gotcha).

---

### Task 1: Migration 0203 — profiles column-level grants (TDD via RLS suite)

**Files:**
- Create: `db/tests/rls/profiles-grants.test.ts`
- Create: `db/migrations/0203_profiles_column_grants.sql`

- [ ] **Step 1: Write the failing RLS test**

Create `db/tests/rls/profiles-grants.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;

beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db?.close(); });

describe("profiles column-level grants (mig 0203)", () => {
  it("anon can read the public identity subset", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(
        `SELECT id, username, display_name, avatar_url, bio, role, created_at
           FROM profiles WHERE id = $1`,
        [fx.userA.id],
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("anon cannot read unsubscribe_token, email prefs, or select *", async () => {
    const fx = await seedFixtures(db.client);

    await beginAs(db.client, null, "anon");
    try {
      await expect(
        db.client.query(`SELECT unsubscribe_token FROM profiles WHERE id = $1`, [fx.userA.id]),
      ).rejects.toThrow(/permission denied/i);
    } finally { await rollback(db.client); }

    await beginAs(db.client, null, "anon");
    try {
      await expect(
        db.client.query(`SELECT email_price_drops FROM profiles WHERE id = $1`, [fx.userA.id]),
      ).rejects.toThrow(/permission denied/i);
    } finally { await rollback(db.client); }

    await beginAs(db.client, null, "anon");
    try {
      await expect(
        db.client.query(`SELECT * FROM profiles WHERE id = $1`, [fx.userA.id]),
      ).rejects.toThrow(/permission denied/i);
    } finally { await rollback(db.client); }
  });

  it("authenticated cannot read unsubscribe_token (own row or anyone's)", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(`SELECT unsubscribe_token FROM profiles WHERE id = $1`, [fx.userA.id]),
      ).rejects.toThrow(/permission denied/i);
    } finally { await rollback(db.client); }
  });

  it("authenticated can read own email prefs and the middleware gate columns", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT email_price_drops, onboarded_at, must_change_password
           FROM profiles WHERE id = $1`,
        [fx.userA.id],
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("authenticated can update own bio but not must_change_password or role", async () => {
    const fx = await seedFixtures(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE profiles SET bio = 'a new bio' WHERE id = $1`,
        [fx.userA.id],
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `UPDATE profiles SET must_change_password = false WHERE id = $1`,
          [fx.userA.id],
        ),
      ).rejects.toThrow(/permission denied/i);
    } finally { await rollback(db.client); }

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(`UPDATE profiles SET role = 'witch' WHERE id = $1`, [fx.userA.id]),
      ).rejects.toThrow(/permission denied/i);
    } finally { await rollback(db.client); }
  });

  it("authenticated cannot INSERT or DELETE profiles rows", async () => {
    const fx = await seedFixtures(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO profiles (id, username, display_name) VALUES ($1, 'sneaky', 'Sneaky')`,
          [fx.userB.id],
        ),
      ).rejects.toThrow(/permission denied/i);
    } finally { await rollback(db.client); }

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(`DELETE FROM profiles WHERE id = $1`, [fx.userA.id]),
      ).rejects.toThrow(/permission denied/i);
    } finally { await rollback(db.client); }
  });

  it("service_role still reads every column", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query(
        `SELECT unsubscribe_token, must_change_password FROM profiles WHERE id = $1`,
        [fx.userA.id],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].unsubscribe_token).toBeTruthy();
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/christophernowacki/film-goblin/db
export DOCKER_HOST=unix:///Users/christophernowacki/.colima/default/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/Users/christophernowacki/.colima/default/docker.sock
export TESTCONTAINERS_RYUK_DISABLED=true
npm run test:rls -- tests/rls/profiles-grants.test.ts
```

Expected: FAIL — the "cannot read unsubscribe_token" and "cannot update must_change_password" tests fail because today anon/authenticated have full table grants (the queries succeed instead of throwing).

- [ ] **Step 3: Write the migration**

Create `db/migrations/0203_profiles_column_grants.sql`:

```sql
-- 0203: column-level privileges on profiles.
--
-- The profiles_read RLS policy (0101) is intentionally USING (true) so member
-- identity renders on public pages. But that exposed EVERY column to the anon
-- key, including unsubscribe_token (mass-unsubscribe vector), email prefs, and
-- must_change_password. RLS controls rows; these grants control columns.
--
-- Roles:
--   anon          -> public identity subset only (logged-out page renders)
--   authenticated -> everything EXCEPT unsubscribe_token (now server-only);
--                    UPDATE only on the columns user-facing actions write.
--   service_role  -> unaffected (bypasses grants and RLS).
--
-- Side effects to know about:
--   * PostgREST `select=*` on profiles now FAILS for client roles (SELECT *
--     requires privilege on every column). App code must use explicit column
--     lists — the only call site was app/settings/page.tsx, fixed alongside.
--   * must_change_password / role / is_starter / starter_order / email_added_at
--     are no longer client-updatable (closes the self-clearable-flag hole).
--   * unsubscribe_token keeps UPDATE (not SELECT): _updateProfile rotates it
--     with the user client on email re-opt-in; RLS limits that to the own row.
--   * onboarded_at keeps UPDATE: _completeOnboarding sets it with the user
--     client. Self-row only via RLS.

REVOKE ALL ON TABLE profiles FROM anon, authenticated;

GRANT SELECT (id, username, display_name, avatar_url, bio, role, created_at)
  ON profiles TO anon;

GRANT SELECT (id, username, display_name, bio, avatar_url, broadcast_watchlist_adds,
  created_at, updated_at, broadcast_library, broadcast_watched, onboarded_at,
  email_added_at, email_price_drops, email_coven_recs, email_comments,
  email_coven_invites, role, notify_rate_reminders, notify_comment_likes,
  lane_tag_ids, discoverable, is_starter, starter_order, notify_film_requests,
  must_change_password)
  ON profiles TO authenticated;

GRANT UPDATE (username, display_name, bio, avatar_url, broadcast_watchlist_adds,
  broadcast_library, broadcast_watched, email_price_drops, email_coven_recs,
  email_comments, email_coven_invites, notify_rate_reminders, notify_comment_likes,
  notify_film_requests, discoverable, lane_tag_ids, onboarded_at, unsubscribe_token)
  ON profiles TO authenticated;
```

- [ ] **Step 4: Run the RLS test to verify it passes**

```bash
cd /Users/christophernowacki/film-goblin/db
npm run test:rls -- tests/rls/profiles-grants.test.ts
```
(Colima env vars from Step 2 still exported.)
Expected: PASS (all 7 tests).

- [ ] **Step 5: Run the pg-mem smoke**

```bash
cd /Users/christophernowacki/film-goblin/db && npm test
```

Expected: PASS. The smoke's statement whitelist (`db/tests/helpers/pg-mem.ts` final filter only keeps CREATE/ALTER/DROP/INSERT/UPDATE/DELETE/SELECT/WITH/TRUNCATE) drops both REVOKE and GRANT statements, leaving 0203 empty — it's skipped. If it fails anyway, add an explicit filter next to the GRANT one (line ~113):

```ts
      .filter(stmt => !/^\s*REVOKE\b/im.test(stmt))
```

- [ ] **Step 6: Run the full RLS suite (regression — other suites read profiles)**

```bash
cd /Users/christophernowacki/film-goblin/db && npm run test:rls
```

Expected: PASS. If another suite fails on a profiles column read, it's selecting a now-ungranted column as anon/authenticated — fix the test's column list only if the column isn't in the spec's grant sets; otherwise the grant list in 0203 has a typo (compare against spec).

- [ ] **Step 7: Commit**

```bash
cd /Users/christophernowacki/film-goblin
git add db/migrations/0203_profiles_column_grants.sql db/tests/rls/profiles-grants.test.ts db/tests/helpers/pg-mem.ts
git commit -m "feat(db): column-level grants on profiles (mig 0203)"
```

---

### Task 2: Replace every profiles `select("*")` with explicit column lists

**Files:**
- Modify: `app/lib/queries/profiles.ts` (`getMyProfile`, `getProfileByUsername`)
- Modify: `app/app/settings/page.tsx:35-38`

Under column grants, PostgREST `select=*` fails with `permission denied` for client roles. Three call sites select `*` from profiles (multi-line-aware sweep 2026-06-09 — single-line greps MISS chained PostgREST calls; always grep with `-B3` context or on `select("*")` itself):

1. `app/lib/queries/profiles.ts:11` `getMyProfile()` — used by `/film/[id]`, `/films`, `/library`, `/watchlist`. **Missing this 500s those pages for signed-in users.**
2. `app/lib/queries/profiles.ts:21` `getProfileByUsername()` — zero callers today (dead export); narrow anyway (the other machine may have WIP against it).
3. `app/app/settings/page.tsx:36` — settings page.

Test files are fine: all their profiles reads use the service-role `adminClient()`.

- [ ] **Step 1: Add shared column-list constants and fix the queries**

In `app/lib/queries/profiles.ts`, add below the `type Client = ...` line:

```ts
// Explicit column lists: profiles has column-level grants (mig 0203) and
// PostgREST `select=*` fails for client roles. unsubscribe_token is
// server-only by design.

/** Every column the authenticated role can SELECT (all except unsubscribe_token). */
export const PROFILE_SELECT_COLUMNS =
  "id, username, display_name, bio, avatar_url, role, created_at, updated_at, " +
  "broadcast_watchlist_adds, broadcast_library, broadcast_watched, " +
  "email_added_at, email_price_drops, email_coven_recs, email_comments, email_coven_invites, " +
  "notify_rate_reminders, notify_comment_likes, notify_film_requests, " +
  "lane_tag_ids, discoverable, is_starter, starter_order, onboarded_at, must_change_password";

/** The public identity subset granted to anon. */
export const PUBLIC_PROFILE_COLUMNS =
  "id, username, display_name, avatar_url, bio, role, created_at";
```

Then change `getMyProfile`'s select:

```ts
  const { data, error } = await client
    .from("profiles")
    .select(PROFILE_SELECT_COLUMNS)
    .eq("id", user.id)
    .single();
```

and `getProfileByUsername`'s select (it can serve logged-out renders, so use the anon-safe subset):

```ts
  const { data, error } = await client
    .from("profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .ilike("username", username)
    .maybeSingle();
```

- [ ] **Step 2: Fix the settings page**

In `app/app/settings/page.tsx`, add to the imports:

```ts
import { PROFILE_SELECT_COLUMNS } from "@/lib/queries/profiles";
```

and replace:

```ts
  const [profile, vocab] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    getAllTagsGroupedByType(supabase),
  ]);
```

with:

```ts
  const [profile, vocab] = await Promise.all([
    supabase.from("profiles").select(PROFILE_SELECT_COLUMNS).eq("id", user.id).maybeSingle(),
    getAllTagsGroupedByType(supabase),
  ]);
```

(`SettingsForm`'s `initialProfile` prop is typed `any` — no type changes needed. `getMyProfile`'s callers consume identity + lane fields, all present in the explicit list; if typecheck flags a consumer of a dropped field, the only dropped field is `unsubscribe_token`, which nothing client-side reads — verified by grep.)

- [ ] **Step 3: Typecheck**

```bash
cd /Users/christophernowacki/film-goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/christophernowacki/film-goblin
git add app/lib/queries/profiles.ts app/app/settings/page.tsx
git commit -m "fix(profiles): explicit column lists everywhere (select(*) breaks under column grants)"
```

---

### Task 3: Migration 0204 — IP-keyed rate-limit table + RPC (TDD via RLS suite)

**Files:**
- Create: `db/tests/rls/ip-rate-limits.test.ts`
- Create: `db/migrations/0204_ip_rate_limits.sql`

- [ ] **Step 1: Write the failing RLS test**

Create `db/tests/rls/ip-rate-limits.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;

beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db?.close(); });

describe("app_ip_rate_limits + consume_ip_rate_limit (mig 0204)", () => {
  it("anon and authenticated cannot read the table or execute the RPC", async () => {
    const fx = await seedFixtures(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const rows = await db.client.query(`SELECT key FROM app_ip_rate_limits`);
      expect(rows.rowCount).toBe(0); // RLS: zero policies = deny-all reads
    } finally { await rollback(db.client); }

    await beginAs(db.client, null, "anon");
    try {
      await expect(
        db.client.query(`SELECT * FROM public.consume_ip_rate_limit('h', 'k', 3, '2026-06-09T14:15')`),
      ).rejects.toThrow(/permission denied/i);
    } finally { await rollback(db.client); }

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(`SELECT * FROM public.consume_ip_rate_limit('h', 'k', 3, '2026-06-09T14:15')`),
      ).rejects.toThrow(/permission denied/i);
    } finally { await rollback(db.client); }
  });

  it("service_role consumes up to the limit, then is denied; new window resets", async () => {
    await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      for (let i = 1; i <= 3; i++) {
        const r = await db.client.query(
          `SELECT * FROM public.consume_ip_rate_limit('hash-1', 'signin-ip', 3, '2026-06-09T14:15')`,
        );
        expect(r.rows[0].allowed).toBe(true);
        expect(Number(r.rows[0].count)).toBe(i);
      }

      const denied = await db.client.query(
        `SELECT * FROM public.consume_ip_rate_limit('hash-1', 'signin-ip', 3, '2026-06-09T14:15')`,
      );
      expect(denied.rows[0].allowed).toBe(false);
      expect(Number(denied.rows[0].remaining)).toBe(0);

      const nextWindow = await db.client.query(
        `SELECT * FROM public.consume_ip_rate_limit('hash-1', 'signin-ip', 3, '2026-06-09T14:30')`,
      );
      expect(nextWindow.rows[0].allowed).toBe(true);

      const otherIp = await db.client.query(
        `SELECT * FROM public.consume_ip_rate_limit('hash-2', 'signin-ip', 3, '2026-06-09T14:15')`,
      );
      expect(otherIp.rows[0].allowed).toBe(true);
    } finally { await rollback(db.client); }
  });

  it("rejects null/invalid inputs as not-allowed", async () => {
    await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query(
        `SELECT * FROM public.consume_ip_rate_limit(NULL, 'k', 3, '2026-06-09T14:15')`,
      );
      expect(r.rows[0].allowed).toBe(false);

      const r2 = await db.client.query(
        `SELECT * FROM public.consume_ip_rate_limit('h', 'k', 0, '2026-06-09T14:15')`,
      );
      expect(r2.rows[0].allowed).toBe(false);
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/christophernowacki/film-goblin/db
npm run test:rls -- tests/rls/ip-rate-limits.test.ts
```
(Colima env vars exported as in Task 1.)
Expected: FAIL — `relation "app_ip_rate_limits" does not exist` / `function public.consume_ip_rate_limit ... does not exist`.

- [ ] **Step 3: Write the migration**

Create `db/migrations/0204_ip_rate_limits.sql`:

```sql
-- 0204: IP-keyed rate limits for pre-auth abuse controls (sign-in, sign-up,
-- username availability checks). Mirrors 0190's user-keyed table/RPC — that
-- one can't cover endpoints where no user exists yet.
--
-- window_start is a caller-chosen UTC text bucket so one table serves multiple
-- granularities: "2026-06-09T14:15" (15-minute) or "2026-06-09T14" (hourly).
-- Text buckets compare lexicographically, so cleanup can prune with
-- `window_start < 'YYYY-MM-DD'`.
--
-- ip_hash is a generic SUBJECT hash, sha256-truncated — no raw values stored.
-- IP buckets pass sha256(client ip); the signin-global bucket passes
-- 'id:' || sha256(identifier) to cap distributed attacks on one account.
-- Rows are pruned by the daily maintenance cron after 2 days.

CREATE TABLE app_ip_rate_limits (
  ip_hash      TEXT NOT NULL,
  key          TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_hash, key, window_start)
);

-- Zero policies: deny-all for client roles. Service-role only, like 0190.
ALTER TABLE app_ip_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_ip_rate_limit(
  p_ip_hash TEXT,
  p_key TEXT,
  p_limit INTEGER,
  p_window_start TEXT
)
RETURNS TABLE(allowed BOOLEAN, count INTEGER, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  IF p_ip_hash IS NULL OR p_key IS NULL OR p_window_start IS NULL OR p_limit < 1 THEN
    RETURN QUERY SELECT false, 0, 0;
    RETURN;
  END IF;

  INSERT INTO app_ip_rate_limits (ip_hash, key, window_start, count)
  VALUES (p_ip_hash, p_key, p_window_start, 1)
  ON CONFLICT DO NOTHING
  RETURNING app_ip_rate_limits.count INTO new_count;

  IF new_count IS NOT NULL THEN
    RETURN QUERY SELECT true, new_count, GREATEST(p_limit - new_count, 0);
    RETURN;
  END IF;

  UPDATE app_ip_rate_limits
  SET count = app_ip_rate_limits.count + 1,
      updated_at = now()
  WHERE ip_hash = p_ip_hash
    AND key = p_key
    AND window_start = p_window_start
    AND app_ip_rate_limits.count < p_limit
  RETURNING app_ip_rate_limits.count INTO new_count;

  IF new_count IS NOT NULL THEN
    RETURN QUERY SELECT true, new_count, GREATEST(p_limit - new_count, 0);
    RETURN;
  END IF;

  SELECT app_ip_rate_limits.count INTO new_count
  FROM app_ip_rate_limits
  WHERE ip_hash = p_ip_hash
    AND key = p_key
    AND window_start = p_window_start;

  RETURN QUERY SELECT false, COALESCE(new_count, 0), 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ip_rate_limit(TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ip_rate_limit(TEXT, TEXT, INTEGER, TEXT) TO service_role;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/christophernowacki/film-goblin/db
npm run test:rls -- tests/rls/ip-rate-limits.test.ts
npm test
```
Expected: RLS test PASS. pg-mem smoke PASS — the file contains `LANGUAGE plpgsql SECURITY DEFINER`, so the smoke auto-skips the whole file (same as 0190; `app_rate_limits` isn't in pg-mem either).

- [ ] **Step 5: Commit**

```bash
cd /Users/christophernowacki/film-goblin
git add db/migrations/0204_ip_rate_limits.sql db/tests/rls/ip-rate-limits.test.ts
git commit -m "feat(db): app_ip_rate_limits table + consume_ip_rate_limit RPC (mig 0204)"
```

---

### Task 4: IP rate-limit helpers in `app/lib/rate-limit.ts` (TDD)

**Files:**
- Modify: `app/lib/rate-limit.ts` (append; existing `consumeRateLimit`/`utcDayString` stay as-is)
- Create: `app/tests/rate-limit-ip.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `app/tests/rate-limit-ip.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  hashKey,
  parseClientIp,
  utcQuarterHourBucket,
  utcHourBucket,
  consumeIpRateLimit,
} from "../lib/rate-limit";

describe("parseClientIp", () => {
  it("takes the first hop of a multi-value x-forwarded-for", () => {
    expect(parseClientIp("203.0.113.7, 10.0.0.1, 10.0.0.2", null)).toBe("203.0.113.7");
    expect(parseClientIp("203.0.113.7", "10.9.9.9")).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(parseClientIp(null, "203.0.113.9")).toBe("203.0.113.9");
    expect(parseClientIp(null, null)).toBe("unknown");
  });

  it("treats garbage/empty header values as unknown", () => {
    expect(parseClientIp("  ,", " ")).toBe("unknown");
    expect(parseClientIp("", "")).toBe("unknown");
  });
});

describe("hashKey", () => {
  it("returns a stable 32-char hex digest", () => {
    expect(hashKey("1.2.3.4")).toBe(hashKey("1.2.3.4"));
    expect(hashKey("1.2.3.4")).toMatch(/^[0-9a-f]{32}$/);
    expect(hashKey("1.2.3.4")).not.toBe(hashKey("1.2.3.5"));
  });
});

describe("window buckets", () => {
  it("floors to 15-minute UTC buckets", () => {
    expect(utcQuarterHourBucket(new Date("2026-06-09T14:23:45Z"))).toBe("2026-06-09T14:15");
    expect(utcQuarterHourBucket(new Date("2026-06-09T14:00:00Z"))).toBe("2026-06-09T14:00");
    expect(utcQuarterHourBucket(new Date("2026-06-09T14:59:59Z"))).toBe("2026-06-09T14:45");
  });

  it("produces hourly UTC buckets", () => {
    expect(utcHourBucket(new Date("2026-06-09T14:23:45Z"))).toBe("2026-06-09T14");
  });
});

describe("consumeIpRateLimit", () => {
  it("passes through an allowed result and calls the RPC with the right args", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ allowed: true, count: 1, remaining: 9 }], error: null });
    const r = await consumeIpRateLimit({ rpc } as never, {
      ipHash: "x", key: "k", limit: 10, windowStart: "2026-06-09T14:15",
    });
    expect(r).toEqual({ allowed: true, count: 1, remaining: 9 });
    expect(rpc).toHaveBeenCalledWith("consume_ip_rate_limit", {
      p_ip_hash: "x", p_key: "k", p_limit: 10, p_window_start: "2026-06-09T14:15",
    });
  });

  it("denies when the RPC says the limit is exhausted", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ allowed: false, count: 10, remaining: 0 }], error: null });
    const r = await consumeIpRateLimit({ rpc } as never, {
      ipHash: "x", key: "k", limit: 10, windowStart: "w",
    });
    expect(r.allowed).toBe(false);
  });

  it("fails OPEN when the RPC errors (auth must never brick on rate-limit infra)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const r = await consumeIpRateLimit({ rpc } as never, {
      ipHash: "x", key: "k", limit: 10, windowStart: "w",
    });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/christophernowacki/film-goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/rate-limit-ip.test.ts
```
Expected: FAIL — `hashKey` etc. are not exported.

- [ ] **Step 3: Implement the helpers**

Append to `app/lib/rate-limit.ts` (add the two imports at the top of the file):

```ts
import { createHash } from "node:crypto";
import { headers } from "next/headers";
```

```ts
// ── IP-keyed limits (pre-auth surface) ──────────────────────────────────────
// The user-keyed limiter above can't cover sign-in/sign-up/username checks —
// there's no user yet. These helpers key on a sha256-truncated hash of the
// client IP (no raw IPs stored) and call the consume_ip_rate_limit RPC
// (mig 0204). Unlike consumeRateLimit, this FAILS OPEN on RPC error: a
// rate-limit infra problem must never brick sign-in, and it makes deploys
// safe in any order (the limiter no-ops until the migration is applied).

export function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/**
 * Pure header parsing, exported for tests. Trust model: on Vercel,
 * x-forwarded-for is set by the platform and client-supplied values are
 * stripped, so the first hop is the real client IP; x-real-ip is the
 * platform-set fallback. Revisit if hosting ever moves off Vercel.
 */
export function parseClientIp(xForwardedFor: string | null, xRealIp: string | null): string {
  const first = xForwardedFor?.split(",")[0]?.trim();
  if (first) return first;
  const real = xRealIp?.trim();
  if (real) return real;
  return "unknown";
}

export async function getClientIpHash(): Promise<string> {
  const h = await headers();
  return hashKey(parseClientIp(h.get("x-forwarded-for"), h.get("x-real-ip")));
}

/** Floors to a 15-minute UTC bucket, e.g. "2026-06-09T14:15". */
export function utcQuarterHourBucket(date = new Date()): string {
  const m = date.getUTCMinutes();
  const floored = String(m - (m % 15)).padStart(2, "0");
  return `${date.toISOString().slice(0, 14)}${floored}`;
}

/** Hourly UTC bucket, e.g. "2026-06-09T14". */
export function utcHourBucket(date = new Date()): string {
  return date.toISOString().slice(0, 13);
}

export async function consumeIpRateLimit(
  client: SupabaseClient<Database>,
  input: { ipHash: string; key: string; limit: number; windowStart: string },
): Promise<RateLimitResult> {
  const { data, error } = await (client as any).rpc("consume_ip_rate_limit", {
    p_ip_hash: input.ipHash,
    p_key: input.key,
    p_limit: input.limit,
    p_window_start: input.windowStart,
  });

  if (error) {
    // Fail OPEN — see block comment above.
    console.error("consumeIpRateLimit failed (fail-open):", error.message);
    return { allowed: true, count: 0, remaining: input.limit };
  }

  const row = (Array.isArray(data) ? data[0] : data) as Partial<RateLimitResult> | null | undefined;
  return {
    allowed: row?.allowed === true,
    count: Number(row?.count ?? 0),
    remaining: Number(row?.remaining ?? 0),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/christophernowacki/film-goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/rate-limit-ip.test.ts
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/christophernowacki/film-goblin
git add app/lib/rate-limit.ts app/tests/rate-limit-ip.test.ts
git commit -m "feat(rate-limit): IP-keyed helpers for the pre-auth surface"
```

---

### Task 5: Wire throttles into auth actions + password minimum 8 (TDD)

**Files:**
- Create: `app/tests/auth/auth-rate-limit.test.ts`
- Modify: `app/lib/actions/auth.ts` (`signIn`, `signUp`, `checkUsernameAvailability`, `resetPassword`, `completeForcedPasswordChange`)
- Modify: `app/lib/actions/profile.ts` (`changePassword` — 6 → 8)
- Modify: `app/tests/actions/change-password.test.ts` (expectations 6 → 8)

- [ ] **Step 1: Write the failing tests**

Create `app/tests/auth/auth-rate-limit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...mod,
    getClientIpHash: vi.fn().mockResolvedValue("test-ip-hash"),
    consumeIpRateLimit: vi.fn(),
  };
});
vi.mock("@/lib/supabase/service-role", () => ({ serviceRoleClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { signIn, signUp, checkUsernameAvailability } from "@/lib/actions/auth";
import { consumeIpRateLimit } from "@/lib/rate-limit";

const THROTTLE = "Too many attempts. Try again in a few minutes.";

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

beforeEach(() => {
  vi.mocked(consumeIpRateLimit).mockReset();
  vi.mocked(consumeIpRateLimit).mockResolvedValue({ allowed: true, count: 1, remaining: 9 });
});

describe("signIn throttling", () => {
  it("returns the throttle error when the per-IP limit is exhausted", async () => {
    vi.mocked(consumeIpRateLimit).mockResolvedValueOnce({ allowed: false, count: 30, remaining: 0 });
    const res = await signIn(fd({ identifier: "someone", password: "whatever1" }));
    expect(res.error).toBe(THROTTLE);
  });

  it("returns the throttle error when the per-identifier limit is exhausted", async () => {
    vi.mocked(consumeIpRateLimit)
      .mockResolvedValueOnce({ allowed: true, count: 1, remaining: 29 })
      .mockResolvedValueOnce({ allowed: false, count: 10, remaining: 0 });
    const res = await signIn(fd({ identifier: "someone", password: "whatever1" }));
    expect(res.error).toBe(THROTTLE);
  });

  it("returns the throttle error when the identifier-global limit is exhausted (distributed attack)", async () => {
    vi.mocked(consumeIpRateLimit)
      .mockResolvedValueOnce({ allowed: true, count: 1, remaining: 29 })
      .mockResolvedValueOnce({ allowed: true, count: 1, remaining: 9 })
      .mockResolvedValueOnce({ allowed: false, count: 50, remaining: 0 });
    const res = await signIn(fd({ identifier: "someone", password: "whatever1" }));
    expect(res.error).toBe(THROTTLE);
    // Global bucket keys on the identifier hash, not the caller's IP
    const thirdCall = vi.mocked(consumeIpRateLimit).mock.calls[2][1];
    expect(thirdCall.key).toBe("signin-global");
    expect(thirdCall.ipHash).toMatch(/^id:/);
  });
});

describe("signUp", () => {
  it("enforces an 8-character password minimum before any DB work", async () => {
    const res = await signUp(fd({ username: "newgoblin", password: "seven77" }));
    expect(res.error).toMatch(/at least 8/);
    expect(vi.mocked(consumeIpRateLimit)).not.toHaveBeenCalled();
  });

  it("returns the throttle error when the per-IP signup limit is exhausted", async () => {
    vi.mocked(consumeIpRateLimit).mockResolvedValueOnce({ allowed: false, count: 5, remaining: 0 });
    const res = await signUp(fd({ username: "newgoblin", password: "longenough1" }));
    expect(res.error).toBe(THROTTLE);
  });
});

describe("checkUsernameAvailability throttling", () => {
  it("returns a neutral 'ok' when throttled (signUp re-validates authoritatively)", async () => {
    vi.mocked(consumeIpRateLimit).mockResolvedValueOnce({ allowed: false, count: 60, remaining: 0 });
    const res = await checkUsernameAvailability("somename");
    expect(res.status).toBe("ok");
  });
});
```

Then in `app/tests/actions/change-password.test.ts`, update the short-password expectation:

```ts
  it("returns an error when new password is too short", async () => {
    const res = await changePassword(fd({ current_password: "whatever", new_password: "abc", confirm: "abc" }));
    expect(res.error).toMatch(/8 characters/i);
  });
```

(The "don't match" test passes both `abcdefgh`-length values; update its inputs to 8+ chars so it still exercises the mismatch branch, e.g. `new_password: "abcdefgh", confirm: "ghijklmn"`.)

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/christophernowacki/film-goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/auth/auth-rate-limit.test.ts tests/actions/change-password.test.ts
```
Expected: FAIL — no throttle wiring exists, password messages still say 6.

- [ ] **Step 3: Implement in `app/lib/actions/auth.ts`**

Add to the imports:

```ts
import { consumeIpRateLimit, getClientIpHash, hashKey, utcQuarterHourBucket, utcHourBucket } from "@/lib/rate-limit";
```

Add near `USERNAME_RE`:

```ts
const THROTTLE_ERROR = "Too many attempts. Try again in a few minutes.";
```

**`signIn`** — insert after the `if (!identifier)` check, replacing the later `const admin = serviceRoleClient()` with the shared `svc`:

```ts
  // IP-keyed throttles: 30 attempts / 15 min per IP, 10 / 15 min per
  // (IP, identifier). Consumed before any credential work. consumeIpRateLimit
  // fails open, so a rate-limit infra problem can't lock everyone out.
  const svc = serviceRoleClient();
  const ipHash = await getClientIpHash();
  const bucket = utcQuarterHourBucket();
  const perIp = await consumeIpRateLimit(svc, {
    ipHash, key: "signin-ip", limit: 30, windowStart: bucket,
  });
  if (!perIp.allowed) return { error: THROTTLE_ERROR };
  const perId = await consumeIpRateLimit(svc, {
    ipHash, key: `signin-id:${hashKey(identifier.toLowerCase())}`, limit: 10, windowStart: bucket,
  });
  if (!perId.allowed) return { error: THROTTLE_ERROR };
  // Identifier-global bucket: caps distributed (many-IP) attacks on one
  // account. p_ip_hash is a generic subject hash — here it carries the
  // identifier, not the caller's IP. Generous enough that legit retries never
  // hit it; an attacker burning it locks this account's sign-in only for the
  // rest of the 15-minute window.
  const globalId = await consumeIpRateLimit(svc, {
    ipHash: `id:${hashKey(identifier.toLowerCase())}`,
    key: "signin-global",
    limit: 50,
    windowStart: bucket,
  });
  if (!globalId.allowed) return { error: THROTTLE_ERROR };
```

and in the username branch below, change `const admin = serviceRoleClient();` to use `svc` (replace the two `admin.` references with `svc.`).

**`signUp`** — change the password check and add the throttle immediately after it (before the invite-gate check):

```ts
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  // Per-IP signup throttle: 5 per hour. admin.createUser bypasses Supabase's
  // built-in auth rate limits, so this is the only thing standing between an
  // open signup form and a bot.
  const ipHash = await getClientIpHash();
  const signupLimit = await consumeIpRateLimit(serviceRoleClient(), {
    ipHash, key: "signup-ip", limit: 5, windowStart: utcHourBucket(),
  });
  if (!signupLimit.allowed) return { error: THROTTLE_ERROR };
```

**`checkUsernameAvailability`** — insert after the format check, before `serviceRoleClient()` is used for the lookup:

```ts
  // Throttle the enumeration oracle: 60 checks / 15 min per IP. Over the
  // limit we return "ok" (neutral) — the UI never blocks a legit signup,
  // because signUp re-validates availability authoritatively.
  const ipHash = await getClientIpHash();
  const limit = await consumeIpRateLimit(serviceRoleClient(), {
    ipHash, key: "username-check", limit: 60, windowStart: utcQuarterHourBucket(),
  });
  if (!limit.allowed) return { status: "ok" };
```

**`resetPassword`** and **`completeForcedPasswordChange`** — change both:

```ts
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters." };
```

- [ ] **Step 4: Implement in `app/lib/actions/profile.ts`**

In `changePassword`, change:

```ts
  if (newPassword.length < 8) return { error: "New password must be at least 8 characters." };
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/christophernowacki/film-goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/auth/auth-rate-limit.test.ts tests/actions/change-password.test.ts
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/christophernowacki/film-goblin
git add app/lib/actions/auth.ts app/lib/actions/profile.ts app/tests/auth/auth-rate-limit.test.ts app/tests/actions/change-password.test.ts
git commit -m "feat(auth): IP throttles on signin/signup/username-check, password min 8"
```

---

### Task 6: Maintenance cron — prune rate-limit tables

**Files:**
- Modify: `app/app/api/cron/maintenance/route.ts` (after the `jobs.streamingAvailability` block, ~line 115)

- [ ] **Step 1: Add the cleanup job**

Insert after the `jobs.streamingAvailability = ...` block and before `jobs.sendNotifications = ...`:

```ts
    jobs.rateLimitCleanup = await recordedJob("rate-limit-cleanup", async () => {
      // app_ip_rate_limits.window_start is a text bucket ("2026-06-09T14:15");
      // lexicographic compare against a YYYY-MM-DD cutoff prunes whole days.
      const ipCutoff = new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10);
      const ip = await client.query(
        `DELETE FROM app_ip_rate_limits WHERE window_start < $1`,
        [ipCutoff],
      );
      const user = await client.query(
        `DELETE FROM app_rate_limits WHERE window_start < now() - INTERVAL '7 days'`,
      );
      return { ipRowsDeleted: ip.rowCount ?? 0, userRowsDeleted: user.rowCount ?? 0 };
    });
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/christophernowacki/film-goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/christophernowacki/film-goblin
git add app/app/api/cron/maintenance/route.ts
git commit -m "feat(cron): prune app_ip_rate_limits and app_rate_limits in maintenance"
```

---

### Task 7: Migration 0205 — input CHECK constraints (TDD via RLS suite)

**Files:**
- Create: `db/tests/rls/input-constraints.test.ts`
- Create: `db/migrations/0205_input_check_constraints.sql`
- Possibly modify: `db/tests/helpers/pg-mem.ts` (only if pg-mem can't evaluate the `~` regex CHECK)

- [ ] **Step 1: Write the failing test**

Create `db/tests/rls/input-constraints.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;

beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db?.close(); });

// CHECK constraints bind every role — service_role bypasses RLS, not constraints.
describe("input CHECK constraints (mig 0205)", () => {
  it("rejects malformed usernames", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      await expect(
        db.client.query(`UPDATE profiles SET username = 'Bad Name!' WHERE id = $1`, [fx.userA.id]),
      ).rejects.toThrow(/profiles_username_format/);
    } finally { await rollback(db.client); }

    await beginAs(db.client, null, "service_role");
    try {
      await expect(
        db.client.query(`UPDATE profiles SET username = repeat('a', 25) WHERE id = $1`, [fx.userA.id]),
      ).rejects.toThrow(/profiles_username_format/);
    } finally { await rollback(db.client); }
  });

  it("rejects path-weird and alphanumeric-free usernames", async () => {
    const fx = await seedFixtures(db.client);
    for (const bad of [".", "..", "a.", ".a", "___", "._."]) {
      await beginAs(db.client, null, "service_role");
      try {
        await expect(
          db.client.query(`UPDATE profiles SET username = $2 WHERE id = $1`, [fx.userA.id, bad]),
        ).rejects.toThrow(/profiles_username_format/);
      } finally { await rollback(db.client); }
    }

    // Edge underscores and interior dots remain legal
    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query(
        `UPDATE profiles SET username = '_moss.whorre_' WHERE id = $1`,
        [fx.userA.id],
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("rejects oversized display_name, bio, and avatar_url", async () => {
    const fx = await seedFixtures(db.client);
    for (const [column, len, constraint] of [
      ["display_name", 51, "profiles_display_name_len"],
      ["bio", 501, "profiles_bio_len"],
      ["avatar_url", 1001, "profiles_avatar_url_len"],
    ] as const) {
      await beginAs(db.client, null, "service_role");
      try {
        await expect(
          db.client.query(
            `UPDATE profiles SET ${column} = repeat('x', ${len}) WHERE id = $1`,
            [fx.userA.id],
          ),
        ).rejects.toThrow(new RegExp(constraint));
      } finally { await rollback(db.client); }
    }
  });

  it("accepts boundary values", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query(
        `UPDATE profiles SET display_name = repeat('x', 50), bio = repeat('x', 500),
                avatar_url = repeat('x', 1000), username = repeat('a', 24)
          WHERE id = $1`,
        [fx.userA.id],
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("rejects oversized watch notes, accepts 500", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      await expect(
        db.client.query(
          `INSERT INTO watched (user_id, film_id, note) VALUES ($1, $2, repeat('x', 501))`,
          [fx.userA.id, fx.filmId],
        ),
      ).rejects.toThrow(/watched_note_len/);
    } finally { await rollback(db.client); }

    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query(
        `INSERT INTO watched (user_id, film_id, note) VALUES ($1, $2, repeat('x', 500)) RETURNING id`,
        [fx.userA.id, fx.filmId],
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/christophernowacki/film-goblin/db
npm run test:rls -- tests/rls/input-constraints.test.ts
```
(Colima env vars exported.)
Expected: FAIL — the bad writes succeed because no constraints exist yet.

- [ ] **Step 3: Write the migration**

Create `db/migrations/0205_input_check_constraints.sql`:

```sql
-- 0205: DB-level input constraints.
--
-- Server actions validate username format and text lengths, but any user's
-- JWT works directly against PostgREST and skips all of it. RLS makes the DB
-- the boundary for OWNERSHIP; these CHECKs make it the boundary for SHAPE.
--
-- Prod data verified clean on 2026-06-09 (max display_name 20, bio 35,
-- avatar_url 135, note 211) except 3 legacy mixed-case usernames, lowercased
-- below (decision: spec 2026-06-09). Lookups are ilike, the unique index is
-- on lower(username) — logins and /p/[username] URLs are unaffected.

UPDATE profiles SET username = lower(username) WHERE username <> lower(username);

-- Username rule is tighter than the app's historical regex: at least one
-- alphanumeric and no leading/trailing dot, killing path-weird handles
-- ('.', '..', 'a.') that break /p/[username] URLs. The app-side mirror lives
-- in app/lib/auth/username.ts — keep the two in sync.
ALTER TABLE profiles
  ADD CONSTRAINT profiles_username_format CHECK (
    username ~ '^[a-z0-9._]{1,24}$'
    AND username ~ '[a-z0-9]'
    AND username !~ '^\.'
    AND username !~ '\.$'
  ),
  ADD CONSTRAINT profiles_display_name_len CHECK (char_length(display_name) <= 50),
  ADD CONSTRAINT profiles_bio_len          CHECK (char_length(bio) <= 500),
  ADD CONSTRAINT profiles_avatar_url_len   CHECK (char_length(avatar_url) <= 1000);

ALTER TABLE watched
  ADD CONSTRAINT watched_note_len CHECK (note IS NULL OR char_length(note) <= 500);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/christophernowacki/film-goblin/db
npm run test:rls -- tests/rls/input-constraints.test.ts
npm test
```
Expected: RLS test PASS. If the pg-mem smoke (`npm test`) fails on 0205 (pg-mem may not evaluate the `~` regex operator), add a skip in `db/tests/helpers/pg-mem.ts` next to the other file skips (~line 94):

```ts
    // Mig 0205 adds CHECK constraints using the `~` regex operator, which
    // pg-mem can't evaluate. The RLS suite (input-constraints.test.ts) covers
    // the real constraint behavior.
    if (f === "0205_input_check_constraints.sql") continue;
```

Then re-run `npm test` — expected PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/christophernowacki/film-goblin
git add db/migrations/0205_input_check_constraints.sql db/tests/rls/input-constraints.test.ts db/tests/helpers/pg-mem.ts
git commit -m "feat(db): CHECK constraints on profiles + watched.note (mig 0205)"
```

---

### Task 8: Shared username validator + friendly length validation (TDD)

**Files:**
- Create: `app/lib/auth/username.ts`
- Create: `app/tests/auth/username.test.ts`
- Create: `app/tests/actions/profile-validation.test.ts`
- Modify: `app/lib/actions/profile.ts` (`_updateProfile`)
- Modify: `app/lib/actions/auth.ts` (`signIn`, `signUp`, `checkUsernameAvailability`)
- Modify: `app/lib/actions/onboarding.ts` (`_completeOnboarding`)
- Modify: `app/app/settings/components/ProfileDetailsForm.tsx`

The username rule is currently duplicated as `const USERNAME_RE = /^[a-z0-9._]+$/` in four places (auth.ts, onboarding.ts, profile.ts, ProfileDetailsForm.tsx) with inconsistent length checks (onboarding has none). Mig 0205 tightens the DB rule (at least one alphanumeric, no leading/trailing dot), so consolidate into ONE shared validator that mirrors the constraint — app and DB can't drift.

- [ ] **Step 1: Write the failing validator tests**

Create `app/lib/auth/username.ts` consumers' tests first. `app/tests/auth/username.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isValidUsername } from "../../lib/auth/username";

describe("isValidUsername", () => {
  it("accepts normal handles", () => {
    for (const ok of ["moss.whorre", "jarbo", "a", "_moss_", "x.y.z", "goblin99", "a".repeat(24)]) {
      expect(isValidUsername(ok), ok).toBe(true);
    }
  });

  it("rejects path-weird, alphanumeric-free, oversized, and bad-charset handles", () => {
    for (const bad of [".", "..", "a.", ".a", "___", "._.", "", "a".repeat(25), "Has Caps", "sp ace", "héllo"]) {
      expect(isValidUsername(bad), bad).toBe(false);
    }
  });
});
```

And the profile-validation tests — create `app/tests/actions/profile-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { _updateProfile } from "../../lib/actions/profile";

// Stub client: auth passes, but any DB access throws — these tests assert
// validation rejects BEFORE the update is attempted.
function stubClient(userId = "u-1") {
  return {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from: () => { throw new Error("DB should not be reached"); },
  } as never;
}

describe("_updateProfile input validation", () => {
  it("rejects an invalid username (charset + tightened edge-dot rule)", async () => {
    await expect(_updateProfile(stubClient(), { username: "Bad Name!" }))
      .rejects.toThrow(/username/i);
    await expect(_updateProfile(stubClient(), { username: ".dot" }))
      .rejects.toThrow(/username/i);
  });

  it("rejects a display name over 50 chars", async () => {
    await expect(_updateProfile(stubClient(), { display_name: "x".repeat(51) }))
      .rejects.toThrow(/display name is too long/i);
  });

  it("rejects a bio over 500 chars", async () => {
    await expect(_updateProfile(stubClient(), { bio: "x".repeat(501) }))
      .rejects.toThrow(/bio is too long/i);
  });

  it("rejects an avatar_url over 1000 chars", async () => {
    await expect(_updateProfile(stubClient(), { avatar_url: "x".repeat(1001) }))
      .rejects.toThrow(/avatar url is too long/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/christophernowacki/film-goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/auth/username.test.ts tests/actions/profile-validation.test.ts
```
Expected: FAIL — `lib/auth/username.ts` doesn't exist; the `.dot` username and three length tests fail.

- [ ] **Step 3: Create the shared validator**

Create `app/lib/auth/username.ts`:

```ts
// Shared username rule — MUST stay in sync with the DB CHECK constraint
// profiles_username_format (mig 0205): charset [a-z0-9._], 1-24 chars, at
// least one alphanumeric, no leading/trailing dot (path-weird handles like
// "." or "a." break /p/[username] URLs).
export const USERNAME_MAX_LENGTH = 24;
export const USERNAME_RE = /^[a-z0-9._]+$/;
export const USERNAME_RULES_MESSAGE =
  "Username: lowercase letters, numbers, dots, underscores only (max 24); needs a letter or number; can't start or end with a dot.";

export function isValidUsername(u: string): boolean {
  return (
    u.length > 0 &&
    u.length <= USERNAME_MAX_LENGTH &&
    USERNAME_RE.test(u) &&
    /[a-z0-9]/.test(u) &&
    !u.startsWith(".") &&
    !u.endsWith(".")
  );
}
```

- [ ] **Step 4: Swap the four duplicated checks to the shared validator**

In `app/lib/actions/auth.ts`: delete `const USERNAME_RE = /^[a-z0-9._]+$/;`, add
`import { isValidUsername, USERNAME_RULES_MESSAGE } from "@/lib/auth/username";`, then:
- `signIn`: replace `if (!USERNAME_RE.test(identifier)) {` with `if (!isValidUsername(identifier)) {` (still returns "Invalid credentials.").
- `signUp`: replace `if (!USERNAME_RE.test(username) || username.length > 24) { return { error: "Username: lowercase letters, numbers, dots, underscores only (max 24)." }; }` with `if (!isValidUsername(username)) { return { error: USERNAME_RULES_MESSAGE }; }`.
- `checkUsernameAvailability`: replace `if (!username || username.length > 24 || !USERNAME_RE.test(username)) {` with `if (!isValidUsername(username)) {`.

In `app/lib/actions/onboarding.ts`: delete its `const USERNAME_RE = ...`, import `isValidUsername` + `USERNAME_RULES_MESSAGE`, and in `_completeOnboarding` replace `if (!USERNAME_RE.test(username)) { throw new Error("Invalid username: lowercase letters, numbers, dots, underscores only."); }` with `if (!isValidUsername(username)) { throw new Error(USERNAME_RULES_MESSAGE); }`. (This also fixes onboarding's missing 24-char cap.)

In `app/lib/actions/profile.ts`: delete its `const USERNAME_RE = ...` and `USERNAME_MAX_LENGTH`, import the shared module, and replace the username block in `_updateProfile` with:

```ts
  if (fields.username !== undefined) {
    const u = fields.username.trim().toLowerCase();
    if (!isValidUsername(u)) {
      throw new Error(USERNAME_RULES_MESSAGE);
    }
    fields = { ...fields, username: u };
  }
```

In `app/app/settings/components/ProfileDetailsForm.tsx`: delete its `const USERNAME_RE = ...`, add `import { isValidUsername, USERNAME_RULES_MESSAGE } from "@/lib/auth/username";` (pure module — safe in a client component), and replace the invalid calc + error copy:

```ts
  const usernameInvalid = trimmedUsername.length > 0 && !isValidUsername(trimmedUsername);
```

```tsx
          error={usernameInvalid ? USERNAME_RULES_MESSAGE : null}
```

- [ ] **Step 5: Add the length validation**

In `app/lib/actions/profile.ts`, add near the top constants:

```ts
const DISPLAY_NAME_MAX = 50;
const BIO_MAX = 500;
const AVATAR_URL_MAX = 1000;
```

In `_updateProfile`, directly after the username-validation block, add:

```ts
  // Length caps mirror the DB CHECK constraints (mig 0205) so users get a
  // friendly message instead of a raw Postgres error.
  if (fields.display_name !== undefined && fields.display_name.length > DISPLAY_NAME_MAX) {
    throw new Error(`Display name is too long (max ${DISPLAY_NAME_MAX} characters).`);
  }
  if (fields.bio !== undefined && fields.bio.length > BIO_MAX) {
    throw new Error(`Bio is too long (max ${BIO_MAX} characters).`);
  }
  if (fields.avatar_url !== undefined && fields.avatar_url.length > AVATAR_URL_MAX) {
    throw new Error(`Avatar URL is too long (max ${AVATAR_URL_MAX} characters).`);
  }
```

- [ ] **Step 6: Cap the form inputs**

In `app/app/settings/components/ProfileDetailsForm.tsx`:

```tsx
        <SettingsTextField name="display_name" label="Display Name" defaultValue={displayName} required maxLength={50} />
        <SettingsTextArea name="bio" label="Bio" defaultValue={bio} rows={4} maxLength={500} />
```

(`SettingsTextField`/`SettingsTextArea` in `SettingsControls.tsx` spread extra props onto the underlying `input`/`textarea`; if they don't, add `maxLength` pass-through there.)

- [ ] **Step 7: Run tests to verify they pass (plus auth regression — signUp/onboarding still accept normal names)**

```bash
cd /Users/christophernowacki/film-goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/auth/username.test.ts tests/actions/profile-validation.test.ts tests/auth/auth-rate-limit.test.ts tests/actions/change-password.test.ts
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS, typecheck clean.

- [ ] **Step 8: Commit**

```bash
cd /Users/christophernowacki/film-goblin
git add app/lib/auth/username.ts app/lib/actions/profile.ts app/lib/actions/auth.ts app/lib/actions/onboarding.ts app/app/settings/components/ProfileDetailsForm.tsx app/tests/auth/username.test.ts app/tests/actions/profile-validation.test.ts
git commit -m "feat(profile): shared username validator + length validation mirroring mig 0205"
```
(Add `app/app/settings/components/SettingsControls.tsx` to the list if it needed a `maxLength` pass-through.)

---

### Task 9: Documentation updates

**Files:**
- Modify: `db/migrations/CLAUDE.md` (range map)
- Modify: `app/lib/supabase/CLAUDE.md` (profiles grants gotcha)
- Modify: `app/lib/actions/CLAUDE.md` (pre-auth rate-limit pattern)
- Modify: `CLAUDE.md` (Current state + open threads)

- [ ] **Step 1: `db/migrations/CLAUDE.md`** — add a row to the range map table:

```markdown
| 0200–0209 | Gazing attendees + tier-1 security hardening (profiles column grants, IP rate limits, input CHECK constraints) |
```

- [ ] **Step 2: `app/lib/supabase/CLAUDE.md`** — add a section:

```markdown
## profiles column-level grants (mig 0203)

`profiles` has column-level privileges layered on its RLS policies. Never
`.select("*")` on profiles with the anon/authenticated clients — PostgREST
expands `*` to all columns and fails with `permission denied`. Use explicit
column lists. `unsubscribe_token` is service-role-only; `must_change_password`,
`role`, `is_starter`, `starter_order`, `email_added_at` are not client-updatable.
The full grant lists live in `db/migrations/0203_profiles_column_grants.sql`.
```

- [ ] **Step 3: `app/lib/actions/CLAUDE.md`** — add a section:

```markdown
## Rate limiting

Two limiters in `@/lib/rate-limit`:

- `consumeRateLimit` — user-keyed (mig 0190). For authenticated actions
  (e.g. film requests). Fails CLOSED on RPC error.
- `consumeIpRateLimit` + `getClientIpHash` — IP-keyed (mig 0204). For the
  pre-auth surface (signIn, signUp, checkUsernameAvailability). Fails OPEN on
  RPC error so auth never bricks on rate-limit infra. Buckets:
  `utcQuarterHourBucket()` (15 min) / `utcHourBucket()`.
```

- [ ] **Step 4: Root `CLAUDE.md`** — update the "Current state" block: set `Last updated` to today's date, add a "Last shipped" entry summarizing this PR (migs 0203–0205, throttles, password min 8, settings select fix, validation caps), and add an open thread:

```markdown
- **Supabase dashboard hardening (manual, post-merge):** set Auth → minimum password length to 8 and enable leaked-password protection if the plan allows. App enforces 8 since migs 0203–0205 shipped, but the dashboard floor should match.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/christophernowacki/film-goblin
git add CLAUDE.md db/migrations/CLAUDE.md app/lib/supabase/CLAUDE.md app/lib/actions/CLAUDE.md
git commit -m "docs: tier-1 hardening notes (grants gotcha, rate-limit pattern, range map)"
```

---

### Task 10: Full verification + PR

- [ ] **Step 1: Full app suite + typecheck**

```bash
cd /Users/christophernowacki/film-goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: clean. (Env-gated integration tests run against prod Supabase; they use the service-role `adminClient()` for profiles reads and are unaffected by grants that aren't even applied to prod yet.)

- [ ] **Step 2: Full db suites**

```bash
cd /Users/christophernowacki/film-goblin/db
npm test
npm run test:rls
```
(Colima env vars exported.)
Expected: clean.

- [ ] **Step 3: Push and open the PR**

```bash
cd /Users/christophernowacki/film-goblin
git push -u origin security/tier1-hardening
```

Then create the PR with `gh pr create` — title `security: tier-1 hardening (profiles grants, IP rate limits, input constraints)`, body written to `/tmp/pr-body.md` first (avoid heredoc gotcha) containing: summary of the three fixes, link to the spec file, and this **post-merge rollout checklist**:

```markdown
## Post-merge rollout
1. Apply migrations: `set -a; source db/.env; set +a; cd db && npm run migrate`
   (migrate runner is incremental — applies only 0203–0205)
2. Deploy: `npx vercel deploy --prod --yes` from repo root
3. Supabase dashboard (manual): Auth → min password length 8; enable leaked-password protection
4. Smoke:
   - signed-out `/film/<id>` and `/p/<username>` render
   - `/settings` loads for a signed-in user
   - anon REST probe fails: `curl "$SUPABASE_URL/rest/v1/profiles?select=unsubscribe_token" -H "apikey: $ANON_KEY"` → permission denied
   - 11 rapid bad-password sign-ins for one username → "Too many attempts"

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Either deploy/migrate order is safe (fail-open limiter; explicit selects work under old and new grants).
