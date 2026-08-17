import type {
  CompareData,
  LifecycleData,
  ModelDirectoryData,
  PreviewDataAdapter,
  PreviewModelProfileData,
  RankingData,
  SubscriptionData,
  UiDataContractV1,
} from './contracts';

export type UiDataContractV1Method = keyof Pick<
  PreviewDataAdapter,
  'models' | 'profile' | 'lifecycle' | 'rankings' | 'comparison' | 'subscription'
>;

type UiDataContractV1ResponseByMethod = {
  readonly models: UiDataContractV1<ModelDirectoryData>;
  readonly profile: UiDataContractV1<PreviewModelProfileData>;
  readonly lifecycle: UiDataContractV1<LifecycleData>;
  readonly rankings: UiDataContractV1<RankingData>;
  readonly comparison: UiDataContractV1<CompareData>;
  readonly subscription: UiDataContractV1<SubscriptionData>;
};

type JsonRecord = Record<string, unknown>;
type ValueValidator = (value: unknown, path: string) => void;

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(path: string, message: string): never {
  throw new TypeError(`${path} ${message}`);
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'must be an object');
  }
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, path: string, required: readonly string[], optional: readonly string[] = []): void {
  for (const key of required) {
    if (!(key in value)) fail(path, `is missing required field ${key}`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(path, `contains undeclared field ${key}`);
  }
}

function string(value: unknown, path: string, allowEmpty = false): void {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    fail(path, 'must be a non-empty string');
  }
}

function number(value: unknown, path: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number');
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) return fail(path, 'must be an array');
  return value;
}

/** Strict format predicate also registered with Ajv by the consumer-contract tests. */
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

/** Strict format predicate also registered with Ajv by the consumer-contract tests. */
export function isStrictCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  const [year, month, day] = value.split('-').map(Number);
  return Number.isFinite(parsed.getTime())
    && parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function utcTimestamp(value: unknown, path: string): void {
  if (typeof value !== 'string' || !isStrictUtcTimestamp(value)) {
    fail(path, 'must be a UTC ISO-8601 timestamp ending in Z');
  }
}

function date(value: unknown, path: string): void {
  if (typeof value !== 'string' || !isStrictCalendarDate(value)) {
    fail(path, 'must be an ISO-8601 calendar date');
  }
}

function provenance(value: unknown, path: string): void {
  const source = record(value, path);
  exactKeys(source, path, ['id', 'label', 'kind', 'effectiveAt', 'note']);
  string(source.id, `${path}.id`);
  string(source.label, `${path}.label`);
  if (source.kind !== 'illustrative_prototype' && source.kind !== 'approved_manual') {
    fail(`${path}.kind`, 'must be illustrative_prototype or approved_manual');
  }
  utcTimestamp(source.effectiveAt, `${path}.effectiveAt`);
  string(source.note, `${path}.note`);
}

function evidence(value: unknown, path: string, validateValue: ValueValidator): void {
  const item = record(value, path);
  if (item.availability === 'available') {
    exactKeys(item, path, ['availability', 'value', 'provenance']);
    provenance(item.provenance, `${path}.provenance`);
    validateValue(item.value, `${path}.value`);
    return;
  }
  if (item.availability === 'unavailable') {
    exactKeys(item, path, ['availability', 'reason'], ['provenance']);
    if (typeof item.reason !== 'string' || item.reason.trim().length === 0) {
      fail(`${path}.reason`, 'requires a non-empty reason');
    }
    if ('provenance' in item) provenance(item.provenance, `${path}.provenance`);
    return;
  }
  fail(`${path}.availability`, 'must be available or unavailable');
}

function modelIdentity(value: unknown, path: string): void {
  const identity = record(value, path);
  exactKeys(identity, path, ['slug', 'name', 'provider']);
  string(identity.slug, `${path}.slug`);
  string(identity.name, `${path}.name`);
  string(identity.provider, `${path}.provider`);
}

function modelAccess(value: unknown, path: string): void {
  if (value !== 'Proprietary' && value !== 'Open weights') {
    fail(path, 'must be Proprietary or Open weights');
  }
}

function benchmarkRelease(value: unknown, path: string): void {
  const release = record(value, path);
  exactKeys(release, path, ['releaseOn', 'subtasks']);
  date(release.releaseOn, `${path}.releaseOn`);
  array(release.subtasks, `${path}.subtasks`).forEach((subtask, index) => {
    const item = record(subtask, `${path}.subtasks[${index}]`);
    exactKeys(item, `${path}.subtasks[${index}]`, ['id', 'label']);
    string(item.id, `${path}.subtasks[${index}].id`);
    string(item.label, `${path}.subtasks[${index}].label`);
  });
}

