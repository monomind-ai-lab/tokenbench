import { describe, expect, it } from 'vitest';

import type { CatalogResponse } from '../catalog/contracts';
import type { ModelDirectoryEnvelope } from './model-directory-contracts';
import { modelProfileViewModelFixture } from './model-profile-test-fixture';
import { projectSurfaceProfile } from './model-surface-projectors';
import {
  mergedEffectiveAt,
  projectPublishedLifecycle,
  projectPublishedModelDirectory,
  projectPublishedModelProfile,
  projectPublishedRanking,
} from './published-model-compatibility';

const timestamp = '2026-08-21T00:00:00.000Z';

function directory(): ModelDirectoryEnvelope {
  return {
    revision: 'directory-r1',
    publishedAt: timestamp,
    freshness: { status: 'fresh', checkedAt: timestamp },
    attribution: [{ sourceId: 'benchlm', label: 'Benchmark', url: 'https://example.com/source', updatedAt: timestamp }],
    data: {
      week: { weekStart: '2026-08-17T00:00:00.000Z', benchmarkRevision: 'benchmark-r1', sourceSnapshotId: 'snapshot-r1', methodologyVersion: 'weekly-v1', generatedAt: timestamp },
      nextCursor: null,
      models: [{
        modelKey: 'source:benchlm:model-alpha',
        canonicalSlug: 'model-alpha',
        displayName: 'Model Alpha',
        creator: 'Provider A',
        sourceType: 'Open Weight',
        reasoningType: null,
        familyId: null,
        variantId: null,
        firstSeenRevision: 'benchmark-r1',
        firstSeenAt: timestamp,
        lastSeenRevision: 'benchmark-r1',
        lastSeenAt: timestamp,
        latestProfileRevision: 'benchmark-r1',
        status: 'current',
        sourceId: 'benchlm',
        sourceModelId: 'model-alpha',
        updatedAt: timestamp,
        weeklyRank: 3,
        overallScore: 82.5,
        overallRank: 2,
        categories: [
          {
            key: 'overall', metricKey: 'benchlm:overall:raw', label: 'Overall', score: 82.5,
            rawScore: 82.5, rank: 2, fieldSize: 50, percentile: 96, evidenceStatus: 'supported',
            benchmarkCount: 4, rankingEligible: true, unit: 'score', sourceId: 'benchlm',
          },
          {
            key: 'coding', metricKey: 'benchlm:category:coding', label: 'Coding', score: 91.25,
            rawScore: null, rank: 1, fieldSize: 50, percentile: 100, evidenceStatus: 'supported',
            benchmarkCount: 4, rankingEligible: true, unit: 'score', sourceId: 'benchlm',
          },
          {
            key: 'multimodal', metricKey: 'benchlm:category:multimodal', label: 'Multimodal', score: 65,
            rawScore: null, rank: null, fieldSize: null, percentile: null, evidenceStatus: 'source_only',
            benchmarkCount: 1, rankingEligible: false, unit: 'score', sourceId: 'benchlm',
          },
        ],
        strongestCategory: null,
        representativePrice: null,
        evidenceStatus: 'supported',
        profileRevision: 'benchmark-r1',
        profileFallback: 'none',
        profilePublishedAt: timestamp,
        profileCheckedAt: timestamp,
      }],
    },
  };
}

