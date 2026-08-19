import { isCanonicalIsoTimestamp } from '../benchmarks/contracts';

export type UiDataContractV1Method =
  | 'models' | 'profile' | 'lifecycle' | 'rankings' | 'comparison' | 'subscription';

export type UiDataContractErrorCode =
  | 'unsupported_contract_version' | 'method_mismatch' | 'invalid_timestamp'
  | 'invalid_calendar_date' | 'invalid_request' | 'invalid_response' | 'undeclared_field';

export class UiDataContractValidationError extends TypeError {
  constructor(
    readonly code: UiDataContractErrorCode,
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'UiDataContractValidationError';
  }
}

export type EvidenceValue<T> =
  | { readonly availability: 'available'; readonly value: T; readonly sourceRefs: readonly string[] }
  | { readonly availability: 'unavailable'; readonly value: null; readonly reason: string; readonly sourceRefs: readonly string[] };

export interface SourceAttribution {
  readonly sourceRef: string;
  readonly fieldGroup: string;
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly label: string;
  readonly url: string;
  readonly licenseId: 'CDLA-Permissive-2.0' | 'MIT' | 'CC-BY-4.0' | 'OpenRouter-ToS' | 'provider-terms' | null;
  readonly observedAt: string;
  readonly effectiveAt: string | null;
}

export interface Provenance {
  readonly sourceRef: string;
  readonly label: string;
  readonly effectiveAt: string | null;
  readonly note: string;
}

export interface DataWarning {
  readonly code: string;
  readonly fieldGroup: string;
  readonly state: 'unknown' | 'stale' | 'projected' | 'historical';
  readonly message: string;
}

export interface UiDataContractV1Envelope<M extends UiDataContractV1Method, R, D> {
  readonly contractVersion: 'ui-data-contract/v1';
  readonly method: M;
  readonly request: R;
  readonly status: 'available' | 'partial' | 'unavailable';
  readonly reason: string | null;
  readonly fetchedAt: string;
  readonly effectiveAt: string | null;
  readonly data: D | null;
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
  readonly provenance: readonly Provenance[];
}

export interface UiDataContractV1EnvelopeInput<M extends UiDataContractV1Method, R, D> {
  readonly method: M;
  readonly request: R;
  readonly status: 'available' | 'partial' | 'unavailable';
  readonly reason: string | null;
  readonly fetchedAt: string;
  readonly data: D | null;
  readonly revisions: UiDataContractV1Envelope<M, R, D>['revisions'];
  readonly freshness: UiDataContractV1Envelope<M, R, D>['freshness'];
  readonly sources: readonly SourceAttribution[];
  readonly warnings: readonly DataWarning[];
}

