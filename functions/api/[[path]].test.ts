import { describe, expect, it } from 'vitest';

import { onRequest } from './[[path]]';

describe('unmatched /api/* catch-all', () => {
  it('answers with JSON 404 rather than the SPA shell at HTTP 200', async () => {
    const response = onRequest({ request: new Request('https://tokenbench.monomind.one/api/nope') });

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(await response.json()).toEqual({
      error: {
        code: 'not_found',
        message: 'No TokenBench API endpoint is published at /api/nope.',
      },
    });
  });

  it('names the exact requested path and never caches the miss', async () => {
    const response = onRequest({
      request: new Request('https://tokenbench.monomind.one/api/benchmarks/does-not-exist?x=1'),
    });

    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json() as { error: { message: string } };
    expect(body.error.message).toContain('/api/benchmarks/does-not-exist');
    expect(body.error.message).not.toContain('?x=1');
  });
});
