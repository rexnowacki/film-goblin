# db/migrations/ — Migration History

Files are named `0NNN_description.sql` and applied in lexicographic order.

## Feature → migration range map

| Range | Area |
|-------|------|
| 0100–0109 | Core schema: films, price_history, price_alerts, watchlists (canonical) |
| 0110–0119 | Social graph: follows, profiles, coven_members, activity |
| 0120–0129 | User collections: library, watched, reviews |
| 0130–0139 | Profile features: avatars, handle→username rename, onboarding |
| 0140–0149 | Feed + recommendations: activity_comments, threading, rate reminders |
| 0150–0159 | Catalog enrichment: trailers, tags, tagging system v2, announcements |
| 0160–0169 | Discovery: local haunts/theaters, notifications, goblin pick |
| 0170–0179 | Social gate: film requests, invite codes, must_change_password, iTunes availability |
| 0180–0189 | Ritual system: film cast, goblin pick schedule/messages/summon, notification dedupe |
| 0190–0199 | Infrastructure: rate limits, streaming providers |

## Adding a migration

1. Pick the next available number (check `ls db/migrations/ | tail -5`)
2. Name it `0NNN_short_description.sql`
3. Test locally: `npm run migrate` from `db/` with `DATABASE_URL` set
4. Run `npm test` from `db/` to confirm pg-mem smoke still passes
5. Run `npm run test:rls` if the migration touches RLS policies or triggers

If your migration uses constructs pg-mem can't parse (see `db/CLAUDE.md`), add the appropriate skip in `db/tests/helpers/pg-mem.ts`.

## Production apply

Connect via the session-mode pooler (not direct — IPv6-only, unreachable locally). Connection string in `passwords.txt` at repo root. Source env before running:

```bash
set -a; source app/.env.local; set +a
cd db && npm run migrate
```
