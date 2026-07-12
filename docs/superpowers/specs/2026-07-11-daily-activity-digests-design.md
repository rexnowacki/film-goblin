# Daily Activity Digests — Design

**Date:** 2026-07-11
**Status:** Approved
**Sub-project:** Prevent one user's bulk watch/save activity from flooding Coven timelines.

## Problem

The feed fetches 20 raw activity rows and groups afterward. Production data from the
`cthulhu.lemon` Coven feed showed `el_dritch` producing 57 watch/save rows in 24 hours: 43
`watch_logged`, 8 `watchlist_added`, and 6 `library_added`. The existing 30-minute grouping
still rendered nine cards, and the raw-row pagination window let the burst crowd older Coven
activity out before grouping.

## Decision summary

| Decision | Choice |
|---|---|
| Time boundary | Fixed UTC calendar day |
| Save treatment | One combined hoard digest per actor/day for watchlist + grimoire additions |
| Watch treatment | One watched digest per actor/day |
| Conversations | Any activity with comments stays standalone |
| High-signal activity | Recommendations, reviews, Gazings, Coven changes, and other kinds remain standalone |
| Pagination | Automatically backfill raw pages until roughly 20 rendered cards exist or the source is exhausted |
| Schema | No migration; read-time aggregation only |

## 1. Grouping contract

`groupFeed` aggregates eligible rows globally by `actor.id + UTC day + digest kind`, regardless
of other actors or activity kinds interleaved in the raw timeline. `watchlist_added` and
`library_added` share the synthetic `hoard_added` digest kind. `watch_logged` forms its own
digest. A bucket with only one eligible row remains a normal activity card.

Digest keys use actor, digest kind, and UTC day so they remain stable as more same-day rows
arrive or older raw pages load. Items inside a digest remain newest-first. Digest cards and
standalone rows are sorted together by their latest timestamp.

Comment-bearing rows are excluded from aggregation and remain standalone so their conversation
entry point is never hidden. Notes, verdicts, reactions, and film metadata remain attached to
the expanded watched rows.

## 2. UI contract

The watched digest retains the current expandable poster stack. The hoard digest summarizes
all same-day saves and expands into separate Watchlist and Grimoire sections, each rendering
the existing activity-row component for that kind. Utility surfaces continue to show the bare
username.

## 3. Pagination contract

The database cursor remains the oldest raw row timestamp. After each client grouping pass, the
feed checks the number of rendered cards for the active tab. If fewer than 20 are available and
the raw source has another cursor, it immediately loads another raw page. The loop stops at 20
rendered cards, source exhaustion, or an in-flight request. This preserves the existing RLS-bound
query and cursor model while preventing collapsed bursts from starving the visible page.

## 4. Testing

- Pure grouping tests cover UTC boundaries, interleaved actors, combined hoard sections,
  comment preservation, stable keys, and the observed 43/8/6 production-shaped burst collapsing
  to two digest cards.
- Pure backfill tests cover below-target loading, target/source/loading stops, and Pit exclusion.
- Full app tests, typecheck, and production build gate the PR.

## Out of scope

- Storing materialized digest rows or deleting source activity.
- Per-user timezone buckets; the product does not track user timezones.
- Grouping recommendations, reviews, Gazings, comments, or Coven relationship events.
- Changing activity RLS or database schema.
