const MILLION = 1_000_000n;
const BASIS_POINTS = 10_000;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const CROSSOVER_DOMAIN_TOKENS = [0, 25_000_000, 50_000_000, 100_000_000, 150_000_000, 200_000_000, 250_000_000, 300_000_000] as const;

type WorkloadKey = keyof ConversationWorkload;

export interface ConversationWorkload {
  readonly conversationsPerDay: number;
  readonly messagesPerConversation: number;
  readonly inputTokensPerMessage: number;
  readonly outputTokensPerMessage: number;
  readonly activeDaysPerMonth: number;
}

export interface DerivedConversationWorkload {
  readonly monthlyMessages: number;
  readonly monthlyInputTokens: number;
  readonly monthlyOutputTokens: number;
}

export interface ApiRates {
  readonly inputMicroDollarsPerMillion: number;
  readonly outputMicroDollarsPerMillion: number;
  readonly cachedInputMicroDollarsPerMillion?: number;
  readonly cacheWriteMicroDollarsPerMillion?: number;
  readonly longContextInputMicroDollarsPerMillion?: number;
}

export interface ApiEquivalentCost {
  readonly inputCostMicroDollars: number;
  readonly outputCostMicroDollars: number;
  readonly apiCostMicroDollars: number;
}

export interface SubscriptionApiComparison {
  readonly apiCostMicroDollars: number;
  /** Positive means the subscription is cheaper; negative means API is cheaper. */
  readonly differenceMicroDollars: number;
  readonly efficiencyBasisPoints: number | null;
  readonly apiCostPerMessageMicroDollars: number | null;
  readonly breakEvenMessagesPerDay: number | null;
  readonly cheaper: 'subscription' | 'api' | 'equal';
}

export interface SubscriptionApiCalculationInput extends ConversationWorkload, ApiRates {
  readonly planCostMicroDollars: number;
  /** The comparison is a seat-based scenario, distinct from the selected plan source price. */
  readonly seats?: number;
  /** A selected point in the bounded crossover domain, in tokens. */
  readonly tokenVolume?: number;
  readonly cacheReadShareBasisPoints?: number;
  readonly cacheWriteShareBasisPoints?: number;
  readonly longContext?: boolean;
}

export interface CrossoverDomainPoint {
  readonly tokens: number;
  readonly monthlySubscriptionUsd: number;
  readonly apiUsd: number;
}

export interface CrossoverResult {
  readonly monthlySubscriptionUsd: number;
  readonly selectedVolumeApiUsd: number;
  readonly crossoverTokens: number | null;
  readonly domain: readonly CrossoverDomainPoint[];
}

export interface ApiCostLineItem {
  readonly id: 'standard-input' | 'cache-read' | 'cache-write' | 'output';
  readonly tokens: number;
  readonly rateMicroDollarsPerMillion: number;
  readonly costMicroDollars: number;
}

export interface SubscriptionApiResult extends SubscriptionApiComparison {
  readonly derivedWorkload: DerivedConversationWorkload;
  readonly apiEquivalentCost: ApiEquivalentCost;
  readonly adjustedInputTokens: number;
  readonly lineItems: readonly ApiCostLineItem[];
  readonly crossover: CrossoverResult;
  readonly monthlySubscriptionUsd: number;
  readonly selectedVolumeApiUsd: number;
  readonly crossoverTokens: number | null;
  readonly domain: readonly CrossoverDomainPoint[];
}

function requireSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a finite safe integer`);
  return value as number;
}

function requireBoundedInteger(value: unknown, key: WorkloadKey, minimum: number, maximum: number): number {
  const parsed = requireSafeInteger(value, key);
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${key} must be an integer between ${minimum.toLocaleString()} and ${maximum.toLocaleString()}`);
  }
  return parsed;
}

function requireNonNegativeSafeInteger(value: unknown, label: string): number {
  const parsed = requireSafeInteger(value, label);
  if (parsed < 0) throw new Error(`${label} must be a non-negative integer`);
  return parsed;
}

function optionalBoundedInteger(value: number | undefined, label: string, minimum: number, maximum: number, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = requireSafeInteger(value, label);
  if (parsed < minimum || parsed > maximum) throw new Error(`${label} must be an integer between ${minimum.toLocaleString()} and ${maximum.toLocaleString()}`);
  return parsed;
}

