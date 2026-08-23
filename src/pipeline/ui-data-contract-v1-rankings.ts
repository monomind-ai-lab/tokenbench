import {
  decodeBoundedJson,
  UiDataContractValidationError,
  type EvidenceValue,
  type SourceAttribution,
} from './ui-data-contract-v1-core';
import {
  validateModelMethodData,
  type ModelSummary,
  type TaskFact,
} from './ui-data-contract-v1-models';

export interface LeaderboardRankingsRequest {
  readonly operation: 'leaderboard';
  readonly releaseId: string | null;
  readonly filters: {
    readonly organizationIds: readonly string[];
    readonly openWeights: 'all' | 'only' | 'exclude';
    readonly excludeDerivativeFinetunes: boolean;
  };
  readonly limit: number;
  readonly cursor: string | null;
}

export interface CustomRankingsRequest {
  readonly operation: 'custom';
  readonly dimensionSetRevision: string;
  readonly weights: Readonly<Record<string, number>>;
  readonly filters: {
    readonly access: 'all' | 'proprietary' | 'open_weights';
    readonly providerIds: readonly string[];
    readonly excludeDerivativeFinetunes: boolean;
    readonly requiredInputModalities: readonly InputModality[];
    readonly maxInputMicroDollarsPerMillion: number | null;
    readonly maxOutputMicroDollarsPerMillion: number | null;
    readonly minTpsP50: number | null;
    readonly maxTtftP50Ms: number | null;
    readonly minContextWindowTokens: number | null;
    readonly minMaxOutputTokens: number | null;
  };
  readonly includeIneligible: boolean;
  readonly limit: number;
}

export type RankingsRequest = LeaderboardRankingsRequest | CustomRankingsRequest;

export type InputModality = 'text' | 'image' | 'audio' | 'video' | 'file';

export interface RankingDimension {
  readonly dimensionId: string;
  readonly label: string;
  readonly kind: 'benchmark' | 'cost' | 'ttft' | 'tps';
  readonly unit: 'score' | 'micro_dollars_per_million' | 'milliseconds' | 'tokens_per_second';
  readonly utilityAnchor: {
    readonly best: number;
    readonly worst: number;
    readonly transform: 'identity' | 'log' | 'log_inverse';
  } | null;
}

export interface RankingDimensionSet {
  readonly revision: string;
  readonly transformationVersion: string;
  readonly dimensions: readonly RankingDimension[];
}

export interface RankingDimensionResult {
  readonly dimensionId: string;
  readonly rawValue: EvidenceValue<number>;
  readonly utility: number | null;
  readonly contribution: number | null;
}

export interface RankingRow {
  readonly model: ModelSummary;
  readonly dimensions: readonly RankingDimensionResult[];
  readonly total: number | null;
  readonly rank: number | null;
  readonly pareto: boolean | null;
  readonly eligible: boolean;
  readonly ineligibilityReasons: readonly string[];
}

export interface CustomRankingCandidate {
  readonly model: ModelSummary;
  readonly values: Readonly<Record<string, EvidenceValue<number>>>;
}

export interface CustomRankingsData {
  readonly operation: 'custom';
  readonly dimensionSet: RankingDimensionSet;
  readonly submittedWeights: Readonly<Record<string, number>>;
  readonly normalizedWeights: Readonly<Record<string, number>>;
  readonly rows: readonly RankingRow[];
  readonly totalEligible: number;
  readonly totalIneligible: number;
  readonly truncated: boolean;
}

export interface LeaderboardTaxonomyCategory {
  readonly categoryId: string;
  readonly label: string;
  readonly tasks: readonly { readonly taskId: string; readonly label: string }[];
}

export interface LeaderboardRow {
  readonly sourceRank: number;
  readonly model: ModelSummary;
  readonly taskEconomics: readonly TaskFact[];
  readonly costPerSuccessfulEvaluationUsd: EvidenceValue<number>;
  readonly meanOutputTokens: EvidenceValue<number>;
  readonly pareto: boolean;
}

export interface LeaderboardRankingsData {
  readonly operation: 'leaderboard';
  readonly release: {
    readonly releaseId: string;
    readonly releaseOn: string;
    readonly licenseId: 'Apache-2.0';
    readonly sourceRefs: readonly string[];
  };
  readonly taxonomy: readonly LeaderboardTaxonomyCategory[];
  readonly rows: readonly LeaderboardRow[];
  readonly total: number;
  readonly nextCursor: string | null;
}

export type RankingsData = LeaderboardRankingsData | CustomRankingsData;

export interface CustomRankingsValidationAuthority {
  readonly operation: 'custom';
  readonly dimensionSet: RankingDimensionSet;
  readonly expectedTotalEligible: number;
  readonly expectedTotalIneligible: number;
}

export interface LeaderboardRankingsValidationAuthority {
  readonly operation: 'leaderboard';
  readonly resolvedReleaseId: string;
  readonly taxonomy: readonly LeaderboardTaxonomyCategory[];
  readonly authoritativeReleaseSourceRef: string;
  readonly expectedFilteredTotal: number;
  readonly expectedOrderedPageModelSlugs: readonly string[];
  readonly expectedNextCursor: string | null;
}

export type RankingsValidationAuthority =
  | CustomRankingsValidationAuthority
  | LeaderboardRankingsValidationAuthority;

type UnknownRecord = Record<string, unknown>;

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const CURSOR = /^[A-Za-z0-9_-]{1,1024}$/u;
const ACCESS_VALUES = new Set<CustomRankingsRequest['filters']['access']>(['all', 'proprietary', 'open_weights']);
const OPEN_WEIGHTS_VALUES = new Set<LeaderboardRankingsRequest['filters']['openWeights']>(['all', 'only', 'exclude']);
const MODALITIES = new Set<InputModality>(['text', 'image', 'audio', 'video', 'file']);
const DIMENSION_KINDS: Readonly<Record<RankingDimension['kind'], RankingDimension['unit']>> = {
  benchmark: 'score',
  cost: 'micro_dollars_per_million',
  ttft: 'milliseconds',
  tps: 'tokens_per_second',
};
const DIMENSION_TRANSFORMS: Readonly<Record<RankingDimension['kind'], NonNullable<RankingDimension['utilityAnchor']>['transform']>> = {
  benchmark: 'identity',
  cost: 'log_inverse',
  ttft: 'log_inverse',
  tps: 'log',
};

function failRequest(path: string, message: string): never {
  throw new UiDataContractValidationError('invalid_request', path, message);
}

function failResponse(path: string, message: string, code: 'invalid_response' | 'undeclared_field' = 'invalid_response'): never {
  throw new UiDataContractValidationError(code, path, message);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, path: string, request: boolean): UnknownRecord {
  if (!isRecord(value)) {
    if (request) failRequest(path, 'must be an object');
    failResponse(path, 'must be an object');
  }
  return value;
}

function expectArray(value: unknown, path: string, request: boolean): unknown[] {
  if (!Array.isArray(value)) {
    if (request) failRequest(path, 'must be an array');
    failResponse(path, 'must be an array');
  }
  return value;
}

function expectExactKeys(record: UnknownRecord, keys: readonly string[], path: string, request: boolean): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      if (request) failRequest(`${path}/${key}`, 'is not declared by this request');
      failResponse(`${path}/${key}`, 'is not declared by this response', 'undeclared_field');
    }
  }
  for (const key of keys) {
    if (!(key in record)) {
      if (request) failRequest(`${path}/${key}`, 'is required');
      failResponse(`${path}/${key}`, 'is required');
    }
  }
}

