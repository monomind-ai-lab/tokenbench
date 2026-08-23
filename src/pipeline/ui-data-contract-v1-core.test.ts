import { describe, expect, it } from 'vitest';
import {
  UiDataContractValidationError,
  buildUiDataContractV1Envelope,
  decodeBoundedJson,
  validateUiDataContractV1EnvelopeCore,
} from './ui-data-contract-v1-core';

const source = {
  sourceRef: 'livebench:release',
  fieldGroup: '/data/models',
  sourceId: 'livebench',
  sourceRevision: 'commit-1',
  label: 'LiveBench',
  url: 'https://github.com/LiveBench/new-livebench',
  licenseId: 'Apache-2.0',
  observedAt: '2026-08-18T00:00:00.000Z',
  effectiveAt: '2026-08-17T00:00:00.000Z',
} as const;

function validBuildInput() {
  return {
    method: 'models' as const,
    request: {},
    status: 'available' as const,
    reason: null,
    fetchedAt: '2026-08-18T00:00:00.000Z',
    data: { models: [] },
    revisions: {
      projection: 'projection-1',
      catalog: 'catalog-1',
      benchmark: 'benchmark-1',
      runtimeObservationSet: null,
      projectionMethodology: 'ui-v1',
    },
    freshness: {
      catalogObservedAt: source.observedAt,
      runtimeObservedAt: null,
      benchmarkReleasedAt: source.effectiveAt,
      benchmarkCheckedAt: source.observedAt,
    },
    sources: [source],
    warnings: [],
  };
}

