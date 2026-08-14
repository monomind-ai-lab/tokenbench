import {
  compareSubscriptionWithApi,
  deriveConversationWorkload,
  type ApiEquivalentCost,
  type ConversationWorkload,
  type DerivedConversationWorkload,
  type SubscriptionApiComparison,
} from '../catalog/subscription-api-calculator';
import { defaultApiEquivalentForPlan } from '../catalog/plan-api-equivalent';
import type { CatalogFreshness, ModelMixEntry, ModelOffer, PlanEntitlement, PlanOffer, PricingBasis } from '../catalog/contracts';

export type WorkloadPreset = 'balanced' | 'input-heavy' | 'output-heavy';

/** Kept as a small convenience for callers that still render preset buttons. */
export const WORKLOAD_PRESETS: Record<WorkloadPreset, { label: string; inputShareBasisPoints: number; monthlyTokens: number; workload: ConversationWorkload }> = {
  balanced: {
    label: 'Balanced',
    inputShareBasisPoints: 5_000,
    monthlyTokens: 10_000_000,
    workload: { conversationsPerDay: 10, messagesPerConversation: 1, inputTokensPerMessage: 16_667, outputTokensPerMessage: 16_666, activeDaysPerMonth: 30 },
  },
  'input-heavy': {
    label: 'Input-heavy',
    inputShareBasisPoints: 8_000,
    monthlyTokens: 10_000_000,
    workload: { conversationsPerDay: 10, messagesPerConversation: 1, inputTokensPerMessage: 26_667, outputTokensPerMessage: 6_666, activeDaysPerMonth: 30 },
  },
  'output-heavy': {
    label: 'Output-heavy',
    inputShareBasisPoints: 3_000,
    monthlyTokens: 10_000_000,
    workload: { conversationsPerDay: 10, messagesPerConversation: 1, inputTokensPerMessage: 10_000, outputTokensPerMessage: 23_333, activeDaysPerMonth: 30 },
  },
};

export interface InitialSelection {
  readonly selectedModelIds: string[];
  readonly modelMixBasisPoints: Record<string, number>;
}

export interface ChartPoint {
  readonly tokens: number;
  readonly valueMicroDollars: number;
}

export interface CapacityEvidenceResult {
  readonly status: 'verified-covered' | 'verified-not-covered' | 'projected' | 'not-verified';
  readonly explanation: string;
}

export interface ApiMappingDisclosure {
  readonly mode: 'default' | 'override';
  readonly defaultOffer: ModelOffer | null;
  readonly selectedOffers: ModelOffer[];
}

export interface CalculatorSnapshot {
  readonly workload: ConversationWorkload;
  readonly costUsage: CalculatorCostUsage;
  readonly derivedWorkload: DerivedConversationWorkload;
  readonly selectedOffers: ModelOffer[];
  readonly mixEntries: ModelMixEntry[];
  readonly apiEquivalentCost: ApiEquivalentCost | null;
  /** Selector-owned, source-qualified costs that sum to the API-equivalent total. */
  readonly costContributions: readonly CalculatorCostContribution[];
  readonly comparison: SubscriptionApiComparison | null;
  readonly apiMapping: ApiMappingDisclosure;
  readonly capacityEvidence: CapacityEvidenceResult;
  readonly catalogFreshness: CatalogFreshness | null;
  readonly calculationTimestamp: string;
  readonly costPerMillionMicroDollars: number;
  readonly apiEquivalentValueMicroDollars: number;
  readonly monthlyApiCostMicroDollars: number;
  readonly estimatedMonthlySavingsMicroDollars: number | null;
  readonly efficiencyBasisPoints: number | null;
  readonly breakEvenMessagesPerDay: number | null;
  readonly breakEvenTokens: number | null;
  readonly maximumPlanValueMicroDollars: number | null;
  readonly monthlyTokens: number;
  /** Only a separately verified fixed-token entitlement can populate this. */
  readonly publishedCapacityTokens: number | null;
  readonly chartPoints: ChartPoint[];
}

