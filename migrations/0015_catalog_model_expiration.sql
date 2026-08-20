-- OpenRouter publishes an optional calendar-date endpoint expiration marker.
-- Keep it revision-scoped with the model offer so lifecycle projections never
-- infer retirement from a missing row or from the current wall clock alone.
ALTER TABLE model_offers ADD COLUMN expiration_date TEXT CHECK (
  expiration_date IS NULL
  OR (
    length(expiration_date) = 10
    AND expiration_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(expiration_date) = expiration_date
  )
);

CREATE INDEX IF NOT EXISTS idx_model_offers_revision_expiration
  ON model_offers (revision, expiration_date)
  WHERE expiration_date IS NOT NULL;
