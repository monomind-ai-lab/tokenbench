import { compareUtf8Binary } from '../benchmarks/contracts';
import type { CatalogResponse } from '../catalog/contracts';
import { defaultApiEquivalentForPlan } from '../catalog/plan-api-equivalent';
import type { ConversationWorkload } from '../catalog/subscription-api-calculator';
import { isPaidIndividualPlan } from './plan-filter';
import type { CalculatorCostUsage } from './calculator-state';

const SHARE_VERSION = '2';
const SHARE_KEYS = ['c', 'm', 'i', 'o', 'd', 'models', 'weights', 'provider', 'plan'] as const;
const BREAKEVEN_KEYS = ['mode', 'seats', 'fee', 'volume', 'input_share', 'input_price', 'output_price', 'be_cache_read', 'be_cache_write', 'be_long_context'] as const;
const LEGACY_KEYS = ['input', 'tokens'] as const;
const COST_USAGE_KEYS = ['chars', 'factor', 'manual', 'cache_read', 'cache_write', 'long_context'] as const;
type ShareKey = (typeof SHARE_KEYS)[number];

export interface CalculatorShareState {
  readonly providerId: string;
  readonly planId: string;
  readonly workload: ConversationWorkload;
  readonly selectedModelIds: readonly string[];
  readonly modelMixBasisPoints: Readonly<Record<string, number>>;
  readonly mappingMode: 'default' | 'override';
  readonly costUsage?: CalculatorCostUsage;
}

export interface DecodedCalculatorShareState {
  readonly state: CalculatorShareState;
  readonly wasNormalized: boolean;
}

/**
 * A bounded, non-sensitive result state. Numeric scenario inputs are accepted
 * only inside the same UI limits as the controls; free text and arbitrary URLs
 * are never part of a share link.
 */
export interface BreakevenShareState {
  readonly calculator: CalculatorShareState;
  readonly seats: number;
  readonly feePerSeat: number;
  readonly maxTokensMillions: number;
  readonly inputShareBasisPoints: number;
  readonly inputPricePerMillion: number | null;
  readonly outputPricePerMillion: number | null;
  readonly cacheReadBasisPoints: number;
  readonly cacheWriteTokens: number;
  readonly longContextTokens: number;
}

export interface DecodedBreakevenShareState {
  readonly state: BreakevenShareState;
  readonly wasNormalized: boolean;
}

function readSingleStateValue(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key);
  return values.length === 1 ? values[0] : null;
}

