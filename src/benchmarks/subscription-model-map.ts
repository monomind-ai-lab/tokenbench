/**
 * Canonical benchmark model key -> independently reviewed PlanOffer IDs.
 * Missing keys deliberately mean "no verified subscription match".
 */
export const SUBSCRIPTION_MODEL_MAP: Record<string, readonly string[]> = {};

const NO_VERIFIED_PLAN_OFFERS: readonly string[] = [];

export function subscriptionPlanIdsForModel(modelKey: string): readonly string[] {
  return SUBSCRIPTION_MODEL_MAP[modelKey] ?? NO_VERIFIED_PLAN_OFFERS;
}
