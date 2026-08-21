-- A total-order fence for LiveBench refreshes. The lease is acquired before
-- retrieval, so a later refresh rejects an older completion even when both
-- runs share the same scheduled timestamp or Durable Object instance changes.
CREATE TABLE IF NOT EXISTS livebench_publication_epochs (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  current_epoch INTEGER NOT NULL CHECK (current_epoch >= 0),
  current_attempt_id TEXT,
  active_epoch INTEGER NOT NULL CHECK (active_epoch >= 0 AND active_epoch <= current_epoch),
  updated_at TEXT NOT NULL,
  CHECK (
    (current_epoch = 0 AND current_attempt_id IS NULL)
    OR (current_epoch > 0 AND current_attempt_id IS NOT NULL AND length(trim(current_attempt_id)) > 0)
  )
);

INSERT OR IGNORE INTO livebench_publication_epochs (
  singleton, current_epoch, current_attempt_id, active_epoch, updated_at
) VALUES (1, 0, NULL, 0, '1970-01-01T00:00:00.000Z');
