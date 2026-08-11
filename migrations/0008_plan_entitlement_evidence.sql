-- Plan entitlement evidence is stored separately from presentation copy so the
-- calculator can distinguish verified capacity from projected, dynamic, and
-- stale rows. Nullable because revisions published before this migration carry
-- no evidence; the API reads those as `stale` rather than inventing coverage.
ALTER TABLE plan_offers
  ADD COLUMN entitlement_evidence_json TEXT
  CHECK (entitlement_evidence_json IS NULL OR json_valid(entitlement_evidence_json));
