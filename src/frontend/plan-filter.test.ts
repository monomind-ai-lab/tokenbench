import { describe, expect, it } from 'vitest';
import type { PlanOffer } from '../catalog/contracts';
import { isPaidIndividualPlan, paidIndividualPlans } from './plan-filter';

const individualPlan: PlanOffer = {
  id: 'provider:plus',
  providerId: 'provider',
  displayName: 'Plus',
  monthlyCostMicroDollars: 20_000_000,
  currency: 'USD',
  pricingBasis: 'subscription',
  route: 'subscription',
  billingCycle: 'monthly',
  entitlement: { kind: 'rolling_limit', description: 'Published rolling limit.' },
  entitlementEvidence: {
    status: 'dynamic_unknown',
    boundType: 'unknown',
    dimensions: [],
    source: { url: 'https://example.test/plans', accessedAt: '2026-08-10T00:00:00.000Z', confidence: 'high' },
  },
  sourceId: 'provider-subscription',
};

describe('paid individual plan filtering', () => {
  it('keeps paid monthly individual plans and excludes free, annual, team, and enterprise offers', () => {
    const plans: PlanOffer[] = [
      individualPlan,
      { ...individualPlan, id: 'provider:free', displayName: 'Free', monthlyCostMicroDollars: 0 },
      { ...individualPlan, id: 'provider:annual', displayName: 'Annual Plus', billingCycle: 'annual' },
      { ...individualPlan, id: 'provider:team', displayName: 'Team' },
      { ...individualPlan, id: 'provider:enterprise', displayName: 'Enterprise' },
    ];

    expect(isPaidIndividualPlan(individualPlan)).toBe(true);
    expect(paidIndividualPlans(plans).map((plan) => plan.id)).toEqual(['provider:plus']);
  });
});
