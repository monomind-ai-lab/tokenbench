import { describe, expect, it } from 'vitest';
import { parseUiDataContractV1Runtime } from '../../../src/pipeline/ui-data-contract-v1';
import { onRequestGet } from './lifecycle';

describe('lifecycle v1 endpoint boundary', () => {
  it('echoes the normalized request and stays explicitly unavailable', async () => {
    const response = await onRequestGet({ request: new Request(
      'https://tokenbench.example/api/benchmarks/lifecycle?asOf=2026-08-19T00%3A00%3A00.000Z&horizonDays=30',
    ) });
    const envelope = parseUiDataContractV1Runtime(await response.json(), 'lifecycle');
    expect(response.status).toBe(404);
    expect(envelope.request).toEqual({ asOf: '2026-08-19T00:00:00.000Z', horizonDays: 30 });
    expect(envelope.status).toBe('unavailable');
  });

  it('rejects invalid timestamps and duplicate inputs', async () => {
    for (const query of [
      'asOf=2026-08-19T00%3A00%3A00%2B08%3A00&horizonDays=30',
      'asOf=2026-08-19T00%3A00%3A00.000Z&horizonDays=30&horizonDays=60',
    ]) {
      expect((await onRequestGet({ request: new Request(`https://tokenbench.example/api/benchmarks/lifecycle?${query}`) })).status).toBe(400);
    }
  });
});
