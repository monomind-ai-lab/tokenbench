import { describe, expect, it } from 'vitest';
import { parseUiDataContractV1Runtime } from '../../../src/pipeline/ui-data-contract-v1';
import { UI_DATA_CONTRACT_V1_MEDIA_TYPE } from '../../_shared/livebench-v1-api';
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

  it('selects the v1 boundary only through its explicit media type', async () => {
    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/models?access=all', {
        headers: { accept: UI_DATA_CONTRACT_V1_MEDIA_TYPE },
      }),
      env: {},
    });
    const payload = await response.json();
    expect(response.status).toBe(404);
    expect(parseUiDataContractV1Runtime(payload, 'models')).toMatchObject({ status: 'unavailable' });
  });

  it('keeps a v1 D1 fault distinct from cold-source unavailability', async () => {
    const response = await onRequestGet({
      request: new Request('https://tokenbench.example/api/benchmarks/models?access=all', {
        headers: { accept: UI_DATA_CONTRACT_V1_MEDIA_TYPE },
      }),
      env: { CATALOG_DB: {
        prepare() { throw new Error('D1 unavailable'); },
      } },
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'service_unavailable' } });
  });
});
