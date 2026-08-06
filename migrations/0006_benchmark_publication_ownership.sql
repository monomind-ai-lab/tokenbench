-- Multi-RPC benchmark publication stages inactive rows before one final
-- pointer transaction. The attempt ID makes cleanup ownership-specific so an
-- overlapping refresh cannot delete another invocation's pending revision.
ALTER TABLE benchmark_revisions
  ADD COLUMN publication_attempt_id TEXT;

CREATE INDEX IF NOT EXISTS idx_benchmark_revisions_pending_attempt
  ON benchmark_revisions (revision, publication_attempt_id)
  WHERE publication_state = 'pending';

-- The foreign key only proves that a pointed revision exists. These guards
-- also require it to be published, so a stale attempt whose ownership was
-- reclaimed aborts the entire final D1 batch instead of exposing pending rows.
CREATE TRIGGER IF NOT EXISTS trg_benchmark_publication_insert_published
BEFORE INSERT ON benchmark_publication_state
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM benchmark_revisions
  WHERE revision = NEW.active_revision AND publication_state = 'published'
)
BEGIN
  SELECT RAISE(ABORT, 'benchmark publication pointer requires a published revision');
END;

CREATE TRIGGER IF NOT EXISTS trg_benchmark_publication_update_published
BEFORE UPDATE OF active_revision ON benchmark_publication_state
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM benchmark_revisions
  WHERE revision = NEW.active_revision AND publication_state = 'published'
)
BEGIN
  SELECT RAISE(ABORT, 'benchmark publication pointer requires a published revision');
END;

-- Benchmark cache revisions are attempt-unique children of the benchmark
-- revision they materialize. Reject a split-brain cache pointer if a newer
-- benchmark publication wins while an older unchanged refresh is staging.
CREATE TRIGGER IF NOT EXISTS trg_benchmark_cache_publication_insert_matches_revision
BEFORE INSERT ON api_response_publication_state
FOR EACH ROW
WHEN NEW.scope = 'benchmarks' AND NOT EXISTS (
  SELECT 1 FROM benchmark_publication_state
  WHERE singleton = 1
    AND substr(NEW.active_revision, 1, length(active_revision) + 7) = active_revision || '+cache-'
)
BEGIN
  SELECT RAISE(ABORT, 'benchmark cache pointer must match the active benchmark revision');
END;

CREATE TRIGGER IF NOT EXISTS trg_benchmark_cache_publication_update_matches_revision
BEFORE UPDATE OF active_revision ON api_response_publication_state
FOR EACH ROW
WHEN NEW.scope = 'benchmarks' AND NOT EXISTS (
  SELECT 1 FROM benchmark_publication_state
  WHERE singleton = 1
    AND substr(NEW.active_revision, 1, length(active_revision) + 7) = active_revision || '+cache-'
)
BEGIN
  SELECT RAISE(ABORT, 'benchmark cache pointer must match the active benchmark revision');
END;
