import { describe, expect, it } from 'vitest';
import {
  isEditorialComparisonPair,
} from './comparison-allowlist';
import {
  resolvedModelKey,
  resolveCanonicalModelKey,
  sourceSpecificModelKey,
} from './model-aliases';
import { validateNormalizedSourceBatch } from './contracts';
import { subscriptionPlanIdsForModel } from './subscription-model-map';

const observedAt = '2026-08-05T00:00:00.000Z';

const validBatch = {
  sources: [
    {
      sourceId: 'benchlm',
      artifactId: 'leaderboard-v1',
      sourceUrl: 'https://benchlm.ai/data/leaderboard.json',
      observedAt,
      etag: null,
      lastModified: null,
      upstreamRevision: null,
      schemaVersion: '1.0',
      snapshotKey: 'benchmarks/benchlm/leaderboard-v1.json',
      contentHash: 'sha256:benchlm-leaderboard-v1',
      licenseId: 'MIT',
      attributionText: 'Data from BenchLM.ai',
    },
    {
      sourceId: 'openrouter',
      artifactId: 'models-r1',
      sourceUrl: 'https://openrouter.ai/api/v1/models',
      observedAt,
      etag: '"models-r1"',
      lastModified: null,
      upstreamRevision: 'catalog-r1',
      schemaVersion: null,
      snapshotKey: 'catalog/openrouter/models-r1.json',
      contentHash: 'sha256:openrouter-models-r1',
      licenseId: 'OpenRouter-ToS',
      attributionText: 'Catalog and pricing data from OpenRouter',
    },
  ],
  models: [
    {
      modelKey: 'openai:gpt-4o',
      slug: 'gpt-4o',
      name: 'GPT-4o',
      creator: 'OpenAI',
      sourceType: 'Proprietary',
      reasoningType: null,
      releaseDate: null,
      contextWindowTokens: null,
      evidenceStatus: 'supported',
      rankingEligible: true,
      confidenceLower: null,
      confidenceUpper: null,
      benchmarkCount: 1,
      sourceId: 'benchlm',
      sourceModelId: 'openai/gpt-4o',
      sourceArtifactId: 'leaderboard-v1',
    },
  ],
  metrics: [
    {
      modelKey: 'openai:gpt-4o',
      metricKey: 'benchlm:overall:raw',
      category: 'overall',
      value: 75.5,
      rank: 1,
      lower: null,
      upper: null,
      voteCount: null,
      unit: 'score',
      sourceId: 'benchlm',
      sourceUpdatedAt: observedAt,
      sourceModelId: 'openai/gpt-4o',
      sourceArtifactId: 'leaderboard-v1',
      rankingEligible: true,
      methodology: 'benchlm_raw_composite',
      observationCount: null,
      sessionCount: null,
    },
  ],
  priceChecks: [
    {
      modelKey: 'openai:gpt-4o',
      sourceId: 'openrouter',
      providerId: 'openrouter',
      inputUsdPerMillion: 0,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: 10,
      contextWindowTokens: 128_000,
      verificationStatus: 'primary',
      routeId: 'openrouter:openai/gpt-4o',
      sourceModelId: 'openai/gpt-4o',
      canonicalSlug: 'gpt-4o',
      maxInputTokens: null,
      maxOutputTokens: 16_000,
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportedParameters: ['tools'],
      sourceArtifactId: 'models-r1',
    },
  ],
  comparisonSeeds: [],
};

function batchWithComparison() {
  const secondModel = {
    ...validBatch.models[0],
    modelKey: 'anthropic:claude-3-7-sonnet',
    slug: 'claude-3-7-sonnet',
    name: 'Claude 3.7 Sonnet',
    sourceModelId: 'anthropic/claude-3-7-sonnet',
  };

  return {
    ...validBatch,
    models: [...validBatch.models, secondModel],
    comparisonSeeds: [{
      pairSlug: 'claude-3-7-sonnet-vs-gpt-4o',
      modelAKey: 'anthropic:claude-3-7-sonnet',
      modelBKey: 'openai:gpt-4o',
      sourceId: 'benchlm',
      sourceArtifactId: 'leaderboard-v1',
      sourceModelAId: 'anthropic/claude-3-7-sonnet',
      sourceModelBId: 'openai/gpt-4o',
      featuredRank: 1,
    }],
  };
}

