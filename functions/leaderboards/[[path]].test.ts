import { describe, expect, it, vi } from 'vitest';
import type { ActiveBenchmarkSnapshot } from '../_shared/benchmark-db';

const readActiveBenchmarkSnapshot = vi.hoisted(() => vi.fn());

vi.mock('../_shared/benchmark-db', async (importOriginal) => ({
  ...await importOriginal<typeof import('../_shared/benchmark-db')>(),
  readActiveBenchmarkSnapshot,
}));

import { onRequestGet } from './[[path]]';

const UPDATED_AT = '2026-08-14T00:00:00.000Z';

function snapshot(): ActiveBenchmarkSnapshot {
  const model = {
    modelKey: 'benchlm:example:alpha', slug: 'alpha', name: 'Alpha', creator: 'Example Labs',
    sourceType: 'Proprietary' as const, reasoningType: 'Reasoning model', releaseDate: null,
    contextWindowTokens: 128_000, evidenceStatus: 'supported' as const, rankingEligible: true,
    confidenceLower: null, confidenceUpper: null, benchmarkCount: 1, sourceId: 'benchlm' as const,
    sourceModelId: 'alpha', sourceArtifactId: 'benchlm-models',
  };
  return {
    revision: {
      revision: 'published-r1', generatedAt: UPDATED_AT, publishedAt: UPDATED_AT, checkedAt: UPDATED_AT,
      publicationState: 'published', contentHash: `sha256:${'a'.repeat(64)}`,
      catalogRevision: 'catalog-r1', openrouterContentHash: `sha256:${'b'.repeat(64)}`,
    },
    sources: [{
      sourceId: 'benchlm', artifactId: 'benchlm-models', sourceUrl: 'https://benchlm.example/models',
      observedAt: UPDATED_AT, etag: null, lastModified: null, upstreamRevision: null, schemaVersion: null,
      snapshotKey: 'benchlm/models.json', contentHash: `sha256:${'c'.repeat(64)}`,
      originalContentHash: `sha256:${'d'.repeat(64)}`, licenseId: 'MIT', attributionText: 'Data from BenchLM',
    }],
    models: [model],
    metrics: [{
      modelKey: model.modelKey, metricKey: 'benchlm:category:coding', category: 'coding', value: 91,
      rawValue: null, rank: 1, lower: null, upper: null, voteCount: null, unit: 'score', sourceId: 'benchlm',
      sourceUpdatedAt: UPDATED_AT, sourceModelId: 'alpha', sourceArtifactId: 'benchlm-models',
      rankingEligible: true, methodology: 'benchlm_raw_composite', observationCount: null, sessionCount: null,
    }],
    priceChecks: [],
    comparisonPairs: [],
  };
}

function context(path = 'coding') {
  return {
    request: new Request(`https://tokenbench.monomind.one/leaderboards/${path}/`),
    env: { CATALOG_DB: {} as never },
    params: { path },
  };
}

describe('V2.1 leaderboard SSR', () => {
  it('renders the canonical Top 20 snapshot and hydration payload before JavaScript', async () => {
    readActiveBenchmarkSnapshot.mockResolvedValue(snapshot());

    const response = await onRequestGet(context());
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<h1 id="leaderboard-heading">Coding</h1>');
    expect(html).toContain('Alpha');
    expect(html).toContain('id="leaderboards-initial-data" type="application/json"');
    expect(html).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/leaderboards/coding/">');
  });

  it('returns a noindex 503 document when no active snapshot is valid', async () => {
    readActiveBenchmarkSnapshot.mockResolvedValue(null);

    const response = await onRequestGet(context());
    const html = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(html).toContain('<meta name="robots" content="noindex,follow,max-image-preview:large">');
    expect(html).toContain('Leaderboard data is temporarily unavailable');
  });

  it('redirects equivalent legacy lenses and keeps non-equivalent evidence lenses as noindex support pages', async () => {
    readActiveBenchmarkSnapshot.mockResolvedValue(snapshot());

    const redirected = await onRequestGet({
      request: new Request('https://tokenbench.monomind.one/leaderboards/llm/coding/'),
      env: { CATALOG_DB: {} as never },
      params: { path: ['llm', 'coding'] },
    });
    expect(redirected.status).toBe(308);
    expect(redirected.headers.get('location')).toBe('/leaderboards/coding/');

    const support = await onRequestGet({
      request: new Request('https://tokenbench.monomind.one/leaderboards/llm/knowledge/'),
      env: { CATALOG_DB: {} as never },
      params: { path: ['llm', 'knowledge'] },
    });
    expect(support.status).toBe(200);
    expect(support.headers.get('x-robots-tag')).toContain('noindex');
    expect(await support.text()).toContain('Knowledge evidence support route');
  });
});
