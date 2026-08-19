import { describe, expect, it, vi } from 'vitest';
import {
  validateProjectionEnvelope,
  type ProjectionEnvelope,
} from './projection-contracts';

const CATALOG_OBSERVED_AT = '2026-08-17T00:00:00.000Z';
const RUNTIME_OBSERVED_AT = '2026-08-17T00:01:00.000Z';
const BENCHMARK_RELEASED_AT = '2026-08-16T23:00:00.000Z';
const BENCHMARK_CHECKED_AT = '2026-08-17T00:02:00.000Z';

const data = { score: 0, availability: 'observed' };

type NumericAvailabilityData = {
  score: number | null;
  availability: 'observed' | 'unknown';
};

function validateNumericAvailability(value: unknown): NumericAvailabilityData {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('numeric data must be an object');
  }
  const record = value as { score: unknown; availability: unknown };
  if (record.availability === 'unknown') {
    if (record.score !== null) throw new Error('unknown availability requires null score');
    return value as NumericAvailabilityData;
  }
  if (record.availability === 'observed' && typeof record.score === 'number') {
    return value as NumericAvailabilityData;
  }
  throw new Error('observed availability requires a numeric score');
}

function envelope(overrides: Partial<ProjectionEnvelope<unknown>> = {}): ProjectionEnvelope<unknown> {
  return {
    data,
    revisions: {
      projection: 'projection-r1',
      catalog: 'catalog-r1',
      benchmark: 'benchmark-r1',
      runtimeObservationSet: 'runtime-r1',
      projectionMethodology: 'projection-method-v1',
    },
    freshness: {
      catalogObservedAt: CATALOG_OBSERVED_AT,
      runtimeObservedAt: RUNTIME_OBSERVED_AT,
      benchmarkReleasedAt: BENCHMARK_RELEASED_AT,
      benchmarkCheckedAt: BENCHMARK_CHECKED_AT,
    },
    sources: [{
      fieldGroup: 'score',
      sourceId: 'benchmark-source',
      sourceRevision: 'source-r1',
      url: 'https://source.example/benchmark',
      licenseId: 'CC-BY-4.0',
      observedAt: BENCHMARK_RELEASED_AT,
    }],
    warnings: [],
    ...overrides,
  };
}

function malformedEnvelope(overrides: Record<string, unknown>): unknown {
  return { ...envelope(), ...overrides };
}

describe('projection envelopes', () => {
  it('accepts independently observed catalog, benchmark, and runtime timestamps', () => {
    const validateData = vi.fn((value: unknown) => value as typeof data);

    const result = validateProjectionEnvelope(envelope(), validateData);

    expect(result.freshness).toEqual({
      catalogObservedAt: CATALOG_OBSERVED_AT,
      runtimeObservedAt: RUNTIME_OBSERVED_AT,
      benchmarkReleasedAt: BENCHMARK_RELEASED_AT,
      benchmarkCheckedAt: BENCHMARK_CHECKED_AT,
    });
  });

  it('validates the generic envelope and propagates the domain result', () => {
    const validatedData = { normalizedScore: 0 };
    const validateData = vi.fn(() => validatedData);

    const result = validateProjectionEnvelope(envelope(), validateData);

    expect(validateData).toHaveBeenCalledTimes(1);
    expect(validateData).toHaveBeenCalledWith(data);
    expect(result.data).toBe(validatedData);
  });

  it.each([
    ['a missing revisions object', { revisions: undefined }],
    ['an invalid projection revision', { revisions: { ...envelope().revisions, projection: '' } }],
    ['an invalid freshness timestamp', { freshness: { ...envelope().freshness, runtimeObservedAt: 'not-a-timestamp' } }],
    ['a missing sources array', { sources: undefined }],
    ['an invalid source URL', { sources: [{ ...envelope().sources[0], url: 'http://source.example' }] }],
    ['an observed warning state', {
      warnings: [{ code: 'ZERO', fieldGroup: 'score', state: 'observed', message: 'not a warning' }],
    }],
  ])('rejects %s', (_description, invalid) => {
    expect(() => validateProjectionEnvelope(malformedEnvelope(invalid), () => data)).toThrow();
  });

  it('accepts an unknown value only when its score is null', () => {
    const unknownData = { score: null, availability: 'unknown' };
    const validateData = vi.fn(validateNumericAvailability);

    expect(validateProjectionEnvelope(envelope({ data: unknownData }), validateData).data).toBe(unknownData);
    expect(validateData).toHaveBeenCalledTimes(1);
    expect(validateData).toHaveBeenCalledWith(unknownData);
  });

  it('rejects an unknown value represented by numeric zero', () => {
    const unknownData = { score: 0, availability: 'unknown' };
    const validateData = vi.fn(validateNumericAvailability);

    expect(() => validateProjectionEnvelope(envelope({ data: unknownData }), validateData))
      .toThrow('unknown availability requires null score');
    expect(validateData).toHaveBeenCalledTimes(1);
    expect(validateData).toHaveBeenCalledWith(unknownData);
  });

  it('accepts an observed numeric zero', () => {
    const observedZero = { score: 0, availability: 'observed' };
    const validateData = vi.fn(validateNumericAvailability);

    expect(validateProjectionEnvelope(envelope({ data: observedZero }), validateData).data).toBe(observedZero);
    expect(validateData).toHaveBeenCalledTimes(1);
    expect(validateData).toHaveBeenCalledWith(observedZero);
  });

  it('propagates a domain validation error without wrapping it', () => {
    const error = new Error('domain data is invalid');
    const validateData = vi.fn(() => { throw error; });

    expect(() => validateProjectionEnvelope(envelope(), validateData)).toThrow(error);
    expect(validateData).toHaveBeenCalledTimes(1);
  });
});
