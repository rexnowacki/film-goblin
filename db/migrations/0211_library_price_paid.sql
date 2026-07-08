-- 0211_library_price_paid.sql
-- The Claiming (spec 2026-07-07-buy-claim-loop): record what the user paid
-- when they confirm a purchase from the return-prompt. Nullable — manual
-- grimoire adds and all existing rows leave it NULL. Price paid is
-- coven-visible alongside the row via the existing library_select policy
-- (accepted deliberately in the spec). RLS change: library previously had
-- only SELECT/INSERT/DELETE for authenticated — the fill-null-price path
-- (_confirmPurchase in app/lib/actions/library.ts) needs an owner-only
-- UPDATE policy + grant, added below.
ALTER TABLE library ADD COLUMN price_paid_usd NUMERIC(6,2);

CREATE POLICY library_update ON library
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT UPDATE ON library TO authenticated;
