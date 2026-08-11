import { compareUtf8Binary } from '../benchmarks/contracts';
import type { ModelOffer, PlanOffer } from './contracts';

function directProviderOffersForPlan(plan: PlanOffer, offers: readonly ModelOffer[]): ModelOffer[] {
  return offers.filter((offer) => (
    offer.providerId === plan.providerId
    && offer.pricingBasis === 'direct_provider_api'
    && offer.route === 'direct_provider'
  ));
}

export function defaultApiEquivalentForPlan(plan: PlanOffer, offers: readonly ModelOffer[]): ModelOffer | null {
  const directOffers = directProviderOffersForPlan(plan, offers);
  if (directOffers.length === 0) return null;

  if (plan.supportedModelIds && plan.supportedModelIds.length > 0) {
    for (const modelId of plan.supportedModelIds) {
      const match = directOffers.find((offer) => offer.modelId === modelId);
      if (match) return match;
    }
    return null;
  }

  return [...directOffers].sort((left, right) => (
    compareUtf8Binary(left.modelId, right.modelId)
    || compareUtf8Binary(left.id, right.id)
  ))[0] ?? null;
}
