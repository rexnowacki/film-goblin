# Return Rituals — Design

**Date:** 2026-07-10
**Status:** Approved
**Sub-project:** Turn Film Goblin's existing social and film actions into explicit reasons to return.

## Problem

Film Goblin has useful individual features, but too many interactions terminate at the
first successful database write:

- a theatrical gazing can be created and joined, but it has no reminder, attendance,
  completion, or shared aftermath;
- a recommendation can be sent, but sender and recipient are not led toward watching it
  together;
- adding a film to a watchlist records intent, but does not naturally lead to a price
  target, a summon, or a future decision;
- accepting a coven bond creates a relationship, but does not reveal what the two people
  share or suggest a first interaction;
- the home feed can show activity, recommendations, and Pit events, but it does not state
  what personally meaningful event is waiting now or when new value will arrive;
- the product has domain-specific feedback tables, but no small, coherent behavioral event
  stream capable of showing whether these loops close.

The result is a collection of good surfaces without a clear return habit. A user can finish
an action successfully without creating a reason for themselves or another person to come
back.

This project will make one product promise explicit:

> Film Goblin helps you find your people, choose what to watch, and return when the coven or
> the film needs an answer.

The goal is not to maximize feed scrolling or manufacture activity. The goal is to increase
the number of meaningful loops that reach a human conclusion: a response, a scheduled
watch, a confirmed attendance, or a recorded verdict.

## Existing assets

This design extends working infrastructure rather than replacing it:

- `gazing_invites` and `gazing_attendees` support theatrical summons and RSVP state.
- `gazing_attending` activity and `gazing_rsvp` notifications already fan out from attendee
  inserts.
- `/gazing/[token]` has a public invite page, roster, ticket link, and OG share image.
- Web Push already delivers selected social notification kinds through the notification
  fanout path.
- `getUserOwnAffinity` builds a tag-affinity vector and `cosineSimilarity` compares two
  vectors.
- `coven_members` provides the existing relationship and request path.
- FYP impressions and dismissals prove the repository's preferred pattern: client-observed
  impressions written through a bounded `SECURITY DEFINER` RPC.
- The maintenance cron is the single fan-out point for scheduled jobs.

## Decision summary

| Decision | Choice |
|---|---|
| Primary outcome | More completed social and viewing loops, not more raw page views |
| Delivery | Four gated phases; each phase is independently measurable and releasable |
| Social object | Extend “gazing” to cover both theatrical gazings and scheduled home watch nights |
| Completion | Host closes the event; each participant confirms only their own attendance |
| Taste twins | Explain shared taste traits; never display an unvalidated compatibility percentage |
| Return contract | A single truthful “Next in the Pit” module derived from real pending state |
| Social promise | Show concrete benefits and real people; never use fake activity or inflated counts |
| Instrumentation | Small first-party event vocabulary, authenticated users only in v1 |
| Privacy | No notes, search text, message text, or full payload snapshots in analytics properties |
| Optimization target | `meaningful_return`, defined below, plus loop-specific absolute counts |

## Product model

The six requested ideas are one system with three layers:

```text
VISIBLE PROMISE
“Your coven changes what happens here.”
        ↓
NEXT ACTION
taste twin / summon / RSVP / verdict / price decision
        ↓
RETURN CONTRACT
“Come back for this specific unresolved or scheduled thing.”
        ↓
COMPLETION
response / attendance / shared aftermath
        ↓
INSTRUMENTATION
did the loop actually close?
```

The home feed remains a record of activity. It is not promoted into a generic engagement
dashboard. The new module sits above the feed and presents at most one primary obligation or
opportunity at a time.

## Phase 1 — Behavioral instrumentation

Instrumentation lands first so every later phase has a baseline and a falsifiable result.
It is intentionally narrower than a general analytics platform.

### Data model

Add `product_events`:

```sql
CREATE TABLE product_events (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid NOT NULL,
  event_name    text NOT NULL,
  path          text,
  subject_type  text,
  subject_id    uuid,
  properties    jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   timestamptz NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now()
);
```

The browser generates `id` before enqueueing. The RPC inserts it with
`ON CONFLICT (id) DO NOTHING`, making the queue's one allowed retry idempotent even when the
first response is lost after Postgres commits.

Migration numbers are assigned when the implementation plan begins. The current branch
already reaches migration `0214`; reserving numbers in a draft spec would create an avoidable
two-machine collision.

