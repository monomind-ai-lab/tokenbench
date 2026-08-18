import Ajv2020 from 'ajv/dist/2020';
import acceptedMetaSchema from '../../../contracts/ui-data-contract/v1/meta-schema.json';
import acceptedSchema from '../../../contracts/ui-data-contract/v1/schema.json';
import type { PreviewDataAdapter } from './contracts';

export type UiDataContractV1Method = keyof Pick<
  PreviewDataAdapter,
  'models' | 'profile' | 'lifecycle' | 'rankings' | 'comparison' | 'subscription'
>;

type JsonRecord = Record<string, unknown>;

interface JsonSchema extends JsonRecord {
  readonly $id: string;
}

export interface AcceptedSourceAttribution {
  readonly effectiveAt: string | null;
  readonly fieldGroup: string;
  readonly label: string;
  readonly licenseId: string;
  readonly observedAt: string;
  readonly sourceId: string;
  readonly sourceRef: string;
  readonly sourceRevision: string;
  readonly url: string;
}

export interface AcceptedProvenance {
  readonly effectiveAt: string | null;
  readonly label: string;
  readonly note: string;
  readonly sourceRef: string;
}

export interface AcceptedUiDataContractV1<M extends UiDataContractV1Method = UiDataContractV1Method> {
  readonly contractVersion: 'ui-data-contract/v1';
  readonly method: M;
  readonly request: JsonRecord;
  readonly status: 'available' | 'partial' | 'unavailable';
  readonly reason: string | null;
  readonly fetchedAt: string;
  readonly effectiveAt: string | null;
  readonly data: JsonRecord | null;
  readonly revisions: JsonRecord;
  readonly freshness: JsonRecord;
  readonly sources: readonly AcceptedSourceAttribution[];
  readonly warnings: readonly JsonRecord[];
  readonly provenance: readonly AcceptedProvenance[];
}

export type AcceptedContractRejectionCode = 'invalid_timestamp' | 'unsupported_contract_version';

export class AcceptedContractRejection extends TypeError {
  readonly code: AcceptedContractRejectionCode;

  constructor(code: AcceptedContractRejectionCode, message: string) {
    super(message);
    this.name = 'AcceptedContractRejection';
    this.code = code;
  }
}

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const acceptedContractSchema = acceptedSchema as JsonSchema;
const acceptedContractMetaSchema = acceptedMetaSchema as JsonSchema;
const acceptedContractAjv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, validateFormats: true });

acceptedContractAjv.addFormat('date-time', { type: 'string', validate: isStrictUtcTimestamp });
acceptedContractAjv.addFormat('date', { type: 'string', validate: isStrictCalendarDate });
acceptedContractAjv.addMetaSchema(acceptedContractMetaSchema);
acceptedContractAjv.addSchema(acceptedContractSchema);

function fail(path: string, message: string): never {
  throw new TypeError(`${path} ${message}`);
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail(path, 'must be an object');
  return value as JsonRecord;
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) return fail(path, 'must be an array');
  return value;
}

function string(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) return fail(path, 'must be a non-empty string');
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  return value === null ? null : string(value, path);
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(path, 'must be a finite number');
  return value;
}

function exactKeys(value: JsonRecord, path: string, required: readonly string[]): void {
  for (const key of required) if (!(key in value)) fail(path, `is missing required field ${key}`);
  const allowed = new Set(required);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(path, `contains undeclared field ${key}`);
}