function parseInteger(value: string, minimum: number, maximum: number): number | null {
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function parseDecimal(value: string, minimum: number, maximum: number): number | null {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function parseList(value: string): string[] | null {
  const values = value.split(',');
  return values.length > 0 && values.every(Boolean) ? values : null;
}

function normalizeWeights(entries: readonly { readonly id: string; readonly weight: number }[]): Record<string, number> | null {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return null;

  const normalized = entries.map((entry, index) => {
    const scaled = entry.weight * 10_000;
    const value = Math.floor(scaled / total);
    return { ...entry, index, value, remainder: scaled % total };
  });
  const remaining = 10_000 - normalized.reduce((sum, entry) => sum + entry.value, 0);
  const largestRemainders = [...normalized].sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  largestRemainders.slice(0, remaining).forEach((entry) => { entry.value += 1; });

  return Object.fromEntries(normalized.map(({ id, value }) => [id, value]));
}

function legacyWorkload(inputShareBasisPoints: number, monthlyTokens: number): ConversationWorkload {
  const safeTokens = Math.max(0, monthlyTokens);
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

function defaultOfferForState(providerId: string, planId: string, catalog: CatalogResponse) {
  const plan = catalog.plans.find((candidate) => candidate.id === planId && candidate.providerId === providerId && isPaidIndividualPlan(candidate));
  if (plan) return defaultApiEquivalentForPlan(plan, catalog.modelOffers);
  return catalog.modelOffers
    .filter((offer) => offer.providerId === providerId && offer.pricingBasis === 'direct_provider_api' && offer.route === 'direct_provider')
    .sort((left, right) => compareUtf8Binary(left.modelId, right.modelId) || compareUtf8Binary(left.id, right.id))[0] ?? null;
}

function inferredMappingMode(
  providerId: string,
  planId: string,
  selectedModelIds: readonly string[],
  modelMixBasisPoints: Readonly<Record<string, number>>,
  catalog: CatalogResponse,
): 'default' | 'override' {
  const defaultOffer = defaultOfferForState(providerId, planId, catalog);
  return defaultOffer
    && selectedModelIds.length === 1
    && selectedModelIds[0] === defaultOffer.id
    && modelMixBasisPoints[defaultOffer.id] === 10_000
    ? 'default'
    : 'override';
}

export function encodeCalculatorShareState(state: CalculatorShareState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('v', SHARE_VERSION);
  params.set('c', String(state.workload.conversationsPerDay));
  params.set('m', String(state.workload.messagesPerConversation));
  params.set('i', String(state.workload.inputTokensPerMessage));
  params.set('o', String(state.workload.outputTokensPerMessage));
  params.set('d', String(state.workload.activeDaysPerMonth));
  params.set('models', state.selectedModelIds.join(','));
  params.set('weights', state.selectedModelIds.map((id) => state.modelMixBasisPoints[id]).join(','));
  params.set('provider', state.providerId);
  params.set('plan', state.planId);
  if (state.costUsage) {
    params.set('chars', String(state.costUsage.characterCount));
    params.set('factor', String(state.costUsage.charactersPerToken));
    params.set('manual', state.costUsage.manualMonthlyTokens === null ? 'none' : String(state.costUsage.manualMonthlyTokens));
    params.set('cache_read', String(state.costUsage.cacheReadBasisPoints));
    params.set('cache_write', String(state.costUsage.cacheWriteTokens));
    params.set('long_context', String(state.costUsage.longContextTokens));
  }
  return params;
}

export function decodeCalculatorShareState(params: URLSearchParams, catalog: CatalogResponse): DecodedCalculatorShareState | null {
  const version = readSingleStateValue(params, 'v');
  if (params.has('v') && version !== SHARE_VERSION) return null;
  const values = SHARE_KEYS.map((key) => readSingleStateValue(params, key));
  const [encodedConversations, encodedMessages, encodedInputTokens, encodedOutputTokens, encodedDays, encodedModelIds, encodedWeights, providerId, planId] = values;
  if (providerId === null || planId === null || encodedModelIds === null || encodedWeights === null) return null;

  const hasLegacy = LEGACY_KEYS.some((key) => params.has(key));
  const hasNewWorkload = values.slice(0, 5).every((value) => value !== null);
  const hasAnyNewWorkload = SHARE_KEYS.slice(0, 5).some((key) => params.has(key));
  if (hasAnyNewWorkload && !hasNewWorkload) return null;
  let workload: ConversationWorkload;
  if (hasNewWorkload) {
    const conversationsPerDay = parseInteger(encodedConversations!, 0, 10_000);
    const messagesPerConversation = parseInteger(encodedMessages!, 0, 1_000);
    const inputTokensPerMessage = parseInteger(encodedInputTokens!, 0, 1_000_000);
    const outputTokensPerMessage = parseInteger(encodedOutputTokens!, 0, 1_000_000);
    const activeDaysPerMonth = parseInteger(encodedDays!, 0, 31);
    if ([conversationsPerDay, messagesPerConversation, inputTokensPerMessage, outputTokensPerMessage, activeDaysPerMonth].some((value) => value === null)) return null;
    workload = { conversationsPerDay, messagesPerConversation, inputTokensPerMessage, outputTokensPerMessage, activeDaysPerMonth };
  } else {
    const encodedInputShare = readSingleStateValue(params, 'input');
    const encodedMonthlyTokens = readSingleStateValue(params, 'tokens');
    if (!encodedInputShare || !encodedMonthlyTokens) return null;
    const inputShareBasisPoints = parseInteger(encodedInputShare, 0, 10_000);
    const monthlyTokens = parseInteger(encodedMonthlyTokens, 0, Number.MAX_SAFE_INTEGER);
    if (inputShareBasisPoints === null || monthlyTokens === null) return null;
    workload = legacyWorkload(inputShareBasisPoints, monthlyTokens);
  }

  const selectedModelIds = parseList(encodedModelIds);
  const encodedWeightValues = parseList(encodedWeights);
  if (!selectedModelIds || !encodedWeightValues || selectedModelIds.length !== encodedWeightValues.length) return null;
  if (new Set(selectedModelIds).size !== selectedModelIds.length) return null;

  const weights: number[] = [];
  for (const value of encodedWeightValues) {
    const weight = parseInteger(value, 0, 10_000);
    if (weight === null) return null;
    weights.push(weight);
  }
  if (weights.reduce((sum, weight) => sum + weight, 0) !== 10_000) return null;

  const providerExists = catalog.modelOffers.some((offer) => offer.providerId === providerId)
    || catalog.plans.some((plan) => plan.providerId === providerId);
  if (!providerExists) return null;

  const availableModelIds = new Set(catalog.modelOffers.filter((offer) => offer.providerId === providerId).map((offer) => offer.id));
  const survivingModels = selectedModelIds.flatMap((id, index) => availableModelIds.has(id) ? [{ id, weight: weights[index] }] : []);
  const modelMixBasisPoints = normalizeWeights(survivingModels);
  if (!modelMixBasisPoints) return null;

  const normalizedModelIds = survivingModels.map((entry) => entry.id);
  const hasValidPlan = planId === '' || catalog.plans.some((plan) => (
    plan.id === planId
    && plan.providerId === providerId
    && isPaidIndividualPlan(plan)
  ));
  const normalizedPlanId = hasValidPlan ? planId : '';
  const modelsChanged = normalizedModelIds.length !== selectedModelIds.length
    || normalizedModelIds.some((id, index) => id !== selectedModelIds[index])
    || normalizedModelIds.some((id, index) => modelMixBasisPoints[id] !== weights[index]);
  const mappingMode = inferredMappingMode(providerId, normalizedPlanId, normalizedModelIds, modelMixBasisPoints, catalog);
  const costValues = Object.fromEntries(COST_USAGE_KEYS.map((key) => [key, readSingleStateValue(params, key)]));
  const hasCostUsage = COST_USAGE_KEYS.some((key) => params.has(key));
  let costUsage: CalculatorCostUsage | undefined;
  if (hasCostUsage) {
    if (costValues.chars === null || costValues.factor === null || costValues.manual === null || costValues.cache_read === null || costValues.cache_write === null || costValues.long_context === null) return null;
    const characterCount = parseInteger(costValues.chars, 0, 1_000_000_000);
    const charactersPerToken = parseInteger(costValues.factor, 1, 32);
    const manualMonthlyTokens = costValues.manual === 'none' ? null : parseInteger(costValues.manual, 0, 1_000_000_000);
    const cacheReadBasisPoints = parseInteger(costValues.cache_read, 0, 10_000);
    const cacheWriteTokens = parseInteger(costValues.cache_write, 0, 1_000_000_000);
    const longContextTokens = parseInteger(costValues.long_context, 0, 1_000_000_000);
    if (characterCount === null || charactersPerToken === null || manualMonthlyTokens === null && costValues.manual !== 'none'
      || cacheReadBasisPoints === null || cacheWriteTokens === null || longContextTokens === null) return null;
    costUsage = { characterCount, charactersPerToken, manualMonthlyTokens, cacheReadBasisPoints, cacheWriteTokens, longContextTokens };
  }

  return {
    state: {
      providerId,
      planId: normalizedPlanId,
      workload,
      selectedModelIds: normalizedModelIds,
      modelMixBasisPoints,
      mappingMode,
      ...(costUsage ? { costUsage } : {}),
    },
    wasNormalized: version !== SHARE_VERSION || hasLegacy || normalizedPlanId !== planId || modelsChanged,
  };
}

export function encodeBreakevenShareState(state: BreakevenShareState): URLSearchParams {
  const params = encodeCalculatorShareState(state.calculator);
  params.set('mode', 'breakeven');
  params.set('seats', String(state.seats));
  params.set('fee', String(state.feePerSeat));
  params.set('volume', String(state.maxTokensMillions));
  params.set('input_share', String(state.inputShareBasisPoints));
  if (state.inputPricePerMillion !== null) params.set('input_price', String(state.inputPricePerMillion));
  if (state.outputPricePerMillion !== null) params.set('output_price', String(state.outputPricePerMillion));
  params.set('be_cache_read', String(state.cacheReadBasisPoints));
  params.set('be_cache_write', String(state.cacheWriteTokens));
  params.set('be_long_context', String(state.longContextTokens));
  return params;
}

/** Decodes only the allowlisted bounded state produced by encodeBreakevenShareState. */
export function decodeBreakevenShareState(params: URLSearchParams, catalog: CatalogResponse): DecodedBreakevenShareState | null {
  const calculator = decodeCalculatorShareState(params, catalog);
  if (!calculator || readSingleStateValue(params, 'mode') !== 'breakeven') return null;
  const values = Object.fromEntries(BREAKEVEN_KEYS.map((key) => [key, readSingleStateValue(params, key)]));
  if (values.seats === null || values.fee === null || values.volume === null || values.input_share === null
    || values.be_cache_read === null || values.be_cache_write === null || values.be_long_context === null) return null;
  const seats = parseInteger(values.seats, 1, 50);
  const feePerSeat = parseDecimal(values.fee, 0, 100_000);
  const maxTokensMillions = parseDecimal(values.volume, 0, 300);
  const inputShareBasisPoints = parseInteger(values.input_share, 0, 10_000);
  const cacheReadBasisPoints = parseInteger(values.be_cache_read, 0, 10_000);
  const cacheWriteTokens = parseInteger(values.be_cache_write, 0, 1_000_000_000);
  const longContextTokens = parseInteger(values.be_long_context, 0, 1_000_000_000);
  const inputPricePerMillion = values.input_price === null ? null : parseDecimal(values.input_price, 0, 100_000);
  const outputPricePerMillion = values.output_price === null ? null : parseDecimal(values.output_price, 0, 100_000);
  if (seats === null || feePerSeat === null || maxTokensMillions === null || inputShareBasisPoints === null
    || cacheReadBasisPoints === null || cacheWriteTokens === null || longContextTokens === null
    || (values.input_price !== null && inputPricePerMillion === null)
    || (values.output_price !== null && outputPricePerMillion === null)) return null;
  return {
    state: {
      calculator: calculator.state,
      seats,
      feePerSeat,
      maxTokensMillions,
      inputShareBasisPoints,
      inputPricePerMillion,
      outputPricePerMillion,
      cacheReadBasisPoints,
      cacheWriteTokens,
      longContextTokens,
    },
    wasNormalized: calculator.wasNormalized,
  };
}