export interface CalculatorEvidenceLineItem {
  readonly kind: 'source_price' | 'derived_cost' | 'assumption';
  readonly label: string;
  readonly valueMicroDollars: number | null;
  readonly priceEffectiveAt: string | null;
  readonly assumption: string | null;
}

export interface MonthlyTokenEstimate {
  readonly tokens: number;
  readonly source: 'estimate' | 'manual';
}

export interface CalculatorCostUsage {
  readonly characterCount: number;
  readonly charactersPerToken: number;
  readonly manualMonthlyTokens: number | null;
  readonly cacheReadBasisPoints: number;
  readonly cacheWriteTokens: number;
  readonly longContextTokens: number;
}

export type CalculatorCostDimension = 'input' | 'cached_input' | 'cache_write' | 'long_context_input' | 'long_context_output' | 'output';

export interface CalculatorCostContribution {
  readonly offerId: string;
  readonly dimension: CalculatorCostDimension;
  readonly tokens: number;
  readonly valueMicroDollars: number;
}

const DEFAULT_COST_USAGE: CalculatorCostUsage = {
  characterCount: 0,
  charactersPerToken: 4,
  manualMonthlyTokens: null,
  cacheReadBasisPoints: 0,
  cacheWriteTokens: 0,
  longContextTokens: 0,
};

/** Manual input wins until it is explicitly reset; the character factor stays disclosed. */
export function resolveMonthlyTokenEstimate({
  characterCount,
  charactersPerToken,
  manualMonthlyTokens,
}: {
  readonly characterCount: number;
  readonly charactersPerToken: number;
  readonly manualMonthlyTokens: number | null;
}): MonthlyTokenEstimate {
  if (manualMonthlyTokens !== null) {
    if (!Number.isSafeInteger(manualMonthlyTokens) || manualMonthlyTokens < 0) throw new Error('Manual monthly tokens must be a non-negative safe integer');
    return { tokens: manualMonthlyTokens, source: 'manual' };
  }
  const safeCharacters = Number.isFinite(characterCount) && characterCount >= 0 ? characterCount : 0;
  const safeFactor = Number.isFinite(charactersPerToken) && charactersPerToken > 0 ? charactersPerToken : 4;
  return { tokens: Math.floor(safeCharacters / safeFactor), source: 'estimate' };
}

type ModelPricingBasis = ModelOffer['pricingBasis'];
const BASIS_KEYS: ModelPricingBasis[] = ['direct_provider_api', 'openrouter', 'opencode_zen'];
const SAFE_INTEGER_MAX = BigInt(Number.MAX_SAFE_INTEGER);
const BILLION = 1_000_000_000;

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

export function selectedWorkloadPreset(inputShareBasisPoints: number, monthlyTokens: number): WorkloadPreset | null {
  const match = (Object.entries(WORKLOAD_PRESETS) as [WorkloadPreset, (typeof WORKLOAD_PRESETS)[WorkloadPreset]][])
    .find(([, values]) => values.inputShareBasisPoints === inputShareBasisPoints && values.monthlyTokens === monthlyTokens);
  return match?.[0] ?? null;
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

function safeAdd(left: number, right: number, label: string): number {
  const sum = BigInt(left) + BigInt(right);
  if (sum > SAFE_INTEGER_MAX) throw new Error(`${label} exceeds the safe integer range`);
  return Number(sum);
}

function costForTokens(tokens: number, rateMicroDollarsPerMillion: number, label: string): number {
  if (!Number.isSafeInteger(tokens) || tokens < 0) throw new Error(`${label} tokens must be a non-negative safe integer`);
  if (!Number.isSafeInteger(rateMicroDollarsPerMillion) || rateMicroDollarsPerMillion < 0) throw new Error(`${label} rate must be a non-negative safe integer`);
  const value = (BigInt(tokens) * BigInt(rateMicroDollarsPerMillion) + 500_000n) / 1_000_000n;
  if (value > SAFE_INTEGER_MAX) throw new Error(`${label} exceeds the safe integer range`);
  return Number(value);
}

/** Splits a bounded token count exactly across weighted selected routes. */
function allocateTokens(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Allocated tokens must be a non-negative safe integer');
  if (weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0)) throw new Error('Allocation weights must be non-negative safe integers');
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight === 0) return weights.map(() => 0);
  const denominator = BigInt(totalWeight);
  const shares = weights.map((weight, index) => {
    const numerator = BigInt(total) * BigInt(weight);
    return { index, tokens: Number(numerator / denominator), remainder: numerator % denominator };
  });
  let remaining = total - shares.reduce((sum, share) => sum + share.tokens, 0);
  for (const share of [...shares].sort((left, right) => right.remainder > left.remainder ? 1 : right.remainder < left.remainder ? -1 : left.index - right.index)) {
    if (remaining === 0) break;
    share.tokens += 1;
    remaining -= 1;
  }
  return shares.sort((left, right) => left.index - right.index).map((share) => share.tokens);
}

