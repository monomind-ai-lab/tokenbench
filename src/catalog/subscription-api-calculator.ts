const MILLION = 1_000_000n;
const BASIS_POINTS = 10_000;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

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
}

export interface SubscriptionApiResult extends SubscriptionApiComparison {
  readonly derivedWorkload: DerivedConversationWorkload;
  readonly apiEquivalentCost: ApiEquivalentCost;
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
  const apiEquivalentCost = calculateApiEquivalentCost(derivedWorkload, input);
  return {
    ...compareSubscriptionWithApi(input.planCostMicroDollars, derivedWorkload, apiEquivalentCost, workload.activeDaysPerMonth),
    derivedWorkload,
    apiEquivalentCost,
  };
}