function safeNumber(value: bigint, label: string): number {
  if (value < 0n || value > MAX_SAFE_BIGINT) throw new Error(`${label} overflow exceeds the safe integer range`);
  return Number(value);
}

function safeSignedNumber(value: bigint, label: string): number {
  if (value < -MAX_SAFE_BIGINT || value > MAX_SAFE_BIGINT) throw new Error(`${label} overflow exceeds the safe integer range`);
  return Number(value);
}

function roundedMicroDollars(tokens: number, rateMicroDollarsPerMillion: number, label = 'API-equivalent cost'): number {
  const numerator = BigInt(tokens) * BigInt(rateMicroDollarsPerMillion);
  return safeNumber((numerator + 500_000n) / MILLION, label);
}

function roundedRatio(numerator: number, denominator: number, label: string): number {
  return safeNumber((BigInt(numerator) + BigInt(denominator) / 2n) / BigInt(denominator), label);
}

export function normalizeConversationWorkload(value: ConversationWorkload): ConversationWorkload {
  return {
    conversationsPerDay: requireBoundedInteger(value.conversationsPerDay, 'conversationsPerDay', 0, 10_000),
    messagesPerConversation: requireBoundedInteger(value.messagesPerConversation, 'messagesPerConversation', 0, 1_000),
    inputTokensPerMessage: requireBoundedInteger(value.inputTokensPerMessage, 'inputTokensPerMessage', 0, 1_000_000),
    outputTokensPerMessage: requireBoundedInteger(value.outputTokensPerMessage, 'outputTokensPerMessage', 0, 1_000_000),
    activeDaysPerMonth: requireBoundedInteger(value.activeDaysPerMonth, 'activeDaysPerMonth', 0, 31),
  };
}

export function deriveConversationWorkload(workload: ConversationWorkload): DerivedConversationWorkload {
  const normalized = normalizeConversationWorkload(workload);
  const monthlyMessages = BigInt(normalized.conversationsPerDay)
    * BigInt(normalized.messagesPerConversation)
    * BigInt(normalized.activeDaysPerMonth);
  return {
    monthlyMessages: safeNumber(monthlyMessages, 'Monthly messages'),
    monthlyInputTokens: safeNumber(monthlyMessages * BigInt(normalized.inputTokensPerMessage), 'Monthly input tokens'),
    monthlyOutputTokens: safeNumber(monthlyMessages * BigInt(normalized.outputTokensPerMessage), 'Monthly output tokens'),
  };
}

export function calculateApiEquivalentCost(derived: DerivedConversationWorkload, rates: ApiRates): ApiEquivalentCost {
  const monthlyMessages = requireNonNegativeSafeInteger(derived.monthlyMessages, 'monthlyMessages');
  const monthlyInputTokens = requireNonNegativeSafeInteger(derived.monthlyInputTokens, 'monthlyInputTokens');
  const monthlyOutputTokens = requireNonNegativeSafeInteger(derived.monthlyOutputTokens, 'monthlyOutputTokens');
  // Validate every derived component before pricing, including the message count
  // that is used by the comparison stage.
  void monthlyMessages;
  const inputRate = requireNonNegativeSafeInteger(rates.inputMicroDollarsPerMillion, 'inputMicroDollarsPerMillion');
  const outputRate = requireNonNegativeSafeInteger(rates.outputMicroDollarsPerMillion, 'outputMicroDollarsPerMillion');
  const inputCostMicroDollars = roundedMicroDollars(monthlyInputTokens, inputRate, 'Input API-equivalent cost');
  const outputCostMicroDollars = roundedMicroDollars(monthlyOutputTokens, outputRate, 'Output API-equivalent cost');
  const apiCostMicroDollars = safeNumber(
    BigInt(inputCostMicroDollars) + BigInt(outputCostMicroDollars),
    'API-equivalent cost',
  );
  return { inputCostMicroDollars, outputCostMicroDollars, apiCostMicroDollars };
}

function roundedShare(total: number, shareBasisPoints: number, label: string): number {
  return safeNumber(
    (BigInt(total) * BigInt(shareBasisPoints) + 5_000n) / BigInt(BASIS_POINTS),
    label,
  );
}