RLS and grants:

- authenticated users may `SELECT` only their own rows;
- clients receive no direct `INSERT`, `UPDATE`, or `DELETE` grant;
- writes use `record_product_events(events jsonb)` as `SECURITY DEFINER`;
- the RPC requires every row's authenticated `user_id` to be `auth.uid()`, rejects unknown
  event names and properties, caps a batch at 20, rejects timestamps more than 24 hours old
  or five minutes in the future, and caps serialized properties at 2 KB;
- service role can aggregate all rows for diagnostics;
- no anon instrumentation in v1.

The application owns an explicit event registry in one pure module. The RPC mirrors the same
allowlist with a database check or validation branch so a compromised client cannot invent
an unlimited vocabulary.

### Event vocabulary

Events describe decisions and loop transitions, not every tap:

| Event | When it is recorded | Required subject |
|---|---|---|
| `session_started` | First signed-in page view for a new local session | none |
| `return_contract_viewed` | The selected contract is actually mounted | contract kind/id |
| `return_contract_acted` | Its primary action is used | contract kind/id |
| `taste_twin_viewed` | A candidate card is actually mounted | candidate user |
| `taste_twin_request_sent` | The existing coven-request action succeeds from that card | candidate user |
| `gazing_created` | Theater or home gazing insert succeeds | invite |
| `gazing_rsvp_changed` | RSVP insert or delete succeeds | invite |
| `gazing_reminder_opened` | A tagged reminder deep link is opened | invite |
| `gazing_closed` | Host marks happened or cancelled | invite |
| `attendance_confirmed` | A participant confirms attendance | invite |
| `aftermath_verdict_recorded` | A verdict is recorded from the aftermath flow | invite + film |
| `continuation_prompt_viewed` | A post-action continuation is mounted | source action |
| `continuation_prompt_acted` | The continuation action succeeds | source action |

Existing domain writes remain the source of truth. Product events never determine whether a
user RSVP'd, watched a film, or joined a coven; they only attribute the path that produced
the durable domain row.

### Session and return definitions

`session_id` is a random UUID stored in `sessionStorage`. A new browser tab or restored tab
after 30 minutes of inactivity starts a new session. This is sufficient for directional
small-N analysis; cross-device identity comes from `user_id`.

A **meaningful return** is a new session at least six hours after the user's preceding
session in which at least one of these occurs:

- a return-contract action;
- a coven request or acceptance;
- a gazing creation, RSVP, close, or attendance confirmation;
- a verdict recorded from a gazing aftermath;
- an existing durable film action such as watchlist, watched, library, recommendation, or
  price claim.

Raw sessions and page views are supporting counts, not the success metric.

### Retention and deletion

- Keep raw product events for 180 days, then delete them in a maintenance-cron job.
- Aggregate reports may retain counts without user-level properties.
- Account deletion cascades raw events with the auth user.
- Never write film notes, comments, usernames, search terms, notification bodies, external
  URLs, or arbitrary component state into `properties`.

## Phase 2 — Visible social promise and explicit return contract

### Visible social promise

The promise appears where a user decides whether social participation is worth the effort:

1. **Onboarding social chapter** — explain the concrete exchange before asking for a bond:
   people in a coven can summon one another, exchange recommendations, compare taste, and
   plan a watch.
2. **Empty `/coven` state** — show three benefits with direct paths: find kindred taste,
   invite someone known, or respond to a pending request.
3. **Non-empty `/coven` state** — lead with pending human actions and taste-twin discovery,
   not a directory of avatars.
4. **Home** — show the face and username attached to a real pending social action. A generic
   count such as “three things happened” is subordinate to “moss.witch is waiting for your
   answer.”

The product must not imply that a user's whole coven is attending when only one member has
RSVP'd, use system events as evidence of social activity, or show compatibility claims for
users with insufficient taste data.

### “Next in the Pit” return contract

Add one server-derived module above the signed-in `/home` feed. It contains:

- one primary statement;
- one concrete time or unresolved human state;
- one primary action;
- an optional secondary dismissal or defer action;
- a small line stating when the module can change next.

Selection is deterministic and uses this priority order:

1. a gazing beginning within 24 hours that the viewer hosts or attends;
2. an unresolved post-gazing attendance or verdict prompt;
3. a pending coven request or direct recommendation;
4. a gazing invitation awaiting RSVP;
5. a watchlist-relevant price action;
6. the Daily Omen, with its next truthful daily refresh time;
7. a taste-twin suggestion;
8. no module.

