# Return Rituals Implementation Plan

> Implement this plan sequentially. Each task has its own test/review gate. Do not begin a
> later phase until the preceding phase is deployed, smoked, and has met its stated evidence
> gate or the owner explicitly records an override.

**Goal:** Make Film Goblin's social and film actions create truthful, measurable reasons to
return: find a kindred user, answer or complete a watch, and continue naturally after a
successful action.

**Architecture:** Four independently shippable phases share a small first-party event stream.
Phase 1 adds RPC-only product events and a read-only diagnostics report. Phase 2 adds a pure
return-contract resolver, owner-scoped deferrals, and visible social-promise surfaces. Phase 3
adds taste-twin suggestions using the existing affinity vectors and coven action. Phase 4
extends the existing gazing model to home watch nights, individual invitees, reminders,
completion, self-confirmed attendance, aftermath, and bounded continuation prompts.

**Tech stack:** Next.js 15 App Router, React client/server components, TypeScript, Supabase
Postgres/RLS/RPC, Vitest, testcontainers, existing Web Push fanout, existing maintenance cron,
zine-CSS at the single 720px breakpoint.

**Spec:** `docs/superpowers/specs/2026-07-10-return-rituals-design.md`

## Global constraints

- Use four branches and four PRs, in order:
  1. `feature/return-instrumentation`
  2. `feature/return-contract`
  3. `feature/taste-twins`
  4. `feature/gazing-loop`
- Before each branch: `git fetch origin`, switch to `master`, and fast-forward with
  `git merge --ff-only origin/master`. Before each push, fetch again and rebase if master
  moved.
- The current worktree already contains migrations `0213` and `0214`. Tentative allocations
  for this plan are `0215`–`0219`; re-run `ls db/migrations | tail -12` immediately before
  creating each migration. If another branch has claimed a number, renumber this plan's
  remaining migrations and update every reference in the same commit.
- Canonical migrations live only under `db/migrations/`; never add them to
  `worker/migrations/`.
- Every user-owned table is RLS-first. `db/npm test` is only a parse smoke; RLS, grants,
  triggers, and RPC privileges require `db/npm run test:rls` or the equivalent green CI job.
- User-facing actions follow the `_private(client, …)` / public-wrapper split.
  `revalidatePath` stays in public wrappers.
- Read helpers take a Supabase client as their first argument; never construct clients inside
  `app/lib/queries/`.
- `serviceRoleClient()` is server-only. It must not be used to bypass ordinary user ownership.
  Cron jobs and aggregate diagnostics are the only new service-role reads in this plan.
- All `profiles` reads use explicit columns. Coven edges are checked in both canonical
  directions.
- Do not call `npm run gen:types` casually. Read the warning block in
  `app/lib/supabase/types.ts`, regenerate only after the relevant migration exists in the
  schema used by the generator, and reapply every documented hand edit. If the remote schema
  is not yet migrated, hand-edit the narrow new table/function types and document them in the
  warning block.
- UI uses existing CSS tokens/utilities and the single 720px breakpoint. No Tailwind, second
  responsive system, `100vh` full-screen wrapper, or re-enabled Link prefetch.
- Product copy may use the restrained goblin register, but actions and times must remain
  literal. Storefront copy says “Apple TV.” Admin, diagnostics, logs, and errors use plain
  language.
- No component test harness exists. Extract component decisions into pure modules and test
  those; verify rendered behavior manually in a signed-in browser.
- Instrumentation is attribution only. Durable tables remain the source of truth and an event
  write may never cause the domain action to fail.
- No raw analytics property may contain usernames, notes, comments, search strings,
  notification bodies, external URLs, or arbitrary component state.
- Each phase gets a whole-branch review after its task-level gates and before its PR.
- Multi-line commit messages must use `git commit -F <message-file>`; never use a heredoc
  inside command substitution.

## Migration map and rollout summary

| Migration | Phase | Purpose | Default rollout |
|---|---|---|---|
| `0215_product_events.sql` | 1 | Product event table, validation RPC, grants/RLS | Migration first, then app |
| `0216_return_contract_deferrals.sql` | 2 | Owner-scoped deferrals | Migration first, then app |
| `0217_taste_twin_suppressions.sql` | 3 | Owner-scoped 90-day suggestion suppression | Migration first, then app |
| `0218_gazing_loop_notification_kinds.sql` | 4 | Enum values used by reminder/aftermath inserts | Migration first, committed separately |
| `0219_gazing_loop.sql` | 4 | Gazing columns, invitees, attendance, policies/indexes | Apply after 0218, before app |

Every change is additive for the old app. New application code reads the new relations
immediately, while old application code ignores them; therefore each phase is migration-first.
For Phase 4, relaxing `theater_name`/`tickets_url` `NOT NULL` does not break existing inserts,
and defaults keep old theatrical rows valid. Re-derive this matrix during whole-branch review
instead of copying the conclusion blindly.

---

## Phase 1 — Behavioral instrumentation

