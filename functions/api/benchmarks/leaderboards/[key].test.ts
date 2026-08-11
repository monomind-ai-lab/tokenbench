import { describe, expect, it } from 'vitest';
import { onRequestGet } from './[key]';

const staleBody = JSON.stringify({
  revision: 'benchmark-rev-41',
  publishedAt: '2026-08-05T00:00:00.000Z',
  freshness: { status: 'stale', checkedAt: '2026-08-05T12:00:00.000Z' },
  attribution: [],
  data: {
    key: 'llm-coding',
    profile: 'balanced',
    entries: [],
    pagination: { limit: 50, total: 0, nextCursor: null },
  },
});

function historicalOnlyDatabase() {
  const calls: string[] = [];
  return {
    calls,
    db: {
      prepare(sql: string) {
        calls.push(sql);
        return {
          bind() {
            return {
              all: async () => ({
                results: sql.includes('complete_revisions') ? [{
                  revision: 'benchmark-rev-41',
                  variant: 'stale',
                  chunk_index: 0,
                  etag: '"last-good-coding"',
                  body: staleBody,
                }] : [],
              }),
            };
          },
        };
      },
    },
  };
}

describe('benchmark leaderboard last-good fallback', () => {
  it('serves the newest complete stale first page when no active projection is available', async () => {
    const fixture = historicalOnlyDatabase();
    const response = await onRequestGet({
      request: new Request('https://tokenbench.monomind.one/api/benchmarks/leaderboards/llm-coding'),
      env: { CATALOG_DB: fixture.db },
      params: { key: 'llm-coding' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"last-good-coding"');
    await expect(response.text()).resolves.toBe(staleBody);
    expect(fixture.calls.some((sql) => sql.includes('complete_revisions'))).toBe(true);
  });
});