The module never invents a countdown. If a contract is based on scheduled time, show that
time. If it is based on an unresolved person, say who is waiting. If it is the Daily Omen,
state when the daily seed changes. If no new value has a known arrival time, omit the
promise instead of saying “check back soon.”

Examples of the intended information shape, not final copy:

- `Possession starts Friday at 9:00 PM. Two covenfolk are in.`
- `moss.witch invited you to The Wailing. Answer the summon.`
- `Last night's gazing is waiting for your verdict.`
- `Your Daily Omen changes tomorrow.`

### Deferral

Dismissal does not delete domain state. `return_contract_deferrals` stores
`(user_id, contract_key, deferred_until, created_at)` with owner-only read and writes through
an authenticated action. Deferrals expire automatically and are capped per contract kind;
an upcoming event inside two hours cannot be hidden past its start time.

## Phase 3 — Taste-twin discovery

### Candidate selection

Create `getTasteTwinSuggestions(client, viewerId, limit)` using the existing query
client-injection pattern.

Candidates must:

- have a completed profile;
- not be the viewer;
- not already be connected in either direction through `coven_members`;
- not have a pending coven request in either direction;
- not be blocked by either party if a block relation exists when this phase is built;
- possess enough taste evidence to produce an honest explanation.

The first version may compare the current population in application code because the
community is small. It must fetch source rows in bounded batches and avoid an N+1 query per
candidate. At a larger population this moves to a cached affinity snapshot table; that cache
is not part of v1.

### Ranking

For users with non-empty affinity vectors, rank by cosine similarity using
`cosineSimilarity`. Similarity is an internal ordering signal only and is never rendered as
a percentage.

Minimum evidence for a normal suggestion:

- both users have signals from at least three distinct films; and
- the explanation contains at least two shared visible tags from different facets.

Cold-start users are not given fake taste twins. Their fallback is explicitly labeled
`People your coven knows` and ranks second-degree coven neighbors or, if available, people
with at least two shared watchlist films. If neither evidence source clears its threshold,
the surface shows an invite-known-friend action instead.

### Explanation and action

Each suggestion shows:

- avatar and bare username;
- two or three shared traits, such as `folk horror`, `religious dread`, and `slow burn`;
- one concrete overlap, such as a film both recommended or saved, when available;
- the existing coven-request action;
- `Not my kindred`, which suppresses that pair for 90 days.

Add `taste_twin_suppressions(viewer_id, candidate_id, suppressed_until, created_at)` with
owner-only reads and writes through a validated action. Suppression affects only discovery;
it does not block profiles, invitations, or search.

After a request is sent, the success state offers one continuation: recommend a film to the
candidate. After the request is accepted, the notification deep link opens a shared-taste
summary with `Recommend a film` and `Plan a watch` actions.

## Phase 4 — Close the gazing and home watch-night loop

### One gazing model, two venue kinds

Extend `gazing_invites` rather than create an unrelated watch-party system:

- `venue_kind`: `theater | home`;
- `status`: `scheduled | happened | cancelled`;
- `closed_at`, `closed_by`;
- `reminder_sent_at` for idempotent scheduled fanout;
- theater snapshots remain populated for theatrical gazings;
- home gazings require `film_id`, `film_title`, and `starts_at`, allow
  `showtime_id`, `tickets_url`, and `theater_name` to be null, and may carry a short
  host-authored `location_note` visible only to authenticated invite participants.

Individual summons are stored in `gazing_invitees(invite_id, user_id, created_at)`.
The table is distinct from `gazing_attendees`: an invitee is allowed to see and answer a
summon; an attendee has affirmatively RSVP'd. Broadcast gazings continue to derive their
audience from the host's coven instead of materializing every coven member as an invitee row.

Existing rows backfill as `venue_kind = 'theater'` and `status = 'scheduled'`. Public token
pages for home gazings must not expose a private location note to signed-out viewers.

Home watch nights are created from a film page or a continuation prompt. The host chooses a
date and time and either selects individual covenfolk or broadcasts to the coven. Timezone is
displayed explicitly during creation and stored as `timestamptz`; this project does not
silently infer per-user timezones because profiles do not currently store one.

### RSVP and reminders

RSVP remains a binary `in / not in` state in v1. “Maybe” is rejected because it weakens the
commitment without resolving scheduling; rescheduling is a separate host action.