**Implementation note (2026-07-10):** Product events use a client-generated `event_id` as the
table primary key. `record_product_events` inserts with `ON CONFLICT DO NOTHING`, closing the
ambiguous-response retry race that the original server-generated-ID sketch left open.

**Phase 1 implementation status (2026-07-10, commit `68a4cf3`):** Tasks 1–4 code is complete.
Verified: 27 focused app tests, 619 full app tests (113 existing env-gated skips), app typecheck,
production build, DB migration smoke/typecheck, and 6/6 focused real-Postgres RLS/RPC tests.
The full local RLS command exhausts the container runtime when Vitest launches all 35 suites
concurrently; full CI RLS remains required before merge. Migration apply, deploy, production
smoke, baseline capture, and the seven-day Phase 2 gate remain open.

### Task 1: Define the event contract and pure validation layer

**Files:**

- Create: `app/lib/product-events/registry.ts`
- Create: `app/lib/product-events/session.ts`
- Create: `app/tests/product-events/registry.test.ts`
- Create: `app/tests/product-events/session.test.ts`

**Interfaces:**

```ts
export const PRODUCT_EVENT_NAMES: readonly ProductEventName[];
export type ProductEventName = /* exact spec vocabulary */;
export interface ProductEventInput { /* event_name, session_id, subject, properties, occurred_at */ }
export function validateProductEvent(input: unknown): ProductEventInput;
export function scrubProductEventProperties(name: ProductEventName, value: unknown): Record<string, unknown>;
export function getOrCreateProductSession(storage: Storage, nowMs: number): ProductSession;
export function isMeaningfulReturn(events: ProductEventFact[]): boolean;
```

- [ ] Write failing tests for all 13 event names, allowed subject/property shapes, unknown
  event rejection, 2 KB property limit, prohibited free-text keys, timestamp bounds, UUID
  validation, 30-minute session rollover, and the six-hour meaningful-return boundary.
- [ ] Implement the registry as an exhaustive typed map. Each event owns a narrow property
  allowlist; there is no generic `Record<string, unknown>` passthrough at the call site.
- [ ] Implement session storage logic without reading `window` inside the pure module.
- [ ] Make meaningful-return classification operate on normalized facts rather than UI names.
- [ ] Run:
  `cd app && npx vitest run tests/product-events/registry.test.ts tests/product-events/session.test.ts`
  — expected: all tests pass.
- [ ] Review gate: verify that adding a new event requires a compile-visible registry edit and
  a database allowlist edit; verify no free-text property survives scrubbing.
- [ ] Commit: `feat(events): define bounded return-ritual event contract`.

### Task 2: Add migration 0215, RPC validation, and real RLS proof

**Files:**

- Create: `db/migrations/0215_product_events.sql`
- Create: `db/tests/rls/product-events.test.ts`
- Modify: `db/tests/helpers/pg-mem.ts` only if its existing strip rules cannot parse the RPC
- Modify: `app/lib/supabase/types.ts`

**Interfaces:**

```sql
record_product_events(events jsonb) RETURNS integer
```

- [ ] Recheck the next migration number before creating the file.
- [ ] Add `product_events` exactly as the spec defines, plus indexes on
  `(user_id, occurred_at DESC)`, `(event_name, occurred_at DESC)`, and
  `(subject_type, subject_id)` where useful to the report.
- [ ] Add an `event_name` constraint/validation branch matching the TypeScript registry.
- [ ] Implement the `SECURITY DEFINER SET search_path = public` RPC. Resolve the caller with
  `auth.uid()`, cap arrays at 20, ignore caller-supplied user IDs by writing the authenticated
  ID, reject time/property violations, and return the inserted count.
- [ ] Revoke direct mutation privileges. Grant owner-only `SELECT`; grant authenticated
  `EXECUTE` on the RPC; keep service-role aggregation available.
- [ ] Write testcontainers cases proving: owner reads own rows; user B cannot read A; direct
  insert/update/delete are denied; unauthenticated RPC calls fail; wrong/unknown events and
  oversized batches fail; valid batches insert exactly once; service role reads all.
- [ ] Update `types.ts`, including the `Functions.record_product_events` signature and warning
  block if the edit is manual.
- [ ] Run: `cd db && npm test && npm run typecheck`.
- [ ] Run with Colima/testcontainers:
  `cd db && npm run test:rls -- product-events` — expected: all product-event RLS/RPC tests pass.
- [ ] Review gate: manually inspect grants from `information_schema.role_table_grants` in the
  test DB; pg-mem output alone is not acceptable evidence.
- [ ] Commit: `feat(db): add RPC-only product event stream`.

### Task 3: Add fail-soft recording action, browser queue, and session tracker

**Files:**

- Create: `app/lib/actions/product-events.ts`
- Create: `app/lib/product-events/queue.ts`
- Create: `app/components/ProductEventSession.tsx`
- Create: `app/tests/actions/product-events.test.ts`
- Create: `app/tests/product-events/queue.test.ts`
- Modify: `app/app/layout.tsx`

**Interfaces:**

