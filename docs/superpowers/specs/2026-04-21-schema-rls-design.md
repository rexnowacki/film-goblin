# Database Schema + RLS Policies — Design

Sub-project 2 of the Film Goblin production rebuild. Establishes the full relational schema on Supabase Postgres: user identity, social graph, watchlists/alerts, grimoires (lists), editorial reviews, recommendations, and an activity feed — each with row-level-security policies enforced in the database. Ends when `db/migrations/*.sql` applies cleanly against a fresh Postgres, every table has RLS enabled with policies tested against real user sessions, and triggers deliver the derived rows their consumers expect.

## Scope boundary

- **This spec owns:** all tables and RLS policies for identity, social, watchlists (real, not stub), lists, reviews, recommendations, activity. Plus the Postgres triggers that connect them.
- **Out of scope:** `auth.users` (Supabase owns). Notification delivery state — owned by sub-project 5. Any UI or API — owned by sub-project 3 and beyond. Supabase realtime subscription filters — referenced here but wired up in sub-project 6.

## Where migrations live

All sub-project-2 migrations land in a new repo-root directory: **`db/migrations/`**. A tiny `db/migrate.ts` runner mirrors `worker/src/migrate.ts` and applies them against `DATABASE_URL`.

The worker's existing `worker/migrations/` (0001–0003) stay where they are. Sub-project 2 starts numbering at **0100** to leave clear space above the worker's files. The worker's `_migrations` tracking table is reused — both packages register against it — and the numeric gap prevents collisions.

The first migration in this spec, `0100_drop_watchlists_stub.sql`, drops the worker's stubbed `watchlists` and `price_alerts` tables. A later migration in this spec recreates them with real FK relationships. The `films` and `price_history` tables are untouched.

## Entity list

Nine new tables, plus two operations on worker-owned tables.

### Identity

**`profiles`** — one row per `auth.users` entry; public fields only.
```
id                          uuid primary key references auth.users(id) on delete cascade
handle                      text not null
display_name                text not null
bio                         text not null default ''
avatar_url                  text not null default ''
broadcast_watchlist_adds    boolean not null default false
created_at                  timestamptz not null default now()
updated_at                  timestamptz not null default now()

create unique index profiles_handle_lower_idx on profiles (lower(handle));
```

Handle uniqueness is case-insensitive via a functional unique index on `lower(handle)`. We preserve the user's chosen casing in the column for display but enforce uniqueness on the normalized form. Avoids the `citext` extension.

**`staff`** — staff membership is additive to `profiles`.
```
user_id         uuid primary key references auth.users(id) on delete cascade
role            enum 'reviewer' | 'admin'
created_at      timestamptz not null default now()
```

### Social graph

**`follows`** — asymmetric follow graph.
```
follower_user_id    uuid references auth.users(id) on delete cascade
followed_user_id    uuid references auth.users(id) on delete cascade
created_at          timestamptz not null default now()
primary key (follower_user_id, followed_user_id)
check (follower_user_id <> followed_user_id)
```

**`coven_requests`** — pending/accepted/declined coven invitations.
```
id              uuid primary key default gen_random_uuid()
from_user_id    uuid not null references auth.users(id) on delete cascade
to_user_id      uuid not null references auth.users(id) on delete cascade
status          enum 'pending' | 'accepted' | 'declined' default 'pending'
created_at      timestamptz not null default now()
responded_at    timestamptz
unique (from_user_id, to_user_id)
check (from_user_id <> to_user_id)
```

**`coven_members`** — mutual membership, canonicalized pair.
```
user_a_id       uuid references auth.users(id) on delete cascade
user_b_id       uuid references auth.users(id) on delete cascade
created_at      timestamptz not null default now()
primary key (user_a_id, user_b_id)
check (user_a_id < user_b_id)
```

### Watchlists + alerts (real, replacing stub)

**`watchlists`**
```
id                uuid primary key default gen_random_uuid()
user_id           uuid not null references auth.users(id) on delete cascade
film_id           uuid not null references films(id) on delete cascade
max_price_usd     numeric(6,2)
last_alerted_at   timestamptz
created_at        timestamptz not null default now()
unique (user_id, film_id)
```

