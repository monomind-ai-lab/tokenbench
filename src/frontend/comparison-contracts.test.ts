import { describe, expect, it } from 'vitest';
import { parseComparisonViewModel, type ComparisonViewModel } from './comparison-contracts';

const benchLmSource = {
  sourceId: 'benchlm' as const,
  artifactId: 'benchlm-models',
  sourceUrl: 'https://benchlm.example/models',
  observedAt: '2026-08-05T12:00:00.000Z',
  etag: null,
  lastModified: null,
  upstreamRevision: null,
  schemaVersion: null,
  snapshotKey: 'benchlm/models.json',
  contentHash: `sha256:${'a'.repeat(64)}`,
  originalContentHash: `sha256:${'b'.repeat(64)}`,
  licenseId: 'MIT' as const,
  attributionText: 'BenchLM',
};

const openRouterSource = {
  sourceId: 'openrouter' as const,
  artifactId: 'openrouter-catalog',
  sourceUrl: 'https://openrouter.example/models',
  observedAt: '2026-08-05T12:00:00.000Z',
  etag: null,
  lastModified: null,
  upstreamRevision: null,
  schemaVersion: null,
  snapshotKey: 'openrouter/models.json',
  contentHash: `sha256:${'c'.repeat(64)}`,
  originalContentHash: `sha256:${'d'.repeat(64)}`,
  licenseId: 'OpenRouter-ToS' as const,
  attributionText: 'OpenRouter',
};

const viewModel = {
  revision: 'published-r1',
  publishedAt: '2026-08-05T12:00:00.000Z',
  freshness: { status: 'fresh', checkedAt: '2026-08-05T12:00:00.000Z' },
  canonicalPath: '/compare/model-a-vs-model-b',
  models: [
    {
      modelKey: 'provider:model-a', slug: 'model-a', name: 'Model A', creator: 'Provider', sourceType: 'Proprietary', reasoningType: null,
      releaseDate: null, contextWindowTokens: 128000, evidenceStatus: 'supported', rankingEligible: true, confidenceLower: null,
      confidenceUpper: null, benchmarkCount: 1, sourceId: 'benchlm', sourceModelId: 'model-a', sourceArtifactId: 'benchlm-models',
    },
    {
      modelKey: 'provider:model-b', slug: 'model-b', name: 'Model B', creator: 'Provider', sourceType: 'Proprietary', reasoningType: null,
      releaseDate: null, contextWindowTokens: 128000, evidenceStatus: 'supported', rankingEligible: true, confidenceLower: null,
      confidenceUpper: null, benchmarkCount: 1, sourceId: 'benchlm', sourceModelId: 'model-b', sourceArtifactId: 'benchlm-models',
    },
  ],
  metricRows: [],
  priceChecks: [
    { modelKey: 'provider:model-a', checks: [] },
    { modelKey: 'provider:model-b', checks: [] },
  ],
  attribution: [benchLmSource],
  indexable: false,
  methodology: [],
  relatedPairs: [],
  subscriptionMatch: null,
} satisfies ComparisonViewModel;

