import { describe, expect, it, vi } from 'vitest';
import type { ModelDirectoryEnvelope } from '../../src/frontend/model-directory-contracts';

const readModelDirectory = vi.hoisted(() => vi.fn());

vi.mock('../_shared/model-directory-db', async () => {
  const actual = await vi.importActual<typeof import('../_shared/model-directory-db')>('../_shared/model-directory-db');
  return { ...actual, readModelDirectory };
});

import { onRequestGet } from './index';

const UPDATED_AT = '2026-08-10T01:00:00.000Z';

function envelope(): ModelDirectoryEnvelope {
  return {
    revision: 'benchlm-r1', publishedAt: UPDATED_AT, freshness: { status: 'fresh', checkedAt: UPDATED_AT },
    attribution: [{ sourceId: 'benchlm', label: 'BenchLM', url: 'https://benchlm.ai/leaderboard', updatedAt: UPDATED_AT }],
    data: {
      week: { weekStart: '2026-08-10T00:00:00.000Z', benchmarkRevision: 'benchlm-r1', sourceSnapshotId: 'benchlm-public', methodologyVersion: 'bench-align-v5', generatedAt: UPDATED_AT },
      models: [{
        modelKey: 'benchlm:openai:gpt-5-6-sol', canonicalSlug: 'gpt-5-6-sol', displayName: 'GPT-5.6 Sol', creator: 'OpenAI', sourceType: 'Proprietary', reasoningType: null,
        familyId: null, variantId: null, firstSeenRevision: 'benchlm-r1', firstSeenAt: UPDATED_AT, lastSeenRevision: 'benchlm-r1', lastSeenAt: UPDATED_AT,
        latestProfileRevision: 'benchlm-r1', status: 'current', sourceId: 'benchlm', sourceModelId: 'gpt-5.6-sol', updatedAt: UPDATED_AT,
        weeklyRank: 1, overallScore: 81.48, overallRank: 1, strongestCategory: null, representativePrice: null, evidenceStatus: 'supported',
        profileRevision: 'benchlm-r1', profileFallback: 'none', profilePublishedAt: UPDATED_AT, profileCheckedAt: UPDATED_AT,
      }], nextCursor: null,
    },
  };
}

describe('popular models SSR handler', () => {
  it('renders substantive model facts, canonical social metadata, and directory JSON-LD', async () => {
    readModelDirectory.mockResolvedValue(envelope());
    const response = await onRequestGet({
      request: new Request('https://tokenbench.monomind.one/models/'),
      env: { CATALOG_DB: {} as never },
    });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('<h1>Popular AI models</h1>');
    expect(html).toContain('GPT-5.6 Sol');
    expect(html).toContain('81.48');
    expect(html).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/models/">');
    expect(html).toContain('<meta property="og:url" content="https://tokenbench.monomind.one/models/">');
    expect(html).toContain('"@type":"CollectionPage"');
    expect(html).toContain('"@type":"ItemList"');
    expect(html).toContain('id="models-initial-data"');
  });

  it('passes bounded filters to the durable directory reader and keeps query URLs canonical', async () => {
    readModelDirectory.mockResolvedValue(envelope());
    const response = await onRequestGet({
      request: new Request('https://tokenbench.monomind.one/models/?q=retained&status=archived'),
      env: { CATALOG_DB: {} as never },
    });
    expect(response.status).toBe(200);
    expect(readModelDirectory).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ q: 'retained', status: 'archived', limit: 100 }));
    const html = await response.text();
    expect(html).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/models/">');
  });
  it('searches retained records by default when the SSR URL omits status', async () => {
    readModelDirectory.mockResolvedValue(envelope());
    await onRequestGet({
      request: new Request('https://tokenbench.monomind.one/models/?q=retained'),
      env: { CATALOG_DB: {} as never },
    });
    expect(readModelDirectory).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ q: 'retained', status: 'all' }));
  });

  it('returns an unavailable response when durable data cannot be read', async () => {
    readModelDirectory.mockRejectedValue(new Error('D1 unavailable'));
    const response = await onRequestGet({
      request: new Request('https://tokenbench.monomind.one/models/'),
      env: { CATALOG_DB: {} as never },
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
  });
});
