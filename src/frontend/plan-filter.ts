import type { PlanOffer } from '../catalog/contracts';

const NON_INDIVIDUAL_PLAN_PATTERN = /\b(?:business|education|enterprise|organization|organisation|school|seat|team|workspace)\b/i;

/** Providers with verified model/API pricing but no paid individual subscription. */
export const API_ONLY_PROVIDER_IDS = ['deepseek'] as const;

export function isApiOnlyProvider(providerId: string): boolean {
  return (API_ONLY_PROVIDER_IDS as readonly string[]).includes(providerId);
}

/**
 * The catalog only ingests explicitly verified consumer subscriptions. Keep a
 * defensive boundary here so a free, annual-only, or organization plan cannot
 * leak into the calculator when upstream catalog data expands.
 */
export function isPaidIndividualPlan(plan: PlanOffer): boolean {
  const searchableIdentity = `${plan.id} ${plan.displayName}`;
  return plan.pricingBasis === 'subscription'
    && plan.route === 'subscription'
    && plan.monthlyCostMicroDollars > 0
    && plan.billingCycle !== 'annual'
    && !NON_INDIVIDUAL_PLAN_PATTERN.test(searchableIdentity);
}

export function paidIndividualPlans(plans: readonly PlanOffer[], providerId?: string): PlanOffer[] {
  return plans.filter((plan) => (!providerId || plan.providerId === providerId) && isPaidIndividualPlan(plan));
}
