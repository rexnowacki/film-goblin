# Achievement Badges — Design

**Date:** 2026-07-13
**Status:** Approved for implementation
**Sub-project:** Admin-authored, automatically awarded profile badges

## Problem

Film Goblin has a public **Relics** section on member profiles, but it is intentionally an empty state because no achievement model exists. Members who build a watch diary therefore receive no durable recognition for milestones or deeper catalog behavior. Staff also have no safe way to define a badge or supply its artwork without a code change.

This sub-project must make the following end state true:

- members earn seeded badges at 25, 50, 75, and 100 logged watches;
- members earn a badge after logging distinct films from one director;
- staff can create later badges by choosing a supported condition and threshold;
- staff can upload SVG artwork now and PNG artwork later;
- existing qualifying members are backfilled instead of waiting for another watch;
- awards cannot be forged by a client or missed by concurrent watch logging;
- earned badges appear in the existing public-profile Relics section.

Explicitly deferred: badge-earned feed events, notifications/toasts, leaderboards, points, streaks, arbitrary SQL/JSON rule authoring, condition editing, badge retirement controls, and per-member badge visibility settings.

## Decision summary

| Decision | Choice |
|---|---|
| Definition model | `badges` table with a typed condition kind and bounded integer threshold |
| Award model | immutable `user_badges` rows, unique per member/badge |
| Initial rule registry | watch-log count, distinct-film count, distinct films by one normalized director |
| Milestone semantics | 25/50/75/100 count diary watch logs; rewatches are legitimate logs |
| Director semantics | distinct film IDs grouped by normalized `films.director`; rewatches do not count |
| Automatic evaluation | `SECURITY DEFINER` database function invoked by watched/definition/director triggers |
| Concurrency | one short global transaction advisory lock plus unique award key |
| Backfill | the same evaluator runs for seeded and newly created definitions |
| Award lifecycle | earned once; later watch deletion or condition changes do not revoke history |
| Artwork | public `badge-images` Storage bucket; admin-only server upload; SVG and PNG |
| Display | existing public profile Relics section; evidence remains non-public |
| Feed/notifications | deferred; `user_badges` is the only source of truth in this sub-project |

## 1. Data model

Migration `0222_badges.sql` adds:

```sql
CREATE TYPE badge_condition_kind AS ENUM (
  'watch_log_count',
  'distinct_film_count',
  'director_distinct_film_count'
);

CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  condition_kind badge_condition_kind NOT NULL,
  threshold INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_badges (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, badge_id)
);
```

Definitions are structured rather than admin-authored SQL. The enum is the evaluator registry and the threshold is constrained to `1..10000`. Slugs are lower-case kebab identifiers. Length checks bound every authored text field and image URL. A partial unique index prevents duplicate active definitions for the same condition/threshold pair.

`evidence` snapshots why an award happened, including the condition kind, threshold, observed count, and normalized/display director when applicable. It preserves the explanation even if a definition or free-text director is corrected later.

## 2. Seed badges

`0222` seeds five active definitions with local, deploy-versioned SVGs:

| Slug | Name | Condition |
|---|---|---|
| `fresh-blood` | Fresh Blood | 25 watch logs |
| `deep-cut` | Deep Cut | 50 watch logs |
| `midnight-glutton` | Midnight Glutton | 75 watch logs |
| `century-beast` | Century Beast | 100 watch logs |
| `auteurs-familiar` | Auteur's Familiar | 3 distinct films from one director |

The first four intentionally match the diary's event-stream meaning of a logged watch, so rewatches count. The admin registry separately exposes **distinct films logged** for later badges. Director achievements always use distinct film IDs so three rewatches of one film cannot qualify.

## 3. Award evaluator

Migration `0223_badge_award_engine.sql` creates two internal functions:

- `evaluate_badges_for_user(user_id, badge_id default null)` evaluates one member against either one definition or every active definition and returns the number of new awards.
- `evaluate_badges_for_all_users(badge_id default null)` evaluates distinct watched users in sorted UUID order for deterministic lock acquisition and returns the total new awards.

Both are `VOLATILE SECURITY DEFINER SET search_path = public, pg_temp`, schema-qualify their tables, revoke execute from `PUBLIC`, `anon`, and `authenticated`, and grant execute only to `service_role`. Triggers can invoke the private function without exposing it to clients.

### Concurrency proof

A unique `(user_id, badge_id)` key prevents duplicate awards but cannot alone prevent a missed threshold. If two transactions begin at 23 logs and concurrently insert one watch each, both could otherwise observe 24 and neither award 25. The same snapshot gap exists when an uncommitted qualifying watch races a new definition or director correction: neither trigger is guaranteed to see the other's future commit.

Every evaluator first acquires the same transaction-scoped advisory lock. Definition and director triggers take that lock before enumerating watched rows. Eligibility queries execute after the lock as separate PL/pgSQL SPI statements; at production `READ COMMITTED`, the waiting transaction receives a refreshed snapshot after the holder commits and sees the change it could otherwise miss. The single global key also avoids AB/BA deadlocks when an import writes several members in different orders inside one transaction. Film Goblin's current watch-write volume makes this short global critical section an acceptable correctness trade; `INSERT ... ON CONFLICT DO NOTHING` remains the independent duplicate defense.

### Triggers

- `AFTER INSERT OR UPDATE OF user_id, film_id ON watched`: evaluate the affected member. This covers the current action, direct PostgREST writes, imports, and future writers.
- `AFTER INSERT OR UPDATE OF condition_kind, threshold, is_active ON badges`: when active, backfill that definition transactionally. A bad definition cannot exist in an active-but-unbackfilled intermediate state.
- `AFTER UPDATE OF director ON films`: when the normalized director changes, reevaluate the film's distinct watchers in sorted order. Catalog corrections can therefore unlock a director badge without another watch.