const METHODS = new Set<UiDataContractV1Method>([
  'models', 'profile', 'lifecycle', 'rankings', 'comparison', 'subscription',
]);
const LICENSE_IDS = new Set<SourceAttribution['licenseId']>([
  'CDLA-Permissive-2.0', 'MIT', 'CC-BY-4.0', 'OpenRouter-ToS', 'provider-terms', null,
]);
const WARNING_STATES = new Set<DataWarning['state']>(['unknown', 'stale', 'projected', 'historical']);
const ENVELOPE_KEYS = [
  'contractVersion', 'method', 'request', 'status', 'reason', 'fetchedAt', 'effectiveAt',
  'data', 'revisions', 'freshness', 'sources', 'warnings', 'provenance',
] as const;
const REVISION_KEYS = ['projection', 'catalog', 'benchmark', 'runtimeObservationSet', 'projectionMethodology'] as const;
const FRESHNESS_KEYS = ['catalogObservedAt', 'runtimeObservedAt', 'benchmarkReleasedAt', 'benchmarkCheckedAt'] as const;
const SOURCE_KEYS = ['sourceRef', 'fieldGroup', 'sourceId', 'sourceRevision', 'label', 'url', 'licenseId', 'observedAt', 'effectiveAt'] as const;
const PROVENANCE_KEYS = ['sourceRef', 'label', 'effectiveAt', 'note'] as const;
const WARNING_KEYS = ['code', 'fieldGroup', 'state', 'message'] as const;
const TIMESTAMP_FIELD_NAMES = new Set([
  'asOf', 'fetchedAt', 'effectiveAt', 'observedAt', 'catalogObservedAt', 'runtimeObservedAt',
  'benchmarkReleasedAt', 'benchmarkCheckedAt', 'windowStartedAt', 'windowEndedAt',
]);
const CALENDAR_DATE_FIELD_NAMES = new Set(['releaseOn', 'sunsetOn']);
const PROHIBITED_PUBLIC_KEYS = new Set([
  'authorization', 'proxyauthorization', 'header', 'headers', 'requestheaders', 'responseheaders',
  'cookie', 'setcookie', 'body', 'rawbody', 'requestbody', 'responsebody', 'payload', 'rawpayload',
  'sourcepayload', 'credential', 'credentials', 'password', 'passwd', 'secret', 'clientsecret',
  'apikey', 'accesskey', 'privatekey', 'token', 'accesstoken', 'refreshtoken', 'filepath',
  'hostpath', 'localpath', 'absolutepath', 'd1tablename', 'r2key', 'cachekey', 'cachechunkkey',
  'snapshotkey', 'storagekey', 'binding', 'bindings', 'internalpointerid',
]);
const HOST_PATH_PATTERN = /^(?:\/(?:Users|home|root|workspace|workspaces|private\/var|var\/folders|tmp)(?:\/|$)|[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+|\.\.?[\\/])/;

type UnknownRecord = Record<string, unknown>;

function fail(code: UiDataContractErrorCode, path: string, message: string): never {
  throw new UiDataContractValidationError(code, path, message);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) fail('invalid_response', path, 'must be an object');
  return value;
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail('invalid_response', path, 'must be an array');
  return value;
}

function expectExactKeys(record: UnknownRecord, keys: readonly string[], path: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) fail('undeclared_field', `${path}/${escapePointerToken(key)}`, 'is not declared by ui-data-contract/v1');
  }
  for (const key of keys) {
    if (!(key in record)) fail('invalid_response', path, `is missing required field ${key}`);
  }
}

function expectNonEmptyString(value: unknown, path: string, code: UiDataContractErrorCode = 'invalid_response'): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(code, path, 'must be a non-empty string');
  return value;
}

function expectNullableRevision(value: unknown, path: string): string | null {
  if (value === null) return null;
  return expectNonEmptyString(value, path);
}

function expectCanonicalTimestamp(value: unknown, path: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (!isCanonicalIsoTimestamp(value)) fail('invalid_timestamp', path, 'must be a canonical UTC timestamp');
  return value;
}

function isCanonicalCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function expectCanonicalCalendarDate(value: unknown, path: string): void {
  if (!isCanonicalCalendarDate(value)) fail('invalid_calendar_date', path, 'must be a canonical Gregorian calendar date');
}

