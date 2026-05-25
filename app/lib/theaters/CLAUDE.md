# app/lib/theaters/ — Theater Showings Scraper

Scrapes local theater listings, matches films against user watchlists/grimoires, and fires notifications. Consumed by `app/api/cron/theater-alerts`.

## File map

- `scrape-theaters.ts` — orchestrates scraping; calls each provider in `providers/`
- `providers/` — one file per theater (currently `guild.ts`, `loft.ts`); exports a scraper function matching the interface in `providers/index.ts`
- `html.ts` — HTML parsing utilities shared by providers
- `match-showings.ts` — fuzzy-matches scraped titles against `films` rows
- `normalize-title.ts` — normalizes titles for comparison (strips articles, punctuation, etc.)
- `upsert-showings.ts` — writes matched showings to `theater_showings` table
- `create-theater-notifications.ts` — emits notifications for users whose watchlisted films have showings
- `source-hash.ts` — hashes raw HTML for change detection (skip upsert if source unchanged)
- `date-label.ts` — formats screening dates for display
- `lock.ts` — `acquireCronLock` prevents concurrent cron invocations from double-firing

## Adding a new theater provider

1. Create `providers/<name>.ts` exporting a function that matches the `TheaterScraper` interface in `providers/index.ts`
2. Register it in `providers/index.ts`
3. Add a row to the `theaters` table via migration

The scraper function receives no arguments and returns `ScrapedShowing[]`. All HTTP fetching happens inside the provider.

## Cron schedule

The theater-alerts cron (`Mon/Thu 14:00 UTC`) was dropped from the Vercel schedule due to the Hobby plan cron cap. Trigger manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://film-goblin.vercel.app/api/cron/theater-alerts
```

The `acquireCronLock` in `lock.ts` makes concurrent invocations safe — a second call while one is running is a no-op.
