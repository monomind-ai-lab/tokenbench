import { beforeEach, describe, expect, it } from 'vitest';
import {
  benchmarkCacheKey,
  pricePerformanceCacheKey,
  readBenchmarkEnvelopeCache,
  readPricePerformanceEnvelopeCache,
  writeBenchmarkEnvelopeCache,
  type BenchmarkEnvelopeStorage,
} from './benchmark-cache';

const STORED_AT = '2026-08-11T00:00:00.000Z';

function parseRevision(value: unknown): { revision: string } | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && typeof (value as { revision?: unknown }).revision === 'string'
    ? value as { revision: string }
    : null;
}

describe('validated browser benchmark envelope cache', () => {
  beforeEach(() => localStorage.clear());

  it('builds schema-versioned keys with isolated normalized queries', () => {
    const base = benchmarkCacheKey('/api/benchmarks/leaderboards/llm-coding', 'profile=balanced&limit=50');
    const filtered = benchmarkCacheKey('/api/benchmarks/leaderboards/llm-coding', 'profile=balanced&q=Alpha&limit=50');

    expect(base).toMatch(/^tokenbench:benchmarks:v2:/);
    expect(filtered).toMatch(/^tokenbench:benchmarks:v2:/);
    expect(filtered).not.toBe(base);
    expect(benchmarkCacheKey('/api/benchmarks', '')).not.toBe(base);
  });

  it('round trips only values accepted by the endpoint parser', () => {
    const key = benchmarkCacheKey('/api/benchmarks', '');
    writeBenchmarkEnvelopeCache(key, { revision: 'benchmark-rev-41' }, STORED_AT);

    expect(readBenchmarkEnvelopeCache(key, parseRevision)).toEqual({
      value: { revision: 'benchmark-rev-41' },
      storedAt: STORED_AT,
    });
    expect(readBenchmarkEnvelopeCache(key, () => null)).toBeNull();
  });

  it('rejects malformed schemas, timestamps, and values larger than two million UTF-8 bytes', () => {
    const key = benchmarkCacheKey('/api/benchmarks', '');
    localStorage.setItem(key, JSON.stringify({ schema: 'old', storedAt: STORED_AT, value: { revision: 'old' } }));
    expect(readBenchmarkEnvelopeCache(key, parseRevision)).toBeNull();

    localStorage.setItem(key, JSON.stringify({
      schema: 'tokenbench-benchmark-cache/v2',
      storedAt: 'not-a-date',
      value: { revision: 'old' },
    }));
    expect(readBenchmarkEnvelopeCache(key, parseRevision)).toBeNull();

    localStorage.setItem(key, 'x'.repeat(2_000_001));
    expect(readBenchmarkEnvelopeCache(key, parseRevision)).toBeNull();
  });

  it('keeps storage security and quota errors non-fatal', () => {
    const throwing: BenchmarkEnvelopeStorage = {
      getItem() { throw new DOMException('denied', 'SecurityError'); },
      setItem() { throw new DOMException('full', 'QuotaExceededError'); },
    };
    const key = benchmarkCacheKey('/api/benchmarks', '');

    expect(() => writeBenchmarkEnvelopeCache(key, { revision: 'benchmark-rev-41' }, STORED_AT, throwing))
      .not.toThrow();
    expect(readBenchmarkEnvelopeCache(key, parseRevision, throwing)).toBeNull();
  });

  it('does not overwrite a prior valid value with an oversized write', () => {
    const key = benchmarkCacheKey('/api/benchmarks', '');
    writeBenchmarkEnvelopeCache(key, { revision: 'benchmark-rev-41' }, STORED_AT);
    const prior = localStorage.getItem(key);

    writeBenchmarkEnvelopeCache(key, { revision: 'x'.repeat(2_000_001) }, STORED_AT);

    expect(localStorage.getItem(key)).toBe(prior);
  });
  it('uses one complete projection key and only accepts a runtime-validated envelope', () => {
    const key = pricePerformanceCacheKey();
    expect(key).toBe('tokenbench:benchmarks:v2:price-performance:complete');
    expect(readPricePerformanceEnvelopeCache()).toBeNull();

    localStorage.setItem(key, JSON.stringify({
      schema: 'tokenbench-benchmark-cache/v2',
      storedAt: STORED_AT,
      value: { revision: 'not-a-complete-envelope' },
    }));
    expect(readPricePerformanceEnvelopeCache()).toBeNull();
  });
});
