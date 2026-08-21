-- Annual billing is a separate published price fact, not a rewritten monthly
-- price. The optional effective-monthly amount is retained only when the
-- provider explicitly displays it (it may be rounded differently from annual
-- price divided by twelve).
ALTER TABLE plan_offers
  ADD COLUMN annual_cost_micro_dollars INTEGER CHECK (
    annual_cost_micro_dollars IS NULL
    OR (typeof(annual_cost_micro_dollars) = 'integer' AND annual_cost_micro_dollars >= 0)
  );

ALTER TABLE plan_offers
  ADD COLUMN annual_effective_monthly_cost_micro_dollars INTEGER CHECK (
    annual_effective_monthly_cost_micro_dollars IS NULL
    OR (
      typeof(annual_effective_monthly_cost_micro_dollars) = 'integer'
      AND annual_effective_monthly_cost_micro_dollars >= 0
    )
  );