function escapePointerToken(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function normalizePublicKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function publicKeyWords(value: string): Set<string> {
  return new Set(value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((word) => word.toLowerCase()));
}

function isProhibitedPublicKey(value: string): boolean {
  if (PROHIBITED_PUBLIC_KEYS.has(normalizePublicKey(value))) return true;
  const words = publicKeyWords(value);
  if (['authorization', 'header', 'headers', 'cookie', 'body', 'payload', 'credential',
    'credentials', 'password', 'passwd', 'secret'].some((word) => words.has(word))) return true;
  if (words.has('token')
    && ['auth', 'authentication', 'access', 'refresh', 'api', 'client', 'bearer']
      .some((word) => words.has(word))) return true;
  if (words.has('key')
    && ['api', 'access', 'private', 'secret', 'r2', 'cache', 'storage', 'snapshot']
      .some((word) => words.has(word))) return true;
  return words.has('path')
    && ['host', 'file', 'local', 'absolute', 'workspace', 'home', 'root']
      .some((word) => words.has(word));
}

function hasUrlCredentials(value: string): boolean {
  try {
    const url = new URL(value);
    return url.username.length > 0
      || url.password.length > 0
      || [...url.searchParams.keys()].some(isProhibitedPublicKey);
  } catch {
    return false;
  }
}

function isProhibitedPublicString(value: string): boolean {
  const trimmed = value.trim();
  return hasUrlCredentials(trimmed)
    || /^file:/i.test(trimmed)
    || HOST_PATH_PATTERN.test(trimmed)
    || /^(?:Basic|Bearer)\s+\S/i.test(trimmed)
    || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(trimmed);
}

function validateGenericPublicBoundary(value: unknown, path: string, recursionStack = new Set<object>()): void {
  if (typeof value === 'string') {
    if (isProhibitedPublicString(value)) fail('invalid_response', path, 'must not expose credentials or host paths');
    return;
  }
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('invalid_response', path, 'numbers must be finite');
    return;
  }
  if (typeof value !== 'object') fail('invalid_response', path, 'must contain only JSON values');
  if (Array.isArray(value)) {
    if (recursionStack.has(value)) fail('invalid_response', path, 'must not contain a cycle');
    recursionStack.add(value);
    try {
      value.forEach((entry, index) => validateGenericPublicBoundary(entry, `${path}/${index}`, recursionStack));
    } finally {
      recursionStack.delete(value);
    }
    return;
  }
  if (!isRecord(value)) fail('invalid_response', path, 'must contain only JSON values');
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    fail('invalid_response', path, 'must contain only plain JSON objects');
  }
  if (recursionStack.has(value)) fail('invalid_response', path, 'must not contain a cycle');
  recursionStack.add(value);
  try {
    for (const [key, nested] of Object.entries(value)) {
      const nestedPath = `${path}/${escapePointerToken(key)}`;
      if (isProhibitedPublicKey(key)) {
        fail('undeclared_field', nestedPath, 'must not expose internal or credential-bearing fields');
      }
      validateGenericPublicBoundary(nested, nestedPath, recursionStack);
    }
  } finally {
    recursionStack.delete(value);
  }
}

function isDataFieldGroup(value: unknown): value is string {
  return typeof value === 'string'
    && /^(?:\/(?:[^~/]|~[01])*)*$/.test(value)
    && (value === '/data' || value.startsWith('/data/'));
}

function expectDataFieldGroup(value: unknown, path: string): string {
  if (!isDataFieldGroup(value)) fail('invalid_response', path, 'must be an RFC 6901 pointer rooted at /data');
  return value;
}

function validateRevisions(value: unknown): UiDataContractV1Envelope<UiDataContractV1Method, unknown, unknown>['revisions'] {
  const revisions = expectRecord(value, '$/revisions');
  expectExactKeys(revisions, REVISION_KEYS, '$/revisions');
  return {
    projection: expectNonEmptyString(revisions.projection, '$/revisions/projection'),
    catalog: expectNullableRevision(revisions.catalog, '$/revisions/catalog'),
    benchmark: expectNullableRevision(revisions.benchmark, '$/revisions/benchmark'),
    runtimeObservationSet: expectNullableRevision(revisions.runtimeObservationSet, '$/revisions/runtimeObservationSet'),
    projectionMethodology: expectNonEmptyString(revisions.projectionMethodology, '$/revisions/projectionMethodology'),
  };
}

