-- Owner-scoped snoozes for the single "Next in the Pit" return contract.

CREATE TABLE return_contract_deferrals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_key  text NOT NULL CHECK (char_length(contract_key) BETWEEN 1 AND 160),
  deferred_until timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (deferred_until > created_at),
  UNIQUE (user_id, contract_key)
);

CREATE INDEX return_contract_deferrals_user_until_idx
  ON return_contract_deferrals (user_id, deferred_until DESC);

ALTER TABLE return_contract_deferrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY return_contract_deferrals_select_own ON return_contract_deferrals
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY return_contract_deferrals_insert_own ON return_contract_deferrals
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY return_contract_deferrals_update_own ON return_contract_deferrals
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY return_contract_deferrals_delete_own ON return_contract_deferrals
  FOR DELETE TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON return_contract_deferrals FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON return_contract_deferrals TO authenticated;