function capability(value: unknown, path: string): void {
  const capabilityValue = record(value, path);
  exactKeys(capabilityValue, path, ['compositeScore', 'radar']);
  number(capabilityValue.compositeScore, `${path}.compositeScore`);
  array(capabilityValue.radar, `${path}.radar`).forEach((axis, index) => {
    const itemPath = `${path}.radar[${index}]`;
    const item = record(axis, itemPath);
    exactKeys(item, itemPath, ['key', 'label', 'percentile', 'rank', 'fieldSize']);
    string(item.key, `${itemPath}.key`);
    string(item.label, `${itemPath}.label`);
    nullableNumber(item.percentile, `${itemPath}.percentile`);
    nullableNumber(item.rank, `${itemPath}.rank`);
    nullableNumber(item.fieldSize, `${itemPath}.fieldSize`);
  });
}

function nullableNumber(value: unknown, path: string): void {
  if (value !== null) number(value, path);
}

function cachePricing(value: unknown, path: string): void {
  const cache = record(value, path);
  exactKeys(cache, path, ['readUsdPerMillion', 'writeUsdPerMillion']);
  evidence(cache.readUsdPerMillion, `${path}.readUsdPerMillion`, number);
  evidence(cache.writeUsdPerMillion, `${path}.writeUsdPerMillion`, number);
}

function routePricing(value: unknown, path: string): void {
  const pricing = record(value, path);
  exactKeys(pricing, path, ['route', 'inputUsdPerMillion', 'outputUsdPerMillion', 'cache'], ['blendedUsdPerMillion', 'longContextInputUsdPerMillion']);
  string(pricing.route, `${path}.route`);
  number(pricing.inputUsdPerMillion, `${path}.inputUsdPerMillion`);
  number(pricing.outputUsdPerMillion, `${path}.outputUsdPerMillion`);
  if ('blendedUsdPerMillion' in pricing) evidence(pricing.blendedUsdPerMillion, `${path}.blendedUsdPerMillion`, number);
  if ('longContextInputUsdPerMillion' in pricing) evidence(pricing.longContextInputUsdPerMillion, `${path}.longContextInputUsdPerMillion`, number);
  evidence(pricing.cache, `${path}.cache`, cachePricing);
}

function taskEconomics(value: unknown, path: string): void {
  const economics = record(value, path);
  exactKeys(economics, path, ['costUsdPerSuccessfulTask', 'workload']);
  number(economics.costUsdPerSuccessfulTask, `${path}.costUsdPerSuccessfulTask`);
  string(economics.workload, `${path}.workload`);
}

function runtimeSla(value: unknown, path: string): void {
  const runtime = record(value, path);
  exactKeys(runtime, path, ['ttftP50Seconds', 'outputTokensPerSecond', 'conditions']);
  number(runtime.ttftP50Seconds, `${path}.ttftP50Seconds`);
  number(runtime.outputTokensPerSecond, `${path}.outputTokensPerSecond`);
  string(runtime.conditions, `${path}.conditions`);
}

function lifecycle(value: unknown, path: string): void {
  const lifecycleValue = record(value, path);
  exactKeys(lifecycleValue, path, ['status', 'sunsetOn']);
  if (lifecycleValue.status !== 'Current' && lifecycleValue.status !== 'Retirement scheduled') {
    fail(`${path}.status`, 'must be Current or Retirement scheduled');
  }
  evidence(lifecycleValue.sunsetOn, `${path}.sunsetOn`, date);
}

function previewModel(value: unknown, path: string): void {
  const model = record(value, path);
  exactKeys(model, path, [
    'id',
    'identity',
    'access',
    'benchmark',
    'capability',
    'routePricing',
    'taskEconomics',
    'runtime',
    'lifecycle',
  ]);
  string(model.id, `${path}.id`);
  evidence(model.identity, `${path}.identity`, modelIdentity);
  evidence(model.access, `${path}.access`, modelAccess);
  evidence(model.benchmark, `${path}.benchmark`, benchmarkRelease);
  evidence(model.capability, `${path}.capability`, capability);
  evidence(model.routePricing, `${path}.routePricing`, routePricing);
  evidence(model.taskEconomics, `${path}.taskEconomics`, taskEconomics);
  evidence(model.runtime, `${path}.runtime`, runtimeSla);
  evidence(model.lifecycle, `${path}.lifecycle`, lifecycle);
}

function lifecycleModel(value: unknown, path: string): void {
  const model = record(value, path);
  exactKeys(model, path, ['modelId', 'identity', 'lifecycle', 'replacement']);
  string(model.modelId, `${path}.modelId`);
  evidence(model.identity, `${path}.identity`, modelIdentity);
  evidence(model.lifecycle, `${path}.lifecycle`, lifecycle);
  evidence(model.replacement, `${path}.replacement`, (replacement, replacementPath) => {
    const item = record(replacement, replacementPath);
    exactKeys(item, replacementPath, ['modelId', 'migrationNote']);
    string(item.modelId, `${replacementPath}.modelId`);
    string(item.migrationNote, `${replacementPath}.migrationNote`);
  });
}

