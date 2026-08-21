import { describe, expect, it } from 'vitest';
import { modelPath, parseModelDirectoryEnvelope } from './model-directory-contracts';

const UPDATED_AT = '2026-08-10T01:00:00.000Z';

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    revision: 'benchlm-r1',
    publishedAt: UPDATED_AT,
    freshness: { status: 'fresh', checkedAt: UPDATED_AT },
    attribution: [{ sourceId: 'benchlm', label: 'BenchLM', url: 'https://benchlm.ai/leaderboard', updatedAt: UPDATED_AT }],
    data: {
      week: {
        weekStart: '2026-08-10T00:00:00.000Z',
        benchmarkRevision: 'benchlm-r1',
        sourceSnapshotId: 'benchlm-public',
        methodologyVersion: 'bench-align-v5',
        generatedAt: UPDATED_AT,
      },
      models: [{
        modelKey: 'benchlm:openai:gpt-5-6-sol',
        canonicalSlug: 'gpt-5-6-sol',
        displayName: 'GPT-5.6 Sol',
        creator: 'OpenAI',
        sourceType: 'Proprietary',
        reasoningType: 'reasoning',
        familyId: null,
        variantId: null,
        firstSeenRevision: 'benchlm-r1',
        firstSeenAt: UPDATED_AT,
        lastSeenRevision: 'benchlm-r1',
        lastSeenAt: UPDATED_AT,
        latestProfileRevision: 'benchlm-r1',
        status: 'current',
        sourceId: 'benchlm',
        sourceModelId: 'gpt-5.6-sol',
        updatedAt: UPDATED_AT,
        weeklyRank: 1,
        overallScore: 81.48,
        overallRank: 1,
        categories: [{
          key: 'coding', metricKey: 'benchlm:category:coding', label: 'Coding', score: 77.95,
          rawScore: null, rank: 3, fieldSize: 31, percentile: 93.33, evidenceStatus: 'supported',
          benchmarkCount: 12, rankingEligible: true, unit: 'score', sourceId: 'benchlm',
        }],
        strongestCategory: {
          key: 'coding', metricKey: 'benchlm:category:coding', label: 'Coding', score: 77.95,
          rawScore: null, rank: 3, fieldSize: 31, percentile: 93.33, evidenceStatus: 'supported',
          benchmarkCount: 12, rankingEligible: true, unit: 'score', sourceId: 'benchlm',
        },
        representativePrice: {
          sourceId: 'openrouter', providerId: 'openai', routeId: 'openrouter:gpt-5-6-sol', sourceModelId: 'openai/gpt-5.6-sol', canonicalSlug: 'gpt-5-6-sol',
          inputUsdPerMillion: 1, cachedInputUsdPerMillion: null, outputUsdPerMillion: 4, contextWindowTokens: 128000,
          maxInputTokens: null, maxOutputTokens: 16000, inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['tools'],
          verificationStatus: 'primary', sourceArtifactId: 'openrouter-models', sourceUrl: 'https://openrouter.ai/models', observedAt: UPDATED_AT,
        },
        evidenceStatus: 'supported',
        profileRevision: 'benchlm-r1',
        profileFallback: 'none',
        profilePublishedAt: UPDATED_AT,
        profileCheckedAt: UPDATED_AT,
      }],
      nextCursor: null,
    },
    ...overrides,
  };
}

describe('model directory hydration contract', () => {
  it('accepts the server envelope and preserves decision facts', () => {
    const parsed = parseModelDirectoryEnvelope(envelope());
    expect(parsed?.data.models[0]).toMatchObject({
      canonicalSlug: 'gpt-5-6-sol',
      displayName: 'GPT-5.6 Sol',
      overallScore: 81.48,
      weeklyRank: 1,
    });
  });

  it('preserves ordered category vectors, accepts the prior producer shape, and rejects invalid vectors', () => {
    const source = envelope();
    const model = source.data.models[0]!;
    const reasoning = {
      ...model.categories[0]!,
      key: 'reasoning',
      metricKey: 'benchlm:category:reasoning',
      label: 'Reasoning',
    };
    const withVector = {
      ...source,
      data: {
        ...source.data,
        models: [{ ...model, categories: [model.categories[0], reasoning] }],
      },
    };

    expect(parseModelDirectoryEnvelope(withVector)?.data.models[0]?.categories.map((category) => category.key))
      .toEqual(['coding', 'reasoning']);
    const { categories: _categories, ...priorProducerModel } = model;
    expect(parseModelDirectoryEnvelope({
      ...source,
      data: { ...source.data, models: [priorProducerModel] },
    })?.data.models[0]?.categories).toEqual([]);
    expect(parseModelDirectoryEnvelope({
      ...source,
      data: { ...source.data, models: [{ ...model, categories: null }] },
    })).toBeNull();
    expect(parseModelDirectoryEnvelope({
      ...source,
      data: { ...source.data, models: [{ ...model, categories: [model.categories[0], model.categories[0]] }] },
    })).toBeNull();
  });

  it('rejects malformed freshness and unsafe model routes before hydration', () => {
    expect(parseModelDirectoryEnvelope(envelope({ freshness: { status: 'unknown', checkedAt: UPDATED_AT } }))).toBeNull();
    expect(parseModelDirectoryEnvelope(envelope({ data: { ...envelope().data, models: [{ ...envelope().data.models[0], canonicalSlug: 'unsafe/slug' }] } }))).toBeNull();
  });

  it('encodes exactly one safe model route segment', () => {
    expect(modelPath('gpt-5.6-sol')).toBe('/models/gpt-5.6-sol/');
    expect(() => modelPath('unsafe/slug')).toThrow('model slug must be one route segment');
  });
});
