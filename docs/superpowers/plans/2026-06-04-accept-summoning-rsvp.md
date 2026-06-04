# Accept a Summoning — RSVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a goblin accept a gazing summon (toggle on/off) from the gazing page or the feed card, posting a `gazing_attending` timeline card, notifying the host, and showing a "who's in" roster.

**Architecture:** A new `gazing_attendees` table is the source of truth (presence of a row = RSVP). Insert/delete triggers fan out a `gazing_attending` activity + a `gazing_rsvp` host notification, and retract the activity on un-RSVP — the same trigger pattern as every feed kind. A `toggleGazingRsvp` action flips the row; feed enrichment + a roster query power the "who's in" displays and the viewer's button state.

**Tech Stack:** Postgres (migrations + plpgsql SECURITY DEFINER triggers), Next.js 15 server actions + server/client components, TypeScript, vitest, testcontainers Postgres.

**Node 20 required.** Prefix one-shot `npm`/`tsx` calls with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`. DB tests (`test:rls`) need Docker; if testcontainers can't find the runtime, export first:
`export DOCKER_HOST=unix:///Users/christophernowacki/.colima/default/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/Users/christophernowacki/.colima/default/docker.sock TESTCONTAINERS_RYUK_DISABLED=true`

**Spec:** `docs/superpowers/specs/2026-06-04-accept-summoning-rsvp-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `db/migrations/0200_gazing_rsvp_kinds.sql` | `gazing_attending` + `gazing_rsvp` enum values | Create |
| `db/migrations/0201_gazing_attendees.sql` | table + RLS + grants + 3 triggers + broadcast-read policy | Create |
| `db/tests/rls/gazing-attendees.test.ts` | trigger + RLS behavior | Create |
| `app/lib/supabase/types.ts` | hand-edit: new table + 2 enum values | Modify |
| `app/lib/actions/gazing.ts` | `toggleGazingRsvp` action | Modify |
| `app/tests/actions/gazing-rsvp.test.ts` | action toggle/guards | Create |
| `app/lib/queries/gazing-roster.ts` | roster fetch + pure `buildRosterMap` | Create |
| `app/tests/queries/gazing-roster.test.ts` | `buildRosterMap` units | Create |
| `app/lib/queries/activity.ts` | `gazing_attending` variant + roster on `gazing_invited` | Modify |
| `app/components/GazingRsvpButton.tsx` | shared client toggle button | Create |
| `app/components/activity/ActivityGazingAttending.tsx` | attending feed card | Create |
| `app/components/activity/ActivityGazingInvited.tsx` | add roster + button to summon card | Modify |
| `app/components/activity/ActivityRow.tsx` | register `gazing_attending` | Modify |
| `app/app/gazing/[token]/page.tsx` | RSVP button + roster + host chip | Modify |
| `app/lib/notifications/display.tsx` | `gazing_rsvp` copy + target | Modify |

---

## Task 1: Migrations + DB trigger/RLS test

**Files:**
- Create: `db/migrations/0200_gazing_rsvp_kinds.sql`
- Create: `db/migrations/0201_gazing_attendees.sql`
- Test: `db/tests/rls/gazing-attendees.test.ts`

Strict TDD. Run from `db/`. Export the Docker env (see header) if `test:rls` can't find a runtime.

- [ ] **Step 1: Write the failing test**

Create `db/tests/rls/gazing-attendees.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, commit, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

