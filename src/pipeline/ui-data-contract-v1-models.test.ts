import { describe, expect, it } from 'vitest';
import type { SourceAttribution } from './ui-data-contract-v1-core';
import {
  normalizeComparisonRequest,
  normalizeLifecycleRequest,
  normalizeModelsRequest,
  normalizeProfileRequest,
  parseComparisonQuery,
  validateModelMethodData,
} from './ui-data-contract-v1-models';

const source: SourceAttribution = {
  sourceRef: 'catalog:openai',
  fieldGroup: '/data/models',
  sourceId: 'catalog',
  sourceRevision: 'catalog-1',
  label: 'OpenAI catalog',
  url: 'https://example.test/catalog/openai',
  licenseId: 'provider-terms',
  observedAt: '2026-08-18T00:00:00.000Z',
  effectiveAt: '2026-08-18T00:00:00.000Z',
};

const sources = [source] as const;
const modelsRequest = {
  search: null,
  access: 'all' as const,
  providerIds: [] as const,
  limit: 50,
  cursor: null,
};
const profileRequest = { slug: 'gpt-4o' } as const;
const comparisonRequest = { modelSlugs: ['gpt-4o', 'claude-3-5-sonnet'] } as const;

function available<T>(value: T) {
  return { availability: 'available' as const, value, sourceRefs: [source.sourceRef] };
}

function unavailable(reason: string) {
  return {
    availability: 'unavailable' as const,
    value: null,
    reason,
    sourceRefs: [source.sourceRef],
  };
}

function route(routeId = 'openai-direct') {
  return {
    routeId,
    providerId: 'openai',
    status: 'available' as const,
    inputMicroDollarsPerMillion: available(2_500_000),
    outputMicroDollarsPerMillion: available(10_000_000),
    cacheReadMicroDollarsPerMillion: available(1_250_000),
    cacheWriteMicroDollarsPerMillion: available(2_500_000),
    contextWindowTokens: available(128_000),
    maxOutputTokens: available(16_384),
    inputModalities: ['text'] as const,
    outputModalities: ['text'] as const,
    ttftP50Ms: available(280),
    tpsP50: available(85),
    uptimeBasisPoints: available(9_999),
    runtimeObservation: available({
      windowStartedAt: '2026-08-17T00:00:00.000Z',
      windowEndedAt: '2026-08-18T00:00:00.000Z',
      sampleSize: 100,
      ttftPercentile: 'p50' as const,
      tpsPercentile: 'p50' as const,
    }),
    pricingTiers: [{
      pricingTierId: 'standard',
      minimumContextTokens: 1,
      maximumContextTokens: null,
      inputMicroDollarsPerMillion: available(2_500_000),
      outputMicroDollarsPerMillion: available(10_000_000),
      cacheReadMicroDollarsPerMillion: available(1_250_000),
      cacheWriteMicroDollarsPerMillion: available(2_500_000),
    }],
  };
}

function profile(slug = 'gpt-4o') {
  const selectedRoute = route();
  return {
    summary: {
      identity: {
        configurationId: `openai:${slug}`,
        slug,
        displayName: slug.toUpperCase(),
        organization: 'OpenAI',
      },
      openWeights: available(false),
      isDerivativeFinetune: false,
      baseModelSlug: null,
      overall: {
        dimensionId: 'overall',
        label: 'Overall',
        score: available(87.5),
        rank: available(1),
        fieldSize: available(10),
      },
      categories: [{
        dimensionId: 'coding',
        label: 'Coding',
        score: available(90),
        rank: available(1),
        fieldSize: available(10),
      }],
      selectedRouteId: selectedRoute.routeId,
      selectedRoutePolicy: 'lowest available price',
      selectedRoute,
      lifecycleStatus: available('current' as const),
    },
    releaseOn: '2026-01-15',
    tasks: [{
      taskId: 'coding-hard',
      label: 'Coding Hard',
      categoryId: 'coding',
      score: available(90),
      questionCount: available(100),
      evaluationCostUsd: available(1.25),
      inputPriceUsdPerMillion: available(2.5),
      outputPriceUsdPerMillion: available(10),
      equivalentSuccesses: available(90),
      costPerSuccessfulEvaluationUsd: available(0.014),
      meanInputTokens: available(4_000),
      meanOutputTokens: available(800),
    }],
    routes: [selectedRoute],
    lifecycleEvents: [{
      eventId: 'announce-2026-01-15',
      eventType: 'announcement' as const,
      effectiveAt: '2026-01-15T00:00:00.000Z',
      observedAt: '2026-01-15T00:00:00.000Z',
      confidence: 'official' as const,
    }],
    replacement: available({ modelSlug: 'gpt-4o', migrationNote: 'No migration required.' }),
  };
}

function invalidRankProfile() {
  const data = { model: profile() };
  data.model.summary.overall.rank = available(11);
  return data;
}

