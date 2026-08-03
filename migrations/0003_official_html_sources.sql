-- Rebuild source_records so official HTML pricing evidence can be represented
-- explicitly instead of being mislabeled as JSON or a manual manifest.
CREATE TABLE source_records_v3 (
  revision TEXT NOT NULL REFERENCES catalog_revisions(revision),
  id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('official_json', 'official_html', 'manual_manifest')),
  confidence TEXT NOT NULL CHECK (confidence IN ('official', 'manual_verified')),
  snapshot_key TEXT,
  content_hash TEXT,
  parser_version TEXT,
  evidence_locator TEXT,
  review_status TEXT CHECK (review_status IN ('verified', 'needs_review', 'rejected')),
  PRIMARY KEY (revision, id)
);

INSERT INTO source_records_v3 (
  revision, id, provider_id, source_url, observed_at, source_kind, confidence,
  snapshot_key, content_hash, parser_version, evidence_locator, review_status
)
SELECT
  revision, id, provider_id, source_url, observed_at, source_kind, confidence,
  snapshot_key, content_hash, parser_version, evidence_locator, review_status
FROM source_records;

DROP TABLE source_records;
ALTER TABLE source_records_v3 RENAME TO source_records;
CREATE INDEX idx_source_records_revision_provider ON source_records (revision, provider_id);
