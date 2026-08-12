import {
  cachedApiResponse,
  readApiResponseCache,
  readNewestCompleteApiResponseCache,
  type ApiResponseCacheDatabase,
} from './api-response-cache';
import { BENCHMARK_FRESHNESS_WINDOW_MS } from '../../src/ingestion/cadence';

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/u;

export type BenchmarkFallbackStage = 'active-cache' | 'active-revision' | 'historical-cache';
export type BenchmarkFallbackEvent =
  | 'benchmark_fresh_cache_failed'
  | 'benchmark_active_revision_failed'
  | 'benchmark_stale_fallback_selected'
  | 'benchmark_unavailable';

export interface BenchmarkFallbackLog {
  readonly event: BenchmarkFallbackEvent;
  readonly endpoint: string;
  readonly queryId: string;
  readonly cacheScope: 'benchmarks';
  readonly cacheKey: string;
  readonly stage: BenchmarkFallbackStage;
  readonly errorClass: string | null;
  readonly activeRevision?: string;
  readonly fallbackRevision?: string;
  readonly fallbackSelected: boolean;
  readonly correlationId: string;
}

export interface BenchmarkFallbackOptions {
  readonly request: Request;
  readonly endpoint: string;
  readonly queryId: string;
  readonly cacheKey: string;
  readonly correlationId: string;
  readonly db: ApiResponseCacheDatabase;
  readonly reconstruct: (now: number) => Promise<Response | null>;
  readonly unavailable: () => Response;
  readonly log?: (entry: BenchmarkFallbackLog) => void;
  readonly now?: number;
  /**
   * Additional cache keys probed after the primary `cacheKey` when the active
   * revision reconstruction fails. Lets a non-materialized request fall back to
   * a sibling materialized stale projection (e.g. archived reads falling back to
   * the current complete projection) instead of 503.
   */
  readonly historicalCacheKeys?: readonly string[];
}

function safeErrorClass(error: unknown): string {
  if (error instanceof Error && SAFE_CORRELATION_ID.test(error.name)) return error.name;
  return 'UnknownError';
}

function emit(
  options: BenchmarkFallbackOptions,
  event: BenchmarkFallbackEvent,
  stage: BenchmarkFallbackStage,
  errorClass: string | null,
  fallbackSelected: boolean,
  fallbackRevision?: string,
): void {
  const entry: BenchmarkFallbackLog = {
    event,
    endpoint: options.endpoint,
    queryId: options.queryId,
    cacheScope: 'benchmarks',
    cacheKey: options.cacheKey,
    stage,
    errorClass,
    ...(fallbackRevision ? { fallbackRevision } : {}),
    fallbackSelected,
    correlationId: options.correlationId,
  };
  if (options.log) options.log(entry);
  else console.error(JSON.stringify(entry));
}

export function benchmarkCorrelationId(
  request: Request,
  randomUuid: () => string = () => crypto.randomUUID(),
): string {
  for (const inbound of [request.headers.get('cf-ray'), request.headers.get('x-request-id')]) {
    if (inbound && SAFE_CORRELATION_ID.test(inbound)) return inbound;
  }
  return randomUuid();
}

/** Executes the shared active-cache, active-revision, historical-cache recovery sequence. */
export async function serveBenchmarkWithFallback(options: BenchmarkFallbackOptions): Promise<Response> {
  const now = options.now ?? Date.now();
  try {
    const cached = await readApiResponseCache(
      options.db,
      'benchmarks',
      options.cacheKey,
      BENCHMARK_FRESHNESS_WINDOW_MS,
      now,
    );
    if (cached) return cachedApiResponse(options.request, cached);
  } catch (error) {
    emit(options, 'benchmark_fresh_cache_failed', 'active-cache', safeErrorClass(error), false);
  }

  try {
    const reconstructed = await options.reconstruct(now);
    if (reconstructed) return reconstructed;
  } catch (error) {
    emit(options, 'benchmark_active_revision_failed', 'active-revision', safeErrorClass(error), false);
  }

  let historicalErrorClass: string | null = null;
  const historicalKeys = [options.cacheKey, ...(options.historicalCacheKeys ?? [])];
  for (const historicalKey of historicalKeys) {
    try {
      const cached = await readNewestCompleteApiResponseCache(
        options.db,
        'benchmarks',
        historicalKey,
      );
      if (cached) {
        emit(options, 'benchmark_stale_fallback_selected', 'historical-cache', null, true, cached.revision);
        return cachedApiResponse(options.request, cached);
      }
    } catch (error) {
      historicalErrorClass = safeErrorClass(error);
    }
  }

  emit(options, 'benchmark_unavailable', 'historical-cache', historicalErrorClass, false);
  return options.unavailable();
}