function splitLongContextTokens(tokens: number, workload: DerivedConversationWorkload): readonly [number, number] {
  const total = safeAdd(workload.monthlyInputTokens, workload.monthlyOutputTokens, 'Monthly workload');
  if (total === 0) {
    const input = Math.floor(tokens / 2);
    return [input, tokens - input];
  }
  const [input] = allocateTokens(tokens, [workload.monthlyInputTokens, workload.monthlyOutputTokens]);
  return [input, tokens - input];
}

function contribution(
  offer: ModelOffer,
  dimension: CalculatorCostDimension,
  tokens: number,
  rateMicroDollarsPerMillion: number,
): CalculatorCostContribution {
  return {
    offerId: offer.id,
    dimension,
    tokens,
    valueMicroDollars: costForTokens(tokens, rateMicroDollarsPerMillion, `${offer.displayName} ${dimension}`),
  };
}

function buildCostContributions(
  entries: readonly ModelMixEntry[],
  workload: DerivedConversationWorkload,
  costUsage: CalculatorCostUsage,
): readonly CalculatorCostContribution[] {
  const weights = entries.map((entry) => entry.shareBasisPoints);
  const inputTokens = allocateTokens(workload.monthlyInputTokens, weights);
  const outputTokens = allocateTokens(workload.monthlyOutputTokens, weights);
  const cachedTarget = Math.floor(workload.monthlyInputTokens * costUsage.cacheReadBasisPoints / 10_000);
  const cachedTokens = allocateTokens(cachedTarget, inputTokens);
  const cacheWriteTokens = allocateTokens(costUsage.cacheWriteTokens, weights);
  const [longContextInputTokens, longContextOutputTokens] = splitLongContextTokens(costUsage.longContextTokens, workload);
  const longInputTokens = allocateTokens(longContextInputTokens, weights);
  const longOutputTokens = allocateTokens(longContextOutputTokens, weights);

  return entries.flatMap((entry, index) => {
    const { model } = entry;
    const hasCachedInputPrice = typeof model.cachedInputMicroDollarsPerMillion === 'number';
    const applicableCachedTokens = hasCachedInputPrice ? cachedTokens[index] : 0;
    const rows: CalculatorCostContribution[] = [
      contribution(model, 'input', inputTokens[index] - applicableCachedTokens, model.inputMicroDollarsPerMillion),
      contribution(model, 'output', outputTokens[index], model.outputMicroDollarsPerMillion),
    ];
    if (hasCachedInputPrice) rows.splice(1, 0, contribution(model, 'cached_input', applicableCachedTokens, model.cachedInputMicroDollarsPerMillion));
    if (typeof model.cacheWriteMicroDollarsPerMillion === 'number') rows.splice(-1, 0, contribution(model, 'cache_write', cacheWriteTokens[index], model.cacheWriteMicroDollarsPerMillion));
    if (typeof model.longContextInputMicroDollarsPerMillion === 'number' && typeof model.longContextOutputMicroDollarsPerMillion === 'number') {
      rows.splice(-1, 0,
        contribution(model, 'long_context_input', longInputTokens[index], model.longContextInputMicroDollarsPerMillion),
        contribution(model, 'long_context_output', longOutputTokens[index], model.longContextOutputMicroDollarsPerMillion),
      );
    }
    return rows;
  });
}