**`price_alerts`** (unchanged column-wise from stub, real FKs now)
```
id                uuid primary key default gen_random_uuid()
watchlist_id      uuid not null references watchlists(id) on delete cascade
film_id           uuid not null references films(id) on delete cascade
old_price_usd     numeric(6,2) not null
new_price_usd     numeric(6,2) not null
created_at        timestamptz not null default now()
```

### Lists (grimoires)

**`lists`**
```
id              uuid primary key default gen_random_uuid()
owner_user_id   uuid not null references auth.users(id) on delete cascade
title           text not null
description     text not null default ''
is_public       boolean not null default true
is_official     boolean not null default false
created_at      timestamptz not null default now()
updated_at      timestamptz not null default now()
```

**`list_films`** — ordered membership.
```
list_id         uuid references lists(id) on delete cascade
film_id         uuid references films(id) on delete cascade
position        integer not null
added_at        timestamptz not null default now()
primary key (list_id, film_id)
```

**`list_subscriptions`** — subscribe for price alerts on any film in the list.
```
user_id         uuid references auth.users(id) on delete cascade
list_id         uuid references lists(id) on delete cascade
created_at      timestamptz not null default now()
primary key (user_id, list_id)
```

### Editorial reviews (staff-only)

**`reviews`**
```
id                uuid primary key default gen_random_uuid()
film_id           uuid not null references films(id) on delete cascade
author_user_id    uuid not null references staff(user_id) on delete restrict
title             text not null
body              text not null
pullquote         text not null default ''
status            enum 'draft' | 'published' default 'draft'
published_at      timestamptz
created_at        timestamptz not null default now()
updated_at        timestamptz not null default now()
```

### Recommendations

**`recommendations`** — public broadcast, visible in followers' feeds.
```
id              uuid primary key default gen_random_uuid()
from_user_id    uuid not null references auth.users(id) on delete cascade
to_user_id      uuid not null references auth.users(id) on delete cascade
film_id         uuid not null references films(id) on delete cascade
note            text not null default ''
created_at      timestamptz not null default now()
check (from_user_id <> to_user_id)
```

### Activity feed

**`activity`** — one row per event, fan-out computed on read against the follow graph.
```
id              uuid primary key default gen_random_uuid()
actor_user_id   uuid not null references auth.users(id) on delete cascade
kind            enum 'review_published' | 'recommendation_sent' | 'watchlist_added' | 'list_created' | 'list_film_added' | 'coven_joined'
payload         jsonb not null default '{}'::jsonb
created_at      timestamptz not null default now()
```

Read path:
```sql
SELECT * FROM activity
WHERE actor_user_id IN (
  SELECT followed_user_id FROM follows WHERE follower_user_id = auth.uid()
)
ORDER BY created_at DESC
LIMIT 50;
```

### Operations on worker-owned tables

- `0100_drop_watchlists_stub.sql` — `DROP TABLE IF EXISTS price_alerts; DROP TABLE IF EXISTS watchlists;` (stub tables from worker migration 0003 are replaced in this spec).
- `films`, `price_history` untouched.

### Intentionally not modeled

- `auth.users` (Supabase owns).
- Notification delivery state, queued emails, push receipts (sub-project 5).
- Genre taxonomy as a table. Films keep `genre_primary` as text; a pivot table lands only when filtering demands it.
- Denormalized counters (follower count, review count, etc.). Computed on read with appropriate indexes until instrumentation proves otherwise.
- Profile visibility tiers. All profiles are public; the prototype's `Public / Coven Only / Hermit` setting is explicitly dropped for launch.

## RLS policies

RLS is **enabled on every table**. Service-role bypasses RLS (the worker keeps using service-role, nothing changes in its code). `auth.uid()` is Supabase's current-user helper; `NULL` for anonymous requests.

### `profiles`
- **read:** anyone
- **insert:** only via the `auth.users` → `profiles` trigger; no direct client inserts
- **update:** `auth.uid() = id`, only on `handle`, `display_name`, `bio`, `avatar_url`, `updated_at`
- **delete:** none from clients (cascades with auth user)

