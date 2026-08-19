import { describe, expect, it } from 'vitest';
import { parseUiDataContractV1Runtime } from '../../../src/pipeline/ui-data-contract-v1';
import { onRequestGet } from './comparison';

describe('LiveBench comparison endpoint', () => {
  it('preserves the accepted ordered two-to-four slug request in an unavailable response', async () => {
    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/comparison?models=beta%2Calpha'),
      env: {},
    });
    const envelope = parseUiDataContractV1Runtime(await response.json(), 'comparison');
    expect(response.status).toBe(404);
    expect(envelope.request.modelSlugs).toEqual(['beta', 'alpha']);
    expect(envelope.status).toBe('unavailable');
  });

  it('does not collapse operational faults into an unavailable envelope', async () => {
    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/comparison?models=beta%2Calpha'),
      env: { CATALOG_DB: {
        prepare() { throw new Error('D1 unavailable'); },
        async batch() { return []; },
      } },
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'service_unavailable' } });
  });

  it('rejects duplicate, undersized, and unknown comparison queries', async () => {
    for (const query of ['models=alpha%2Calpha', 'models=alpha', 'models=alpha%2Cbeta&sort=score']) {
      const response = await onRequestGet({
        request: new Request(`https://tokenbench.example/api/benchmarks/comparison?${query}`),
        env: {},
      });
      expect(response.status).toBe(400);
    }
  });
});
