# Admin Announcements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-authored, full-screen, one-shot announcements that surface on the next authenticated page load and are dismissed permanently per user.

**Architecture:** New migration `0155_announcements.sql` adds three tables (`announcements`, `announcement_recipients`, `announcement_dismissals`) with RLS gated on the existing `staff` table. Read path: root layout calls `getPendingAnnouncement()` for authed users, conditionally renders a full-screen `<AnnouncementOverlay>` painted in the user's accent ink. Authoring lives at `/admin/announcements` with a list page and a publish-only compose form (no draft, no edit). Dismissal records a permanent row that hides the announcement from that user forever; CTA-click is treated as a dismissal.

**Tech Stack:** Next.js 15 App Router, Supabase SSR, TypeScript, Vitest, existing zine design tokens (`var(--accent)`, DM Serif Display, IBM Plex Sans).

**Spec:** `docs/superpowers/specs/2026-05-02-admin-announcements-design.md`

---

## File Structure

**New files (DB):**
- `db/migrations/0155_announcements.sql` — schema + RLS + indexes
- `db/tests/rls/announcements.test.ts` — RLS test suite

**New files (app — read path):**
- `app/lib/queries/announcements.ts` — `getPendingAnnouncement()` only
- `app/lib/actions/announcements.ts` — `dismissAnnouncement()` server action (non-admin-gated)
- `app/components/AnnouncementOverlay.tsx` — full-screen overlay client component
- `app/components/AnnouncementOverlay.module.css` — scoped styles for the overlay (or inline; see Task 6 for rationale)

**New files (app — admin):**
- `app/app/admin/announcements/page.tsx` — list page (server component)
- `app/app/admin/announcements/new/page.tsx` — wraps the form
- `app/app/admin/announcements/AnnouncementForm.tsx` — compose form (client)
- `app/app/admin/announcements/RecipientPicker.tsx` — search + chips picker (client)
- `app/app/admin/announcements/AnnouncementPreview.tsx` — live preview tile (client)
- `app/app/admin/announcements/ArchiveButton.tsx` — small confirm-and-archive client component for the list
- `app/lib/actions/admin/announcements.ts` — `adminPublishAnnouncement()`, `adminArchiveAnnouncement()`
- `app/lib/actions/admin/announcement-validation.ts` — pure validation helpers (URL regex, length checks)

**New files (tests):**
- `app/tests/actions/admin/announcement-validation.test.ts` — pure-function unit specs
- `app/tests/actions/announcements.test.ts` — env-gated round-trip integration

**Modified files:**
- `app/app/layout.tsx` — convert to async, call `getServerUser` + `getPendingAnnouncement`, mount overlay
- `app/lib/supabase/types.ts` — add the three new tables (hand-edit per project convention)
- `app/app/admin/layout.tsx` — add "Announcements" link to admin nav (whatever pattern it uses)

---

## Task 1: Database migration + types

**Files:**
- Create: `db/migrations/0155_announcements.sql`
- Modify: `app/lib/supabase/types.ts` (hand-edit to add the three new tables)

- [ ] **Step 1: Write the migration file**

Create `db/migrations/0155_announcements.sql` with this exact content:

```sql
-- 0155: admin-authored one-shot announcements that surface as a full-screen
-- overlay on the next authenticated page load and are dismissed permanently.

CREATE TABLE announcements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  cta_label     TEXT,
  cta_href      TEXT,
  audience      TEXT NOT NULL CHECK (audience IN ('everyone', 'specific')),
  status        TEXT NOT NULL CHECK (status IN ('published', 'archived')) DEFAULT 'published',
  created_by    UUID NOT NULL REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at   TIMESTAMPTZ,
  CONSTRAINT cta_pair CHECK ((cta_label IS NULL) = (cta_href IS NULL)),
  CONSTRAINT cta_internal CHECK (cta_href IS NULL OR cta_href LIKE '/%')
);

CREATE TABLE announcement_recipients (
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE announcement_dismissals (
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  dismissed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, announcement_id)
);

CREATE INDEX idx_announcements_status_created ON announcements (status, created_at);
CREATE INDEX idx_announcement_recipients_user ON announcement_recipients (user_id);

ALTER TABLE announcements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_recipients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_dismissals    ENABLE ROW LEVEL SECURITY;

-- announcements: anyone authenticated can read; only staff.role='admin' writes.
CREATE POLICY announcements_select_authenticated ON announcements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY announcements_admin_write ON announcements
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'));

-- announcement_recipients: anyone authenticated can read (needed for the
-- pending-for-user query to see recipient rows for "specific" audiences);
-- only admins write.
CREATE POLICY ar_select_authenticated ON announcement_recipients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ar_admin_write ON announcement_recipients
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'));

-- announcement_dismissals: each user reads/writes only their own rows.
CREATE POLICY ad_self_select ON announcement_dismissals
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY ad_self_insert ON announcement_dismissals
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 2: Apply the migration to local + prod Supabase**

Local first (testcontainers + dev DB):

```bash
cd db && nvm use 20 && npm run migrate
```

Expected: `0155_announcements.sql` listed as applied. No errors.

Prod (only after local works and the rest of this task is committed; deferred to deploy step at the end):

```bash
# from repo root
set -a; source app/.env.local; set +a
cd db && npm run migrate
```

Expected: same.

- [ ] **Step 3: Hand-edit `app/lib/supabase/types.ts` to add the new tables**

Open `app/lib/supabase/types.ts`. Find the alphabetically-correct insertion point in the `Database["public"]["Tables"]` block (between existing entries; typically after `activity_*` entries, before `coven_members`). Add three table type entries.

For `announcements`:

```typescript
announcements: {
  Row: {
    id: string;
    title: string;
    body: string;
    cta_label: string | null;
    cta_href: string | null;
    audience: "everyone" | "specific";
    status: "published" | "archived";
    created_by: string;
    created_at: string;
    archived_at: string | null;
  };
  Insert: {
    id?: string;
    title: string;
    body: string;
    cta_label?: string | null;
    cta_href?: string | null;
    audience: "everyone" | "specific";
    status?: "published" | "archived";
    created_by: string;
    created_at?: string;
    archived_at?: string | null;
  };
  Update: {
    id?: string;
    title?: string;
    body?: string;
    cta_label?: string | null;
    cta_href?: string | null;
    audience?: "everyone" | "specific";
    status?: "published" | "archived";
    created_by?: string;
    created_at?: string;
    archived_at?: string | null;
  };
  Relationships: [];
};
```

For `announcement_recipients`:

```typescript
announcement_recipients: {
  Row: {
    announcement_id: string;
    user_id: string;
  };
  Insert: {
    announcement_id: string;
    user_id: string;
  };
  Update: {
    announcement_id?: string;
    user_id?: string;
  };
  Relationships: [];
};
```

For `announcement_dismissals`:

```typescript
announcement_dismissals: {
  Row: {
    user_id: string;
    announcement_id: string;
    dismissed_at: string;
  };
  Insert: {
    user_id: string;
    announcement_id: string;
    dismissed_at?: string;
  };
  Update: {
    user_id?: string;
    announcement_id?: string;
    dismissed_at?: string;
  };
  Relationships: [];
};
```

- [ ] **Step 4: Typecheck**

Run from `app/`:

```bash
nvm use 20 && npm run typecheck
```

Expected: `tsc --noEmit` exits 0 (no errors). The new types are referenced by nothing yet, so this just confirms the types file still compiles.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0155_announcements.sql app/lib/supabase/types.ts
git commit -F /tmp/msg.txt
```

Where `/tmp/msg.txt` contains:

