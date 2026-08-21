import {
  buildUiDataContractV1Envelope,
  type SourceAttribution,
  type UiDataContractV1Envelope,
  type UiDataContractV1Method,
} from '../../src/pipeline/ui-data-contract-v1-core';
import {
  readActiveLiveBenchBundle,
  type ActiveLiveBenchRelease,
  type LiveBenchD1Database,
} from './livebench-db';
import type { LiveBenchReleaseBundle } from '../../src/livebench/contracts';
import { collectUiDataUnavailableWarnings } from './livebench-ui-data';

export const UI_DATA_CONTRACT_V1_MEDIA_TYPE = 'application/vnd.tokenbench.ui-data.v1+json';
export const LIVEBENCH_PROJECTION_METHODOLOGY = 'livebench-upstream-global-average-2026-06-25-v1';

export interface LiveBenchApiContext {
  readonly release: ActiveLiveBenchRelease;
  readonly bundle: LiveBenchReleaseBundle;
  readonly source: SourceAttribution;
}

export function acceptsUiDataContractV1(request: Request): boolean {
  return (request.headers.get('accept') ?? '')
    .split(',')
    .some((entry) => {
      const [mediaType = '', ...parameters] = entry.split(';');
      if (mediaType.trim().toLowerCase() !== UI_DATA_CONTRACT_V1_MEDIA_TYPE) return false;
      const quality = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.toLowerCase().startsWith('q='));
      if (quality === undefined) return true;
      const value = Number(quality.slice(2));
      return Number.isFinite(value) && value > 0 && value <= 1;
    });
}

export async function readLiveBenchApiContext(
  db: LiveBenchD1Database,
): Promise<LiveBenchApiContext | null> {
  const active = await readActiveLiveBenchBundle(db);
  if (!active) return null;
  return {
    ...active,
    source: {
      sourceRef: `livebench:${active.release.revision}`,
      fieldGroup: '/data',
      sourceId: 'livebench',
      sourceRevision: active.release.revision,
      label: `LiveBench ${active.release.sourceReleaseId}`,
      url: `https://github.com/LiveBench/new-livebench/tree/${active.release.sourceCommit}`,
      licenseId: active.release.licenseId,
      observedAt: active.release.observedAt,
      effectiveAt: active.release.releasedAt,
    },
  };
}

export function buildLiveBenchMethodEnvelope<
  M extends UiDataContractV1Method,
  R,
  D extends object,
>(input: {
  readonly method: M;
  readonly request: R;
  readonly data: D;
  readonly context: LiveBenchApiContext;
  readonly fetchedAt: string;
}): UiDataContractV1Envelope<M, R, D> {
  const warnings = collectUiDataUnavailableWarnings(input.data);
  return buildUiDataContractV1Envelope({
    method: input.method,
    request: input.request,
    status: warnings.length === 0 ? 'available' : 'partial',
    reason: null,
    fetchedAt: input.fetchedAt,
    data: input.data,
    revisions: {
      projection: `livebench-ui-data-v1:${input.context.release.revision}:${input.method}`,
      catalog: null,
      benchmark: input.context.release.revision,
      runtimeObservationSet: null,
      projectionMethodology: LIVEBENCH_PROJECTION_METHODOLOGY,
    },
    freshness: {
      catalogObservedAt: null,
      runtimeObservedAt: null,
      benchmarkReleasedAt: input.context.release.releasedAt,
      benchmarkCheckedAt: input.context.release.checkedAt,
    },
    sources: [input.context.source],
    warnings,
  });
}

export function buildUnavailableUiDataEnvelope<M extends UiDataContractV1Method, R>(input: {
  readonly method: M;
  readonly request: R;
  readonly fetchedAt: string;
  readonly reason: string;
}): UiDataContractV1Envelope<M, R, unknown> {
  return buildUiDataContractV1Envelope({
    method: input.method,
    request: input.request,
    status: 'unavailable',
    reason: input.reason,
    fetchedAt: input.fetchedAt,
    data: null,
    revisions: {
      projection: `livebench-ui-data-v1-unavailable:${input.method}`,
      catalog: null,
      benchmark: null,
      runtimeObservationSet: null,
      projectionMethodology: LIVEBENCH_PROJECTION_METHODOLOGY,
    },
    freshness: {
      catalogObservedAt: null,
      runtimeObservedAt: null,
      benchmarkReleasedAt: null,
      benchmarkCheckedAt: null,
    },
    sources: [],
    warnings: [],
  });
}

export function jsonUiDataResponse(value: unknown, status: number, etag?: string): Response {
  const headers = new Headers({
    'Cache-Control': status === 200 ? 'public, max-age=0, must-revalidate' : 'no-store',
    'Content-Type': `${UI_DATA_CONTRACT_V1_MEDIA_TYPE}; charset=utf-8`,
    Vary: 'Accept',
  });
  if (etag) headers.set('ETag', etag);
  return new Response(JSON.stringify(value), { status, headers });
}

/** Operational failures are not source unavailability and must propagate. */
export function jsonUiDataServiceUnavailable(): Response {
  return jsonUiDataResponse({
    error: {
      code: 'service_unavailable',
      message: 'The verified benchmark data could not be read or projected.',
    },
  }, 503);
}
