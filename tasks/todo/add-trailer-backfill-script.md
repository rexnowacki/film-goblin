---
title: Add checked-in TMDB trailer backfill script
owner: unclaimed
priority: medium
created: 2026-05-11
---

## Goal

Replace ad hoc production `node -e` trailer backfills with a checked-in script
that can be run locally against production intentionally.

## Acceptance

- Script supports dry-run by default.
- Script requires explicit `--write` to update rows.
- Script prints scanned/resolved/updated/missing/failed counts.
- Script uses the same trailer enrichment library as the admin action.

## Notes

This should live in a clear ops/scripts location and document required env vars:
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TMDB_API_KEY`.