```ts
export async function _recordProductEvents(client: Client, events: ProductEventInput[]): Promise<number>;
export async function recordProductEvents(events: ProductEventInput[]): Promise<{ recorded: number }>;
export function createProductEventQueue(flush: FlushEvents, options?: QueueOptions): ProductEventQueue;
```

- [ ] Test-drive the action with a stub client: auth required, local validation before RPC,
  batch cap, exact RPC payload, and structured failure behavior.
- [ ] Test-drive a bounded queue: dedupe only mount/impression events with the same session and
  subject, flush at 5 seconds or 20 rows, one retry, page-hide flush attempt, and drop after a
  second failure without throwing into the domain caller.
- [ ] Mount `ProductEventSession` only for signed-in users in the root layout. It creates the
  session and records `session_started` once per session; it does not turn the whole layout
  into a client component.
- [ ] Keep the public action error visible to the queue logger, but ensure callers that attach
  attribution after a successful domain action never await it as part of success.
- [ ] Run:
  `cd app && npx vitest run tests/actions/product-events.test.ts tests/product-events/queue.test.ts tests/product-events/session.test.ts`.
- [ ] Run: `cd app && npm run typecheck`.
- [ ] Manual dev check: signed-out navigation writes nothing; signed-in first load writes one
  session event; same-session navigation writes no second session event; a 30-minute simulated
  expiry produces a new session ID.
- [ ] Commit: `feat(events): record signed-in product sessions fail-soft`.

### Task 4: Add the diagnostics report and Phase 1 ship gate

**Files:**

- Create: `db/scripts/return-rituals-report.ts`
- Create: `db/tests/return-rituals-report.test.ts` if query construction is extractable without
  connecting to production
- Modify: `app/app/api/cron/maintenance/route.ts`
- Modify: `app/tests/cron/maintenance.test.ts` or create it if the route remains untested
- Modify: `docs/superpowers/plans/2026-07-10-return-rituals.md` to record observed baselines

**Interfaces:** Read-only report sections: active users, sessions, meaningful returns, contract
views/actions, taste-twin impressions/requests/suppressions, gazing funnel, continuation
views/actions. Missing future tables must render `not available yet`, not fail Phase 1.

- [ ] Build the report with `pg`/`dotenv`, reading `DATABASE_URL`, issuing SELECT-only queries,
  and printing absolute user/event counts before rates.
- [ ] Add a `product-event-cleanup` recorded maintenance job deleting rows older than 180 days.
  It must appear independently in `cron_runs`; do not bury deletion inside another job's stats.
- [ ] Add pure query/result formatting tests where practical and a route/job test showing one
  cleanup failure makes maintenance return a failed job rather than `ok:true`.
- [ ] Run: `cd app && npm test && npm run typecheck && npm run build`.
- [ ] Run: `cd db && npm test && npm run typecheck && npm run test:rls`.
- [ ] Whole-branch review: event registry parity, RLS/grants, fail-soft boundary, no prohibited
  properties, cleanup visibility, and migration/app compatibility matrix.
- [ ] Apply `0215` to the target environment before deploying the app.
- [ ] Deploy and smoke: create one signed-in session, wait for queue flush, run
  `cd db && npx tsx scripts/return-rituals-report.ts`, and predict `sessions=1` for the test user
  before reading the output.
- [ ] Record the first baseline counts in this plan. Do not fabricate rates when denominators
  are below the spec thresholds.
- [ ] Open Phase 1 PR, wait for full CI including real RLS, squash-merge, deploy, and begin the
  seven-day baseline window.

---

## Phase 2 — Visible social promise and return contract

**Owner gate override (2026-07-10):** The owner explicitly directed Codex to “complete all the
remaining phases” after Phase 1 recorded its first production sessions. This overrides the
seven-day baseline wait and the 20-view phase gates for sequencing only. The report must still
collect and publish those counts; no conversion threshold is represented as met.

### Task 5: Add deferrals and the pure return-contract domain

**Files:**

- Create: `db/migrations/0216_return_contract_deferrals.sql`
- Create: `db/tests/rls/return-contract-deferrals.test.ts`
- Create: `app/lib/return-contract/types.ts`
- Create: `app/lib/return-contract/resolve.ts`
- Create: `app/tests/return-contract/resolve.test.ts`
- Modify: `app/lib/supabase/types.ts`

**Interfaces:**

```ts
export type ReturnContractKind =
  | "gazing_upcoming" | "gazing_aftermath" | "coven_request"
  | "recommendation" | "gazing_invite" | "price_action"
  | "daily_omen" | "taste_twin";
export interface ReturnContractCandidate { /* kind, key, priority facts, deadline/change time */ }
export interface ReturnContract { /* copy facts, href/action, deferral ceiling */ }
export function resolveReturnContract(candidates: ReturnContractCandidate[], now: Date): ReturnContract | null;
```

- [ ] Create owner-scoped deferrals with unique `(user_id, contract_key)`, future-time and key
  length checks, and service-role visibility. Test owner isolation with testcontainers.
