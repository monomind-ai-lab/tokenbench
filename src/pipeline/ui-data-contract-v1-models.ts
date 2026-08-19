import { isCanonicalIsoTimestamp } from '../benchmarks/contracts';
import {
  UiDataContractValidationError,
  type EvidenceValue,
  type SourceAttribution,
} from './ui-data-contract-v1-core';

export const SAFE_MODEL_SLUG = /^[a-z0-9](?:[a-z0-9._~-]{0,158}[a-z0-9])?$/u;

export type SafeModelSlug = string;

export interface ModelsRequest {
  readonly search: string | null;
  readonly access: 'all' | 'proprietary' | 'open_weights';
  readonly providerIds: readonly string[];
  readonly limit: number;
  readonly cursor: string | null;
}

export interface ProfileRequest {
  readonly slug: SafeModelSlug;
}

export interface LifecycleRequest {
  readonly asOf: string;
  readonly horizonDays: number;
}

export interface ComparisonRequest {
  readonly modelSlugs: readonly SafeModelSlug[];
}

export interface ModelIdentity {
  readonly configurationId: string;
  readonly slug: SafeModelSlug;
  readonly displayName: string;
  readonly organization: string;
}

export interface ScoreFact {
  readonly dimensionId: string;
  readonly label: string;
  readonly score: EvidenceValue<number>;
  readonly rank: EvidenceValue<number>;
  readonly fieldSize: EvidenceValue<number>;
}

export interface TaskFact {
  readonly taskId: string;
  readonly label: string;
  readonly categoryId: string;
  readonly score: EvidenceValue<number>;
  readonly questionCount: EvidenceValue<number>;
  readonly evaluationCostUsd: EvidenceValue<number>;
  readonly inputPriceUsdPerMillion: EvidenceValue<number>;
  readonly outputPriceUsdPerMillion: EvidenceValue<number>;
  readonly equivalentSuccesses: EvidenceValue<number>;
  readonly costPerSuccessfulEvaluationUsd: EvidenceValue<number>;
  readonly meanInputTokens: EvidenceValue<number>;
  readonly meanOutputTokens: EvidenceValue<number>;
}

export interface RuntimeObservationMetadata {
  readonly windowStartedAt: string;
  readonly windowEndedAt: string;
  readonly sampleSize: number;
  readonly ttftPercentile: 'p50';
  readonly tpsPercentile: 'p50';
}

export interface RoutePricingTier {
  readonly pricingTierId: string;
  readonly minimumContextTokens: number;
  readonly maximumContextTokens: number | null;
  readonly inputMicroDollarsPerMillion: EvidenceValue<number>;
  readonly outputMicroDollarsPerMillion: EvidenceValue<number>;
  readonly cacheReadMicroDollarsPerMillion: EvidenceValue<number>;
  readonly cacheWriteMicroDollarsPerMillion: EvidenceValue<number>;
}

export interface RouteFact {
  readonly routeId: string;
  readonly providerId: string;
  readonly status: 'available' | 'limited' | 'deprecated' | 'unavailable';
  readonly inputMicroDollarsPerMillion: EvidenceValue<number>;
  readonly outputMicroDollarsPerMillion: EvidenceValue<number>;
  readonly cacheReadMicroDollarsPerMillion: EvidenceValue<number>;
  readonly cacheWriteMicroDollarsPerMillion: EvidenceValue<number>;
  readonly contextWindowTokens: EvidenceValue<number>;
  readonly maxOutputTokens: EvidenceValue<number>;
  readonly inputModalities: readonly ('text' | 'image' | 'audio' | 'video' | 'file')[];
  readonly outputModalities: readonly ('text' | 'image' | 'audio' | 'video' | 'file')[];
  readonly ttftP50Ms: EvidenceValue<number>;
  readonly tpsP50: EvidenceValue<number>;
  readonly uptimeBasisPoints: EvidenceValue<number>;
  readonly runtimeObservation: EvidenceValue<RuntimeObservationMetadata>;
  readonly pricingTiers: readonly RoutePricingTier[];
}

export interface ModelSummary {
  readonly identity: ModelIdentity;
  readonly openWeights: EvidenceValue<boolean>;
  readonly isDerivativeFinetune: boolean;
  readonly baseModelSlug: EvidenceValue<SafeModelSlug> | null;
  readonly overall: ScoreFact;
  readonly categories: readonly ScoreFact[];
  readonly selectedRouteId: string | null;
  readonly selectedRoutePolicy: string;
  readonly selectedRoute: RouteFact | null;
  readonly lifecycleStatus: EvidenceValue<'current' | 'sunset_scheduled' | 'retired'>;
}

export interface LifecycleEvent {
  readonly eventId: string;
  readonly eventType: 'announcement' | 'deprecation' | 'expiration' | 'retirement';
  readonly effectiveAt: string;
  readonly observedAt: string;
  readonly confidence: 'official' | 'reviewed_secondary';
}

export interface ModelProfile {
  readonly summary: ModelSummary;
  readonly releaseOn: string;
  readonly tasks: readonly TaskFact[];
  readonly routes: readonly RouteFact[];
  readonly lifecycleEvents: readonly LifecycleEvent[];
  readonly replacement: EvidenceValue<{ readonly modelSlug: SafeModelSlug; readonly migrationNote: string }>;
}