describe('comparison SSR hydration contract', () => {
  it('accepts a complete server view model including explicit unavailable arrays', () => {
    expect(parseComparisonViewModel(JSON.parse(JSON.stringify(viewModel)))).toEqual(viewModel);
  });

  it('rejects missing required detail data so the browser preserves the server HTML', () => {
    expect(parseComparisonViewModel({ ...viewModel, models: [viewModel.models[0]] })).toBeNull();
    expect(parseComparisonViewModel({ ...viewModel, canonicalPath: '/compare/model-a-vs-model-b/' })).toBeNull();
    expect(parseComparisonViewModel({ ...viewModel, subscriptionMatch: { planId: 'invented' } })).toBeNull();
    expect(parseComparisonViewModel({ ...viewModel, freshness: { status: 'unknown', checkedAt: viewModel.freshness.checkedAt } })).toBeNull();
  });

  it('rejects a metric or price record that does not exactly belong to its labelled model lens', () => {
    const malformedMetric = JSON.parse(JSON.stringify(viewModel)) as Record<string, any>;
    malformedMetric.metricRows = [{
      metricKey: 'benchlm:category:coding',
      category: 'coding',
      unit: 'score',
      sourceId: 'benchlm',
      methodology: 'benchlm_raw_composite',
      modelA: {
        modelKey: 'provider:model-a', metricKey: 'benchlm:category:coding', category: 'coding', value: 80,
        rank: null, lower: null, upper: null, voteCount: null, unit: 'score', sourceId: 'benchlm', sourceUpdatedAt: viewModel.publishedAt,
        sourceModelId: 'model-a', sourceArtifactId: 'benchlm-models', rankingEligible: true, methodology: 'benchlm_raw_composite', observationCount: null, sessionCount: null,
      },
      modelB: {
        modelKey: 'provider:not-model-b', metricKey: 'benchlm:category:other', category: 'other', value: 10,
        rank: null, lower: null, upper: null, voteCount: null, unit: 'score', sourceId: 'benchlm', sourceUpdatedAt: viewModel.publishedAt,
        sourceModelId: 'not-model-b', sourceArtifactId: 'benchlm-models', rankingEligible: true, methodology: 'benchlm_raw_composite', observationCount: null, sessionCount: null,
      },
    }];
    const negativePrice = JSON.parse(JSON.stringify(viewModel)) as Record<string, any>;
    negativePrice.priceChecks[0].checks = [{
      modelKey: 'provider:model-a', sourceId: 'openrouter', providerId: 'openrouter', routeId: 'openrouter:model-a', sourceModelId: 'model-a', sourceArtifactId: 'openrouter-catalog',
      inputUsdPerMillion: -1, cachedInputUsdPerMillion: null, outputUsdPerMillion: 4, contextWindowTokens: 128000,
      verificationStatus: 'primary', canonicalSlug: null, maxInputTokens: null, maxOutputTokens: null, inputModalities: null, outputModalities: null, supportedParameters: null,
    }];

    expect(parseComparisonViewModel(malformedMetric)).toBeNull();
    expect(parseComparisonViewModel(negativePrice)).toBeNull();
  });

  it('rejects unsafe or self-referential related-comparison links', () => {
    const unsafePair = JSON.parse(JSON.stringify(viewModel)) as Record<string, any>;
    unsafePair.relatedPairs = [{
      pairSlug: 'model-a/other', modelA: viewModel.models[0], modelB: viewModel.models[0], featuredRank: 1, sharedMetricCount: 1,
    }];

    expect(parseComparisonViewModel(unsafePair)).toBeNull();
  });

  it('binds canonical and related paths to the exact ordered model slugs', () => {
    const wrongCanonical = { ...viewModel, canonicalPath: '/compare/model-b-vs-model-a' };
    const wrongRelated = JSON.parse(JSON.stringify(viewModel)) as Record<string, any>;
    wrongRelated.relatedPairs = [{
      pairSlug: 'other-vs-model-b',
      modelA: viewModel.models[0],
      modelB: viewModel.models[1],
      featuredRank: 1,
      sharedMetricCount: 1,
    }];

    expect(parseComparisonViewModel(wrongCanonical)).toBeNull();
    expect(parseComparisonViewModel(wrongRelated)).toBeNull();
  });

  it('requires attribution to be the exact provenance set for displayed models, metrics, and prices', () => {
    const populated = JSON.parse(JSON.stringify(viewModel)) as Record<string, any>;
    populated.metricRows = [{
      metricKey: 'benchlm:category:coding', category: 'coding', unit: 'score', sourceId: 'benchlm', methodology: 'benchlm_raw_composite',
      modelA: {
        modelKey: 'provider:model-a', metricKey: 'benchlm:category:coding', category: 'coding', value: 80,
        rank: null, lower: null, upper: null, voteCount: null, unit: 'score', sourceId: 'benchlm', sourceUpdatedAt: viewModel.publishedAt,
        sourceModelId: 'model-a', sourceArtifactId: 'benchlm-models', rankingEligible: true, methodology: 'benchlm_raw_composite', observationCount: null, sessionCount: null,
      },
      modelB: null,
    }];
    populated.priceChecks[0].checks = [{
      modelKey: 'provider:model-a', sourceId: 'openrouter', providerId: 'openrouter', routeId: 'openrouter:model-a', sourceModelId: 'model-a', sourceArtifactId: 'openrouter-catalog',
      inputUsdPerMillion: 1, cachedInputUsdPerMillion: null, outputUsdPerMillion: 4, contextWindowTokens: 128000,
      verificationStatus: 'primary', canonicalSlug: null, maxInputTokens: null, maxOutputTokens: null, inputModalities: null, outputModalities: null, supportedParameters: null,
    }];
    populated.attribution = [benchLmSource, openRouterSource];
    populated.methodology = [{ sourceId: 'benchlm', methodology: 'benchlm_raw_composite' }];

    expect(parseComparisonViewModel(populated)).toEqual(populated);
    expect(parseComparisonViewModel({ ...populated, attribution: [benchLmSource] })).toBeNull();
    expect(parseComparisonViewModel({ ...populated, attribution: [...populated.attribution, benchLmSource] })).toBeNull();
    expect(parseComparisonViewModel({
      ...populated,
      attribution: [...populated.attribution, { ...benchLmSource, artifactId: 'unrelated-artifact' }],
    })).toBeNull();
    expect(parseComparisonViewModel({ ...populated, methodology: [] })).toBeNull();
    expect(parseComparisonViewModel({
      ...populated,
      methodology: [...populated.methodology, populated.methodology[0]],
    })).toBeNull();
    expect(parseComparisonViewModel({
      ...populated,
      methodology: [{ sourceId: 'lmarena', methodology: 'bradley_terry' }],
    })).toBeNull();
  });

  it('rejects related comparison payloads that do not preserve the server route relationship', () => {
    const relatedModel = {
      ...viewModel.models[1],
      modelKey: 'provider:model-c',
      slug: 'model-c',
      name: 'Model C',
      sourceModelId: 'model-c',
    };
    const validRelated = {
      pairSlug: 'model-a-vs-model-c',
      modelA: viewModel.models[0],
      modelB: relatedModel,
      featuredRank: 1,
      sharedMetricCount: 2,
    };
    const payload = { ...viewModel, relatedPairs: [validRelated] };

    expect(parseComparisonViewModel(payload)).toEqual(payload);
    expect(parseComparisonViewModel({ ...payload, relatedPairs: [validRelated, validRelated] })).toBeNull();
    expect(parseComparisonViewModel({ ...payload, relatedPairs: [{ ...validRelated, sharedMetricCount: 1 }] })).toBeNull();
    expect(parseComparisonViewModel({ ...payload, relatedPairs: [{
      ...validRelated,
      pairSlug: 'model-c-vs-model-a',
      modelA: relatedModel,
      modelB: viewModel.models[0],
    }] })).toBeNull();
    expect(parseComparisonViewModel({ ...payload, relatedPairs: [{
      ...validRelated,
      pairSlug: 'model-a-vs-model-b',
      modelA: viewModel.models[0],
      modelB: viewModel.models[1],
    }] })).toBeNull();
    expect(parseComparisonViewModel({ ...payload, relatedPairs: [{
      ...validRelated,
      pairSlug: 'model-c-vs-model-d',
      modelA: relatedModel,
      modelB: { ...relatedModel, modelKey: 'provider:model-d', slug: 'model-d', name: 'Model D', sourceModelId: 'model-d' },
    }] })).toBeNull();
    const moreThanLimit = Array.from({ length: 7 }, (_, index) => ({
      ...validRelated,
      pairSlug: `model-a-vs-model-${index}`,
      modelB: { ...relatedModel, modelKey: `provider:model-${index}`, slug: `model-${index}`, name: `Model ${index}`, sourceModelId: `model-${index}` },
      featuredRank: index + 1,
    }));
    expect(parseComparisonViewModel({ ...payload, relatedPairs: moreThanLimit })).toBeNull();
  });

  it('uses UTF-8 binary ordering for the current canonical route as well as related pair routes', () => {
    const utf8First = { ...viewModel.models[0], modelKey: 'provider:\uE000', slug: 'private-use', sourceModelId: 'private-use' };
    const utf16First = { ...viewModel.models[1], modelKey: 'provider:\u{10000}', slug: 'astral', sourceModelId: 'astral' };
    const canonical = {
      ...viewModel,
      models: [utf8First, utf16First],
      canonicalPath: '/compare/private-use-vs-astral',
      priceChecks: [
        { modelKey: utf8First.modelKey, checks: [] },
        { modelKey: utf16First.modelKey, checks: [] },
      ],
    };

    expect(parseComparisonViewModel(canonical)).toEqual(canonical);
    expect(parseComparisonViewModel({
      ...canonical,
      models: [utf16First, utf8First],
      canonicalPath: '/compare/astral-vs-private-use',
      priceChecks: [canonical.priceChecks[1], canonical.priceChecks[0]],
    })).toBeNull();
  });
});
