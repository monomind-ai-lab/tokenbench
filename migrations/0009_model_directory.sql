-- Durable model identities and validated profile snapshots outlive any one
-- revision-scoped benchmark publication. Publication code writes membership and
-- profile rows before changing directory status so partial candidates cannot
-- archive or delete retained models.
CREATE TABLE IF NOT EXISTS benchmark_model_directory (
  model_key TEXT PRIMARY KEY CHECK (length(trim(model_key)) > 0),
  canonical_slug TEXT NOT NULL UNIQUE CHECK (length(trim(canonical_slug)) > 0),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  creator TEXT NOT NULL CHECK (length(trim(creator)) > 0),
  source_type TEXT NOT NULL CHECK (source_type IN ('Proprietary', 'Open Weight', 'Unknown')),
  reasoning_type TEXT,
  family_id TEXT,
  variant_id TEXT,
  first_seen_revision TEXT NOT NULL CHECK (length(trim(first_seen_revision)) > 0),
  first_seen_at TEXT NOT NULL,
  last_seen_revision TEXT NOT NULL CHECK (length(trim(last_seen_revision)) > 0),
  last_seen_at TEXT NOT NULL,
  latest_profile_revision TEXT NOT NULL CHECK (length(trim(latest_profile_revision)) > 0),
  status TEXT NOT NULL CHECK (status IN ('current', 'archived')),
  source_id TEXT NOT NULL CHECK (source_id IN ('benchlm', 'lmarena', 'litellm', 'openrouter')),
  source_model_id TEXT NOT NULL CHECK (length(trim(source_model_id)) > 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS benchmark_model_profile_snapshots (
  model_key TEXT NOT NULL CHECK (length(trim(model_key)) > 0),
  revision TEXT NOT NULL CHECK (length(trim(revision)) > 0),
  profile_json TEXT NOT NULL CHECK (
    length(profile_json) > 0
    AND length(CAST(profile_json AS BLOB)) <= 524288
    AND json_valid(profile_json)
  ),
  content_hash TEXT NOT NULL CHECK (
    length(content_hash) = 71
    AND substr(content_hash, 1, 7) = 'sha256:'
    AND substr(content_hash, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  generated_at TEXT NOT NULL,
  PRIMARY KEY (model_key, revision)
);

CREATE TABLE IF NOT EXISTS benchmark_model_revision_membership (
  revision TEXT NOT NULL CHECK (length(trim(revision)) > 0),
  model_key TEXT NOT NULL CHECK (length(trim(model_key)) > 0),
  PRIMARY KEY (revision, model_key)
);

CREATE TABLE IF NOT EXISTS benchmark_model_slug_aliases (
  alias_slug TEXT PRIMARY KEY CHECK (length(trim(alias_slug)) > 0),
  model_key TEXT NOT NULL CHECK (length(trim(model_key)) > 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS benchmark_popular_model_weeks (
  week_start TEXT PRIMARY KEY,
  benchmark_revision TEXT NOT NULL CHECK (length(trim(benchmark_revision)) > 0),
  source_snapshot_id TEXT NOT NULL CHECK (length(trim(source_snapshot_id)) > 0),
  methodology_version TEXT NOT NULL CHECK (length(trim(methodology_version)) > 0),
  generated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS benchmark_popular_model_ranks (
  week_start TEXT NOT NULL,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 100),
  model_key TEXT NOT NULL CHECK (length(trim(model_key)) > 0),
  PRIMARY KEY (week_start, rank),
  UNIQUE (week_start, model_key)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_model_directory_status_creator_source
  ON benchmark_model_directory (status, creator, source_type);
CREATE INDEX IF NOT EXISTS idx_benchmark_model_directory_canonical_slug
  ON benchmark_model_directory (canonical_slug);
CREATE INDEX IF NOT EXISTS idx_benchmark_model_directory_latest_profile
  ON benchmark_model_directory (latest_profile_revision);
CREATE INDEX IF NOT EXISTS idx_benchmark_model_directory_sitemap
  ON benchmark_model_directory (status, updated_at DESC, canonical_slug);
CREATE INDEX IF NOT EXISTS idx_benchmark_model_revision_membership_model
  ON benchmark_model_revision_membership (model_key, revision);
CREATE INDEX IF NOT EXISTS idx_benchmark_model_slug_aliases_model
  ON benchmark_model_slug_aliases (model_key);
CREATE INDEX IF NOT EXISTS idx_benchmark_popular_model_ranks_model
  ON benchmark_popular_model_ranks (model_key, week_start);
