import {
  breakEvenTokens,
  maximumPlanValueMicroDollars,
  monthlyApiCostMicroDollars,
  weightedModelCost,
} from '../catalog/calculator';
import type { ModelMixEntry, ModelOffer, PlanEntitlement, PlanOffer, PricingBasis } from '../catalog/contracts';

export type WorkloadPreset = 'balanced' | 'input-heavy' | 'output-heavy';

export const WORKLOAD_PRESETS: Record<WorkloadPreset, { label: string; inputShareBasisPoints: number; monthlyTokens: number }> = {
  balanced: { label: 'Balanced', inputShareBasisPoints: 5_000, monthlyTokens: 10_000_000 },
  'input-heavy': { label: 'Input-heavy', inputShareBasisPoints: 8_000, monthlyTokens: 10_000_000 },
  'output-heavy': { label: 'Output-heavy', inputShareBasisPoints: 3_000, monthlyTokens: 10_000_000 },
};

export interface InitialSelection {
  selectedModelIds: string[];
  modelMixBasisPoints: Record<string, number>;
}

export interface ChartPoint {
  tokens: number;
  valueMicroDollars: number;
}

export interface CalculatorSnapshot {
  selectedOffers: ModelOffer[];
  mixEntries: ModelMixEntry[];
  costPerMillionMicroDollars: number;
  apiEquivalentValueMicroDollars: number;
  monthlyApiCostMicroDollars: number;
  breakEvenTokens: number | null;
  maximumPlanValueMicroDollars: number | null;
  chartPoints: ChartPoint[];
}

type ModelPricingBasis = ModelOffer['pricingBasis'];
const BASIS_KEYS: ModelPricingBasis[] = ['direct_provider_api', 'openrouter', 'opencode_zen'];

export function createInitialSelection(offers: ModelOffer[], maxModels = 3): InitialSelection {
  const selectedModelIds = offers.slice(0, maxModels).map((offer) => offer.id);
  const modelMixBasisPoints = createEvenMix(selectedModelIds);
  return { selectedModelIds, modelMixBasisPoints };
}

export function createEvenMix(ids: string[]): Record<string, number> {
  if (ids.length === 0) return {};
  const share = Math.floor(10_000 / ids.length);
  const remainder = 10_000 - (share * ids.length);
  return Object.fromEntries(ids.map((id, index) => [id, share + (index === ids.length - 1 ? remainder : 0)]));
}

export function toggleModelSelection(current: InitialSelection, modelId: string): InitialSelection {
  const selectedModelIds = current.selectedModelIds.includes(modelId)
    ? current.selectedModelIds.filter((id) => id !== modelId)
    : [...current.selectedModelIds, modelId];
  return { selectedModelIds, modelMixBasisPoints: createEvenMix(selectedModelIds) };
}

export function applyWorkloadPreset(preset: WorkloadPreset) {
  return WORKLOAD_PRESETS[preset];
}

export function groupOffersByBasis(offers: ModelOffer[]): Record<ModelPricingBasis, ModelOffer[]> {
  const grouped: Record<ModelPricingBasis, ModelOffer[]> = {
    direct_provider_api: [],
    openrouter: [],
    opencode_zen: [],
  };
  offers.forEach((offer) => grouped[offer.pricingBasis].push(offer));
  return grouped;
}

export function buildCalculatorSnapshot({
  modelOffers,
  selectedModelIds,
  modelMixBasisPoints,
  inputShareBasisPoints,
  monthlyTokens,
  selectedPlan,
}: {
  modelOffers: ModelOffer[];
  selectedModelIds: string[];
  modelMixBasisPoints: Record<string, number>;
  inputShareBasisPoints: number;
  monthlyTokens: number;
  selectedPlan?: PlanOffer;
}): CalculatorSnapshot {
  const selectedOffers = selectedModelIds
    .map((id) => modelOffers.find((offer) => offer.id === id))
    .filter((offer): offer is ModelOffer => Boolean(offer));
  const mixEntries = selectedOffers.map((model) => ({ model, shareBasisPoints: modelMixBasisPoints[model.id] ?? 0 }));
  const hasCompleteMix = mixEntries.length > 0 && mixEntries.reduce((sum, entry) => sum + entry.shareBasisPoints, 0) === 10_000;
  const costPerMillionMicroDollars = hasCompleteMix
    ? weightedModelCost(mixEntries, inputShareBasisPoints)
    : 0;
  const safeMonthlyTokens = Math.max(0, Math.round(monthlyTokens));
  const apiEquivalentValueMicroDollars = monthlyApiCostMicroDollars(costPerMillionMicroDollars, safeMonthlyTokens);
  const selectedPlanCost = selectedPlan?.monthlyCostMicroDollars ?? 0;
  const breakEven = hasCompleteMix && selectedPlan ? breakEvenTokens(selectedPlanCost, costPerMillionMicroDollars) : null;
  const maximum = hasCompleteMix && selectedPlan
    ? maximumPlanValueMicroDollars(selectedPlan.entitlement, costPerMillionMicroDollars)
    : null;
  const chartMultipliers = [0.25, 0.5, 0.75, 1, 1.25];
  const chartPoints = chartMultipliers.map((multiplier) => {
    const tokens = Math.round(safeMonthlyTokens * multiplier);
    return { tokens, valueMicroDollars: monthlyApiCostMicroDollars(costPerMillionMicroDollars, tokens) };
  });

  return {
    selectedOffers,
    mixEntries,
    costPerMillionMicroDollars,
    apiEquivalentValueMicroDollars,
    monthlyApiCostMicroDollars: apiEquivalentValueMicroDollars,
    breakEvenTokens: breakEven,
    maximumPlanValueMicroDollars: maximum,
    chartPoints,
  };
}

export function formatCurrencyMicroDollars(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Not calculated';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value / 1_000_000);
}

export function formatTokens(tokens: number | null | undefined): string {
  if (tokens === null || tokens === undefined) return 'Not calculated';
  if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${tokens}`;
}

export function formatPercentBasisPoints(value: number): string {
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 1)}%`;
}

export function entitlementLabel(entitlement: PlanEntitlement): string {
  if (entitlement.kind === 'fixed_tokens') return `${formatTokens(entitlement.monthlyTokens)} fixed tokens/month`;
  return entitlement.description;
}

export function basisLabel(basis: ModelPricingBasis): string {
  if (basis === 'direct_provider_api') return 'Direct provider API';
  if (basis === 'openrouter') return 'OpenRouter API';
  return 'OpenCode Zen';
}

export function basisKeys(): ModelPricingBasis[] {
  return BASIS_KEYS;
}
