-- Materialized API responses keep Pages requests inside the Workers Free CPU
-- budget. Producers write every immutable entry for a revision before moving
-- the scope pointer, so a failed refresh leaves the previous response set
-- active and complete.
CREATE TABLE IF NOT EXISTS api_response_revisions (
  scope TEXT NOT NULL CHECK (scope IN ('catalog', 'benchmarks')),
  revision TEXT NOT NULL CHECK (length(trim(revision)) > 0),
  checked_at TEXT NOT NULL,
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope, revision)
);

CREATE TABLE IF NOT EXISTS api_response_entries (
  scope TEXT NOT NULL CHECK (scope IN ('catalog', 'benchmarks')),
  revision TEXT NOT NULL CHECK (length(trim(revision)) > 0),
  cache_key TEXT NOT NULL CHECK (length(trim(cache_key)) > 0),
  variant TEXT NOT NULL CHECK (variant IN ('fresh', 'stale')),
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  etag TEXT NOT NULL CHECK (length(trim(etag)) > 0),
  body TEXT NOT NULL CHECK (length(body) > 0),
  PRIMARY KEY (scope, revision, cache_key, variant, chunk_index),
  FOREIGN KEY (scope, revision)
    REFERENCES api_response_revisions(scope, revision)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_api_response_entries_lookup
  ON api_response_entries (scope, cache_key, variant, revision, chunk_index);

CREATE TABLE IF NOT EXISTS api_response_publication_state (
  scope TEXT PRIMARY KEY CHECK (scope IN ('catalog', 'benchmarks')),
  active_revision TEXT NOT NULL CHECK (length(trim(active_revision)) > 0),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (scope, active_revision)
    REFERENCES api_response_revisions(scope, revision)
);

-- Targeted model and comparison readers select pairs by either side of a
-- canonical pair. The sitemap also filters to indexable pairs before emitting
-- binary pair-slug order, so retain that order in its index rather than sorting
-- the full active-revision pair set.
CREATE INDEX IF NOT EXISTS idx_benchmark_comparison_pairs_revision_model_a_key
  ON benchmark_comparison_pairs (revision, model_a_key);
CREATE INDEX IF NOT EXISTS idx_benchmark_comparison_pairs_revision_model_b_key
  ON benchmark_comparison_pairs (revision, model_b_key);
CREATE INDEX IF NOT EXISTS idx_benchmark_comparison_pairs_revision_indexable_pair_slug
  ON benchmark_comparison_pairs (revision, indexable, pair_slug COLLATE BINARY);