The maintenance cron sends idempotent notifications:

- 24 hours before start, when created early enough;
- two hours before start;
- one post-event prompt after the scheduled end window.

The existing notification-to-push pipeline delivers these kinds when the user has opted in.
Every reminder deep link includes a source marker so `gazing_reminder_opened` can be
attributed. Notification delivery is useful but not proof of attendance.

### Completion and attendance

After the start time:

- the host may mark the gazing `happened` or `cancelled`;
- if the host takes no action, attendees receive a prompt after the end window and can confirm
  their own attendance;
- an attendee confirmation can move a still-scheduled gazing into `happened`, but never mark
  another user present;
- `gazing_attendees.attended_at` records a participant's own confirmation;
- cancellation suppresses completion prompts and never deletes the invite or RSVP history.

The host cannot bulk-mark the roster as attended. This keeps attendance honest and prevents
the social graph from manufacturing engagement on behalf of other users.

### Shared aftermath

Once a gazing happened, `/gazing/[token]` becomes an aftermath surface:

- confirmed attendee roster;
- each viewer's existing watched/verdict state;
- one-tap route into the existing watched flow;
- reactions or comments on the resulting activity;
- `Summon them again` for the host;
- `Plan another watch` for confirmed participants.

Recording a verdict uses the existing watched action and data model. The gazing link is
carried only for attribution and aftermath rendering; a second verdict table is not created.

## Continuation prompts — actions currently terminating too early

Continuation prompts appear only after the primary action succeeds. They never block success,
open automatically on every revisit, or present more than two next choices.

| Completed action | Immediate continuation |
|---|---|
| Add to watchlist | Set/adjust price summon; or plan a watch |
| Record watched/verdict | Tell the coven; or plan another watch with recent attendees |
| Add to grimoire | Record purchase price when known; or recommend it |
| Send recommendation | Plan a watch with that recipient |
| Accept coven request | View shared taste; then recommend one film or plan a watch |
| RSVP to gazing | Add to calendar / get tickets; then show reminder state |
| Confirm attendance | Record verdict; then react to the shared aftermath |
| Dismiss a FYP film | Show no continuation; dismissal is already a complete negative action |

Each prompt records `continuation_prompt_viewed` only when mounted and
`continuation_prompt_acted` only after the next durable action succeeds. A close action ends
the prompt without punishment or repeated nagging in the same session.

## Failure handling

- Instrumentation is fail-soft: a failed product-event batch is logged and discarded after a
  bounded retry; it never reverses the user's domain action.
- Domain actions fail loud with authored user-facing copy. A failed RSVP, coven request, or
  attendance confirmation must not render the success continuation.
- Return-contract selection fails closed to no module. It does not replace the home page or
  block feed rendering.
- A taste candidate whose vector or profile fetch fails is omitted; the list can be shorter
  than requested.
- Reminder jobs record per-invite outcomes and do not use `||` fallbacks that convert a send
  failure into apparent success.
- Duplicate RSVP, attendance, reminder, and event writes are idempotent through unique keys or
  conflict handling.

## Rollout and experiment gates

This design ships as four separate PR-sized phases, even if one implementation plan covers
all four:

1. **Instrumentation:** event table/RPC, client queue, diagnostics, baseline collection.
2. **Promise and contract:** social promise copy/surfaces, return-contract resolver, deferrals.
3. **Taste twins:** candidate query, explanation, suppression, coven-request continuation.
4. **Gazing completion:** home watch nights, reminders, completion, attendance, aftermath,
   and continuation prompts on the remaining action surfaces.

Each schema phase is additive from the old application's perspective. Unless the final plan
finds an incompatible constraint change, apply its migration before deploying code that reads
the new tables or columns. Relaxing the existing theater snapshot `NOT NULL` constraints must
land in the same additive migration as `venue_kind`; old inserts remain valid because their
current fields are still populated.

Do not start Phase 3 or 4 until Phase 1 has recorded at least seven days of baseline activity,
unless the owner explicitly chooses qualitative evidence due to very low traffic. At small N,
report absolute user and loop counts alongside every rate.

## Success and kill criteria

Primary milestone, evaluated after four weeks with at least 10 active users:

- at least 30% of active users complete one meaningful return per week; and
- at least three gazings per month receive two or more RSVPs; and
- at least 50% of happened gazings with two or more RSVPs receive two or more independently
  confirmed attendees or aftermath verdicts.

