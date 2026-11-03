CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blocks (
  number BIGINT PRIMARY KEY,
  hash TEXT NOT NULL,
  parent_hash TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  gas_limit TEXT NOT NULL,
  gas_used TEXT NOT NULL,
  base_fee_per_gas TEXT NOT NULL,
  blob_gas_used TEXT,
  excess_blob_gas TEXT,
  blob_base_fee TEXT,
  tx_count INTEGER NOT NULL,
  receipts_complete BOOLEAN NOT NULL,
  canonical BOOLEAN NOT NULL DEFAULT TRUE,
  confirmation TEXT NOT NULL,
  synthetic BOOLEAN NOT NULL,
  miner TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS blocks_hash_idx ON blocks(hash);
CREATE INDEX IF NOT EXISTS blocks_ts_idx ON blocks(timestamp) WHERE canonical;

CREATE TABLE IF NOT EXISTS transactions (
  hash TEXT PRIMARY KEY,
  block_number BIGINT NOT NULL REFERENCES blocks(number) ON DELETE CASCADE,
  tx_index INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT,
  value_wei TEXT NOT NULL,
  gas_limit TEXT NOT NULL,
  gas_used TEXT NOT NULL,
  effective_gas_price TEXT NOT NULL,
  max_fee_per_gas TEXT,
  max_priority_fee_per_gas TEXT,
  base_fee_per_gas TEXT NOT NULL,
  execution_fee_wei TEXT NOT NULL,
  base_burn_wei TEXT NOT NULL,
  tip_wei TEXT NOT NULL,
  blob_gas_used TEXT,
  blob_gas_price TEXT,
  blob_fee_wei TEXT,
  tx_type INTEGER NOT NULL,
  status SMALLINT NOT NULL,
  selector TEXT,
  method_signature TEXT,
  method_source TEXT,
  category TEXT NOT NULL,
  category_confidence TEXT NOT NULL,
  category_provenance TEXT NOT NULL,
  classification TEXT NOT NULL,
  synthetic BOOLEAN NOT NULL,
  input_size INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS tx_block_idx ON transactions(block_number);
CREATE INDEX IF NOT EXISTS tx_from_ts_idx ON transactions(from_address, timestamp);
CREATE INDEX IF NOT EXISTS tx_to_ts_idx ON transactions(to_address, timestamp);
CREATE INDEX IF NOT EXISTS tx_category_ts_idx ON transactions(category, timestamp);
CREATE INDEX IF NOT EXISTS tx_selector_idx ON transactions(selector);

CREATE TABLE IF NOT EXISTS buckets (
  resolution TEXT NOT NULL,
  bucket_start INTEGER NOT NULL,
  block_start BIGINT NOT NULL,
  block_end BIGINT NOT NULL,
  base_fee_open TEXT NOT NULL,
  base_fee_close TEXT NOT NULL,
  gas_used TEXT NOT NULL,
  gas_target TEXT NOT NULL,
  tx_count INTEGER NOT NULL,
  blocks_above INTEGER NOT NULL,
  blocks_below INTEGER NOT NULL,
  burn_wei TEXT NOT NULL,
  tip_wei TEXT NOT NULL,
  PRIMARY KEY (resolution, bucket_start)
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  last_block BIGINT,
  last_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  config JSONB NOT NULL,
  enabled BOOLEAN NOT NULL,
  cooldown_sec INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_firings (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL,
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  delivery JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS alert_episode_idx ON alert_firings(rule_id, dedupe_key);

CREATE TABLE IF NOT EXISTS labels (
  address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  source TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (address, chain_id, source)
);