/** Strict predicate shared with the published JSON Schema test boundary. */
export function isStrictUtcTimestamp(value: string): boolean {
  if (!UTC_TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  const [calendarDate, clock] = value.split('T');
  const [year, month, day] = calendarDate.split('-').map(Number);
  const [hour, minute, secondWithFraction] = clock.slice(0, -1).split(':');
  const second = Number(secondWithFraction.split('.')[0]);
  return Number.isFinite(parsed.getTime())
    && parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    && parsed.getUTCHours() === Number(hour)
    && parsed.getUTCMinutes() === Number(minute)
    && parsed.getUTCSeconds() === second;
}

/** Strict predicate shared with the published JSON Schema test boundary. */
export function isStrictCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  const [year, month, day] = value.split('-').map(Number);
  return Number.isFinite(parsed.getTime())
    && parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function utcTimestamp(value: unknown, path: string): string {
  if (typeof value !== 'string' || !isStrictUtcTimestamp(value)) {
    throw new AcceptedContractRejection('invalid_timestamp', `${path} must be a UTC ISO-8601 timestamp ending in Z`);
  }
  return value;
}

function nullableUtcTimestamp(value: unknown, path: string): string | null {
  return value === null ? null : utcTimestamp(value, path);
}

function source(value: unknown, path: string): AcceptedSourceAttribution {
  const item = record(value, path);
  exactKeys(item, path, ['effectiveAt', 'fieldGroup', 'label', 'licenseId', 'observedAt', 'sourceId', 'sourceRef', 'sourceRevision', 'url']);
  return {
    effectiveAt: nullableUtcTimestamp(item.effectiveAt, `${path}.effectiveAt`),
    fieldGroup: string(item.fieldGroup, `${path}.fieldGroup`),
    label: string(item.label, `${path}.label`),
    licenseId: string(item.licenseId, `${path}.licenseId`),
    observedAt: utcTimestamp(item.observedAt, `${path}.observedAt`),
    sourceId: string(item.sourceId, `${path}.sourceId`),
    sourceRef: string(item.sourceRef, `${path}.sourceRef`),
    sourceRevision: string(item.sourceRevision, `${path}.sourceRevision`),
    url: string(item.url, `${path}.url`),
  };
}

function provenance(value: unknown, path: string): AcceptedProvenance {
  const item = record(value, path);
  exactKeys(item, path, ['effectiveAt', 'label', 'note', 'sourceRef']);
  return {
    effectiveAt: nullableUtcTimestamp(item.effectiveAt, `${path}.effectiveAt`),
    label: string(item.label, `${path}.label`),
    note: string(item.note, `${path}.note`),
    sourceRef: string(item.sourceRef, `${path}.sourceRef`),
  };
}

function validateMethodData(method: UiDataContractV1Method, value: JsonRecord): void {
  switch (method) {
    case 'models':
      array(value.models, 'data.models');
      finiteNumber(value.total, 'data.total');
      return;
    case 'profile':
      record(value.model, 'data.model');
      return;
    case 'lifecycle':
      utcTimestamp(value.asOf, 'data.asOf');
      finiteNumber(value.horizonDays, 'data.horizonDays');
      array(value.models, 'data.models');
      return;
    case 'rankings':
      if (value.operation !== 'leaderboard' && value.operation !== 'custom') fail('data.operation', 'must be leaderboard or custom');
      array(value.rows, 'data.rows');
      return;
    case 'comparison': {
      const requested = array(value.requestedModelSlugs, 'data.requestedModelSlugs');
      if (requested.length < 2 || requested.length > 4) fail('data.requestedModelSlugs', 'must contain 2 to 4 ordered slugs');
      if (new Set(requested.map((slug, index) => string(slug, `data.requestedModelSlugs[${index}]`))).size !== requested.length) {
        fail('data.requestedModelSlugs', 'must contain distinct slugs');
      }
      array(value.models, 'data.models');
      return;
    }
    case 'subscription':
      if (value.operation !== 'catalog' && value.operation !== 'calculate') fail('data.operation', 'must be catalog or calculate');
      array(value.plans, 'data.plans');
      array(value.routes, 'data.routes');
      return;
  }
}

function validateAcceptedSchema(candidate: unknown, method: UiDataContractV1Method): void {
  const validate = acceptedContractAjv.getSchema(`${acceptedContractSchema.$id}#/$defs/${method}Envelope`);
  if (!validate) return fail('accepted contract schema', `does not define ${method}`);
  if (!validate(candidate)) return fail('UI data contract envelope', `does not satisfy the accepted ${method} schema`);
}

/**
 * Validates the accepted producer envelope before an adapter can map it into a
 * page model. It deliberately returns the producer shape unchanged; mapping is
 * owned by the gateway boundary, never by React pages.
 */
export function parseUiDataContractV1<M extends UiDataContractV1Method>(
  candidate: unknown,
  expectedMethod: M,
): AcceptedUiDataContractV1<M> {
  const envelope = record(candidate, 'UI data contract envelope');
  exactKeys(envelope, 'UI data contract envelope', [
    'contractVersion', 'method', 'request', 'status', 'reason', 'fetchedAt', 'effectiveAt', 'data',
    'revisions', 'freshness', 'sources', 'warnings', 'provenance',
  ]);
  if (envelope.contractVersion !== 'ui-data-contract/v1') {
    throw new AcceptedContractRejection('unsupported_contract_version', 'Unsupported UI data contract version');
  }
  if (envelope.method !== expectedMethod) fail('method', `must be ${expectedMethod}`);
  const status = envelope.status;
  if (status !== 'available' && status !== 'partial' && status !== 'unavailable') {
    fail('status', 'must be available, partial, or unavailable');
  }
  const reason = nullableString(envelope.reason, 'reason');
  const fetchedAt = utcTimestamp(envelope.fetchedAt, 'fetchedAt');
  const effectiveAt = nullableUtcTimestamp(envelope.effectiveAt, 'effectiveAt');
  const request = record(envelope.request, 'request');
  const revisions = record(envelope.revisions, 'revisions');
  const freshness = record(envelope.freshness, 'freshness');
  for (const [key, value] of Object.entries(freshness)) {
    if (value !== null) utcTimestamp(value, `freshness.${key}`);
  }
  const sources = array(envelope.sources, 'sources').map((item, index) => source(item, `sources[${index}]`));
  const warnings = array(envelope.warnings, 'warnings').map((item, index) => record(item, `warnings[${index}]`));
  const acceptedProvenance = array(envelope.provenance, 'provenance').map((item, index) => provenance(item, `provenance[${index}]`));

  if (status === 'unavailable') {
    if (reason === null) fail('reason', 'must be present when status is unavailable');
    if (effectiveAt !== null) fail('effectiveAt', 'must be null when status is unavailable');
    if (envelope.data !== null) fail('data', 'must be null when status is unavailable');
  } else {
    if (reason !== null) fail('reason', 'must be null when status is available or partial');
    if (sources.length === 0) fail('sources', 'must be non-empty when data is available');
    validateMethodData(expectedMethod, record(envelope.data, 'data'));
  }
  validateAcceptedSchema(candidate, expectedMethod);

  return {
    contractVersion: 'ui-data-contract/v1',
    method: expectedMethod,
    request,
    status,
    reason,
    fetchedAt,
    effectiveAt,
    data: envelope.data as JsonRecord | null,
    revisions,
    freshness,
    sources,
    warnings,
    provenance: acceptedProvenance,
  };
}