export interface LifecycleProjectionItem {
  readonly identity: ModelIdentity;
  readonly status: EvidenceValue<'current' | 'sunset_scheduled' | 'retired'>;
  readonly events: readonly LifecycleEvent[];
  readonly replacement: EvidenceValue<{ readonly modelSlug: SafeModelSlug; readonly migrationNote: string }>;
}

export interface ModelsData {
  readonly models: readonly ModelSummary[];
  readonly total: number;
  readonly nextCursor: string | null;
}

export interface ProfileData {
  readonly model: ModelProfile;
}

export interface LifecycleData {
  readonly asOf: string;
  readonly horizonDays: number;
  readonly models: readonly LifecycleProjectionItem[];
}

export interface ComparisonData {
  readonly requestedModelSlugs: readonly SafeModelSlug[];
  readonly models: readonly ModelProfile[];
}

type ModelMethod = 'models' | 'profile' | 'lifecycle' | 'comparison';
type UnknownRecord = Record<string, unknown>;

const ACCESS_VALUES = new Set<ModelsRequest['access']>(['all', 'proprietary', 'open_weights']);
const MODALITIES = new Set<RouteFact['inputModalities'][number]>(['text', 'image', 'audio', 'video', 'file']);
const ROUTE_STATUSES = new Set<RouteFact['status']>(['available', 'limited', 'deprecated', 'unavailable']);
const LIFECYCLE_STATUSES = new Set<ModelSummary['lifecycleStatus'] extends EvidenceValue<infer T> ? T : never>([
  'current', 'sunset_scheduled', 'retired',
]);
const EVENT_TYPES = new Set<LifecycleEvent['eventType']>(['announcement', 'deprecation', 'expiration', 'retirement']);
const EVENT_CONFIDENCE = new Set<LifecycleEvent['confidence']>(['official', 'reviewed_secondary']);
const CURSOR = /^[A-Za-z0-9_-]{1,1024}$/u;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

function failRequest(path: string, message: string): never {
  throw new UiDataContractValidationError('invalid_request', path, message);
}

function failResponse(path: string, message: string, code: 'invalid_response' | 'undeclared_field' = 'invalid_response'): never {
  throw new UiDataContractValidationError(code, path, message);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRequestRecord(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) failRequest(path, 'must be an object');
  return value;
}

function expectResponseRecord(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) failResponse(path, 'must be an object');
  return value;
}

function expectExactKeys(
  value: UnknownRecord,
  keys: readonly string[],
  path: string,
  required = true,
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) failResponse(`${path}/${key}`, 'is not declared by ui-data-contract/v1', 'undeclared_field');
  }
  if (!required) return;
  for (const key of keys) {
    if (!(key in value)) failResponse(path, `is missing required field ${key}`);
  }
}

function expectRequestExactKeys(
  value: UnknownRecord,
  keys: readonly string[],
  path: string,
  required = true,
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) failRequest(`${path}/${key}`, 'is not declared by ui-data-contract/v1');
  }
  if (!required) return;
  for (const key of keys) {
    if (!(key in value)) failRequest(path, `is missing required field ${key}`);
  }
}

function expectNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) failResponse(path, 'must be a non-empty string');
  return value;
}

function expectRequestString(value: unknown, path: string): string {
  if (typeof value !== 'string') failRequest(path, 'must be a string');
  return value;
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) failResponse(path, 'must be an array');
  return value;
}

function expectRequestArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) failRequest(path, 'must be an array');
  return value;
}

function expectSafeIdentifier(value: unknown, path: string, maximumLength = 256): string {
  const identifier = expectNonEmptyString(value, path);
  const length = Array.from(identifier).length;
  if (length > maximumLength || CONTROL_CHARACTER.test(identifier)) {
    failResponse(path, `must be a control-free identifier of at most ${maximumLength} characters`);
  }
  return identifier;
}

function expectSafeModelSlug(value: unknown, path: string, request = false): SafeModelSlug {
  const slug = request ? expectRequestString(value, path) : expectNonEmptyString(value, path);
  if (!SAFE_MODEL_SLUG.test(slug)) {
    if (request) failRequest(path, 'must be a safe model slug');
    failResponse(path, 'must be a safe model slug');
  }
  return slug;
}

function expectCanonicalTimestamp(value: unknown, path: string): string {
  if (!isCanonicalIsoTimestamp(value)) failResponse(path, 'must be a canonical UTC timestamp');
  return value;
}

function expectRequestTimestamp(value: unknown, path: string): string {
  if (!isCanonicalIsoTimestamp(value)) failRequest(path, 'must be a canonical UTC timestamp');
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

function expectCalendarDate(value: unknown, path: string): string {
  if (!isCanonicalCalendarDate(value)) failResponse(path, 'must be a real Gregorian calendar date');
  return value;
}

function expectSafeInteger(value: unknown, path: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    failResponse(path, `must be a safe integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function expectRequestSafeInteger(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    failRequest(path, `must be a safe integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function expectFiniteNumber(value: unknown, path: string, minimum: number, maximum = Number.MAX_VALUE): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    failResponse(path, `must be a finite number from ${minimum} through ${maximum}`);
  }
  return value;
}

function expectCursor(value: unknown, path: string, request = false): string | null {
  if (value === null) return null;
  const cursor = request ? expectRequestString(value, path) : expectNonEmptyString(value, path);
  if (!CURSOR.test(cursor)) {
    if (request) failRequest(path, 'must be a base64url string of at most 1024 characters');
    failResponse(path, 'must be a base64url string of at most 1024 characters');
  }
  return cursor;
}

function expectUniqueStrings(values: readonly string[], path: string, request = false): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      if (request) failRequest(`${path}/${index}`, 'must not repeat a value');
      failResponse(`${path}/${index}`, 'must not repeat a value');
    }
    seen.add(value);
  }
}

