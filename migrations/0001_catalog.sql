-- Immutable catalog records are scoped to a revision; only one revision is published.
CREATE TABLE IF NOT EXISTS catalog_revisions (
  revision TEXT PRIMARY KEY,
  published_at TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  publication_state TEXT NOT NULL CHECK (publication_state IN ('pending', 'published', 'superseded', 'failed'))
);
CREATE INDEX IF NOT EXISTS idx_catalog_revisions_published ON catalog_revisions (publication_state, published_at DESC);

CREATE TABLE IF NOT EXISTS source_records (
  revision TEXT NOT NULL REFERENCES catalog_revisions(revision),
  id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('official_json', 'manual_manifest')),
  confidence TEXT NOT NULL CHECK (confidence IN ('official', 'manual_verified')),
  snapshot_key TEXT,
  PRIMARY KEY (revision, id)
);
CREATE INDEX IF NOT EXISTS idx_source_records_revision_provider ON source_records (revision, provider_id);

CREATE TABLE IF NOT EXISTS plan_offers (
  revision TEXT NOT NULL REFERENCES catalog_revisions(revision),
  id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  monthly_cost_micro_dollars INTEGER NOT NULL CHECK (monthly_cost_micro_dollars >= 0),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  entitlement_json TEXT NOT NULL,
  source_id TEXT NOT NULL,
  PRIMARY KEY (revision, id)
);
CREATE INDEX IF NOT EXISTS idx_plan_offers_revision_provider ON plan_offers (revision, provider_id);

CREATE TABLE IF NOT EXISTS model_offers (
  revision TEXT NOT NULL REFERENCES catalog_revisions(revision),
  id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  model_id TEXT NOT NULL,
  pricing_basis TEXT NOT NULL CHECK (pricing_basis IN ('direct_provider_api', 'openrouter', 'opencode_zen')),
  route TEXT NOT NULL CHECK (route IN ('direct_provider', 'openrouter', 'opencode_zen')),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  unit TEXT NOT NULL CHECK (unit = 'micro_dollars_per_million_tokens'),
  input_micro_dollars_per_million INTEGER NOT NULL CHECK (input_micro_dollars_per_million >= 0),
  cached_input_micro_dollars_per_million INTEGER CHECK (cached_input_micro_dollars_per_million >= 0),
  output_micro_dollars_per_million INTEGER NOT NULL CHECK (output_micro_dollars_per_million >= 0),
  source_id TEXT NOT NULL,
  PRIMARY KEY (revision, id)
);
CREATE INDEX IF NOT EXISTS idx_model_offers_revision_provider ON model_offers (revision, provider_id);

CREATE TABLE IF NOT EXISTS source_refresh_state (
  source_id TEXT PRIMARY KEY,
  last_success_at TEXT,
  last_revision TEXT REFERENCES catalog_revisions(revision),
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS catalog_publication_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  active_revision TEXT REFERENCES catalog_revisions(revision),
  updated_at TEXT NOT NULL
);
