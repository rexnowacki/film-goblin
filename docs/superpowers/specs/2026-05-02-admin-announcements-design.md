# Admin Announcements — Design

**Date:** 2026-05-02
**Status:** Approved (pending user review of written spec)
**Sub-project:** #38 (next in sequence)

## Problem

There is currently no way for an admin to broadcast a one-shot message to all users (or a specific subset). Without this, every "I want to tell users about X" event becomes either an out-of-band channel (text message, email, nothing) or a code change. We want a lightweight in-product surface for admin-authored, one-time announcements that users see on their next visit.

## Scope

In:

- An admin can author a published announcement with title, body, optional CTA button, and audience (everyone or a specific list of users).
- On the next authenticated page load after publish, eligible users see a full-screen overlay containing the announcement.
- The user dismisses the overlay (either via "Got it" or by clicking the CTA, which both dismisses and navigates). The announcement never appears for that user again.
- An admin can archive a published announcement to stop it from surfacing to anyone who has not yet seen it.

Out:

- Editing a published announcement (immutable by design).
- Drafts / scheduled publish (publish-on-submit only).
- Per-announcement detail or stats page in v1 (inline stats column on the list page).
- Markdown / rich text in the body (plain text, newlines as paragraph breaks).
- External (off-site) CTA URLs (must start with `/`).
- Per-user notification opt-out (announcements are rare and admin-curated).
- Email / push delivery — overlay only.
- Stacking / pagination of multiple pending announcements (sequential FIFO instead).

## Decisions

1. **Lifecycle: show once.** Each user sees a given announcement exactly once. Dismissal records a permanent row in `announcement_dismissals`. There is no second chance, no auto-resurface, no expiry. If the user needs to see it again, the admin creates a new announcement.
2. **Targeting: everyone OR specific list.** Two modes. "Everyone" is the cheap default — no recipient rows. "Specific" is a multi-select chip picker writing rows into `announcement_recipients`.
3. **Content: title + body + optional CTA.** Body is plain text. CTA is a `(label, href)` pair, both required if either is set. `href` must be an internal path.
4. **Visual: full-screen accent takeover.** Overlay fills the viewport, painted in the user's currently-selected accent ink. Bone-on-accent type. Reuses existing zine typography (Rubik Wet Paint, DM Serif Display, IBM Plex Sans).
5. **Trigger: any authenticated page load.** Root layout queries for the oldest pending announcement on every authed request. No coupling to the auth callback.
6. **Multiple pending: sequential FIFO.** Show oldest first; after dismiss, the next render of the layout surfaces the next.
7. **Authoring is publish-only, no edit.** The list page allows archive but not edit. Immutability sidesteps the "users who already saw v1 won't see v2" trap inherent in the show-once model.
8. **CTA-click counts as dismissal.** A user who acts on the CTA does not see the overlay again on the linked page.

## Data model

New migration `db/migrations/0155_announcements.sql`.

```sql
-- 0155_announcements.sql

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
-- Empty when audience='everyone'. Populated when audience='specific'.

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

-- announcements: anyone authenticated can read; only admins write.
CREATE POLICY announcements_select_authenticated ON announcements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY announcements_admin_insert ON announcements
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY announcements_admin_update ON announcements
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- announcement_recipients: anyone authenticated can read (needed for the
-- pending-for-user query); only admins write.
CREATE POLICY ar_select_authenticated ON announcement_recipients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ar_admin_insert ON announcement_recipients
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- announcement_dismissals: each user reads/writes only their own rows.
CREATE POLICY ad_self_select ON announcement_dismissals
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY ad_self_insert ON announcement_dismissals
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
```

After migrate, `npm run gen:types` (or hand-edit `app/lib/supabase/types.ts` per the project convention).

### Pending-for-user query

Run from the root layout, on every authed request. Composite-PK index hits make this cheap.

```sql
SELECT a.*
FROM announcements a
WHERE a.status = 'published'
  AND NOT EXISTS (
    SELECT 1 FROM announcement_dismissals d
    WHERE d.announcement_id = a.id AND d.user_id = $me
  )
  AND (
    a.audience = 'everyone'
    OR EXISTS (
      SELECT 1 FROM announcement_recipients r
      WHERE r.announcement_id = a.id AND r.user_id = $me
    )
  )
ORDER BY a.created_at ASC
LIMIT 1;
```

Lives in `app/lib/queries/announcements.ts` as `getPendingAnnouncement(supabase, userId): Promise<Announcement | null>`.

## Components

### Read path (user-facing)