function rankingEntry(value: unknown, path: string): void {
  const entry = record(value, path);
  exactKeys(entry, path, ['model', 'rank']);
  previewModel(entry.model, `${path}.model`);
  evidence(entry.rank, `${path}.rank`, number);
}

function subscriptionPlan(value: unknown, path: string): void {
  const plan = record(value, path);
  exactKeys(plan, path, ['id', 'provider', 'displayName', 'monthlyUsd', 'includedUsage']);
  string(plan.id, `${path}.id`);
  evidence(plan.provider, `${path}.provider`, string);
  evidence(plan.displayName, `${path}.displayName`, string);
  evidence(plan.monthlyUsd, `${path}.monthlyUsd`, number);
  evidence(plan.includedUsage, `${path}.includedUsage`, string);
}

function methodData(value: unknown, method: UiDataContractV1Method): void {
  const data = record(value, 'data');
  switch (method) {
    case 'models':
      exactKeys(data, 'data', ['models']);
      array(data.models, 'data.models').forEach((model, index) => previewModel(model, `data.models[${index}]`));
      return;
    case 'profile':
      exactKeys(data, 'data', ['model']);
      previewModel(data.model, 'data.model');
      return;
    case 'lifecycle':
      exactKeys(data, 'data', ['models']);
      array(data.models, 'data.models').forEach((model, index) => lifecycleModel(model, `data.models[${index}]`));
      return;
    case 'rankings':
      exactKeys(data, 'data', ['models']);
      array(data.models, 'data.models').forEach((model, index) => rankingEntry(model, `data.models[${index}]`));
      return;
    case 'comparison':
      exactKeys(data, 'data', ['models', 'unavailableModelIds']);
      array(data.models, 'data.models').forEach((model, index) => previewModel(model, `data.models[${index}]`));
      array(data.unavailableModelIds, 'data.unavailableModelIds')
        .forEach((modelId, index) => evidence(modelId, `data.unavailableModelIds[${index}]`, string));
      return;
    case 'subscription':
      exactKeys(data, 'data', ['plans', 'models', 'selectedModelTaskEconomics']);
      array(data.plans, 'data.plans').forEach((plan, index) => subscriptionPlan(plan, `data.plans[${index}]`));
      array(data.models, 'data.models').forEach((model, index) => previewModel(model, `data.models[${index}]`));
      evidence(data.selectedModelTaskEconomics, 'data.selectedModelTaskEconomics', taskEconomics);
      return;
  }
}

/**
 * Parses the proposed consumer envelope without selecting, calling, or
 * configuring a runtime adapter. The caller supplies the requested method so
 * the generic JSON envelope is checked against its matching result shape.
 */
export function parseUiDataContractV1<M extends UiDataContractV1Method>(
  candidate: unknown,
  method: M,
): UiDataContractV1ResponseByMethod[M] {
  const envelope = record(candidate, 'UI data contract envelope');
  const envelopeKeys = new Set([
    'contractVersion',
    'status',
    'fetchedAt',
    'effectiveAt',
    'data',
    'provenance',
    'reason',
  ]);
  for (const key of Object.keys(envelope)) {
    if (!envelopeKeys.has(key)) fail('UI data contract envelope', `contains undeclared envelope field ${key}`);
  }
  exactKeys(envelope, 'UI data contract envelope', [
    'contractVersion',
    'status',
    'fetchedAt',
    'effectiveAt',
    'data',
    'provenance',
  ], ['reason']);

  if (envelope.contractVersion !== 'ui-data-contract/v1') {
    fail('contractVersion', 'is an Unsupported UI data contract version');
  }
  if (envelope.status !== 'available' && envelope.status !== 'partial' && envelope.status !== 'unavailable') {
    fail('status', 'must be available, partial, or unavailable');
  }
  utcTimestamp(envelope.fetchedAt, 'fetchedAt');
  if (envelope.effectiveAt !== null) utcTimestamp(envelope.effectiveAt, 'effectiveAt');

  array(envelope.provenance, 'provenance').forEach((source, index) => provenance(source, `provenance[${index}]`));

  if (envelope.status === 'unavailable') {
    if (envelope.data !== null) fail('data', 'must be null when status is unavailable');
    if (envelope.effectiveAt !== null) fail('effectiveAt', 'must be null when status is unavailable');
    string(envelope.reason, 'reason');
    return envelope as unknown as UiDataContractV1ResponseByMethod[M];
  }

  if ('reason' in envelope) fail('reason', 'is only allowed when status is unavailable');
  if (envelope.data === null) fail('data', 'must be present when status is available or partial');
  if (envelope.status === 'available' && envelope.effectiveAt === null) {
    fail('effectiveAt', 'must be non-null when status is available');
  }

  methodData(envelope.data, method);
  return envelope as unknown as UiDataContractV1ResponseByMethod[M];
}
