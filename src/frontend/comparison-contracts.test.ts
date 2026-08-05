import { describe, expect, it } from 'vitest';
import { parseComparisonViewModel, type ComparisonViewModel } from './comparison-contracts';

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
  attribution: [],
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
});