function totalContributionCost(
  contributions: readonly CalculatorCostContribution[],
  dimensions: readonly CalculatorCostDimension[],
): number {
  const dimensionSet = new Set(dimensions);
  return contributions
    .filter((contribution) => dimensionSet.has(contribution.dimension))
    .reduce((total, contribution) => safeAdd(total, contribution.valueMicroDollars, 'API-equivalent cost'), 0);
}

function costPerMillion(totalCostMicroDollars: number, monthlyTokens: number): number {
  if (monthlyTokens === 0) return 0;
  const value = (BigInt(totalCostMicroDollars) * 1_000_000n + BigInt(monthlyTokens) / 2n) / BigInt(monthlyTokens);
  if (value > SAFE_INTEGER_MAX) throw new Error('Cost per million exceeds the safe integer range');
  return Number(value);
}

/** Allocates an authoritative token total by the disclosed workload ratio. */
function workloadForMonthlyTokenTotal(
  workload: DerivedConversationWorkload,
  monthlyTokens: number,
): DerivedConversationWorkload {
  if (!Number.isSafeInteger(monthlyTokens) || monthlyTokens < 0) throw new Error('Monthly token total must be a non-negative safe integer');
  const currentTotal = safeAdd(workload.monthlyInputTokens, workload.monthlyOutputTokens, 'Monthly workload');
  if (currentTotal === monthlyTokens) return workload;
  if (currentTotal === 0) {
    const monthlyInputTokens = Math.floor(monthlyTokens / 2);
    return { ...workload, monthlyInputTokens, monthlyOutputTokens: monthlyTokens - monthlyInputTokens };
  }
  const inputNumerator = BigInt(monthlyTokens) * BigInt(workload.monthlyInputTokens);
  const inputTokens = inputNumerator / BigInt(currentTotal);
  if (inputTokens > SAFE_INTEGER_MAX) throw new Error('Monthly input tokens exceed the safe integer range');
  const monthlyInputTokens = Number(inputTokens);
  return { ...workload, monthlyInputTokens, monthlyOutputTokens: monthlyTokens - monthlyInputTokens };
}

function legacyWorkload(inputShareBasisPoints: number, monthlyTokens: number): ConversationWorkload {
  const safeTokens = Number.isSafeInteger(monthlyTokens) ? Math.max(0, monthlyTokens) : 0;
  const activeDaysPerMonth = 30;
  const totalTokensPerMessage = Math.min(1_000_000, Math.floor(safeTokens / activeDaysPerMonth));
  const inputTokensPerMessage = Math.floor(totalTokensPerMessage * inputShareBasisPoints / 10_000);
  return {
    conversationsPerDay: safeTokens === 0 ? 0 : 1,
    messagesPerConversation: safeTokens === 0 ? 0 : 1,
    inputTokensPerMessage,
    outputTokensPerMessage: totalTokensPerMessage - inputTokensPerMessage,
    activeDaysPerMonth,
  };
}

export function breakEvenTokensForMonthlyCost(
  planCostMicroDollars: number,
  apiCostMicroDollars: number,
  monthlyTokens: number,
): number | null {
  if (!Number.isSafeInteger(planCostMicroDollars) || !Number.isSafeInteger(apiCostMicroDollars) || !Number.isSafeInteger(monthlyTokens)) return null;
  if (planCostMicroDollars < 0 || apiCostMicroDollars <= 0 || monthlyTokens <= 0) return null;
  const numerator = BigInt(planCostMicroDollars) * BigInt(monthlyTokens);
  const quotient = (numerator + BigInt(apiCostMicroDollars) - 1n) / BigInt(apiCostMicroDollars);
  if (quotient > SAFE_INTEGER_MAX) throw new Error('Breakeven tokens exceed the safe integer range');
  return Number(quotient);
}

function isCompleteMix(entries: readonly ModelMixEntry[]): boolean {
  return entries.length > 0
    && entries.every((entry) => Number.isSafeInteger(entry.shareBasisPoints) && entry.shareBasisPoints >= 0 && entry.shareBasisPoints <= 10_000)
    && entries.reduce((sum, entry) => sum + entry.shareBasisPoints, 0) === 10_000;
}

