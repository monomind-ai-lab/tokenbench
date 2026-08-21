import { describe, expect, it } from 'vitest';
import { parseUiDataContractV1Runtime } from '../../../src/pipeline/ui-data-contract-v1';
import { acceptsUiDataContractV1, UI_DATA_CONTRACT_V1_MEDIA_TYPE } from '../../_shared/livebench-v1-api';
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
    expect(response.headers.get('content-type')).toContain(UI_DATA_CONTRACT_V1_MEDIA_TYPE);
    expect(response.headers.get('vary')).toContain('Accept');
    expect(parseUiDataContractV1Runtime(payload, 'models')).toMatchObject({ status: 'unavailable' });
  });

  it('honors media-type parameters but not a v1 range explicitly weighted to zero', () => {
    expect(acceptsUiDataContractV1(new Request('https://tokenbench.example', {
      headers: { accept: `application/json, ${UI_DATA_CONTRACT_V1_MEDIA_TYPE}; q=0.5` },
    }))).toBe(true);
    expect(acceptsUiDataContractV1(new Request('https://tokenbench.example', {
      headers: { accept: `Application/Vnd.Tokenbench.Ui-Data.V1+Json; Q=0` },
    }))).toBe(false);
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