function validateFreshness(value: unknown): UiDataContractV1Envelope<UiDataContractV1Method, unknown, unknown>['freshness'] {
  const freshness = expectRecord(value, '$/freshness');
  expectExactKeys(freshness, FRESHNESS_KEYS, '$/freshness');
  return {
    catalogObservedAt: expectCanonicalTimestamp(freshness.catalogObservedAt, '$/freshness/catalogObservedAt', true),
    runtimeObservedAt: expectCanonicalTimestamp(freshness.runtimeObservedAt, '$/freshness/runtimeObservedAt', true),
    benchmarkReleasedAt: expectCanonicalTimestamp(freshness.benchmarkReleasedAt, '$/freshness/benchmarkReleasedAt', true),
    benchmarkCheckedAt: expectCanonicalTimestamp(freshness.benchmarkCheckedAt, '$/freshness/benchmarkCheckedAt', true),
  };
}

function validateSources(value: unknown): SourceAttribution[] {
  const sourceRefs = new Set<string>();
  return expectArray(value, '$/sources').map((candidate, index) => {
    const path = `$/sources/${index}`;
    const source = expectRecord(candidate, path);
    expectExactKeys(source, SOURCE_KEYS, path);
    const sourceRef = expectNonEmptyString(source.sourceRef, `${path}/sourceRef`);
    if (sourceRefs.has(sourceRef)) fail('invalid_response', `${path}/sourceRef`, 'must be unique');
    sourceRefs.add(sourceRef);
    const url = expectNonEmptyString(source.url, `${path}/url`);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      fail('invalid_response', `${path}/url`, 'must be an HTTPS URL');
    }
    if (parsedUrl.protocol !== 'https:') fail('invalid_response', `${path}/url`, 'must be an HTTPS URL');
    if (parsedUrl.username.length > 0 || parsedUrl.password.length > 0) {
      fail('invalid_response', `${path}/url`, 'must not contain credentials');
    }
    if (!LICENSE_IDS.has(source.licenseId as SourceAttribution['licenseId'])) {
      fail('invalid_response', `${path}/licenseId`, 'must be a declared license identifier or null');
    }
    return {
      sourceRef,
      fieldGroup: expectDataFieldGroup(source.fieldGroup, `${path}/fieldGroup`),
      sourceId: expectNonEmptyString(source.sourceId, `${path}/sourceId`),
      sourceRevision: expectNonEmptyString(source.sourceRevision, `${path}/sourceRevision`),
      label: expectNonEmptyString(source.label, `${path}/label`),
      url,
      licenseId: source.licenseId as SourceAttribution['licenseId'],
      observedAt: expectCanonicalTimestamp(source.observedAt, `${path}/observedAt`) as string,
      effectiveAt: expectCanonicalTimestamp(source.effectiveAt, `${path}/effectiveAt`, true),
    };
  });
}

function validateWarnings(value: unknown): DataWarning[] {
  return expectArray(value, '$/warnings').map((candidate, index) => {
    const path = `$/warnings/${index}`;
    const warning = expectRecord(candidate, path);
    expectExactKeys(warning, WARNING_KEYS, path);
    if (!WARNING_STATES.has(warning.state as DataWarning['state'])) {
      fail('invalid_response', `${path}/state`, 'must be a declared warning state');
    }
    return {
      code: expectNonEmptyString(warning.code, `${path}/code`),
      fieldGroup: expectDataFieldGroup(warning.fieldGroup, `${path}/fieldGroup`),
      state: warning.state as DataWarning['state'],
      message: expectNonEmptyString(warning.message, `${path}/message`),
    };
  });
}

function validateProvenance(value: unknown, sources: readonly SourceAttribution[]): Provenance[] {
  const provenance = expectArray(value, '$/provenance');
  if (provenance.length !== sources.length) fail('invalid_response', '$/provenance', 'must contain one record per source');
  return provenance.map((candidate, index) => {
    const path = `$/provenance/${index}`;
    const entry = expectRecord(candidate, path);
    expectExactKeys(entry, PROVENANCE_KEYS, path);
    const source = sources[index];
    const sourceRef = expectNonEmptyString(entry.sourceRef, `${path}/sourceRef`);
    if (sourceRef !== source.sourceRef) fail('invalid_response', `${path}/sourceRef`, 'must match the source order');
    const label = expectNonEmptyString(entry.label, `${path}/label`);
    if (label !== source.label) fail('invalid_response', `${path}/label`, 'must match the source label');
    const effectiveAt = expectCanonicalTimestamp(entry.effectiveAt, `${path}/effectiveAt`, true);
    if (effectiveAt !== source.effectiveAt) fail('invalid_response', `${path}/effectiveAt`, 'must match the source effective time');
    return {
      sourceRef,
      label,
      effectiveAt,
      note: expectNonEmptyString(entry.note, `${path}/note`),
    };
  });
}

