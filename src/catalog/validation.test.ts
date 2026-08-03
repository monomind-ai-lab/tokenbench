import { describe, expect, it } from 'vitest';
import { validateCatalogResponse } from './validation';

const validCatalog = {
  revision: 'rev_20260803_001',
  publishedAt: '2026-08-03T00:00:00.000Z',
  freshness: { status: 'fresh', checkedAt: '2026-08-03T00:00:00.000Z' },
  provenance: [{
    id: 'openai-api', providerId: 'openai', sourceUrl: 'https://platform.openai.com/docs/pricing',
    observedAt: '2026-08-03T00:00:00.000Z', sourceKind: 'official_json', confidence: 'official',
  }],
  plans: [{
    id: 'openai:plus', providerId: 'openai', displayName: 'Plus', monthlyCostMicroDollars: 20_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription',
    entitlement: { kind: 'rolling_limit', description: 'Usage limits apply.' }, sourceId: 'openai-api',
  }],
  modelOffers: [{
    id: 'openai:gpt-4o:direct', providerId: 'openai', displayName: 'GPT-4o', modelId: 'gpt-4o',
    pricingBasis: 'direct_provider_api', route: 'direct_provider', currency: 'USD',
    unit: 'micro_dollars_per_million_tokens', inputMicroDollarsPerMillion: 2_500_000,
    cachedInputMicroDollarsPerMillion: 1_250_000, outputMicroDollarsPerMillion: 10_000_000, sourceId: 'openai-api',
  }],
};

describe('catalog validation', () => {
  it('accepts a complete source-linked catalog', () => {
    expect(validateCatalogResponse(validCatalog)).toEqual(validCatalog);
  });

  it('rejects duplicate stable offer IDs', () => {
    expect(() => validateCatalogResponse({ ...validCatalog, plans: [...validCatalog.plans, validCatalog.plans[0]] }))
      .toThrow('Duplicate plan id: openai:plus');
  });

  it('rejects malformed prices and unknown source references', () => {
    expect(() => validateCatalogResponse({
      ...validCatalog,
      modelOffers: [{ ...validCatalog.modelOffers[0], inputMicroDollarsPerMillion: -1 }],
    })).toThrow('modelOffers[0].inputMicroDollarsPerMillion must be a non-negative integer');
    expect(() => validateCatalogResponse({
      ...validCatalog,
      plans: [{ ...validCatalog.plans[0], sourceId: 'missing' }],
    })).toThrow('plans[0].sourceId must refer to provenance');
  });
});
