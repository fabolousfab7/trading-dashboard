-- Kraken Futures API configuration (separate from Spot)
CREATE TABLE IF NOT EXISTS kraken_futures_config (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  api_secret TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE kraken_futures_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON kraken_futures_config
  FOR ALL TO service_role USING (true);

CREATE POLICY "Users access own futures config" ON kraken_futures_config
  FOR ALL TO authenticated
  USING (account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid()))
  WITH CHECK (account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid()));
