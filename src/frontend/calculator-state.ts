import {
  calculateApiEquivalentCost,
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

export interface BreakevenSeriesPoint {
  readonly tokens: number;
  readonly apiCostMicroDollars: number;
  readonly planFeeMicroDollars: number;
  readonly differenceMicroDollars: number;
}

export type BreakevenSeries =
  | { readonly status: 'available'; readonly points: BreakevenSeriesPoint[] }
  | { readonly status: 'unavailable'; readonly reason: string; readonly points: [] };

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
  readonly derivedWorkload: DerivedConversationWorkload;
  readonly selectedOffers: ModelOffer[];
  readonly mixEntries: ModelMixEntry[];
  readonly apiEquivalentCost: ApiEquivalentCost | null;
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
  readonly chartPoints: ChartPoint[];
}

export interface CalculatorEvidenceLineItem {
  readonly kind: 'source_price' | 'derived_cost' | 'assumption';
  readonly label: string;
  readonly valueMicroDollars: number | null;
  readonly priceEffectiveAt: string | null;
  readonly assumption: string | null;
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

function weightedRate(entries: readonly ModelMixEntry[], direction: 'inputMicroDollarsPerMillion' | 'outputMicroDollarsPerMillion'): number {
  const numerator = entries.reduce(
    (total, entry) => total + BigInt(entry.model[direction]) * BigInt(entry.shareBasisPoints),
    0n,
  );
  const value = (numerator + 5_000n) / 10_000n;
  if (value > SAFE_INTEGER_MAX) throw new Error(`${direction} weighted rate exceeds the safe integer range`);
  return Number(value);
}

function safeAdd(left: number, right: number, label: string): number {
  const sum = BigInt(left) + BigInt(right);
  if (sum > SAFE_INTEGER_MAX) throw new Error(`${label} exceeds the safe integer range`);
  return Number(sum);
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
}): CalculatorSnapshot {
  const snapshotWorkload = workload ?? legacyWorkload(inputShareBasisPoints ?? 5_000, monthlyTokens ?? 10_000_000);
  const derivedWorkload = deriveConversationWorkload(snapshotWorkload);
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
  const apiEquivalentCost = hasCompleteMix
    ? calculateApiEquivalentCost(derivedWorkload, {
      inputMicroDollarsPerMillion: weightedRate(arithmeticEntries, 'inputMicroDollarsPerMillion'),
      outputMicroDollarsPerMillion: weightedRate(arithmeticEntries, 'outputMicroDollarsPerMillion'),
    })
    : null;
  const comparison = apiEquivalentCost && selectedPlan
    ? compareSubscriptionWithApi(selectedPlan.monthlyCostMicroDollars, derivedWorkload, apiEquivalentCost, snapshotWorkload.activeDaysPerMonth)
    : null;
  const totalMonthlyTokens = safeAdd(derivedWorkload.monthlyInputTokens, derivedWorkload.monthlyOutputTokens, 'Monthly workload');
  const blendedCostPerMillion = hasCompleteMix
    ? Math.round((weightedRate(arithmeticEntries, 'inputMicroDollarsPerMillion') * (derivedWorkload.monthlyInputTokens / Math.max(1, totalMonthlyTokens)))
      + (weightedRate(arithmeticEntries, 'outputMicroDollarsPerMillion') * (derivedWorkload.monthlyOutputTokens / Math.max(1, totalMonthlyTokens))))
    : 0;
  const apiEquivalentValueMicroDollars = apiEquivalentCost?.apiCostMicroDollars ?? 0;
  const breakEvenTokens = selectedPlan?.entitlement.kind === 'fixed_tokens' && apiEquivalentCost && totalMonthlyTokens > 0
    ? breakEvenTokensForMonthlyCost(selectedPlan.monthlyCostMicroDollars, apiEquivalentCost.apiCostMicroDollars, totalMonthlyTokens)
    : null;
  const chartPoints = [0.25, 0.5, 0.75, 1, 1.25].map((multiplier) => ({
    tokens: Math.round(totalMonthlyTokens * multiplier),
    valueMicroDollars: Math.round(apiEquivalentValueMicroDollars * multiplier),
  }));

  return {
    workload: snapshotWorkload,
    derivedWorkload,
    selectedOffers,
    mixEntries: selectedMixEntries,
    apiEquivalentCost,
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
    chartPoints,
  };
}

export function buildBreakevenSeries(snapshot: CalculatorSnapshot): BreakevenSeries {
  if (!snapshot.selectedOffers.length) return { status: 'unavailable', reason: 'Select a model with published API pricing.', points: [] };
  if (!snapshot.apiEquivalentCost) return { status: 'unavailable', reason: 'The selected model mix does not provide complete published API pricing.', points: [] };
  if (snapshot.monthlyTokens <= 0) return { status: 'unavailable', reason: 'A positive workload is required before calculating breakeven.', points: [] };
  if (!snapshot.comparison) return { status: 'unavailable', reason: 'Select a paid individual plan with a published monthly fee.', points: [] };
  if (snapshot.capacityEvidence.status !== 'verified-covered' && snapshot.capacityEvidence.status !== 'verified-not-covered') {
    return { status: 'unavailable', reason: snapshot.capacityEvidence.explanation, points: [] };
  }
  if (snapshot.breakEvenTokens === null) return { status: 'unavailable', reason: 'The selected plan does not publish verified fixed-token capacity.', points: [] };
  if (snapshot.apiEquivalentCost.apiCostMicroDollars <= 0) {
    return { status: 'unavailable', reason: 'Published API pricing does not provide a positive denominator for breakeven.', points: [] };
  }
  const planFeeMicroDollars = snapshot.comparison.apiCostMicroDollars - snapshot.comparison.differenceMicroDollars;
  const breakeven = snapshot.breakEvenTokens;
  const tokenVolumes = [0, Math.floor(breakeven / 2), breakeven, Math.ceil(breakeven * 1.5), breakeven * 2];
  const costAtTokens = (tokens: number) => Number(
    (BigInt(snapshot.apiEquivalentCost!.apiCostMicroDollars) * BigInt(tokens) + BigInt(snapshot.monthlyTokens / 2))
      / BigInt(snapshot.monthlyTokens),
  );
  return {
    status: 'available',
    points: tokenVolumes.map((tokens) => {
      const apiCostMicroDollars = costAtTokens(tokens);
      return {
        tokens,
        apiCostMicroDollars,
        planFeeMicroDollars,
        differenceMicroDollars: apiCostMicroDollars - planFeeMicroDollars,
      };
    }),
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
  ];
  const inputCost = offer === null
    ? null
    : Math.round((snapshot.derivedWorkload.monthlyInputTokens / 1_000_000) * offer.inputMicroDollarsPerMillion);
  const outputCost = offer === null
    ? null
    : Math.round((snapshot.derivedWorkload.monthlyOutputTokens / 1_000_000) * offer.outputMicroDollarsPerMillion);
  return [
    ...sourceItems,
    {
      kind: 'derived_cost',
      label: 'Scenario input cost',
      valueMicroDollars: inputCost,
      priceEffectiveAt,
      assumption: 'Monthly input tokens × published input price per million tokens.',
    },
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
      assumption: 'Published input and output price dimensions are applied independently; missing price dimensions are not zero.',
    },
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
