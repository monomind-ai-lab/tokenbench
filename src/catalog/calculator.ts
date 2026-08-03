import type { ModelMixEntry, PlanEntitlement, RecommendationCandidate } from './contracts';

const BASIS_POINTS = 10_000;

function requireBasisPoints(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > BASIS_POINTS) throw new Error(`${label} must be an integer between 0 and 10,000 basis points`);
}

function validateCompleteMix(entries: { shareBasisPoints: number }[]): void {
  if (entries.length === 0) throw new Error('Model mix must include at least one model');
  entries.forEach(({ shareBasisPoints }) => requireBasisPoints(shareBasisPoints, 'Model share'));
  if (entries.reduce((total, { shareBasisPoints }) => total + shareBasisPoints, 0) !== BASIS_POINTS) {
    throw new Error('Model mix must total 10,000 basis points');
  }
}

export function weightedModelCost(entries: ModelMixEntry[], inputShareBasisPoints: number): number {
  validateCompleteMix(entries);
  requireBasisPoints(inputShareBasisPoints, 'Input share');
  const inputShare = inputShareBasisPoints / BASIS_POINTS;
  return Math.round(entries.reduce((total, { model, shareBasisPoints }) => {
    const modelCost = model.inputMicroDollarsPerMillion * inputShare
      + model.outputMicroDollarsPerMillion * (1 - inputShare);
    return total + modelCost * (shareBasisPoints / BASIS_POINTS);
  }, 0));
}

export function monthlyApiCostMicroDollars(costPerMillion: number, monthlyTokens: number): number {
  return Math.round(costPerMillion * monthlyTokens / 1_000_000);
}

export function breakEvenTokens(planCostMicroDollars: number, costPerMillion: number): number | null {
  return costPerMillion > 0 ? Math.ceil(planCostMicroDollars * 1_000_000 / costPerMillion) : null;
}

export function maximumPlanValueMicroDollars(
  entitlement: PlanEntitlement,
  costPerMillion: number,
): number | null {
  return entitlement.kind === 'fixed_tokens'
    ? monthlyApiCostMicroDollars(costPerMillion, entitlement.monthlyTokens)
    : null;
}

export function redistributeModelMix(
  currentMix: Record<string, number>,
  changedModelId: string,
  changedShareBasisPoints: number,
): Record<string, number> {
  const ids = Object.keys(currentMix);
  if (!ids.includes(changedModelId)) throw new Error('Changed model must exist in the current mix');
  validateCompleteMix(ids.map((id) => ({ shareBasisPoints: currentMix[id] })));
  requireBasisPoints(changedShareBasisPoints, 'Changed model share');
  const remainingIds = ids.filter((id) => id !== changedModelId);
  if (remainingIds.length === 0 && changedShareBasisPoints !== BASIS_POINTS) {
    throw new Error('A single-model mix must remain at 10,000 basis points');
  }
  const remainingTotal = Math.max(0, BASIS_POINTS - changedShareBasisPoints);
  const currentOthersTotal = remainingIds.reduce((total, id) => total + currentMix[id], 0);
  const next: Record<string, number> = { [changedModelId]: changedShareBasisPoints };
  let assigned = changedShareBasisPoints;

  remainingIds.forEach((id, index) => {
    const share = index === remainingIds.length - 1
      ? BASIS_POINTS - assigned
      : Math.round(remainingTotal * (currentOthersTotal ? currentMix[id] / currentOthersTotal : 1 / remainingIds.length));
    next[id] = share;
    assigned += share;
  });

  return next;
}

export function recommendCostFirst(candidates: RecommendationCandidate[]): {
  recommendedPlanId: string | null;
  caveats: string[];
} {
  const recommended = [...candidates].sort((a, b) => a.monthlyCostMicroDollars - b.monthlyCostMicroDollars)[0];
  if (!recommended) return { recommendedPlanId: null, caveats: ['No verified plan offers are available.'] };

  const caveats = recommended.entitlement.kind === 'fixed_tokens'
    ? []
    : [`${recommended.id} has a variable usage limit; no maximum plan value is calculated.`];
  return { recommendedPlanId: recommended.id, caveats };
}
