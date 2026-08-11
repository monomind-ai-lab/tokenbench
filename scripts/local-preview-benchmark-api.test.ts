import type { IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { get } from 'node:http';
import { createServer, type ViteDevServer } from 'vite';
import { describe, expect, it } from 'vitest';

async function startLocalPreviewServer(): Promise<{ readonly server: ViteDevServer; readonly origin: string }> {
  const server = await createServer({
    logLevel: 'error',
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: true,
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('Vite did not expose a local HTTP address');
  }
  return { server, origin: `http://127.0.0.1:${(address as AddressInfo).port}` };
}

async function getLocalResponse(origin: string, pathname: string, headers: Record<string, string> = {}): Promise<{
  readonly status: number;
  readonly contentType: string | undefined;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}> {
  return new Promise((resolve, reject) => {
    const request = get(new URL(pathname, origin), { headers }, (response) => {
      const chunks: Uint8Array[] = [];
      response.on('data', (chunk: Uint8Array) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        contentType: Array.isArray(response.headers['content-type'])
          ? response.headers['content-type'][0]
          : response.headers['content-type'],
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('error', reject);
  });
}

describe('local Vite benchmark preview API', () => {
  it('serves clearly labeled sample summary and coding rows through the public JSON contracts', async () => {
    const { server, origin } = await startLocalPreviewServer();
    try {
      const [summary, leaderboard] = await Promise.all([
        getLocalResponse(origin, '/api/benchmarks'),
        getLocalResponse(origin, '/api/benchmarks/leaderboards/llm-coding?profile=balanced&limit=5'),
      ]);

      expect(summary.status).toBe(200);
      expect(summary.contentType).toContain('application/json');
      expect(leaderboard.status).toBe(200);
      expect(leaderboard.contentType).toContain('application/json');

      const summaryBody = JSON.parse(summary.body) as {
        revision: string;
        freshness: { status: string; message?: string };
        data: { decisionPicks: unknown[] };
      };
      const leaderboardBody = JSON.parse(leaderboard.body) as {
        revision: string;
        freshness: { status: string; message?: string };
        data: {
          key: string;
          entries: Array<{ model: { name: string } }>;
          pagination: { limit: number; total: number; nextCursor: string | null };
        };
      };

      expect(summaryBody.revision).toMatch(/^local-sample-preview-/);
      expect(summaryBody).toMatchObject({
        publishedAt: '2000-01-01T00:00:00.000Z',
        attribution: expect.arrayContaining([
          expect.objectContaining({ sourceId: 'benchlm', label: expect.stringContaining('LOCAL SAMPLE') }),
          expect.objectContaining({ sourceId: 'lmarena', label: expect.stringContaining('LOCAL SAMPLE') }),
          expect.objectContaining({ sourceId: 'openrouter', label: expect.stringContaining('LOCAL SAMPLE') }),
        ]),
      });
      expect(summaryBody.freshness).toMatchObject({
        status: 'fresh',
        message: expect.stringContaining('LOCAL SAMPLE'),
      });
      expect(summaryBody.data.decisionPicks.length).toBeGreaterThan(0);
      expect(leaderboardBody.revision).toBe(summaryBody.revision);
      expect(leaderboardBody.freshness).toMatchObject({
        status: 'fresh',
        message: expect.stringContaining('LOCAL SAMPLE'),
      });
      expect(leaderboardBody.data).toMatchObject({
        key: 'llm-coding',
        pagination: { limit: 5, nextCursor: null },
      });
      expect(leaderboardBody.data.entries).toHaveLength(3);
      expect(leaderboardBody.data.entries.map((entry) => entry.model.name)).toEqual([
        'Sample Atlas',
        'Sample Orbit',
        'GPT-5.6 Sol',
      ]);
      expect(leaderboardBody.data.pagination.total).toBe(3);
    } finally {
      await server.close();
    }
  });

  it('selects deterministic fresh, 503, and corrupt-cache responses with a local-only header', async () => {
    const { server, origin } = await startLocalPreviewServer();
    try {
      const pathname = '/api/benchmarks/leaderboards/llm-coding?profile=balanced&limit=50';
      const fresh = await getLocalResponse(origin, pathname);
      const unavailable = await getLocalResponse(origin, pathname, { 'x-tokenbench-preview-state': '503' });
      const corrupt = await getLocalResponse(origin, pathname, { 'x-tokenbench-preview-state': 'corrupt-cache' });

      expect(fresh.status).toBe(200);
      expect(JSON.parse(fresh.body)).toMatchObject({
        freshness: { status: 'fresh' },
        data: {
          entries: expect.arrayContaining([
            expect.objectContaining({
              model: expect.objectContaining({ name: 'GPT-5.6 Sol' }),
              metric: expect.objectContaining({ value: 77.95, rank: 3 }),
              sourceRank: 3,
            }),
          ]),
        },
      });
      expect(unavailable.status).toBe(503);
      expect(JSON.parse(unavailable.body)).toEqual({ error: 'Local preview benchmark refresh unavailable.' });
      expect(corrupt.status).toBe(200);
      expect(JSON.parse(corrupt.body)).toMatchObject({
        revision: 'local-corrupt-cache-row',
        data: null,
      });
    } finally {
      await server.close();
    }
  });

  it('keeps local sample pagination round-trippable and returns JSON for unmatched benchmark API paths', async () => {
    const { server, origin } = await startLocalPreviewServer();
    try {
      const first = await getLocalResponse(origin, '/api/benchmarks/leaderboards/llm-coding?profile=balanced&limit=1');
      expect(first.status).toBe(200);
      expect(first.contentType).toContain('application/json');
      const firstBody = JSON.parse(first.body) as {
        data: { entries: Array<{ model: { name: string } }>; pagination: { nextCursor: string | null } };
      };
      expect(firstBody.data.entries.map((entry) => entry.model.name)).toEqual(['Sample Atlas']);
      expect(firstBody.data.pagination.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);

      const second = await getLocalResponse(
        origin,
        `/api/benchmarks/leaderboards/llm-coding?profile=balanced&limit=1&cursor=${encodeURIComponent(firstBody.data.pagination.nextCursor!)}`,
      );
      expect(second.status).toBe(200);
      expect(second.contentType).toContain('application/json');
      const secondBody = JSON.parse(second.body) as {
        data: { entries: Array<{ model: { name: string } }>; pagination: { nextCursor: string | null } };
      };
      expect(secondBody.data.entries.map((entry) => entry.model.name)).toEqual(['Sample Orbit']);
      expect(secondBody.data.pagination.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);

      const third = await getLocalResponse(
        origin,
        `/api/benchmarks/leaderboards/llm-coding?profile=balanced&limit=1&cursor=${encodeURIComponent(secondBody.data.pagination.nextCursor!)}`,
      );
      expect(third.status).toBe(200);
      const thirdBody = JSON.parse(third.body) as {
        data: { entries: Array<{ model: { name: string } }>; pagination: { nextCursor: string | null } };
      };
      expect(thirdBody.data.entries.map((entry) => entry.model.name)).toEqual(['GPT-5.6 Sol']);
      expect(thirdBody.data.pagination.nextCursor).toBeNull();

      const unmatched = await getLocalResponse(origin, '/api/benchmarks/leaderboards');
      expect(unmatched.status).toBe(404);
      expect(unmatched.contentType).toContain('application/json');
      expect(JSON.parse(unmatched.body)).toEqual({ error: 'Benchmark API route not found' });
    } finally {
      await server.close();
    }
  });

  it('serves the shipped leaderboard CSV action as a labeled local sample', async () => {
    const { server, origin } = await startLocalPreviewServer();
    try {
      const csv = await getLocalResponse(origin, '/api/benchmarks/leaderboards/llm-coding/csv?profile=balanced&sort=score-desc');
      expect(csv.status).toBe(200);
      expect(csv.contentType).toContain('text/csv; charset=utf-8');
      expect(csv.headers['content-disposition']).toContain('tokenbench-llm-coding-2000-01-01-local-sample-preview-r1.csv');
      expect(csv.headers['x-tokenbench-preview-data']).toBe('local-sample');
      expect(csv.headers['x-tokenbench-freshness']).toBe('stale');
      expect(csv.body).toMatch(/^rank,model,provider,evidence_status,/u);
      expect(csv.body).toContain('Sample Atlas');
      expect(csv.body).toContain('Sample Orbit');
      expect(csv.body).toContain('LOCAL SAMPLE Labs');
    } finally {
      await server.close();
    }
  });
});
