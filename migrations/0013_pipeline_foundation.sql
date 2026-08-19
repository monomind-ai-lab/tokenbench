CREATE TABLE pipeline_license_registry (
  license_id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL CHECK (canonical_url LIKE 'https://%'),
  license_text TEXT NOT NULL,
  license_text_hash TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE TABLE source_revision_manifests (
  domain TEXT NOT NULL CHECK (domain IN ('catalog','benchmark','runtime','lifecycle','subscriptions')),
  source_id TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  upstream_revision TEXT NOT NULL,
  release_id TEXT,
  license_id TEXT NOT NULL REFERENCES pipeline_license_registry(license_id),
  r2_manifest_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('candidate','validated','active','rejected','historical')),
  PRIMARY KEY (domain, source_id, source_revision),
  UNIQUE (attempt_id, r2_manifest_key)
);

CREATE TABLE source_artifacts (
  domain TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  upstream_url TEXT NOT NULL CHECK (upstream_url LIKE 'https://%'),
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  content_hash TEXT NOT NULL,
  upstream_blob_id TEXT,
  PRIMARY KEY (domain, source_id, source_revision, artifact_id),
  FOREIGN KEY (domain, source_id, source_revision)
    REFERENCES source_revision_manifests(domain, source_id, source_revision)
);

CREATE TABLE model_configurations (
  configuration_id TEXT PRIMARY KEY,
  canonical_model_key TEXT,
  display_name TEXT NOT NULL,
  organization TEXT NOT NULL,
  version_label TEXT,
  open_weights INTEGER CHECK (open_weights IS NULL OR open_weights IN (0,1)),
  is_derivative_finetune INTEGER NOT NULL CHECK (is_derivative_finetune IN (0,1)),
  base_configuration_id TEXT REFERENCES model_configurations(configuration_id),
  lineage_source_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE model_source_identities (
  source_id TEXT NOT NULL,
  source_model_id TEXT NOT NULL,
  configuration_id TEXT REFERENCES model_configurations(configuration_id),
  match_kind TEXT NOT NULL CHECK (match_kind IN ('exact','reviewed','proposal')),
  review_status TEXT NOT NULL CHECK (review_status IN ('verified','needs_review','rejected')),
  reviewed_by TEXT,
  evidence_url TEXT,
  effective_from_revision TEXT NOT NULL,
  effective_to_revision TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_id, source_model_id, effective_from_revision)
);

CREATE UNIQUE INDEX idx_model_source_identities_one_active
  ON model_source_identities (source_id, source_model_id)
  WHERE effective_to_revision IS NULL;

CREATE TABLE projection_revisions (
  projection_revision TEXT PRIMARY KEY,
  catalog_revision TEXT,
  benchmark_revision TEXT,
  runtime_observation_set TEXT,
  methodology_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  published_at TEXT,
  publication_state TEXT NOT NULL CHECK (publication_state IN ('pending','published','superseded','failed'))
);

CREATE TABLE projection_publication_state (
  projection_scope TEXT PRIMARY KEY,
  active_revision TEXT NOT NULL REFERENCES projection_revisions(projection_revision),
  updated_at TEXT NOT NULL
);
