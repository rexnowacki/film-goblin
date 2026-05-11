---
title: Extract trailer enrichment from admin film actions
owner: unclaimed
priority: high
created: 2026-05-11
---

## Goal

Move TMDB trailer lookup, payload mapping, and backfill orchestration out of
`app/lib/actions/admin/films.ts` into a dedicated server-safe library module.

## Acceptance

- `admin/films.ts` remains focused on film CRUD and delegates trailer work.
- Existing create-film auto-enrichment behavior is unchanged.
- Existing admin backfill button behavior is unchanged.
- `npm run typecheck` and focused trailer tests pass.

## Notes

The current behavior resolves TMDB by exact normalized title + year when a film
does not already have `tmdb_id`, then stores `tmdb_id` plus YouTube trailer
metadata.