### `staff`
- **read:** anyone (UI shows "Staff Reviewer" badges)
- **write:** service-role only

### `follows`
- **read:** anyone
- **insert:** `auth.uid() = follower_user_id`
- **delete:** `auth.uid() IN (follower_user_id, followed_user_id)` (unfollow, or forced-unfollow by the followee as a minimal "soft block")
- **update:** none

Note: forced-unfollow is a soft block — it removes the follow but does not prevent re-follow. A real block primitive (distinct from unfollow) is deferred.

### `coven_requests`
- **read:** `auth.uid() IN (from_user_id, to_user_id)`
- **insert:** `auth.uid() = from_user_id` AND `status = 'pending'`
- **update:** `auth.uid() = to_user_id` AND transitioning `status` from `pending` to `accepted` or `declined`; only `status` and `responded_at` columns
- **delete:** `auth.uid() IN (from_user_id, to_user_id)` (withdraw / dismiss)

### `coven_members`
- **read:** anyone (public close-coven is visible; same posture as follow graph)
- **write:** none from clients — only via trigger from `coven_requests` acceptance

### `watchlists`
- **read:** `auth.uid() = user_id` (watchlist is private)
- **insert/update/delete:** `auth.uid() = user_id`; update only `max_price_usd`

### `price_alerts`
- **read:** owner of the watchlist (`auth.uid() = (SELECT user_id FROM watchlists WHERE id = watchlist_id)`)
- **write:** service-role only (worker inserts)

### `lists`
- **read:** `is_public = TRUE OR auth.uid() = owner_user_id`
- **insert/update/delete:** `auth.uid() = owner_user_id`

### `list_films`
- **read:** inherit list visibility via `EXISTS (SELECT 1 FROM lists WHERE lists.id = list_films.list_id AND (lists.is_public OR lists.owner_user_id = auth.uid()))`
- **insert/update/delete:** the list's owner only

### `list_subscriptions`
- **read:** `auth.uid() = user_id` OR `auth.uid() = (SELECT owner_user_id FROM lists WHERE id = list_id)`
- **insert:** `auth.uid() = user_id` AND target list `is_public = TRUE`
- **delete:** `auth.uid() = user_id`

### `reviews`
- **read:** `status = 'published'` is world-readable; drafts only readable by their author AND staff
- **insert:** author is staff AND `author_user_id = auth.uid()`
- **update:** same as insert
- **delete:** admin only (`auth.uid() IN (SELECT user_id FROM staff WHERE role = 'admin')`)

### `recommendations`
- **read:** anyone
- **insert:** `auth.uid() = from_user_id` AND `from_user_id <> to_user_id`
- **delete:** `auth.uid() IN (from_user_id, to_user_id)`
- **update:** none

### `activity`
- **read:** anyone (events are already public; the real privacy decision is at the source table and what gets inserted)
- **insert:** no client policy exists — all insert attempts from user sessions fail RLS. Triggers run as `SECURITY DEFINER` so they bypass RLS and can insert. Service-role also bypasses and is the allowed path for backfills.
- **update/delete:** none

### Cross-cutting rules

- No RLS policy recurses through another table's RLS. When a policy needs to check another table (e.g., `list_films` reads `lists`), the subquery is written against a column with its own index, not through a view that re-applies RLS.
- The worker uses service-role for every DB write it performs; none of the above policies gate it.

## Triggers and derived data

Four trigger responsibilities. Each reduces client complexity or RLS-bypass risk.

**1. `auth.users` → `profiles` bootstrap.** After-insert trigger on `auth.users` inserts a matching `profiles` row with a handle derived from email local-part, de-duplicated with a numeric suffix if needed. Users rename their handle post-signup via the settings page.

**2. `coven_requests` → `coven_members`.** After-update trigger on `coven_requests`, fires only when `OLD.status = 'pending' AND NEW.status = 'accepted'`. Inserts into `coven_members` with canonicalized `(LEAST(from, to), GREATEST(from, to))`. Idempotent via `ON CONFLICT DO NOTHING`.