function capacityEvidenceFor(
  selectedPlan: PlanOffer | undefined,
  snapshotWorkload: DerivedConversationWorkload,
  selectedOffers: readonly ModelOffer[],
  hasCompleteMix: boolean,
): CapacityEvidenceResult {
  if (!selectedPlan) return { status: 'not-verified', explanation: 'No subscription plan is selected, so no published allowance can be checked.' };
  if (!hasCompleteMix) return { status: 'not-verified', explanation: 'A complete selected-model mix is required before a published allowance can be checked.' };
  const selectedModelIds = [...new Set(selectedOffers.map((offer) => offer.modelId))];
  if (!selectedPlan.supportedModelIds?.length || !selectedModelIds.every((id) => selectedPlan.supportedModelIds?.includes(id))) {
    return { status: 'not-verified', explanation: 'The plan does not publish access to one or more selected models.' };
  }
  if (selectedPlan.entitlementEvidence.status === 'stale') {
    const reason = selectedPlan.entitlementEvidence.staleReason ? ` ${selectedPlan.entitlementEvidence.staleReason}` : '';
    return { status: 'not-verified', explanation: `Stale evidence: the published allowance must be refreshed before capacity can be verified.${reason}` };
  }
  if (selectedPlan.entitlementEvidence.status === 'projected') {
    return { status: 'projected', explanation: 'Projected outer ceiling: this is a scenario derived from published limits, not a guaranteed allowance.' };
  }
  if (selectedPlan.entitlementEvidence.status === 'dynamic_unknown') {
    return { status: 'not-verified', explanation: 'The provider advertises higher limits but does not publish a numeric cap or reset schedule.' };
  }
  if (selectedPlan.entitlement.kind === 'credits') {
    return { status: 'not-verified', explanation: 'The plan includes credits. The provider does not publish a stable token conversion, so TokenBench cannot verify token coverage.' };
  }
  if (selectedPlan.entitlement.kind === 'rolling_limit') {
    return { status: 'not-verified', explanation: 'The provider publishes a rolling usage limit without a numeric monthly cap or reset schedule, so TokenBench cannot verify token coverage.' };
  }
  if (selectedPlan.entitlement.kind !== 'fixed_tokens') {
    return { status: 'not-verified', explanation: 'The provider advertises higher limits but does not publish a numeric cap or reset schedule.' };
  }
  const monthlyTokens = safeAdd(snapshotWorkload.monthlyInputTokens, snapshotWorkload.monthlyOutputTokens, 'Monthly workload');
  return selectedPlan.entitlement.monthlyTokens >= monthlyTokens
    ? { status: 'verified-covered', explanation: 'The published allowance covers this workload under the selected model limits.' }
    : { status: 'verified-not-covered', explanation: 'The published allowance is below this workload.' };
}

