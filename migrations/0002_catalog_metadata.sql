-- Optional published facts are stored separately from price identity and are
-- deliberately nullable when an official source does not publish them.
ALTER TABLE source_records ADD COLUMN content_hash TEXT;
ALTER TABLE source_records ADD COLUMN parser_version TEXT;
ALTER TABLE source_records ADD COLUMN evidence_locator TEXT;
ALTER TABLE source_records ADD COLUMN review_status TEXT CHECK (review_status IN ('verified', 'needs_review', 'rejected'));
ALTER TABLE plan_offers ADD COLUMN billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'annual', 'other'));
ALTER TABLE plan_offers ADD COLUMN supported_model_ids_json TEXT;
ALTER TABLE model_offers ADD COLUMN context_window_tokens INTEGER CHECK (context_window_tokens >= 0);
ALTER TABLE model_offers ADD COLUMN max_output_tokens INTEGER CHECK (max_output_tokens >= 0);
ALTER TABLE model_offers ADD COLUMN availability TEXT CHECK (availability IN ('available', 'limited', 'deprecated'));