**3. Source-table → `activity`.** After-insert triggers on:
- `lists` → `list_created` (actor = `owner_user_id`)
- `list_films` → `list_film_added` (actor = list's owner)
- `recommendations` → `recommendation_sent` (actor = `from_user_id`)

  `coven_joined` is emitted by the same trigger as #2 (after inserting `coven_members`, the trigger also inserts two `activity` rows — one for each member as the actor).

  `watchlist_added` is emitted from `watchlists` inserts *only when a per-user preference allows it* — stored as `profiles.broadcast_watchlist_adds` boolean, default FALSE. (This adds one column to `profiles`.)

**4. `reviews.status` `draft → published` → `activity`.** Separate after-update trigger fires only on the draft→published transition; uses `NEW.published_at` as `activity.created_at`. Drafts never produce activity.

**Derived data that is NOT a trigger** (computed on read):
- Follow counts, subscriber counts, review counts on profiles.
- "Is this film on my watchlist?" checks (indexed lookup on `watchlists (user_id, film_id)`).

## Testing strategy

Three layers.

**Layer 1 — Migration smoke tests (pg-mem).** `db/tests/migrations.test.ts`. Apply all migrations against in-memory pg-mem. Assert every table and index exists. <1 second. pg-mem does not enforce RLS, so these tests only prove DDL parses.

**Layer 2 — RLS policy tests (testcontainers + real Postgres).** `db/tests/rls.test.ts`. Docker-backed Postgres per run. Seed users A, B, staff S via direct `auth.users` inserts + JWT generation using the project's JWT secret. Exercise every policy:
- A's watchlist invisible to B
- A inserts follows where follower=A; insert where follower=B fails
- A cannot update B's list
- Accepted coven_request produces `coven_members` with canonicalized pair
- Draft review invisible to non-staff; staff reads only own drafts
- Recommendations world-readable but only insertable by `from_user_id`
- `activity` read-only from client perspective (direct insert attempts fail)

   Opt-in via `npm run test:rls`; required in CI, slower (~10s cold, ~3s warm).

**Layer 3 — Trigger tests.** Same testcontainers harness. For each trigger, fire the source event and assert the derived row. Covers:
- `auth.users` insert → profile row with unique handle
- `coven_requests` accept → `coven_members` + two `coven_joined` activity rows
- `lists` insert → `list_created` activity row
- `list_films` insert → `list_film_added` activity row
- `recommendations` insert → `recommendation_sent` activity row
- `watchlists` insert with `broadcast_watchlist_adds = TRUE` → activity row; with FALSE → no activity row
- `reviews` insert as draft → no activity; draft→published transition → one `review_published` row

**Tooling**
- `pg` (node-postgres) — matches the worker's driver
- `@testcontainers/postgresql` — Docker-backed Postgres, auto-cleanup
- Vitest — matches the worker's runner
- Supabase CLI not required for tests. Test code inserts into `auth.users` directly and signs JWTs with the project's secret.

**Fixtures.** `db/tests/helpers/fixtures.ts` — creates `userA`, `userB`, `staffS`, and a seed film. Callable from any test.

**Fast vs full loop**
- `npm test` (in `db/`) — pg-mem only, <1s.
- `npm run test:rls` — full RLS + trigger suite, 3–10s.

## Deferred / future

- Profile visibility tiers (public / coven-only / hermit) from the prototype — dropped for launch.
- Comment threads on reviews and lists.
- List collaborators (multi-owner lists).
- User review capability (currently editorial staff only).
- DMs — explicitly removed in an earlier design iteration.
- Multi-region storefront pricing — sub-project 2 does not pre-shape for it beyond leaving `price_history` partitionable by adding `country_code` as a future migration.

## What this spec does not produce

- A running app. UI and API land in sub-project 3.
- A notification pipeline. Schema rows in `price_alerts` and triggers on `recommendations` are producers; the consumer (email + web push) is sub-project 5.
- Realtime wire-up. The `activity` table is shape-ready for Supabase realtime subscriptions; filter-by-follow-graph logic lands in sub-project 6.

This spec ends when `db/migrations/` applies cleanly, all RLS policies are enforced and tested, and every trigger produces its derived rows correctly.
