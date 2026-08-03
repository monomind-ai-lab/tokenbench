import type { ModelOffer, PlanOffer, SourceProvenance } from './contracts';

export const MANUAL_SUBSCRIPTION_PROVIDER_IDS = ['alibaba', 'anthropic', 'deepseek', 'xai', 'kimi', 'openai', 'zai'] as const;
type ManualProviderId = typeof MANUAL_SUBSCRIPTION_PROVIDER_IDS[number];

export const MANUAL_SUBSCRIPTION_SOURCES: Record<ManualProviderId, Omit<SourceProvenance, 'observedAt'>> = {
  alibaba: { id: 'alibaba-subscription', providerId: 'alibaba', sourceUrl: 'https://www.alibabacloud.com/zh/notice/alibaba_cloud_coding_plan_firstpurchase_promotions_6d9', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
  anthropic: { id: 'anthropic-subscription', providerId: 'anthropic', sourceUrl: 'https://www.anthropic.com/pricing', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
  deepseek: { id: 'deepseek-api', providerId: 'deepseek', sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
  xai: { id: 'xai-subscription', providerId: 'xai', sourceUrl: 'https://x.ai/pricing', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
  kimi: { id: 'kimi-api', providerId: 'kimi', sourceUrl: 'https://www.kimi.com/help/membership/membership-pricing', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
  openai: { id: 'openai-subscription', providerId: 'openai', sourceUrl: 'https://openai.com/chatgpt/pricing', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
  zai: { id: 'zai-subscription', providerId: 'zai', sourceUrl: 'https://z.ai/subscribe', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
};

const rolling = (description: string) => ({ kind: 'rolling_limit' as const, description });
const guardrail = (description: string) => ({ kind: 'guardrail_limited' as const, description });
const credits = (description: string) => ({ kind: 'credits' as const, description });

export const MANUAL_SUBSCRIPTION_PLANS: PlanOffer[] = [
  { id: 'alibaba:coding-plan-pro-first-purchase', providerId: 'alibaba', displayName: 'Coding Plan Pro (first-purchase promotion)', monthlyCostMicroDollars: 15_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', entitlement: rolling('Monthly quota resets on renewal; the official promotion does not publish a fixed token allowance.'), sourceId: 'alibaba-subscription' },
  { id: 'anthropic:pro', providerId: 'anthropic', displayName: 'Claude Pro', monthlyCostMicroDollars: 20_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', entitlement: rolling('Additional usage limits apply.'), sourceId: 'anthropic-subscription' },
  { id: 'anthropic:max-5x', providerId: 'anthropic', displayName: 'Claude Max 5x', monthlyCostMicroDollars: 100_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', entitlement: rolling('Five times Pro capacity; additional usage limits apply.'), sourceId: 'anthropic-subscription' },
  { id: 'anthropic:max-20x', providerId: 'anthropic', displayName: 'Claude Max 20x', monthlyCostMicroDollars: 200_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', entitlement: rolling('Twenty times Pro capacity; additional usage limits apply.'), sourceId: 'anthropic-subscription' },
  { id: 'xai:supergrok', providerId: 'xai', displayName: 'SuperGrok', monthlyCostMicroDollars: 30_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', entitlement: rolling('Subscription includes a weekly usage pool that resets on schedule.'), sourceId: 'xai-subscription' },
  { id: 'kimi:moderato', providerId: 'kimi', displayName: 'Kimi Moderato', monthlyCostMicroDollars: 19_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', entitlement: credits('Shared membership credit pool and separate Kimi Code rate limits; no token conversion is published.'), sourceId: 'kimi-api' },
  { id: 'kimi:allegretto', providerId: 'kimi', displayName: 'Kimi Allegretto', monthlyCostMicroDollars: 39_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', entitlement: credits('Shared membership credit pool and separate Kimi Code rate limits; no token conversion is published.'), sourceId: 'kimi-api' },
  { id: 'kimi:allegro', providerId: 'kimi', displayName: 'Kimi Allegro', monthlyCostMicroDollars: 99_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', entitlement: credits('Shared membership credit pool and separate Kimi Code rate limits; no token conversion is published.'), sourceId: 'kimi-api' },
  { id: 'kimi:vivace', providerId: 'kimi', displayName: 'Kimi Vivace', monthlyCostMicroDollars: 199_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', entitlement: credits('Shared membership credit pool and separate Kimi Code rate limits; no token conversion is published.'), sourceId: 'kimi-api' },
  { id: 'openai:plus', providerId: 'openai', displayName: 'ChatGPT Plus', monthlyCostMicroDollars: 20_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', entitlement: rolling('Message caps and usage limits can vary with system conditions.'), sourceId: 'openai-subscription' },
  { id: 'openai:pro-5x', providerId: 'openai', displayName: 'ChatGPT Pro 5x', monthlyCostMicroDollars: 100_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', entitlement: guardrail('Usage allowances vary by model and anti-abuse guardrails can temporarily restrict access.'), sourceId: 'openai-subscription' },
  { id: 'openai:pro-20x', providerId: 'openai', displayName: 'ChatGPT Pro 20x', monthlyCostMicroDollars: 200_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', entitlement: guardrail('Usage allowances vary by model and anti-abuse guardrails can temporarily restrict access.'), sourceId: 'openai-subscription' },
  { id: 'zai:lite', providerId: 'zai', displayName: 'GLM Coding Plan Lite', monthlyCostMicroDollars: 18_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', entitlement: rolling('Usage limits are dynamically refreshed on five-hour and weekly cycles.'), sourceId: 'zai-subscription' },
  { id: 'zai:pro', providerId: 'zai', displayName: 'GLM Coding Plan Pro', monthlyCostMicroDollars: 72_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', entitlement: rolling('Usage limits are dynamically refreshed on five-hour and weekly cycles.'), sourceId: 'zai-subscription' },
  { id: 'zai:max', providerId: 'zai', displayName: 'GLM Coding Plan Max', monthlyCostMicroDollars: 160_000_000, currency: 'USD', pricingBasis: 'subscription', route: 'subscription', entitlement: rolling('Usage limits are dynamically refreshed on five-hour and weekly cycles.'), sourceId: 'zai-subscription' },
];

export const MANUAL_BOOTSTRAP_MODEL_OFFERS: ModelOffer[] = [
  { id: 'deepseek:deepseek-v4-flash:direct', providerId: 'deepseek', displayName: 'DeepSeek-V4-Flash', modelId: 'deepseek-v4-flash', pricingBasis: 'direct_provider_api', route: 'direct_provider', currency: 'USD', unit: 'micro_dollars_per_million_tokens', inputMicroDollarsPerMillion: 140_000, cachedInputMicroDollarsPerMillion: 2_800, outputMicroDollarsPerMillion: 280_000, sourceId: 'deepseek-api' },
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
