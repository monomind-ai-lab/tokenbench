import { describe, expect, it } from 'vitest';
import { parseUiDataContractV1Runtime } from '../../../src/pipeline/ui-data-contract-v1';
import { onRequestGet, onRequestPost } from './subscription';

const revision = {
  revision: 'subscription-rev-1',
  published_at: '2026-08-21T00:00:00.000Z',
  checked_at: '2026-08-21T00:00:00.000Z',
};

const openAiSource = {
  id: 'openai-reviewed',
  provider_id: 'openai',
  source_url: 'https://example.test/openai-reviewed',
  observed_at: '2026-08-21T00:00:00.000Z',
  source_kind: 'official_json',
  confidence: 'official',
  snapshot_key: null,
  content_hash: null,
  parser_version: 'test-v1',
  evidence_locator: 'plans',
  review_status: 'verified',
};

const alibabaSource = {
  ...openAiSource,
  id: 'alibaba-reviewed',
  provider_id: 'alibaba',
  source_url: 'https://example.test/alibaba-reviewed',
};

const anthropicSource = {
  ...openAiSource,
  id: 'anthropic-reviewed',
  provider_id: 'anthropic',
  source_url: 'https://example.test/anthropic-reviewed',
};

const dynamicEntitlement = JSON.stringify({
  status: 'dynamic_unknown',
  boundType: 'unknown',
  dimensions: [],
  source: {
    url: 'https://example.test/plan-terms',
    accessedAt: '2026-08-21T00:00:00.000Z',
    confidence: 'high',
  },
});

const openAiPlan = {
  id: 'openai:reviewed',
  provider_id: 'openai',
  display_name: 'Reviewed plan',
  monthly_cost_micro_dollars: 20_000_000,
  currency: 'USD',
  entitlement_json: JSON.stringify({ kind: 'rolling_limit', description: 'Provider-managed limit.' }),
  entitlement_evidence_json: dynamicEntitlement,
  billing_cycle: 'monthly',
  supported_model_ids_json: JSON.stringify(['gpt-4o']),
  source_id: 'openai-reviewed',
};

const alibabaPlan = {
  ...openAiPlan,
  id: 'alibaba:out-of-scope',
  provider_id: 'alibaba',
  display_name: 'Out of scope plan',
  source_id: 'alibaba-reviewed',
};

const anthropicPlan = {
  ...openAiPlan,
  id: 'anthropic:reviewed',
  provider_id: 'anthropic',
  display_name: 'Reviewed capacity plan',
  entitlement_evidence_json: JSON.stringify({
    status: 'verified',
    boundType: 'hard_max',
    dimensions: [{ metric: 'messages', min: 10, max: 100, unit: 'messages', window: 'rolling_5h' }],
    source: {
      url: 'https://example.test/anthropic-terms',
      accessedAt: '2026-08-21T00:00:00.000Z',
      confidence: 'high',
    },
  }),
  source_id: 'anthropic-reviewed',
};

const openAiRoute = {
  id: 'openai:gpt-4o:direct',
  provider_id: 'openai',
  display_name: 'GPT-4o',
  model_id: 'gpt-4o',
  pricing_basis: 'direct_provider_api',
  route: 'direct_provider',
  currency: 'USD',
  unit: 'micro_dollars_per_million_tokens',
  input_micro_dollars_per_million: 2_500_000,
  cached_input_micro_dollars_per_million: 1_250_000,
  cache_write_micro_dollars_per_million: null,
  output_micro_dollars_per_million: 10_000_000,
  context_window_tokens: 128_000,
  max_output_tokens: 16_000,
  availability: 'available',
  expiration_date: null,
  source_id: 'openai-reviewed',
};

function catalogD1(rows: Record<string, unknown[]>) {
  return {
    prepare(sql: string) {
      const key = sql.includes('catalog_revisions') ? 'revision'
        : sql.includes('source_records') ? 'sources'
          : sql.includes('plan_offers') ? 'plans'
            : 'models';
      return {
        bind: () => ({ all: async () => ({ results: rows[key] ?? [] }) }),
      };
    },
  };
}

