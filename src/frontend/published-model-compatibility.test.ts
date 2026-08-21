import { describe, expect, it } from 'vitest';

import type { CatalogResponse } from '../catalog/contracts';
import type { ModelDirectoryEnvelope } from './model-directory-contracts';
import {
  projectPublishedLifecycle,
  projectPublishedModelDirectory,
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
});
