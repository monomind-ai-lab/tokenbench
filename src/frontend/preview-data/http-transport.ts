import type { PreviewDataTransport } from './api-adapter';
import type { CompareQuery, LifecycleQuery, ModelDirectoryQuery, RankingQuery, SubscriptionQuery } from './contracts';
import type { UiDataContractV1Method } from './contract-v1';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function queryUrl(baseUrl: string, pathname: string, parameters: URLSearchParams): string {
  const url = new URL(pathname, baseUrl);
  url.search = parameters.toString();
  return url.toString();
}

function comparisonUrl(baseUrl: string, query: CompareQuery): string {
  if (query.modelIds.length < 2 || query.modelIds.length > 4 || new Set(query.modelIds).size !== query.modelIds.length) {
    throw new RangeError('comparison requires 2–4 ordered distinct model slugs');
  }
  return queryUrl(baseUrl, '/api/benchmarks/comparison', new URLSearchParams({ models: query.modelIds.join(',') }));
}

function modelsUrl(baseUrl: string, query: ModelDirectoryQuery): string {
  const parameters = new URLSearchParams();
  if (query.search !== undefined) parameters.set('search', query.search);
  if (query.access !== undefined) parameters.set('access', query.access === 'Open weights' ? 'open_weights' : 'proprietary');
  const providerIds = query.providerIds
    ? [...query.providerIds, ...(query.provider === undefined ? [] : [query.provider])]
    : query.provider === undefined ? [] : [query.provider];
  if (providerIds.length) parameters.set('providerIds', [...new Set(providerIds)].join(','));
  if (query.cursor !== undefined && query.cursor !== null) parameters.set('cursor', query.cursor);
  if (query.limit !== undefined) parameters.set('limit', String(query.limit));
  return queryUrl(baseUrl, '/api/benchmarks/models', parameters);
}

function lifecycleUrl(baseUrl: string, query: LifecycleQuery): string {
  return queryUrl(baseUrl, '/api/benchmarks/lifecycle', new URLSearchParams({ asOf: query.asOf, horizonDays: String(query.horizonDays) }));
}

function leaderboardUrl(baseUrl: string, query: RankingQuery): string {
  const parameters = new URLSearchParams({ operation: 'leaderboard' });
  if (query.limit !== undefined) parameters.set('limit', String(query.limit));
  if (query.cursor !== undefined && query.cursor !== null) parameters.set('cursor', query.cursor);
  if (query.releaseId !== undefined && query.releaseId !== null) parameters.set('releaseId', query.releaseId);
  if (query.filters?.openWeights !== undefined) parameters.set('openWeights', query.filters.openWeights);
  if (query.filters?.organizationIds?.length) parameters.set('organizationIds', query.filters.organizationIds.join(','));
  if (query.filters?.excludeDerivativeFinetunes !== undefined) {
    parameters.set('excludeDerivativeFinetunes', String(query.filters.excludeDerivativeFinetunes));
  }
  return queryUrl(baseUrl, '/api/benchmarks/rankings', parameters);
}

function subscriptionCatalogUrl(baseUrl: string): string {
  return queryUrl(baseUrl, '/api/benchmarks/subscription', new URLSearchParams({ operation: 'catalog' }));
}

async function jsonResponse(fetchImpl: FetchLike, input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  const response = await fetchImpl(input, init);
  const payload = await response.json();
  if (response.ok || response.status === 404 && isUnavailableEnvelope(payload)) return payload;
  throw new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
}

function isUnavailableEnvelope(value: unknown): boolean {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && (value as { readonly status?: unknown }).status === 'unavailable';
}

/**
 * Production-ready HTTP request construction. The caller opts into this
 * transport explicitly; errors and malformed responses propagate to the
 * gateway and never trigger evidence or fixture substitution.
 */
export function createHttpTransport(fetchImpl: FetchLike = fetch, baseUrl = globalThis.location?.origin ?? 'http://localhost'): PreviewDataTransport {
  return {
    request(method: UiDataContractV1Method, query: unknown): Promise<unknown> {
      switch (method) {
        case 'models':
          return jsonResponse(fetchImpl, modelsUrl(baseUrl, query as ModelDirectoryQuery));
        case 'profile': {
          const slug = (query as { readonly slug: string }).slug;
          return jsonResponse(fetchImpl, new URL(`/api/benchmarks/models/${encodeURIComponent(slug)}`, baseUrl).toString());
        }
        case 'lifecycle':
          return jsonResponse(fetchImpl, lifecycleUrl(baseUrl, query as LifecycleQuery));
        case 'rankings': {
          const rankings = query as RankingQuery;
          return rankings.operation === 'custom'
            ? jsonResponse(fetchImpl, new URL('/api/benchmarks/rankings', baseUrl).toString(), {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(rankings),
            })
            : jsonResponse(fetchImpl, leaderboardUrl(baseUrl, rankings));
        }
        case 'comparison':
          return jsonResponse(fetchImpl, comparisonUrl(baseUrl, query as CompareQuery));
        case 'subscription': {
          const subscription = query as SubscriptionQuery;
          return subscription.operation === 'calculate'
            ? jsonResponse(fetchImpl, new URL('/api/benchmarks/subscription', baseUrl).toString(), {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(subscription),
            })
            : jsonResponse(fetchImpl, subscriptionCatalogUrl(baseUrl));
        }
      }
    },
  };
}