- [ ] Test-drive exact priority order, deterministic ties, boundary times, expired/completed/
  cancelled exclusion, deferral expiry, two-hour event ceiling, and `null` when nothing truthful
  exists.
- [ ] Keep copy facts separate from rendered prose so the resolver remains pure and testable.
- [ ] Run focused app tests plus `db/npm test`, `db/npm run typecheck`, and the new RLS file.
- [ ] Commit: `feat(return-contract): add deterministic contract domain and deferrals`.

### Task 6: Build the read-side candidate assembler and deferral action

**Files:**

- Create: `app/lib/queries/return-contract.ts`
- Create: `app/lib/actions/return-contract.ts`
- Create: `app/tests/queries/return-contract.test.ts`
- Create: `app/tests/actions/return-contract.test.ts`

**Interfaces:**

```ts
export async function getReturnContract(client: Client, userId: string, now: Date): Promise<ReturnContract | null>;
export async function _deferReturnContract(client: Client, input: DeferContractInput): Promise<void>;
```

- [ ] Fetch candidate groups in parallel with explicit columns. Do not use service role or
  PostgREST embeds across `auth.users`; hydrate actor profiles in a second keyed query.
- [ ] Check coven membership/request directions correctly and include only objects the viewer
  may read under RLS.
- [ ] Initially assemble candidates already backed by current schema: coven requests,
  recommendations, theatrical gazing invitations/upcoming RSVPs, watchlist price actions, and
  Daily Omen. The aftermath and taste-twin providers plug in during Phases 3/4 without changing
  resolver priority.
- [ ] Make source-query failure fail closed to no contract and emit a server log; do not break
  `/home`.
- [ ] Validate deferral ceilings server-side rather than trusting a client timestamp.
- [ ] Test query shape, actor hydration, source exclusions, fail-closed behavior, action auth,
  upsert ownership, and public-wrapper revalidation of `/home`.
- [ ] Commit: `feat(return-contract): assemble truthful next actions`.

### Task 7: Render “Next in the Pit” and instrument actual mounts/actions

**Files:**

- Create: `app/components/return-contract/NextInThePit.tsx`
- Create: `app/components/return-contract/ReturnContractTracker.tsx`
- Create: `app/lib/return-contract/copy.ts`
- Create: `app/tests/return-contract/copy.test.ts`
- Modify: `app/app/home/page.tsx`
- Modify: relevant numbered file under `app/app/styles/` or create the next numbered
  return-contract stylesheet and import it from `globals.css`

- [ ] Write copy tests for every currently available contract kind: named human, concrete time
  or unresolved state, literal action, and truthful next-change line. Test singular/plural roster
  counts and never promise “soon.”
- [ ] Load the contract in parallel with existing home queries and render one module immediately
  above the feed search/feed tabs in the center column. Do not replace sidebars or FeedTabs.
- [ ] Record `return_contract_viewed` through an IntersectionObserver only on actual mount/
  visibility. Record `return_contract_acted` only after a durable server action succeeds or,
  for navigation-only contracts, at the destination using an attribution query parameter.
- [ ] Add defer/close behavior with no repeated prompt in the same session.
- [ ] Mobile layout uses existing responsive helpers and remains one primary action.
- [ ] Run copy/resolver/action/query tests, full app typecheck, and build.
- [ ] Manual signed-in pass for every available kind plus no-contract state at desktop and
  ≤720px. Verify the feed still renders when the contract query is forced to fail.
- [ ] Commit: `feat(home): add one truthful next-in-the-pit contract`.

### Task 8: Make the social promise visible on onboarding and `/coven`

**Files:**

- Modify: `app/app/onboarding/CovenStep.tsx`
- Modify: `app/app/onboarding/coven-step-logic.ts` only if decision logic changes
- Modify: `app/app/coven/page.tsx`
- Create: `app/components/coven/SocialPromise.tsx`
- Create: `app/components/coven/CovenEmptyState.tsx`
- Modify/create: logic tests under `app/tests/components/`
- Modify: relevant zine-CSS file

- [ ] State four concrete benefits before asking for a bond: summon, recommend, compare taste,
  and plan a watch. Do not promise taste twins to users without evidence.
- [ ] Empty coven: three paths—kindred discovery placeholder for Phase 3, invite a known person,
  and answer a pending request when one exists.
- [ ] Non-empty coven: preserve pending requests first, then meaningful actions, then member
  directory/search. Never treat Pit events as social proof.
- [ ] Extract empty/non-empty/action ordering into pure logic and test it; do not claim the
  component itself is unit tested.
- [ ] Manual copy/accessibility pass and mobile pass.
- [ ] Commit: `feat(coven): state the social promise at decision points`.

### Task 9: Ship Phase 2 and evaluate the contract gate

- [ ] Run app full suite/typecheck/build and db smoke/typecheck/RLS.
- [ ] Whole-branch review: priority correctness, no unauthorized candidate reads, deferral
  ownership, fail-closed home behavior, actual-view instrumentation, and copy truthfulness.
- [ ] Apply `0216`, deploy app, and smoke one contract view/action plus deferral expiry.
- [ ] Run the return-rituals report after enough traffic. Predict exact test-user count changes
  before each manual action.
