-- 0211_library_price_paid.sql
-- The Claiming (spec 2026-07-07-buy-claim-loop): record what the user paid
-- when they confirm a purchase from the return-prompt. Nullable — manual
-- grimoire adds and all existing rows leave it NULL. No RLS change: the
-- existing library_select policy covers the column (price paid is
-- coven-visible alongside the row, accepted deliberately in the spec).
ALTER TABLE library ADD COLUMN price_paid_usd NUMERIC(6,2);
