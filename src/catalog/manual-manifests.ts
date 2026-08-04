import type { ModelOffer, PlanOffer, SourceProvenance } from './contracts';

export const MANUAL_SUBSCRIPTION_PROVIDER_IDS = ['alibaba', 'anthropic', 'deepseek', 'google', 'xai', 'kimi', 'openai', 'zai'] as const;
type ManualProviderId = typeof MANUAL_SUBSCRIPTION_PROVIDER_IDS[number];

export const MANUAL_SUBSCRIPTION_SOURCES: Record<ManualProviderId, Omit<SourceProvenance, 'observedAt'>> = {
  alibaba: { id: 'alibaba-subscription', providerId: 'alibaba', sourceUrl: 'https://www.alibabacloud.com/help/en/model-studio/coding-plan', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-03', evidenceLocator: 'Plan details', reviewStatus: 'verified' },
  anthropic: { id: 'anthropic-subscription', providerId: 'anthropic', sourceUrl: 'https://support.claude.com/en/articles/11049762-choose-a-claude-plan', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-03', evidenceLocator: 'Plan table', reviewStatus: 'verified' },
  deepseek: { id: 'deepseek-api', providerId: 'deepseek', sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
  google: { id: 'google-subscription', providerId: 'google', sourceUrl: 'https://one.google.com/about/plans', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-04', evidenceLocator: 'Google AI plan pricing', reviewStatus: 'verified' },
  xai: { id: 'xai-subscription', providerId: 'xai', sourceUrl: 'https://x.ai/pricing', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-04', evidenceLocator: 'SuperGrok monthly pricing', reviewStatus: 'verified' },
  kimi: { id: 'kimi-subscription', providerId: 'kimi', sourceUrl: 'https://www.kimi.com/help/membership/membership-pricing', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-04', evidenceLocator: 'Global membership pricing', reviewStatus: 'verified' },
  openai: { id: 'openai-subscription', providerId: 'openai', sourceUrl: 'https://chatgpt.com/pricing/', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-04', evidenceLocator: 'Individual monthly plans', reviewStatus: 'verified' },
  zai: { id: 'zai-subscription', providerId: 'zai', sourceUrl: 'https://z.ai/subscribe', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-04', evidenceLocator: 'Lite, Pro, and Max monthly plans', reviewStatus: 'verified' },
};

/** Alibaba publishes the Token Plan Personal Edition separately from Coding Plan. */
export const MANUAL_ALIBABA_TOKEN_SOURCE: Omit<SourceProvenance, 'observedAt'> = {
  id: 'alibaba-token-subscription', providerId: 'alibaba',
  sourceUrl: 'https://www.alibabacloud.com/en/campaign/ai-landing-page-token',
  sourceKind: 'manual_manifest', confidence: 'manual_verified',
  parserVersion: 'manual-2026-08-04', evidenceLocator: 'Token Plan Personal Edition monthly pricing', reviewStatus: 'verified',
};

const rolling = (description: string) => ({ kind: 'rolling_limit' as const, description });
const guardrail = (description: string) => ({ kind: 'guardrail_limited' as const, description });
const credits = (description: string) => ({ kind: 'credits' as const, description });

export const MANUAL_ALIBABA_TOKEN_PLANS: PlanOffer[] = [
  { id: 'alibaba:token-plan-lite', providerId: 'alibaba', displayName: 'Token Plan Lite', monthlyCostMicroDollars: 6_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: credits('Token Plan Personal Edition includes 2,500 Credits in the seven-day quota and 700 Credits in the five-hour quota.'), sourceId: 'alibaba-token-subscription' },
  { id: 'alibaba:token-plan-standard', providerId: 'alibaba', displayName: 'Token Plan Standard', monthlyCostMicroDollars: 20_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: credits('Token Plan Personal Edition includes 10,000 Credits in the seven-day quota and 3,000 Credits in the five-hour quota.'), sourceId: 'alibaba-token-subscription' },
  { id: 'alibaba:token-plan-pro', providerId: 'alibaba', displayName: 'Token Plan Pro', monthlyCostMicroDollars: 70_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: credits('Token Plan Personal Edition includes 40,000 Credits in the seven-day quota and 12,000 Credits in the five-hour quota.'), sourceId: 'alibaba-token-subscription' },
];

export const MANUAL_SUBSCRIPTION_PLANS: PlanOffer[] = [
  ...MANUAL_ALIBABA_TOKEN_PLANS,
  { id: 'alibaba:coding-plan-pro', providerId: 'alibaba', displayName: 'Coding Plan Pro', monthlyCostMicroDollars: 50_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: ['qwen3.7-plus', 'qwen3.6-plus', 'kimi-k2.5', 'glm-5', 'MiniMax-M2.5', 'qwen3.5-plus', 'qwen3-max-2026-01-23', 'qwen3-coder-next', 'qwen3-coder-plus', 'glm-4.7'], entitlement: rolling('Published request quotas reset on five-hour, weekly, and monthly schedules; no token allowance is published.'), sourceId: 'alibaba-subscription' },
  { id: 'anthropic:pro', providerId: 'anthropic', displayName: 'Claude Pro', monthlyCostMicroDollars: 20_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: rolling('Usage capacity is published as standard rather than a token allowance.'), sourceId: 'anthropic-subscription' },
  { id: 'anthropic:max-5x', providerId: 'anthropic', displayName: 'Claude Max 5x', monthlyCostMicroDollars: 100_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: rolling('Published as 5x Pro capacity per session, not a fixed token allowance.'), sourceId: 'anthropic-subscription' },
  { id: 'anthropic:max-20x', providerId: 'anthropic', displayName: 'Claude Max 20x', monthlyCostMicroDollars: 200_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: rolling('Published as 20x Pro capacity per session, not a fixed token allowance.'), sourceId: 'anthropic-subscription' },
  { id: 'google:ai-plus', providerId: 'google', displayName: 'Google AI Plus', monthlyCostMicroDollars: 9_990_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: guardrail('Model and feature limits vary by region and demand; no fixed token allowance is published.'), sourceId: 'google-subscription' },
  { id: 'google:ai-pro', providerId: 'google', displayName: 'Google AI Pro', monthlyCostMicroDollars: 19_990_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: guardrail('Model and feature limits vary by region and demand; no fixed token allowance is published.'), sourceId: 'google-subscription' },
  { id: 'google:ai-ultra-5x', providerId: 'google', displayName: 'Google AI Ultra 5x', monthlyCostMicroDollars: 100_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: guardrail('Published as an elevated usage tier rather than a fixed monthly token allowance.'), sourceId: 'google-subscription' },
  { id: 'google:ai-ultra-20x', providerId: 'google', displayName: 'Google AI Ultra 20x', monthlyCostMicroDollars: 200_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: guardrail('Published as the highest usage tier rather than a fixed monthly token allowance.'), sourceId: 'google-subscription' },
  { id: 'xai:supergrok', providerId: 'xai', displayName: 'SuperGrok', monthlyCostMicroDollars: 30_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: guardrail('Access is subject to model-specific usage limits and anti-abuse guardrails; no token allowance is published.'), sourceId: 'xai-subscription' },
  { id: 'kimi:moderato', providerId: 'kimi', displayName: 'Kimi Moderato', monthlyCostMicroDollars: 19_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: credits('Membership usage is governed by credits and rolling limits; no fixed token allowance is published.'), sourceId: 'kimi-subscription' },
  { id: 'kimi:allegretto', providerId: 'kimi', displayName: 'Kimi Allegretto', monthlyCostMicroDollars: 39_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: credits('Membership usage is governed by credits and rolling limits; no fixed token allowance is published.'), sourceId: 'kimi-subscription' },
  { id: 'kimi:allegro', providerId: 'kimi', displayName: 'Kimi Allegro', monthlyCostMicroDollars: 99_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: credits('Membership usage is governed by credits and rolling limits; no fixed token allowance is published.'), sourceId: 'kimi-subscription' },
  { id: 'kimi:vivace', providerId: 'kimi', displayName: 'Kimi Vivace', monthlyCostMicroDollars: 199_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: credits('Membership usage is governed by credits and rolling limits; no fixed token allowance is published.'), sourceId: 'kimi-subscription' },
  { id: 'openai:go', providerId: 'openai', displayName: 'ChatGPT Go', monthlyCostMicroDollars: 8_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: guardrail('Model-specific allowances and anti-abuse guardrails can temporarily restrict access; US reference price is shown.'), sourceId: 'openai-subscription' },
  { id: 'openai:plus', providerId: 'openai', displayName: 'ChatGPT Plus', monthlyCostMicroDollars: 20_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: guardrail('Model-specific allowances and anti-abuse guardrails can temporarily restrict access.'), sourceId: 'openai-subscription' },
  { id: 'openai:pro-5x', providerId: 'openai', displayName: 'ChatGPT Pro 5x', monthlyCostMicroDollars: 100_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: guardrail('Model-specific allowances and anti-abuse guardrails can temporarily restrict access.'), sourceId: 'openai-subscription' },
  { id: 'openai:pro-20x', providerId: 'openai', displayName: 'ChatGPT Pro 20x', monthlyCostMicroDollars: 200_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: guardrail('Model-specific allowances and anti-abuse guardrails can temporarily restrict access.'), sourceId: 'openai-subscription' },
  { id: 'zai:lite', providerId: 'zai', displayName: 'Z.AI Lite', monthlyCostMicroDollars: 18_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: rolling('Usage is governed by rolling prompts and model-specific limits; no token allowance is published.'), sourceId: 'zai-subscription' },
  { id: 'zai:pro', providerId: 'zai', displayName: 'Z.AI Pro', monthlyCostMicroDollars: 72_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: rolling('Usage is governed by rolling prompts and model-specific limits; no token allowance is published.'), sourceId: 'zai-subscription' },
  { id: 'zai:max', providerId: 'zai', displayName: 'Z.AI Max', monthlyCostMicroDollars: 160_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: rolling('Usage is governed by rolling prompts and model-specific limits; no token allowance is published.'), sourceId: 'zai-subscription' },
];

export const MANUAL_BOOTSTRAP_MODEL_OFFERS: ModelOffer[] = [
  { id: 'deepseek:deepseek-v4-flash:direct', providerId: 'deepseek', displayName: 'DeepSeek-V4-Flash', modelId: 'deepseek-v4-flash', pricingBasis: 'direct_provider_api', route: 'direct_provider', currency: 'USD', unit: 'micro_dollars_per_million_tokens', inputMicroDollarsPerMillion: 140_000, cachedInputMicroDollarsPerMillion: 2_800, outputMicroDollarsPerMillion: 280_000, contextWindowTokens: 1_000_000, maxOutputTokens: 384_000, availability: 'available', sourceId: 'deepseek-api' },
];

export function buildManualSubscriptionSources(providerId: string, observedAt: string): Array<{ source: SourceProvenance; plans: PlanOffer[]; modelOffers: ModelOffer[] }> {
  const source = MANUAL_SUBSCRIPTION_SOURCES[providerId as ManualProviderId];
  if (!source) throw new Error(`No manual manifest for ${providerId}`);
  const primary = {
    source: { ...source, observedAt },
    plans: MANUAL_SUBSCRIPTION_PLANS.filter((plan) => plan.providerId === providerId && plan.sourceId === source.id),
    modelOffers: MANUAL_BOOTSTRAP_MODEL_OFFERS.filter((offer) => offer.providerId === providerId),
  };
  if (providerId !== 'alibaba') return [primary];
  return [
    primary,
    {
      source: { ...MANUAL_ALIBABA_TOKEN_SOURCE, observedAt },
      plans: MANUAL_ALIBABA_TOKEN_PLANS,
      modelOffers: [],
    },
  ];
}

export function buildManualSubscriptionSource(providerId: string, observedAt: string): { source: SourceProvenance; plans: PlanOffer[]; modelOffers: ModelOffer[] } {
  return buildManualSubscriptionSources(providerId, observedAt)[0];
}