- [ ] Evaluate only after 20 distinct contract views: proceed unchanged if ≥30% lead to the
  named durable action within seven days; revise priority/copy first if fewer than five actions.
- [ ] Squash-merge Phase 2 and record any gate override in this plan before Phase 3.

---

## Phase 3 — Taste-twin discovery

### Task 10: Add suppression storage and bulk taste-twin candidate logic

**Files:**

- Create: `db/migrations/0217_taste_twin_suppressions.sql`
- Create: `db/tests/rls/taste-twin-suppressions.test.ts`
- Create: `app/lib/queries/taste-twins.ts`
- Create: `app/lib/taste-twins/rank.ts`
- Create: `app/tests/queries/taste-twins.test.ts`
- Create: `app/tests/taste-twins/rank.test.ts`
- Modify: `app/lib/supabase/types.ts`

**Interfaces:**

```ts
export interface TasteTwinSuggestion {
  user: { id: string; username: string; avatar_url: string | null };
  sharedTraits: SharedTrait[];
  sharedFilm: { id: string; title: string } | null;
  source: "taste" | "second_degree" | "watchlist_overlap";
}
export async function getTasteTwinSuggestions(client: Client, viewerId: string, limit: number): Promise<TasteTwinSuggestion[]>;
```

- [ ] Add owner-scoped suppressions with unique pair, no self-pair check, expiry index, and
  90-day maximum enforced by the action. Prove RLS with testcontainers.
- [ ] Separate evidence collection from pure ranking. Fetch profile candidates, existing coven
  edges, pending requests, suppressions, signals, film tags, and watchlist overlaps in bounded
  bulk queries. No query per candidate and no `getUserOwnAffinity` call in a loop.
- [ ] Reuse the affinity weighting semantics but build candidate vectors from the bulk-fetched
  source rows. Add a parity test comparing the bulk vector for fixtures against
  `getUserOwnAffinity` output.
- [ ] Test exclusions in both coven directions, pending requests both directions, suppression
  expiry, three-film evidence minimum, two visible traits from different facets, cosine order,
  stable tie-break, and limit.
- [ ] Test cold-start labels honestly: second-degree coven, then ≥2 watchlist overlap, then no
  suggestion. Do not call fallback users taste twins.
- [ ] Commit: `feat(taste-twins): rank explainable kindred suggestions in bulk`.

### Task 11: Add suppression/request attribution actions and `/coven` UI

**Files:**

- Create: `app/lib/actions/taste-twins.ts`
- Create: `app/components/coven/TasteTwinStrip.tsx`
- Create: `app/components/coven/TasteTwinCard.tsx`
- Create: `app/tests/actions/taste-twins.test.ts`
- Modify: `app/app/coven/page.tsx`
- Modify: `app/lib/actions/coven.ts` only if a typed source parameter can be added without
  weakening the existing action
- Modify: relevant zine-CSS file

- [ ] Implement `_suppressTasteTwin`/wrapper with auth, candidate validation, a server-computed
  90-day expiry, and `/coven` revalidation.
- [ ] Implement request attribution by calling the existing `_sendCovenRequest` mechanism or a
  shared private helper; do not duplicate the coven insert/RLS behavior. Record
  `taste_twin_request_sent` only after that insert succeeds.
- [ ] Show bare username, 2–3 traits, optional shared film, request action, and `Not my kindred`.
  Never render the internal cosine value.
- [ ] Use actual-view tracking for `taste_twin_viewed`, deduped by session/candidate.
- [ ] After request success, offer one continuation: recommend a film. Closing it ends the
  prompt for the session.
- [ ] Test action authorization, server-computed expiry, exact shared helper call, no event on
  failed request, and source attribution.
- [ ] Manual two-account pass: existing/pending pairs excluded; request lands; success prompt
  appears; suppression removes only discovery and does not block profile search.
- [ ] Commit: `feat(coven): surface explainable taste twins`.

### Task 12: Add accepted-bond shared-taste continuation and ship Phase 3

**Files:**

- Create: `app/app/coven/shared/[username]/page.tsx`
- Create: `app/lib/queries/shared-taste.ts`
- Create: `app/tests/queries/shared-taste.test.ts`
- Modify: `app/lib/notifications/display.tsx`
- Modify: `app/lib/push/payload.ts`
- Modify: `app/tests/notifications/display.test.ts`
- Modify: push payload tests

- [ ] Build a relationship-gated shared-taste query. Both-direction coven membership is
  mandatory; non-members get `notFound()` or an equivalent honest denial.
- [ ] Reuse the explanation builder so `/coven` and shared summary cannot disagree.
- [ ] Deep-link `coven_invite_accepted` to the shared summary when actor username is available,
  retaining `/coven` as a safe fallback.
- [ ] Render `Recommend a film` immediately. Render `Plan a watch` as the Phase 4 entry point
  only after that route/action exists; until then do not show a dead control.
