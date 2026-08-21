-- OpenRouter's public model catalog includes additional route-scoped receipts
-- beyond standard prompt/completion pricing. Store each fact on the immutable
-- benchmark price-check row that names its exact model, provider, route, and
-- source artifact. A NULL means the source did not publish that fact; it is
-- never a free price, disabled capability, or indefinite lifecycle state.
ALTER TABLE benchmark_price_checks
  ADD COLUMN cache_write_usd_per_million REAL CHECK (
    cache_write_usd_per_million IS NULL OR (
      typeof(cache_write_usd_per_million) IN ('integer', 'real')
      AND cache_write_usd_per_million = cache_write_usd_per_million
      AND cache_write_usd_per_million >= 0
      AND cache_write_usd_per_million <= 1.7976931348623157e308
    )
  );

ALTER TABLE benchmark_price_checks
  ADD COLUMN created_at TEXT;
ALTER TABLE benchmark_price_checks
  ADD COLUMN expiration_date TEXT CHECK (
    expiration_date IS NULL
    OR (
      length(expiration_date) = 10
      AND expiration_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND date(expiration_date) = expiration_date
    )
  );
ALTER TABLE benchmark_price_checks
  ADD COLUMN knowledge_cutoff TEXT;
ALTER TABLE benchmark_price_checks
  ADD COLUMN tokenizer TEXT;
ALTER TABLE benchmark_price_checks
  ADD COLUMN instruction_format TEXT;
ALTER TABLE benchmark_price_checks
  ADD COLUMN is_moderated INTEGER CHECK (is_moderated IS NULL OR is_moderated IN (0, 1));
ALTER TABLE benchmark_price_checks
  ADD COLUMN per_request_limits_json TEXT CHECK (
    per_request_limits_json IS NULL
    OR (json_valid(per_request_limits_json) AND json_type(per_request_limits_json) = 'object')
  );