Phase-specific signals:

| Phase | Positive result | Kill or revise condition |
|---|---|---|
| Return contract | At least 30% of viewed contracts produce their named durable action within seven days, over 20 views | Fewer than five actions over 20 views: revise priority/copy before adding more contract kinds |
| Taste twins | At least 30% of suggestions produce a coven request within seven days, over 20 distinct impressions | Suppression exceeds requests, or fewer than five requests over 20 impressions: stop broad exposure and inspect explanation quality |
| Gazing loop | Three events/month reach two RSVPs; median RSVP-to-confirmed-attendance exceeds 50% over 10 happened events | Reminders increase opens but not RSVPs or attendance: reduce notification volume and repair the scheduling flow |
| Continuations | At least 20% of mounted prompts lead to their named durable action, over 30 views | Under 10% or repeated close behavior: remove that prompt instead of making it louder |

These thresholds are directional at Film Goblin's current scale. They are decisions stated in
advance, not claims of statistical significance.

## Testing

### Pure/unit

- return-contract priority, deterministic tie-breaking, expiry, and deferral boundaries;
- event registry validation, property scrubbing, session expiry, and meaningful-return
  classification;
- taste-twin candidate exclusions, cosine ordering, evidence thresholds, shared-trait
  explanations, cold-start fallback, and suppression;
- gazing state transitions and reminder eligibility/idempotency;
- continuation selection after every supported source action.

### App integration

- event RPC batch rejects unknown names, wrong users, oversized batches, and unsafe properties;
- taste-twin request uses the existing coven action and records attribution only after success;
- theater invites remain valid after nullable home-watch fields are introduced;
- home-watch creation freezes the film snapshot and respects participant visibility;
- RSVP → reminder → close → self-confirm attendance → watched verdict works end to end;
- return-contract queries exclude deferred, completed, cancelled, expired, and unauthorized
  objects.

### RLS/testcontainers

- product events are owner-readable and RPC-only writable;
- private home-watch location notes are not visible to signed-out users or unrelated
  authenticated users;
- participants can read the invite they received but cannot edit host-owned schedule/status
  fields;
- attendees can update only their own attendance confirmation;
- taste suppression and contract deferral rows are owner-scoped;
- service-role reminder and diagnostics reads remain available.

### Manual

- mobile signed-in home pass for every contract kind and empty state;
- two-account taste-twin request/accept/shared-summary pass;
- theater gazing regression pass, including signed-out OG/invite page;
- home watch-night creation on two accounts across a displayed timezone boundary;
- push reminder deep link, RSVP, host close, attendee confirmation, and aftermath verdict;
- VoiceOver/keyboard pass for cards, sheets, time input, and continuation prompts.

## Out of scope

- group chat, direct messages, or comments attached specifically to an invite;
- video synchronization, streaming-service playback, or embedded watch-party technology;
- recurring watch-night rules;
- “maybe” RSVPs or automated scheduling polls;
- public compatibility scores, dating-style swipe mechanics, or auto-created coven bonds;
- global leaderboards, streaks, badges, points, or rewards for page views;
- third-party analytics, session replay, ad attribution, or anonymous visitor tracking;
- generalized feature flags or statistically powered A/B testing;
- per-user timezone storage beyond explicit timezone display during scheduling;
- replacing the existing home feed or FYP recommender;
- the dedicated price Ledger and the remaining Pit archive/digest projects.

## Rejected alternatives

### Build six independent features

Rejected because the pieces only become a retention system when an action creates a truthful
future obligation and that obligation can be measured through completion.

### Optimize daily active users or page views

Rejected because a small community can raise those numbers with noisy notifications or feed
refreshes without producing a single relationship or completed watch.

### Display a taste-match percentage

Rejected because cosine similarity is useful for ordering but is not a calibrated probability
of friendship or compatibility. Shared traits are more honest and more legible.

### Add a separate watch-party table and UI

Rejected because theatrical gazings already own invitations, public tokens, rosters,
activities, notifications, and share cards. A second system would fragment the same ritual.

### Let hosts mark everyone attended

Rejected because it turns another user's behavioral history into host-authored data and makes
the core success metric untrustworthy.

### Promise a fixed daily stream of new content

Rejected because Film Goblin's catalog and community are intentionally small. The return
contract must name a real person, scheduled event, price decision, or deterministic daily
refresh; it must be absent when none exists.
