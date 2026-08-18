import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createPreviewDataGateway } from './gateway';
import { createHttpTransport } from './http-transport';

function evidence<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'contracts/ui-data-contract/v1/evidence', path), 'utf8')) as T;
}

const customRankingQuery = {
  operation: 'custom' as const,
  dimensionSetRevision: 'ui-data-contract-v1-fixture-dimensions',
  filters: {
    access: 'all' as const,
    excludeDerivativeFinetunes: false,
    maxInputMicroDollarsPerMillion: null,
    maxOutputMicroDollarsPerMillion: null,
    maxTtftP50Ms: null,
    minContextWindowTokens: null,
    minMaxOutputTokens: null,
    minTpsP50: null,
    providerIds: [],
    requiredInputModalities: [],
  },
  includeIneligible: true,
  limit: 50,
  weights: { capability: 20, efficiency: 50, reliability: 30 },
};

describe('HTTP preview data transport', () => {
  it('preserves ordered comparison slugs and the exact submitted custom ranking matrix on manifest routes', async () => {
    const fetchRequests: { readonly url: string; readonly init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      fetchRequests.push({ url, init });
      const response = url.includes('/comparison')
        ? evidence('responses/comparison.json')
        : evidence('responses/rankings.mixed-source.json');
      return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const transport = createHttpTransport(fetchImpl, 'https://tokenbench.test');

    await transport.request('comparison', { modelIds: ['alpha', 'beta', 'gamma'] });
    await transport.request('rankings', customRankingQuery);

    expect(fetchRequests).toContainEqual(expect.objectContaining({ url: 'https://tokenbench.test/api/benchmarks/comparison?models=alpha%2Cbeta%2Cgamma' }));
    const rankingRequest = fetchRequests.find((request) => request.url.endsWith('/api/benchmarks/rankings'));
    expect(rankingRequest?.init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(rankingRequest?.init?.body))).toEqual(customRankingQuery);
  });

  it('keeps an unavailable HTTP response explicit instead of substituting evidence or fixture facts', async () => {
    const rawUnavailable = evidence('responses/profile.unavailable.json');
    const adapter = createPreviewDataGateway(createHttpTransport(async () => new Response(JSON.stringify(rawUnavailable), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    }), 'https://tokenbench.test'));

    await expect(adapter.profile('missing-model')).resolves.toMatchObject({
      status: 'unavailable',
      data: null,
    });
  });

  it('rejects HTTP failures other than the accepted unavailable-envelope status', async () => {
    const adapter = createPreviewDataGateway(createHttpTransport(async () => new Response(JSON.stringify(evidence('responses/models.json')), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    }), 'https://tokenbench.test'));

    await expect(adapter.models({})).rejects.toThrow('HTTP 500');
  });

  it('encodes accepted models, lifecycle, and leaderboard filter request semantics', async () => {
    const requests: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      requests.push(input.toString());
      return new Response(JSON.stringify(evidence('responses/models.json')), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const transport = createHttpTransport(fetchImpl, 'https://tokenbench.test');

    await transport.request('models', { access: 'Open weights', provider: 'provider-1', limit: 7, cursor: 'next' });
    await transport.request('lifecycle', { asOf: '2026-08-18T00:00:00.000Z', horizonDays: 30 });
    await transport.request('rankings', {
      operation: 'leaderboard',
      cursor: 'next',
      limit: 7,
      releaseId: 'release-1',
      filters: { excludeDerivativeFinetunes: true, openWeights: 'only', organizationIds: ['provider-1'] },
    });

    const [models, lifecycle, rankings] = requests.map((value) => new URL(value));
    expect(Object.fromEntries(models?.searchParams ?? [])).toMatchObject({ access: 'open_weights', providerIds: 'provider-1', limit: '7', cursor: 'next' });
    expect(Object.fromEntries(lifecycle?.searchParams ?? [])).toMatchObject({ asOf: '2026-08-18T00:00:00.000Z', horizonDays: '30' });
    expect(Object.fromEntries(rankings?.searchParams ?? [])).toMatchObject({ operation: 'leaderboard', cursor: 'next', limit: '7', releaseId: 'release-1', openWeights: 'only', organizationIds: 'provider-1', excludeDerivativeFinetunes: 'true' });
  });

  it('propagates network and invalid-contract failures instead of falling back to accepted evidence', async () => {
    const unavailableNetwork = createPreviewDataGateway(createHttpTransport(async () => {
      throw new Error('network unavailable');
    }, 'https://tokenbench.test'));
    const invalidEnvelope = createPreviewDataGateway(createHttpTransport(async () => new Response(JSON.stringify(evidence('rejections/models.invalid-timestamp.json')), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }), 'https://tokenbench.test'));

    await expect(unavailableNetwork.models({})).rejects.toThrow('network unavailable');
    await expect(invalidEnvelope.models({})).rejects.toMatchObject({ code: 'invalid_timestamp' });
  });
});