- [ ] Run focused tests, full app suite/typecheck/build, db smoke/typecheck/RLS.
- [ ] Whole-branch review: no N+1 path, affinity parity, all relationship exclusions,
  uncalibrated score never displayed, notification fallback, and instrumentation semantics.
- [ ] Apply `0217`, deploy, and smoke two-account request/suppress/accept/shared-summary paths.
- [ ] Evaluate after 20 distinct suggestion impressions. If suppressions exceed requests or
  fewer than five requests result, stop broad exposure and revise explanations before Phase 4.
- [ ] Squash-merge Phase 3 and record the observed counts/decision in this plan.

---

## Phase 4 — Gazing completion, home watch nights, and continuations

### Task 13: Add enum migration 0218 and gazing schema migration 0219

**Files:**

- Create: `db/migrations/0218_gazing_loop_notification_kinds.sql`
- Create: `db/migrations/0219_gazing_loop.sql`
- Create: `db/tests/rls/gazing-loop.test.ts`
- Modify: `db/tests/rls/gazing-attendees.test.ts`
- Modify: `db/tests/rls/gazing-broadcast-activity.test.ts`
- Modify: `db/tests/helpers/pg-mem.ts` only as needed for enum/trigger stripping
- Modify: `app/lib/supabase/types.ts`

**Schema decisions:**

- `0218` adds notification enum values for 24-hour reminder, two-hour reminder, and aftermath
  prompt. It contains no statements that use those new values.
- `0219` adds `venue_kind`, `status`, `closed_at`, `closed_by`, reminder timestamps, optional
  private `location_note`, nullable theater-only snapshot columns, and
  `gazing_attendees.attended_at`.
- `0219` adds `gazing_invitees(invite_id, user_id, created_at)` with unique pair and indexes.

- [ ] Backfill all old invitations as theatrical/scheduled before adding final constraints.
- [ ] Add checks: theater rows require theater name/ticket URL; home rows require film ID and
  start time; happened/cancelled rows require closure facts; happened rows cannot be returned
  to scheduled.
- [ ] Keep `location_note` off any anon-readable projection. Because the current token page
  uses service role, application code must select public fields first and fetch the location
  separately only after authenticating an authorized participant.
- [ ] Define participant as host, explicit invitee, or RSVP'd attendee. Broadcast visibility
  still requires actual coven membership in either direction; do not materialize the host's
  full coven into invitee rows.
- [ ] Add RLS proving: unrelated users cannot read private home rows/location; explicit invitees
  can read/respond; broadcast coven members can read; non-coven users cannot; only host changes
  host-owned schedule/status; attendee updates only their `attended_at`; service role can run
  reminders; old theater behavior still passes.
- [ ] Keep direct client updates narrow through column grants or RPC/actions; an owner-readable
  invite must not imply owner-updatable status fields for every participant.
- [ ] Run db smoke/typecheck and the complete gazing RLS/trigger subset.
- [ ] Commit 0218 separately before 0219 so Postgres can commit enum values before dependent
  functions/inserts are created.

### Task 14: Refactor the gazing domain and preserve theatrical behavior

**Files:**

- Create: `app/lib/gazing/types.ts`
- Create: `app/lib/gazing/state.ts`
- Create: `app/lib/gazing/reminders.ts`
- Create: `app/tests/gazing/state.test.ts`
- Create: `app/tests/gazing/reminders.test.ts`
- Modify: `app/lib/actions/gazing.ts`
- Modify: existing gazing action tests

**Interfaces:**

```ts
export function canTransitionGazing(input: TransitionInput): boolean;
export function getReminderDue(invite: ReminderInvite, now: Date): ReminderKind[];
export async function _createHomeGazing(client: Client, input: CreateHomeGazingInput): Promise<CreateGazingResult>;
export async function _closeGazing(client: Client, token: string, status: "happened" | "cancelled"): Promise<void>;
export async function _confirmAttendance(client: Client, token: string): Promise<void>;
```

- [ ] Extract and test state/reminder decisions before changing actions: start/end boundaries,
  cancellation, duplicate reminder timestamps, host/attendee completion, and no bulk attendance.
- [ ] Preserve `_createGazingInvite`, `_summonCoven`, and `_toggleGazingRsvp` public behavior and
  tests for theatrical rows.
- [ ] Add home creation with server-side film snapshot, explicit ISO time/zone label validation,
  location length constraint, and either explicit invitees or broadcast—not both.
- [ ] Close actions enforce host ownership and time boundary. Self-attendance enforces RSVP or
  host status and writes only the caller's row/fact.
- [ ] Public wrappers revalidate `/home`, `/gazing/[token]`, the film page, and `/coven` only
  where rendered state changes.
- [ ] Product-event attribution fires after durable success and remains fail-soft.
- [ ] Commit: `feat(gazing): add home nights and honest completion state`.

### Task 15: Build creation UI and make invite pages authorization-safe

**Files:**

