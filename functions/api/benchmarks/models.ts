import type { BenchmarkModel, EvidenceStatus } from '../../../src/benchmarks/contracts';
import type { ModelDirectoryStatus } from '../../../src/benchmarks/model-directory';
import {
  ModelDirectoryRequestError,
  modelDirectoryEnvelopeDigest,
  readModelDirectory,
  type ModelDirectoryQuery,
} from '../../_shared/model-directory-db';
import {
  invalidBenchmarkRequestResponse,
  jsonBenchmarkResponse,
  matchesExactEtag,
  notModifiedBenchmarkResponse,
  unavailableBenchmarkResponse,
  type BenchmarkApiEnv,
} from '../../_shared/benchmark-db';

const ALLOWED_PARAMETERS = new Set(['q', 'creator', 'sourceType', 'evidenceStatus', 'status', 'limit', 'cursor']);

function optionalBounded(value: string | null, maximum: number): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) throw new ModelDirectoryRequestError('invalid model directory parameter');
  return normalized;
}

function parseQuery(request: Request): ModelDirectoryQuery {
  const url = new URL(request.url);
  for (const [key] of url.searchParams) {
    if (!ALLOWED_PARAMETERS.has(key) || url.searchParams.getAll(key).length !== 1) {
      throw new ModelDirectoryRequestError('invalid model directory parameter');
    }
  }
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length > 80) throw new ModelDirectoryRequestError('invalid model directory search');
  const creator = optionalBounded(url.searchParams.get('creator'), 80);
  const sourceTypeValue = url.searchParams.get('sourceType');
  const sourceType: BenchmarkModel['sourceType'] | null = sourceTypeValue === null
    ? null
    : sourceTypeValue === 'Proprietary' || sourceTypeValue === 'Open Weight' || sourceTypeValue === 'Unknown'
      ? sourceTypeValue
      : (() => { throw new ModelDirectoryRequestError('invalid model directory source type'); })();
  const evidenceValue = url.searchParams.get('evidenceStatus');
  const evidenceStatus: EvidenceStatus | null = evidenceValue === null
    ? null
    : evidenceValue === 'supported' || evidenceValue === 'estimated' || evidenceValue === 'source_only'
      ? evidenceValue
      : (() => { throw new ModelDirectoryRequestError('invalid model directory evidence status'); })();
  const statusValue = url.searchParams.get('status') ?? 'current';
  const status: ModelDirectoryStatus | 'all' = statusValue === 'current' || statusValue === 'archived' || statusValue === 'all'
    ? statusValue
    : (() => { throw new ModelDirectoryRequestError('invalid model directory status'); })();
  const limitValue = url.searchParams.get('limit');
  const limit = limitValue === null ? 100 : Number(limitValue);
  if (!/^\d{1,3}$/.test(limitValue ?? '100') || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new ModelDirectoryRequestError('invalid model directory limit');
  }
  const cursor = url.searchParams.get('cursor');
  if (cursor !== null && (cursor.length > 1_024 || !/^[A-Za-z0-9_-]+$/.test(cursor))) {
    throw new ModelDirectoryRequestError('invalid model directory cursor');
  }
  return { q, creator, sourceType, evidenceStatus, status, limit, cursor };
}

function directoryEtag(envelope: Awaited<ReturnType<typeof readModelDirectory>>, query: ModelDirectoryQuery): string {
  return `"models-${modelDirectoryEnvelopeDigest(envelope, query)}"`;
}

export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: BenchmarkApiEnv;
}): Promise<Response> {
  if (!env.CATALOG_DB) return unavailableBenchmarkResponse();
  let query: ModelDirectoryQuery;
  try {
    query = parseQuery(request);
  } catch (error) {
    if (error instanceof ModelDirectoryRequestError) return invalidBenchmarkRequestResponse();
    return invalidBenchmarkRequestResponse();
  }
  try {
    const envelope = await readModelDirectory(env.CATALOG_DB, query);
    const etag = directoryEtag(envelope, query);
    if (matchesExactEtag(request, etag)) return notModifiedBenchmarkResponse(etag);
    return jsonBenchmarkResponse(envelope, 200, etag);
  } catch (error) {
    if (error instanceof ModelDirectoryRequestError) return invalidBenchmarkRequestResponse();
    return unavailableBenchmarkResponse();
  }
}
