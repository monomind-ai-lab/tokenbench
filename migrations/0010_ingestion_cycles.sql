-- Operational receipt tables shared by the catalog and benchmark ingestion
-- coordinators. A cycle records one resumable cadence run; a step row records
-- one bounded, idempotent step within that run so an alarm can resume from a
-- persisted cursor after a replay or crash. Both coordinators own these tables.
CREATE TABLE IF NOT EXISTS ingestion_cycles (
  scope TEXT NOT NULL CHECK (scope IN ('catalog', 'benchmarks')),
  cycle_id TEXT NOT NULL,
  cadence_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('idle','running','retry_wait','ready_to_publish','published','failed','expired')),
  phase TEXT NOT NULL,
  cursor INTEGER NOT NULL CHECK (cursor >= 0),
  attempt INTEGER NOT NULL CHECK (attempt BETWEEN 0 AND 3),
  frozen_catalog_revision TEXT,
  frozen_benchmark_revision TEXT,
  manifest_key TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT NOT NULL,
  next_retry_at TEXT,
  final_revision TEXT,
  result_json TEXT CHECK (result_json IS NULL OR (json_valid(result_json) AND length(CAST(result_json AS BLOB)) <= 65536)),
  error_code TEXT,
  error_source_id TEXT,
  error_artifact_id TEXT,
  PRIMARY KEY (scope, cycle_id)
);

CREATE TABLE IF NOT EXISTS ingestion_cycle_steps (
  scope TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  cursor INTEGER NOT NULL CHECK (cursor >= 0),
  status TEXT NOT NULL CHECK (status IN ('running','completed','retry_wait','failed','skipped')),
  attempt INTEGER NOT NULL CHECK (attempt BETWEEN 1 AND 3),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  output_count INTEGER CHECK (output_count IS NULL OR output_count >= 0),
  error_code TEXT,
  PRIMARY KEY (scope, cycle_id, phase, cursor),
  FOREIGN KEY (scope, cycle_id) REFERENCES ingestion_cycles(scope, cycle_id) ON DELETE CASCADE
);

-- Find the newest open cycle for a cadence key and surface the most recently
-- updated cycle in each scope/state.
CREATE INDEX IF NOT EXISTS ingestion_cycles_scope_cadence_state_idx
  ON ingestion_cycles (scope, cadence_key, state, updated_at DESC);

-- Reap expired cycles and surface cycles ready for an alarm by scope/state.
CREATE INDEX IF NOT EXISTS ingestion_cycles_scope_state_expires_idx
  ON ingestion_cycles (scope, state, expires_at);