- Create: `app/components/gazing/PlanWatchButton.tsx`
- Create: `app/components/gazing/PlanWatchSheet.tsx`
- Create: `app/lib/gazing/create-logic.ts`
- Create: `app/tests/gazing/create-logic.test.ts`
- Modify: `app/app/film/[id]/page.tsx`
- Modify: `app/app/gazing/[token]/page.tsx`
- Modify: `app/lib/queries/gazing-roster.ts`
- Modify: `app/components/GazingRsvpButton.tsx`
- Modify: gazing roster/action tests and zine-CSS

- [ ] Add `Plan a watch` on film detail and wire the same sheet to continuation prompts.
- [ ] Sheet chooses date/time, displays the selected timezone explicitly, selects individual
  covenfolk or broadcast mode, and optionally collects a short private location note.
- [ ] Extract validation to pure logic: future time, maximum scheduling horizon, invitee dedupe,
  mutually exclusive audience mode, location max length, and DST/invalid-local-time handling.
- [ ] Refactor token page loading into a public snapshot query plus an authorized private-detail
  query. Signed-out users may see safe film/time invite copy but never `location_note` or private
  invitee identities.
- [ ] Theater pages retain `Get tickets`; home pages do not render an empty/dead ticket button.
- [ ] RSVP success shows continuation choices: calendar/tickets and reminder state. Calendar
  output uses a generated URL/download derived from frozen invite data; no new provider API.
- [ ] Manual tests: signed-out private token, unrelated signed-in user, explicit invitee,
  broadcast coven member, host, theater regression, and mobile sheet keyboard behavior.
- [ ] Commit: `feat(gazing): add plan-a-watch flow and safe invite details`.

### Task 16: Add reminder/aftermath cron jobs and push/display support

**Files:**

- Create: `app/lib/cron/gazing-reminders.ts`
- Create: `app/tests/cron/gazing-reminders.test.ts`
- Modify: `app/app/api/cron/maintenance/route.ts`
- Modify: `app/lib/push/payload.ts`
- Modify: `app/lib/notifications/display.tsx`
- Modify: corresponding notification/push/maintenance tests

- [ ] Implement one service-role cron function that selects only due scheduled/happened invites,
  determines recipients from host/invitees/RSVPs, inserts notifications idempotently, and marks
  the exact reminder timestamp only after successful inserts.
- [ ] Use a dedicated advisory lock or an atomic claim/update plus a database uniqueness
  backstop. Predict the two-run result in a test: first run inserts N, immediate second run
  inserts 0.
- [ ] Add 24-hour and two-hour reminders plus one post-event prompt. Cancellation and already
  confirmed attendance suppress irrelevant prompts.
- [ ] Add each new notification kind to display and push allowlists with deep links
  `?src=push&event=<kind>`. The gazing destination records `gazing_reminder_opened` once per
  session/source.
- [ ] Add `gazing-reminders` as its own `recordedJob`; failures must make maintenance non-OK and
  remain visible in `cron_runs`.
- [ ] Run focused tests plus full app suite/typecheck/build.
- [ ] Commit: `feat(gazing): send idempotent watch reminders and aftermath prompts`.

### Task 17: Build close, attendance, and shared aftermath UI

**Files:**

- Create: `app/components/gazing/GazingCloseActions.tsx`
- Create: `app/components/gazing/AttendanceConfirm.tsx`
- Create: `app/components/gazing/GazingAftermath.tsx`
- Create: `app/lib/queries/gazing-aftermath.ts`
- Create: `app/tests/queries/gazing-aftermath.test.ts`
- Modify: `app/app/gazing/[token]/page.tsx`
- Modify: `app/lib/queries/gazing-roster.ts`
- Modify: relevant CSS

- [ ] Query confirmed attendees and viewer watched/verdict state with explicit columns and
  second-step profile hydration.
- [ ] Scheduled/post-start host sees happened/cancelled actions. RSVP'd participant sees only
  self-confirmation. Never expose a host bulk-attendance control.
- [ ] Happened state shows confirmed roster, existing verdict state, route into the existing
  watch logger, `Summon them again` for host, and `Plan another watch` for confirmed people.
- [ ] Carry invite attribution into the existing watched success path and record
  `aftermath_verdict_recorded` only after `_logWatch` succeeds. Do not create another verdict
  table.
- [ ] Cancellation retains historical invite/RSVP state but suppresses completion actions.
- [ ] Test query authorization/exclusions and pure rendering state decisions; manually verify
  the components with host/attendee/unrelated accounts.
- [ ] Commit: `feat(gazing): close the loop with attendance and aftermath`.

### Task 18: Add bounded continuation prompts to existing actions

**Files:**

- Create: `app/lib/continuations/resolve.ts`
- Create: `app/components/continuations/ContinuationPrompt.tsx`
- Create: `app/tests/continuations/resolve.test.ts`
- Modify only the success-owning components/actions for watchlist, watched, library,
  recommendations, coven acceptance, RSVP, and attendance
- Modify: related action/component-logic tests

- [ ] Implement the spec's continuation table as a pure exhaustive resolver. Negative FYP
  dismissal resolves to `null`.
- [ ] Show prompts only after success in the same interaction. No global mount, revisit modal,
  or server-persisted nag state.
