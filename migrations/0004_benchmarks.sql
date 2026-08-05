-- Benchmark evidence is immutable and revision-scoped. Publication is switched
-- through benchmark_publication_state only after a complete D1 batch succeeds.
CREATE TABLE IF NOT EXISTS benchmark_revisions (
  revision TEXT PRIMARY KEY CHECK (length(trim(revision)) > 0),
  generated_at TEXT NOT NULL,
  published_at TEXT,
  checked_at TEXT NOT NULL,
  publication_state TEXT NOT NULL CHECK (publication_state IN ('pending', 'published', 'superseded', 'failed')),
  content_hash TEXT NOT NULL CHECK (length(trim(content_hash)) > 0),
  catalog_revision TEXT NOT NULL REFERENCES catalog_revisions(revision),
  openrouter_content_hash TEXT NOT NULL CHECK (length(trim(openrouter_content_hash)) > 0),
  CHECK ((publication_state = 'published' AND published_at IS NOT NULL) OR publication_state <> 'published')
);
CREATE INDEX IF NOT EXISTS idx_benchmark_revisions_publication
  ON benchmark_revisions (publication_state, published_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_benchmark_revisions_single_published
  ON benchmark_revisions (publication_state) WHERE publication_state = 'published';

CREATE TABLE IF NOT EXISTS benchmark_source_records (
  revision TEXT NOT NULL REFERENCES benchmark_revisions(revision),
  source_id TEXT NOT NULL CHECK (source_id IN ('benchlm', 'lmarena', 'litellm', 'openrouter')),
  artifact_id TEXT NOT NULL CHECK (length(trim(artifact_id)) > 0),
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
  observed_at TEXT NOT NULL,
  etag TEXT,
  last_modified TEXT,
  upstream_revision TEXT,
  schema_version TEXT,
  snapshot_key TEXT NOT NULL CHECK (length(trim(snapshot_key)) > 0),
  content_hash TEXT NOT NULL CHECK (length(trim(content_hash)) > 0),
  license_id TEXT NOT NULL CHECK (license_id IN ('MIT', 'CC-BY-4.0', 'OpenRouter-ToS')),
  attribution_text TEXT NOT NULL CHECK (length(trim(attribution_text)) > 0),
  PRIMARY KEY (revision, source_id, artifact_id),
  CHECK (
    (source_id IN ('benchlm', 'litellm') AND license_id = 'MIT')
    OR (source_id = 'lmarena' AND license_id = 'CC-BY-4.0')
    OR (source_id = 'openrouter' AND license_id = 'OpenRouter-ToS')
  )
);
CREATE INDEX IF NOT EXISTS idx_benchmark_source_records_revision_source
  ON benchmark_source_records (revision, source_id);

CREATE TABLE IF NOT EXISTS benchmark_models (
  revision TEXT NOT NULL REFERENCES benchmark_revisions(revision),
  model_key TEXT NOT NULL CHECK (length(trim(model_key)) > 0),
  slug TEXT NOT NULL CHECK (length(trim(slug)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  creator TEXT NOT NULL CHECK (length(trim(creator)) > 0),
  source_type TEXT NOT NULL CHECK (source_type IN ('Proprietary', 'Open Weight', 'Unknown')),
  reasoning_type TEXT,
  release_date TEXT,
  context_window_tokens INTEGER CHECK (context_window_tokens IS NULL OR context_window_tokens >= 0),
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('supported', 'estimated', 'source_only')),
  ranking_eligible INTEGER NOT NULL CHECK (ranking_eligible IN (0, 1)),
  confidence_lower REAL,
  confidence_upper REAL,
  benchmark_count INTEGER NOT NULL CHECK (benchmark_count >= 0),
  source_id TEXT NOT NULL CHECK (source_id IN ('benchlm', 'lmarena', 'litellm', 'openrouter')),
  source_model_id TEXT NOT NULL CHECK (length(trim(source_model_id)) > 0),
  source_artifact_id TEXT NOT NULL CHECK (length(trim(source_artifact_id)) > 0),
  PRIMARY KEY (revision, model_key),
  UNIQUE (revision, slug),
  FOREIGN KEY (revision, source_id, source_artifact_id)
    REFERENCES benchmark_source_records(revision, source_id, artifact_id),
  CHECK (
    (confidence_lower IS NULL AND confidence_upper IS NULL)
    OR (confidence_lower IS NOT NULL AND confidence_upper IS NOT NULL AND confidence_lower <= confidence_upper)
  )
);
CREATE INDEX IF NOT EXISTS idx_benchmark_models_revision_slug
  ON benchmark_models (revision, slug);

CREATE TABLE IF NOT EXISTS benchmark_metrics (
  revision TEXT NOT NULL REFERENCES benchmark_revisions(revision),
  model_key TEXT NOT NULL CHECK (length(trim(model_key)) > 0),
  metric_key TEXT NOT NULL CHECK (length(trim(metric_key)) > 0),
  category TEXT NOT NULL CHECK (length(trim(category)) > 0),
  value REAL NOT NULL CHECK (typeof(value) IN ('integer', 'real') AND value = value),
  rank INTEGER CHECK (rank IS NULL OR (typeof(rank) = 'integer' AND rank > 0)),
  lower_bound REAL,
  upper_bound REAL,
  vote_count INTEGER CHECK (vote_count IS NULL OR (typeof(vote_count) = 'integer' AND vote_count >= 0)),
  unit TEXT NOT NULL CHECK (unit IN ('score', 'arena_score', 'rank', 'usd_per_million_tokens', 'tokens')),
  source_id TEXT NOT NULL CHECK (source_id IN ('benchlm', 'lmarena', 'litellm', 'openrouter')),
  source_updated_at TEXT NOT NULL,
  source_model_id TEXT NOT NULL CHECK (length(trim(source_model_id)) > 0),
  source_artifact_id TEXT NOT NULL CHECK (length(trim(source_artifact_id)) > 0),
  ranking_eligible INTEGER NOT NULL CHECK (ranking_eligible IN (0, 1)),
  methodology TEXT NOT NULL CHECK (methodology IN ('benchlm_raw_composite', 'bradley_terry', 'ips')),
  observation_count INTEGER CHECK (observation_count IS NULL OR (typeof(observation_count) = 'integer' AND observation_count >= 0)),
  session_count INTEGER CHECK (session_count IS NULL OR (typeof(session_count) = 'integer' AND session_count >= 0)),
  PRIMARY KEY (revision, model_key, metric_key),
  FOREIGN KEY (revision, model_key) REFERENCES benchmark_models(revision, model_key),
  FOREIGN KEY (revision, source_id, source_artifact_id)
    REFERENCES benchmark_source_records(revision, source_id, artifact_id),
  CHECK (
    (lower_bound IS NULL AND upper_bound IS NULL)
    OR (lower_bound IS NOT NULL AND upper_bound IS NOT NULL AND lower_bound <= upper_bound)
  )
);
CREATE INDEX IF NOT EXISTS idx_benchmark_metrics_revision_category_rank
  ON benchmark_metrics (revision, category, rank);
CREATE INDEX IF NOT EXISTS idx_benchmark_metrics_revision_model_key
  ON benchmark_metrics (revision, model_key);

CREATE TABLE IF NOT EXISTS benchmark_price_checks (
  revision TEXT NOT NULL REFERENCES benchmark_revisions(revision),
  model_key TEXT NOT NULL CHECK (length(trim(model_key)) > 0),
  source_id TEXT NOT NULL CHECK (source_id IN ('benchlm', 'lmarena', 'litellm', 'openrouter')),
  provider_id TEXT NOT NULL CHECK (length(trim(provider_id)) > 0),
  route_id TEXT NOT NULL CHECK (length(trim(route_id)) > 0),
  source_model_id TEXT NOT NULL CHECK (length(trim(source_model_id)) > 0),
  canonical_slug TEXT,
  input_usd_per_million REAL CHECK (input_usd_per_million IS NULL OR (typeof(input_usd_per_million) IN ('integer', 'real') AND input_usd_per_million = input_usd_per_million AND input_usd_per_million >= 0)),
  cached_input_usd_per_million REAL CHECK (cached_input_usd_per_million IS NULL OR (typeof(cached_input_usd_per_million) IN ('integer', 'real') AND cached_input_usd_per_million = cached_input_usd_per_million AND cached_input_usd_per_million >= 0)),
  output_usd_per_million REAL CHECK (output_usd_per_million IS NULL OR (typeof(output_usd_per_million) IN ('integer', 'real') AND output_usd_per_million = output_usd_per_million AND output_usd_per_million >= 0)),
  context_window_tokens INTEGER CHECK (context_window_tokens IS NULL OR (typeof(context_window_tokens) = 'integer' AND context_window_tokens >= 0)),
  max_input_tokens INTEGER CHECK (max_input_tokens IS NULL OR (typeof(max_input_tokens) = 'integer' AND max_input_tokens >= 0)),
  max_output_tokens INTEGER CHECK (max_output_tokens IS NULL OR (typeof(max_output_tokens) = 'integer' AND max_output_tokens >= 0)),
  input_modalities_json TEXT CHECK (input_modalities_json IS NULL OR (json_valid(input_modalities_json) AND json_type(input_modalities_json) = 'array')),
  output_modalities_json TEXT CHECK (output_modalities_json IS NULL OR (json_valid(output_modalities_json) AND json_type(output_modalities_json) = 'array')),
  supported_parameters_json TEXT CHECK (supported_parameters_json IS NULL OR (json_valid(supported_parameters_json) AND json_type(supported_parameters_json) = 'array')),
  source_artifact_id TEXT NOT NULL CHECK (length(trim(source_artifact_id)) > 0),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('primary', 'corroborating', 'conflict')),
  PRIMARY KEY (revision, model_key, source_id, provider_id, route_id),
  FOREIGN KEY (revision, model_key) REFERENCES benchmark_models(revision, model_key),
  FOREIGN KEY (revision, source_id, source_artifact_id)
    REFERENCES benchmark_source_records(revision, source_id, artifact_id)
);
CREATE INDEX IF NOT EXISTS idx_benchmark_price_checks_revision_model_key
  ON benchmark_price_checks (revision, model_key);

CREATE TABLE IF NOT EXISTS benchmark_comparison_pairs (
  revision TEXT NOT NULL REFERENCES benchmark_revisions(revision),
  pair_slug TEXT NOT NULL CHECK (length(trim(pair_slug)) > 0),
  model_a_key TEXT NOT NULL CHECK (length(trim(model_a_key)) > 0),
  model_b_key TEXT NOT NULL CHECK (length(trim(model_b_key)) > 0),
  indexable INTEGER NOT NULL CHECK (indexable IN (0, 1)),
  eligibility_reason TEXT NOT NULL CHECK (length(trim(eligibility_reason)) > 0),
  featured_rank INTEGER CHECK (featured_rank IS NULL OR (typeof(featured_rank) = 'integer' AND featured_rank > 0)),
  shared_metric_count INTEGER NOT NULL CHECK (typeof(shared_metric_count) = 'integer' AND shared_metric_count >= 0),
  PRIMARY KEY (revision, pair_slug),
  UNIQUE (revision, model_a_key, model_b_key),
  FOREIGN KEY (revision, model_a_key) REFERENCES benchmark_models(revision, model_key),
  FOREIGN KEY (revision, model_b_key) REFERENCES benchmark_models(revision, model_key),
  CHECK (model_a_key COLLATE BINARY < model_b_key COLLATE BINARY)
);
CREATE INDEX IF NOT EXISTS idx_benchmark_comparison_pairs_revision_indexable_featured_rank
  ON benchmark_comparison_pairs (revision, indexable, featured_rank);

CREATE TABLE IF NOT EXISTS benchmark_refresh_state (
  source_id TEXT NOT NULL CHECK (source_id IN ('benchlm', 'lmarena', 'litellm', 'openrouter')),
  artifact_id TEXT NOT NULL CHECK (length(trim(artifact_id)) > 0),
  last_success_at TEXT,
  last_revision TEXT REFERENCES benchmark_revisions(revision),
  last_error TEXT,
  PRIMARY KEY (source_id, artifact_id)
);

CREATE TABLE IF NOT EXISTS benchmark_publication_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  active_revision TEXT REFERENCES benchmark_revisions(revision),
  updated_at TEXT NOT NULL
);