function expectEvidence<T>(
  value: unknown,
  path: string,
  sourceRefs: ReadonlySet<string>,
  validateAvailable: (value: unknown, path: string) => T,
): EvidenceValue<T> {
  const evidence = expectResponseRecord(value, path);
  if (evidence.availability === 'available') {
    expectExactKeys(evidence, ['availability', 'value', 'sourceRefs'], path);
    const references = expectArray(evidence.sourceRefs, `${path}/sourceRefs`).map((reference, index) => {
      const sourceRef = expectNonEmptyString(reference, `${path}/sourceRefs/${index}`);
      if (!sourceRefs.has(sourceRef)) failResponse(`${path}/sourceRefs/${index}`, 'must reference a declared source');
      return sourceRef;
    });
    if (references.length === 0) failResponse(`${path}/sourceRefs`, 'must cite at least one source');
    expectUniqueStrings(references, `${path}/sourceRefs`);
    return { availability: 'available', value: validateAvailable(evidence.value, `${path}/value`), sourceRefs: references };
  }
  if (evidence.availability === 'unavailable') {
    expectExactKeys(evidence, ['availability', 'value', 'reason', 'sourceRefs'], path);
    if (evidence.value !== null) failResponse(`${path}/value`, 'must be null when evidence is unavailable');
    const references = expectArray(evidence.sourceRefs, `${path}/sourceRefs`).map((reference, index) => {
      const sourceRef = expectNonEmptyString(reference, `${path}/sourceRefs/${index}`);
      if (!sourceRefs.has(sourceRef)) failResponse(`${path}/sourceRefs/${index}`, 'must reference a declared source');
      return sourceRef;
    });
    expectUniqueStrings(references, `${path}/sourceRefs`);
    return {
      availability: 'unavailable',
      value: null,
      reason: expectNonEmptyString(evidence.reason, `${path}/reason`),
      sourceRefs: references,
    };
  }
  failResponse(`${path}/availability`, 'must be available or unavailable');
}

function evidenceNumber(
  value: unknown,
  path: string,
  sourceRefs: ReadonlySet<string>,
  minimum: number,
  maximum = Number.MAX_VALUE,
): EvidenceValue<number> {
  return expectEvidence(value, path, sourceRefs, (candidate, candidatePath) => expectFiniteNumber(
    candidate, candidatePath, minimum, maximum,
  ));
}

function evidenceSafeInteger(
  value: unknown,
  path: string,
  sourceRefs: ReadonlySet<string>,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): EvidenceValue<number> {
  return expectEvidence(value, path, sourceRefs, (candidate, candidatePath) => expectSafeInteger(
    candidate, candidatePath, minimum, maximum,
  ));
}

function evidenceValuesAreOrdered(lower: EvidenceValue<number>, upper: EvidenceValue<number>, path: string): void {
  if (lower.availability === 'available' && upper.availability === 'available' && lower.value > upper.value) {
    failResponse(path, 'lower bound must not exceed upper bound');
  }
}

function validateIdentity(value: unknown, path: string): ModelIdentity {
  const identity = expectResponseRecord(value, path);
  expectExactKeys(identity, ['configurationId', 'slug', 'displayName', 'organization'], path);
  return {
    configurationId: expectSafeIdentifier(identity.configurationId, `${path}/configurationId`),
    slug: expectSafeModelSlug(identity.slug, `${path}/slug`),
    displayName: expectNonEmptyString(identity.displayName, `${path}/displayName`),
    organization: expectNonEmptyString(identity.organization, `${path}/organization`),
  };
}

function validateScoreFact(value: unknown, path: string, sourceRefs: ReadonlySet<string>): ScoreFact {
  const fact = expectResponseRecord(value, path);
  expectExactKeys(fact, ['dimensionId', 'label', 'score', 'rank', 'fieldSize'], path);
  const rank = evidenceSafeInteger(fact.rank, `${path}/rank`, sourceRefs, 1);
  const fieldSize = evidenceSafeInteger(fact.fieldSize, `${path}/fieldSize`, sourceRefs, 1);
  evidenceValuesAreOrdered(rank, fieldSize, path);
  return {
    dimensionId: expectSafeIdentifier(fact.dimensionId, `${path}/dimensionId`),
    label: expectNonEmptyString(fact.label, `${path}/label`),
    score: evidenceNumber(fact.score, `${path}/score`, sourceRefs, 0, 100),
    rank,
    fieldSize,
  };
}

