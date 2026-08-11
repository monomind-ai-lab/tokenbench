import { describe, expect, it } from 'vitest';
import type { ModelOffer, PlanOffer } from './contracts';
import { defaultApiEquivalentForPlan } from './plan-api-equivalent';
import { FRONTEND_TEST_CATALOG } from '../frontend/test-fixtures';
import { BOOTSTRAP_CATALOG } from './bootstrap';

function plan(overrides: Partial<PlanOffer> = {}): PlanOffer {
  return {
    ...FRONTEND_TEST_CATALOG.plans[1],
    id: 'provider-a:plan',
    providerId: 'provider-a',
    ...overrides,
  };
}

function offer(overrides: Partial<ModelOffer>): ModelOffer {
  return {
    ...FRONTEND_TEST_CATALOG.modelOffers[0],
    ...overrides,
  };
}

describe('deterministic plan API-equivalent mapping', () => {
  const directA = offer({ id: 'provider-a:model-a:direct', modelId: 'model-a', displayName: 'Model A Direct' });
  const directB = offer({ id: 'provider-a:model-b:direct', modelId: 'model-b', displayName: 'Model B Direct' });
  const routerB = offer({ id: 'provider-a:model-b:openrouter', modelId: 'model-b', pricingBasis: 'openrouter', route: 'openrouter', displayName: 'Model B via OpenRouter' });

  it('prefers the first supported direct API model and discloses the resolution', () => {
    const result = defaultApiEquivalentForPlan(plan({ supportedModelIds: ['model-b', 'model-a'] }), [directA, directB, routerB]);
    expect(result?.modelId).toBe('model-b');
    expect(result?.pricingBasis).toBe('direct_provider_api');
    expect(result?.route).toBe('direct_provider');
  });

  it('falls back to the provider direct offer with binary model ordering only when support is undeclared', () => {
    const result = defaultApiEquivalentForPlan(plan(), [directB, directA, routerB]);
    expect(result?.modelId).toBe('model-a');
  });

  it('does not silently substitute a router or Zen offer for a missing direct offer', () => {
    const result = defaultApiEquivalentForPlan(plan({ supportedModelIds: ['model-b'] }), [routerB]);
    expect(result).toBeNull();
  });

  it('returns null when the plan provider has no direct API offer', () => {
    const result = defaultApiEquivalentForPlan(plan({ providerId: 'missing-provider' }), [directA, directB]);
    expect(result).toBeNull();
  });

  it('maps the reviewed OpenAI bootstrap plans to their published direct defaults', () => {
    const go = BOOTSTRAP_CATALOG.plans.find((candidate) => candidate.id === 'openai:go');
    const plus = BOOTSTRAP_CATALOG.plans.find((candidate) => candidate.id === 'openai:plus');
    if (!go || !plus) throw new Error('Expected reviewed OpenAI bootstrap plans');

    expect(defaultApiEquivalentForPlan(go, BOOTSTRAP_CATALOG.modelOffers)?.modelId).toBe('gpt-5.6-terra');
    expect(defaultApiEquivalentForPlan(plus, BOOTSTRAP_CATALOG.modelOffers)?.modelId).toBe('gpt-5.6-sol');
  });
});