function mismatchedSelectedRoute() {
  const first = profile('gpt-4o');
  const second = profile('claude-3-5-sonnet');
  second.summary.selectedRoute = route();
  second.summary.selectedRoute.ttftP50Ms = available(281);
  return {
    requestedModelSlugs: ['gpt-4o', 'claude-3-5-sonnet'],
    models: [first, second],
  };
}

describe('UI data contract v1 model methods', () => {
  it('normalizes bounded directory pagination', () => {
    expect(normalizeModelsRequest({ search: ' GPT ', access: 'all', providerIds: [], limit: 50, cursor: null }))
      .toEqual({ search: 'GPT', access: 'all', providerIds: [], limit: 50, cursor: null });
    expect(() => normalizeModelsRequest({ search: 'x'.repeat(81), access: 'all', providerIds: [], limit: 50, cursor: null }))
      .toThrowError(expect.objectContaining({ code: 'invalid_request' }));
  });

  it('binds lifecycle projection to the exact as-of timestamp', () => {
    expect(normalizeLifecycleRequest({ asOf: '2026-08-18T00:00:00.000Z', horizonDays: 90 }))
      .toEqual({ asOf: '2026-08-18T00:00:00.000Z', horizonDays: 90 });
  });

  it('rejects duplicate comparison transport values instead of rewriting the echoed request', () => {
    expect(() => parseComparisonQuery(new URL(
      'https://tokenbench.test/api/v2/compare?models=gpt-4o%2Cgpt-4o%2Cclaude-3-5-sonnet',
    ))).toThrowError(expect.objectContaining({ code: 'invalid_request' }));
    expect(() => parseComparisonQuery(new URL('https://tokenbench.test/api/v2/compare?models=gpt-4o%2Cgpt-4o')))
      .toThrowError(expect.objectContaining({ code: 'invalid_request' }));
  });

  it('rejects duplicate comparison query parameters', () => {
    expect(() => parseComparisonQuery(new URL(
      'https://tokenbench.test/api/v2/compare?models=gpt-4o%2Cclaude-3-5-sonnet&models=gemini-2.5-pro%2Cllama-4',
    ))).toThrowError(expect.objectContaining({ code: 'invalid_request' }));
  });

  it('rejects an overlong decoded comparison query', () => {
    const models = `gpt-4o,${'a'.repeat(1_018)}`;
    expect(models).toHaveLength(1_024 + 1);
    expect(() => parseComparisonQuery(new URL(`https://tokenbench.test/api/v2/compare?models=${models}`)))
      .toThrowError(expect.objectContaining({ code: 'invalid_request' }));
  });

  it('classifies missing and undeclared request fields as invalid requests', () => {
    for (const normalize of [
      () => normalizeModelsRequest({ unexpected: true }),
      () => normalizeProfileRequest({}),
      () => normalizeProfileRequest({ slug: 'gpt-4o', unexpected: true }),
      () => normalizeLifecycleRequest({ asOf: '2026-08-18T00:00:00.000Z' }),
      () => normalizeComparisonRequest({ modelSlugs: ['gpt-4o', 'claude-3-5-sonnet'], unexpected: true }),
    ]) {
      expect(normalize).toThrowError(expect.objectContaining({ code: 'invalid_request' }));
    }
  });

  it('keeps undeclared response fields classified as response failures', () => {
    const summary = { ...profile().summary, unexpected: true };
    expect(() => validateModelMethodData('models', { models: [summary], total: 1, nextCursor: null }, modelsRequest, sources))
      .toThrowError(expect.objectContaining({ code: 'undeclared_field' }));
  });

  it('rejects rank above field size and route/runtime mismatch', () => {
    expect(() => validateModelMethodData('profile', invalidRankProfile(), profileRequest, sources))
      .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
    expect(() => validateModelMethodData('comparison', mismatchedSelectedRoute(), comparisonRequest, sources))
      .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('bounds equivalent successes and requires integer task token counts', () => {
    const excessiveSuccesses = { model: profile() };
    excessiveSuccesses.model.tasks[0]!.equivalentSuccesses = available(Number.MAX_SAFE_INTEGER + 1);
    const fractionalInputTokens = { model: profile() };
    fractionalInputTokens.model.tasks[0]!.meanInputTokens = available(1.5);
    const fractionalOutputTokens = { model: profile() };
    fractionalOutputTokens.model.tasks[0]!.meanOutputTokens = available(1.5);

    for (const data of [excessiveSuccesses, fractionalInputTokens, fractionalOutputTokens]) {
      expect(() => validateModelMethodData('profile', data, profileRequest, sources))
        .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
    }
  });

  it('accepts complete profile facts and binds lifecycle and comparison data to requests', () => {
    const validProfile = { model: profile() };
    expect(validateModelMethodData('profile', validProfile, profileRequest, sources)).toEqual(validProfile);
    expect(validateModelMethodData('lifecycle', {
      asOf: '2026-08-18T00:00:00.000Z',
      horizonDays: 90,
      models: [{
        identity: validProfile.model.summary.identity,
        status: available('current' as const),
        events: validProfile.model.lifecycleEvents,
        replacement: validProfile.model.replacement,
      }],
    }, { asOf: '2026-08-18T00:00:00.000Z', horizonDays: 90 }, sources)).toMatchObject({
      asOf: '2026-08-18T00:00:00.000Z',
      horizonDays: 90,
    });
    const comparison = {
      requestedModelSlugs: ['gpt-4o', 'claude-3-5-sonnet'],
      models: [profile('gpt-4o'), profile('claude-3-5-sonnet')],
    };
    expect(validateModelMethodData('comparison', comparison, comparisonRequest, sources)).toEqual(comparison);
  });

  it('accepts a complete ordered three-model comparison', () => {
    const request = { modelSlugs: ['gpt-4o', 'claude-3-5-sonnet', 'gemini-2.5-pro'] } as const;
    const comparison = {
      requestedModelSlugs: ['gpt-4o', 'claude-3-5-sonnet', 'gemini-2.5-pro'],
      models: [profile('gpt-4o'), profile('claude-3-5-sonnet'), profile('gemini-2.5-pro')],
    };
    expect(validateModelMethodData('comparison', comparison, request, sources)).toEqual(comparison);
  });

  it('distinguishes unavailable null evidence from an available numeric zero', () => {
    const model = profile();
    const selectedRoute = {
      ...model.summary.selectedRoute,
      cacheReadMicroDollarsPerMillion: available(0),
      maxOutputTokens: unavailable('The provider does not publish an output limit.'),
    };
    const data = {
      model: {
        ...model,
        summary: { ...model.summary, selectedRoute },
        routes: [selectedRoute],
      },
    };
    expect(validateModelMethodData('profile', data, profileRequest, sources)).toEqual(data);
  });

  it('couples derivative status to explicit base-model evidence', () => {
    const nonDerivative = profile();
    expect(() => validateModelMethodData('profile', {
      model: {
        ...nonDerivative,
        summary: { ...nonDerivative.summary, baseModelSlug: available('gpt-4o-mini') },
      },
    }, profileRequest, sources)).toThrowError(expect.objectContaining({ code: 'invalid_response' }));

    const derivativeWithoutLineage = profile();
    expect(() => validateModelMethodData('profile', {
      model: {
        ...derivativeWithoutLineage,
        summary: { ...derivativeWithoutLineage.summary, isDerivativeFinetune: true },
      },
    }, profileRequest, sources)).toThrowError(expect.objectContaining({ code: 'invalid_response' }));

    const derivativeWithUnavailableLineage = profile();
    const data = {
      model: {
        ...derivativeWithUnavailableLineage,
        summary: {
          ...derivativeWithUnavailableLineage.summary,
          isDerivativeFinetune: true,
          baseModelSlug: unavailable('The base-model mapping has not been reviewed.'),
        },
      },
    };
    expect(validateModelMethodData('profile', data, profileRequest, sources)).toEqual(data);
  });

  it('rejects a standalone summary whose selected route ID conflicts with its route', () => {
    const summary = profile().summary;
    const selectedRoute = { ...summary.selectedRoute, routeId: 'conflicting-route' };
    expect(() => validateModelMethodData('models', {
      models: [{ ...summary, selectedRoute }],
      total: 1,
      nextCursor: null,
    }, modelsRequest, sources)).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('rejects an available zero maximum output-token limit', () => {
    const model = profile();
    const selectedRoute = { ...model.summary.selectedRoute, maxOutputTokens: available(0) };
    expect(() => validateModelMethodData('profile', {
      model: {
        ...model,
        summary: { ...model.summary, selectedRoute },
        routes: [selectedRoute],
      },
    }, profileRequest, sources)).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('enforces distinct safe comparison slugs after transport normalization', () => {
    expect(normalizeComparisonRequest({ modelSlugs: ['gpt-4o', 'claude-3-5-sonnet', 'gemini-2.5-pro', 'llama-4'] }))
      .toEqual({ modelSlugs: ['gpt-4o', 'claude-3-5-sonnet', 'gemini-2.5-pro', 'llama-4'] });
    for (const modelSlugs of [
      ['GPT-4O', 'claude-3-5-sonnet'],
      ['a'.repeat(161), 'claude-3-5-sonnet'],
      ['gpt-4o'],
      ['gpt-4o', 'claude-3-5-sonnet', 'gemini-2.5-pro', 'llama-4', 'mistral-large'],
    ]) {
      expect(() => normalizeComparisonRequest({ modelSlugs }))
        .toThrowError(expect.objectContaining({ code: 'invalid_request' }));
    }
  });

  it('exposes model methods from the public contract boundary', async () => {
    const contract = await import('./ui-data-contract-v1');
    expect(contract.normalizeProfileRequest).toBe(normalizeProfileRequest);
  });
});