describe('benchmark contracts', () => {
  it('accepts a source-linked batch and preserves explicit nulls and zero-price evidence', () => {
    const result = validateNormalizedSourceBatch(validBatch);

    expect(result.models[0].contextWindowTokens).toBeNull();
    expect(result.metrics[0].lower).toBeNull();
    expect(result.priceChecks[0].inputUsdPerMillion).toBe(0);
    expect(result.priceChecks[0].cachedInputUsdPerMillion).toBeNull();
    expect(result.sources[0].etag).toBeNull();
  });

  it('rejects source records with prohibited Artificial Analysis identifiers or URLs', () => {
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      sources: [{ ...validBatch.sources[0], sourceId: 'aa-feed' }],
    })).toThrow(/prohibited/i);
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      sources: [{ ...validBatch.sources[0], sourceUrl: 'https://artificialanalysis.ai/data' }],
    })).toThrow(/prohibited/i);
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], metricKey: 'aa:overall' }],
    })).toThrow(/prohibited/i);
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], metricKey: 'benchlm:aa:overall' }],
    })).toThrow(/prohibited/i);
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], category: 'Artificial Analysis composite' }],
    })).toThrow(/prohibited/i);
  });

  it('rejects missing, non-finite, or negative numeric evidence instead of coercing it', () => {
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      priceChecks: [{ ...validBatch.priceChecks[0], inputUsdPerMillion: undefined }],
    })).toThrow('priceChecks[0].inputUsdPerMillion must be a finite number or null');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], value: Number.NaN }],
    })).toThrow('metrics[0].value must be a finite number');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      priceChecks: [{ ...validBatch.priceChecks[0], outputUsdPerMillion: -0.01 }],
    })).toThrow('priceChecks[0].outputUsdPerMillion must be a non-negative finite number or null');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      models: [{ ...validBatch.models[0], contextWindowTokens: -1 }],
    })).toThrow('models[0].contextWindowTokens must be a non-negative integer or null');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], voteCount: -1 }],
    })).toThrow('metrics[0].voteCount must be a non-negative integer or null');
  });

  it('rejects incomplete or inverted confidence intervals', () => {
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      models: [{ ...validBatch.models[0], confidenceLower: 80, confidenceUpper: 70 }],
    })).toThrow('models[0].confidenceLower must be less than or equal to models[0].confidenceUpper');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [{ ...validBatch.metrics[0], lower: 70, upper: null }],
    })).toThrow('metrics[0] confidence bounds must both be null or finite numbers');
  });

  it('rejects facts that cannot be traced to their declared source artifact', () => {
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      priceChecks: [{ ...validBatch.priceChecks[0], sourceArtifactId: 'not-stored' }],
    })).toThrow('priceChecks[0].sourceArtifactId must refer to a source artifact for openrouter');
  });

  it('rejects duplicate normalized identities', () => {
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      models: [...validBatch.models, validBatch.models[0]],
    })).toThrow('Duplicate model key: openai:gpt-4o');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      metrics: [...validBatch.metrics, validBatch.metrics[0]],
    })).toThrow('Duplicate metric identity: openai:gpt-4o/benchlm:overall:raw');
    expect(() => validateNormalizedSourceBatch({
      ...validBatch,
      priceChecks: [...validBatch.priceChecks, validBatch.priceChecks[0]],
    })).toThrow('Duplicate price-check identity: openai:gpt-4o/openrouter/openrouter/openrouter:openai/gpt-4o');
  });

  it('accepts only lexically ordered canonical comparison pairs', () => {
    expect(validateNormalizedSourceBatch(batchWithComparison()).comparisonSeeds[0].pairSlug)
      .toBe('claude-3-7-sonnet-vs-gpt-4o');
    expect(() => validateNormalizedSourceBatch({
      ...batchWithComparison(),
      comparisonSeeds: [{
        ...batchWithComparison().comparisonSeeds[0],
        modelAKey: 'openai:gpt-4o',
        modelBKey: 'anthropic:claude-3-7-sonnet',
        pairSlug: 'gpt-4o-vs-claude-3-7-sonnet',
        sourceModelAId: 'openai/gpt-4o',
        sourceModelBId: 'anthropic/claude-3-7-sonnet',
      }],
    })).toThrow('comparisonSeeds[0].modelAKey must sort before comparisonSeeds[0].modelBKey');
  });
});

describe('exact-review model policy', () => {
  it('does not fuzzy-match an unreviewed source identifier and creates a stable source-specific key', () => {
    expect(resolveCanonicalModelKey('openrouter', 'OpenAI/GPT-4o')).toBeNull();
    expect(sourceSpecificModelKey('openrouter', 'OpenAI/GPT-4o')).toBe('source:openrouter:OpenAI%2FGPT-4o');
    expect(resolvedModelKey('openrouter', 'OpenAI/GPT-4o')).toBe('source:openrouter:OpenAI%2FGPT-4o');
  });

  it('treats absent checked-in comparison and subscription entries as unverified', () => {
    expect(isEditorialComparisonPair('claude-3-7-sonnet-vs-gpt-4o')).toBe(false);
    expect(subscriptionPlanIdsForModel('openai:gpt-4o')).toEqual([]);
  });
});
