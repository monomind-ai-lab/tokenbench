import type { ModelMixEntry, PlanEntitlement, RecommendationCandidate } from './contracts';

const BASIS_POINTS = 10_000;

export function weightedModelCost(entries: ModelMixEntry[], inputShareBasisPoints: number): number {
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
  return costPerMillion > 0 ? Math.round(planCostMicroDollars * 1_000_000 / costPerMillion) : null;
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
  const remainingIds = Object.keys(currentMix).filter((id) => id !== changedModelId);
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
