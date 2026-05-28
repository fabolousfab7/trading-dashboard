-- Async Flex report: store pending reference code between sync passes
ALTER TABLE ibkr_config ADD COLUMN IF NOT EXISTS pending_reference_code text;
ALTER TABLE ibkr_config ADD COLUMN IF NOT EXISTS pending_requested_at timestamptz;
