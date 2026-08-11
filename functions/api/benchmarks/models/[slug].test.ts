import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelProfileReadResult } from '../../../_shared/model-directory-db';

const reads = vi.hoisted(() => ({
  profile: vi.fn(),
  alias: vi.fn(),
}));

vi.mock('../../../_shared/model-directory-db', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../_shared/model-directory-db')>();
  return {
    ...original,
    readDurableModelProfile: reads.profile,
    readModelSlugAlias: reads.alias,
  };
});

import { onRequestGet } from './[slug]';

function durableProfile(): ModelProfileReadResult {
  return {
    directory: {
      modelKey: 'benchlm:alpha', canonicalSlug: 'alpha', displayName: 'Alpha', creator: 'Provider',
      sourceType: 'Proprietary', reasoningType: null, familyId: null, variantId: null,
      firstSeenRevision: 'rev-1', firstSeenAt: '2026-08-11T18:00:00.000Z',
      lastSeenRevision: 'rev-2', lastSeenAt: '2026-08-11T18:00:00.000Z',
      latestProfileRevision: 'rev-2', status: 'current', sourceId: 'benchlm',
      sourceModelId: 'provider/alpha', updatedAt: '2026-08-11T18:00:00.000Z',
    },
    profile: {
      revision: {
        revision: 'rev-2', generatedAt: '2026-08-11T18:00:00.000Z',
        publishedAt: '2026-08-11T18:00:00.000Z', checkedAt: '2026-08-11T18:00:00.000Z',
      },
      sources: [{
        sourceId: 'benchlm', artifactId: 'models', sourceUrl: 'https://benchlm.ai/models',
        observedAt: '2026-08-11T18:00:00.000Z', attributionText: 'BenchLM',
      }],
    } as unknown as ModelProfileReadResult['profile'],
    selectedRevision: 'rev-2',
    fallback: 'none',
    aliasFrom: null,
  };
}

function database() {
  return {
    prepare() {
      return { bind() { return { async all() { return { results: [] }; } }; } };
    },
  };
}

describe('durable model profile API', () => {
  beforeEach(() => {
    reads.profile.mockReset();
    reads.alias.mockReset();
    reads.profile.mockResolvedValue(null);
    reads.alias.mockResolvedValue(null);
  });

  it('returns a canonical redirect for an alias', async () => {
    reads.alias.mockResolvedValue('alpha');
    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/models/old-alpha'),
      env: { CATALOG_DB: database() },
      params: { slug: 'old-alpha' },
    });
    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe('/api/benchmarks/models/alpha');
  });

  it('returns a true 404 for an unknown slug', async () => {
    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/models/not-present'),
      env: { CATALOG_DB: database() },
      params: { slug: 'not-present' },
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Benchmark model not found' });
  });

  it('serves a durable profile with attribution and exact ETag revalidation', async () => {
    reads.profile.mockResolvedValue(durableProfile());
    const initial = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/models/alpha'),
      env: { CATALOG_DB: database() },
      params: { slug: 'alpha' },
    });
    expect(initial.status).toBe(200);
    await expect(initial.clone().json()).resolves.toMatchObject({
      revision: 'rev-2',
      attribution: [{ sourceId: 'benchlm', label: 'BenchLM' }],
      data: { directory: { canonicalSlug: 'alpha' }, selectedRevision: 'rev-2', fallback: 'none' },
    });
    const etag = initial.headers.get('ETag');
    expect(etag).toMatch(/^"model-profile-/);

    const revalidated = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/models/alpha', {
        headers: { 'If-None-Match': etag ?? '' },
      }),
      env: { CATALOG_DB: database() },
      params: { slug: 'alpha' },
    });
    expect(revalidated.status).toBe(304);
  });
});