export function buildCalculatorSnapshot({
  modelOffers,
  selectedModelIds,
  modelMixBasisPoints,
  workload,
  selectedPlan,
  mappingMode,
  inputShareBasisPoints,
  monthlyTokens,
  catalogFreshness,
  calculationTimestamp,
  costUsage,
}: {
  modelOffers: ModelOffer[];
  selectedModelIds: string[];
  modelMixBasisPoints: Record<string, number>;
  workload?: ConversationWorkload;
  selectedPlan?: PlanOffer;
  mappingMode?: 'default' | 'override';
  inputShareBasisPoints?: number;
  monthlyTokens?: number;
  catalogFreshness?: CatalogFreshness;
  calculationTimestamp?: string;
  costUsage?: CalculatorCostUsage;
}): CalculatorSnapshot {
  const resolvedCostUsage = costUsage ?? DEFAULT_COST_USAGE;
  const snapshotWorkload = workload ?? legacyWorkload(inputShareBasisPoints ?? 5_000, monthlyTokens ?? 10_000_000);
  const conversationWorkload = deriveConversationWorkload(snapshotWorkload);
  const conversationMonthlyTokens = safeAdd(conversationWorkload.monthlyInputTokens, conversationWorkload.monthlyOutputTokens, 'Monthly workload');
  const tokenEstimate = resolveMonthlyTokenEstimate(resolvedCostUsage);
  const authoritativeMonthlyTokens = tokenEstimate.source === 'manual' || tokenEstimate.tokens > 0
    ? tokenEstimate.tokens
    : conversationMonthlyTokens;
  const derivedWorkload = workloadForMonthlyTokenTotal(conversationWorkload, authoritativeMonthlyTokens);
  const selectedOffers = selectedModelIds
    .map((id) => modelOffers.find((offer) => offer.id === id))
    .filter((offer): offer is ModelOffer => Boolean(offer));
  const selectedMixEntries = selectedOffers.map((model) => ({ model, shareBasisPoints: modelMixBasisPoints[model.id] ?? 0 }));
  const defaultOffer = selectedPlan ? defaultApiEquivalentForPlan(selectedPlan, modelOffers) : null;
  const inferredMode = mappingMode ?? (
    defaultOffer && selectedMixEntries.length === 1 && selectedMixEntries[0].model.id === defaultOffer.id && selectedMixEntries[0].shareBasisPoints === 10_000
      ? 'default'
      : 'override'
  );
  const arithmeticEntries = inferredMode === 'default' && defaultOffer
    ? [{ model: defaultOffer, shareBasisPoints: 10_000 }]
    : selectedMixEntries;
  const hasCompleteMix = isCompleteMix(arithmeticEntries);
  const costContributions = hasCompleteMix ? buildCostContributions(arithmeticEntries, derivedWorkload, resolvedCostUsage) : [];
  const apiEquivalentCost = hasCompleteMix
    ? (() => {
      const inputCostMicroDollars = totalContributionCost(costContributions, ['input', 'cached_input', 'cache_write', 'long_context_input']);
      const outputCostMicroDollars = totalContributionCost(costContributions, ['output', 'long_context_output']);
      return {
        inputCostMicroDollars,
        outputCostMicroDollars,
        apiCostMicroDollars: safeAdd(inputCostMicroDollars, outputCostMicroDollars, 'API-equivalent cost'),
      };
    })()
    : null;
  const comparison = apiEquivalentCost && selectedPlan
    ? compareSubscriptionWithApi(selectedPlan.monthlyCostMicroDollars, derivedWorkload, apiEquivalentCost, snapshotWorkload.activeDaysPerMonth)
    : null;
  const totalMonthlyTokens = safeAdd(derivedWorkload.monthlyInputTokens, derivedWorkload.monthlyOutputTokens, 'Monthly workload');
  const blendedCostPerMillion = apiEquivalentCost ? costPerMillion(apiEquivalentCost.apiCostMicroDollars, totalMonthlyTokens) : 0;
  const apiEquivalentValueMicroDollars = apiEquivalentCost?.apiCostMicroDollars ?? 0;
  const breakEvenTokens = selectedPlan?.entitlement.kind === 'fixed_tokens' && apiEquivalentCost && totalMonthlyTokens > 0
    ? breakEvenTokensForMonthlyCost(selectedPlan.monthlyCostMicroDollars, apiEquivalentCost.apiCostMicroDollars, totalMonthlyTokens)
    : null;
  const chartPoints = [0.25, 0.5, 0.75, 1, 1.25].map((multiplier) => ({
    tokens: Math.round(totalMonthlyTokens * multiplier),
    valueMicroDollars: Math.round(apiEquivalentValueMicroDollars * multiplier),
  }));
  const publishedCapacityTokens = selectedPlan?.entitlement.kind === 'fixed_tokens'
    && selectedPlan.entitlementEvidence.status === 'verified'
    ? selectedPlan.entitlement.monthlyTokens
    : null;

  return {
    workload: snapshotWorkload,
    costUsage: resolvedCostUsage,
    derivedWorkload,
    selectedOffers,
    mixEntries: selectedMixEntries,
    apiEquivalentCost,
    costContributions,
    comparison,
    apiMapping: { mode: inferredMode, defaultOffer, selectedOffers: arithmeticEntries.map((entry) => entry.model) },
    capacityEvidence: capacityEvidenceFor(selectedPlan, derivedWorkload, arithmeticEntries.map((entry) => entry.model), hasCompleteMix),
    catalogFreshness: catalogFreshness ?? null,
    calculationTimestamp: calculationTimestamp ?? new Date().toISOString(),
    costPerMillionMicroDollars: blendedCostPerMillion,
    apiEquivalentValueMicroDollars,
    monthlyApiCostMicroDollars: apiEquivalentValueMicroDollars,
    estimatedMonthlySavingsMicroDollars: comparison?.differenceMicroDollars ?? null,
    efficiencyBasisPoints: comparison?.efficiencyBasisPoints ?? null,
    breakEvenMessagesPerDay: comparison?.breakEvenMessagesPerDay ?? null,
    breakEvenTokens,
    maximumPlanValueMicroDollars: null,
    monthlyTokens: totalMonthlyTokens,
    publishedCapacityTokens,
    chartPoints,
  };
}