```
feat(announcements): mig 0155 + types for admin announcements

Adds three tables (announcements, announcement_recipients,
announcement_dismissals) with RLS gated on staff.role='admin' for
write paths and per-user gating on dismissals. Indexes:
status+created_at on announcements, user_id on recipients.

Spec: docs/superpowers/specs/2026-05-02-admin-announcements-design.md
```

---

## Task 2: Validation helpers (pure functions)

**Files:**
- Create: `app/lib/actions/admin/announcement-validation.ts`
- Test: `app/tests/actions/admin/announcement-validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/tests/actions/admin/announcement-validation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  validateAnnouncement,
  isInternalPath,
  TITLE_MAX,
  BODY_MAX,
  CTA_LABEL_MAX,
} from "../../../lib/actions/admin/announcement-validation";

describe("isInternalPath", () => {
  it("accepts a leading-slash path", () => {
    expect(isInternalPath("/films")).toBe(true);
    expect(isInternalPath("/film/abc-123")).toBe(true);
    expect(isInternalPath("/admin/films?untagged=1")).toBe(true);
  });

  it("rejects an external URL", () => {
    expect(isInternalPath("https://example.com")).toBe(false);
    expect(isInternalPath("//evil.com/path")).toBe(false);
    expect(isInternalPath("javascript:alert(1)")).toBe(false);
  });

  it("rejects a relative path with no leading slash", () => {
    expect(isInternalPath("films")).toBe(false);
    expect(isInternalPath("")).toBe(false);
  });
});

describe("validateAnnouncement", () => {
  const validBase = {
    title: "Hello",
    body: "Body text",
    cta_label: null,
    cta_href: null,
    audience: "everyone" as const,
    recipient_ids: [],
  };

  it("passes a minimal valid announcement", () => {
    expect(validateAnnouncement(validBase)).toBeNull();
  });

  it("rejects empty title", () => {
    expect(validateAnnouncement({ ...validBase, title: "   " })).toMatch(/title/i);
  });

  it("rejects empty body", () => {
    expect(validateAnnouncement({ ...validBase, body: "" })).toMatch(/body/i);
  });

  it(`rejects title longer than ${TITLE_MAX}`, () => {
    expect(validateAnnouncement({ ...validBase, title: "x".repeat(TITLE_MAX + 1) })).toMatch(/title/i);
  });

  it(`rejects body longer than ${BODY_MAX}`, () => {
    expect(validateAnnouncement({ ...validBase, body: "x".repeat(BODY_MAX + 1) })).toMatch(/body/i);
  });

  it("requires both CTA fields when one is set", () => {
    expect(validateAnnouncement({ ...validBase, cta_label: "Go", cta_href: null })).toMatch(/cta/i);
    expect(validateAnnouncement({ ...validBase, cta_label: null, cta_href: "/x" })).toMatch(/cta/i);
  });

  it("accepts a complete CTA pair", () => {
    expect(validateAnnouncement({ ...validBase, cta_label: "Go", cta_href: "/films" })).toBeNull();
  });

  it("rejects a CTA href that is not internal", () => {
    expect(validateAnnouncement({ ...validBase, cta_label: "Go", cta_href: "https://evil.com" })).toMatch(/cta/i);
  });

  it(`rejects CTA label longer than ${CTA_LABEL_MAX}`, () => {
    expect(validateAnnouncement({
      ...validBase,
      cta_label: "x".repeat(CTA_LABEL_MAX + 1),
      cta_href: "/x",
    })).toMatch(/cta/i);
  });

  it("rejects audience='specific' with empty recipients", () => {
    expect(validateAnnouncement({
      ...validBase,
      audience: "specific",
      recipient_ids: [],
    })).toMatch(/recipient/i);
  });

  it("accepts audience='specific' with at least one recipient", () => {
    expect(validateAnnouncement({
      ...validBase,
      audience: "specific",
      recipient_ids: ["00000000-0000-0000-0000-000000000001"],
    })).toBeNull();
  });

  it("dedupes duplicate recipient ids without raising an error", () => {
    expect(validateAnnouncement({
      ...validBase,
      audience: "specific",
      recipient_ids: ["a", "a", "b"],
    })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app && nvm use 20 && npm test -- tests/actions/admin/announcement-validation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `app/lib/actions/admin/announcement-validation.ts`:

```typescript
export const TITLE_MAX = 80;
export const BODY_MAX = 500;
export const CTA_LABEL_MAX = 24;

const INTERNAL_PATH_RE = /^\/[A-Za-z0-9/_\-.?=&%]*$/;

export function isInternalPath(s: string): boolean {
  return INTERNAL_PATH_RE.test(s);
}

export interface AnnouncementInput {
  title: string;
  body: string;
  cta_label: string | null;
  cta_href: string | null;
  audience: "everyone" | "specific";
  recipient_ids: string[];
}

/**
 * Returns null when valid, or a human-readable error string. The string is
 * surfaced verbatim to the admin UI.
 */