interface NestedValidationResult {
  readonly unavailableFieldGroups: readonly string[];
  readonly hasUnavailableEvidence: boolean;
}

function validateNestedContractValues(value: unknown, path: string, sourceRefs: ReadonlySet<string>): NestedValidationResult {
  const unavailableFieldGroups: string[] = [];
  let hasUnavailableEvidence = false;
  const recursionStack = new Set<object>();

  const walk = (current: unknown, currentPath: string): void => {
    if (typeof current === 'number' && !Number.isFinite(current)) {
      fail('invalid_response', currentPath, 'numbers must be finite');
    }
    if (Array.isArray(current)) {
      if (recursionStack.has(current)) fail('invalid_response', currentPath, 'must not contain a cycle');
      recursionStack.add(current);
      try {
        current.forEach((entry, index) => walk(entry, `${currentPath}/${index}`));
      } finally {
        recursionStack.delete(current);
      }
      return;
    }
    if (!isRecord(current)) return;
    if (recursionStack.has(current)) fail('invalid_response', currentPath, 'must not contain a cycle');
    recursionStack.add(current);
    try {
      if ('availability' in current) {
        const availability = current.availability;
        if (availability === 'available') {
          expectExactKeys(current, ['availability', 'value', 'sourceRefs'], currentPath);
          if (current.value === null) fail('invalid_response', `${currentPath}/value`, 'available evidence must have a value');
          const refs = expectArray(current.sourceRefs, `${currentPath}/sourceRefs`);
          if (refs.length === 0) fail('invalid_response', `${currentPath}/sourceRefs`, 'available evidence must cite a source');
          const evidenceRefs = new Set<string>();
          refs.forEach((reference, index) => {
            const sourceRef = expectNonEmptyString(reference, `${currentPath}/sourceRefs/${index}`);
            if (!sourceRefs.has(sourceRef)) fail('invalid_response', `${currentPath}/sourceRefs/${index}`, 'must reference a declared source');
            if (evidenceRefs.has(sourceRef)) fail('invalid_response', `${currentPath}/sourceRefs/${index}`, 'must not repeat a source reference');
            evidenceRefs.add(sourceRef);
          });
          walk(current.value, `${currentPath}/value`);
          return;
        }
        if (availability === 'unavailable') {
          expectExactKeys(current, ['availability', 'value', 'reason', 'sourceRefs'], currentPath);
          if (current.value !== null) fail('invalid_response', `${currentPath}/value`, 'unavailable evidence must use null');
          expectNonEmptyString(current.reason, `${currentPath}/reason`);
          const refs = expectArray(current.sourceRefs, `${currentPath}/sourceRefs`);
          const evidenceRefs = new Set<string>();
          refs.forEach((reference, index) => {
            const sourceRef = expectNonEmptyString(reference, `${currentPath}/sourceRefs/${index}`);
            if (!sourceRefs.has(sourceRef)) fail('invalid_response', `${currentPath}/sourceRefs/${index}`, 'must reference a declared source');
            if (evidenceRefs.has(sourceRef)) fail('invalid_response', `${currentPath}/sourceRefs/${index}`, 'must not repeat a source reference');
            evidenceRefs.add(sourceRef);
          });
          unavailableFieldGroups.push(currentPath);
          hasUnavailableEvidence = true;
          return;
        }
        fail('invalid_response', `${currentPath}/availability`, 'must be available or unavailable');
      }

      for (const [key, nested] of Object.entries(current)) {
        const nestedPath = `${currentPath}/${escapePointerToken(key)}`;
        if ((TIMESTAMP_FIELD_NAMES.has(key) || key.endsWith('At')) && nested !== null) {
          expectCanonicalTimestamp(nested, nestedPath);
        }
        if (CALENDAR_DATE_FIELD_NAMES.has(key) && nested !== null) expectCanonicalCalendarDate(nested, nestedPath);
        walk(nested, nestedPath);
      }
    } finally {
      recursionStack.delete(current);
    }
  };

  walk(value, path);
  return { unavailableFieldGroups, hasUnavailableEvidence };
}

