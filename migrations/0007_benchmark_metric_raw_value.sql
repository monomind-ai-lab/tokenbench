-- BenchLM metrics preserve rawValue (diagnostic raw composite) separately from
-- the public display value stored in `value`. rawValue is null for category and
-- non-BenchLM metrics; only BenchLM overall carries a raw composite.
ALTER TABLE benchmark_metrics
  ADD COLUMN raw_value REAL CHECK (
    raw_value IS NULL
    OR (
      typeof(raw_value) IN ('integer', 'real')
      AND raw_value = raw_value
      AND raw_value >= 0
      AND raw_value <= 1.7976931348623157e308
    )
  );
