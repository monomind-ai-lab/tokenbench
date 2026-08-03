import type { ModelOffer, PlanOffer, SourceProvenance } from './contracts';

export const MANUAL_SUBSCRIPTION_PROVIDER_IDS = ['alibaba', 'anthropic', 'deepseek', 'xai', 'kimi', 'openai', 'zai'] as const;
type ManualProviderId = typeof MANUAL_SUBSCRIPTION_PROVIDER_IDS[number];

export const MANUAL_SUBSCRIPTION_SOURCES: Record<ManualProviderId, Omit<SourceProvenance, 'observedAt'>> = {
  alibaba: { id: 'alibaba-subscription', providerId: 'alibaba', sourceUrl: 'https://www.alibabacloud.com/help/en/model-studio/coding-plan', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-03', evidenceLocator: 'Plan details', reviewStatus: 'verified' },
  anthropic: { id: 'anthropic-subscription', providerId: 'anthropic', sourceUrl: 'https://support.claude.com/en/articles/11049762-choose-a-claude-plan', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-03', evidenceLocator: 'Plan table', reviewStatus: 'verified' },
  deepseek: { id: 'deepseek-api', providerId: 'deepseek', sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
  xai: { id: 'xai-api', providerId: 'xai', sourceUrl: 'https://docs.x.ai/developers/pricing', sourceKind: 'manual_manifest', confidence: 'manual_verified', reviewStatus: 'needs_review' },
  kimi: { id: 'kimi-api', providerId: 'kimi', sourceUrl: 'https://platform.kimi.com/docs/overview', sourceKind: 'manual_manifest', confidence: 'manual_verified', reviewStatus: 'needs_review' },
  openai: { id: 'openai-subscription', providerId: 'openai', sourceUrl: 'https://help.openai.com/en/articles/9793128-chatgpt-pro', sourceKind: 'manual_manifest', confidence: 'manual_verified', parserVersion: 'manual-2026-08-03', evidenceLocator: 'What is the difference between the two Pro tiers?', reviewStatus: 'verified' },
  zai: { id: 'zai-subscription', providerId: 'zai', sourceUrl: 'https://docs.z.ai/devpack/overview', sourceKind: 'manual_manifest', confidence: 'manual_verified', reviewStatus: 'needs_review' },
};

const rolling = (description: string) => ({ kind: 'rolling_limit' as const, description });
const guardrail = (description: string) => ({ kind: 'guardrail_limited' as const, description });
const credits = (description: string) => ({ kind: 'credits' as const, description });

export const MANUAL_SUBSCRIPTION_PLANS: PlanOffer[] = [
  { id: 'alibaba:coding-plan-pro', providerId: 'alibaba', displayName: 'Coding Plan Pro', monthlyCostMicroDollars: 50_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: ['qwen3.7-plus', 'qwen3.6-plus', 'kimi-k2.5', 'glm-5', 'MiniMax-M2.5', 'qwen3.5-plus', 'qwen3-max-2026-01-23', 'qwen3-coder-next', 'qwen3-coder-plus', 'glm-4.7'], entitlement: rolling('Published request quotas reset on five-hour, weekly, and monthly schedules; no token allowance is published.'), sourceId: 'alibaba-subscription' },
  { id: 'anthropic:pro', providerId: 'anthropic', displayName: 'Claude Pro', monthlyCostMicroDollars: 20_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: rolling('Usage capacity is published as standard rather than a token allowance.'), sourceId: 'anthropic-subscription' },
  { id: 'anthropic:max-5x', providerId: 'anthropic', displayName: 'Claude Max 5x', monthlyCostMicroDollars: 100_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: rolling('Published as 5x Pro capacity per session, not a fixed token allowance.'), sourceId: 'anthropic-subscription' },
  { id: 'anthropic:max-20x', providerId: 'anthropic', displayName: 'Claude Max 20x', monthlyCostMicroDollars: 200_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: rolling('Published as 20x Pro capacity per session, not a fixed token allowance.'), sourceId: 'anthropic-subscription' },
  { id: 'openai:pro-5x', providerId: 'openai', displayName: 'ChatGPT Pro 5x', monthlyCostMicroDollars: 100_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: guardrail('Model-specific allowances and anti-abuse guardrails can temporarily restrict access.'), sourceId: 'openai-subscription' },
  { id: 'openai:pro-20x', providerId: 'openai', displayName: 'ChatGPT Pro 20x', monthlyCostMicroDollars: 200_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', billingCycle: 'monthly', supportedModelIds: [], entitlement: guardrail('Model-specific allowances and anti-abuse guardrails can temporarily restrict access.'), sourceId: 'openai-subscription' },
];

export const MANUAL_BOOTSTRAP_MODEL_OFFERS: ModelOffer[] = [
  { id: 'deepseek:deepseek-v4-flash:direct', providerId: 'deepseek', displayName: 'DeepSeek-V4-Flash', modelId: 'deepseek-v4-flash', pricingBasis: 'direct_provider_api', route: 'direct_provider', currency: 'USD', unit: 'micro_dollars_per_million_tokens', inputMicroDollarsPerMillion: 140_000, cachedInputMicroDollarsPerMillion: 2_800, outputMicroDollarsPerMillion: 280_000, contextWindowTokens: 1_000_000, maxOutputTokens: 384_000, availability: 'available', sourceId: 'deepseek-api' },
];

export function buildManualSubscriptionSource(providerId: string, observedAt: string): { source: SourceProvenance; plans: PlanOffer[]; modelOffers: ModelOffer[] } {
  const source = MANUAL_SUBSCRIPTION_SOURCES[providerId as ManualProviderId];
  if (!source) throw new Error(`No manual manifest for ${providerId}`);
  return {
    source: { ...source, observedAt },
    plans: MANUAL_SUBSCRIPTION_PLANS.filter((plan) => plan.providerId === providerId),
    modelOffers: MANUAL_BOOTSTRAP_MODEL_OFFERS.filter((offer) => offer.providerId === providerId),
  };
}