export function formatCurrencyMicroDollars(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Not calculated';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value / 1_000_000);
}

export function formatTokens(tokens: number | null | undefined): string {
  if (tokens === null || tokens === undefined) return 'Not calculated';
  if (tokens >= BILLION) return `${(tokens / BILLION).toFixed(1)}B`;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${tokens}`;
}

export function formatPercentBasisPoints(value: number): string {
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 1)}%`;
}

export function formatSignedPercentBasisPoints(value: number | null): string {
  if (value === null) return 'Not calculated';
  const formatted = formatPercentBasisPoints(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
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

/**
 * Keeps published price inputs distinct from TokenBench's scenario arithmetic.
 * Missing dimensions are represented as null rather than a zero-value cost.
 */
export function buildCalculatorEvidenceLineItems(
  snapshot: CalculatorSnapshot,
  offer: ModelOffer | null,
  priceEffectiveAt: string | null,
): readonly CalculatorEvidenceLineItem[] {
  const sourceItems: CalculatorEvidenceLineItem[] = offer === null ? [] : [
    {
      kind: 'source_price',
      label: 'Published input price',
      valueMicroDollars: offer.inputMicroDollarsPerMillion,
      priceEffectiveAt,
      assumption: null,
    },
    {
      kind: 'source_price',
      label: 'Published output price',
      valueMicroDollars: offer.outputMicroDollarsPerMillion,
      priceEffectiveAt,
      assumption: null,
    },
    ...(typeof offer.cachedInputMicroDollarsPerMillion === 'number' ? [{
      kind: 'source_price' as const,
      label: 'Published cached-input price',
      valueMicroDollars: offer.cachedInputMicroDollarsPerMillion,
      priceEffectiveAt,
      assumption: null,
    }] : []),
    ...(typeof offer.cacheWriteMicroDollarsPerMillion === 'number' ? [{
      kind: 'source_price' as const,
      label: 'Published cache-write price',
      valueMicroDollars: offer.cacheWriteMicroDollarsPerMillion,
      priceEffectiveAt,
      assumption: null,
    }] : []),
    ...(typeof offer.longContextInputMicroDollarsPerMillion === 'number' && typeof offer.longContextOutputMicroDollarsPerMillion === 'number' ? [
      {
        kind: 'source_price' as const,
        label: 'Published long-context input price',
        valueMicroDollars: offer.longContextInputMicroDollarsPerMillion,
        priceEffectiveAt,
        assumption: null,
      },
      {
        kind: 'source_price' as const,
        label: 'Published long-context output price',
        valueMicroDollars: offer.longContextOutputMicroDollarsPerMillion,
        priceEffectiveAt,
        assumption: null,
      },
    ] : []),
  ];
  const contributionCost = (dimension: CalculatorCostDimension): number | null => {
    if (offer === null) return null;
    const contributions = snapshot.costContributions.filter((item) => item.offerId === offer.id && item.dimension === dimension);
    return contributions.length === 0
      ? null
      : contributions.reduce((total, item) => safeAdd(total, item.valueMicroDollars, 'Audit ledger cost'), 0);
  };
  const inputCost = contributionCost('input');
  const outputCost = contributionCost('output');
  const cachedInputCost = offer?.cachedInputMicroDollarsPerMillion === undefined ? null : contributionCost('cached_input');
  const cacheWriteCost = offer?.cacheWriteMicroDollarsPerMillion === undefined ? null : contributionCost('cache_write');
  const longContextInputCost = offer?.longContextInputMicroDollarsPerMillion === undefined || offer?.longContextOutputMicroDollarsPerMillion === undefined
    ? null
    : contributionCost('long_context_input');
  const longContextOutputCost = offer?.longContextInputMicroDollarsPerMillion === undefined || offer?.longContextOutputMicroDollarsPerMillion === undefined
    ? null
    : contributionCost('long_context_output');
  return [
    ...sourceItems,
    {
      kind: 'derived_cost',
      label: 'Scenario input cost',
      valueMicroDollars: inputCost,
      priceEffectiveAt,
      assumption: 'Monthly input tokens × published input price per million tokens.',
    },
    ...(cachedInputCost === null ? [] : [{
      kind: 'derived_cost' as const,
      label: 'Scenario cached-input cost',
      valueMicroDollars: cachedInputCost,
      priceEffectiveAt,
      assumption: 'Configured cached-input tokens × published cached-input price per million tokens.',
    }]),
    ...(cacheWriteCost === null ? [] : [{
      kind: 'derived_cost' as const,
      label: 'Scenario cache-write cost',
      valueMicroDollars: cacheWriteCost,
      priceEffectiveAt,
      assumption: 'Configured cache-write tokens × published cache-write price per million tokens.',
    }]),
    ...(longContextInputCost === null || longContextOutputCost === null ? [] : [
      {
        kind: 'derived_cost' as const,
        label: 'Scenario long-context input cost',
        valueMicroDollars: longContextInputCost,
        priceEffectiveAt,
        assumption: 'Configured long-context tokens are split by the workload input/output mix and priced by the published long-context tier.',
      },
      {
        kind: 'derived_cost' as const,
        label: 'Scenario long-context output cost',
        valueMicroDollars: longContextOutputCost,
        priceEffectiveAt,
        assumption: 'Configured long-context tokens are split by the workload input/output mix and priced by the published long-context tier.',
      },
    ]),
    {
      kind: 'derived_cost',
      label: 'Scenario output cost',
      valueMicroDollars: outputCost,
      priceEffectiveAt,
      assumption: 'Monthly output tokens × published output price per million tokens.',
    },
    {
      kind: 'assumption',
      label: 'Calculation assumptions',
      valueMicroDollars: null,
      priceEffectiveAt,
      assumption: 'Sourced cached-input tokens replace their standard input share; separately configured cache-write and long-context tokens are added only when their published route price dimension is complete. Missing price dimensions are not zero.',
    },
    ...(offer?.cachedInputMicroDollarsPerMillion === undefined ? [{
      kind: 'assumption' as const,
      label: 'Cached-input price',
      valueMicroDollars: null,
      priceEffectiveAt,
      assumption: 'Cached-input price is unavailable and excluded from the scenario; it is not treated as zero.',
    }] : []),
    ...(offer?.cacheWriteMicroDollarsPerMillion === undefined ? [{
      kind: 'assumption' as const,
      label: 'Cache-write price',
      valueMicroDollars: null,
      priceEffectiveAt,
      assumption: 'Cache-write price is unavailable and excluded from the scenario; it is not treated as zero.',
    }] : []),
    ...(offer?.longContextInputMicroDollarsPerMillion === undefined || offer?.longContextOutputMicroDollarsPerMillion === undefined ? [{
      kind: 'assumption' as const,
      label: 'Long-context tier',
      valueMicroDollars: null,
      priceEffectiveAt,
      assumption: 'Long-context tier price is unavailable and excluded from the scenario; it is not treated as zero.',
    }] : []),
  ];
}

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

/** CSV mirrors the displayed audit rows without serializing an undefined field. */
export function calculatorCsv(lineItems: readonly CalculatorEvidenceLineItem[]): string {
  const header = ['kind', 'label', 'value_micro_dollars', 'price_effective_at', 'assumption'];
  const rows = lineItems.map((item) => [
    item.kind,
    item.label,
    item.valueMicroDollars,
    item.priceEffectiveAt,
    item.assumption,
  ].map(csvCell).join(','));
  return [header.join(','), ...rows].join('\n');
}