function expectString(value: unknown, path: string, request: boolean, maximumLength?: number): string {
  const hasValidLength = typeof value === 'string'
    && (maximumLength === undefined || Array.from(value).length <= maximumLength);
  if (typeof value !== 'string' || !/\S/u.test(value) || !hasValidLength || CONTROL_CHARACTER.test(value)) {
    const lengthRequirement = maximumLength === undefined
      ? 'a non-empty control-free string'
      : `a non-empty control-free string of at most ${maximumLength} Unicode code points`;
    if (request) failRequest(path, `must be ${lengthRequirement}`);
    failResponse(path, `must be ${lengthRequirement}`);
  }
  return value;
}

function expectIdentifier(value: unknown, path: string, request: boolean, maximumLength = 256): string {
  return expectString(value, path, request, maximumLength);
}

function expectFinite(value: unknown, path: string, request: boolean, minimum: number, maximum = Number.MAX_VALUE): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    if (request) failRequest(path, `must be a finite number from ${minimum} through ${maximum}`);
    failResponse(path, `must be a finite number from ${minimum} through ${maximum}`);
  }
  return value;
}

function expectSafeInteger(value: unknown, path: string, request: boolean, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    if (request) failRequest(path, `must be a safe integer from ${minimum} through ${maximum}`);
    failResponse(path, `must be a safe integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function expectNullableFinite(value: unknown, path: string, request: boolean, minimum: number, maximum = Number.MAX_VALUE): number | null {
  if (value === null) return null;
  return expectFinite(value, path, request, minimum, maximum);
}

function expectNullableSafeInteger(
  value: unknown,
  path: string,
  request: boolean,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number | null {
  if (value === null) return null;
  return expectSafeInteger(value, path, request, minimum, maximum);
}

function expectCursor(value: unknown, path: string, request: boolean): string | null {
  if (value === null) return null;
  const cursor = expectString(value, path, request, 1_024);
  if (!CURSOR.test(cursor)) {
    if (request) failRequest(path, 'must be a base64url string of at most 1024 characters');
    failResponse(path, 'must be a base64url string of at most 1024 characters');
  }
  return cursor;
}

function expectUnique(values: readonly string[], path: string, request: boolean): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      if (request) failRequest(`${path}/${index}`, 'must not repeat a value');
      failResponse(`${path}/${index}`, 'must not repeat a value');
    }
    seen.add(value);
  }
}

function canonicalRecord(values: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return Object.fromEntries(Object.keys(values).sort(compareUtf8Binary).map((key) => [key, values[key]!]));
}

function compareUtf8Binary(left: string, right: string): number {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  for (let index = 0; index < Math.min(leftBytes.length, rightBytes.length); index += 1) {
    const difference = leftBytes[index]! - rightBytes[index]!;
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameJsonValue(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort(compareUtf8Binary);
  const rightKeys = Object.keys(right).sort(compareUtf8Binary);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(left[key], right[key]));
}

function isCanonicalCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day;
}

function validateDimensionSet(value: unknown, path: string, request: boolean): RankingDimensionSet {
  const set = expectRecord(value, path, request);
  expectExactKeys(set, ['revision', 'transformationVersion', 'dimensions'], path, request);
  const dimensions = expectArray(set.dimensions, `${path}/dimensions`, request);
  if (dimensions.length < 1 || dimensions.length > 32) {
    if (request) failRequest(`${path}/dimensions`, 'must contain one through 32 dimensions');
    failResponse(`${path}/dimensions`, 'must contain one through 32 dimensions');
  }
  const normalized = dimensions.map((value, index): RankingDimension => {
    const dimensionPath = `${path}/dimensions/${index}`;
    const dimension = expectRecord(value, dimensionPath, request);
    expectExactKeys(dimension, ['dimensionId', 'label', 'kind', 'unit', 'utilityAnchor'], dimensionPath, request);
    if (typeof dimension.kind !== 'string' || !(dimension.kind in DIMENSION_KINDS)) {
      if (request) failRequest(`${dimensionPath}/kind`, 'must be a declared ranking dimension kind');
      failResponse(`${dimensionPath}/kind`, 'must be a declared ranking dimension kind');
    }
    const kind = dimension.kind as RankingDimension['kind'];
    if (dimension.unit !== DIMENSION_KINDS[kind]) {
      if (request) failRequest(`${dimensionPath}/unit`, 'must match the ranking dimension kind');
      failResponse(`${dimensionPath}/unit`, 'must match the ranking dimension kind');
    }
    const anchor = expectRecord(dimension.utilityAnchor, `${dimensionPath}/utilityAnchor`, request);
    expectExactKeys(anchor, ['best', 'worst', 'transform'], `${dimensionPath}/utilityAnchor`, request);
    if (anchor.transform !== DIMENSION_TRANSFORMS[kind]) {
      if (request) failRequest(`${dimensionPath}/utilityAnchor/transform`, 'must be the fixed transform for this dimension kind');
      failResponse(`${dimensionPath}/utilityAnchor/transform`, 'must be the fixed transform for this dimension kind');
    }
    const anchorValue = (candidate: unknown, candidatePath: string): number => {
      if (kind === 'benchmark') return expectFinite(candidate, candidatePath, request, 0, 100);
      if (kind === 'cost') return expectSafeInteger(candidate, candidatePath, request, 0);
      if (kind === 'ttft') return expectSafeInteger(candidate, candidatePath, request, 0, 86_400_000);
      return expectFinite(candidate, candidatePath, request, 0, 1_000_000);
    };
    const best = anchorValue(anchor.best, `${dimensionPath}/utilityAnchor/best`);
    const worst = anchorValue(anchor.worst, `${dimensionPath}/utilityAnchor/worst`);
    const transform = anchor.transform as NonNullable<RankingDimension['utilityAnchor']>['transform'];
    const higherIsBetter = transform === 'identity' || transform === 'log';
    if ((higherIsBetter && best <= worst) || (!higherIsBetter && best >= worst) || (transform !== 'identity' && (best <= 0 || worst <= 0))) {
      if (request) failRequest(`${dimensionPath}/utilityAnchor`, 'must provide distinct operational utility bounds');
      failResponse(`${dimensionPath}/utilityAnchor`, 'must provide distinct operational utility bounds');
    }
    return {
      dimensionId: expectIdentifier(dimension.dimensionId, `${dimensionPath}/dimensionId`, request),
      label: expectString(dimension.label, `${dimensionPath}/label`, request),
      kind,
      unit: dimension.unit as RankingDimension['unit'],
      utilityAnchor: { best, worst, transform },
    };
  });
  expectUnique(normalized.map((dimension) => dimension.dimensionId), `${path}/dimensions`, request);
  return {
    revision: expectIdentifier(set.revision, `${path}/revision`, request),
    transformationVersion: expectIdentifier(set.transformationVersion, `${path}/transformationVersion`, request),
    dimensions: normalized,
  };
}

function normalizeLeaderboardRequest(value: unknown): LeaderboardRankingsRequest {
  const request = expectRecord(value, '$/request', true);
  expectExactKeys(request, ['operation', 'releaseId', 'filters', 'limit', 'cursor'], '$/request', true);
  if (request.operation !== 'leaderboard') failRequest('$/request/operation', 'must be leaderboard');
  if (request.releaseId !== null) expectIdentifier(request.releaseId, '$/request/releaseId', true);
  const filters = expectRecord(request.filters, '$/request/filters', true);
  expectExactKeys(filters, ['organizationIds', 'openWeights', 'excludeDerivativeFinetunes'], '$/request/filters', true);
  const organizationIds = expectArray(filters.organizationIds, '$/request/filters/organizationIds', true).map((value, index) => (
    expectIdentifier(value, `$/request/filters/organizationIds/${index}`, true)
  ));
  if (organizationIds.length > 64) failRequest('$/request/filters/organizationIds', 'must contain at most 64 organization IDs');
  expectUnique(organizationIds, '$/request/filters/organizationIds', true);
  if (!OPEN_WEIGHTS_VALUES.has(filters.openWeights as LeaderboardRankingsRequest['filters']['openWeights'])) {
    failRequest('$/request/filters/openWeights', 'must be all, only, or exclude');
  }
  if (typeof filters.excludeDerivativeFinetunes !== 'boolean') {
    failRequest('$/request/filters/excludeDerivativeFinetunes', 'must be a boolean');
  }
  return {
    operation: 'leaderboard',
    releaseId: request.releaseId as string | null,
    filters: {
      organizationIds,
      openWeights: filters.openWeights as LeaderboardRankingsRequest['filters']['openWeights'],
      excludeDerivativeFinetunes: filters.excludeDerivativeFinetunes,
    },
    limit: expectSafeInteger(request.limit, '$/request/limit', true, 1, 100),
    cursor: expectCursor(request.cursor, '$/request/cursor', true),
  };
}

function normalizeCustomRequest(value: unknown, dimensionSet: RankingDimensionSet | undefined): CustomRankingsRequest {
  if (dimensionSet === undefined) failRequest('$/request/dimensionSetRevision', 'requires the exact published dimension set');
  const normalizedSet = validateDimensionSet(dimensionSet, '$/dimensionSet', true);
  const request = expectRecord(value, '$/request', true);
  expectExactKeys(request, ['operation', 'dimensionSetRevision', 'weights', 'filters', 'includeIneligible', 'limit'], '$/request', true);
  if (request.operation !== 'custom') failRequest('$/request/operation', 'must be custom');
  const dimensionSetRevision = expectIdentifier(request.dimensionSetRevision, '$/request/dimensionSetRevision', true);
  if (dimensionSetRevision !== normalizedSet.revision) {
    failRequest('$/request/dimensionSetRevision', 'must identify the exact published dimension set');
  }
  const weights = expectRecord(request.weights, '$/request/weights', true);
  const dimensionIds = normalizedSet.dimensions.map((dimension) => dimension.dimensionId);
  expectExactKeys(weights, dimensionIds, '$/request/weights', true);
  const normalizedWeights: Record<string, number> = {};
  for (const dimensionId of dimensionIds) {
    normalizedWeights[dimensionId] = expectFinite(weights[dimensionId], `$/request/weights/${dimensionId}`, true, 0, 100);
  }
  if (!Object.values(normalizedWeights).some((weight) => weight > 0)) {
    failRequest('$/request/weights', 'must contain at least one positive weight');
  }
  const filters = expectRecord(request.filters, '$/request/filters', true);
  expectExactKeys(filters, [
    'access', 'providerIds', 'excludeDerivativeFinetunes', 'requiredInputModalities',
    'maxInputMicroDollarsPerMillion', 'maxOutputMicroDollarsPerMillion', 'minTpsP50',
    'maxTtftP50Ms', 'minContextWindowTokens', 'minMaxOutputTokens',
  ], '$/request/filters', true);
  if (!ACCESS_VALUES.has(filters.access as CustomRankingsRequest['filters']['access'])) {
    failRequest('$/request/filters/access', 'must be all, proprietary, or open_weights');
  }
  const providerIds = expectArray(filters.providerIds, '$/request/filters/providerIds', true).map((value, index) => (
    expectIdentifier(value, `$/request/filters/providerIds/${index}`, true)
  ));
  if (providerIds.length > 64) failRequest('$/request/filters/providerIds', 'must contain at most 64 provider IDs');
  expectUnique(providerIds, '$/request/filters/providerIds', true);
  if (typeof filters.excludeDerivativeFinetunes !== 'boolean') {
    failRequest('$/request/filters/excludeDerivativeFinetunes', 'must be a boolean');
  }
  const requiredInputModalities = expectArray(filters.requiredInputModalities, '$/request/filters/requiredInputModalities', true).map((value, index) => {
    if (!MODALITIES.has(value as InputModality)) {
      failRequest(`$/request/filters/requiredInputModalities/${index}`, 'must be a declared input modality');
    }
    return value as InputModality;
  });
  if (requiredInputModalities.length > MODALITIES.size) {
    failRequest('$/request/filters/requiredInputModalities', 'must contain at most five input modalities');
  }
  expectUnique(requiredInputModalities, '$/request/filters/requiredInputModalities', true);
  if (typeof request.includeIneligible !== 'boolean') failRequest('$/request/includeIneligible', 'must be a boolean');
  return {
    operation: 'custom',
    dimensionSetRevision,
    weights: canonicalRecord(normalizedWeights),
    filters: {
      access: filters.access as CustomRankingsRequest['filters']['access'],
      providerIds,
      excludeDerivativeFinetunes: filters.excludeDerivativeFinetunes,
      requiredInputModalities,
      maxInputMicroDollarsPerMillion: expectNullableSafeInteger(filters.maxInputMicroDollarsPerMillion, '$/request/filters/maxInputMicroDollarsPerMillion', true, 0),
      maxOutputMicroDollarsPerMillion: expectNullableSafeInteger(filters.maxOutputMicroDollarsPerMillion, '$/request/filters/maxOutputMicroDollarsPerMillion', true, 0),
      minTpsP50: expectNullableFinite(filters.minTpsP50, '$/request/filters/minTpsP50', true, 0, 1_000_000),
      maxTtftP50Ms: expectNullableSafeInteger(filters.maxTtftP50Ms, '$/request/filters/maxTtftP50Ms', true, 0, 86_400_000),
      minContextWindowTokens: expectNullableSafeInteger(filters.minContextWindowTokens, '$/request/filters/minContextWindowTokens', true, 1),
      minMaxOutputTokens: expectNullableSafeInteger(filters.minMaxOutputTokens, '$/request/filters/minMaxOutputTokens', true, 1),
    },
    includeIneligible: request.includeIneligible,
    limit: expectSafeInteger(request.limit, '$/request/limit', true, 1, 100),
  };
}

export function normalizeRankingsRequest(value: unknown, dimensionSet?: RankingDimensionSet): RankingsRequest {
  const request = expectRecord(value, '$/request', true);
  if (request.operation === 'leaderboard') return normalizeLeaderboardRequest(value);
  if (request.operation === 'custom') return normalizeCustomRequest(value, dimensionSet);
  failRequest('$/request/operation', 'must be leaderboard or custom');
}

function validateEvidenceNumber(
  value: unknown,
  path: string,
  sourceRefs: ReadonlySet<string>,
  minimum: number,
  maximum = Number.MAX_VALUE,
): EvidenceValue<number> {
  const evidence = expectRecord(value, path, false);
  if (evidence.availability === 'available') {
    expectExactKeys(evidence, ['availability', 'value', 'sourceRefs'], path, false);
    const references = expectArray(evidence.sourceRefs, `${path}/sourceRefs`, false).map((reference, index) => {
      const sourceRef = expectString(reference, `${path}/sourceRefs/${index}`, false);
      if (!sourceRefs.has(sourceRef)) failResponse(`${path}/sourceRefs/${index}`, 'must reference a declared source');
      return sourceRef;
    });
    if (references.length === 0) failResponse(`${path}/sourceRefs`, 'must cite at least one source');
    expectUnique(references, `${path}/sourceRefs`, false);
    return {
      availability: 'available',
      value: expectFinite(evidence.value, `${path}/value`, false, minimum, maximum),
      sourceRefs: references,
    };
  }
  if (evidence.availability === 'unavailable') {
    expectExactKeys(evidence, ['availability', 'value', 'reason', 'sourceRefs'], path, false);
    if (evidence.value !== null) failResponse(`${path}/value`, 'must be null when evidence is unavailable');
    const references = expectArray(evidence.sourceRefs, `${path}/sourceRefs`, false).map((reference, index) => {
      const sourceRef = expectString(reference, `${path}/sourceRefs/${index}`, false);
      if (!sourceRefs.has(sourceRef)) failResponse(`${path}/sourceRefs/${index}`, 'must reference a declared source');
      return sourceRef;
    });
    expectUnique(references, `${path}/sourceRefs`, false);
    return {
      availability: 'unavailable',
      value: null,
      reason: expectString(evidence.reason, `${path}/reason`, false),
      sourceRefs: references,
    };
  }
  failResponse(`${path}/availability`, 'must be available or unavailable');
}

function validateEvidenceSafeInteger(
  value: unknown,
  path: string,
  sourceRefs: ReadonlySet<string>,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): EvidenceValue<number> {
  const evidence = validateEvidenceNumber(value, path, sourceRefs, minimum, maximum);
  if (evidence.availability === 'available' && !Number.isSafeInteger(evidence.value)) {
    failResponse(`${path}/value`, `must be a safe integer from ${minimum} through ${maximum}`);
  }
  return evidence;
}

function validateDimensionRawEvidence(
  value: unknown,
  path: string,
  sourceRefs: ReadonlySet<string>,
  dimension: RankingDimension,
): EvidenceValue<number> {
  const maximum = dimension.kind === 'benchmark'
    ? 100
    : dimension.kind === 'ttft'
      ? 86_400_000
      : dimension.kind === 'tps'
        ? 1_000_000
        : Number.MAX_SAFE_INTEGER;
  const evidence = validateEvidenceNumber(value, path, sourceRefs, 0, maximum);
  if (
    evidence.availability === 'available'
    && (dimension.kind === 'cost' || dimension.kind === 'ttft')
    && !Number.isSafeInteger(evidence.value)
  ) {
    failResponse(`${path}/value`, 'must be a non-negative safe integer for this dimension kind');
  }
  return evidence;
}

function validateModelSummary(value: unknown, sources: readonly SourceAttribution[]): ModelSummary {
  return validateModelMethodData('models', {
    models: [value],
    total: 1,
    nextCursor: null,
  }, {
    search: null,
    access: 'all',
    providerIds: [],
    limit: 1,
    cursor: null,
  }, sources).models[0]!;
}

function validateTaskFact(value: unknown, model: ModelSummary, sources: readonly SourceAttribution[]): TaskFact {
  return validateModelMethodData('profile', {
    model: {
      summary: model,
      releaseOn: '2026-01-01',
      tasks: [value],
      routes: model.selectedRoute === null ? [] : [model.selectedRoute],
      lifecycleEvents: [],
      replacement: { availability: 'unavailable', value: null, reason: 'Not applicable to ranking validation.', sourceRefs: [] },
    },
  }, { slug: model.identity.slug }, sources).model.tasks[0]!;
}

function utilityFor(value: number, dimension: RankingDimension): number {
  const anchor = dimension.utilityAnchor;
  if (anchor === null) throw new TypeError('A ranking dimension requires a utility anchor.');
  let utility: number;
  if (anchor.transform === 'identity') {
    utility = (value - anchor.worst) / (anchor.best - anchor.worst);
  } else if (anchor.transform === 'log') {
    utility = Math.log(value / anchor.worst) / Math.log(anchor.best / anchor.worst);
  } else {
    utility = Math.log(anchor.worst / value) / Math.log(anchor.worst / anchor.best);
  }
  return 100 * Math.min(1, Math.max(0, utility));
}

function candidateEvidence(candidate: CustomRankingCandidate, dimensionId: string): EvidenceValue<number> {
  const evidence = candidate.values[dimensionId];
  if (evidence === undefined) {
    return { availability: 'unavailable', value: null, reason: `No ${dimensionId} value is available.`, sourceRefs: [] };
  }
  if (evidence.availability === 'available' && (typeof evidence.value !== 'number' || !Number.isFinite(evidence.value) || evidence.value < 0)) {
    failRequest(`$/candidates/${candidate.model.identity.slug}/values/${dimensionId}`, 'must be non-negative finite evidence');
  }
  if (evidence.availability !== 'available' && evidence.availability !== 'unavailable') {
    failRequest(`$/candidates/${candidate.model.identity.slug}/values/${dimensionId}`, 'must be available or unavailable evidence');
  }
  return evidence;
}

function matchesCustomFilters(model: ModelSummary, filters: CustomRankingsRequest['filters']): boolean {
  if (filters.excludeDerivativeFinetunes && model.isDerivativeFinetune) return false;
  if (filters.access !== 'all') {
    if (model.openWeights.availability !== 'available') return false;
    if (filters.access === 'open_weights' && !model.openWeights.value) return false;
    if (filters.access === 'proprietary' && model.openWeights.value) return false;
  }
  const route = model.selectedRoute;
  if (filters.providerIds.length > 0 && (route === null || !filters.providerIds.includes(route.providerId))) return false;
  if (filters.requiredInputModalities.some((modality) => route === null || !route.inputModalities.includes(modality))) return false;
  const matchesMaximum = (limit: number | null, evidence: EvidenceValue<number>) => (
    limit === null || (evidence.availability === 'available' && evidence.value <= limit)
  );
  const matchesMinimum = (limit: number | null, evidence: EvidenceValue<number>) => (
    limit === null || (evidence.availability === 'available' && evidence.value >= limit)
  );
  if (filters.maxInputMicroDollarsPerMillion !== null && (route === null || !matchesMaximum(filters.maxInputMicroDollarsPerMillion, route.inputMicroDollarsPerMillion))) return false;
  if (filters.maxOutputMicroDollarsPerMillion !== null && (route === null || !matchesMaximum(filters.maxOutputMicroDollarsPerMillion, route.outputMicroDollarsPerMillion))) return false;
  if (filters.minTpsP50 !== null && (route === null || !matchesMinimum(filters.minTpsP50, route.tpsP50))) return false;
  if (filters.maxTtftP50Ms !== null && (route === null || !matchesMaximum(filters.maxTtftP50Ms, route.ttftP50Ms))) return false;
  if (filters.minContextWindowTokens !== null && (route === null || !matchesMinimum(filters.minContextWindowTokens, route.contextWindowTokens))) return false;
  if (filters.minMaxOutputTokens !== null && (route === null || !matchesMinimum(filters.minMaxOutputTokens, route.maxOutputTokens))) return false;
  return true;
}

function dominates(left: RankingRow, right: RankingRow, positiveDimensionIds: ReadonlySet<string>): boolean {
  if (!left.eligible || !right.eligible) return false;
  let strictlyGreater = false;
  for (const dimensionId of positiveDimensionIds) {
    const leftUtility = left.dimensions.find((dimension) => dimension.dimensionId === dimensionId)?.utility;
    const rightUtility = right.dimensions.find((dimension) => dimension.dimensionId === dimensionId)?.utility;
    if (leftUtility === null || leftUtility === undefined || rightUtility === null || rightUtility === undefined) return false;
    if (leftUtility < rightUtility - 1e-12) return false;
    if (leftUtility > rightUtility + 1e-12) strictlyGreater = true;
  }
  return strictlyGreater;
}

export function buildCustomRankingsData(
  request: CustomRankingsRequest,
  dimensionSet: RankingDimensionSet,
  candidates: readonly CustomRankingCandidate[],
): CustomRankingsData {
  const normalizedSet = validateDimensionSet(dimensionSet, '$/dimensionSet', true);
  const normalizedRequest = normalizeCustomRequest(request, normalizedSet);
  const positiveTotal = Object.values(normalizedRequest.weights).reduce((sum, weight) => sum + (weight > 0 ? weight : 0), 0);
  const normalizedWeights = canonicalRecord(Object.fromEntries(Object.entries(normalizedRequest.weights).map(([dimensionId, weight]) => [
    dimensionId,
    weight > 0 ? weight / positiveTotal : 0,
  ])));
  const rows = candidates
    .filter((candidate) => matchesCustomFilters(candidate.model, normalizedRequest.filters))
    .map((candidate): RankingRow => {
      const evidenceByDimension = normalizedSet.dimensions.map((dimension) => ({
        dimension,
        rawValue: candidateEvidence(candidate, dimension.dimensionId),
      }));
      const missingPositive = evidenceByDimension.filter(({ dimension, rawValue }) => (
        normalizedWeights[dimension.dimensionId]! > 0 && rawValue.availability === 'unavailable'
      ));
      if (missingPositive.length > 0) {
        return {
          model: candidate.model,
          dimensions: evidenceByDimension.map(({ dimension, rawValue }) => ({
            dimensionId: dimension.dimensionId,
            rawValue,
            utility: normalizedWeights[dimension.dimensionId]! > 0
              ? null
              : rawValue.availability === 'available' ? utilityFor(rawValue.value, dimension) : null,
            contribution: normalizedWeights[dimension.dimensionId]! > 0 ? null : 0,
          })),
          total: null,
          rank: null,
          pareto: null,
          eligible: false,
          ineligibilityReasons: missingPositive.map(({ dimension }) => `${dimension.dimensionId} is unavailable for a positive weight.`),
        };
      }
      const dimensions = evidenceByDimension.map(({ dimension, rawValue }): RankingDimensionResult => {
        const utility = rawValue.availability === 'available' ? utilityFor(rawValue.value, dimension) : null;
        return {
          dimensionId: dimension.dimensionId,
          rawValue,
          utility,
          contribution: normalizedWeights[dimension.dimensionId]! === 0 ? 0 : utility! * normalizedWeights[dimension.dimensionId]!,
        };
      });
      return {
        model: candidate.model,
        dimensions,
        total: dimensions.reduce((sum, dimension) => sum + (dimension.contribution ?? 0), 0),
        rank: 0,
        pareto: false,
        eligible: true,
        ineligibilityReasons: [],
      };
    });
  const eligible = rows.filter((row) => row.eligible).sort((left, right) => (
    (right.total ?? 0) - (left.total ?? 0) || compareUtf8Binary(left.model.identity.slug, right.model.identity.slug)
  ));
  const positiveDimensionIds = new Set(Object.entries(normalizedWeights).filter(([, weight]) => weight > 0).map(([dimensionId]) => dimensionId));
  let priorRank = 0;
  const rankedEligible = eligible.map((row, index) => {
    if (index === 0 || Math.abs((row.total ?? 0) - (eligible[index - 1]!.total ?? 0)) > 1e-12) {
      priorRank = index + 1;
    }
    return {
      ...row,
      rank: priorRank,
      pareto: !eligible.some((other) => other !== row && dominates(other, row, positiveDimensionIds)),
    };
  });
  const ineligible = rows.filter((row) => !row.eligible).sort((left, right) => (
    compareUtf8Binary(left.model.identity.slug, right.model.identity.slug)
  ));
  const visible = normalizedRequest.includeIneligible ? [...rankedEligible, ...ineligible] : rankedEligible;
  return {
    operation: 'custom',
    dimensionSet: normalizedSet,
    submittedWeights: canonicalRecord(normalizedRequest.weights),
    normalizedWeights,
    rows: visible.slice(0, normalizedRequest.limit),
    totalEligible: rankedEligible.length,
    totalIneligible: ineligible.length,
    truncated: visible.length > normalizedRequest.limit,
  };
}

function matchesLeaderboardFilters(model: ModelSummary, filters: LeaderboardRankingsRequest['filters']): boolean {
  if (filters.organizationIds.length > 0 && !filters.organizationIds.includes(model.identity.organization)) return false;
  if (filters.excludeDerivativeFinetunes && model.isDerivativeFinetune) return false;
  if (filters.openWeights === 'all') return true;
  return model.openWeights.availability === 'available'
    && (filters.openWeights === 'only' ? model.openWeights.value : !model.openWeights.value);
}

function validateTaxonomy(value: unknown, path: string): readonly LeaderboardTaxonomyCategory[] {
  const taxonomy = expectArray(value, path, false).map((value, index): LeaderboardTaxonomyCategory => {
    const categoryPath = `${path}/${index}`;
    const category = expectRecord(value, categoryPath, false);
    expectExactKeys(category, ['categoryId', 'label', 'tasks'], categoryPath, false);
    const tasks = expectArray(category.tasks, `${categoryPath}/tasks`, false).map((value, taskIndex) => {
      const taskPath = `${categoryPath}/tasks/${taskIndex}`;
      const task = expectRecord(value, taskPath, false);
      expectExactKeys(task, ['taskId', 'label'], taskPath, false);
      return {
        taskId: expectIdentifier(task.taskId, `${taskPath}/taskId`, false),
        label: expectString(task.label, `${taskPath}/label`, false),
      };
    });
    if (tasks.length === 0) failResponse(`${categoryPath}/tasks`, 'must contain taxonomy tasks');
    expectUnique(tasks.map((task) => task.taskId), `${categoryPath}/tasks`, false);
    return {
      categoryId: expectIdentifier(category.categoryId, `${categoryPath}/categoryId`, false),
      label: expectString(category.label, `${categoryPath}/label`, false),
      tasks,
    };
  });
  if (taxonomy.length === 0) failResponse(path, 'must contain complete taxonomy categories');
  expectUnique(taxonomy.map((category) => category.categoryId), path, false);
  const taskIds = taxonomy.flatMap((category) => category.tasks.map((task) => task.taskId));
  expectUnique(taskIds, path, false);
  return taxonomy;
}

function validateLeaderboardAuthority(value: RankingsValidationAuthority): LeaderboardRankingsValidationAuthority {
  const authority = expectRecord(value, '$/authority', false);
  expectExactKeys(authority, [
    'operation', 'resolvedReleaseId', 'taxonomy', 'authoritativeReleaseSourceRef',
    'expectedFilteredTotal', 'expectedOrderedPageModelSlugs', 'expectedNextCursor',
  ], '$/authority', false);
  if (authority.operation !== 'leaderboard') failResponse('$/authority/operation', 'must match leaderboard data');
  const expectedOrderedPageModelSlugs = expectArray(
    authority.expectedOrderedPageModelSlugs, '$/authority/expectedOrderedPageModelSlugs', false,
  ).map((slug, index) => expectIdentifier(slug, `$/authority/expectedOrderedPageModelSlugs/${index}`, false));
  expectUnique(expectedOrderedPageModelSlugs, '$/authority/expectedOrderedPageModelSlugs', false);
  return {
    operation: 'leaderboard',
    resolvedReleaseId: expectIdentifier(authority.resolvedReleaseId, '$/authority/resolvedReleaseId', false),
    taxonomy: validateTaxonomy(authority.taxonomy, '$/authority/taxonomy'),
    authoritativeReleaseSourceRef: expectIdentifier(
      authority.authoritativeReleaseSourceRef, '$/authority/authoritativeReleaseSourceRef', false, 512,
    ),
    expectedFilteredTotal: expectSafeInteger(authority.expectedFilteredTotal, '$/authority/expectedFilteredTotal', false, 0),
    expectedOrderedPageModelSlugs,
    expectedNextCursor: expectCursor(authority.expectedNextCursor, '$/authority/expectedNextCursor', false),
  };
}

function validateCustomAuthority(value: RankingsValidationAuthority): CustomRankingsValidationAuthority {
  const authority = expectRecord(value, '$/authority', false);
  expectExactKeys(authority, [
    'operation', 'dimensionSet', 'expectedTotalEligible', 'expectedTotalIneligible',
  ], '$/authority', false);
  if (authority.operation !== 'custom') failResponse('$/authority/operation', 'must match custom data');
  return {
    operation: 'custom',
    dimensionSet: validateDimensionSet(authority.dimensionSet, '$/authority/dimensionSet', false),
    expectedTotalEligible: expectSafeInteger(authority.expectedTotalEligible, '$/authority/expectedTotalEligible', false, 0),
    expectedTotalIneligible: expectSafeInteger(authority.expectedTotalIneligible, '$/authority/expectedTotalIneligible', false, 0),
  };
}

function validateLeaderboardDataIntrinsic(
  value: unknown,
  request: LeaderboardRankingsRequest,
  sources: readonly SourceAttribution[],
): LeaderboardRankingsData {
  const data = expectRecord(value, '$/data', false);
  expectExactKeys(data, ['operation', 'release', 'taxonomy', 'rows', 'total', 'nextCursor'], '$/data', false);
  if (data.operation !== 'leaderboard') failResponse('$/data/operation', 'must be leaderboard');
  const sourceRefs = new Set(sources.map((source) => source.sourceRef));
  if (sourceRefs.size !== sources.length) failResponse('$/sources', 'must not repeat source references');
  const release = expectRecord(data.release, '$/data/release', false);
  expectExactKeys(release, ['releaseId', 'releaseOn', 'licenseId', 'sourceRefs'], '$/data/release', false);
  const releaseId = expectIdentifier(release.releaseId, '$/data/release/releaseId', false);
  if (request.releaseId !== null && releaseId !== request.releaseId) {
    failResponse('$/data/release/releaseId', 'must match the explicitly requested release');
  }
  const releaseOn = expectString(release.releaseOn, '$/data/release/releaseOn', false, 10);
  if (!isCanonicalCalendarDate(releaseOn)) failResponse('$/data/release/releaseOn', 'must be a canonical calendar date');
  if (release.licenseId !== 'Apache-2.0') failResponse('$/data/release/licenseId', 'must be Apache-2.0');
  const releaseSourceRefs = expectArray(release.sourceRefs, '$/data/release/sourceRefs', false).map((value, index) => {
    const sourceRef = expectString(value, `$/data/release/sourceRefs/${index}`, false);
    const source = sources.find((candidate) => candidate.sourceRef === sourceRef);
    if (source === undefined || source.licenseId !== 'Apache-2.0') {
      failResponse(`$/data/release/sourceRefs/${index}`, 'must cite a declared Apache-2.0 source');
    }
    return sourceRef;
  });
  if (releaseSourceRefs.length === 0) failResponse('$/data/release/sourceRefs', 'must cite at least one release source');
  expectUnique(releaseSourceRefs, '$/data/release/sourceRefs', false);
  const taxonomy = validateTaxonomy(data.taxonomy, '$/data/taxonomy');
  const taxonomyTasks = new Map(taxonomy.flatMap((category) => category.tasks.map((task) => [task.taskId, { ...task, categoryId: category.categoryId }] as const)));
  if (taxonomyTasks.size !== taxonomy.flatMap((category) => category.tasks).length) failResponse('$/data/taxonomy', 'must not repeat task IDs across categories');
  const rows = expectArray(data.rows, '$/data/rows', false).map((value, index): LeaderboardRow => {
    const rowPath = `$/data/rows/${index}`;
    const row = expectRecord(value, rowPath, false);
    expectExactKeys(row, ['sourceRank', 'model', 'taskEconomics', 'costPerSuccessfulEvaluationUsd', 'meanOutputTokens', 'pareto'], rowPath, false);
    if (typeof row.pareto !== 'boolean') failResponse(`${rowPath}/pareto`, 'must be a boolean');
    const model = validateModelSummary(row.model, sources);
    if (!matchesLeaderboardFilters(model, request.filters)) failResponse(`${rowPath}/model`, 'must satisfy the requested leaderboard filters');
    const taskEconomics = expectArray(row.taskEconomics, `${rowPath}/taskEconomics`, false).map((task, taskIndex) => {
      const normalized = validateTaskFact(task, model, sources);
      const taxonomyTask = taxonomyTasks.get(normalized.taskId);
      if (taxonomyTask === undefined || taxonomyTask.categoryId !== normalized.categoryId || taxonomyTask.label !== normalized.label) {
        failResponse(`${rowPath}/taskEconomics/${taskIndex}`, 'must bind to the declared taxonomy');
      }
      return normalized;
    });
    if (taskEconomics.length === 0) failResponse(`${rowPath}/taskEconomics`, 'must contain task economics');
    expectUnique(taskEconomics.map((task) => task.taskId), `${rowPath}/taskEconomics`, false);
    return {
      sourceRank: expectSafeInteger(row.sourceRank, `${rowPath}/sourceRank`, false, 1),
      model,
      taskEconomics,
      costPerSuccessfulEvaluationUsd: validateEvidenceNumber(
        row.costPerSuccessfulEvaluationUsd,
        `${rowPath}/costPerSuccessfulEvaluationUsd`,
        sourceRefs,
        0,
        1_000_000_000,
      ),
      meanOutputTokens: validateEvidenceSafeInteger(
        row.meanOutputTokens,
        `${rowPath}/meanOutputTokens`,
        sourceRefs,
        0,
      ),
      pareto: row.pareto,
    };
  });
  if (rows.length > request.limit) failResponse('$/data/rows', 'must not exceed the requested page limit');
  expectUnique(rows.map((row) => row.model.identity.slug), '$/data/rows', false);
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]!;
    const current = rows[index]!;
    if (current.sourceRank < previous.sourceRank || (
      current.sourceRank === previous.sourceRank
      && compareUtf8Binary(current.model.identity.slug, previous.model.identity.slug) < 0
    )) {
      failResponse(`$/data/rows/${index}`, 'must order by source rank and then UTF-8 slug');
    }
  }
  const total = expectSafeInteger(data.total, '$/data/total', false, 0);
  if (total < rows.length) failResponse('$/data/total', 'must be at least the returned row count');
  const nextCursor = expectCursor(data.nextCursor, '$/data/nextCursor', false);
  return {
    operation: 'leaderboard',
    release: { releaseId, releaseOn, licenseId: 'Apache-2.0', sourceRefs: releaseSourceRefs },
    taxonomy,
    rows,
    total,
    nextCursor,
  };
}

function validateLeaderboardDataAuthority(
  data: LeaderboardRankingsData,
  request: LeaderboardRankingsRequest,
  authority: LeaderboardRankingsValidationAuthority,
): void {
  if (request.releaseId !== null && request.releaseId !== authority.resolvedReleaseId) {
    failResponse('$/authority/resolvedReleaseId', 'must resolve the explicitly requested release');
  }
  if (authority.expectedOrderedPageModelSlugs.length > request.limit) {
    failResponse('$/authority/expectedOrderedPageModelSlugs', 'must not exceed the requested page limit');
  }
  if (authority.expectedFilteredTotal < authority.expectedOrderedPageModelSlugs.length) {
    failResponse('$/authority/expectedFilteredTotal', 'must be at least the authoritative page size');
  }
  if (data.release.releaseId !== authority.resolvedReleaseId) {
    failResponse('$/data/release/releaseId', 'must match the authoritative resolved release');
  }
  if (
    data.release.sourceRefs.length !== 1
    || data.release.sourceRefs[0] !== authority.authoritativeReleaseSourceRef
  ) {
    failResponse('$/data/release/sourceRefs', 'must exactly bind the authoritative release source');
  }
  if (!sameJsonValue(data.taxonomy, authority.taxonomy)) {
    failResponse('$/data/taxonomy', 'must exactly match the authoritative complete taxonomy');
  }
  if (data.total !== authority.expectedFilteredTotal) {
    failResponse('$/data/total', 'must equal the authoritative filtered total');
  }
  const pageSlugs = data.rows.map((row) => row.model.identity.slug);
  if (!sameJsonValue(pageSlugs, authority.expectedOrderedPageModelSlugs)) {
    failResponse('$/data/rows', 'must exactly match the authoritative ordered page');
  }
  if (data.nextCursor !== authority.expectedNextCursor) {
    failResponse('$/data/nextCursor', 'must exactly match the authoritative resumable cursor');
  }
}

function validateCustomData(
  value: unknown,
  request: CustomRankingsRequest,
  sources: readonly SourceAttribution[],
  authority: CustomRankingsValidationAuthority,
): CustomRankingsData {
  const data = expectRecord(value, '$/data', false);
  expectExactKeys(data, [
    'operation', 'dimensionSet', 'submittedWeights', 'normalizedWeights', 'rows',
    'totalEligible', 'totalIneligible', 'truncated',
  ], '$/data', false);
  if (data.operation !== 'custom') failResponse('$/data/operation', 'must be custom');
  const dimensionSet = validateDimensionSet(data.dimensionSet, '$/data/dimensionSet', false);
  if (!sameJsonValue(dimensionSet, authority.dimensionSet)) {
    failResponse('$/data/dimensionSet', 'must exactly match the authoritative published dimension set');
  }
  const dimensionIds = dimensionSet.dimensions.map((dimension) => dimension.dimensionId);
  const submittedWeights = expectRecord(data.submittedWeights, '$/data/submittedWeights', false);
  const normalizedWeights = expectRecord(data.normalizedWeights, '$/data/normalizedWeights', false);
  expectExactKeys(submittedWeights, dimensionIds, '$/data/submittedWeights', false);
  expectExactKeys(normalizedWeights, dimensionIds, '$/data/normalizedWeights', false);
  const expectedKeys = Object.keys(request.weights).sort(compareUtf8Binary);
  if (expectedKeys.length !== dimensionIds.length || expectedKeys.some((key, index) => key !== [...dimensionIds].sort(compareUtf8Binary)[index])) {
    failResponse('$/data/dimensionSet/dimensions', 'must name every exact requested dimension');
  }
  const normalizedSubmittedWeights: Record<string, number> = {};
  const normalizedOutputWeights: Record<string, number> = {};
  let positiveTotal = 0;
  for (const dimensionId of dimensionIds) {
    const submitted = expectFinite(submittedWeights[dimensionId], `$/data/submittedWeights/${dimensionId}`, false, 0, 100);
    if (submitted !== request.weights[dimensionId]) failResponse(`$/data/submittedWeights/${dimensionId}`, 'must equal the submitted request weight');
    normalizedSubmittedWeights[dimensionId] = submitted;
    if (submitted > 0) positiveTotal += submitted;
  }
  for (const dimensionId of dimensionIds) {
    const weight = expectFinite(normalizedWeights[dimensionId], `$/data/normalizedWeights/${dimensionId}`, false, 0, 1);
    const expected = normalizedSubmittedWeights[dimensionId]! > 0 ? normalizedSubmittedWeights[dimensionId]! / positiveTotal : 0;
    if (Math.abs(weight - expected) > 1e-12) {
      failResponse(`$/data/normalizedWeights/${dimensionId}`, 'must equal the normalized submitted weight within 1e-12');
    }
    normalizedOutputWeights[dimensionId] = weight;
  }
  if (Math.abs(Object.values(normalizedOutputWeights).reduce((sum, weight) => sum + weight, 0) - 1) > 1e-12) {
    failResponse('$/data/normalizedWeights', 'positive weights must sum to one within 1e-12');
  }
  const sourceRefs = new Set(sources.map((source) => source.sourceRef));
  if (sourceRefs.size !== sources.length) failResponse('$/sources', 'must not repeat source references');
  const rows = expectArray(data.rows, '$/data/rows', false).map((value, index): RankingRow => {
    const rowPath = `$/data/rows/${index}`;
    const row = expectRecord(value, rowPath, false);
    expectExactKeys(row, ['model', 'dimensions', 'total', 'rank', 'pareto', 'eligible', 'ineligibilityReasons'], rowPath, false);
    if (typeof row.eligible !== 'boolean') failResponse(`${rowPath}/eligible`, 'must be a boolean');
    const model = validateModelSummary(row.model, sources);
    if (!matchesCustomFilters(model, request.filters)) {
      failResponse(`${rowPath}/model`, 'must satisfy every submitted custom-ranking filter');
    }
    const dimensions = expectArray(row.dimensions, `${rowPath}/dimensions`, false).map((value, dimensionIndex): RankingDimensionResult => {
      const dimensionPath = `${rowPath}/dimensions/${dimensionIndex}`;
      const result = expectRecord(value, dimensionPath, false);
      expectExactKeys(result, ['dimensionId', 'rawValue', 'utility', 'contribution'], dimensionPath, false);
      const dimension = dimensionSet.dimensions[dimensionIndex];
      if (dimension === undefined || result.dimensionId !== dimension.dimensionId) {
        failResponse(`${dimensionPath}/dimensionId`, 'must preserve exact dimension-set order');
      }
      const rawValue = validateDimensionRawEvidence(
        result.rawValue,
        `${dimensionPath}/rawValue`,
        sourceRefs,
        dimension,
      );
      const positiveWeight = normalizedOutputWeights[dimension.dimensionId]! > 0;
      const utility = result.utility === null ? null : expectFinite(result.utility, `${dimensionPath}/utility`, false, 0, 100);
      const contribution = result.contribution === null ? null : expectFinite(result.contribution, `${dimensionPath}/contribution`, false, 0, 100);
      if (rawValue.availability === 'unavailable' && utility !== null) {
        failResponse(`${dimensionPath}/utility`, 'must be null when raw evidence is unavailable');
      }
      if (!positiveWeight && contribution !== 0) {
        failResponse(`${dimensionPath}/contribution`, 'must preserve a zero contribution for a zero-weight dimension');
      }
      if (row.eligible) {
        if (positiveWeight && (rawValue.availability !== 'available' || utility === null || contribution === null)) {
          failResponse(dimensionPath, 'must contain available utility and contribution for every positive weight');
        }
        if (utility !== null && rawValue.availability === 'available' && Math.abs(utility - utilityFor(rawValue.value, dimension)) > 1e-12) {
          failResponse(`${dimensionPath}/utility`, 'must match the fixed utility anchor');
        }
        if (positiveWeight && Math.abs(contribution! - utility! * normalizedOutputWeights[dimension.dimensionId]!) > 1e-9) {
          failResponse(`${dimensionPath}/contribution`, 'must equal utility times normalized weight within 1e-9');
        }
      } else if (positiveWeight && (utility !== null || contribution !== null)) {
        failResponse(dimensionPath, 'must null positive-weight outputs for an ineligible row');
      }
      return { dimensionId: dimension.dimensionId, rawValue, utility, contribution };
    });
    if (dimensions.length !== dimensionSet.dimensions.length) failResponse(`${rowPath}/dimensions`, 'must name every exact ranking dimension');
    const ineligibilityReasons = expectArray(row.ineligibilityReasons, `${rowPath}/ineligibilityReasons`, false).map((value, reasonIndex) => (
      expectString(value, `${rowPath}/ineligibilityReasons/${reasonIndex}`, false)
    ));
    if (row.eligible) {
      if (row.total === null || row.rank === null || typeof row.pareto !== 'boolean' || ineligibilityReasons.length !== 0) {
        failResponse(rowPath, 'eligible rows require total, rank, Pareto state, and no ineligibility reasons');
      }
      const total = expectFinite(row.total, `${rowPath}/total`, false, 0, 100);
      const contributionTotal = dimensions.reduce((sum, dimension) => sum + (dimension.contribution ?? 0), 0);
      if (Math.abs(total - contributionTotal) > 1e-9) failResponse(`${rowPath}/total`, 'must equal the contribution sum within 1e-9');
      return {
        model,
        dimensions,
        total,
        rank: expectSafeInteger(row.rank, `${rowPath}/rank`, false, 1),
        pareto: row.pareto,
        eligible: true,
        ineligibilityReasons,
      };
    }
    if (row.total !== null || row.rank !== null || row.pareto !== null || ineligibilityReasons.length === 0) {
      failResponse(rowPath, 'ineligible rows require null total, rank, Pareto state, and non-empty reasons');
    }
    if (!dimensions.some((dimension) => (
      normalizedOutputWeights[dimension.dimensionId]! > 0 && dimension.rawValue.availability === 'unavailable'
    ))) {
      failResponse(rowPath, 'ineligible rows require an unavailable positive-weight raw value');
    }
    return { model, dimensions, total: null, rank: null, pareto: null, eligible: false, ineligibilityReasons };
  });
  if (rows.length > request.limit) failResponse('$/data/rows', 'must not exceed the requested row limit');
  expectUnique(rows.map((row) => row.model.identity.slug), '$/data/rows', false);
  let previousEligible: RankingRow | undefined;
  let previousIneligibleSlug: string | undefined;
  let seenIneligible = false;
  for (const [index, row] of rows.entries()) {
    if (row.eligible) {
      if (seenIneligible) failResponse(`$/data/rows/${index}`, 'must order eligible rows before ineligible rows');
      if (previousEligible !== undefined) {
        const previousTotal = previousEligible.total!;
        const currentTotal = row.total!;
        if (currentTotal > previousTotal + 1e-12 || (
          Math.abs(currentTotal - previousTotal) <= 1e-12
          && compareUtf8Binary(row.model.identity.slug, previousEligible.model.identity.slug) < 0
        )) failResponse(`$/data/rows/${index}`, 'must order eligible rows by total then UTF-8 slug');
        const expectedRank = Math.abs(currentTotal - previousTotal) <= 1e-12 ? previousEligible.rank : index + 1;
        if (row.rank !== expectedRank) failResponse(`$/data/rows/${index}/rank`, 'must preserve deterministic competition ranks');
      } else if (row.rank !== 1) {
        failResponse(`$/data/rows/${index}/rank`, 'must begin eligible ranking at one');
      }
      previousEligible = row;
    } else {
      seenIneligible = true;
      if (previousIneligibleSlug !== undefined && compareUtf8Binary(row.model.identity.slug, previousIneligibleSlug) < 0) {
        failResponse(`$/data/rows/${index}`, 'must order ineligible rows by UTF-8 slug');
      }
      previousIneligibleSlug = row.model.identity.slug;
    }
  }
  const eligibleRows = rows.filter((row) => row.eligible);
  const positiveDimensionIds = new Set(Object.entries(normalizedOutputWeights).filter(([, weight]) => weight > 0).map(([dimensionId]) => dimensionId));
  for (const [index, row] of eligibleRows.entries()) {
    const expectedPareto = !eligibleRows.some((other) => other !== row && dominates(other, row, positiveDimensionIds));
    if (row.pareto !== expectedPareto) failResponse(`$/data/rows/${index}/pareto`, 'must use positive-weight dimensions for Pareto membership');
  }
  const totalEligible = expectSafeInteger(data.totalEligible, '$/data/totalEligible', false, 0);
  const totalIneligible = expectSafeInteger(data.totalIneligible, '$/data/totalIneligible', false, 0);
  if (totalEligible !== authority.expectedTotalEligible || totalIneligible !== authority.expectedTotalIneligible) {
    failResponse('$/data', 'must exactly match authoritative eligible and ineligible totals');
  }
  if (!request.includeIneligible && rows.some((row) => !row.eligible)) {
    failResponse('$/data/rows', 'must omit ineligible rows when they were not requested');
  }
  const expectedVisibleTotal = request.includeIneligible ? totalEligible + totalIneligible : totalEligible;
  const expectedRowCount = Math.min(request.limit, expectedVisibleTotal);
  if (rows.length !== expectedRowCount) {
    failResponse('$/data/rows', 'must contain the complete authoritative visible sequence through the requested limit');
  }
  const expectedVisibleEligibleCount = Math.min(totalEligible, expectedRowCount);
  const expectedVisibleIneligibleCount = expectedRowCount - expectedVisibleEligibleCount;
  const visibleEligibleCount = rows.filter((row) => row.eligible).length;
  const visibleIneligibleCount = rows.length - visibleEligibleCount;
  if (
    visibleEligibleCount !== expectedVisibleEligibleCount
    || visibleIneligibleCount !== expectedVisibleIneligibleCount
  ) {
    failResponse('$/data/rows', 'must match authoritative visible eligible and ineligible counts');
  }
  for (const [index, row] of rows.entries()) {
    if (row.eligible !== (index < expectedVisibleEligibleCount)) {
      failResponse(`$/data/rows/${index}/eligible`, 'must preserve the authoritative eligible prefix');
    }
  }
  if (typeof data.truncated !== 'boolean') failResponse('$/data/truncated', 'must be a boolean');
  if (data.truncated !== (expectedVisibleTotal > expectedRowCount)) {
    failResponse('$/data/truncated', 'must exactly describe authoritative final ordered-sequence slicing');
  }
  return {
    operation: 'custom',
    dimensionSet,
    submittedWeights: canonicalRecord(normalizedSubmittedWeights),
    normalizedWeights: canonicalRecord(normalizedOutputWeights),
    rows,
    totalEligible,
    totalIneligible,
    truncated: data.truncated,
  };
}

export function validateRankingsData(
  request: RankingsRequest,
  value: unknown,
  sources: readonly SourceAttribution[],
  authority: RankingsValidationAuthority,
): RankingsData {
  const record = expectRecord(value, '$/data', false);
  const requestRecord = expectRecord(request, '$/request', true);
  if (record.operation !== requestRecord.operation) {
    failResponse('$/data/operation', 'must match the normalized request operation');
  }
  if (record.operation === 'leaderboard') {
    const normalizedRequest = normalizeLeaderboardRequest(request);
    const leaderboardAuthority = validateLeaderboardAuthority(authority);
    const data = validateLeaderboardDataIntrinsic(value, normalizedRequest, sources);
    validateLeaderboardDataAuthority(data, normalizedRequest, leaderboardAuthority);
    return data;
  }
  if (record.operation === 'custom') {
    const customAuthority = validateCustomAuthority(authority);
    return validateCustomData(
      value,
      normalizeCustomRequest(request, customAuthority.dimensionSet),
      sources,
      customAuthority,
    );
  }
  failResponse('$/data/operation', 'must be leaderboard or custom');
}

export function validateRankingsDataIntrinsic(
  request: RankingsRequest,
  value: unknown,
  sources: readonly SourceAttribution[],
): RankingsData {
  const record = expectRecord(value, '$/data', false);
  const requestRecord = expectRecord(request, '$/request', true);
  if (record.operation !== requestRecord.operation) {
    failResponse('$/data/operation', 'must match the normalized request operation');
  }
  if (record.operation === 'custom') {
    const authority = validateCustomAuthority({
      operation: 'custom',
      dimensionSet: record.dimensionSet,
      expectedTotalEligible: record.totalEligible,
      expectedTotalIneligible: record.totalIneligible,
    } as RankingsValidationAuthority);
    return validateCustomData(
      value,
      normalizeCustomRequest(request, authority.dimensionSet),
      sources,
      authority,
    );
  }
  if (record.operation === 'leaderboard') {
    return validateLeaderboardDataIntrinsic(value, normalizeLeaderboardRequest(request), sources);
  }
  failResponse('$/data/operation', 'must be leaderboard or custom');
}

export function parseRankingsBody(bytes: Uint8Array, dimensionSet: RankingDimensionSet): CustomRankingsRequest {
  const request = normalizeRankingsRequest(decodeBoundedJson(bytes), dimensionSet);
  if (request.operation !== 'custom') failRequest('$/request/operation', 'ranking request bodies must use custom operation');
  return request;
}