function validateTaskFact(value: unknown, path: string, sourceRefs: ReadonlySet<string>): TaskFact {
  const task = expectResponseRecord(value, path);
  expectExactKeys(task, [
    'taskId', 'label', 'categoryId', 'score', 'questionCount', 'evaluationCostUsd',
    'inputPriceUsdPerMillion', 'outputPriceUsdPerMillion', 'equivalentSuccesses',
    'costPerSuccessfulEvaluationUsd', 'meanInputTokens', 'meanOutputTokens',
  ], path);
  return {
    taskId: expectSafeIdentifier(task.taskId, `${path}/taskId`),
    label: expectNonEmptyString(task.label, `${path}/label`),
    categoryId: expectSafeIdentifier(task.categoryId, `${path}/categoryId`),
    score: evidenceNumber(task.score, `${path}/score`, sourceRefs, 0, 100),
    questionCount: evidenceSafeInteger(task.questionCount, `${path}/questionCount`, sourceRefs, 1),
    evaluationCostUsd: evidenceNumber(task.evaluationCostUsd, `${path}/evaluationCostUsd`, sourceRefs, 0, 1_000_000_000),
    inputPriceUsdPerMillion: evidenceNumber(task.inputPriceUsdPerMillion, `${path}/inputPriceUsdPerMillion`, sourceRefs, 0, 1_000_000_000),
    outputPriceUsdPerMillion: evidenceNumber(task.outputPriceUsdPerMillion, `${path}/outputPriceUsdPerMillion`, sourceRefs, 0, 1_000_000_000),
    equivalentSuccesses: evidenceNumber(
      task.equivalentSuccesses, `${path}/equivalentSuccesses`, sourceRefs, 0, Number.MAX_SAFE_INTEGER,
    ),
    costPerSuccessfulEvaluationUsd: evidenceNumber(task.costPerSuccessfulEvaluationUsd, `${path}/costPerSuccessfulEvaluationUsd`, sourceRefs, 0, 1_000_000_000),
    meanInputTokens: evidenceSafeInteger(task.meanInputTokens, `${path}/meanInputTokens`, sourceRefs, 0),
    meanOutputTokens: evidenceSafeInteger(task.meanOutputTokens, `${path}/meanOutputTokens`, sourceRefs, 0),
  };
}

function validateRuntimeObservationMetadata(value: unknown, path: string): RuntimeObservationMetadata {
  const metadata = expectResponseRecord(value, path);
  expectExactKeys(metadata, ['windowStartedAt', 'windowEndedAt', 'sampleSize', 'ttftPercentile', 'tpsPercentile'], path);
  const windowStartedAt = expectCanonicalTimestamp(metadata.windowStartedAt, `${path}/windowStartedAt`);
  const windowEndedAt = expectCanonicalTimestamp(metadata.windowEndedAt, `${path}/windowEndedAt`);
  if (Date.parse(windowStartedAt) > Date.parse(windowEndedAt)) {
    failResponse(path, 'observation window must not end before it starts');
  }
  if (metadata.ttftPercentile !== 'p50' || metadata.tpsPercentile !== 'p50') {
    failResponse(path, 'runtime observation percentiles must be p50');
  }
  return {
    windowStartedAt,
    windowEndedAt,
    sampleSize: expectSafeInteger(metadata.sampleSize, `${path}/sampleSize`, 1),
    ttftPercentile: 'p50',
    tpsPercentile: 'p50',
  };
}

function validateRoutePricingTier(value: unknown, path: string, sourceRefs: ReadonlySet<string>): RoutePricingTier {
  const tier = expectResponseRecord(value, path);
  expectExactKeys(tier, [
    'pricingTierId', 'minimumContextTokens', 'maximumContextTokens', 'inputMicroDollarsPerMillion',
    'outputMicroDollarsPerMillion', 'cacheReadMicroDollarsPerMillion', 'cacheWriteMicroDollarsPerMillion',
  ], path);
  const minimumContextTokens = expectSafeInteger(tier.minimumContextTokens, `${path}/minimumContextTokens`, 0);
  const maximumContextTokens = tier.maximumContextTokens === null
    ? null
    : expectSafeInteger(tier.maximumContextTokens, `${path}/maximumContextTokens`, minimumContextTokens);
  return {
    pricingTierId: expectSafeIdentifier(tier.pricingTierId, `${path}/pricingTierId`),
    minimumContextTokens,
    maximumContextTokens,
    inputMicroDollarsPerMillion: evidenceSafeInteger(
      tier.inputMicroDollarsPerMillion, `${path}/inputMicroDollarsPerMillion`, sourceRefs, 0,
    ),
    outputMicroDollarsPerMillion: evidenceSafeInteger(
      tier.outputMicroDollarsPerMillion, `${path}/outputMicroDollarsPerMillion`, sourceRefs, 0,
    ),
    cacheReadMicroDollarsPerMillion: evidenceSafeInteger(
      tier.cacheReadMicroDollarsPerMillion, `${path}/cacheReadMicroDollarsPerMillion`, sourceRefs, 0,
    ),
    cacheWriteMicroDollarsPerMillion: evidenceSafeInteger(
      tier.cacheWriteMicroDollarsPerMillion, `${path}/cacheWriteMicroDollarsPerMillion`, sourceRefs, 0,
    ),
  };
}

function validateModalities(value: unknown, path: string): RouteFact['inputModalities'] {
  const modalities = expectArray(value, path).map((modality, index) => {
    if (!MODALITIES.has(modality as RouteFact['inputModalities'][number])) {
      failResponse(`${path}/${index}`, 'must be a declared modality');
    }
    return modality as RouteFact['inputModalities'][number];
  });
  expectUniqueStrings(modalities, path);
  return modalities;
}

