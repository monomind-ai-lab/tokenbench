import { describe, expect, it } from 'vitest';
import { parseUiDataContractV1Runtime } from '../../../src/pipeline/ui-data-contract-v1';
import { onRequestGet, onRequestPost } from './subscription';

describe('subscription v1 endpoint boundary', () => {
  it('serves a valid explicit-unavailable catalog envelope', async () => {
    const response = await onRequestGet({ request: new Request(
      'https://tokenbench.example/api/benchmarks/subscription?operation=catalog',
    ) });
    const envelope = parseUiDataContractV1Runtime(await response.json(), 'subscription');
    expect(response.status).toBe(404);
    expect(envelope.request).toEqual({ operation: 'catalog' });
    expect(envelope.revisions.benchmark).toBeNull();
  });

  it('validates calculate bodies before returning explicit unavailability', async () => {
    const request = {
      operation: 'calculate',
      planId: 'pro',
      seats: 1,
      modelMix: [{ modelSlug: 'alpha', routeId: 'alpha-direct', pricingTierId: null, tierContextTokens: 1000, shareBasisPoints: 10000 }],
      workload: { conversationsPerDay: 1, messagesPerConversation: 1, inputTokensPerMessage: 100, outputTokensPerMessage: 50, activeDaysPerMonth: 20 },
      cacheReadShareBasisPoints: 0,
      cacheWriteShareBasisPoints: 0,
      crossoverTokenVolume: 1000000,
    };
    const response = await onRequestPost({ request: new Request(
      'https://tokenbench.example/api/benchmarks/subscription',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) },
    ) });
    const envelope = parseUiDataContractV1Runtime(await response.json(), 'subscription');
    expect(response.status).toBe(404);
    expect(envelope.request).toEqual(request);

    const invalid = await onRequestPost({ request: new Request(
      'https://tokenbench.example/api/benchmarks/subscription',
      { method: 'POST', body: '{' },
    ) });
    expect(invalid.status).toBe(400);
  });
});