function crossoverResult(
  planCostMicroDollars: number,
  seats: number,
  tokenVolume: number,
  totalTokens: number,
  apiCostMicroDollars: number,
): CrossoverResult {
  const subscriptionMicroDollars = safeNumber(
    BigInt(planCostMicroDollars) * BigInt(seats),
    'Monthly subscription cost',
  );
  const monthlySubscriptionUsd = subscriptionMicroDollars / 1_000_000;
  const rateMicroDollarsPerMillion = totalTokens > 0
    ? (apiCostMicroDollars * 1_000_000) / totalTokens
    : 0;
  const apiUsd = (tokens: number) => tokens * rateMicroDollarsPerMillion / 1_000_000_000_000;
  const crossoverTokens = rateMicroDollarsPerMillion > 0
    ? subscriptionMicroDollars * 1_000_000 / rateMicroDollarsPerMillion
    : null;
  const tokens = new Set<number>([...CROSSOVER_DOMAIN_TOKENS, tokenVolume]);
  if (crossoverTokens !== null && crossoverTokens >= 0 && crossoverTokens <= 300_000_000) tokens.add(crossoverTokens);
  const domain = [...tokens]
    .sort((left, right) => left - right)
    .map((point) => ({ tokens: point, monthlySubscriptionUsd, apiUsd: apiUsd(point) }));
  return {
    monthlySubscriptionUsd,
    selectedVolumeApiUsd: apiUsd(tokenVolume),
    crossoverTokens,
    domain,
  };
}

export function compareSubscriptionWithApi(
  planCostMicroDollars: number,
  derived: DerivedConversationWorkload,
  apiCost: ApiEquivalentCost,
  activeDaysPerMonth?: number,
): SubscriptionApiComparison {
  const planCost = requireNonNegativeSafeInteger(planCostMicroDollars, 'planCostMicroDollars');
  const apiCostMicroDollars = requireNonNegativeSafeInteger(apiCost.apiCostMicroDollars, 'apiCostMicroDollars');
  const monthlyMessages = requireNonNegativeSafeInteger(derived.monthlyMessages, 'monthlyMessages');
  const differenceMicroDollars = safeSignedNumber(
    BigInt(apiCostMicroDollars) - BigInt(planCost),
    'Subscription/API difference',
  );
  const efficiencyBasisPoints = apiCostMicroDollars > 0
    ? Math.round((differenceMicroDollars / apiCostMicroDollars) * BASIS_POINTS)
    : null;
  const apiCostPerMessageMicroDollars = monthlyMessages > 0 && apiCostMicroDollars > 0
    ? roundedRatio(apiCostMicroDollars, monthlyMessages, 'API cost per message')
    : null;
  const days = activeDaysPerMonth === undefined
    ? null
    : requireBoundedInteger(activeDaysPerMonth, 'activeDaysPerMonth', 0, 31);
  const breakEvenMessagesPerDay = days !== null && days > 0 && monthlyMessages > 0 && apiCostMicroDollars > 0
    ? safeNumber(
      (BigInt(planCost) * BigInt(monthlyMessages) + (BigInt(apiCostMicroDollars) * BigInt(days)) - 1n)
        / (BigInt(apiCostMicroDollars) * BigInt(days)),
      'Breakeven messages per day',
    )
    : null;
  const cheaper = planCost < apiCostMicroDollars
    ? 'subscription'
    : planCost > apiCostMicroDollars
      ? 'api'
      : 'equal';
  return {
    apiCostMicroDollars,
    differenceMicroDollars,
    efficiencyBasisPoints,
    apiCostPerMessageMicroDollars,
    breakEvenMessagesPerDay,
    cheaper,
  };
}

