# Return Rituals Polish Implementation Plan

**Goal:** Complete daily queue browsing, make Gazings reliably findable, and enforce cancelled-gazing removal from active surfaces.

**Architecture:** App-only progress and collection UI plus mig 0220 for status-aware attendee mutations. Existing RLS remains the visibility source; cancelled history remains stored.

**Spec:** `docs/superpowers/specs/2026-07-11-return-rituals-polish-design.md`

## Global constraints

- Branch: `codex/return-rituals-polish`.
- Use the existing 720px zine-CSS breakpoint.
- Query helpers take an injected client; action revalidation stays in public wrappers.
- Do not hard-delete gazing/activity history.
- Rollout: mig 0220 first, then app deploy.

### Task 1: Daily queue completion

**Files:** `app/lib/return-contract/progress.ts`, `app/components/return-contract/NextInThePit.tsx`, `app/app/home/page.tsx`, `app/tests/return-contract/progress.test.ts`.

- [x] Write failing pure tests for daily/user-scoped progress and exhaustion.
- [x] Implement injected-storage progress helpers.
- [x] Pass a captured UTC day and viewer ID into the component.
- [x] Mark on card departure/CTA and collapse instead of wrapping after completion.
- [x] Run focused return-contract tests.

### Task 2: Gazings index and access

**Files:** `app/lib/queries/gazings.ts`, `app/app/coven/gazings/page.tsx`, `app/components/gazings/GazingList.tsx` if useful, `app/components/UserMenu.tsx`, `app/components/coven/SocialPromise.tsx`, `app/app/styles/270-gazings.css`, `app/app/globals.css`, tests under `app/tests/queries/`.

- [x] Write failing partition/query tests, including cancelled exclusion.
- [x] Implement RLS-bound query and section organization.
- [x] Build the authenticated collection page and responsive cards.
- [x] Add account-menu and Coven-page entry points.
- [x] Run focused query tests and typecheck.

### Task 3: Cancellation invariant

**Files:** `app/lib/queries/gazing-roster.ts`, `app/lib/queries/activity.ts`, `app/lib/queries/notifications.ts`, `app/lib/actions/gazing.ts`, `app/components/gazing/GazingCloseActions.tsx`, `app/app/gazing/[token]/page.tsx`, `db/migrations/0220_gazing_cancelled_rsvp_guard.sql`, app and DB gazing tests.

- [x] Write failing action/feed/notification/RLS regressions.
- [x] Hydrate live status and omit cancelled/missing activity and reminder rows.
- [x] Hide and reject RSVP for non-scheduled gazings.
- [x] Preserve private bearer-link RSVP through an authenticated invitee claim.
- [x] Make terminal close and attendee mutations cancellation-race-safe.
- [x] Redirect cancellation to the index and revalidate the index from mutations.
- [x] Add mig 0220 and prove the policy with testcontainers.

### Task 4: Whole-branch verification and ship

- [x] Run focused tests, full app tests, app typecheck/build.
- [x] Run DB smoke/typecheck and real-Postgres RLS tests.
- [x] Perform whole-branch adversarial review and address findings.
- [x] Update root current state/open threads and append the history row.
- [x] Open PR, wait for all CI jobs, squash-merge.
- [x] Apply mig 0220 to production, deploy current master from repo root, and smoke public/authenticated surfaces as available.
