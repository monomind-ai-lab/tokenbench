-- Checkpointed catalog refreshes stage inactive rows before one guarded final
-- publication batch. The cycle ID owns each pending revision so a replay can
-- converge without claiming another attempt's candidate.
ALTER TABLE catalog_revisions
  ADD COLUMN publication_attempt_id TEXT;

CREATE INDEX IF NOT EXISTS idx_catalog_revisions_pending_attempt
  ON catalog_revisions (revision, publication_attempt_id)
  WHERE publication_state = 'pending';

-- A foreign key proves only that a pointed revision exists. Public catalog
-- pointers must never expose an inactive candidate.
CREATE TRIGGER IF NOT EXISTS trg_catalog_publication_insert_published
BEFORE INSERT ON catalog_publication_state
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM catalog_revisions
  WHERE revision = NEW.active_revision AND publication_state = 'published'
)
BEGIN
  SELECT RAISE(ABORT, 'catalog publication pointer requires a published revision');
END;

CREATE TRIGGER IF NOT EXISTS trg_catalog_publication_update_published
BEFORE UPDATE OF active_revision ON catalog_publication_state
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM catalog_revisions
  WHERE revision = NEW.active_revision AND publication_state = 'published'
)
BEGIN
  SELECT RAISE(ABORT, 'catalog publication pointer requires a published revision');
END;

-- The cache pointer is part of the same evidence publication and must match
-- the active catalog revision prefix selected by the transaction.
CREATE TRIGGER IF NOT EXISTS trg_catalog_cache_publication_insert_matches_revision
BEFORE INSERT ON api_response_publication_state
FOR EACH ROW
WHEN NEW.scope = 'catalog' AND NOT EXISTS (
  SELECT 1 FROM catalog_publication_state
  WHERE singleton = 1
    AND substr(NEW.active_revision, 1, length(active_revision) + 7)
      = active_revision || '+cache-'
)
BEGIN
  SELECT RAISE(ABORT, 'catalog cache pointer must match the active catalog revision');
END;

CREATE TRIGGER IF NOT EXISTS trg_catalog_cache_publication_update_matches_revision
BEFORE UPDATE OF active_revision ON api_response_publication_state
FOR EACH ROW
WHEN NEW.scope = 'catalog' AND NOT EXISTS (
  SELECT 1 FROM catalog_publication_state
  WHERE singleton = 1
    AND substr(NEW.active_revision, 1, length(active_revision) + 7)
      = active_revision || '+cache-'
)
BEGIN
  SELECT RAISE(ABORT, 'catalog cache pointer must match the active catalog revision');
END;