export function calculateSubscriptionApiResult(input: SubscriptionApiCalculationInput): SubscriptionApiResult {
  const workload = normalizeConversationWorkload(input);
  const derivedWorkload = deriveConversationWorkload(workload);
  const seats = optionalBoundedInteger(input.seats, 'seats', 1, 50, 1);
  const tokenVolume = optionalBoundedInteger(input.tokenVolume, 'tokenVolume', 0, 300_000_000, 0);
  const cacheReadShareBasisPoints = optionalBoundedInteger(input.cacheReadShareBasisPoints, 'cacheReadShareBasisPoints', 0, BASIS_POINTS, 0);
  const cacheWriteShareBasisPoints = optionalBoundedInteger(input.cacheWriteShareBasisPoints, 'cacheWriteShareBasisPoints', 0, BASIS_POINTS, 0);
  if (cacheReadShareBasisPoints + cacheWriteShareBasisPoints > BASIS_POINTS) {
    throw new Error('Cache read and write shares must not exceed 10,000 basis points');
  }
  const inputMultiplierBasisPoints = input.longContext ? 15_000 : 10_000;
  const adjustedInputTokens = roundedShare(derivedWorkload.monthlyInputTokens, inputMultiplierBasisPoints, 'Adjusted input tokens');
  const cacheReadTokens = roundedShare(adjustedInputTokens, cacheReadShareBasisPoints, 'Cache-read tokens');
  const cacheWriteTokens = roundedShare(adjustedInputTokens, cacheWriteShareBasisPoints, 'Cache-write tokens');
  const standardInputTokens = adjustedInputTokens - cacheReadTokens - cacheWriteTokens;
  const inputRate = requireNonNegativeSafeInteger(input.inputMicroDollarsPerMillion, 'inputMicroDollarsPerMillion');
  const cacheReadRate = input.cachedInputMicroDollarsPerMillion === undefined
    ? inputRate
    : requireNonNegativeSafeInteger(input.cachedInputMicroDollarsPerMillion, 'cachedInputMicroDollarsPerMillion');
  const cacheWriteRate = input.cacheWriteMicroDollarsPerMillion === undefined
    ? inputRate
    : requireNonNegativeSafeInteger(input.cacheWriteMicroDollarsPerMillion, 'cacheWriteMicroDollarsPerMillion');
  const longContextRate = input.longContextInputMicroDollarsPerMillion === undefined
    ? inputRate
    : requireNonNegativeSafeInteger(input.longContextInputMicroDollarsPerMillion, 'longContextInputMicroDollarsPerMillion');
  const standardInputRate = input.longContext ? longContextRate : inputRate;
  const outputRate = requireNonNegativeSafeInteger(input.outputMicroDollarsPerMillion, 'outputMicroDollarsPerMillion');
  const lineItems: readonly ApiCostLineItem[] = [
    { id: 'standard-input', tokens: standardInputTokens, rateMicroDollarsPerMillion: standardInputRate, costMicroDollars: roundedMicroDollars(standardInputTokens, standardInputRate, 'Standard-input API-equivalent cost') },
    { id: 'cache-read', tokens: cacheReadTokens, rateMicroDollarsPerMillion: cacheReadRate, costMicroDollars: roundedMicroDollars(cacheReadTokens, cacheReadRate, 'Cache-read API-equivalent cost') },
    { id: 'cache-write', tokens: cacheWriteTokens, rateMicroDollarsPerMillion: cacheWriteRate, costMicroDollars: roundedMicroDollars(cacheWriteTokens, cacheWriteRate, 'Cache-write API-equivalent cost') },
    { id: 'output', tokens: derivedWorkload.monthlyOutputTokens, rateMicroDollarsPerMillion: outputRate, costMicroDollars: roundedMicroDollars(derivedWorkload.monthlyOutputTokens, outputRate, 'Output API-equivalent cost') },
  ];
  const inputCostMicroDollars = safeNumber(
    BigInt(lineItems[0].costMicroDollars) + BigInt(lineItems[1].costMicroDollars) + BigInt(lineItems[2].costMicroDollars),
    'Input API-equivalent cost',
  );
  const outputCostMicroDollars = lineItems[3].costMicroDollars;
  const apiEquivalentCost = {
    inputCostMicroDollars,
    outputCostMicroDollars,
    apiCostMicroDollars: safeNumber(BigInt(inputCostMicroDollars) + BigInt(outputCostMicroDollars), 'API-equivalent cost'),
  };
  const crossover = crossoverResult(
    input.planCostMicroDollars,
    seats,
    tokenVolume,
    adjustedInputTokens + derivedWorkload.monthlyOutputTokens,
    apiEquivalentCost.apiCostMicroDollars,
  );
  return {
    ...compareSubscriptionWithApi(input.planCostMicroDollars * seats, derivedWorkload, apiEquivalentCost, workload.activeDaysPerMonth),
    derivedWorkload,
    apiEquivalentCost,
    adjustedInputTokens,
    lineItems,
    crossover,
    ...crossover,
  };
}
