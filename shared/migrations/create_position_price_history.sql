CREATE TABLE IF NOT EXISTS position_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  asset_class text NOT NULL,
  price_date date NOT NULL,
  market_price numeric NOT NULL,
  currency text NOT NULL,
  fx_rate_to_eur numeric,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticker, price_date)
);

CREATE INDEX IF NOT EXISTS idx_pph_ticker_date ON position_price_history (ticker, price_date DESC);

ALTER TABLE position_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON position_price_history
  FOR ALL TO service_role USING (true);

CREATE POLICY "Authenticated read access" ON position_price_history
  FOR SELECT TO authenticated USING (true);
