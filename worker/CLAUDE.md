# worker/ — Price-Tracking Worker

Polls the iTunes Search API, writes `price_history`, emits `price_alerts`. Runs as a CLI or via the app's cron route at `app/api/cron/refresh-prices`.

## Commands (run from `worker/`)

```bash
npm test                          # vitest (pg-mem + MSW, no real DB or network)
npm run worker                    # one pass of price-refresh against real DB
npm run add-film -- 1468845007    # admin: upsert a film by iTunes trackId
npm run seed                      # bootstrap ~500 films from iTunes search
npm run migrate                   # apply worker/migrations/ only (bootstrap — see below)
npm run typecheck
```

**`worker/ npm run migrate` ≠ `db/ npm run migrate`.** The worker's migrations are a legacy bootstrap stub (films, price_history). The canonical production schema lives in `db/migrations/`. Only use `worker/ migrate` when standing up a fresh isolated local DB.

## Module responsibilities — one per file, don't blur

- `itunes.ts` — HTTP + parsing. `fetchPrices`, `searchFilms`, `parseFilm`, `upscaleArtworkUrl`. All iTunes API contact happens here.
- `diff.ts` — pure decisions. `computeDiff`, `shouldAlert`. No DB, no HTTP.
- `db.ts` — every SQL statement. All reads and transactional writes. **NUMERIC and BIGINT are coerced to JS numbers at this boundary** (via `numOrNull`, `Number(row.itunes_id)`). Downstream never sees strings from these columns.
- `digest.ts` — in-memory per-run stats. `render()` emits one log line.
- `worker.ts` — orchestrator. `runOnce(client, opts)` selects stalest films, fetches prices in batches of 100, diffs, writes history, fires alerts. **No raw SQL in worker.ts — all goes through `db.ts`.**
- `types.ts` — shared type definitions (`FilmRow`, `PriceHistoryRow`, `WatchlistRow`, `ParsedFilm`).
- `seed.ts` / `migrate.ts` — bootstrap only; not in the production hot path.

## NUMERIC/BIGINT coercion

Postgres returns `NUMERIC` and `BIGINT` columns as strings by default (no arbitrary-precision equivalent in JS). `db.ts` coerces at read time:

```ts
function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}
// applied on every row returned
return { ...row, itunes_id: Number(row.itunes_id) };
```

New DB reads added to `db.ts` must do the same. Do not let string-typed numbers leak into `diff.ts` or `worker.ts` — `shouldAlert` arithmetic will silently fail with `NaN`.

## Re-exports for the admin dashboard

`worker.ts` re-exports symbols that the Next.js admin dashboard imports via file dependency:

```ts
export { searchFilms, parseFilm, fetchPrices } from "./itunes.js";
export type { ParsedFilm } from "./types.js";
export { upsertFilm, insertManualFilm } from "./db.js";
export type { ManualFilmFields } from "./db.js";
```

Do not remove these re-exports without updating `app/lib/actions/admin/films.ts`.

## Tests

Tests use pg-mem (no real DB) and MSW (no real network). They run fast and don't need env vars. The `worker/tests/helpers/db.ts` helper registers `pgcrypto` with pg-mem since `CREATE EXTENSION pgcrypto` would otherwise throw (pg-mem 3.0.4 doesn't silently no-op unknown extensions).
