import { describe, expect, it } from 'vitest';
import { onRequestGet } from './models';

describe('durable model directory API', () => {
  it('rejects invalid bounded query parameters before touching D1', async () => {
    let prepared = false;
    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/models?limit=101'),
      env: { CATALOG_DB: { prepare() { prepared = true; throw new Error('must not query'); } } },
    });
    expect(response.status).toBe(400);
    expect(prepared).toBe(false);
  });

  it('returns 503 only when no durable directory can be read', async () => {
    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/models'),
      env: { CATALOG_DB: { prepare() { throw new Error('D1 unavailable'); } } },
    });
    expect(response.status).toBe(503);
  });
});