- [ ] Present at most two choices; closing suppresses that prompt for the current session.
- [ ] Prefer existing actions/components. Add only missing glue: watchlist threshold editing may
  use the existing `max_price_usd` write path; plan-watch reuses Task 15; recommend reuses the
  current recipient flow; grimoire purchase price reuses Claiming semantics.
- [ ] Record view only on mount and action only after the next durable action succeeds.
- [ ] Test every source action, max-two invariant, close/session suppression, no event on failed
  continuation, and negative-action null behavior.
- [ ] Manual mobile pass ensuring a successful action still feels finished when the prompt is
  immediately closed.
- [ ] Commit: `feat(actions): continue successful film and social actions`.

### Task 19: Phase 4 regression, RLS proof, and end-to-end smoke

- [ ] Run focused app tests for gazing, notifications, cron, continuations, product events, and
  return contracts.
- [ ] Run full app gates: `cd app && npm test && npm run typecheck && npm run build`.
- [ ] Run DB gates: `cd db && npm test && npm run typecheck && npm run test:rls`.
- [ ] Whole-branch review must adversarially cover: old theater inserts/pages, enum transaction
  ordering, location-note leakage, invitee vs attendee distinction, both-direction coven reads,
  duplicate cron interleavings, self-only attendance, cancelled events, attribution after—not
  before—durable success, and migration/app compatibility.
- [ ] Apply `0218`, commit the migration transaction, then apply `0219`; verify schema/grants
  before deploying app.
- [ ] Two-account browser smoke:
  1. create a home watch with one explicit invitee;
  2. confirm unrelated signed-out and signed-in viewers cannot see private details;
  3. RSVP as invitee;
  4. manually invoke the reminder function at a controlled time and predict one notification;
  5. rerun and predict zero duplicates;
  6. close as happened;
  7. self-confirm from both accounts;
  8. record a verdict through aftermath;
  9. create a follow-on watch through the continuation.
- [ ] Regression smoke a real theatrical gazing, signed-out landing page, signed-in `/home`,
  `/coven`, film page, watchlist, watched, library, recommendations, and push deep links.
- [ ] Run the return-rituals report and verify the test sequence's expected funnel counts before
  accepting the smoke.

### Task 20: Documentation, PR closeout, and four-week decision gate

**Files:**

- Modify: `app/CLAUDE.md` if root layout/session tracker or new route architecture needs durable
  package guidance
- Modify: `app/components/CLAUDE.md` only for a reusable continuation/visibility-observer rule
- Modify: `app/lib/actions/CLAUDE.md` for the fail-soft attribution-after-success convention
- Modify: `app/lib/queries/CLAUDE.md` for taste-twin bulk-query and return-contract boundaries
- Modify: `db/CLAUDE.md` / `db/migrations/CLAUDE.md` for new RPC/RLS/gazing invariants
- Modify: `AGENTS.md` Current state and open threads
- Append: `docs/sub-project-history.md`
- Modify: this plan with final evidence and deviations

- [ ] Update package guidance only for durable rules; link to the spec rather than duplicating
  its rationale.
- [ ] Add one new most-recent `Last shipped` paragraph to root `AGENTS.md`, state migration and
  app rollout order, list any device/manual or four-week evidence still owed, and remove stale
  open threads that this work actually resolves.
- [ ] Append one history row per independently shipped phase, because each phase has its own PR,
  rollout, and observable result. All four rows link to the same design spec and name their
  phase-specific migrations.
- [ ] Confirm `git diff --check`, intended files only, no accidental `.agents/`, `.claude/`, env,
  image-generation output, or unrelated branch changes.
- [ ] Open Phase 4 PR with the task/whole-branch review trail, wait for CI, squash-merge, deploy,
  and smoke production.
- [ ] At four weeks and ≥10 active users, run the read-only report and evaluate the predeclared
  primary milestones. Record absolute counts and rates in this plan or a dated research note.
- [ ] If a phase misses its kill threshold, retire or revise that surface using the repo's
  retirement discipline; do not make notifications or prompts louder merely to raise views.

## Final definition of done

- All four phases have separately green PR/CI/deploy evidence or an explicit owner-approved
  stop decision recorded after an evidence gate.
- Signed-in sessions, contract views/actions, taste suggestions/requests/suppressions, gazing
  funnel events, and continuation conversions appear in the read-only report.
- Home shows at most one truthful contract and still works when its query fails.
- Taste suggestions never expose a score and never recommend an existing/pending/suppressed
  relationship.
- Theater gazings still work; home watch nights support explicit invitees or coven broadcast,
  reminders, host closure, self-confirmed attendance, and aftermath verdicts.
- Private home location information is proven by real RLS tests not to leak.
- Every continuation follows a successful action, offers at most two choices, and can be closed
  without recurring in the session.
- The maintenance cron records event cleanup and gazing reminders as distinct visible jobs and
  duplicate runs do not duplicate notifications.
- Root/package docs and sub-project history describe what actually shipped, rollout order, and
  any remaining evidence gap.
