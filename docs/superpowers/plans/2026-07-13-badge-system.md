# Achievement Badges Implementation Plan

**Goal:** Ship admin-authored, automatically awarded profile badges with seeded watch milestones, same-director recognition, and SVG/PNG artwork upload.

**Architecture:** Add public-readable badge definitions and immutable member awards, a locked database evaluator invoked by watched/definition/director triggers, a service-role-only admin image route and creation actions, and render awards in the profile's existing Relics section.

**Tech Stack:** PostgreSQL/Supabase RLS and Storage, Next.js 15 App Router, TypeScript, Vitest, testcontainers, zine-CSS.

**Spec:** `docs/superpowers/specs/2026-07-13-badge-system-design.md`

## Global constraints

- Branch: `codex/badge-system` from current `origin/master`.
- Reserved migrations: `0222_badges.sql`, `0223_badge_award_engine.sql`, `0224_badge_images_bucket.sql`.
- Count watch-log milestones as event rows; count director achievements as distinct film IDs.
- Never accept admin-authored SQL or raw JSON conditions.
- Every service-role use follows a fresh `requireAdmin`/`requireAdminUser` check.
- Public queries use explicit columns and cannot read award evidence.
- Do not run `npm run gen:types` blindly; preserve and extend the hand-edit warning block.
- Use one `720px` CSS breakpoint and no Tailwind.
- Rollout is migrations first, app second.

### Task 1: Lock badge semantics with regression tests

**Files:**
- Create: `app/tests/badges/definition.test.ts`
- Create: `app/tests/badges/image.test.ts`
- Create: `db/tests/rls/badges.test.ts`

- [x] Write pure tests for supported condition kinds, thresholds, slugs, copy limits, image URL origin, SVG/PNG metadata, signatures, and dangerous SVG rejection.
- [x] Write real-Postgres tests for awards, backfill, RLS/grants, distinct-director behavior, metadata correction, idempotency, concurrency, and cascade deletion.
- [x] Run focused tests and confirm the new tests fail because the implementation does not exist.

### Task 2: Add badge schema and seeded artwork

**Files:**
- Create: `db/migrations/0222_badges.sql`
- Create: `app/public/badges/fresh-blood.svg`
- Create: `app/public/badges/deep-cut.svg`
- Create: `app/public/badges/midnight-glutton.svg`
- Create: `app/public/badges/century-beast.svg`
- Create: `app/public/badges/auteurs-familiar.svg`
- Modify: `app/lib/supabase/types.ts`

- [x] Add enum, definition/award tables, checks/indexes, RLS, narrow grants, and the five seed rows.
- [x] Add five static, script-free square SVG assets.
- [x] Hand-add types for both tables and the enum, preserving the warning block.
- [x] Run DB smoke/typecheck and app typecheck far enough to catch schema-type mistakes.

### Task 3: Implement the locked award engine

**Files:**
- Create: `db/migrations/0223_badge_award_engine.sql`
- Modify: `db/tests/helpers/testcontainers.ts`
- Modify: `app/lib/supabase/types.ts`

- [x] Implement user/all-user evaluator functions with a transaction-wide global award lock, normalized directors, evidence snapshots, and `ON CONFLICT DO NOTHING`.
- [x] Add watched, badge-definition, and film-director triggers plus the initial backfill.
- [x] Revoke client RPC execution and reapply narrow table grants after the test harness's broad bootstrap grants.
- [x] Run the focused real-Postgres suite, including the two-client concurrent boundary test.

### Task 4: Add validated admin artwork upload

**Files:**
- Create: `db/migrations/0224_badge_images_bucket.sql`
- Modify: `db/tests/helpers/testcontainers.ts`
- Create: `app/lib/badges/image.ts`
- Create: `app/app/api/admin/badges/image/route.ts`
- Create: `app/tests/routes/admin-badge-image.test.ts`

- [x] Create the public bucket with SVG/PNG MIME and size restrictions; skip only this migration in bare-Postgres harnesses.
- [x] Implement pure metadata/content validation, including PNG magic bytes and restrictive SVG checks.
- [x] Implement admin-gated POST upload through service role with immutable object names; never auto-delete after an ambiguous definition action.
- [x] Run image and route tests.

### Task 5: Add admin definition creation and backfill controls

**Files:**
- Create: `app/lib/badges/definition.ts`
- Create: `app/lib/actions/admin/badges.ts`
- Create: `app/lib/queries/admin/badges.ts`
- Create: `app/app/admin/badges/BadgeManager.tsx`
- Create: `app/app/admin/badges/page.tsx`
- Modify: `app/app/admin/page.tsx`
- Modify: `app/app/styles/310-admin.css`

- [x] Implement shared typed condition registry, condition descriptions, slug helper, and validation.
- [x] Implement admin create and re-evaluate actions using require-admin then service role.
- [x] Implement definition ledger, exact award counts, image upload/preview, and creation form.
- [x] Add the control-crypt tile and responsive admin styles.
- [x] Add focused action/query/source-contract coverage and run it.

### Task 6: Render earned badges in profile Relics

**Files:**
- Create: `app/lib/queries/badges.ts`
- Create: `app/components/profile/ProfileRelics.tsx`
- Modify: `app/app/p/[username]/page.tsx`
- Modify: `app/app/styles/260-profile.css`
- Create: `app/tests/queries/badges.test.ts`
- Modify/Create: profile UI source contract tests

- [x] Fetch active earned definitions in the profile page's existing parallel query wave.
- [x] Preserve the zero-award empty state and render a responsive award grid otherwise.
- [x] Keep evidence, progress, and director context out of public markup and query columns.
- [x] Run focused query/UI tests and app typecheck.

### Task 7: Whole-branch validation and documentation

**Files:**
- Modify: `docs/sub-project-history.md`
- Modify: root `AGENTS.md` Current state at session close

- [x] Run app focused tests, full tests, typecheck, and production build.
- [x] Run DB migration smoke, typecheck, focused badge real-Postgres tests, and full RLS/trigger suite.
- [ ] Render `/admin/badges` and public profiles at desktop and 390px; verify zero overflow and SVG/PNG fit.
- [x] Review the full branch for auth paths, RLS/grants, concurrency, public privacy, and migration/app compatibility.
- [x] Record the sub-project and exact validation evidence in docs.
- [ ] Re-fetch/rebase if `origin/master` moved, push, open a PR with the review trail, and wait for all CI gates.