describe('UI data contract v1 envelope core', () => {
  it('checks unsupported version before method data', () => {
    expect(() => validateUiDataContractV1EnvelopeCore({ contractVersion: 'ui-data-contract/v2' }, 'models'))
      .toThrowError(expect.objectContaining({ code: 'unsupported_contract_version' }));
  });

  it('derives null aggregate time from distinct source times without forcing partial', () => {
    const result = buildUiDataContractV1Envelope({
      method: 'models', request: {}, status: 'available', reason: null,
      fetchedAt: '2026-08-18T00:00:00.000Z', data: { models: [] },
      revisions: { projection: 'projection-1', catalog: 'catalog-1', benchmark: 'benchmark-1', runtimeObservationSet: null, projectionMethodology: 'ui-v1' },
      freshness: { catalogObservedAt: source.observedAt, runtimeObservedAt: null, benchmarkReleasedAt: source.effectiveAt, benchmarkCheckedAt: source.observedAt },
      sources: [source, { ...source, sourceRef: 'openrouter:catalog', sourceId: 'openrouter', sourceRevision: 'catalog-1', label: 'OpenRouter', url: 'https://openrouter.ai/models', licenseId: 'OpenRouter-ToS', effectiveAt: '2026-08-16T00:00:00.000Z' }],
      warnings: [],
    });
    expect(result.effectiveAt).toBeNull();
    expect(result.status).toBe('available');
  });

  it('rejects non-canonical timestamps and oversized JSON before parsing', () => {
    expect(() => buildUiDataContractV1Envelope({ ...validBuildInput(), fetchedAt: '2026-08-18T08:00:00+08:00' }))
      .toThrowError(expect.objectContaining({ code: 'invalid_timestamp' }));
    expect(() => decodeBoundedJson(new Uint8Array(65_537), 65_536))
      .toThrowError(expect.objectContaining({ code: 'invalid_request' }));
  });

  it('closes envelope metadata and detects method mismatches', () => {
    const envelope = buildUiDataContractV1Envelope(validBuildInput());

    expect(() => validateUiDataContractV1EnvelopeCore({ ...envelope, storageKey: 'private' }, 'models'))
      .toThrowError(expect.objectContaining({ code: 'undeclared_field' }));
    expect(() => validateUiDataContractV1EnvelopeCore({ ...envelope, method: 'profile' }, 'models'))
      .toThrowError(expect.objectContaining({ code: 'method_mismatch' }));
  });

  it('requires explicit unavailable evidence with a matching warning', () => {
    const result = buildUiDataContractV1Envelope({
      ...validBuildInput(),
      status: 'partial',
      data: {
        models: [],
        benchmark: {
          availability: 'unavailable' as const,
          value: null,
          reason: 'No current benchmark release',
          sourceRefs: [],
        },
      },
      warnings: [{
        code: 'BENCHMARK_UNAVAILABLE',
        fieldGroup: '/data/benchmark',
        state: 'unknown' as const,
        message: 'No current benchmark release',
      }],
    });
    expect(result.status).toBe('partial');
    expect(() => validateUiDataContractV1EnvelopeCore({
      ...result,
      data: { models: [], benchmark: { availability: 'unavailable', reason: 'No current benchmark release', sourceRefs: [] } },
    }, 'models')).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('requires available evidence source references and canonical nested dates', () => {
    const envelope = buildUiDataContractV1Envelope({
      ...validBuildInput(),
      data: {
        models: [],
        score: { availability: 'available' as const, value: 0, sourceRefs: [source.sourceRef] },
        releaseOn: '2026-08-18',
      },
    });

    expect(() => validateUiDataContractV1EnvelopeCore({
      ...envelope,
      data: { ...envelope.data, score: { availability: 'available', value: 0, sourceRefs: ['unknown'] } },
    }, 'models')).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
    expect(() => validateUiDataContractV1EnvelopeCore({
      ...envelope,
      data: { ...envelope.data, releaseOn: '2026-02-30' },
    }, 'models')).toThrowError(expect.objectContaining({ code: 'invalid_calendar_date' }));
  });

  it('requires warnings for missing applicable freshness', () => {
    const partial = buildUiDataContractV1Envelope({
      ...validBuildInput(),
      status: 'partial',
      freshness: { ...validBuildInput().freshness, catalogObservedAt: null },
      warnings: [{ code: 'CATALOG_STALE', fieldGroup: '/data', state: 'stale', message: 'Catalog observation is unavailable' }],
    });

    expect(partial.status).toBe('partial');
    expect(() => validateUiDataContractV1EnvelopeCore({
      ...partial,
      status: 'available',
      warnings: [],
    }, 'models')).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('treats benchmark metadata as inapplicable to subscriptions', () => {
    expect(() => buildUiDataContractV1Envelope({
      ...validBuildInput(),
      method: 'subscription',
    })).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('preserves approved compatibility provenance without projecting the candidate', () => {
    const envelope = buildUiDataContractV1Envelope(validBuildInput());
    const candidate = {
      ...envelope,
      provenance: [{
        sourceRef: source.sourceRef,
        label: source.label,
        effectiveAt: source.effectiveAt,
        note: 'Retained compatibility note',
      }],
    };

    const result = validateUiDataContractV1EnvelopeCore(candidate, 'models');

    expect(result).toBe(candidate);
    expect(result.provenance).toEqual(candidate.provenance);
  });

  it('rejects credential-bearing source URLs', () => {
    expect(() => buildUiDataContractV1Envelope({
      ...validBuildInput(),
      sources: [{ ...source, url: 'https://user:password@example.com/models' }],
    })).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('rejects prohibited public keys in generic request and data values', () => {
    const candidates = [
      { ...validBuildInput(), request: { headers: {} } },
      { ...validBuildInput(), data: { models: [], payload: {} } },
      { ...validBuildInput(), request: { credentials: {} } },
      { ...validBuildInput(), data: { models: [], internalPointerId: 'row-1' } },
    ];

    for (const candidate of candidates) {
      expect(() => buildUiDataContractV1Envelope(candidate))
        .toThrowError(expect.objectContaining({ code: 'undeclared_field' }));
    }
  });

  it('rejects credential-bearing URLs and host paths in generic public values', () => {
    const candidates = [
      { ...validBuildInput(), request: { endpoint: 'https://user:password@example.com/models' } },
      { ...validBuildInput(), data: { models: [], note: '/Users/example/private/source.json' } },
    ];

    for (const candidate of candidates) {
      expect(() => buildUiDataContractV1Envelope(candidate))
        .toThrowError(expect.objectContaining({ code: 'invalid_response' }));
    }
  });

  it('rejects credential key variants without overblocking ordinary domain fields', () => {
    for (const key of ['authToken', 'httpHeaders', 'requestPayload', 'hostFilePath']) {
      expect(() => buildUiDataContractV1Envelope({
        ...validBuildInput(),
        request: { [key]: 'redacted' },
      })).toThrowError(expect.objectContaining({ code: 'undeclared_field' }));
    }

    const request = {
      inputTokensPerMessage: 1_000,
      outputTokensPerMessage: 200,
      crossoverTokenVolume: 25_000_000,
      cacheReadShareBasisPoints: 0,
    };
    expect(buildUiDataContractV1Envelope({ ...validBuildInput(), request }).request).toEqual(request);
  });

  it('rejects credential query parameters and workspace paths without blocking ordinary URLs', () => {
    for (const value of [
      'https://example.com/models?authToken=redacted',
      'https://example.com/models?api_key=redacted',
      '/workspace/tokenbench/private/source.json',
    ]) {
      expect(() => buildUiDataContractV1Envelope({
        ...validBuildInput(),
        request: { value },
      })).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
    }

    const request = { endpoint: 'https://example.com/models?model=gpt-4o' };
    expect(buildUiDataContractV1Envelope({ ...validBuildInput(), request }).request).toEqual(request);
  });

  it.each([
    ['undefined', undefined],
    ['function', () => 'value'],
    ['symbol', Symbol('value')],
    ['bigint', 1n],
  ])('rejects non-JSON %s available evidence values', (_description, value) => {
    expect(() => buildUiDataContractV1Envelope({
      ...validBuildInput(),
      data: {
        models: [],
        score: { availability: 'available' as const, value, sourceRefs: [source.sourceRef] },
      },
    })).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('rejects non-JSON values in generic requests', () => {
    expect(() => buildUiDataContractV1Envelope({
      ...validBuildInput(),
      request: { search: undefined },
    })).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it.each([
    ['Map', new Map([['key', 'value']])],
    ['Set', new Set(['value'])],
    ['Date', new Date('2026-08-18T00:00:00.000Z')],
    ['custom class', new (class CustomValue { readonly value = 'value'; })()],
  ])('rejects non-JSON %s instances', (_description, value) => {
    expect(() => buildUiDataContractV1Envelope({
      ...validBuildInput(),
      request: { value },
    })).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('rejects cyclic arrays with a typed validation error', () => {
    const values: unknown[] = [];
    values.push(values);

    expect(() => buildUiDataContractV1Envelope({
      ...validBuildInput(),
      request: { values },
    })).toThrowError(expect.objectContaining({ code: 'invalid_response' }));
  });

  it('accepts a plain acyclic object referenced from two properties', () => {
    const shared = { modelSlug: 'gpt-4o' };
    const request = { primary: shared, secondary: shared };

    const result = buildUiDataContractV1Envelope({ ...validBuildInput(), request });

    expect(result.request).toBe(request);
    expect(result.request.primary).toBe(shared);
    expect(result.request.secondary).toBe(shared);
  });

  it('exposes its stable validation error type', () => {
    expect(new UiDataContractValidationError('invalid_request', '$', 'invalid request')).toBeInstanceOf(TypeError);
  });
});