- `app/lib/queries/announcements.ts` — `getPendingAnnouncement` only.
- `app/lib/actions/announcements.ts` — `dismissAnnouncement(announcementId)` server action. Inserts into `announcement_dismissals`; treats Postgres error code `23505` (unique violation) as success. Calls `revalidatePath("/", "layout")` on success.
- `app/components/AnnouncementOverlay.tsx` — client component. Receives `Announcement` as a prop. Renders the full-screen overlay. Handles "Got it" and CTA click. Both dismiss; CTA click also `router.push(cta_href)`.
- Root layout (`app/app/layout.tsx`) — calls `getServerUser()`; if non-null, calls `getPendingAnnouncement(supabase, user.id)` and conditionally renders `<AnnouncementOverlay />` as a sibling of `{children}`. Anonymous users skip the call. The project does not have a separate authed-shell layout; TopNav is mounted per-route, so the root layout is the only single place to mount the overlay above all surfaces.

### Authoring (admin)

Routes live under `app/app/admin/announcements/`:

- `app/app/admin/announcements/page.tsx` — server component, list of all announcements with audience / status / dismissal stats columns, "+ New announcement" header link, per-row "Archive" button on published rows.
- `app/app/admin/announcements/new/page.tsx` — wraps `AnnouncementForm`.
- `app/app/admin/announcements/AnnouncementForm.tsx` — client component, mirrors `FilmForm`'s shape. Title, body, optional-CTA disclosure, audience radio, recipient chip picker (when audience='specific'), live preview, submit.
- `app/app/admin/announcements/RecipientPicker.tsx` — client component. Search input + selected-chip strip + filtered list. Reuses the `filterCovenMembers` pattern from `RecommendModal` but unscoped to all profiles.
- `app/app/admin/announcements/AnnouncementPreview.tsx` — client component. Mini-rendering of the overlay using current admin's accent. Updates as form state changes.

### Server actions

`app/lib/actions/admin/announcements.ts`:

- `adminPublishAnnouncement(fields): Promise<{ ok: true; announcementId: string } | { ok: false; error: string }>`
- `adminArchiveAnnouncement(id): Promise<{ ok: true } | { ok: false; error: string }>`

Both gated by `requireAdmin`. Publish wraps the `announcements` insert and the optional `announcement_recipients` batch in a single Supabase RPC for atomicity. Both call `revalidatePath("/admin/announcements")` and `revalidatePath("/", "layout")` on success.

`app/lib/actions/announcements.ts`:

- `dismissAnnouncement(announcementId): Promise<{ ok: true } | { ok: false; error: string }>` — not admin-gated. Inserts `(auth.uid(), announcementId)` into `announcement_dismissals`. PK violation → success. Revalidates root layout.

## Visual specification

The overlay is a fixed-position full-viewport surface, `100dvh × 100vw`, `z-index: 100` (above TopNav at ~50).

