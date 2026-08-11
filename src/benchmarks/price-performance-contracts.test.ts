import { describe, expect, it } from 'vitest';
import {
  PRICE_PERFORMANCE_COST_BASES,
  PRICE_PERFORMANCE_SCORE_LANES,
  parsePricePerformanceEnvelope,
  type PricePerformanceEnvelope,
} from './price-performance-contracts';

const UPDATED_AT = '2026-08-10T00:00:00.000Z';

function envelope(overrides: Record<string, unknown> = {}): PricePerformanceEnvelope {
  const scores = Object.fromEntries(PRICE_PERFORMANCE_SCORE_LANES.map((lane, index) => [lane, index + 1]));
  return {
    revision: 'benchlm-r1',
    publishedAt: UPDATED_AT,
    freshness: { status: 'fresh', checkedAt: UPDATED_AT },
    attribution: [{
      sourceId: 'benchlm',
      label: 'BenchLM',
      url: 'https://benchlm.ai/leaderboard',
      updatedAt: UPDATED_AT,
    }],
    data: {
      scoreMethodology: Object.fromEntries(PRICE_PERFORMANCE_SCORE_LANES.map((lane) => [lane, 'BenchAlign public score'])),
      costDefinitions: {
        output: 'Published output USD per one million tokens',
        blended3To1: '(3 × input USD/M + output USD/M) / 4',
      },
      capabilities: {
        scoreLanes: [...PRICE_PERFORMANCE_SCORE_LANES],
        costBases: [...PRICE_PERFORMANCE_COST_BASES],
        creators: ['OpenAI'],
        sourceTypes: ['Proprietary'],
        evidenceStatuses: ['supported'],
        statuses: ['current'],
      },
      points: [{
        modelKey: 'benchlm:openai:model-a',
        slug: 'model-a',
        displayName: 'Model A',
        creator: 'OpenAI',
        familyId: null,
        status: 'current',
        sourceType: 'Proprietary',
        evidenceStatus: 'supported',
        scores,
        route: {
          sourceId: 'openrouter',
          providerId: 'openai',
          routeId: 'openrouter:model-a',
          sourceModelId: 'openai/model-a',
          canonicalSlug: 'model-a',
          sourceArtifactId: 'catalog:current',
          inputUsdPerMillion: 2,
          cachedInputUsdPerMillion: null,
          outputUsdPerMillion: 8,
          contextWindowTokens: 128_000,
          verificationStatus: 'primary',
          maxInputTokens: null,
          maxOutputTokens: null,
          inputModalities: ['text'],
          outputModalities: ['text'],
          supportedParameters: ['tools'],
        },
      }],
    },
    ...overrides,
  } as unknown as PricePerformanceEnvelope;
}

describe('price-performance runtime contract', () => {
  it('accepts a complete SSR/API envelope and preserves all score lanes', () => {
    const parsed = parsePricePerformanceEnvelope(envelope());
    expect(parsed).not.toBeNull();
    expect(parsed?.data.points).toHaveLength(1);
    expect(parsed?.data.points[0]?.scores).toEqual(expect.objectContaining({ coding: 3 }));
    expect(parsed?.data.capabilities.costBases).toEqual(['output', 'blended-3-1']);
  });

  it('rejects malformed freshness, missing score lanes, unsafe slugs, and non-finite prices', () => {
    const valid = envelope();
    expect(parsePricePerformanceEnvelope({ ...valid, freshness: { status: 'unknown', checkedAt: UPDATED_AT } })).toBeNull();
    expect(parsePricePerformanceEnvelope({
      ...valid,
      data: {
        ...valid.data,
        scoreMethodology: { ...valid.data.scoreMethodology, coding: undefined },
      },
    })).toBeNull();
    expect(parsePricePerformanceEnvelope({
      ...valid,
      data: {
        ...valid.data,
        points: [{ ...valid.data.points[0], slug: 'unsafe/slug' }],
      },
    })).toBeNull();
    expect(parsePricePerformanceEnvelope({
      ...valid,
      data: {
        ...valid.data,
        points: [{ ...valid.data.points[0], route: { ...valid.data.points[0].route, outputUsdPerMillion: Number.NaN } }],
      },
    })).toBeNull();
  });

  it('rejects duplicate model identities and unsupported capability values', () => {
    const valid = envelope();
    expect(parsePricePerformanceEnvelope({
      ...valid,
      data: { ...valid.data, points: [valid.data.points[0], valid.data.points[0]] },
    })).toBeNull();
    expect(parsePricePerformanceEnvelope({
      ...valid,
      data: {
        ...valid.data,
        capabilities: { ...valid.data.capabilities, costBases: ['cached'] },
      },
    })).toBeNull();
  });
});