function validateRoute(value: unknown, path: string, sourceRefs: ReadonlySet<string>): RouteFact {
  const route = expectResponseRecord(value, path);
  expectExactKeys(route, [
    'routeId', 'providerId', 'status', 'inputMicroDollarsPerMillion', 'outputMicroDollarsPerMillion',
    'cacheReadMicroDollarsPerMillion', 'cacheWriteMicroDollarsPerMillion', 'contextWindowTokens',
    'maxOutputTokens', 'inputModalities', 'outputModalities', 'ttftP50Ms', 'tpsP50',
    'uptimeBasisPoints', 'runtimeObservation', 'pricingTiers',
  ], path);
  if (!ROUTE_STATUSES.has(route.status as RouteFact['status'])) {
    failResponse(`${path}/status`, 'must be a declared route status');
  }
  const pricingTiers = expectArray(route.pricingTiers, `${path}/pricingTiers`).map((tier, index) => validateRoutePricingTier(
    tier, `${path}/pricingTiers/${index}`, sourceRefs,
  ));
  expectUniqueStrings(pricingTiers.map((tier) => tier.pricingTierId), `${path}/pricingTiers`);
  return {
    routeId: expectSafeIdentifier(route.routeId, `${path}/routeId`, 512),
    providerId: expectSafeIdentifier(route.providerId, `${path}/providerId`),
    status: route.status as RouteFact['status'],
    inputMicroDollarsPerMillion: evidenceSafeInteger(
      route.inputMicroDollarsPerMillion, `${path}/inputMicroDollarsPerMillion`, sourceRefs, 0,
    ),
    outputMicroDollarsPerMillion: evidenceSafeInteger(
      route.outputMicroDollarsPerMillion, `${path}/outputMicroDollarsPerMillion`, sourceRefs, 0,
    ),
    cacheReadMicroDollarsPerMillion: evidenceSafeInteger(
      route.cacheReadMicroDollarsPerMillion, `${path}/cacheReadMicroDollarsPerMillion`, sourceRefs, 0,
    ),
    cacheWriteMicroDollarsPerMillion: evidenceSafeInteger(
      route.cacheWriteMicroDollarsPerMillion, `${path}/cacheWriteMicroDollarsPerMillion`, sourceRefs, 0,
    ),
    contextWindowTokens: evidenceSafeInteger(route.contextWindowTokens, `${path}/contextWindowTokens`, sourceRefs, 1),
    maxOutputTokens: evidenceSafeInteger(route.maxOutputTokens, `${path}/maxOutputTokens`, sourceRefs, 1),
    inputModalities: validateModalities(route.inputModalities, `${path}/inputModalities`),
    outputModalities: validateModalities(route.outputModalities, `${path}/outputModalities`),
    ttftP50Ms: evidenceSafeInteger(route.ttftP50Ms, `${path}/ttftP50Ms`, sourceRefs, 0, 86_400_000),
    tpsP50: evidenceNumber(route.tpsP50, `${path}/tpsP50`, sourceRefs, 0, 1_000_000),
    uptimeBasisPoints: evidenceSafeInteger(route.uptimeBasisPoints, `${path}/uptimeBasisPoints`, sourceRefs, 0, 10_000),
    runtimeObservation: expectEvidence(route.runtimeObservation, `${path}/runtimeObservation`, sourceRefs, validateRuntimeObservationMetadata),
    pricingTiers,
  };
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((entry, index) => sameJsonValue(entry, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(left[key], right[key]));
}

function validateModelSummary(value: unknown, path: string, sourceRefs: ReadonlySet<string>): ModelSummary {
  const summary = expectResponseRecord(value, path);
  expectExactKeys(summary, [
    'identity', 'openWeights', 'isDerivativeFinetune', 'baseModelSlug', 'overall', 'categories',
    'selectedRouteId', 'selectedRoutePolicy', 'selectedRoute', 'lifecycleStatus',
  ], path);
  if (typeof summary.isDerivativeFinetune !== 'boolean') {
    failResponse(`${path}/isDerivativeFinetune`, 'must be a boolean');
  }
  if (summary.selectedRouteId !== null && typeof summary.selectedRouteId !== 'string') {
    failResponse(`${path}/selectedRouteId`, 'must be a safe identifier or null');
  }
  const selectedRouteId = summary.selectedRouteId === null
    ? null
    : expectSafeIdentifier(summary.selectedRouteId, `${path}/selectedRouteId`, 512);
  const selectedRoute = summary.selectedRoute === null
    ? null
    : validateRoute(summary.selectedRoute, `${path}/selectedRoute`, sourceRefs);
  if ((selectedRouteId === null) !== (selectedRoute === null)) {
    failResponse(path, 'selectedRouteId and selectedRoute must either both be null or both be present');
  }
  if (selectedRouteId !== null && selectedRoute !== null && selectedRoute.routeId !== selectedRouteId) {
    failResponse(`${path}/selectedRoute/routeId`, 'must match selectedRouteId');
  }
  if (summary.isDerivativeFinetune && summary.baseModelSlug === null) {
    failResponse(`${path}/baseModelSlug`, 'must carry evidence for a derivative fine-tune');
  }
  if (!summary.isDerivativeFinetune && summary.baseModelSlug !== null) {
    failResponse(`${path}/baseModelSlug`, 'must be null for a non-derivative model');
  }
  const categories = expectArray(summary.categories, `${path}/categories`).map((category, index) => validateScoreFact(
    category, `${path}/categories/${index}`, sourceRefs,
  ));
  expectUniqueStrings(categories.map((category) => category.dimensionId), `${path}/categories`);
  return {
    identity: validateIdentity(summary.identity, `${path}/identity`),
    openWeights: expectEvidence(summary.openWeights, `${path}/openWeights`, sourceRefs, (candidate, candidatePath) => {
      if (typeof candidate !== 'boolean') failResponse(candidatePath, 'must be a boolean');
      return candidate;
    }),
    isDerivativeFinetune: summary.isDerivativeFinetune,
    baseModelSlug: summary.baseModelSlug === null
      ? null
      : expectEvidence(summary.baseModelSlug, `${path}/baseModelSlug`, sourceRefs, (candidate, candidatePath) => (
        expectSafeModelSlug(candidate, candidatePath)
      )),
    overall: validateScoreFact(summary.overall, `${path}/overall`, sourceRefs),
    categories,
    selectedRouteId,
    selectedRoutePolicy: expectNonEmptyString(summary.selectedRoutePolicy, `${path}/selectedRoutePolicy`),
    selectedRoute,
    lifecycleStatus: expectEvidence(summary.lifecycleStatus, `${path}/lifecycleStatus`, sourceRefs, (candidate, candidatePath) => {
      if (!LIFECYCLE_STATUSES.has(candidate as ModelSummary['lifecycleStatus'] extends EvidenceValue<infer T> ? T : never)) {
        failResponse(candidatePath, 'must be a declared lifecycle status');
      }
      return candidate as 'current' | 'sunset_scheduled' | 'retired';
    }),
  };
}

function validateLifecycleEvent(value: unknown, path: string): LifecycleEvent {
  const event = expectResponseRecord(value, path);
  expectExactKeys(event, ['eventId', 'eventType', 'effectiveAt', 'observedAt', 'confidence'], path);
  if (!EVENT_TYPES.has(event.eventType as LifecycleEvent['eventType'])) {
    failResponse(`${path}/eventType`, 'must be a declared lifecycle event type');
  }
  if (!EVENT_CONFIDENCE.has(event.confidence as LifecycleEvent['confidence'])) {
    failResponse(`${path}/confidence`, 'must be a declared lifecycle event confidence');
  }
  return {
    eventId: expectSafeIdentifier(event.eventId, `${path}/eventId`),
    eventType: event.eventType as LifecycleEvent['eventType'],
    effectiveAt: expectCanonicalTimestamp(event.effectiveAt, `${path}/effectiveAt`),
    observedAt: expectCanonicalTimestamp(event.observedAt, `${path}/observedAt`),
    confidence: event.confidence as LifecycleEvent['confidence'],
  };
}

function validateReplacement(
  value: unknown,
  path: string,
  sourceRefs: ReadonlySet<string>,
): EvidenceValue<{ readonly modelSlug: SafeModelSlug; readonly migrationNote: string }> {
  return expectEvidence(value, path, sourceRefs, (candidate, candidatePath) => {
    const replacement = expectResponseRecord(candidate, candidatePath);
    expectExactKeys(replacement, ['modelSlug', 'migrationNote'], candidatePath);
    return {
      modelSlug: expectSafeModelSlug(replacement.modelSlug, `${candidatePath}/modelSlug`),
      migrationNote: expectNonEmptyString(replacement.migrationNote, `${candidatePath}/migrationNote`),
    };
  });
}

function validateModelProfile(value: unknown, path: string, sourceRefs: ReadonlySet<string>): ModelProfile {
  const profile = expectResponseRecord(value, path);
  expectExactKeys(profile, ['summary', 'releaseOn', 'tasks', 'routes', 'lifecycleEvents', 'replacement'], path);
  const summary = validateModelSummary(profile.summary, `${path}/summary`, sourceRefs);
  const routes = expectArray(profile.routes, `${path}/routes`).map((route, index) => validateRoute(
    route, `${path}/routes/${index}`, sourceRefs,
  ));
  expectUniqueStrings(routes.map((route) => route.routeId), `${path}/routes`);
  if (summary.selectedRouteId !== null && summary.selectedRoute !== null) {
    const matchingRoute = routes.find((route) => route.routeId === summary.selectedRouteId);
    if (matchingRoute === undefined) {
      failResponse(`${path}/summary/selectedRouteId`, 'must reference a route in the profile');
    }
    if (!sameJsonValue(summary.selectedRoute, matchingRoute)) {
      failResponse(`${path}/summary/selectedRoute`, 'must match the selected profile route pricing and runtime');
    }
  }
  const tasks = expectArray(profile.tasks, `${path}/tasks`).map((task, index) => validateTaskFact(
    task, `${path}/tasks/${index}`, sourceRefs,
  ));
  expectUniqueStrings(tasks.map((task) => task.taskId), `${path}/tasks`);
  const categoryIds = new Set(summary.categories.map((category) => category.dimensionId));
  for (const [index, task] of tasks.entries()) {
    if (!categoryIds.has(task.categoryId)) {
      failResponse(`${path}/tasks/${index}/categoryId`, 'must reference a summary category');
    }
  }
  const lifecycleEvents = expectArray(profile.lifecycleEvents, `${path}/lifecycleEvents`).map((event, index) => validateLifecycleEvent(
    event, `${path}/lifecycleEvents/${index}`,
  ));
  expectUniqueStrings(lifecycleEvents.map((event) => event.eventId), `${path}/lifecycleEvents`);
  return {
    summary,
    releaseOn: expectCalendarDate(profile.releaseOn, `${path}/releaseOn`),
    tasks,
    routes,
    lifecycleEvents,
    replacement: validateReplacement(profile.replacement, `${path}/replacement`, sourceRefs),
  };
}

function validateLifecycleProjectionItem(
  value: unknown,
  path: string,
  sourceRefs: ReadonlySet<string>,
): LifecycleProjectionItem {
  const item = expectResponseRecord(value, path);
  expectExactKeys(item, ['identity', 'status', 'events', 'replacement'], path);
  const events = expectArray(item.events, `${path}/events`).map((event, index) => validateLifecycleEvent(
    event, `${path}/events/${index}`,
  ));
  expectUniqueStrings(events.map((event) => event.eventId), `${path}/events`);
  return {
    identity: validateIdentity(item.identity, `${path}/identity`),
    status: expectEvidence(item.status, `${path}/status`, sourceRefs, (candidate, candidatePath) => {
      if (!LIFECYCLE_STATUSES.has(candidate as ModelSummary['lifecycleStatus'] extends EvidenceValue<infer T> ? T : never)) {
        failResponse(candidatePath, 'must be a declared lifecycle status');
      }
      return candidate as 'current' | 'sunset_scheduled' | 'retired';
    }),
    events,
    replacement: validateReplacement(item.replacement, `${path}/replacement`, sourceRefs),
  };
}

function sourceReferenceSet(sources: readonly SourceAttribution[]): ReadonlySet<string> {
  const sourceRefs = new Set<string>();
  for (const [index, source] of sources.entries()) {
    if (sourceRefs.has(source.sourceRef)) failResponse(`$/sources/${index}/sourceRef`, 'must not repeat a source reference');
    sourceRefs.add(source.sourceRef);
  }
  return sourceRefs;
}

export function normalizeModelsRequest(value: unknown): ModelsRequest {
  const request = expectRequestRecord(value, '$/request');
  expectRequestExactKeys(request, ['search', 'access', 'providerIds', 'limit', 'cursor'], '$/request', false);
  const rawSearch = 'search' in request ? request.search : null;
  let search: string | null;
  if (rawSearch === null) {
    search = null;
  } else {
    const normalized = expectRequestString(rawSearch, '$/request/search').trim();
    if (Array.from(normalized).length > 80) failRequest('$/request/search', 'must contain at most 80 Unicode code points');
    search = normalized.length === 0 ? null : normalized;
  }
  const access = 'access' in request ? request.access : 'all';
  if (!ACCESS_VALUES.has(access as ModelsRequest['access'])) {
    failRequest('$/request/access', 'must be all, proprietary, or open_weights');
  }
  const providerIds = 'providerIds' in request ? expectRequestArray(request.providerIds, '$/request/providerIds').map((providerId, index) => {
    const normalized = expectRequestString(providerId, `$/request/providerIds/${index}`).trim();
    if (normalized.length === 0 || Array.from(normalized).length > 256 || CONTROL_CHARACTER.test(normalized)) {
      failRequest(`$/request/providerIds/${index}`, 'must be a control-free provider identifier of at most 256 characters');
    }
    return normalized;
  }) : [];
  if (providerIds.length > 64) failRequest('$/request/providerIds', 'must contain at most 64 provider IDs');
  expectUniqueStrings(providerIds, '$/request/providerIds', true);
  const limit = 'limit' in request
    ? expectRequestSafeInteger(request.limit, '$/request/limit', 1, 100)
    : 50;
  const cursor = 'cursor' in request ? expectCursor(request.cursor, '$/request/cursor', true) : null;
  return { search, access: access as ModelsRequest['access'], providerIds, limit, cursor };
}

export function normalizeProfileRequest(value: unknown): ProfileRequest {
  const request = expectRequestRecord(value, '$/request');
  expectRequestExactKeys(request, ['slug'], '$/request');
  return { slug: expectSafeModelSlug(request.slug, '$/request/slug', true) };
}

export function normalizeLifecycleRequest(value: unknown): LifecycleRequest {
  const request = expectRequestRecord(value, '$/request');
  expectRequestExactKeys(request, ['asOf', 'horizonDays'], '$/request');
  return {
    asOf: expectRequestTimestamp(request.asOf, '$/request/asOf'),
    horizonDays: expectRequestSafeInteger(request.horizonDays, '$/request/horizonDays', 1, 3_650),
  };
}

export function normalizeComparisonRequest(value: unknown): ComparisonRequest {
  const request = expectRequestRecord(value, '$/request');
  expectRequestExactKeys(request, ['modelSlugs'], '$/request');
  const modelSlugs = expectRequestArray(request.modelSlugs, '$/request/modelSlugs').map((slug, index) => (
    expectSafeModelSlug(slug, `$/request/modelSlugs/${index}`, true)
  ));
  if (modelSlugs.length < 2 || modelSlugs.length > 4) {
    failRequest('$/request/modelSlugs', 'must contain two through four distinct model slugs');
  }
  expectUniqueStrings(modelSlugs, '$/request/modelSlugs', true);
  return { modelSlugs };
}

export function parseComparisonQuery(url: URL): ComparisonRequest {
  const values = url.searchParams.getAll('models');
  if (values.length !== 1 || values[0].length > 1_024) {
    failRequest('$/request/modelSlugs', 'comparison models query is invalid');
  }
  const modelSlugs = values[0].split(',').map((value) => value.trim());
  return normalizeComparisonRequest({ modelSlugs });
}

function validateModelsData(value: unknown, request: ModelsRequest, sourceRefs: ReadonlySet<string>): ModelsData {
  const data = expectResponseRecord(value, '$/data');
  expectExactKeys(data, ['models', 'total', 'nextCursor'], '$/data');
  const models = expectArray(data.models, '$/data/models').map((model, index) => validateModelSummary(
    model, `$/data/models/${index}`, sourceRefs,
  ));
  if (models.length > request.limit) failResponse('$/data/models', 'must not exceed the requested page limit');
  expectUniqueStrings(models.map((model) => model.identity.slug), '$/data/models');
  const total = expectSafeInteger(data.total, '$/data/total', 0);
  if (total < models.length) failResponse('$/data/total', 'must be at least the returned page size');
  return { models, total, nextCursor: expectCursor(data.nextCursor, '$/data/nextCursor') };
}

function validateProfileData(value: unknown, request: ProfileRequest, sourceRefs: ReadonlySet<string>): ProfileData {
  const data = expectResponseRecord(value, '$/data');
  expectExactKeys(data, ['model'], '$/data');
  const model = validateModelProfile(data.model, '$/data/model', sourceRefs);
  if (model.summary.identity.slug !== request.slug) {
    failResponse('$/data/model/summary/identity/slug', 'must match the requested profile slug');
  }
  return { model };
}

function validateLifecycleData(value: unknown, request: LifecycleRequest, sourceRefs: ReadonlySet<string>): LifecycleData {
  const data = expectResponseRecord(value, '$/data');
  expectExactKeys(data, ['asOf', 'horizonDays', 'models'], '$/data');
  const asOf = expectCanonicalTimestamp(data.asOf, '$/data/asOf');
  const horizonDays = expectSafeInteger(data.horizonDays, '$/data/horizonDays', 1, 3_650);
  if (asOf !== request.asOf || horizonDays !== request.horizonDays) {
    failResponse('$/data', 'must echo the exact lifecycle request projection inputs');
  }
  const models = expectArray(data.models, '$/data/models').map((model, index) => validateLifecycleProjectionItem(
    model, `$/data/models/${index}`, sourceRefs,
  ));
  expectUniqueStrings(models.map((model) => model.identity.slug), '$/data/models');
  return { asOf, horizonDays, models };
}

function validateComparisonData(value: unknown, request: ComparisonRequest, sourceRefs: ReadonlySet<string>): ComparisonData {
  const data = expectResponseRecord(value, '$/data');
  expectExactKeys(data, ['requestedModelSlugs', 'models'], '$/data');
  const requestedModelSlugs = expectArray(data.requestedModelSlugs, '$/data/requestedModelSlugs').map((slug, index) => (
    expectSafeModelSlug(slug, `$/data/requestedModelSlugs/${index}`)
  ));
  const models = expectArray(data.models, '$/data/models').map((model, index) => validateModelProfile(
    model, `$/data/models/${index}`, sourceRefs,
  ));
  if (requestedModelSlugs.length !== request.modelSlugs.length || models.length !== request.modelSlugs.length) {
    failResponse('$/data', 'must contain exactly the requested model count');
  }
  for (const [index, slug] of request.modelSlugs.entries()) {
    if (requestedModelSlugs[index] !== slug || models[index]?.summary.identity.slug !== slug) {
      failResponse(`$/data/models/${index}`, 'must exactly preserve normalized comparison request order');
    }
  }
  return { requestedModelSlugs, models };
}

export function validateModelMethodData(
  method: 'models',
  value: unknown,
  request: ModelsRequest,
  sources: readonly SourceAttribution[],
): ModelsData;
export function validateModelMethodData(
  method: 'profile',
  value: unknown,
  request: ProfileRequest,
  sources: readonly SourceAttribution[],
): ProfileData;
export function validateModelMethodData(
  method: 'lifecycle',
  value: unknown,
  request: LifecycleRequest,
  sources: readonly SourceAttribution[],
): LifecycleData;
export function validateModelMethodData(
  method: 'comparison',
  value: unknown,
  request: ComparisonRequest,
  sources: readonly SourceAttribution[],
): ComparisonData;
export function validateModelMethodData(
  method: ModelMethod,
  value: unknown,
  request: ModelsRequest | ProfileRequest | LifecycleRequest | ComparisonRequest,
  sources: readonly SourceAttribution[],
): ModelsData | ProfileData | LifecycleData | ComparisonData {
  const sourceRefs = sourceReferenceSet(sources);
  if (method === 'models') return validateModelsData(value, normalizeModelsRequest(request), sourceRefs);
  if (method === 'profile') return validateProfileData(value, normalizeProfileRequest(request), sourceRefs);
  if (method === 'lifecycle') return validateLifecycleData(value, normalizeLifecycleRequest(request), sourceRefs);
  return validateComparisonData(value, normalizeComparisonRequest(request), sourceRefs);
}
