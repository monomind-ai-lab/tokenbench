-- A published rank is only interpretable against the size of the cohort it was
-- measured in. That size cannot be recovered from the rows we store: the public
-- leaderboard window is a truncated slice, so an observed rank set can be dense
-- 1..N and still be missing the tail (coding publishes 132 ranks while only 115
-- of those models appear in the limit=200 window).
--
-- rank_field_size carries the exact cohort size from a source that enumerates
-- the whole population. It is null whenever completeness is not provable, and
-- consumers then report the field size and percentile as unavailable rather
-- than inferring a denominator.
ALTER TABLE benchmark_metrics
  ADD COLUMN rank_field_size INTEGER CHECK (
    rank_field_size IS NULL
    OR (
      typeof(rank_field_size) = 'integer'
      AND rank_field_size >= 1
      AND (rank IS NULL OR rank <= rank_field_size)
    )
  );
