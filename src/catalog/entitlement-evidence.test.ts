import { describe, expect, it } from 'vitest';
import { MANUAL_SUBSCRIPTION_PLANS } from './manual-manifests';
import type { EntitlementEvidence, PlanOffer } from './contracts';
import { validateCatalogResponse } from './validation';

/**
 * The specification's release gate: every subscription plan carries a current
 * source, an evidence status, and entitlement dimensions, and no projected or
 * unknown row can present itself as verified capacity.
 */

const PLANS_BY_ID = new Map(MANUAL_SUBSCRIPTION_PLANS.map((plan) => [plan.id, plan]));

function evidenceFor(id: string): EntitlementEvidence {
  const plan = PLANS_BY_ID.get(id);
  if (!plan) throw new Error(`Unknown plan ${id}`);
  return plan.entitlementEvidence;
}

describe('subscription entitlement evidence', () => {
  it('covers all 23 reviewed plans with a status, bound type, and source', () => {
    expect(MANUAL_SUBSCRIPTION_PLANS).toHaveLength(23);
    for (const plan of MANUAL_SUBSCRIPTION_PLANS) {
      expect(['verified', 'projected', 'dynamic_unknown', 'stale']).toContain(plan.entitlementEvidence.status);
      expect(['hard_max', 'practical_upper', 'outer_ceiling', 'unknown']).toContain(plan.entitlementEvidence.boundType);
      expect(plan.entitlementEvidence.source.url).toMatch(/^https:\/\//);
      expect(plan.entitlementEvidence.source.accessedAt).toMatch(/^2026-08-(10|21)T/);
    }
  });

  it('records the published Alibaba Coding Pro call ceilings as a verified hard maximum', () => {
    const evidence = evidenceFor('alibaba:coding-plan-pro');

    expect(evidence.status).toBe('verified');
    expect(evidence.boundType).toBe('hard_max');
    expect(evidence.dimensions.filter((dimension) => dimension.metric === 'model_calls').map((dimension) => [dimension.window, dimension.max]))
      .toEqual([['rolling_5h', 6_000], ['weekly', 45_000], ['monthly', 90_000]]);
    // The provider's 5-30 calls/query range yields a practical query band.
    expect(evidence.dimensions.find((dimension) => dimension.metric === 'tasks'))
      .toMatchObject({ min: 3_000, max: 18_000, window: 'monthly' });
  });

  it('corrects Alibaba Token credit entitlements to the published monthly allowances', () => {
    expect(evidenceFor('alibaba:token-plan-lite').dimensions[0]).toMatchObject({ metric: 'credits', max: 10_000, window: 'monthly' });
    expect(evidenceFor('alibaba:token-plan-standard').dimensions[0]).toMatchObject({ metric: 'credits', max: 40_000, window: 'monthly' });
    expect(evidenceFor('alibaba:token-plan-pro').dimensions[0]).toMatchObject({ metric: 'credits', max: 160_000, window: 'monthly' });
  });

  it('blocks every plan whose published price is known to have drifted', () => {
    const staleIds = MANUAL_SUBSCRIPTION_PLANS
      .filter((plan) => plan.entitlementEvidence.status === 'stale')
      .map((plan) => plan.id)
      .sort();

    expect(staleIds).toEqual([
      'alibaba:token-plan-pro',
      'alibaba:token-plan-standard',
      'google:ai-ultra-20x',
      'google:ai-ultra-5x',
      'openai:go',
      'openai:plus',
      'openai:pro-20x',
      'openai:pro-5x',
      'xai:supergrok',
      'zai:lite',
      'zai:max',
      'zai:pro',
    ]);
    for (const id of staleIds) expect(evidenceFor(id).staleReason).toBeTruthy();
  });

  it('expresses Claude and Gemini capacity as relative projections, never absolute guarantees', () => {
    const relative: Record<string, string> = {
      'anthropic:pro': '5 x F x 144',
      'anthropic:max-5x': '25 x F x 144',
      'anthropic:max-20x': '100 x F x 144',
      'google:ai-plus': '2 x S',
      'google:ai-pro': '4 x S',
    };

    for (const [id, formula] of Object.entries(relative)) {
      const evidence = evidenceFor(id);
      expect(evidence.status).toBe('projected');
      expect(evidence.boundType).toBe('outer_ceiling');
      expect(evidence.projection?.formula).toBe(formula);
      expect(evidence.projection?.caveats.length).toBeGreaterThan(0);
      // A relative ceiling must never publish an absolute numeric bound.
      expect(evidence.dimensions.every((dimension) => dimension.max === undefined)).toBe(true);
    }
  });

  it('keeps last-verified OpenAI bands stale when current sources do not publish numeric caps', () => {
    const expected: Record<string, readonly number[]> = {
      'openai:plus': [14_400, 28_800, 288_000],
      'openai:pro-5x': [72_000, 144_000, 1_440_000],
      'openai:pro-20x': [288_000, 576_000, 5_760_000],
    };

    for (const [id, ceilings] of Object.entries(expected)) {
      const evidence = evidenceFor(id);
      expect(evidence.status).toBe('stale');
      const derived = evidence.dimensions.map((dimension) => (dimension.max ?? 0) * 144);
      expect(derived).toEqual(ceilings);
      expect(evidence.projection?.caveats.join(' ')).toMatch(/weekly cap/i);
    }
  });

  it('maps reviewed OpenAI plans to the direct GPT-5.6 models they expose', () => {
    expect(PLANS_BY_ID.get('openai:go')?.supportedModelIds).toEqual(['gpt-5.6-terra']);
    for (const id of ['openai:plus', 'openai:pro-5x', 'openai:pro-20x']) {
      expect(PLANS_BY_ID.get(id)?.supportedModelIds).toEqual(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']);
    }
  });

  it('marks retained prices stale when current first-party evidence is unavailable or disallowed', () => {
    for (const id of ['xai:supergrok', 'openai:go']) {
      const evidence = evidenceFor(id);
      expect(evidence.status).toBe('stale');
      expect(evidence.boundType).toBe('unknown');
      expect(evidence.dimensions).toEqual([]);
      expect(evidence.projection).toBeUndefined();
    }
  });

  it('records Kimi feature limits without inventing a token conversion', () => {
    const kimi: Record<string, readonly number[]> = {
      'kimi:moderato': [60, 25, 2_000],
      'kimi:allegretto': [150, 50, 5_000],
      'kimi:allegro': [360, 120, 12_000],
      'kimi:vivace': [720, 240, 24_000],
    };

    for (const [id, limits] of Object.entries(kimi)) {
      const evidence = evidenceFor(id);
      expect(evidence.status).toBe('verified');
      expect(evidence.boundType).toBe('practical_upper');
      expect(evidence.dimensions.map((dimension) => dimension.max)).toEqual(limits);
      expect(evidence.dimensions.every((dimension) => dimension.metric === 'feature_uses')).toBe(true);
    }
  });

  it('records current Z.AI five-hour and weekly credit caps without a token conversion', () => {
    const zai: Record<string, readonly [number, number]> = {
      'zai:lite': [2_000, 10_000],
      'zai:pro': [12_000, 60_000],
      'zai:max': [28_000, 140_000],
    };

    for (const [id, [fiveHour, weekly]] of Object.entries(zai)) {
      const evidence = evidenceFor(id);
      expect(evidence.status).toBe('stale');
      expect(evidence.dimensions).toEqual([
        expect.objectContaining({ metric: 'credits', max: fiveHour, window: 'rolling_5h' }),
        expect.objectContaining({ metric: 'credits', max: weekly, window: 'weekly' }),
      ]);
      expect(evidence.projection).toBeUndefined();
    }
  });

  it('never attaches a projection without a formula, assumptions, and caveats', () => {
    for (const plan of MANUAL_SUBSCRIPTION_PLANS) {
      const projection = plan.entitlementEvidence.projection;
      if (projection === undefined) continue;
      expect(projection.formula.length).toBeGreaterThan(0);
      expect(projection.assumptions.length).toBeGreaterThan(0);
      expect(projection.caveats.length).toBeGreaterThan(0);
    }
  });
});

describe('entitlement evidence validation', () => {
  const source = {
    id: 'openai-api', providerId: 'openai', sourceUrl: 'https://example.test/pricing',
    observedAt: '2026-08-10T00:00:00.000Z', sourceKind: 'manual_manifest' as const, confidence: 'manual_verified' as const,
  };
  const basePlan: PlanOffer = {
    id: 'openai:plus', providerId: 'openai', displayName: 'Plus', monthlyCostMicroDollars: 20_000_000,
    currency: 'USD', pricingBasis: 'subscription', route: 'subscription',
    entitlement: { kind: 'rolling_limit', description: 'Usage limits apply.' },
    entitlementEvidence: {
      status: 'verified',
      boundType: 'hard_max',
      dimensions: [{ metric: 'credits', max: 100, unit: 'credits', window: 'monthly' }],
      source: { url: 'https://example.test/pricing', accessedAt: '2026-08-10T00:00:00.000Z', confidence: 'high' },
    },
    sourceId: 'openai-api',
  };

  function catalogWith(evidence: unknown) {
    return {
      revision: 'r1',
      publishedAt: '2026-08-10T00:00:00.000Z',
      freshness: { status: 'fresh' as const, checkedAt: '2026-08-10T00:00:00.000Z' },
      provenance: [source],
      plans: [{ ...basePlan, entitlementEvidence: evidence }],
      modelOffers: [],
    };
  }

  it('accepts a complete verified entitlement', () => {
    expect(validateCatalogResponse(catalogWith(basePlan.entitlementEvidence)).plans).toHaveLength(1);
  });

  it('rejects a projected status with no projection', () => {
    expect(() => validateCatalogResponse(catalogWith({
      ...basePlan.entitlementEvidence,
      status: 'projected',
    }))).toThrow(/projection is required when status is projected/i);
  });

  it('rejects a dynamic unknown row that manufactures a numeric bound', () => {
    expect(() => validateCatalogResponse(catalogWith({
      ...basePlan.entitlementEvidence,
      status: 'dynamic_unknown',
      boundType: 'unknown',
    }))).toThrow(/must not publish a numeric bound/i);
  });

  it('rejects a stale row that does not explain why it is blocked', () => {
    expect(() => validateCatalogResponse(catalogWith({
      ...basePlan.entitlementEvidence,
      status: 'stale',
    }))).toThrow(/staleReason/i);
  });

  it('rejects an inverted dimension band and an unknown metric', () => {
    expect(() => validateCatalogResponse(catalogWith({
      ...basePlan.entitlementEvidence,
      dimensions: [{ metric: 'messages', min: 10, max: 5, unit: 'messages', window: 'weekly' }],
    }))).toThrow(/min must not exceed/i);

    expect(() => validateCatalogResponse(catalogWith({
      ...basePlan.entitlementEvidence,
      dimensions: [{ metric: 'tokens', max: 5, unit: 'tokens', window: 'weekly' }],
    }))).toThrow(/metric is invalid/i);
  });
});