function deriveEffectiveAt(sources: readonly SourceAttribution[]): string | null {
  if (sources.length === 0) return null;
  const effectiveAt = sources[0].effectiveAt;
  if (effectiveAt === null) return null;
  return sources.every((source) => source.effectiveAt === effectiveAt) ? effectiveAt : null;
}

function validateFreshnessWarnings(
  revisions: UiDataContractV1Envelope<UiDataContractV1Method, unknown, unknown>['revisions'],
  freshness: UiDataContractV1Envelope<UiDataContractV1Method, unknown, unknown>['freshness'],
  warnings: readonly DataWarning[],
): void {
  const domains: ReadonlyArray<readonly [string | null, readonly (string | null)[]]> = [
    [revisions.catalog, [freshness.catalogObservedAt]],
    [revisions.runtimeObservationSet, [freshness.runtimeObservedAt]],
    [revisions.benchmark, [freshness.benchmarkReleasedAt, freshness.benchmarkCheckedAt]],
  ];
  for (const [revision, timestamps] of domains) {
    if (revision === null) {
      if (timestamps.some((timestamp) => timestamp !== null)) {
        fail('invalid_response', '$/freshness', 'must be null for an inapplicable revision domain');
      }
      continue;
    }
    if (timestamps.some((timestamp) => timestamp === null) && warnings.length === 0) {
      fail('invalid_response', '$/freshness', 'missing applicable freshness requires a warning');
    }
  }
}

function validateMethodDomainApplicability(
  method: UiDataContractV1Method,
  revisions: UiDataContractV1Envelope<UiDataContractV1Method, unknown, unknown>['revisions'],
  freshness: UiDataContractV1Envelope<UiDataContractV1Method, unknown, unknown>['freshness'],
): void {
  if (method !== 'subscription') return;
  if (revisions.benchmark !== null) {
    fail('invalid_response', '$/revisions/benchmark', 'must be null for subscription');
  }
  if (freshness.benchmarkReleasedAt !== null || freshness.benchmarkCheckedAt !== null) {
    fail('invalid_response', '$/freshness', 'benchmark freshness must be null for subscription');
  }
}

export function buildUiDataContractV1Envelope<M extends UiDataContractV1Method, R, D>(
  input: UiDataContractV1EnvelopeInput<M, R, D>,
): UiDataContractV1Envelope<M, R, D> {
  const sources = [...input.sources];
  const envelope: UiDataContractV1Envelope<M, R, D> = {
    contractVersion: 'ui-data-contract/v1',
    method: input.method,
    request: input.request,
    status: input.status,
    reason: input.reason,
    fetchedAt: input.fetchedAt,
    effectiveAt: deriveEffectiveAt(sources),
    data: input.data,
    revisions: input.revisions,
    freshness: input.freshness,
    sources,
    warnings: [...input.warnings],
    provenance: sources.map((source) => ({
      sourceRef: source.sourceRef,
      label: source.label,
      effectiveAt: source.effectiveAt,
      note: `${source.label} source revision ${source.sourceRevision}.`,
    })),
  };
  return validateUiDataContractV1EnvelopeCore(envelope, input.method) as UiDataContractV1Envelope<M, R, D>;
}