// Creates a broadcast gazing_invites row owned by `hostId`, returns its id.
async function makeInvite(client: TestDb["client"], hostId: string, filmId: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO gazing_invites
       (token, created_by, film_id, film_title, theater_name, starts_at, tickets_url, format_label, broadcast)
     VALUES ($1, $2, $3, 'Test Film', 'The Loft Cinema', now() + interval '2 days', 'https://loftcinema.org/film/x/', '70mm', true)
     RETURNING id`,
    [`tok-${randomUUID().slice(0, 12)}`, hostId, filmId],
  );
  return r.rows[0].id;
}

describe("gazing_attendees — RSVP triggers + RLS", () => {
  it("insert fans out a gazing_attending activity and a gazing_rsvp notification to the host", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const inviteId = await makeInvite(db.client, fx.userA.id, fx.filmId);
    await commit(db.client);

    // userB accepts (authenticated as themselves)
    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(`INSERT INTO gazing_attendees (invite_id, user_id) VALUES ($1, $2)`, [inviteId, fx.userB.id]);
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const act = await db.client.query<{ actor_user_id: string; payload: { invite_id: string; film_id: string; token: string; to_user_id: string } }>(
      `SELECT actor_user_id, payload FROM activity WHERE kind = 'gazing_attending' AND actor_user_id = $1`,
      [fx.userB.id],
    );
    const notif = await db.client.query<{ user_id: string; actor_user_id: string; payload: { film_id: string; token: string } }>(
      `SELECT user_id, actor_user_id, payload FROM notifications WHERE kind = 'gazing_rsvp' AND user_id = $1`,
      [fx.userA.id],
    );
    await commit(db.client);

    expect(act.rowCount).toBe(1);
    expect(act.rows[0].payload.invite_id).toBe(inviteId);
    expect(act.rows[0].payload.film_id).toBe(fx.filmId);
    expect(act.rows[0].payload.to_user_id).toBe(fx.userA.id);
    expect(typeof act.rows[0].payload.token).toBe("string");

    expect(notif.rowCount).toBe(1);
    expect(notif.rows[0].actor_user_id).toBe(fx.userB.id);
    expect(notif.rows[0].payload.film_id).toBe(fx.filmId);
  });

  it("delete retracts the activity but leaves the host notification", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const inviteId = await makeInvite(db.client, fx.userA.id, fx.filmId);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(`INSERT INTO gazing_attendees (invite_id, user_id) VALUES ($1, $2)`, [inviteId, fx.userB.id]);
    await db.client.query(`DELETE FROM gazing_attendees WHERE invite_id = $1 AND user_id = $2`, [inviteId, fx.userB.id]);
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const act = await db.client.query(`SELECT 1 FROM activity WHERE kind = 'gazing_attending' AND actor_user_id = $1`, [fx.userB.id]);
    const notif = await db.client.query(`SELECT 1 FROM notifications WHERE kind = 'gazing_rsvp' AND user_id = $1`, [fx.userA.id]);
    await commit(db.client);

    expect(act.rowCount).toBe(0);
    expect(notif.rowCount).toBe(1);
  });

  it("does not notify when the host RSVPs their own invite", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const inviteId = await makeInvite(db.client, fx.userA.id, fx.filmId);
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(`INSERT INTO gazing_attendees (invite_id, user_id) VALUES ($1, $2)`, [inviteId, fx.userA.id]);
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const notif = await db.client.query(`SELECT 1 FROM notifications WHERE kind = 'gazing_rsvp' AND user_id = $1`, [fx.userA.id]);
    await commit(db.client);
    expect(notif.rowCount).toBe(0);
  });

  it("a user cannot RSVP as someone else", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const inviteId = await makeInvite(db.client, fx.userA.id, fx.filmId);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    await expect(
      db.client.query(`INSERT INTO gazing_attendees (invite_id, user_id) VALUES ($1, $2)`, [inviteId, fx.userC.id]),
    ).rejects.toThrow();
    await rollback(db.client);
  });

  it("blocks duplicate RSVPs", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const inviteId = await makeInvite(db.client, fx.userA.id, fx.filmId);
    await db.client.query(`INSERT INTO gazing_attendees (invite_id, user_id) VALUES ($1, $2)`, [inviteId, fx.userB.id]);
    await expect(
      db.client.query(`INSERT INTO gazing_attendees (invite_id, user_id) VALUES ($1, $2)`, [inviteId, fx.userB.id]),
    ).rejects.toThrow();
    await rollback(db.client);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- gazing-attendees`
Expected: FAIL — `relation "gazing_attendees" does not exist`.

- [ ] **Step 3: Create migration 0200 (enum values)**

Create `db/migrations/0200_gazing_rsvp_kinds.sql`:

```sql
-- 0200_gazing_rsvp_kinds.sql
-- Enum values for "accept a summoning" (RSVP). Separate file from the table +
-- triggers (0201) because ALTER TYPE … ADD VALUE must commit before a function
-- can reference the new value. Mirrors 0198/0199 (gazing_invited).

ALTER TYPE activity_kind ADD VALUE IF NOT EXISTS 'gazing_attending';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'gazing_rsvp';
```

- [ ] **Step 4: Create migration 0201 (table + RLS + triggers)**

Create `db/migrations/0201_gazing_attendees.sql`:

```sql
-- 0201_gazing_attendees.sql
-- RSVP to a gazing. A row = an accepted summon (toggle = insert/delete).
-- Insert fans out a gazing_attending activity + a gazing_rsvp host notification;
-- delete retracts the activity (mirrors 0168 watchlist-delete cleanup).
-- Depends on 0200 (enum values committed in their own transaction).

CREATE TABLE gazing_attendees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id   uuid NOT NULL REFERENCES gazing_invites(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invite_id, user_id)
);

CREATE INDEX gazing_attendees_invite_idx ON gazing_attendees (invite_id);

ALTER TABLE gazing_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY gazing_attendees_read ON gazing_attendees
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY gazing_attendees_self_insert ON gazing_attendees
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY gazing_attendees_self_delete ON gazing_attendees
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON gazing_attendees TO authenticated;

-- Let authenticated users read BROADCAST invites (needed for feed roster
-- enrichment: token -> invite_id). Private SMS-share invites stay owner-only.
CREATE POLICY gazing_invites_broadcast_read ON gazing_invites
  FOR SELECT TO authenticated
  USING (broadcast = true);

-- Insert fan-out: activity (always) + notification (unless host RSVPs own invite).
CREATE OR REPLACE FUNCTION public.activity_on_gazing_attendee_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inv gazing_invites%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM public.gazing_invites WHERE id = NEW.invite_id;

  INSERT INTO public.activity (actor_user_id, kind, payload)
  VALUES (
    NEW.user_id,
    'gazing_attending',
    jsonb_build_object(
      'invite_id', inv.id,
      'film_id', inv.film_id,
      'token', inv.token,
      'theater_name', inv.theater_name,
      'starts_at', inv.starts_at,
      'format_label', inv.format_label,
      'to_user_id', inv.created_by
    )
  );

  IF inv.created_by <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, kind, actor_user_id, payload)
    VALUES (
      inv.created_by,
      'gazing_rsvp',
      NEW.user_id,
      jsonb_build_object('invite_id', inv.id, 'film_id', inv.film_id, 'token', inv.token)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_gazing_attendee_insert
AFTER INSERT ON gazing_attendees
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_gazing_attendee_insert();

-- Delete retracts the attending card. Notification persists (point-in-time).
CREATE OR REPLACE FUNCTION public.activity_on_gazing_attendee_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.activity
  WHERE actor_user_id = OLD.user_id
    AND kind = 'gazing_attending'
    AND payload->>'invite_id' = OLD.invite_id::text;
  RETURN OLD;
END;
$$;

CREATE TRIGGER on_gazing_attendee_delete
AFTER DELETE ON gazing_attendees
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_gazing_attendee_delete();
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- gazing-attendees`
Expected: PASS (all 5 cases).

- [ ] **Step 6: Confirm pg-mem smoke still passes**

Run: `cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: PASS. (`0201` is skipped by the existing `LANGUAGE plpgsql SECURITY DEFINER` filter; `0200`'s `ALTER TYPE` lines strip to nothing. The smoke only asserts a fixed core table set, which is unaffected. If it unexpectedly fails, extend the skip list in `db/tests/helpers/pg-mem.ts` per `db/migrations/CLAUDE.md` — do not edit the migrations.)

- [ ] **Step 7: Commit**

```bash
cd /Users/christophernowacki/film-goblin
printf '%s\n' 'feat(db): gazing_attendees RSVP table + fan-out triggers' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>' > /tmp/rsvp-msg-1.txt
git add db/migrations/0200_gazing_rsvp_kinds.sql db/migrations/0201_gazing_attendees.sql db/tests/rls/gazing-attendees.test.ts
git commit -F /tmp/rsvp-msg-1.txt
```

---

## Task 2: Hand-edit generated types

**Files:**
- Modify: `app/lib/supabase/types.ts`

- [ ] **Step 1: Add the `gazing_attendees` table block**

In `app/lib/supabase/types.ts`, inside `public.Tables`, add a `gazing_attendees` block (place it alphabetically, right before the existing `gazing_invites:` block at ~line 561):

```ts
      gazing_attendees: {
        Row: {
          created_at: string
          id: string
          invite_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gazing_attendees_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "gazing_invites"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 2: Add the enum values**

In the `Enums` block, append `| "gazing_attending"` to the `activity_kind` union, and `| "gazing_rsvp"` to the `notification_kind` union.

In the `Constants` block, append `"gazing_attending",` to the `activity_kind` array and `"gazing_rsvp",` to the `notification_kind` array.

- [ ] **Step 3: Record the hand-edits in the warning block**

In the comment block near the top (~line 26), add:
```ts
//   gazing_attendees: entire table — added by mig 0201
//   activity_kind enum: gazing_attending — added by mig 0200
//   notification_kind enum: gazing_rsvp — added by mig 0200
```

- [ ] **Step 4: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/christophernowacki/film-goblin
printf '%s\n' 'chore(types): gazing_attendees + RSVP enum values' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>' > /tmp/rsvp-msg-2.txt
git add app/lib/supabase/types.ts
git commit -F /tmp/rsvp-msg-2.txt
```

---

## Task 3: `toggleGazingRsvp` action

**Files:**
- Modify: `app/lib/actions/gazing.ts`
- Test: `app/tests/actions/gazing-rsvp.test.ts`

The existing file exports `createGazingInvite`/`summonCoven` and a `Client` type, `serviceRoleClient`, `requireAuthUser`, `revalidatePath`, `createClient`. Read it first; reuse those imports.

- [ ] **Step 1: Write the failing test**

Create `app/tests/actions/gazing-rsvp.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

// service-role resolves the invite by token. `inviteRow` is swapped per test.
let inviteRow: { id: string; created_by: string } | null;
vi.mock("@/lib/supabase/service-role", () => ({
  serviceRoleClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: inviteRow, error: null }) }) }),
    }),
  }),
}));

