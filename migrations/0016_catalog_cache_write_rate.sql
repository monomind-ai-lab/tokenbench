-- OpenRouter retains a separately priced cache-write rate when its official
-- catalog publishes one. Keep it revision-scoped with the exact model offer;
-- absence remains unknown rather than falling back to a read or input rate.
ALTER TABLE model_offers ADD COLUMN cache_write_micro_dollars_per_million INTEGER
  CHECK (cache_write_micro_dollars_per_million >= 0);
