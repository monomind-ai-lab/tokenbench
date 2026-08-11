const BENCHMARK_CACHE_SCHEMA = 'tokenbench-benchmark-cache/v2' as const;
const BENCHMARK_CACHE_KEY_PREFIX = 'tokenbench:benchmarks:v2:';
const BENCHMARK_CACHE_MAX_BYTES = 2_000_000;
const UTF8_ENCODER = new TextEncoder();

export interface BenchmarkEnvelopeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredBenchmarkEnvelope {
  readonly schema: typeof BENCHMARK_CACHE_SCHEMA;
  readonly storedAt: string;
  readonly value: unknown;
}

export interface CachedBenchmarkEnvelope<T> {
  readonly value: T;
  readonly storedAt: string;
}

function defaultStorage(): BenchmarkEnvelopeStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const canonical = new Date(timestamp).toISOString();
  return value.endsWith('.000Z') ? value === canonical : value === canonical.replace(/\.000Z$/u, 'Z');
}

function encodedIdentity(value: string): string {
  return encodeURIComponent(value);
}

/** Builds an endpoint/query-isolated schema-versioned key from the exact normalized request serializer. */
export function benchmarkCacheKey(endpoint: string, normalizedQuery?: string): string {
  const separator = endpoint.indexOf('?');
  const path = separator < 0 ? endpoint : endpoint.slice(0, separator);
  const query = normalizedQuery ?? (separator < 0 ? '' : endpoint.slice(separator + 1));
  return `${BENCHMARK_CACHE_KEY_PREFIX}${encodedIdentity(path)}:${encodedIdentity(query)}`;
}

export function readBenchmarkEnvelopeCache<T>(
  key: string,
  parse: (value: unknown) => T | null,
  storage: BenchmarkEnvelopeStorage | undefined = defaultStorage(),
): CachedBenchmarkEnvelope<T> | null {
  if (!storage || !key.startsWith(BENCHMARK_CACHE_KEY_PREFIX)) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw || UTF8_ENCODER.encode(raw).byteLength > BENCHMARK_CACHE_MAX_BYTES) return null;
    const stored = JSON.parse(raw) as Partial<StoredBenchmarkEnvelope>;
    if (stored.schema !== BENCHMARK_CACHE_SCHEMA || !isCanonicalIsoTimestamp(stored.storedAt)) return null;
    const value = parse(stored.value);
    return value === null ? null : { value, storedAt: stored.storedAt };
  } catch {
    return null;
  }
}

export function writeBenchmarkEnvelopeCache<T>(
  key: string,
  envelope: T,
  storedAt: string = new Date().toISOString(),
  storage: BenchmarkEnvelopeStorage | undefined = defaultStorage(),
): void {
  if (!storage || !key.startsWith(BENCHMARK_CACHE_KEY_PREFIX) || !isCanonicalIsoTimestamp(storedAt)) return;
  try {
    const raw = JSON.stringify({ schema: BENCHMARK_CACHE_SCHEMA, storedAt, value: envelope });
    if (UTF8_ENCODER.encode(raw).byteLength > BENCHMARK_CACHE_MAX_BYTES) return;
    storage.setItem(key, raw);
  } catch {
    // Browser storage can be disabled, full, or unavailable in privacy modes.
  }
}
