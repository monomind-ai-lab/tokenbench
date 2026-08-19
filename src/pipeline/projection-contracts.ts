import { isCanonicalIsoTimestamp } from '../benchmarks/contracts';

export type DataState = 'observed' | 'unknown' | 'stale' | 'projected' | 'historical';

export interface SourceAttribution {
  readonly fieldGroup: string;
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly url: string;
  readonly licenseId: string | null;
  readonly observedAt: string;
}

export interface DataWarning {
  readonly code: string;
  readonly fieldGroup: string;
  readonly state: Exclude<DataState, 'observed'>;
  readonly message: string;
}

export interface ProjectionEnvelope<T> {
  readonly data: T;
  readonly revisions: {
    readonly projection: string;
    readonly catalog: string | null;
    readonly benchmark: string | null;
    readonly runtimeObservationSet: string | null;
    readonly projectionMethodology: string;
  };
  readonly freshness: {
    readonly catalogObservedAt: string | null;
    readonly runtimeObservedAt: string | null;
    readonly benchmarkReleasedAt: string | null;
    readonly benchmarkCheckedAt: string | null;
  };
  readonly sources: readonly SourceAttribution[];
  readonly warnings: readonly DataWarning[];
}

function fail(message: string): never {
  throw new Error(message);
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${name} must be a non-empty string`);
  return value;
}

function requireNullableString(value: unknown, name: string): string | null {
  if (value === null) return null;
  return requireNonEmptyString(value, name);
}

function requireTimestamp(value: unknown, name: string): string {
  if (!isCanonicalIsoTimestamp(value)) fail(`${name} must be a canonical ISO UTC timestamp`);
  return value;
}

function requireNullableTimestamp(value: unknown, name: string): string | null {
  if (value === null) return null;
  return requireTimestamp(value, name);
}

function requireHttpsUrl(value: unknown, name: string): string {
  const url = requireNonEmptyString(value, name);
  try {
    if (new URL(url).protocol !== 'https:') fail(`${name} must be an https URL`);
  } catch {
    fail(`${name} must be an https URL`);
  }
  return url;
}

function validateSource(value: unknown, index: number): SourceAttribution {
  const source = requireRecord(value, `sources[${index}]`);
  return {
    fieldGroup: requireNonEmptyString(source.fieldGroup, `sources[${index}].fieldGroup`),
    sourceId: requireNonEmptyString(source.sourceId, `sources[${index}].sourceId`),
    sourceRevision: requireNonEmptyString(source.sourceRevision, `sources[${index}].sourceRevision`),
    url: requireHttpsUrl(source.url, `sources[${index}].url`),
    licenseId: requireNullableString(source.licenseId, `sources[${index}].licenseId`),
    observedAt: requireTimestamp(source.observedAt, `sources[${index}].observedAt`),
  };
}

function validateWarning(value: unknown, index: number): DataWarning {
  const warning = requireRecord(value, `warnings[${index}]`);
  const state = warning.state;
  if (state !== 'unknown' && state !== 'stale' && state !== 'projected' && state !== 'historical') {
    fail(`warnings[${index}].state is invalid`);
  }
  return {
    code: requireNonEmptyString(warning.code, `warnings[${index}].code`),
    fieldGroup: requireNonEmptyString(warning.fieldGroup, `warnings[${index}].fieldGroup`),
    state,
    message: requireNonEmptyString(warning.message, `warnings[${index}].message`),
  };
}

export function validateProjectionEnvelope<T>(
  value: unknown,
  validateData: (value: unknown) => T,
): ProjectionEnvelope<T> {
  const envelope = requireRecord(value, 'projection envelope');
  const revisions = requireRecord(envelope.revisions, 'projection envelope.revisions');
  const freshness = requireRecord(envelope.freshness, 'projection envelope.freshness');

  const validatedRevisions = {
    projection: requireNonEmptyString(revisions.projection, 'revisions.projection'),
    catalog: requireNullableString(revisions.catalog, 'revisions.catalog'),
    benchmark: requireNullableString(revisions.benchmark, 'revisions.benchmark'),
    runtimeObservationSet: requireNullableString(
      revisions.runtimeObservationSet,
      'revisions.runtimeObservationSet',
    ),
    projectionMethodology: requireNonEmptyString(
      revisions.projectionMethodology,
      'revisions.projectionMethodology',
    ),
  };
  const validatedFreshness = {
    catalogObservedAt: requireNullableTimestamp(
      freshness.catalogObservedAt,
      'freshness.catalogObservedAt',
    ),
    runtimeObservedAt: requireNullableTimestamp(
      freshness.runtimeObservedAt,
      'freshness.runtimeObservedAt',
    ),
    benchmarkReleasedAt: requireNullableTimestamp(
      freshness.benchmarkReleasedAt,
      'freshness.benchmarkReleasedAt',
    ),
    benchmarkCheckedAt: requireNullableTimestamp(
      freshness.benchmarkCheckedAt,
      'freshness.benchmarkCheckedAt',
    ),
  };

  if (!Array.isArray(envelope.sources)) fail('projection envelope.sources must be an array');
  if (!Array.isArray(envelope.warnings)) fail('projection envelope.warnings must be an array');
  const sources = envelope.sources.map(validateSource);
  const warnings = envelope.warnings.map(validateWarning);
  const data = validateData(envelope.data);

  return {
    data,
    revisions: validatedRevisions,
    freshness: validatedFreshness,
    sources,
    warnings,
  };
}
