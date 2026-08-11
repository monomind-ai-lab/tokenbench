import type { EntitlementEvidence, ModelOffer, PlanOffer, SourceProvenance } from './contracts';

export const MANUAL_SUBSCRIPTION_PROVIDER_IDS = ['alibaba', 'anthropic', 'deepseek', 'google', 'xai', 'kimi', 'openai', 'zai'] as const;
type ManualProviderId = typeof MANUAL_SUBSCRIPTION_PROVIDER_IDS[number];

export const MANUAL_SUBSCRIPTION_SOURCES: Record<ManualProviderId, Omit<SourceProvenance, 'observedAt'>> = {
  alibaba: { id: 'alibaba-subscription', providerId: 'alibaba', sourceUrl: 'https://www.alibabacloud.com/help/en/model-studio/coding-plan', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-10', evidenceLocator: 'Plan details', reviewStatus: 'verified' },
  anthropic: { id: 'anthropic-subscription', providerId: 'anthropic', sourceUrl: 'https://support.claude.com/en/articles/11049762-choose-a-claude-plan', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-10', evidenceLocator: 'Plan table', reviewStatus: 'verified' },
  deepseek: { id: 'deepseek-api', providerId: 'deepseek', sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
  google: { id: 'google-subscription', providerId: 'google', sourceUrl: 'https://one.google.com/about/plans', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-10', evidenceLocator: 'Google AI plan pricing', reviewStatus: 'verified' },
  xai: { id: 'xai-subscription', providerId: 'xai', sourceUrl: 'https://x.ai/pricing', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-10', evidenceLocator: 'SuperGrok monthly pricing', reviewStatus: 'verified' },
  kimi: { id: 'kimi-subscription', providerId: 'kimi', sourceUrl: 'https://www.kimi.com/help/membership/membership-pricing', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-10', evidenceLocator: 'Global membership pricing', reviewStatus: 'verified' },
  openai: { id: 'openai-subscription', providerId: 'openai', sourceUrl: 'https://chatgpt.com/pricing/', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-10', evidenceLocator: 'Individual monthly plans', reviewStatus: 'verified' },
  zai: { id: 'zai-subscription', providerId: 'zai', sourceUrl: 'https://z.ai/subscribe', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-10', evidenceLocator: 'Lite, Pro, and Max monthly plans', reviewStatus: 'verified' },
};

/** Alibaba publishes the Token Plan Personal Edition separately from Coding Plan. */
export const MANUAL_ALIBABA_TOKEN_SOURCE: Omit<SourceProvenance, 'observedAt'> = {
  id: 'alibaba-token-subscription', providerId: 'alibaba',
  sourceUrl: 'https://www.alibabacloud.com/en/campaign/ai-landing-page-token',
  sourceKind: 'manual_manifest', confidence: 'manual_verified',
  parserVersion: 'manual-2026-08-10', evidenceLocator: 'Token Plan Personal Edition monthly pricing', reviewStatus: 'verified',
};

/** OpenAI publishes API model prices separately from ChatGPT subscriptions. */
export const MANUAL_OPENAI_API_SOURCE: Omit<SourceProvenance, 'observedAt'> = {
  id: 'openai-api', providerId: 'openai',
  sourceUrl: 'https://developers.openai.com/api/docs/models/compare',
  sourceKind: 'manual_manifest', confidence: 'manual_verified',
  parserVersion: 'manual-2026-08-12', evidenceLocator: 'GPT-5.6 standard text-token pricing and model limits', reviewStatus: 'verified',
};

const rolling = (description: string) => ({ kind: 'rolling_limit' as const, description });
const guardrail = (description: string) => ({ kind: 'guardrail_limited' as const, description });
const credits = (description: string) => ({ kind: 'credits' as const, description });

/** Every entitlement fact in this manifest was read from its primary source on this date. */
export const ENTITLEMENT_ACCESSED_AT = '2026-08-10T00:00:00.000Z';

const ENTITLEMENT_SOURCE_URLS = {
  alibabaCoding: 'https://www.alibabacloud.com/help/en/model-studio/coding-plan',
  alibabaToken: 'https://www.alibabacloud.com/en/campaign/ai-landing-page-token',
  claudePro: 'https://support.claude.com/en/articles/8325606-what-is-the-pro-plan',
  claudeMax: 'https://support.claude.com/en/articles/11049741-what-is-the-max-plan',
  gemini: 'https://support.google.com/gemini/answer/16275805?hl=en',
  xai: 'https://x.ai/pricing',
  kimi: 'https://www.kimi.com/help/membership/membership-pricing',
  openai: 'https://learn.chatgpt.com/docs/pricing',
  zai: 'https://docs.z.ai/devpack/usage-policy',
} as const;

function evidenceSource(url: string, confidence: 'high' | 'medium' | 'low' = 'high') {
  return { url, accessedAt: ENTITLEMENT_ACCESSED_AT, confidence };
}

/**
 * A rolling five-hour allowance repeats 4.8 times per day, so a 30-day outer
 * ceiling multiplies the five-hour maximum by 144. The result is an upper
 * bound, never a guaranteed allowance: weekly caps may bind first.
 */
const THIRTY_DAY_ROLLING_5H_MULTIPLIER = 144;

const WEEKLY_TO_THIRTY_DAY_CAVEAT = 'A published weekly cap may bind before this 30-day ceiling is reached.';
const NO_TOKEN_CONVERSION_CAVEAT = 'The provider does not publish a stable token conversion for this unit.';

export const MANUAL_ALIBABA_TOKEN_PLANS: PlanOffer[] = [
  {
    id: 'alibaba:token-plan-lite', providerId: 'alibaba', displayName: 'Token Plan Lite', monthlyCostMicroDollars: 6_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: credits('Token Plan Personal Edition includes 10,000 Credits per month.'),
    entitlementEvidence: {
      status: 'verified',
      boundType: 'hard_max',
      dimensions: [{ metric: 'credits', max: 10_000, unit: 'credits', window: 'monthly' }],
      source: evidenceSource(ENTITLEMENT_SOURCE_URLS.alibabaToken),
    },
    sourceId: 'alibaba-token-subscription',
  },
  {
    id: 'alibaba:token-plan-standard', providerId: 'alibaba', displayName: 'Token Plan Standard', monthlyCostMicroDollars: 20_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: credits('Token Plan Personal Edition includes 40,000 Credits per month.'),
    entitlementEvidence: {
      status: 'stale',
      boundType: 'hard_max',
      dimensions: [{ metric: 'credits', max: 40_000, unit: 'credits', window: 'monthly' }],
      staleReason: 'The published Standard price has drifted from the stored value; the row cannot back a cost recommendation until the price is re-read.',
      source: evidenceSource(ENTITLEMENT_SOURCE_URLS.alibabaToken),
    },
    sourceId: 'alibaba-token-subscription',
  },
  {
    id: 'alibaba:token-plan-pro', providerId: 'alibaba', displayName: 'Token Plan Pro', monthlyCostMicroDollars: 70_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: credits('Token Plan Personal Edition includes 160,000 Credits per month.'),
    entitlementEvidence: {
      status: 'stale',
      boundType: 'hard_max',
      dimensions: [{ metric: 'credits', max: 160_000, unit: 'credits', window: 'monthly' }],
      staleReason: 'The published Pro price has drifted from the stored value; the row cannot back a cost recommendation until the price is re-read.',
      source: evidenceSource(ENTITLEMENT_SOURCE_URLS.alibabaToken),
    },
    sourceId: 'alibaba-token-subscription',
  },
];

function claudeRelativeCeiling(multiplier: number, label: string): EntitlementEvidence {
  return {
    status: 'projected',
    boundType: 'outer_ceiling',
    dimensions: [{ metric: 'messages', unit: 'messages', window: 'rolling_5h', resetRule: 'Rolling five-hour window' }],
    projection: {
      formula: `${multiplier} x F x ${THIRTY_DAY_ROLLING_5H_MULTIPLIER}`,
      assumptions: [
        'F is the unpublished free-tier session capacity and is not known to TokenBench.',
        `${label} is published only as a relative multiple of that capacity.`,
        'A rolling five-hour window repeats 144 times in 30 days.',
      ],
      caveats: [
        WEEKLY_TO_THIRTY_DAY_CAVEAT,
        'Because F is unknown, this projection yields no absolute message count.',
      ],
    },
    source: evidenceSource(multiplier === 5 ? ENTITLEMENT_SOURCE_URLS.claudePro : ENTITLEMENT_SOURCE_URLS.claudeMax),
  };
}

function geminiRelativeCeiling(multiplier: number, label: string): EntitlementEvidence {
  return {
    status: 'projected',
    boundType: 'outer_ceiling',
    dimensions: [{ metric: 'messages', unit: 'messages', window: 'rolling_5h', resetRule: 'Five-hour refresh' }],
    projection: {
      formula: `${multiplier} x S`,
      assumptions: [
        'S is the dynamic standard-session capacity Google does not publish as a fixed number.',
        `${label} is published only as a relative multiple of the standard tier.`,
      ],
      caveats: [
        WEEKLY_TO_THIRTY_DAY_CAVEAT,
        'Because S varies by region and demand, this projection yields no absolute message count.',
      ],
    },
    source: evidenceSource(ENTITLEMENT_SOURCE_URLS.gemini),
  };
}

/** OpenAI publishes per-model five-hour message bands; 30-day values are outer ceilings. */
function openAiMessageCeilings(
  bands: readonly { readonly modelId: string; readonly min: number; readonly max: number }[],
): EntitlementEvidence {
  return {
    status: 'projected',
    boundType: 'outer_ceiling',
    dimensions: bands.map((band) => ({
      metric: 'messages' as const,
      min: band.min,
      max: band.max,
      unit: 'messages',
      window: 'rolling_5h' as const,
      modelId: band.modelId,
      resetRule: 'Rolling five-hour window',
    })),
    projection: {
      formula: bands
        .map((band) => `${band.modelId}: ${band.max} x ${THIRTY_DAY_ROLLING_5H_MULTIPLIER} = ${band.max * THIRTY_DAY_ROLLING_5H_MULTIPLIER}`)
        .join('; '),
      assumptions: [
        'Each published five-hour maximum is sustained across every window in 30 days.',
        'A rolling five-hour window repeats 144 times in 30 days.',
      ],
      caveats: [
        WEEKLY_TO_THIRTY_DAY_CAVEAT,
        'Published bands are ranges; the minimum of each band may apply under load.',
      ],
    },
    source: evidenceSource(ENTITLEMENT_SOURCE_URLS.openai),
  };
}

/** Kimi publishes fixed monthly feature counts rather than tokens. */
function kimiFeatureLimits(agent: number, swarm: number, databaseUses: number): EntitlementEvidence {
  return {
    status: 'verified',
    boundType: 'practical_upper',
    dimensions: [
      { metric: 'feature_uses', max: agent, unit: 'Agent runs', window: 'monthly', feature: 'agent' },
      { metric: 'feature_uses', max: swarm, unit: 'Swarm runs', window: 'monthly', feature: 'swarm' },
      { metric: 'feature_uses', max: databaseUses, unit: 'database uses', window: 'monthly', feature: 'database' },
    ],
    source: evidenceSource(ENTITLEMENT_SOURCE_URLS.kimi),
  };
}

/** Z.AI publishes weekly credits; 30-day figures are projections before the unpublished 5h cap. */
function zaiWeeklyCredits(weeklyCredits: number, projectedThirtyDay: number, staleReason?: string): EntitlementEvidence {
  return {
    status: staleReason ? 'stale' : 'projected',
    boundType: 'outer_ceiling',
    dimensions: [{ metric: 'credits', max: weeklyCredits, unit: 'credits', window: 'weekly' }],
    projection: {
      formula: `${weeklyCredits} x 30 / 7 = ${projectedThirtyDay}`,
      assumptions: ['The published weekly credit allowance repeats across a 30-day period.'],
      caveats: [
        'Z.AI also applies an unpublished five-hour cap that may bind first.',
        NO_TOKEN_CONVERSION_CAVEAT,
      ],
    },
    ...(staleReason ? { staleReason } : {}),
    source: evidenceSource(ENTITLEMENT_SOURCE_URLS.zai),
  };
}

export const MANUAL_SUBSCRIPTION_PLANS: PlanOffer[] = [
  ...MANUAL_ALIBABA_TOKEN_PLANS,
  {
    id: 'alibaba:coding-plan-pro', providerId: 'alibaba', displayName: 'Coding Plan Pro', monthlyCostMicroDollars: 50_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly',
    supportedModelIds: ['qwen3.7-plus', 'qwen3.6-plus', 'kimi-k2.5', 'glm-5', 'MiniMax-M2.5', 'qwen3.5-plus', 'qwen3-max-2026-01-23', 'qwen3-coder-next', 'qwen3-coder-plus', 'glm-4.7'],
    entitlement: rolling('Published request quotas reset on five-hour, weekly, and monthly schedules; no token allowance is published.'),
    entitlementEvidence: {
      status: 'verified',
      boundType: 'hard_max',
      dimensions: [
        { metric: 'model_calls', max: 6_000, unit: 'model calls', window: 'rolling_5h', resetRule: 'Rolling five-hour window' },
        { metric: 'model_calls', max: 45_000, unit: 'model calls', window: 'weekly' },
        { metric: 'model_calls', max: 90_000, unit: 'model calls', window: 'monthly' },
        { metric: 'tasks', min: 3_000, max: 18_000, unit: 'queries', window: 'monthly', resetRule: 'Derived from the published 5-30 calls per query range' },
      ],
      source: evidenceSource(ENTITLEMENT_SOURCE_URLS.alibabaCoding),
    },
    sourceId: 'alibaba-subscription',
  },
  {
    id: 'anthropic:pro', providerId: 'anthropic', displayName: 'Claude Pro', monthlyCostMicroDollars: 20_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: rolling('Usage capacity is published as at least 5x free usage per five hours plus a weekly cap, not a token allowance.'),
    entitlementEvidence: claudeRelativeCeiling(5, 'Claude Pro'),
    sourceId: 'anthropic-subscription',
  },
  {
    id: 'anthropic:max-5x', providerId: 'anthropic', displayName: 'Claude Max 5x', monthlyCostMicroDollars: 100_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: rolling('Published as 5x Pro capacity per five hours plus a weekly cap, not a fixed token allowance.'),
    entitlementEvidence: claudeRelativeCeiling(25, 'Claude Max 5x'),
    sourceId: 'anthropic-subscription',
  },
  {
    id: 'anthropic:max-20x', providerId: 'anthropic', displayName: 'Claude Max 20x', monthlyCostMicroDollars: 200_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: rolling('Published as 20x Pro capacity per five hours plus a weekly cap, not a fixed token allowance.'),
    entitlementEvidence: claudeRelativeCeiling(100, 'Claude Max 20x'),
    sourceId: 'anthropic-subscription',
  },
  {
    id: 'google:ai-plus', providerId: 'google', displayName: 'Google AI Plus', monthlyCostMicroDollars: 9_990_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: guardrail('Published as 2x standard capacity with a five-hour refresh plus a weekly cap; no fixed token allowance is published.'),
    entitlementEvidence: {
      ...geminiRelativeCeiling(288, 'Google AI Plus'),
      status: 'stale',
      staleReason: 'The published Google AI Plus price has drifted from the stored value; the row cannot back a cost recommendation until the price is re-read.',
    },
    sourceId: 'google-subscription',
  },
  {
    id: 'google:ai-pro', providerId: 'google', displayName: 'Google AI Pro', monthlyCostMicroDollars: 19_990_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: guardrail('Published as 4x standard capacity; no fixed token allowance is published.'),
    entitlementEvidence: geminiRelativeCeiling(576, 'Google AI Pro'),
    sourceId: 'google-subscription',
  },
  {
    id: 'google:ai-ultra-5x', providerId: 'google', displayName: 'Google AI Ultra 5x', monthlyCostMicroDollars: 100_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: guardrail('Published as 20x standard capacity rather than a fixed monthly token allowance.'),
    entitlementEvidence: geminiRelativeCeiling(2_880, 'Google AI Ultra 5x'),
    sourceId: 'google-subscription',
  },
  {
    id: 'google:ai-ultra-20x', providerId: 'google', displayName: 'Google AI Ultra 20x', monthlyCostMicroDollars: 200_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: guardrail('Published as 80x standard capacity rather than a fixed monthly token allowance.'),
    entitlementEvidence: geminiRelativeCeiling(11_520, 'Google AI Ultra 20x'),
    sourceId: 'google-subscription',
  },
  {
    id: 'xai:supergrok', providerId: 'xai', displayName: 'SuperGrok', monthlyCostMicroDollars: 30_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: guardrail('Advertised as higher limits with no published numeric cap or reset schedule.'),
    entitlementEvidence: {
      status: 'dynamic_unknown',
      boundType: 'unknown',
      dimensions: [],
      source: evidenceSource(ENTITLEMENT_SOURCE_URLS.xai),
    },
    sourceId: 'xai-subscription',
  },
  {
    id: 'kimi:moderato', providerId: 'kimi', displayName: 'Kimi Moderato', monthlyCostMicroDollars: 19_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: credits('Includes 60 Agent runs, 25 Swarm runs, and 2,000 database uses per month; no token allowance is published.'),
    entitlementEvidence: kimiFeatureLimits(60, 25, 2_000),
    sourceId: 'kimi-subscription',
  },
  {
    id: 'kimi:allegretto', providerId: 'kimi', displayName: 'Kimi Allegretto', monthlyCostMicroDollars: 39_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: credits('Includes 150 Agent runs, 50 Swarm runs, and 5,000 database uses per month; no token allowance is published.'),
    entitlementEvidence: kimiFeatureLimits(150, 50, 5_000),
    sourceId: 'kimi-subscription',
  },
  {
    id: 'kimi:allegro', providerId: 'kimi', displayName: 'Kimi Allegro', monthlyCostMicroDollars: 99_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: credits('Includes 360 Agent runs, 120 Swarm runs, and 12,000 database uses per month; no token allowance is published.'),
    entitlementEvidence: kimiFeatureLimits(360, 120, 12_000),
    sourceId: 'kimi-subscription',
  },
  {
    id: 'kimi:vivace', providerId: 'kimi', displayName: 'Kimi Vivace', monthlyCostMicroDollars: 199_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: credits('Includes 720 Agent runs, 240 Swarm runs, and 24,000 database uses per month; no token allowance is published.'),
    entitlementEvidence: kimiFeatureLimits(720, 240, 24_000),
    sourceId: 'kimi-subscription',
  },
  {
    id: 'openai:go', providerId: 'openai', displayName: 'ChatGPT Go', monthlyCostMicroDollars: 8_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: ['gpt-5.6-terra'],
    entitlement: guardrail('No numeric allowance is published; US reference price is shown.'),
    entitlementEvidence: {
      status: 'dynamic_unknown',
      boundType: 'unknown',
      dimensions: [],
      source: evidenceSource(ENTITLEMENT_SOURCE_URLS.openai),
    },
    sourceId: 'openai-subscription',
  },
  {
    id: 'openai:plus', providerId: 'openai', displayName: 'ChatGPT Plus', monthlyCostMicroDollars: 20_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    entitlement: guardrail('Publishes per-model five-hour message bands rather than a token allowance.'),
    entitlementEvidence: openAiMessageCeilings([
      { modelId: 'sol', min: 10, max: 100 },
      { modelId: 'terra', min: 25, max: 200 },
      { modelId: 'luna', min: 250, max: 2_000 },
    ]),
    sourceId: 'openai-subscription',
  },
  {
    id: 'openai:pro-5x', providerId: 'openai', displayName: 'ChatGPT Pro 5x', monthlyCostMicroDollars: 100_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    entitlement: guardrail('Publishes per-model five-hour message bands rather than a token allowance.'),
    entitlementEvidence: openAiMessageCeilings([
      { modelId: 'sol', min: 50, max: 500 },
      { modelId: 'terra', min: 125, max: 1_000 },
      { modelId: 'luna', min: 1_250, max: 10_000 },
    ]),
    sourceId: 'openai-subscription',
  },
  {
    id: 'openai:pro-20x', providerId: 'openai', displayName: 'ChatGPT Pro 20x', monthlyCostMicroDollars: 200_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    entitlement: guardrail('Publishes per-model five-hour message bands rather than a token allowance.'),
    entitlementEvidence: openAiMessageCeilings([
      { modelId: 'sol', min: 200, max: 2_000 },
      { modelId: 'terra', min: 500, max: 4_000 },
      { modelId: 'luna', min: 5_000, max: 40_000 },
    ]),
    sourceId: 'openai-subscription',
  },
  {
    id: 'zai:lite', providerId: 'zai', displayName: 'Z.AI Lite', monthlyCostMicroDollars: 18_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: credits('Includes 10,000 credits per week; no token allowance is published.'),
    entitlementEvidence: zaiWeeklyCredits(10_000, 42_900),
    sourceId: 'zai-subscription',
  },
  {
    id: 'zai:pro', providerId: 'zai', displayName: 'Z.AI Pro', monthlyCostMicroDollars: 72_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: credits('Includes 60,000 credits per week; no token allowance is published.'),
    entitlementEvidence: zaiWeeklyCredits(
      60_000,
      257_100,
      'The published Z.AI Pro price has drifted from the stored value; the row cannot back a cost recommendation until the price is re-read.',
    ),
    sourceId: 'zai-subscription',
  },
  {
    id: 'zai:max', providerId: 'zai', displayName: 'Z.AI Max', monthlyCostMicroDollars: 160_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [],
    entitlement: credits('Includes 140,000 credits per week; no token allowance is published.'),
    entitlementEvidence: zaiWeeklyCredits(
      140_000,
      600_000,
      'The published Z.AI Max price has drifted from the stored value; the row cannot back a cost recommendation until the price is re-read.',
    ),
    sourceId: 'zai-subscription',
  },
];

export const MANUAL_BOOTSTRAP_MODEL_OFFERS: ModelOffer[] = [
  { id: 'deepseek:deepseek-v4-flash:direct', providerId: 'deepseek', displayName: 'DeepSeek-V4-Flash', modelId: 'deepseek-v4-flash', pricingBasis: 'direct_provider_api', route: 'direct_provider', currency: 'USD', unit: 'micro_dollars_per_million_tokens', inputMicroDollarsPerMillion: 140_000, cachedInputMicroDollarsPerMillion: 2_800, outputMicroDollarsPerMillion: 280_000, contextWindowTokens: 1_000_000, maxOutputTokens: 384_000, availability: 'available', sourceId: 'deepseek-api' },
  { id: 'openai:gpt-5.6-sol:direct', providerId: 'openai', displayName: 'GPT-5.6 Sol', modelId: 'gpt-5.6-sol', pricingBasis: 'direct_provider_api', route: 'direct_provider', currency: 'USD', unit: 'micro_dollars_per_million_tokens', inputMicroDollarsPerMillion: 5_000_000, cachedInputMicroDollarsPerMillion: 500_000, outputMicroDollarsPerMillion: 30_000_000, contextWindowTokens: 1_050_000, maxOutputTokens: 128_000, availability: 'available', sourceId: 'openai-api' },
  { id: 'openai:gpt-5.6-terra:direct', providerId: 'openai', displayName: 'GPT-5.6 Terra', modelId: 'gpt-5.6-terra', pricingBasis: 'direct_provider_api', route: 'direct_provider', currency: 'USD', unit: 'micro_dollars_per_million_tokens', inputMicroDollarsPerMillion: 2_500_000, cachedInputMicroDollarsPerMillion: 250_000, outputMicroDollarsPerMillion: 15_000_000, contextWindowTokens: 1_050_000, maxOutputTokens: 128_000, availability: 'available', sourceId: 'openai-api' },
  { id: 'openai:gpt-5.6-luna:direct', providerId: 'openai', displayName: 'GPT-5.6 Luna', modelId: 'gpt-5.6-luna', pricingBasis: 'direct_provider_api', route: 'direct_provider', currency: 'USD', unit: 'micro_dollars_per_million_tokens', inputMicroDollarsPerMillion: 1_000_000, cachedInputMicroDollarsPerMillion: 100_000, outputMicroDollarsPerMillion: 6_000_000, contextWindowTokens: 1_050_000, maxOutputTokens: 128_000, availability: 'available', sourceId: 'openai-api' },
];

export function buildManualSubscriptionSources(providerId: string, observedAt: string): Array<{ source: SourceProvenance; plans: PlanOffer[]; modelOffers: ModelOffer[] }> {
  const source = MANUAL_SUBSCRIPTION_SOURCES[providerId as ManualProviderId];
  if (!source) throw new Error(`No manual manifest for ${providerId}`);
  const primary = {
    source: { ...source, observedAt },
    plans: MANUAL_SUBSCRIPTION_PLANS.filter((plan) => plan.providerId === providerId && plan.sourceId === source.id),
    modelOffers: MANUAL_BOOTSTRAP_MODEL_OFFERS.filter((offer) => offer.providerId === providerId && offer.sourceId === source.id),
  };
  if (providerId === 'alibaba') return [primary, {
    source: { ...MANUAL_ALIBABA_TOKEN_SOURCE, observedAt },
    plans: MANUAL_ALIBABA_TOKEN_PLANS,
    modelOffers: [],
  }];
  if (providerId === 'openai') return [primary, {
    source: { ...MANUAL_OPENAI_API_SOURCE, observedAt },
    plans: [],
    modelOffers: MANUAL_BOOTSTRAP_MODEL_OFFERS.filter((offer) => offer.sourceId === MANUAL_OPENAI_API_SOURCE.id),
  }];
  return [primary];
}

export function buildManualSubscriptionSource(providerId: string, observedAt: string): { source: SourceProvenance; plans: PlanOffer[]; modelOffers: ModelOffer[] } {
  return buildManualSubscriptionSources(providerId, observedAt)[0];
}