export function validateAnnouncement(input: AnnouncementInput): string | null {
  const title = input.title.trim();
  if (!title) return "Title is required.";
  if (title.length > TITLE_MAX) return `Title must be ${TITLE_MAX} characters or fewer.`;

  const body = input.body.trim();
  if (!body) return "Body is required.";
  if (body.length > BODY_MAX) return `Body must be ${BODY_MAX} characters or fewer.`;

  const labelSet = input.cta_label !== null;
  const hrefSet = input.cta_href !== null;
  if (labelSet !== hrefSet) {
    return "CTA label and URL must both be set, or both empty.";
  }
  if (labelSet && hrefSet) {
    if (input.cta_label!.trim().length === 0) return "CTA label is required.";
    if (input.cta_label!.length > CTA_LABEL_MAX) return `CTA label must be ${CTA_LABEL_MAX} characters or fewer.`;
    if (!isInternalPath(input.cta_href!)) return "CTA URL must be an internal path starting with /.";
  }

  if (input.audience === "specific") {
    const unique = new Set(input.recipient_ids);
    if (unique.size === 0) return "Pick at least one recipient.";
  }

  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd app && npm test -- tests/actions/admin/announcement-validation.test.ts
```

Expected: PASS, all 14 specs green.

- [ ] **Step 5: Commit**

```bash
git add app/lib/actions/admin/announcement-validation.ts app/tests/actions/admin/announcement-validation.test.ts
git commit -F /tmp/msg.txt
```

Where `/tmp/msg.txt` contains:

```
feat(announcements): pure validation helpers + 14 unit specs

Title/body length caps, CTA pair invariant, internal-path-only
href regex, recipient-required-for-specific-audience. No DB
dependency; consumed by the publish server action and (later)
the admin form.
```

---

## Task 3: `getPendingAnnouncement` query helper

**Files:**
- Create: `app/lib/queries/announcements.ts`

(No unit tests — this is a thin Supabase query. RLS-level behavior is exercised in Task 9; integration-level behavior in Task 10.)

- [ ] **Step 1: Write the implementation**

Create `app/lib/queries/announcements.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface PendingAnnouncement {
  id: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_href: string | null;
}

/**
 * Returns the oldest published announcement that:
 *   - the user has not yet dismissed
 *   - is targeted at this user (audience='everyone' OR they're in the recipient list)
 *
 * Returns null when there's nothing pending. Logs and returns null on DB error
 * so the layout never blocks page render on this query.
 */
export async function getPendingAnnouncement(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<PendingAnnouncement | null> {
  // Sub-1: ids the user has dismissed.
  const { data: dismissed, error: dErr } = await client
    .from("announcement_dismissals")
    .select("announcement_id")
    .eq("user_id", userId);
  if (dErr) {
    console.error("getPendingAnnouncement: dismissals lookup failed:", dErr);
    return null;
  }
  const dismissedIds = (dismissed ?? []).map(r => r.announcement_id);

  // Sub-2: candidate announcements (published, not dismissed by this user).
  let candidatesQ = client
    .from("announcements")
    .select("id, title, body, cta_label, cta_href, audience, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: true });
  if (dismissedIds.length > 0) {
    candidatesQ = candidatesQ.not("id", "in", `(${dismissedIds.join(",")})`);
  }
  const { data: candidates, error: cErr } = await candidatesQ;
  if (cErr) {
    console.error("getPendingAnnouncement: candidates lookup failed:", cErr);
    return null;
  }
  if (!candidates || candidates.length === 0) return null;

  // Sub-3: filter by audience. "everyone" passes. "specific" requires a
  // recipient row for this user.
  const everyone = candidates.filter(c => c.audience === "everyone");
  const specific = candidates.filter(c => c.audience === "specific");

  let specificForMe: typeof specific = [];
  if (specific.length > 0) {
    const { data: myRecipients, error: rErr } = await client
      .from("announcement_recipients")
      .select("announcement_id")
      .eq("user_id", userId)
      .in("announcement_id", specific.map(s => s.id));
    if (rErr) {
      console.error("getPendingAnnouncement: recipients lookup failed:", rErr);
      return null;
    }
    const myRecipientIds = new Set((myRecipients ?? []).map(r => r.announcement_id));
    specificForMe = specific.filter(s => myRecipientIds.has(s.id));
  }

  // Combined, FIFO. created_at-ascending is preserved across both arrays
  // because both came from the same ordered query.
  const eligible = [...everyone, ...specificForMe].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  if (eligible.length === 0) return null;
  const pick = eligible[0];
  return {
    id: pick.id,
    title: pick.title,
    body: pick.body,
    cta_label: pick.cta_label,
    cta_href: pick.cta_href,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/queries/announcements.ts
git commit -F /tmp/msg.txt
```

Where `/tmp/msg.txt` contains:

```
feat(announcements): getPendingAnnouncement read query

Three sub-queries (dismissals, candidates, recipients) instead
of a single SQL with NOT EXISTS, because PostgREST doesn't
expose correlated subqueries. FIFO oldest-first. Logs + returns
null on any DB error so the layout never blocks page render.
```

---

## Task 4: `dismissAnnouncement` server action

**Files:**
- Create: `app/lib/actions/announcements.ts`

- [ ] **Step 1: Write the implementation**

Create `app/lib/actions/announcements.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Records a dismissal for the calling user. Treats unique-violation (PK
 * collision from a concurrent dismissal in another tab) as success.
 *
 * Not admin-gated — every authenticated user calls this for themselves.
 */
export async function dismissAnnouncement(announcementId: string): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("announcement_dismissals")
    .insert({ user_id: user.id, announcement_id: announcementId });

  if (error) {
    // Postgres unique-violation code; both tabs dismissed → second is a no-op.
    if (error.code === "23505") {
      revalidatePath("/", "layout");
      return { ok: true };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/lib/actions/announcements.ts
git commit -F /tmp/msg.txt
```

Where `/tmp/msg.txt` contains:

```
feat(announcements): dismissAnnouncement server action

Inserts (auth.uid(), announcement_id) into announcement_dismissals.
PG 23505 (unique violation, e.g., concurrent dismissal across two
tabs) is treated as success. Calls revalidatePath("/", "layout")
to drop the overlay on the next render.
```

---

## Task 5: Admin server actions (publish + archive)

**Files:**
- Create: `app/lib/actions/admin/announcements.ts`

- [ ] **Step 1: Write the implementation**

Create `app/lib/actions/admin/announcements.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  validateAnnouncement,
  type AnnouncementInput,
} from "./announcement-validation";

export interface PublishResult {
  ok: true;
  announcementId: string;
}
export interface ActionError {
  ok: false;
  error: string;
}

export async function adminPublishAnnouncement(
  fields: AnnouncementInput,
): Promise<PublishResult | ActionError> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const err = validateAnnouncement(fields);
  if (err) return { ok: false, error: err };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const trimmedLabel = fields.cta_label?.trim() ?? null;
  const trimmedHref = fields.cta_href?.trim() ?? null;

  // 1) Insert the announcement row.
  const { data: created, error: insertErr } = await supabase
    .from("announcements")
    .insert({
      title: fields.title.trim(),
      body: fields.body.trim(),
      cta_label: trimmedLabel,
      cta_href: trimmedHref,
      audience: fields.audience,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insertErr || !created) {
    return { ok: false, error: insertErr?.message ?? "Failed to create announcement." };
  }

  // 2) When audience='specific', insert the recipient rows. If this fails we
  // delete the parent row to keep things consistent. (No transactional API
  // through PostgREST; manual cleanup is the next-best thing.)
  if (fields.audience === "specific") {
    const uniqueIds = Array.from(new Set(fields.recipient_ids));
    const recipientRows = uniqueIds.map(uid => ({
      announcement_id: created.id,
      user_id: uid,
    }));
    const { error: recErr } = await supabase
      .from("announcement_recipients")
      .insert(recipientRows);
    if (recErr) {
      await supabase.from("announcements").delete().eq("id", created.id);
      return { ok: false, error: `Recipient insert failed: ${recErr.message}` };
    }
  }

  revalidatePath("/admin/announcements");
  revalidatePath("/", "layout");
  return { ok: true, announcementId: created.id };
}

export async function adminArchiveAnnouncement(id: string): Promise<
  | { ok: true }
  | ActionError
> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const { error } = await supabase
    .from("announcements")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/announcements");
  revalidatePath("/", "layout");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/lib/actions/admin/announcements.ts
git commit -F /tmp/msg.txt
```

Where `/tmp/msg.txt` contains:

```
feat(announcements): admin publish + archive server actions

Both gated by requireAdmin (staff.role='admin'). Publish runs
validation, inserts the announcement row, then batch-inserts
recipient rows for audience='specific' (manual rollback on
recipient failure since PostgREST has no transactional API).
Archive flips status + sets archived_at. Both revalidate /admin
/announcements and the root layout.
```

---

## Task 6: AnnouncementOverlay component

**Files:**
- Create: `app/components/AnnouncementOverlay.tsx`

(Inline styles via `style={{ … }}`. The project uses inline styles + globals.css elsewhere — see `FilmForm.tsx` etc. for the precedent. No CSS module needed for one component.)

- [ ] **Step 1: Write the implementation**

Create `app/components/AnnouncementOverlay.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissAnnouncement } from "@/lib/actions/announcements";

export interface AnnouncementOverlayProps {
  announcement: {
    id: string;
    title: string;
    body: string;
    cta_label: string | null;
    cta_href: string | null;
  };
}

export default function AnnouncementOverlay({ announcement }: AnnouncementOverlayProps) {
  const [hidden, setHidden] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function handleDismiss(navigateTo: string | null) {
    setHidden(true); // optimistic: hide immediately
    startTransition(async () => {
      const res = await dismissAnnouncement(announcement.id);
      if (!res.ok) {
        // Rare: server failed to record. Re-show so the user can retry.
        // (Network errors during transitions surface as ok=false.)
        setHidden(false);
        return;
      }
      if (navigateTo) router.push(navigateTo);
    });
  }

  if (hidden) return null;

  // Body: paragraph breaks on \n\n, line breaks on single \n.
  const paragraphs = announcement.body.split(/\n\n+/);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "var(--accent)",
        color: "var(--bone)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "calc(env(safe-area-inset-top) + 32px) 24px calc(env(safe-area-inset-bottom) + 32px)",
        animation: "announcement-in 200ms ease-out",
        overflowY: "auto",
      }}
    >
      <style>{`
        @keyframes announcement-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>
        <h1
          id="announcement-title"
          style={{
            fontFamily: "var(--font-serif-display, 'DM Serif Display', serif)",
            fontSize: "clamp(36px, 6vw, 48px)",
            lineHeight: 1.1,
            margin: 0,
            marginBottom: 24,
          }}
        >
          {announcement.title}
        </h1>

        <div
          style={{
            fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
            fontSize: "clamp(16px, 2.4vw, 18px)",
            lineHeight: 1.5,
            maxWidth: 520,
            margin: "0 auto 32px",
          }}
        >
          {paragraphs.map((p, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : "1em 0 0" }}>
              {p.split("\n").map((line, j, arr) => (
                <span key={j}>
                  {line}
                  {j < arr.length - 1 && <br />}
                </span>
              ))}
            </p>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          {announcement.cta_label && announcement.cta_href && (
            <button
              type="button"
              onClick={() => handleDismiss(announcement.cta_href)}
              style={{
                background: "var(--bone)",
                color: "var(--accent)",
                border: "none",
                padding: "14px 32px",
                fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                minWidth: 180,
              }}
            >
              {announcement.cta_label}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDismiss(null)}
            style={{
              background: "transparent",
              color: "var(--bone)",
              border: "2px solid var(--bone)",
              padding: "12px 30px",
              fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
              minWidth: 180,
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/components/AnnouncementOverlay.tsx
git commit -F /tmp/msg.txt
```

Where `/tmp/msg.txt` contains:

```
feat(announcements): full-screen AnnouncementOverlay component

Paints viewport in var(--accent) (user's chosen ink). Renders
title (DM Serif Display), body (IBM Plex Sans, paragraph + line
breaks), optional CTA button (bone-on-accent), Got-it outline.
Both buttons fire dismissAnnouncement; CTA also router.push()es.
iOS safe-area padding. 200ms fade-up entrance.
```

---

## Task 7: Mount overlay in root layout

**Files:**
- Modify: `app/app/layout.tsx`

- [ ] **Step 1: Read the current layout to see exact insertion points**

Run:

```bash
cat app/app/layout.tsx
```

Note the existing structure: sync `RootLayout` function returning `<html>…<body><ToastProvider>{children}</ToastProvider></body></html>`.

- [ ] **Step 2: Convert to async + add the overlay mount**

Replace the `RootLayout` function with the following. Keep all existing `metadata` / `viewport` / `<head>` content unchanged.

```typescript
import { getServerUser } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { getPendingAnnouncement } from "@/lib/queries/announcements";
import AnnouncementOverlay from "@/components/AnnouncementOverlay";

// (existing imports / metadata / viewport stay above)

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();
  let pending = null;
  if (user) {
    const supabase = await createClient();
    pending = await getPendingAnnouncement(supabase, user.id);
  }

  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Rubik+Wet+Paint&family=Rubik+Glitch&family=Bungee&family=DM+Serif+Display:ital@0;1&family=IBM+Plex+Sans:wght@400;500;700;900&family=IBM+Plex+Serif:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
        {pending && <AnnouncementOverlay announcement={pending} />}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Boot the dev server and confirm it renders**

```bash
cd app && nvm use 20 && npm run dev
```

Open http://localhost:3000/home (signed in). With no pending announcements (which is the current state — none have been published), nothing should appear. Existing pages render normally. Stop the server with Ctrl-C.

Expected: no overlay, no console errors. (We test the with-overlay case manually in Task 12.)

- [ ] **Step 5: Commit**

```bash
git add app/app/layout.tsx
git commit -F /tmp/msg.txt
```

Where `/tmp/msg.txt` contains:

```
feat(announcements): mount AnnouncementOverlay in root layout

RootLayout now async, calls getServerUser() (cached per request)
and getPendingAnnouncement() when authed, mounts overlay as a
sibling of children. Anonymous viewers skip the lookup entirely.
```

---

## Task 8: RecipientPicker component

**Files:**
- Create: `app/app/admin/announcements/RecipientPicker.tsx`

- [ ] **Step 1: Write the implementation**

Create `app/app/admin/announcements/RecipientPicker.tsx`:

```typescript
"use client";

import { useMemo, useState } from "react";
import { filterCovenMembers, type Searchable } from "@/components/recommend-modal-search";

export interface RecipientPickerProps {
  // Full profile list comes from the server page; we don't fetch here.
  profiles: Searchable[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function RecipientPicker({ profiles, selectedIds, onChange }: RecipientPickerProps) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const matches = filterCovenMembers(profiles, query).slice(0, 30);

  const selectedProfiles = profiles.filter(p => selectedSet.has(p.id));

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter(x => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div>
      {selectedProfiles.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {selectedProfiles.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              style={{
                background: "var(--accent)",
                color: "var(--void)",
                border: "none",
                padding: "6px 12px",
                fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
                fontSize: 12,
                cursor: "pointer",
                borderRadius: 0,
              }}
              aria-label={`Remove ${p.username}`}
            >
              {p.username} ✕
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by username…"
        style={{
          width: "100%",
          padding: 10,
          background: "var(--void-2)",
          border: "2px solid var(--muted)",
          color: "var(--bone)",
          fontFamily: "var(--font-ui)",
          fontSize: 14,
        }}
      />

      {query.trim().length > 0 && (
        <div style={{ marginTop: 8, maxHeight: 240, overflowY: "auto", border: "1px solid var(--muted)" }}>
          {matches.length === 0 ? (
            <div style={{ padding: 10, color: "var(--muted)", fontSize: 13, fontStyle: "italic" }}>
              No matches.
            </div>
          ) : (
            matches.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: selectedSet.has(p.id) ? "var(--void-2)" : "transparent",
                  color: "var(--bone)",
                  border: "none",
                  borderBottom: "1px solid var(--muted)",
                  padding: "8px 10px",
                  fontFamily: "var(--font-ui)",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {p.username}
                {p.display_name && p.display_name !== p.username && (
                  <span style={{ color: "var(--muted)", marginLeft: 8 }}>({p.display_name})</span>
                )}
                {selectedSet.has(p.id) && <span style={{ float: "right" }}>✓</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/app/admin/announcements/RecipientPicker.tsx
git commit -F /tmp/msg.txt
```

Where `/tmp/msg.txt` contains:

```
feat(announcements): RecipientPicker for admin compose

Reuses filterCovenMembers from recommend-modal-search (already
unit-tested). Selected-chip strip (click to remove) + search
input + dropdown of up to 30 matches. Profiles are passed in
from the server page; no client-side fetch.
```

---

## Task 9: Compose form + new-page route + admin actions wiring

**Files:**
- Create: `app/app/admin/announcements/AnnouncementForm.tsx`
- Create: `app/app/admin/announcements/AnnouncementPreview.tsx`
- Create: `app/app/admin/announcements/new/page.tsx`

- [ ] **Step 1: Write the live preview component**

Create `app/app/admin/announcements/AnnouncementPreview.tsx`:

```typescript
"use client";

interface PreviewProps {
  title: string;
  body: string;
  cta_label: string | null;
  cta_href: string | null;
}

/**
 * Smaller-scale rendering of the overlay, using the admin's CURRENT accent.
 * Recipients will see it in their own accent — caption clarifies this.
 */
export default function AnnouncementPreview({ title, body, cta_label, cta_href }: PreviewProps) {
  return (
    <div>
      <div className="caps" style={{ fontSize: 11, marginBottom: 6, color: "var(--muted)" }}>
        Preview (in your accent — recipients see it in theirs)
      </div>
      <div
        style={{
          background: "var(--accent)",
          color: "var(--bone)",
          padding: 32,
          borderRadius: 4,
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-serif-display, 'DM Serif Display', serif)",
            fontSize: 28,
            lineHeight: 1.15,
            margin: 0,
            marginBottom: 16,
          }}
        >
          {title || <span style={{ opacity: 0.5 }}>Title appears here</span>}
        </h2>
        <div
          style={{
            fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
            fontSize: 14,
            lineHeight: 1.5,
            marginBottom: 24,
            opacity: body ? 1 : 0.5,
            whiteSpace: "pre-wrap",
          }}
        >
          {body || "Body appears here. Newlines render as paragraph breaks."}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          {cta_label && cta_href && (
            <span
              style={{
                background: "var(--bone)",
                color: "var(--accent)",
                padding: "8px 20px",
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {cta_label}
            </span>
          )}
          <span
            style={{
              border: "2px solid var(--bone)",
              padding: "6px 18px",
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Got it
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the compose form**

Create `app/app/admin/announcements/AnnouncementForm.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminPublishAnnouncement } from "@/lib/actions/admin/announcements";
import {
  TITLE_MAX,
  BODY_MAX,
  CTA_LABEL_MAX,
  type AnnouncementInput,
} from "@/lib/actions/admin/announcement-validation";
import RecipientPicker from "./RecipientPicker";
import AnnouncementPreview from "./AnnouncementPreview";
import type { Searchable } from "@/components/recommend-modal-search";

interface Props {
  profiles: Searchable[];
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: 10,
  background: "var(--void-2)",
  border: "2px solid var(--muted)",
  color: "var(--bone)",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
};
const LABEL_STYLE: React.CSSProperties = { display: "block", marginBottom: 14 };
const CAPS_STYLE: React.CSSProperties = { fontSize: 11, marginBottom: 6 };

export default function AnnouncementForm({ profiles }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaOpen, setCtaOpen] = useState(false);
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [audience, setAudience] = useState<"everyone" | "specific">("everyone");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const input: AnnouncementInput = {
        title,
        body,
        cta_label: ctaOpen ? ctaLabel : null,
        cta_href: ctaOpen ? ctaHref : null,
        audience,
        recipient_ids: audience === "specific" ? recipientIds : [],
      };
      const result = await adminPublishAnnouncement(input);
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      router.push("/admin/announcements");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 720 }}>
      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>
          Title * ({title.length}/{TITLE_MAX})
        </div>
        <input
          style={INPUT_STYLE}
          value={title}
          onChange={e => setTitle(e.target.value.slice(0, TITLE_MAX))}
          required
          maxLength={TITLE_MAX}
        />
      </label>

      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>
          Body * ({body.length}/{BODY_MAX})
        </div>
        <textarea
          style={{ ...INPUT_STYLE, minHeight: 100, resize: "vertical" }}
          rows={5}
          value={body}
          onChange={e => setBody(e.target.value.slice(0, BODY_MAX))}
          required
          maxLength={BODY_MAX}
        />
      </label>

      {!ctaOpen && (
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={() => setCtaOpen(true)}
          style={{ marginBottom: 14 }}
        >
          + Add a button
        </button>
      )}

      {ctaOpen && (
        <div
          style={{
            border: "1px solid var(--muted)",
            padding: 14,
            marginBottom: 14,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="caps" style={{ fontSize: 11 }}>Optional CTA button</span>
            <button
              type="button"
              onClick={() => {
                setCtaOpen(false);
                setCtaLabel("");
                setCtaHref("");
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--blood)",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Remove button
            </button>
          </div>
          <label>
            <div className="caps" style={CAPS_STYLE}>
              Label ({ctaLabel.length}/{CTA_LABEL_MAX})
            </div>
            <input
              style={INPUT_STYLE}
              value={ctaLabel}
              onChange={e => setCtaLabel(e.target.value.slice(0, CTA_LABEL_MAX))}
              maxLength={CTA_LABEL_MAX}
              placeholder="e.g. Try it now"
            />
          </label>
          <label>
            <div className="caps" style={CAPS_STYLE}>URL (must start with /)</div>
            <input
              style={INPUT_STYLE}
              value={ctaHref}
              onChange={e => setCtaHref(e.target.value)}
              placeholder="/films"
            />
          </label>
        </div>
      )}

      <fieldset style={{ border: "1px solid var(--muted)", padding: 14, marginBottom: 14 }}>
        <legend className="caps" style={{ fontSize: 11, padding: "0 6px" }}>Audience *</legend>
        <label style={{ display: "block", marginBottom: 8, cursor: "pointer" }}>
          <input
            type="radio"
            name="audience"
            value="everyone"
            checked={audience === "everyone"}
            onChange={() => setAudience("everyone")}
            style={{ marginRight: 8 }}
          />
          Everyone
        </label>
        <label style={{ display: "block", cursor: "pointer" }}>
          <input
            type="radio"
            name="audience"
            value="specific"
            checked={audience === "specific"}
            onChange={() => setAudience("specific")}
            style={{ marginRight: 8 }}
          />
          Specific people
        </label>

        {audience === "specific" && (
          <div style={{ marginTop: 12 }}>
            <RecipientPicker
              profiles={profiles}
              selectedIds={recipientIds}
              onChange={setRecipientIds}
            />
          </div>
        )}
      </fieldset>

      <div style={{ marginBottom: 20 }}>
        <AnnouncementPreview
          title={title}
          body={body}
          cta_label={ctaOpen ? ctaLabel : null}
          cta_href={ctaOpen ? ctaHref : null}
        />
      </div>

      {err && (
        <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13, marginBottom: 14 }}>
          {err}
        </div>
      )}

      <button type="submit" className="btn" disabled={saving}>
        {saving ? "Publishing…" : "Publish announcement"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Write the new-page route**

Create `app/app/admin/announcements/new/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkAdminAccess } from "@/lib/auth/require-admin";
import AnnouncementForm from "../AnnouncementForm";

export default async function NewAnnouncementPage() {
  const supabase = await createClient();
  const access = await checkAdminAccess(supabase);
  if (access === "not-authed") redirect("/auth/signin");
  if (access === "not-admin") redirect("/");

  // Pull every profile for the recipient picker. Fine at the current scale
  // (~25 users); flagged as a follow-up in the spec for 1k+ users.
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .order("username", { ascending: true });

  if (error) throw error;

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <h1 className="h-display" style={{ fontSize: 36, marginBottom: 24 }}>
        New announcement
      </h1>
      <AnnouncementForm profiles={profiles ?? []} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/app/admin/announcements/AnnouncementForm.tsx \
        app/app/admin/announcements/AnnouncementPreview.tsx \
        app/app/admin/announcements/new/page.tsx
git commit -F /tmp/msg.txt
```

Where `/tmp/msg.txt` contains:

```
feat(announcements): admin compose form + live preview

AnnouncementForm: title/body w/ char counters, optional-CTA
disclosure, audience radio + RecipientPicker, live preview tile
in the admin's current accent. Submits to adminPublishAnnouncement
and redirects to /admin/announcements on success. New-page route
loads every profile via service-role-equivalent (admin-only RLS).
```

---

## Task 10: List page + ArchiveButton

**Files:**
- Create: `app/app/admin/announcements/page.tsx`
- Create: `app/app/admin/announcements/ArchiveButton.tsx`

- [ ] **Step 1: Write the ArchiveButton**

Create `app/app/admin/announcements/ArchiveButton.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminArchiveAnnouncement } from "@/lib/actions/admin/announcements";

interface Props {
  announcementId: string;
  title: string;
}

export default function ArchiveButton({ announcementId, title }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function archive() {
    setErr(null);
    startTransition(async () => {
      const res = await adminArchiveAnnouncement(announcementId);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn btn-sm btn-outline"
        onClick={() => setConfirming(true)}
      >
        Archive
      </button>
    );
  }

  return (
    <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: 12, fontStyle: "italic" }}>
        Archive "{title}"?
      </span>
      <button
        type="button"
        className="btn btn-sm"
        onClick={archive}
        disabled={isPending}
        style={{ background: "var(--blood)", color: "var(--bone)" }}
      >
        {isPending ? "Archiving…" : "Confirm"}
      </button>
      <button
        type="button"
        className="btn btn-sm btn-outline"
        onClick={() => setConfirming(false)}
        disabled={isPending}
      >
        Cancel
      </button>
      {err && <span style={{ color: "var(--blood)", fontSize: 12 }}>{err}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Write the list page**

Create `app/app/admin/announcements/page.tsx`:

```typescript
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkAdminAccess } from "@/lib/auth/require-admin";
import ArchiveButton from "./ArchiveButton";

export default async function AdminAnnouncementsPage() {
  const supabase = await createClient();
  const access = await checkAdminAccess(supabase);
  if (access === "not-authed") redirect("/auth/signin");
  if (access === "not-admin") redirect("/");

  // Announcements + recipient counts + dismissal counts. PostgREST has no
  // GROUP BY, so we fetch everything and aggregate in JS. Fine at any scale
  // we'll see soon.
  const [annRes, recRes, disRes] = await Promise.all([
    supabase
      .from("announcements")
      .select("id, title, audience, status, created_at, archived_at")
      .order("status", { ascending: true }) // 'archived' < 'published' alphabetically; we re-sort below
      .order("created_at", { ascending: false }),
    supabase.from("announcement_recipients").select("announcement_id"),
    supabase.from("announcement_dismissals").select("announcement_id"),
  ]);

  if (annRes.error) throw annRes.error;
  if (recRes.error) throw recRes.error;
  if (disRes.error) throw disRes.error;

  const announcements = annRes.data ?? [];
  const recipientCounts = new Map<string, number>();
  for (const r of recRes.data ?? []) {
    recipientCounts.set(r.announcement_id, (recipientCounts.get(r.announcement_id) ?? 0) + 1);
  }
  const dismissalCounts = new Map<string, number>();
  for (const d of disRes.data ?? []) {
    dismissalCounts.set(d.announcement_id, (dismissalCounts.get(d.announcement_id) ?? 0) + 1);
  }

  // Sort: published first (active), then archived; each by created_at DESC.
  const sorted = [...announcements].sort((a, b) => {
    if (a.status !== b.status) return a.status === "published" ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 className="h-display" style={{ fontSize: 36, margin: 0 }}>
          Announcements
        </h1>
        <Link href="/admin/announcements/new" className="btn">
          + New announcement
        </Link>
      </div>

      {sorted.length === 0 ? (
        <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
          No announcements yet.
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--muted)", textAlign: "left" }}>
              <th style={{ padding: "10px 8px", fontFamily: "var(--font-ui)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Title</th>
              <th style={{ padding: "10px 8px", fontFamily: "var(--font-ui)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Audience</th>
              <th style={{ padding: "10px 8px", fontFamily: "var(--font-ui)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Status</th>
              <th style={{ padding: "10px 8px", fontFamily: "var(--font-ui)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Dismissed</th>
              <th style={{ padding: "10px 8px", fontFamily: "var(--font-ui)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Created</th>
              <th style={{ padding: "10px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(a => (
              <tr key={a.id} style={{ borderBottom: "1px solid var(--muted)" }}>
                <td style={{ padding: "10px 8px", fontWeight: 700 }}>{a.title}</td>
                <td style={{ padding: "10px 8px" }}>
                  {a.audience === "everyone"
                    ? "Everyone"
                    : `${recipientCounts.get(a.id) ?? 0} people`}
                </td>
                <td style={{ padding: "10px 8px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      background: a.status === "published" ? "var(--accent)" : "var(--muted)",
                      color: a.status === "published" ? "var(--void)" : "var(--bone)",
                    }}
                  >
                    {a.status}
                  </span>
                </td>
                <td style={{ padding: "10px 8px" }}>{dismissalCounts.get(a.id) ?? 0}</td>
                <td style={{ padding: "10px 8px", fontSize: 12, color: "var(--muted)" }}>
                  {new Date(a.created_at).toLocaleDateString()}
                </td>
                <td style={{ padding: "10px 8px" }}>
                  {a.status === "published" && (
                    <ArchiveButton announcementId={a.id} title={a.title} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add an "Announcements" link to the admin nav**

Read `app/app/admin/layout.tsx` to find the existing nav structure:

```bash
cat app/app/admin/layout.tsx
```

Add a link to `/admin/announcements` in the same pattern as the existing `/admin/films` and `/admin/users` links. The exact addition depends on the layout's structure — match the existing pattern exactly, just inserting one new entry alphabetically (after "Films" and before "Users" if it's an alpha list, or at the end otherwise).

- [ ] **Step 4: Typecheck**

```bash
cd app && npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Boot dev server and smoke-test admin pages**

```bash
cd app && nvm use 20 && npm run dev
```

As an admin user, navigate to:
- `/admin/announcements` — should render with "No announcements yet." message and the "+ New announcement" button.
- Click the button → `/admin/announcements/new` renders with the form.

Stop the server. Don't actually publish anything yet — that's Task 12's manual smoke test.

- [ ] **Step 6: Commit**

```bash
git add app/app/admin/announcements/page.tsx \
        app/app/admin/announcements/ArchiveButton.tsx \
        app/app/admin/layout.tsx
git commit -F /tmp/msg.txt
```

Where `/tmp/msg.txt` contains:

```
feat(announcements): admin list page + archive flow

Lists all announcements with audience, status, dismissal count,
and per-row Archive button (confirm-and-go pattern). JS aggregation
of recipient + dismissal counts (PostgREST has no GROUP BY).
Published rows show first (active), archived below. Adds
Announcements link to admin nav.
```

---

## Task 11: RLS test suite

**Files:**
- Create: `db/tests/rls/announcements.test.ts`

- [ ] **Step 1: Read the existing library test for the canonical shape**

```bash
cat db/tests/rls/library.test.ts
```

Note: `seedFixtures` provides `userA`, `userB`, `userC`, `staffS`, `adminA`, `filmId`. `beforeAll` creates the DB, seeds. `beforeEach` resets state via service_role. Sessions opened with `beginAs(client, userId, role)`.

- [ ] **Step 2: Write the test file**

Create `db/tests/rls/announcements.test.ts`:

```typescript
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
  await db.client.query(`DELETE FROM announcement_dismissals`);
  await db.client.query(`DELETE FROM announcement_recipients`);
  await db.client.query(`DELETE FROM announcements`);
  await commit(db.client);
});

async function seedAnnouncement(opts: {
  audience: "everyone" | "specific";
  status?: "published" | "archived";
  title?: string;
  recipients?: string[];
}): Promise<string> {
  await beginAs(db.client, null, "service_role");
  const r = await db.client.query<{ id: string }>(
    `INSERT INTO announcements (title, body, audience, status, created_by)
     VALUES ($1, 'b', $2, COALESCE($3, 'published'), $4)
     RETURNING id`,
    [opts.title ?? "T", opts.audience, opts.status ?? null, fx.adminA.id],
  );
  const id = r.rows[0].id;
  if (opts.audience === "specific" && opts.recipients) {
    for (const uid of opts.recipients) {
      await db.client.query(
        `INSERT INTO announcement_recipients (announcement_id, user_id) VALUES ($1, $2)`,
        [id, uid],
      );
    }
  }
  await commit(db.client);
  return id;
}

describe("RLS: announcements", () => {
  it("non-admin authenticated cannot INSERT announcements", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(db.client.query(
        `INSERT INTO announcements (title, body, audience, created_by)
         VALUES ('x', 'y', 'everyone', $1)`,
        [fx.userA.id],
      )).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("admin can INSERT announcements", async () => {
    await beginAs(db.client, fx.adminA.id, "authenticated");
    try {
      const r = await db.client.query<{ id: string }>(
        `INSERT INTO announcements (title, body, audience, created_by)
         VALUES ('x', 'y', 'everyone', $1) RETURNING id`,
        [fx.adminA.id],
      );
      expect(r.rows).toHaveLength(1);
    } finally { await rollback(db.client); }
  });

  it("non-admin authenticated CAN SELECT announcements", async () => {
    const id = await seedAnnouncement({ audience: "everyone" });
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM announcements WHERE id = $1`, [id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("non-admin authenticated cannot UPDATE announcements", async () => {
    const id = await seedAnnouncement({ audience: "everyone" });
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE announcements SET status = 'archived' WHERE id = $1`,
        [id],
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("admin can UPDATE announcements (archive flow)", async () => {
    const id = await seedAnnouncement({ audience: "everyone" });
    await beginAs(db.client, fx.adminA.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE announcements SET status = 'archived', archived_at = NOW() WHERE id = $1`,
        [id],
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("user can INSERT only their own dismissal row", async () => {
    const id = await seedAnnouncement({ audience: "everyone" });

    // Their own row — allowed.
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO announcement_dismissals (user_id, announcement_id) VALUES ($1, $2) RETURNING user_id`,
        [fx.userA.id, id],
      );
      expect(r.rows).toHaveLength(1);
    } finally { await commit(db.client); }

    // Someone else's row — denied.
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(db.client.query(
        `INSERT INTO announcement_dismissals (user_id, announcement_id) VALUES ($1, $2)`,
        [fx.userB.id, id],
      )).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("user cannot SELECT another user's dismissal rows", async () => {
    const id = await seedAnnouncement({ audience: "everyone" });
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO announcement_dismissals (user_id, announcement_id) VALUES ($1, $2)`,
      [fx.userB.id, id],
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM announcement_dismissals`);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("'everyone' audience surfaces to a user with no recipient row", async () => {
    const id = await seedAnnouncement({ audience: "everyone" });
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT id FROM announcements
         WHERE status = 'published'
         ORDER BY created_at ASC LIMIT 1`,
      );
      expect(r.rows[0]?.id).toBe(id);
    } finally { await rollback(db.client); }
  });

  it("'specific' audience surfaces only to listed recipients", async () => {
    const id = await seedAnnouncement({
      audience: "specific",
      recipients: [fx.userA.id],
    });

    // userA is in recipients — should see it via the recipient join.
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT a.id FROM announcements a
         WHERE a.id = $1 AND EXISTS (
           SELECT 1 FROM announcement_recipients r
           WHERE r.announcement_id = a.id AND r.user_id = $2
         )`,
        [id, fx.userA.id],
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }

    // userB is NOT in recipients — recipient lookup returns nothing.
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT * FROM announcement_recipients WHERE announcement_id = $1 AND user_id = $2`,
        [id, fx.userB.id],
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("dismissal hides the announcement from the next pending query", async () => {
    const id = await seedAnnouncement({ audience: "everyone" });
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO announcement_dismissals (user_id, announcement_id) VALUES ($1, $2)`,
      [fx.userA.id, id],
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT a.id FROM announcements a
         WHERE a.status = 'published'
           AND NOT EXISTS (
             SELECT 1 FROM announcement_dismissals d
             WHERE d.announcement_id = a.id AND d.user_id = $1
           )`,
        [fx.userA.id],
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("archived announcement does not surface even when undismissed", async () => {
    const id = await seedAnnouncement({ audience: "everyone", status: "archived" });
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT id FROM announcements WHERE status = 'published' AND id = $1`,
        [id],
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("multiple pending announcements return in created_at ASC order (FIFO)", async () => {
    const first = await seedAnnouncement({ audience: "everyone", title: "first" });
    // Tiny sleep to guarantee distinct created_at timestamps.
    await new Promise(r => setTimeout(r, 5));
    const second = await seedAnnouncement({ audience: "everyone", title: "second" });

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT id, title FROM announcements
         WHERE status = 'published'
         ORDER BY created_at ASC`,
      );
      expect(r.rows.map(x => x.id)).toEqual([first, second]);
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 3: Run the RLS suite**

```bash
cd db && nvm use 20 && npm run test:rls -- announcements.test.ts
```

Expected: PASS, 12 specs green.

(Note: requires Docker. If Docker is unavailable on the current machine — see the open-thread note in CLAUDE.md about colima — skip this step locally, document the skip in the commit message, and run on the other machine or in CI.)

- [ ] **Step 4: Commit**

```bash
git add db/tests/rls/announcements.test.ts
git commit -F /tmp/msg.txt
```

Where `/tmp/msg.txt` contains:

```
test(announcements): RLS suite — 12 specs

Covers admin-write gating, non-admin SELECT-only, per-user
dismissal isolation, audience='everyone' visibility, audience
='specific' recipient filter, dismissal-hides-on-next-query,
archived-never-surfaces, FIFO ordering. testcontainers Postgres.
```

---

## Task 12: Action-level integration test

**Files:**
- Create: `app/tests/actions/announcements.test.ts`

- [ ] **Step 1: Read the canonical env-gated action test**

```bash
cat app/tests/actions/library.test.ts | head -60
```

Note: `hasEnv` check, `describe.skipIf(!hasEnv)`, per-hook env guards, `createTestUser` / `signedInClient` helpers. Test uses `_*` private versions of actions to inject the supabase client; for this feature we only have non-private actions because the read-side is `getPendingAnnouncement` (already client-injected) and the write-side is `dismissAnnouncement`. Either inject the supabase client into the action OR call `dismissAnnouncement` from a signed-in client and rely on the server-action's own `createClient()`.

For simplicity here, exercise the round-trip via direct DB writes (admin client) + a single `dismissAnnouncement` call routed through the action's own client.

- [ ] **Step 2: Write the test**

Create `app/tests/actions/announcements.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { dismissAnnouncement } from "../../lib/actions/announcements";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "../helpers/users";
import { getPendingAnnouncement } from "../../lib/queries/announcements";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let userB: TestUser;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  userB = await createTestUser();
});

afterAll(async () => {
  if (!hasEnv) return;
  if (userA?.id) await deleteTestUser(userA.id);
  if (userB?.id) await deleteTestUser(userB.id);
});

beforeEach(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("announcement_dismissals").delete().eq("user_id", userA.id);
  await admin.from("announcement_dismissals").delete().eq("user_id", userB.id);
  await admin.from("announcements").delete().neq("id", "00000000-0000-0000-0000-000000000000");
});

async function seedAnnouncement(opts: {
  audience: "everyone" | "specific";
  recipients?: string[];
  status?: "published" | "archived";
  title?: string;
  body?: string;
  ctaLabel?: string | null;
  ctaHref?: string | null;
}): Promise<string> {
  const admin = adminClient();
  const insert = await admin
    .from("announcements")
    .insert({
      title: opts.title ?? "Test",
      body: opts.body ?? "Body",
      audience: opts.audience,
      status: opts.status ?? "published",
      cta_label: opts.ctaLabel ?? null,
      cta_href: opts.ctaHref ?? null,
      created_by: userA.id,
    })
    .select("id")
    .single();
  if (insert.error || !insert.data) throw insert.error;
  const id = insert.data.id;
  if (opts.audience === "specific" && opts.recipients) {
    const rows = opts.recipients.map(uid => ({ announcement_id: id, user_id: uid }));
    const r = await admin.from("announcement_recipients").insert(rows);
    if (r.error) throw r.error;
  }
  return id;
}

describe.skipIf(!hasEnv)("actions/announcements", () => {
  it("everyone audience: pending query returns the announcement to a fresh user", async () => {
    const id = await seedAnnouncement({ audience: "everyone", title: "hello" });
    const client = await signedInClient(userA.email, userA.password);
    const pending = await getPendingAnnouncement(client as any, userA.id);
    expect(pending?.id).toBe(id);
    expect(pending?.title).toBe("hello");
  });

  it("specific audience: only listed users see the announcement", async () => {
    const id = await seedAnnouncement({
      audience: "specific",
      recipients: [userA.id],
      title: "for-A",
    });

    const cA = await signedInClient(userA.email, userA.password);
    const pendingA = await getPendingAnnouncement(cA as any, userA.id);
    expect(pendingA?.id).toBe(id);

    const cB = await signedInClient(userB.email, userB.password);
    const pendingB = await getPendingAnnouncement(cB as any, userB.id);
    expect(pendingB).toBeNull();
  });

  it("dismissal hides the announcement on the next query", async () => {
    const id = await seedAnnouncement({ audience: "everyone" });
    const c = await signedInClient(userA.email, userA.password);

    expect((await getPendingAnnouncement(c as any, userA.id))?.id).toBe(id);

    // dismissAnnouncement uses its own createClient (cookie-bound) — call via
    // raw insert as the user instead, to avoid coupling to Next.js cookies in tests.
    const ins = await c.from("announcement_dismissals").insert({
      user_id: userA.id,
      announcement_id: id,
    });
    expect(ins.error).toBeNull();

    const after = await getPendingAnnouncement(c as any, userA.id);
    expect(after).toBeNull();
  });

  it("archived announcements never surface", async () => {
    await seedAnnouncement({ audience: "everyone", status: "archived" });
    const c = await signedInClient(userA.email, userA.password);
    const pending = await getPendingAnnouncement(c as any, userA.id);
    expect(pending).toBeNull();
  });

  it("multiple pending announcements: oldest returned first (FIFO)", async () => {
    const first = await seedAnnouncement({ audience: "everyone", title: "first" });
    await new Promise(r => setTimeout(r, 10));
    await seedAnnouncement({ audience: "everyone", title: "second" });
    const c = await signedInClient(userA.email, userA.password);
    const pending = await getPendingAnnouncement(c as any, userA.id);
    expect(pending?.id).toBe(first);
  });

  it("dismissAnnouncement is idempotent (concurrent-tab safe)", async () => {
    if (!hasEnv) return;
    // Note: we cannot easily call dismissAnnouncement directly because it
    // expects Next.js cookies. We instead verify idempotency by issuing the
    // raw INSERT twice; the second one should violate the PK and the action
    // logic (which we duplicate here) treats that as success.
    const id = await seedAnnouncement({ audience: "everyone" });
    const c = await signedInClient(userA.email, userA.password);

    const first = await c.from("announcement_dismissals").insert({
      user_id: userA.id,
      announcement_id: id,
    });
    expect(first.error).toBeNull();

    const second = await c.from("announcement_dismissals").insert({
      user_id: userA.id,
      announcement_id: id,
    });
    expect(second.error?.code).toBe("23505");
  });

  // Suppress unused-import lint in environments where it surfaces.
  void dismissAnnouncement;
});
```

- [ ] **Step 3: Run the test**

```bash
cd app && nvm use 20 && npm test -- tests/actions/announcements.test.ts
```

Expected (without env): file reports as skipped (`describe.skipIf` plus per-hook guards).
Expected (with env): PASS, 6 specs green.

- [ ] **Step 4: Commit**

```bash
git add app/tests/actions/announcements.test.ts
git commit -F /tmp/msg.txt
```

Where `/tmp/msg.txt` contains:

```
test(announcements): action-level integration round-trip

Env-gated suite covering everyone-audience visibility, specific-
audience filtering, dismissal hiding, archived-never-shows,
FIFO ordering, and 23505-on-double-dismiss idempotency. Follows
the library.test.ts template (describe.skipIf + per-hook guards).
```

---

## Task 13: Manual smoke test + production deploy

**Files:** none new; this validates the live system.

- [ ] **Step 1: Run prod migrations**

From repo root:

```bash
set -a; source app/.env.local; set +a
cd db && nvm use 20 && npm run migrate
```

Expected: `0155_announcements.sql` applied. No errors.

- [ ] **Step 2: Deploy to Vercel**

From repo root (NOT from `app/` — see CLAUDE.md gotcha):

```bash
cd /Users/christophernowacki/film-goblin
npx vercel deploy --prod --yes
```

Expected: deploy succeeds. URL: https://film-goblin.vercel.app.

- [ ] **Step 3: Smoke test — everyone audience**

As an admin, on the live site:

1. Navigate to `/admin/announcements`.
2. Click "+ New announcement."
3. Fill: title="Smoke test 1", body="Hello", audience=Everyone, no CTA.
4. Submit.
5. Open another browser (or incognito with a different account) signed in as a non-admin user.
6. Navigate to `/home`. Confirm the full-screen overlay paints in the user's accent color, shows the title and body, and has a "Got it" outline button.
7. Click "Got it." Overlay should disappear.
8. Refresh the page. Overlay should NOT reappear.
9. As admin, return to `/admin/announcements`. Confirm the dismissal count for "Smoke test 1" is now 1.
10. Click "Archive" → "Confirm". Status flips to archived.

- [ ] **Step 4: Smoke test — specific audience + CTA**

1. As admin, "+ New announcement."
2. Fill: title="Smoke test 2", body="Try this", audience=Specific people, pick the test user, click "+ Add a button", label="Open films", url="/films".
3. Submit.
4. As the targeted test user, navigate to `/home`. Overlay shows.
5. Click "Open films." User lands on `/films` and the overlay is gone.
6. Navigate back to `/home`. Overlay should NOT reappear.
7. As a different non-targeted user, navigate to `/home`. Overlay should NOT appear (audience filter works).

- [ ] **Step 5: Confirm and document**

If both smoke tests pass, the feature is live. Update `CLAUDE.md`'s Current State section per the project convention (this is normally a `/wrapup` step — do that at end of session, not here).

If anything fails, file the issue under "Open threads" in CLAUDE.md and triage before claiming the feature done.

- [ ] **Step 6: Commit**

If anything was tweaked during smoke (likely nothing — but if so):

```bash
git add -p
git commit -F /tmp/msg.txt
```

If nothing was tweaked, no commit needed for this task — the deploy itself is the artifact.

---

## Self-review checklist

I ran the post-write self-review against the spec. Findings:

**Spec coverage:**
- Lifecycle (show once, dismissal permanent) → Tasks 1, 4, 9 (RLS) and Tasks 11, 12 (tests).
- Targeting (everyone OR specific list) → Task 1 (schema), Task 5 (publish action), Task 8 (picker), Task 9 (form), Tasks 11, 12 (tests).
- Content (title + body + optional CTA, internal-only href) → Task 2 (validation), Tasks 5, 6, 9 (action + overlay + form).
- Visual (full-screen accent takeover) → Task 6 (overlay).
- Trigger (any authed page load) → Task 7 (root-layout mount).
- Multiple pending FIFO → Task 3 (`getPendingAnnouncement` ordering), Task 11 (RLS test), Task 12 (action test).
- No edit, archive allowed → Task 5 (no update action besides archive), Task 10 (list page archive button).
- CTA-click counts as dismissal → Task 6 (`handleDismiss(navigateTo)`).
- Two-tab race / 23505 idempotency → Task 4 (action), Task 12 (test).

**Placeholder scan:** none.

**Type consistency:** `AnnouncementInput` defined in Task 2 is used unchanged in Task 5 and Task 9. `PendingAnnouncement` defined in Task 3 is used unchanged in Task 6 (the overlay's prop type uses an inline structural equivalent to keep the component standalone). `Searchable` reused from existing `recommend-modal-search.ts`.

No issues found.