After the functions and triggers exist, `0223` evaluates all seeded definitions for existing watched users.

Awards are append-only. Deleting a watch, correcting a director away from a match, raising a threshold, or deactivating a definition does not delete `user_badges`. That preserves trophies members genuinely earned at the time. Inactive definitions are hidden from profile display, but their award rows remain historical data.

## 4. Authorization and privacy

Both tables enable RLS.

- Badge definitions and earned badge identity/date are public-readable because Relics live on public profiles.
- No anon or authenticated role can insert, update, or delete either table.
- Definition author UUID and award `evidence` are excluded from anon/authenticated column grants.
- Admin mutations call `requireAdminUser()` against the authoritative `staff` table, then use `serviceRoleClient()` server-side.
- The evaluator RPCs are service-role-only even though triggers invoke them internally.

Public Relics necessarily reveal the achievement represented by a badge. They do not expose the evidence snapshot, the qualifying director, raw progress, or the member's private watched list. A per-member badge visibility control is a separate product decision and is not invented here.

Real-Postgres tests must switch roles and prove each boundary. pg-mem output is not RLS evidence.

## 5. Artwork upload

Migration `0224_badge_images_bucket.sql` creates a public `badge-images` Storage bucket with a 2 MB limit and allowed MIME types `image/svg+xml` and `image/png`. Public URLs can be rendered by profiles; no client write policy is created.

`POST /api/admin/badges/image`:

1. authenticates with the normal server client;
2. requires `staff.role = admin`;
3. validates file presence, MIME, extension, and size;
4. verifies the PNG signature or a restricted SVG document;
5. rejects SVG scripts, event handlers, foreign objects, external references, and other active content;
6. uploads an immutable UUID filename through the service-role Storage client;
7. returns the public URL and object path.

Uploads use immutable object names and are never automatically deleted by the browser. A failed or ambiguous definition action can leave a small orphan, but this is deliberately safer than deleting artwork after a committed action whose response was lost. Uploaded SVG is always rendered through `<img>`; it is never injected as markup. PNG is accepted from day one so later artwork replacement does not require a schema change.

The Storage migration is separate because the bare-Postgres testcontainers environment has no Supabase `storage` schema and must skip only that file.

## 6. Admin tool

`/admin/badges` is linked from the control crypt. The page contains:

- an existing-definition ledger with artwork, name, condition summary, active state, and award count;
- a typed creation form for name, slug, description, condition kind, threshold, and artwork;
- local SVG/PNG preview before upload;
- a manual **Re-run award engine** control for operational recovery and catalog corrections.

The browser never authors JSON or SQL. `app/lib/badges/definition.ts` is the shared condition registry and performs plain-language validation; the database repeats the structural constraints. The create action repeats the admin gate, inserts through service role, relies on the definition trigger for transactional backfill, and reports the resulting award count.

Condition editing and archiving are deliberately deferred. Adding them later must retain the earned-once policy and invoke the same definition trigger.

## 7. Member display

`getProfileBadges(client, userId)` follows the injected-client query contract and selects explicit public columns only. It embeds the active definition, normalizes PostgREST's one-row relationship at the return boundary, and returns deterministic display order.

`ProfileRelics` replaces only the current Relics body:

- zero awards preserves the current truthful empty state;
- earned awards render in a responsive grid with square `object-fit: contain` artwork, visible name, description, and awarded date;
- no evidence/progress/director context is rendered publicly;
- SVG and transparent PNG use a native `<img>` so remote Storage URLs need no Next Image host configuration.

The single responsive breakpoint remains `720px`, and the page continues to use `100dvh` through its existing wrapper.

## 8. Testing and acceptance

### Database, real Postgres

- public roles can read allowed definition/award columns but cannot read creator/evidence;
- authenticated members cannot create definitions or self-award;
- internal evaluator RPCs are denied to anon/authenticated and allowed to service role;
- 24→25 logs awards exactly once; another log/evaluation stays idempotent;
- rewatches count for watch-log milestones but not distinct-film or director conditions;
- three distinct films with normalized director whitespace/case qualify;
- blank directors never qualify;
- a director correction can qualify an existing watcher;
- a newly inserted definition backfills already-qualified users;
- inactive definitions do not award;
- concurrent boundary inserts cannot miss or duplicate an award;
- account deletion cascades awards.

### Application

- pure definition and image validation tests cover all supported conditions and invalid fields/files;
- query tests cover explicit columns, active definitions, and deterministic order;
- route tests cover unauthenticated/non-admin rejection and successful upload delegation;
- source contracts verify admin tile/form wiring, profile Relics wiring, SVG/PNG acceptance, and the 720px CSS rule;
- app test/typecheck/build and DB smoke/typecheck/full real-Postgres suite pass.

### Manual rendered acceptance

- `/p/[username]` at desktop and 390px with 0, 1, 5, and many badges;
- long badge name and description do not overflow;
- seeded SVG and uploaded transparent PNG both preserve their full square artwork;
- `/admin/badges` creates a definition, previews/uploads artwork, reports backfilled awards, rejects bad/oversize files, and stays usable at 390px.

## Rollout order

| | Old schema | New schema |
|---|---|---|
| Old app | current production | safe and compatible; existing watch writes begin awarding through the new trigger |
| New app | broken; badge queries/upload bucket do not exist | target state |

Apply migrations `0222`–`0224` first, then deploy the app. The old app does not query the new tables, while its existing watch writes safely participate in automatic awards through the database trigger.