export function validateUiDataContractV1EnvelopeCore(
  candidate: unknown,
  expectedMethod?: UiDataContractV1Method,
): UiDataContractV1Envelope<UiDataContractV1Method, unknown, unknown> {
  const envelope = expectRecord(candidate, '$');
  if (envelope.contractVersion !== 'ui-data-contract/v1') {
    fail('unsupported_contract_version', '$/contractVersion', 'must be ui-data-contract/v1');
  }
  expectExactKeys(envelope, ENVELOPE_KEYS, '$');
  if (!METHODS.has(envelope.method as UiDataContractV1Method)) {
    fail('invalid_response', '$/method', 'must be a declared contract method');
  }
  const method = envelope.method as UiDataContractV1Method;
  if (expectedMethod !== undefined && method !== expectedMethod) {
    fail('method_mismatch', '$/method', `must match ${expectedMethod}`);
  }
  validateGenericPublicBoundary(envelope.request, '$/request');
  validateGenericPublicBoundary(envelope.data, '$/data');
  expectCanonicalTimestamp(envelope.fetchedAt, '$/fetchedAt');
  const effectiveAt = expectCanonicalTimestamp(envelope.effectiveAt, '$/effectiveAt', true);
  const revisions = validateRevisions(envelope.revisions);
  const freshness = validateFreshness(envelope.freshness);
  const sources = validateSources(envelope.sources);
  const warnings = validateWarnings(envelope.warnings);
  validateProvenance(envelope.provenance, sources);
  validateMethodDomainApplicability(method, revisions, freshness);
  validateFreshnessWarnings(revisions, freshness, warnings);

  if (envelope.status !== 'available' && envelope.status !== 'partial' && envelope.status !== 'unavailable') {
    fail('invalid_response', '$/status', 'must be available, partial, or unavailable');
  }
  if (envelope.status === 'unavailable') {
    expectNonEmptyString(envelope.reason, '$/reason');
    if (envelope.data !== null) fail('invalid_response', '$/data', 'must be null when unavailable');
    if (effectiveAt !== null) fail('invalid_response', '$/effectiveAt', 'must be null when unavailable');
    return envelope as unknown as UiDataContractV1Envelope<UiDataContractV1Method, unknown, unknown>;
  }
  if (envelope.reason !== null) fail('invalid_response', '$/reason', 'must be null when data is available');
  if (!isRecord(envelope.data)) fail('invalid_response', '$/data', 'must be a non-null object when available or partial');
  if (sources.length === 0) fail('invalid_response', '$/sources', 'must contain a source when available or partial');
  if (effectiveAt !== deriveEffectiveAt(sources)) {
    fail('invalid_response', '$/effectiveAt', 'must aggregate every source effective time');
  }
  const nested = validateNestedContractValues(envelope.data, '/data', new Set(sources.map((source) => source.sourceRef)));
  for (const fieldGroup of nested.unavailableFieldGroups) {
    if (!warnings.some((warning) => warning.fieldGroup === fieldGroup)) {
      fail('invalid_response', fieldGroup, 'unavailable evidence requires a matching warning');
    }
  }
  if (envelope.status === 'available') {
    if (warnings.length > 0 || nested.hasUnavailableEvidence) {
      fail('invalid_response', '$/status', 'available data cannot contain warnings or unavailable evidence');
    }
  } else if (warnings.length === 0 && !nested.hasUnavailableEvidence) {
    fail('invalid_response', '$/status', 'partial data requires a warning or unavailable evidence');
  }
  return envelope as unknown as UiDataContractV1Envelope<UiDataContractV1Method, unknown, unknown>;
}

export function decodeBoundedJson(bytes: Uint8Array, maximumBytes = 65_536): unknown {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    fail('invalid_request', '$', 'maximum body size must be a non-negative safe integer');
  }
  if (bytes.byteLength > maximumBytes) fail('invalid_request', '$', `body exceeds ${maximumBytes} bytes`);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return fail('invalid_request', '$', 'body must be valid JSON');
  }
}