describe('published model compatibility', () => {
  it('keeps canonical route slugs and published weekly ranks', () => {
    const source = directory();
    const models = projectPublishedModelDirectory(source);
    const ranking = projectPublishedRanking(source);
    expect(models.data?.models[0]?.id).toBe('model-alpha');
    expect(models.data?.models[0]?.access).toMatchObject({ availability: 'available', value: 'Open weights' });
    expect(ranking.data?.models[0]?.rank).toMatchObject({ availability: 'available', value: 3 });
    expect(ranking.data?.models[0]?.model.id).toBe('model-alpha');
  });

  it('projects every published directory category into capability radar without profile reads', () => {
    const source = directory();
    const expectedRadar = [
      { key: 'overall', label: 'Overall', percentile: 96, rank: 2, fieldSize: 50 },
      { key: 'coding', label: 'Coding', percentile: 100, rank: 1, fieldSize: 50 },
      { key: 'multimodal', label: 'Multimodal', percentile: null, rank: null, fieldSize: null },
    ];

    const models = projectPublishedModelDirectory(source);
    const ranking = projectPublishedRanking(source);

    expect(models.data?.models[0]?.capability).toEqual({
      availability: 'available',
      value: { compositeScore: 82.5, radar: expectedRadar },
      provenance: expect.any(Object),
    });
    expect(ranking.data?.models[0]?.model.capability).toMatchObject({
      availability: 'available',
      value: { compositeScore: 82.5, radar: expectedRadar },
    });
  });

  it('projects only explicit catalog expiration dates inside the requested horizon', () => {
    const catalog = {
      revision: 'catalog-r1',
      publishedAt: timestamp,
      freshness: { status: 'fresh', checkedAt: timestamp },
      plans: [],
      provenance: [{ id: 'source-a', providerId: 'provider-a', sourceUrl: 'https://example.com/models', observedAt: timestamp, sourceKind: 'official_json', confidence: 'official', reviewStatus: 'verified' }],
      modelOffers: [
        { id: 'alpha-offer', providerId: 'provider-a', displayName: 'Alpha', modelId: 'alpha', pricingBasis: 'direct_provider_api', route: 'direct_provider', currency: 'USD', unit: 'micro_dollars_per_million_tokens', inputMicroDollarsPerMillion: 1, outputMicroDollarsPerMillion: 2, expirationDate: '2026-08-30', sourceId: 'source-a' },
        { id: 'beta-offer', providerId: 'provider-a', displayName: 'Beta', modelId: 'beta', pricingBasis: 'direct_provider_api', route: 'direct_provider', currency: 'USD', unit: 'micro_dollars_per_million_tokens', inputMicroDollarsPerMillion: 1, outputMicroDollarsPerMillion: 2, sourceId: 'source-a' },
      ],
    } satisfies CatalogResponse;
    const result = projectPublishedLifecycle(catalog, { asOf: timestamp, horizonDays: 30 });
    expect(result.status).toBe('available');
    expect(result.data?.models.map((model) => model.modelId)).toEqual(['alpha']);
    expect(result.data?.models[0]?.lifecycle).toMatchObject({ availability: 'available', value: { status: 'Retirement scheduled' } });
  });

  it('retains exact route metadata, meters, profile coverage, and benchmark rows', () => {
    const fixture = modelProfileViewModelFixture();
    const profile = {
      ...fixture.profile,
      priceRoutes: fixture.profile.priceRoutes.map((route) => ({
        ...route,
        cacheWriteUsdPerMillion: 1.25,
        createdAt: '2026-08-01T00:00:00.000Z',
        expirationDate: '2027-08-01',
        knowledgeCutoff: '2025-12',
        tokenizer: 'example-tokenizer',
        instructionFormat: 'chatml',
        isModerated: true,
        perRequestLimitsJson: '{"max_images":4}',
      })),
    };
    const result = projectPublishedModelProfile({ ...fixture, profile });
    const model = result.data?.model;
    const facts = model?.profileFacts;

    expect(model?.routePricing).toMatchObject({
      availability: 'available',
      value: {
        maxInputTokens: { availability: 'unavailable' },
        supportedParameters: { availability: 'available', value: ['tools'] },
        cache: {
          availability: 'available',
          value: {
            writeUsdPerMillion: { availability: 'available', value: 1.25 },
          },
        },
      },
    });
    expect(facts).toMatchObject({
      availability: 'available',
      value: {
        sourceCoverage: { categoryCount: 3, sourceCount: 2 },
        benchmark: {
          overallRank: 4,
          categories: expect.arrayContaining([expect.objectContaining({ key: 'overall' })]),
          ledger: expect.arrayContaining([expect.objectContaining({ metricKey: 'benchlm:overall:raw' })]),
        },
        specifications: {
          createdAt: { availability: 'available', value: '2026-08-01T00:00:00.000Z' },
          expirationDate: { availability: 'available', value: '2027-08-01' },
          knowledgeCutoff: { availability: 'available', value: '2025-12' },
          tokenizer: { availability: 'available', value: 'example-tokenizer' },
          instructionFormat: { availability: 'available', value: 'chatml' },
          isModerated: { availability: 'available', value: true },
          perRequestLimits: { availability: 'available', value: { max_images: 4 } },
        },
        routes: [{
          cacheWriteUsdPerMillion: { availability: 'available', value: 1.25 },
          receipt: { routeId: 'openrouter:openai/gpt-5-6-sol' },
        }],
      },
    });

    expect(projectSurfaceProfile(result).data).toMatchObject({
      freshness: { status: 'fresh', checkedAt: '2026-08-11T18:00:00.000Z' },
      sourceCoverage: { categoryCount: 3, sourceCount: 2 },
      benchmark: { overallRank: 4 },
      specifications: {
        createdAt: { availability: 'available', value: '2026-08-01T00:00:00.000Z' },
        isModerated: { availability: 'available', value: true },
      },
      selectedRoute: { availability: 'available', value: { receipt: { routeId: 'openrouter:openai/gpt-5-6-sol' } } },
      routes: [{ receipt: { routeId: 'openrouter:openai/gpt-5-6-sol' } }],
      lifecycle: { availability: 'unavailable' },
    });
  });
});

describe('mergedEffectiveAt', () => {
  // A directory publish date and a LiveBench release stamp never match, so the
  // previous equality rule nulled every merged effectiveAt and the hero rendered
  // `-` by construction.
  it('reports the stalest input so merged freshness is never overstated', () => {
    expect(mergedEffectiveAt('2026-08-21T00:00:00.000Z', '2026-08-17T00:00:00.000Z'))
      .toBe('2026-08-17T00:00:00.000Z');
    expect(mergedEffectiveAt('2026-08-17T00:00:00.000Z', '2026-08-21T00:00:00.000Z'))
      .toBe('2026-08-17T00:00:00.000Z');
  });

  it('keeps an identical timestamp unchanged', () => {
    expect(mergedEffectiveAt('2026-08-21T00:00:00.000Z', '2026-08-21T00:00:00.000Z'))
      .toBe('2026-08-21T00:00:00.000Z');
  });

  it('degrades to whichever timestamp the sources actually published', () => {
    expect(mergedEffectiveAt(null, '2026-08-21T00:00:00.000Z')).toBe('2026-08-21T00:00:00.000Z');
    expect(mergedEffectiveAt('2026-08-21T00:00:00.000Z', null)).toBe('2026-08-21T00:00:00.000Z');
    expect(mergedEffectiveAt(null, null)).toBeNull();
  });

  it('does not let an unparsable stamp win over a real one', () => {
    expect(mergedEffectiveAt('not-a-date', '2026-08-21T00:00:00.000Z')).toBe('2026-08-21T00:00:00.000Z');
    expect(mergedEffectiveAt('2026-08-21T00:00:00.000Z', 'not-a-date')).toBe('2026-08-21T00:00:00.000Z');
    expect(mergedEffectiveAt('not-a-date', 'also-bad')).toBeNull();
  });
});