// Injected user client over gazing_attendees. `existingRow` controls the
// select-existing result; inserts/deletes are captured.
let existingRow: { id: string } | null;
let inserted: Record<string, unknown> | null;
let deletedId: string | null;

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: (table: string) => {
      if (table !== "gazing_attendees") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingRow, error: null }) }) }) }),
        insert: async (payload: Record<string, unknown>) => { inserted = payload; return { error: null }; },
        delete: () => ({ eq: async (_col: string, id: string) => { deletedId = id; return { error: null }; } }),
      };
    },
  } as never;
}

beforeEach(() => { inviteRow = { id: "inv-1", created_by: "host-1" }; existingRow = null; inserted = null; deletedId = null; });

describe("toggleGazingRsvp", () => {
  it("inserts an attendee row when not yet attending", async () => {
    const { _toggleGazingRsvp } = await import("@/lib/actions/gazing");
    const res = await _toggleGazingRsvp(fakeClient(), "tok-1");
    expect(res.attending).toBe(true);
    expect(inserted).toEqual({ invite_id: "inv-1", user_id: "user-1" });
  });

  it("deletes the attendee row when already attending", async () => {
    existingRow = { id: "att-9" };
    const { _toggleGazingRsvp } = await import("@/lib/actions/gazing");
    const res = await _toggleGazingRsvp(fakeClient(), "tok-1");
    expect(res.attending).toBe(false);
    expect(deletedId).toBe("att-9");
  });

  it("rejects the host RSVPing their own gazing", async () => {
    inviteRow = { id: "inv-1", created_by: "user-1" };
    const { _toggleGazingRsvp } = await import("@/lib/actions/gazing");
    await expect(_toggleGazingRsvp(fakeClient(), "tok-1")).rejects.toThrow(/host/i);
  });

  it("rejects an unknown token", async () => {
    inviteRow = null;
    const { _toggleGazingRsvp } = await import("@/lib/actions/gazing");
    await expect(_toggleGazingRsvp(fakeClient(), "tok-x")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- gazing-rsvp`
Expected: FAIL — `_toggleGazingRsvp` is not exported.

- [ ] **Step 3: Implement the action**

Append to `app/lib/actions/gazing.ts` (after the existing exports; reuse the existing `Client`, `serviceRoleClient`, `requireAuthUser`, `createClient`, `revalidatePath` already imported in the file):

```ts
export interface ToggleRsvpResult {
  attending: boolean;
}

export async function _toggleGazingRsvp(client: Client, token: string): Promise<ToggleRsvpResult> {
  const user = await requireAuthUser(client);

  const svc = serviceRoleClient();
  const { data: invite, error: inviteErr } = await svc
    .from("gazing_invites")
    .select("id, created_by")
    .eq("token", token)
    .maybeSingle();
  if (inviteErr) throw inviteErr;
  if (!invite) throw new Error("That gazing has expired");
  if (invite.created_by === user.id) throw new Error("You're hosting this gazing");

  const { data: existing, error: existErr } = await client
    .from("gazing_attendees")
    .select("id")
    .eq("invite_id", invite.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existErr) throw existErr;

  if (existing) {
    const { error } = await client.from("gazing_attendees").delete().eq("id", existing.id);
    if (error) throw error;
    return { attending: false };
  }

  const { error } = await client.from("gazing_attendees").insert({ invite_id: invite.id, user_id: user.id });
  if (error) throw error;
  return { attending: true };
}

export async function toggleGazingRsvp(token: string): Promise<ToggleRsvpResult> {
  const supabase = await createClient();
  const result = await _toggleGazingRsvp(supabase, token);
  revalidatePath("/home");
  revalidatePath(`/gazing/${token}`);
  return result;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- gazing-rsvp`
Expected: PASS (4 cases).

- [ ] **Step 5: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/christophernowacki/film-goblin
printf '%s\n' 'feat(gazing): toggleGazingRsvp action' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>' > /tmp/rsvp-msg-3.txt
git add app/lib/actions/gazing.ts app/tests/actions/gazing-rsvp.test.ts
git commit -F /tmp/rsvp-msg-3.txt
```

---

## Task 4: Roster query + pure `buildRosterMap`

**Files:**
- Create: `app/lib/queries/gazing-roster.ts`
- Test: `app/tests/queries/gazing-roster.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/tests/queries/gazing-roster.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRosterMap, type AttendeeLite } from "@/lib/queries/gazing-roster";

const profiles = new Map<string, AttendeeLite>([
  ["u-b", { id: "u-b", username: "bex", display_name: null, avatar_url: null }],
  ["u-c", { id: "u-c", username: "cyn", display_name: null, avatar_url: null }],
]);

describe("buildRosterMap", () => {
  const invites = [{ id: "inv-1", token: "tok-1", created_by: "u-host" }];

  it("counts attendees and resolves their avatars", () => {
    const m = buildRosterMap(invites, [
      { invite_id: "inv-1", user_id: "u-b" },
      { invite_id: "inv-1", user_id: "u-c" },
    ], profiles, "u-x", 5);
    const r = m.get("tok-1")!;
    expect(r.count).toBe(2);
    expect(r.avatars.map(a => a.username)).toEqual(["bex", "cyn"]);
    expect(r.viewerIsIn).toBe(false);
    expect(r.viewerIsHost).toBe(false);
  });

  it("flags the viewer as in when they are an attendee", () => {
    const m = buildRosterMap(invites, [{ invite_id: "inv-1", user_id: "u-b" }], profiles, "u-b", 5);
    expect(m.get("tok-1")!.viewerIsIn).toBe(true);
  });

  it("flags the viewer as host when they own the invite", () => {
    const m = buildRosterMap(invites, [], profiles, "u-host", 5);
    const r = m.get("tok-1")!;
    expect(r.viewerIsHost).toBe(true);
    expect(r.count).toBe(0);
  });

  it("caps avatars at maxAvatars but keeps the full count", () => {
    const many = [
      { invite_id: "inv-1", user_id: "u-b" },
      { invite_id: "inv-1", user_id: "u-c" },
    ];
    const m = buildRosterMap(invites, many, profiles, null, 1);
    const r = m.get("tok-1")!;
    expect(r.count).toBe(2);
    expect(r.avatars).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- gazing-roster`
Expected: FAIL — cannot find module `@/lib/queries/gazing-roster`.

- [ ] **Step 3: Implement the roster module**

Create `app/lib/queries/gazing-roster.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export interface AttendeeLite {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface GazingRoster {
  count: number;            // attendees (host excluded)
  avatars: AttendeeLite[];  // up to maxAvatars attendee profiles
  viewerIsIn: boolean;
  viewerIsHost: boolean;
}

interface InviteRef { id: string; token: string; created_by: string }

export const EMPTY_ROSTER: GazingRoster = { count: 0, avatars: [], viewerIsIn: false, viewerIsHost: false };

/** Pure: assemble a token -> roster map from already-fetched rows. */
export function buildRosterMap(
  invites: InviteRef[],
  attendees: { invite_id: string; user_id: string }[],
  profilesById: Map<string, AttendeeLite>,
  viewerId: string | null,
  maxAvatars: number,
): Map<string, GazingRoster> {
  const byInvite = new Map<string, { user_id: string }[]>();
  for (const a of attendees) {
    const arr = byInvite.get(a.invite_id) ?? [];
    arr.push(a);
    byInvite.set(a.invite_id, arr);
  }

  const out = new Map<string, GazingRoster>();
  for (const inv of invites) {
    const rows = byInvite.get(inv.id) ?? [];
    const avatars = rows
      .map(r => profilesById.get(r.user_id))
      .filter((p): p is AttendeeLite => Boolean(p))
      .slice(0, maxAvatars);
    out.set(inv.token, {
      count: rows.length,
      avatars,
      viewerIsIn: viewerId != null && rows.some(r => r.user_id === viewerId),
      viewerIsHost: viewerId != null && inv.created_by === viewerId,
    });
  }
  return out;
}

async function fetchRosters(client: Client, invites: InviteRef[], viewerId: string | null): Promise<Map<string, GazingRoster>> {
  if (invites.length === 0) return new Map();
  const inviteIds = invites.map(i => i.id);

  const { data: attRows, error } = await client
    .from("gazing_attendees")
    .select("invite_id, user_id")
    .in("invite_id", inviteIds);
  if (error) throw error;
  const attendees = attRows ?? [];

  const userIds = Array.from(new Set(attendees.map(a => a.user_id)));
  const profilesById = new Map<string, AttendeeLite>();
  if (userIds.length > 0) {
    const { data: profs, error: pErr } = await client
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds);
    if (pErr) throw pErr;
    for (const p of profs ?? []) profilesById.set(p.id, p as AttendeeLite);
  }

  return buildRosterMap(invites, attendees, profilesById, viewerId, 5);
}

/** Feed path: resolve broadcast invites by token, then build rosters. */
export async function getGazingRostersForTokens(client: Client, tokens: string[], viewerId: string | null): Promise<Map<string, GazingRoster>> {
  const unique = Array.from(new Set(tokens));
  if (unique.length === 0) return new Map();
  const { data: invRows, error } = await client
    .from("gazing_invites")
    .select("id, token, created_by")
    .in("token", unique);
  if (error) throw error;
  return fetchRosters(client, (invRows ?? []) as InviteRef[], viewerId);
}

/** Page path: the caller already has the invite row. */
export async function getGazingRoster(client: Client, invite: InviteRef, viewerId: string | null): Promise<GazingRoster> {
  const map = await fetchRosters(client, [invite], viewerId);
  return map.get(invite.token) ?? EMPTY_ROSTER;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- gazing-roster`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
cd /Users/christophernowacki/film-goblin
printf '%s\n' 'feat(gazing): roster query + buildRosterMap' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>' > /tmp/rsvp-msg-4.txt
git add app/lib/queries/gazing-roster.ts app/tests/queries/gazing-roster.test.ts
git commit -F /tmp/rsvp-msg-4.txt
```

---

## Task 5: Feed enrichment — `gazing_attending` variant + roster on `gazing_invited`

**Files:**
- Modify: `app/lib/queries/activity.ts`

Read the file first. Confirm: the `EnrichedActivity` union (last variant is `gazing_invited`), the `RecipientLite` interface, `getEnrichedActivity`'s `Promise.all` of enrichment fetches, the `recipientMap`, `filmMap`, `payload`, `base`, `out`, and the `followerUserId` param.

- [ ] **Step 1: Import the roster helper**

At the top of `app/lib/queries/activity.ts`, add:

```ts
import { getGazingRostersForTokens, EMPTY_ROSTER, type GazingRoster } from "./gazing-roster";
```

- [ ] **Step 2: Extend the union**

Change the existing `gazing_invited` variant to include a roster, and add the `gazing_attending` variant:

```ts
  | { kind: "gazing_invited"; film: FilmLite; token: string; theaterName: string; startsAt: string; formatLabel: string | null; roster: GazingRoster }
  | { kind: "gazing_attending"; film: FilmLite; host: RecipientLite; token: string; theaterName: string; startsAt: string; formatLabel: string | null }
```

- [ ] **Step 3: Fetch rosters in the enrichment Promise.all**

Just before the `const [actors, films, recipients, lists, reactionsMap, commentsMap] = await Promise.all([` line, collect the summon tokens:

```ts
  const gazingTokens = raw
    .filter(r => r.kind === "gazing_invited")
    .map(r => (r.payload as { token?: string }).token)
    .filter((t): t is string => Boolean(t));
```

Add a new entry to the destructured `Promise.all` (append `gazingRosters` to both the destructuring and the array):

```ts
  const [actors, films, recipients, lists, reactionsMap, commentsMap, gazingRosters] = await Promise.all([
    // ...existing entries unchanged...
    getGazingRostersForTokens(client, gazingTokens, followerUserId),
  ]);
```

- [ ] **Step 4: Update the `gazing_invited` case and add `gazing_attending`**

Replace the existing `case "gazing_invited":` block and add the new case after it:

```ts
      case "gazing_invited":
        if (film) out.push({
          ...base,
          kind: "gazing_invited",
          film,
          token: payload.token ?? "",
          theaterName: payload.theater_name ?? "",
          startsAt: payload.starts_at ?? "",
          formatLabel: payload.format_label ?? null,
          roster: gazingRosters.get(payload.token) ?? EMPTY_ROSTER,
        });
        break;
      case "gazing_attending":
        if (film && recipient) out.push({
          ...base,
          kind: "gazing_attending",
          film,
          host: recipient,
          token: payload.token ?? "",
          theaterName: payload.theater_name ?? "",
          startsAt: payload.starts_at ?? "",
          formatLabel: payload.format_label ?? null,
        });
        break;
```

(`recipient` is the existing local resolved from `recipientMap.get(payload.to_user_id)`. Confirm that name by reading the file; the `recommendation_sent` case uses it.)

- [ ] **Step 5: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS. (The `gazing_invited` renderer doesn't consume `roster` yet — added in Task 7 — so the extra required field compiles fine. `ActivityRow.tsx`'s switch gains non-exhaustiveness for `gazing_attending`; if typecheck errors ONLY there, that's resolved in Task 7 — but the repo's `ActivityRow` switch has no exhaustive-return contract, so it should still pass. If it does error there, proceed to Task 7 and re-run; do not add a placeholder case here.)

- [ ] **Step 6: Commit**

```bash
cd /Users/christophernowacki/film-goblin
printf '%s\n' 'feat(feed): enrich gazing_attending + summon roster' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>' > /tmp/rsvp-msg-5.txt
git add app/lib/queries/activity.ts
git commit -F /tmp/rsvp-msg-5.txt
```

---

## Task 6: Shared `GazingRsvpButton`

**Files:**
- Create: `app/components/GazingRsvpButton.tsx`

Read `app/components/ToastProvider` usage in an existing client component (e.g. `app/components/ShowtimesSheet.tsx`) to confirm `const { toast } = useToast();`.

- [ ] **Step 1: Create the component**

Create `app/components/GazingRsvpButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { toggleGazingRsvp } from "@/lib/actions/gazing";

interface Props {
  token: string;
  initialAttending: boolean;
  isHost: boolean;
  canRsvp: boolean;       // false = logged out
  signupHref: string;     // where logged-out users go
  size?: "sm" | "lg";
}

export default function GazingRsvpButton({ token, initialAttending, isHost, canRsvp, signupHref, size = "lg" }: Props) {
  const [attending, setAttending] = useState(initialAttending);
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  if (isHost) {
    return <span className={`gazing-rsvp-chip${size === "sm" ? " gazing-rsvp-sm" : ""}`}>You&rsquo;re the host</span>;
  }

  const cls = `gazing-rsvp-btn${size === "sm" ? " gazing-rsvp-sm" : ""}${attending ? " is-in" : ""}`;

  if (!canRsvp) {
    return <a className={cls} href={signupHref}>I&rsquo;m in 👁</a>;
  }

  async function onClick() {
    setPending(true);
    const next = !attending;
    setAttending(next); // optimistic
    try {
      const res = await toggleGazingRsvp(token);
      setAttending(res.attending);
      toast(res.attending ? "You're in 👁" : "You backed out");
    } catch {
      setAttending(!next); // revert
      toast("Couldn't update RSVP");
    } finally {
      setPending(false);
    }
  }

  return (
    <button type="button" className={cls} disabled={pending} onClick={onClick}>
      {attending ? "You're in — tap to back out" : "I'm in 👁"}
    </button>
  );
}
```

- [ ] **Step 2: Add styles**

In `app/app/styles/210-showtimes.css`, append:

```css
.gazing-rsvp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 12px 18px;
  border: 2px solid var(--accent);
  background: var(--accent);
  color: var(--accent-ink);
  box-shadow: 4px 4px 0 var(--void);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
}

.gazing-rsvp-btn.is-in {
  background: var(--void);
  color: var(--bone);
  border-color: var(--bone);
}

.gazing-rsvp-btn:disabled { opacity: 0.6; cursor: default; }

.gazing-rsvp-chip {
  display: inline-flex;
  align-items: center;
  min-height: 46px;
  padding: 12px 16px;
  border: 2px dashed var(--muted-dark);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.gazing-rsvp-sm {
  min-height: 34px;
  padding: 7px 12px;
  font-size: 10px;
  box-shadow: 3px 3px 0 var(--void);
}
```

- [ ] **Step 3: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/christophernowacki/film-goblin
printf '%s\n' 'feat(gazing): shared GazingRsvpButton' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>' > /tmp/rsvp-msg-6.txt
git add app/components/GazingRsvpButton.tsx app/app/styles/210-showtimes.css
git commit -F /tmp/rsvp-msg-6.txt
```

---

## Task 7: Attending card + roster/button on the summon card

**Files:**
- Create: `app/components/activity/ActivityGazingAttending.tsx`
- Modify: `app/components/activity/ActivityRow.tsx`
- Modify: `app/components/activity/ActivityGazingInvited.tsx`

Read `ActivityGazingInvited.tsx` (the current summon card) and `app/components/Avatar.tsx` props first.

- [ ] **Step 1: Create the attending card**

Create `app/components/activity/ActivityGazingAttending.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import Avatar from "../Avatar";
import ActivityFooter from "./ActivityFooter";
import { formatSummonMeta } from "@/lib/gazing/summon-meta";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "gazing_attending" }>;

export default function ActivityGazingAttending({ item }: { item: Item }) {
  const gazingHref = `/gazing/${item.token}`;
  const meta = formatSummonMeta(item.theaterName, item.startsAt, item.formatLabel);

  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.username} color="var(--accent)" size={36} url={item.actor.avatar_url} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link prefetch={false} href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.username}</Link>
          {" is attending a ritual gazing of "}
          <Link prefetch={false} href={gazingHref} style={{ color: "var(--accent)", fontStyle: "italic" }}>{item.film.title}</Link>
          {" with "}
          <Link prefetch={false} href={`/p/${encodeURIComponent(item.host.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.host.username}</Link>.
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 4, color: "var(--muted)", letterSpacing: "0.04em" }}>{meta}</div>
        <ActivityFooter item={item} />
      </div>
      <Link prefetch={false} href={gazingHref}>
        <Image src={item.film.artwork_url} alt={item.film.title} width={40} height={60} style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }} />
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Register it in `ActivityRow.tsx`**

Add the import alongside the others:
```tsx
import ActivityGazingAttending from "./ActivityGazingAttending";
```
Add the case:
```tsx
    case "gazing_attending": return <ActivityGazingAttending item={item} />;
```

- [ ] **Step 3: Add the roster + RSVP button to the summon card**

In `app/components/activity/ActivityGazingInvited.tsx`, add imports:
```tsx
import GazingRsvpButton from "../GazingRsvpButton";
```
After the existing `<div>` that renders `{meta}` (and before `<ActivityFooter …>`), insert a roster line + the button:
```tsx
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <GazingRsvpButton
            token={item.token}
            initialAttending={item.roster.viewerIsIn}
            isHost={item.roster.viewerIsHost}
            canRsvp
            signupHref={`/gazing/${item.token}`}
            size="sm"
          />
          {item.roster.count > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {item.roster.avatars.map(a => (
                <Avatar key={a.id} name={a.username} color="var(--accent)" size={22} url={a.avatar_url} />
              ))}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
                {item.roster.count} in
              </span>
            </span>
          )}
        </div>
```
(`Avatar` is already imported in this file. If not, add `import Avatar from "../Avatar";`.)

- [ ] **Step 4: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/christophernowacki/film-goblin
printf '%s\n' 'feat(feed): attending card + summon-card roster/RSVP' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>' > /tmp/rsvp-msg-7.txt
git add app/components/activity/ActivityGazingAttending.tsx app/components/activity/ActivityRow.tsx app/components/activity/ActivityGazingInvited.tsx
git commit -F /tmp/rsvp-msg-7.txt
```

---

## Task 8: Gazing page — RSVP button + roster

**Files:**
- Modify: `app/app/gazing/[token]/page.tsx`

Read the current file. It has `loadInvite(token)` (service-role select), a `GazingInvite` interface, `getServerUser`, `filmHref`/`signupHref`/`watchlistHref`, and a `hero-actions` CTA cluster.

- [ ] **Step 1: Add `id` to the invite load**

In `loadInvite`, add `id` to the select string and to the `GazingInvite` interface:
- Select: change `.select("token, created_by, …")` to `.select("id, token, created_by, …")`.
- Interface: add `id: string;` to `GazingInvite`.

- [ ] **Step 2: Fetch the roster + import**

Add imports at the top:
```tsx
import { serviceRoleClient } from "@/lib/supabase/service-role";  // already imported — keep one copy
import GazingRsvpButton from "@/components/GazingRsvpButton";
import { getGazingRoster } from "@/lib/queries/gazing-roster";
import Avatar from "@/components/Avatar";
```
In `GazingPage`, after `const user = await getServerUser();`, add:
```tsx
  const roster = await getGazingRoster(
    serviceRoleClient(),
    { id: invite.id, token: invite.token, created_by: invite.created_by },
    user?.id ?? null,
  );
  const isHost = Boolean(user) && invite.created_by === user!.id;
```

- [ ] **Step 3: Add the RSVP button to the hero-actions cluster**

In the `hero-actions` `<div>`, add the RSVP button as the first action (before "Get tickets"):
```tsx
            <GazingRsvpButton
              token={invite.token}
              initialAttending={roster.viewerIsIn}
              isHost={isHost}
              canRsvp={Boolean(user)}
              signupHref={signupHref}
              size="lg"
            />
```

- [ ] **Step 4: Add the "who's in" roster below the actions**

Immediately after the closing `</div>` of `hero-actions`, add:
```tsx
            {roster.count > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 20 }}>
                <div style={{ display: "flex" }}>
                  {roster.avatars.map(a => (
                    <span key={a.id} style={{ marginRight: -6 }}>
                      <Avatar name={a.username} color="var(--accent)" size={30} url={a.avatar_url} />
                    </span>
                  ))}
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--bone)", opacity: 0.8, letterSpacing: "0.04em" }}>
                  {roster.count} {roster.count === 1 ? "goblin is" : "goblins are"} in
                </span>
              </div>
            )}
```

- [ ] **Step 5: Typecheck + build**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Then: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build 2>&1 | tail -15`
Expected: both PASS (the build exercises the client/server boundary of `GazingRsvpButton`).

- [ ] **Step 6: Commit**

```bash
cd /Users/christophernowacki/film-goblin
printf '%s\n' 'feat(gazing): RSVP button + roster on the gazing page' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>' > /tmp/rsvp-msg-8.txt
git add app/app/gazing/[token]/page.tsx
git commit -F /tmp/rsvp-msg-8.txt
```

---

## Task 9: Notification copy + target

**Files:**
- Modify: `app/lib/notifications/display.tsx`

The query (`app/lib/queries/notifications.ts`) already enriches `payload.film_id` → `n.film` and `actor_user_id` → `n.actor`, so no query change is needed. Add the `gazing_rsvp` case to all three switches.

- [ ] **Step 1: `notificationTarget`**

Add to the `switch (n.kind)` in `notificationTarget`:
```tsx
    case "gazing_rsvp": {
      const token = (n.payload as { token?: string }).token;
      return token ? `/gazing/${token}` : "/home";
    }
```

- [ ] **Step 2: `notificationRichCopy`**

Add to the `switch (n.kind)` in `notificationRichCopy`:
```tsx
    case "gazing_rsvp":
      return <><strong>{actorName}</strong> is in for your gazing of <em>{title}</em>.</>;
```

- [ ] **Step 3: `notificationToastText`**

Add to the `switch (n.kind)` in `notificationToastText`:
```tsx
    case "gazing_rsvp":
      return `${actorName} is in for your gazing of ${title}`;
```

- [ ] **Step 4: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS (the three switches are exhaustive over `notification_kind`; adding the cases satisfies the new enum value).

- [ ] **Step 5: Commit**

```bash
cd /Users/christophernowacki/film-goblin
printf '%s\n' 'feat(notifications): render gazing_rsvp' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>' > /tmp/rsvp-msg-9.txt
git add app/lib/notifications/display.tsx
git commit -F /tmp/rsvp-msg-9.txt
```

---

## Task 10: Full verification

**Files:** none (verification only).

- [ ] **Step 1: App test suite**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test`
Expected: PASS (includes `gazing-rsvp`, `gazing-roster`).

- [ ] **Step 2: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Production build**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build`
Expected: succeeds.

- [ ] **Step 4: DB suites**

Run (export the Docker env from the header first if needed):
`cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:all`
Expected: PASS (pg-mem smoke + RLS/trigger incl. `gazing-attendees`).

- [ ] **Step 5: Apply migrations to production** (only when the user asks to ship)

```bash
cd /Users/christophernowacki/film-goblin/db
set -a; source .env; set +a
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
```
Expected: `0200` and `0201` apply cleanly.

- [ ] **Step 6: Push / PR / deploy** (only when the user asks to ship)

```bash
git push -u origin feat/accept-summoning-rsvp
gh pr create --fill
```
After merge, from repo root: `npx vercel deploy --prod --yes`.

---

## Notes for the implementer

- **`gazing_invites` read was relaxed** (mig 0201) so authenticated users can read *broadcast* invites — required for feed roster enrichment (token → invite_id). Private SMS-share invites stay owner-only; the gazing page reads them via service-role regardless.
- **Host self-RSVP** is blocked in the action and the notify trigger; the activity trigger would still fire for a host self-insert, but the action prevents that path, so it won't happen in practice.
- **Retract** removes only the `gazing_attending` activity card. The host notification is intentionally left as a point-in-time record.
- **The summon card's RSVP button always has `canRsvp`** (the `/home` feed requires auth). On the gazing page, `canRsvp` follows `Boolean(user)`.
- Reuses `formatSummonMeta` (Task 3 of the summon feature) and the feed's existing recipient-resolution for "with {host}".
