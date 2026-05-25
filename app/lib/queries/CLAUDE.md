# app/lib/queries/ — Read-Side DB Helpers

One file per aggregate. These are pure read functions — no mutations, no `revalidatePath`.

## Client injection pattern

Every function takes `client: SupabaseClient<Database>` as its first argument — never calls `createClient()` internally. This makes them testable in isolation and reusable from both server components and server actions.

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function getMyThing(client: Client, id: string) { ... }
```

Callers (server components, actions) create the client and pass it in.

## `films_with_stats` view

- Always specify columns explicitly — never `select("*")` on this view.
- Add new columns at the END of the `CREATE VIEW` statement. Existing consumers use explicit column lists, so append-only changes are non-breaking.
- The view is defined as `DROP VIEW IF EXISTS … CREATE VIEW …` in each migration that touches it. If you see a query returning `null` for a column that should have a value, check whether the view definition in the latest migration includes that column.

## PostgREST nested embeds

`.select("film:films!inner(…)")` always returns one row but generated types sometimes emit `T[]`. Cast at the **prop boundary** where the data is passed to a component, not at the query:

```ts
// in a query file — return the typed data as-is
return data;

// in the server component that passes it to JSX — cast at the prop
<FilmPoster film={row.film as never} />
```

## `coven_members` is a directed graph edge table

Schema: `(user_a_id, user_b_id, created_at)` with `user_a_id < user_b_id` CHECK constraint.

To check if users A and B are coven mates, you must check both directions:
```sql
(cm.user_a_id = A AND cm.user_b_id = B)
OR (cm.user_a_id = B AND cm.user_b_id = A)
```

When inserting in tests, use the `bond(client, x, y)` helper in `db/tests/rls/` which swaps args to satisfy the invariant automatically.

## FYP recommender

The For You Page feed lives in `fyp/`. See `fyp/CLAUDE.md` for v3 architecture and tuning constants. Don't touch the scoring constants without reading that file first.

## Pagination cursors

- Activity feed: `created_at`-based cursor (ISO timestamp string)
- FYP feed: rank-offset cursor (stringified integer, e.g. `"20"` = skip first 20)

These are different shapes — don't mix them.