- Background: `var(--accent)` — picks up the user's current accent color via the existing `[data-accent]` attribute on `<html>`.
- Foreground colors: bone (`#F3ECD8`) for type, void (`#0A0A0A`) for the CTA fill if present.
- Centered content column, max-width 560px, vertical center via flex.
- Title in DM Serif Display, ~48px desktop, ~36px mobile.
- Body in IBM Plex Sans, 18px desktop / 16px mobile, line-height 1.5, max-width 520px, paragraph breaks rendered from `\n\n` (and single `\n` rendered as `<br>` within paragraphs).
- Optional CTA button — bone background, accent text, IBM Plex Sans uppercase tracking, ~12px padding × 24px. Sits below the body.
- "Got it" outline button — transparent background, bone border + bone text, sits below the CTA (or as the only action if no CTA).
- iOS: inner content wrapper padded with `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
- Entrance animation: 200ms fade + 8px upward slide. No further motion.
- Long body content: inner content column scrolls vertically; the accent background never scrolls.

## Data flow

### Publish flow

1. Admin opens `/admin/announcements/new`, fills the form.
2. Submit → `adminPublishAnnouncement(fields)`.
3. Server: validate (title non-empty, body non-empty, CTA pair complete or both null, `cta_href` matches internal path regex, audience='specific' has ≥ 1 recipient).
4. Server: RPC inserts the `announcements` row, then batch-inserts the `announcement_recipients` rows (when applicable). Atomic.
5. Server: `revalidatePath("/admin/announcements")` + `revalidatePath("/", "layout")`.
6. Client: navigate to `/admin/announcements`.

### Surface flow (per user, per page load)

1. Authed page load → root layout calls `getPendingAnnouncement(supabase, userId)`.
2. If null → render layout normally, no overlay.
3. If non-null → render `<AnnouncementOverlay announcement={pending} />` on top of the layout.

### Dismissal flow

1. User clicks "Got it" (or CTA).
2. Client: optimistic state hides the overlay locally, the action is dispatched in the background.
3. Server: `dismissAnnouncement(id)` → INSERT into `announcement_dismissals` → `revalidatePath("/", "layout")`.
4. If CTA: `router.push(cta_href)` after the dismiss succeeds (or in parallel — order does not matter because the next layout render will not surface this announcement either way).

### Archive flow

1. Admin clicks "Archive" on a row → confirm modal → `adminArchiveAnnouncement(id)`.
2. Server: `requireAdmin` + `UPDATE announcements SET status='archived', archived_at=NOW() WHERE id=$1` + revalidations.
3. Already-undismissed users will not surface the announcement on their next page load. Already-dismissed users are unaffected (and would not see it anyway).

## Validation rules

Client and server (server is authoritative):

- `title` — required, trimmed non-empty, ≤ 80 chars.
- `body` — required, trimmed non-empty, ≤ 500 chars.
- `cta_label` and `cta_href` — both null or both set. If set: `cta_label` ≤ 24 chars; `cta_href` matches `/^\/[A-Za-z0-9/_\-.?=&%]*$/`.
- `audience` — `'everyone'` or `'specific'`.
- `recipients` — when `audience='specific'`, ≥ 1 user_id. All user_ids must exist in `profiles`. Duplicates deduped server-side.

## Error handling

- Server actions return tagged unions (`{ ok: true, … } | { ok: false, error: string }`), matching the `adminCreateFilm` pattern.
- `dismissAnnouncement` treats Postgres unique-violation (code `23505`) as success — handles concurrent dismissals from multiple tabs.
- `adminPublishAnnouncement`'s RPC is atomic. If the recipient batch fails (e.g., a user_id was deleted between picker render and submit), the whole publish rolls back and surfaces the error inline on the form.
- Layout `getPendingAnnouncement` failure (DB blip) is caught at the layout level and rendered as no-overlay. Logged server-side. Page render is never blocked on the announcement query.
- CTA URL validation runs both client-side (immediate red text on the input) and server-side (rejection on submit).

## Testing strategy

Pure helpers (validation, URL regex, FIFO ordering of multiple pending) get unit tests in the action files. Vitest, no Supabase.

DB-side tests live in `db/tests/rls/announcements.test.ts`, following `library.test.ts` template:

- `userA`, `userB`, `adminUser` fixtures.
- Non-admin cannot INSERT or UPDATE `announcements`; can SELECT.
- Non-admin can INSERT only their own row in `announcement_dismissals`; cannot SELECT other users' rows.
- "Everyone" audience surfaces to a user with no recipient row.
- "Specific" audience surfaces only to listed users; non-listed user sees nothing.
- Dismissal hides the announcement from the next pending query.
- Archived announcement never surfaces to undismissed users.
- Multiple pending announcements return in `created_at ASC` order (FIFO).

Action-level integration in `app/tests/actions/announcements.test.ts`, env-gated with `describe.skipIf(!hasEnv)`. Round-trip: publish → query as recipient → dismiss → query as recipient (empty) → archive → publish another → query.

No e2e/Playwright (project does not use it). Manual smoke pass after deploy: publish one to self, see overlay, click CTA, land on linked page, refresh — overlay does not reappear.

## Out-of-scope follow-ups

These are deliberate gaps in v1. Open future tickets if they come up:

- Per-announcement recipient stats page (who has dismissed, who has not).
- Announcement-history "vault" page where users can re-read dismissed announcements.
- Email mirror of the overlay for users who do not log in often.
- Notification opt-out (`profiles.notify_announcements`).
- Markdown / rich text body.
- External CTA URLs.
- Stacking / pagination UI for many-pending case.
- Scheduled publish ("send tomorrow at 9 AM").
- Editing a published announcement.

## Open risks

- **Layout query cost.** One additional query per authed page load. Should be sub-millisecond on indexed lookups, but if the user count grows to 100k+ and many announcements are simultaneously live, the `NOT EXISTS` against `announcement_dismissals` could need an index review. Not a launch blocker.
- **CTA-click-counts-as-dismissal trap.** A user who taps the CTA accidentally and back-buttons immediately has lost the announcement. Acceptable trade-off for the cleaner mental model; the announcement archive (out of scope) would mitigate.
- **Two-tab race.** Both tabs render the overlay at once. First dismiss wins; the second tab still shows the overlay until the next nav, where it disappears. Confusing for ~1 second. Acceptable.
- **Recipient picker scale.** Building a chip picker over all profiles is fine at the current ~25 user scale. At 1k+ users the search input becomes essential; at 10k+ we would want server-side search. Not a launch blocker.
