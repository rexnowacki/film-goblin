-- 0154_editorial_starter_picks.sql
--
-- Editorial starter pack for the FYP cold-start fallback (sub-project #35).
-- Apply AFTER mig 0154 lands.
--
-- Twenty representative films selected for first-time-user surfacing on
-- /for-you when the user has no coven bonds, no lanes set, and no behavior
-- signals. List is editorial; revisit as the catalog grows.
-- Spec: docs/superpowers/specs/2026-05-02-fyp-recommender-design.md
--
-- Titles verified against prod catalog 2026-05-02. If any title fails to
-- match (catalog re-indexed, title rewritten, etc.) the UPDATE is a no-op
-- for that row — re-verify with the title-presence check from plan Task 2
-- before re-running.

UPDATE films SET editorial_starter = TRUE WHERE title IN (
  'Hereditary',
  'The Witch',
  'Suspiria',
  'Possession',
  'The Thing',
  'Midsommar',
  'The Babadook',
  'A Dark Song',
  'Mandy',
  'The Lighthouse (2019)',
  'Color Out of Space',
  'In Fabric',
  'When Evil Lurks',
  'Inferno',
  'Deep Red',
  'Onibaba',
  'Picnic at Hanging Rock',
  'The Wicker Man - Final Cut (1973)',
  'Late Night with the Devil',
  'Barbarian'
);