describe('subscription v1 endpoint boundary', () => {
  it('serves a valid explicit-unavailable catalog envelope', async () => {
    const response = await onRequestGet({ request: new Request(
      'https://tokenbench.example/api/benchmarks/subscription?operation=catalog',
    ) });
    const envelope = parseUiDataContractV1Runtime(await response.json(), 'subscription');
    expect(response.status).toBe(404);
    expect(envelope.request).toEqual({ operation: 'catalog' });
    expect(envelope.revisions.benchmark).toBeNull();
  });

  it('validates calculate bodies before returning explicit unavailability', async () => {
    const request = {
      operation: 'calculate',
      planId: 'pro',
      seats: 1,
      modelMix: [{ modelSlug: 'alpha', routeId: 'alpha-direct', pricingTierId: null, tierContextTokens: 1000, shareBasisPoints: 10000 }],
      workload: { conversationsPerDay: 1, messagesPerConversation: 1, inputTokensPerMessage: 100, outputTokensPerMessage: 50, activeDaysPerMonth: 20 },
      cacheReadShareBasisPoints: 0,
      cacheWriteShareBasisPoints: 0,
      crossoverTokenVolume: 1000000,
    };
    const response = await onRequestPost({ request: new Request(
      'https://tokenbench.example/api/benchmarks/subscription',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) },
    ) });
    const envelope = parseUiDataContractV1Runtime(await response.json(), 'subscription');
    expect(response.status).toBe(404);
    expect(envelope.request).toEqual(request);

    const invalid = await onRequestPost({ request: new Request(
      'https://tokenbench.example/api/benchmarks/subscription',
      { method: 'POST', body: '{' },
    ) });
    expect(invalid.status).toBe(400);
  });

  it('projects reviewed active-catalog plans, entitlement state, and direct routes only for the seven-provider surface', async () => {
    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/subscription?operation=catalog'),
      env: {
        CATALOG_DB: catalogD1({
          revision: [revision],
          sources: [openAiSource, anthropicSource, alibabaSource],
          plans: [openAiPlan, anthropicPlan, alibabaPlan],
          models: [openAiRoute],
        }),
      },
    });

    expect(response.status).toBe(200);
    const envelope = parseUiDataContractV1Runtime(await response.json(), 'subscription');
    expect(envelope.status).toBe('partial');
    expect(envelope.data?.plans).toEqual(expect.arrayContaining([expect.objectContaining({
      planId: 'openai:reviewed', providerId: 'openai', supportedModelSlugs: ['gpt-4o'],
    }), expect.objectContaining({
      planId: 'anthropic:reviewed', providerId: 'anthropic',
    })]));
    expect(envelope.data?.plans.some((plan) => plan.providerId === 'alibaba')).toBe(false);
    expect(envelope.data?.routes).toEqual([expect.objectContaining({
      routeId: 'openai:gpt-4o:direct',
      inputMicroDollarsPerMillion: expect.objectContaining({ value: 2_500_000 }),
      cacheReadMicroDollarsPerMillion: expect.objectContaining({ value: 1_250_000 }),
    })]);
    expect(envelope.data?.routeBindings).toEqual([{
      routeId: 'openai:gpt-4o:direct', modelSlug: 'gpt-4o', providerId: 'openai',
    }]);
    expect(envelope.data?.entitlementProjections).toEqual(expect.arrayContaining([expect.objectContaining({
      planId: 'openai:reviewed',
      evidenceState: 'dynamic_unknown',
      projectedCapacity: null,
    }), expect.objectContaining({
      planId: 'anthropic:reviewed',
      evidenceState: 'provider_stated',
      projectedCapacity: { minimum: 10, maximum: 100, unit: 'messages', window: 'rolling_5h' },
    })]));
    expect(envelope.data?.calculation).toBeNull();
    expect(envelope.warnings).toEqual(expect.arrayContaining([expect.objectContaining({
      code: 'subscription_calculation_binding_unavailable',
    })]));
  });

  it('calculates an exact supported direct route when zero cache-write allocation avoids an unpriced cache-write field', async () => {
    const request = {
      operation: 'calculate',
      planId: 'openai:reviewed',
      seats: 1,
      modelMix: [{
        modelSlug: 'gpt-4o',
        routeId: 'openai:gpt-4o:direct',
        pricingTierId: null,
        tierContextTokens: 128_000,
        shareBasisPoints: 10_000,
      }],
      workload: {
        conversationsPerDay: 1,
        messagesPerConversation: 1,
        inputTokensPerMessage: 1_000,
        outputTokensPerMessage: 500,
        activeDaysPerMonth: 20,
      },
      cacheReadShareBasisPoints: 0,
      cacheWriteShareBasisPoints: 0,
      crossoverTokenVolume: 1_000_000,
    };
    const response = await onRequestPost({
      request: new Request('https://tokenbench.example/api/benchmarks/subscription', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      }),
      env: {
        CATALOG_DB: catalogD1({
          revision: [revision],
          sources: [openAiSource],
          plans: [openAiPlan],
          models: [openAiRoute],
        }),
      },
    });

    expect(response.status).toBe(200);
    const envelope = parseUiDataContractV1Runtime(await response.json(), 'subscription');
    expect(envelope.request).toEqual(request);
    expect(envelope.data?.calculation?.selectedPlanId).toBe('openai:reviewed');
    expect(envelope.data?.calculation?.lineItems.some((line) => line.kind === 'cache_write')).toBe(false);
  });

  it('retains a published zero cache-write rate instead of fabricating an input-rate fallback', async () => {
    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/subscription?operation=catalog'),
      env: {
        CATALOG_DB: catalogD1({
          revision: [revision],
          sources: [openAiSource],
          plans: [openAiPlan],
          models: [{ ...openAiRoute, cache_write_micro_dollars_per_million: 0 }],
        }),
      },
    });

    expect(response.status).toBe(200);
    const envelope = parseUiDataContractV1Runtime(await response.json(), 'subscription');
    expect(envelope.data?.routes[0]?.cacheWriteMicroDollarsPerMillion).toEqual({
      availability: 'available',
      value: 0,
      sourceRefs: ['catalog:subscription-rev-1:openai-reviewed'],
    });
  });

  it('keeps same-slug provider offers distinct and rejects a cross-provider route binding', async () => {
    const anthropicRoute = {
      ...openAiRoute,
      id: 'anthropic:gpt-4o:direct',
      provider_id: 'anthropic',
      source_id: 'anthropic-reviewed',
    };
    const catalog = {
      revision: [revision],
      sources: [openAiSource, anthropicSource],
      plans: [openAiPlan],
      models: [openAiRoute, anthropicRoute],
    };
    const catalogResponse = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/subscription?operation=catalog'),
      env: { CATALOG_DB: catalogD1(catalog) },
    });
    const envelope = parseUiDataContractV1Runtime(await catalogResponse.json(), 'subscription');
    expect(envelope.data?.routes.map((route) => route.routeId).sort()).toEqual([
      'anthropic:gpt-4o:direct',
      'openai:gpt-4o:direct',
    ]);
    expect([...(envelope.data?.routeBindings ?? [])].sort((left, right) => left.routeId.localeCompare(right.routeId))).toEqual([
      { routeId: 'anthropic:gpt-4o:direct', modelSlug: 'gpt-4o', providerId: 'anthropic' },
      { routeId: 'openai:gpt-4o:direct', modelSlug: 'gpt-4o', providerId: 'openai' },
    ]);

    const response = await onRequestPost({
      request: new Request('https://tokenbench.example/api/benchmarks/subscription', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'calculate',
          planId: 'openai:reviewed',
          seats: 1,
          modelMix: [{
            modelSlug: 'gpt-4o', routeId: 'anthropic:gpt-4o:direct', pricingTierId: null,
            tierContextTokens: 128_000, shareBasisPoints: 10_000,
          }],
          workload: {
            conversationsPerDay: 1, messagesPerConversation: 1,
            inputTokensPerMessage: 1_000, outputTokensPerMessage: 500, activeDaysPerMonth: 20,
          },
          cacheReadShareBasisPoints: 0,
          cacheWriteShareBasisPoints: 0,
          crossoverTokenVolume: 1_000_000,
        }),
      }),
      env: { CATALOG_DB: catalogD1(catalog) },
    });
    expect(response.status).toBe(404);
    expect(parseUiDataContractV1Runtime(await response.json(), 'subscription').status).toBe('unavailable');
  });
});
