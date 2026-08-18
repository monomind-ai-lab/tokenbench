import {
  parseUiDataContractV1,
  type AcceptedSourceAttribution,
  type AcceptedUiDataContractV1,
  type UiDataContractV1Method,
} from './contract-v1';
import type {
  CompareData,
  CompareQuery,
  EvidenceValue,
  LifecycleData,
  LifecycleModel,
  LifecycleQuery,
  ModelDirectoryData,
  ModelDirectoryQuery,
  ModelLifecycle,
  PreviewDataAdapter,
  PreviewModel,
  PreviewModelProfileData,
  Provenance,
  RankingData,
  RankingQuery,
  RoutePricing,
  SubscriptionData,
  SubscriptionPlan,
  SubscriptionQuery,
  TaskEconomics,
  UiDataContractV1,
} from './contracts';

type JsonRecord = Record<string, unknown>;

export interface PreviewDataTransport {
  request(method: UiDataContractV1Method, query: unknown): Promise<unknown>;
}

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

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) return fail(path, 'must be a non-empty string');
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(path, 'must be a finite number');
  return value;
}

function unavailable<T>(reason: string): EvidenceValue<T> {
  return { availability: 'unavailable', reason };
}

function provenance(source: AcceptedSourceAttribution): Provenance {
  return {
    id: source.sourceRef,
    label: source.label,
    kind: 'accepted_pipeline',
    effectiveAt: source.effectiveAt,
    note: `${source.sourceRevision} · ${source.fieldGroup}`,
  };
}

function provenanceByReference(envelope: AcceptedUiDataContractV1, reference: string): Provenance {
  const source = envelope.sources.find((candidate) => candidate.sourceRef === reference);
  if (!source) return fail('sourceRefs', `references an undeclared source ${reference}`);
  return provenance(source);
}

function evidenceSource(value: JsonRecord, envelope: AcceptedUiDataContractV1, path: string): Provenance {
  const sourceRefs = array(value.sourceRefs, `${path}.sourceRefs`);
  const sourceRef = string(sourceRefs[0], `${path}.sourceRefs[0]`);
  return provenanceByReference(envelope, sourceRef);
}

function rawEvidence<T>(
  value: unknown,
  envelope: AcceptedUiDataContractV1,
  path: string,
  map: (candidate: unknown, candidatePath: string) => T | null,
): EvidenceValue<T> {
  const item = record(value, path);
  if (item.availability === 'unavailable') return unavailable(string(item.reason, `${path}.reason`));
  if (item.availability !== 'available') return fail(`${path}.availability`, 'must be available or unavailable');
  const mapped = map(item.value, `${path}.value`);
  if (mapped === null) return unavailable(`No accepted ${path} value is available.`);
  return { availability: 'available', value: mapped, provenance: evidenceSource(item, envelope, path) };
}

function numericEvidence(value: unknown, envelope: AcceptedUiDataContractV1, path: string): EvidenceValue<number> {
  return rawEvidence(value, envelope, path, (candidate, candidatePath) => finiteNumber(candidate, candidatePath));
}

function textEvidence(value: unknown, envelope: AcceptedUiDataContractV1, path: string): EvidenceValue<string> {
  return rawEvidence(value, envelope, path, (candidate, candidatePath) => string(candidate, candidatePath));
}

function numericValue(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const item = value as JsonRecord;
  return item.availability === 'available' && typeof item.value === 'number' && Number.isFinite(item.value)
    ? item.value
    : null;
}

function sourceForAvailable(value: unknown, envelope: AcceptedUiDataContractV1, path: string): Provenance | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const item = value as JsonRecord;
  return item.availability === 'available' ? evidenceSource(item, envelope, path) : null;
}

function calendarDate(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function dateFromTimestamp(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : null;
}

function mapIdentity(value: unknown, envelope: AcceptedUiDataContractV1, path: string): EvidenceValue<{ readonly slug: string; readonly name: string; readonly provider: string }> {
  const item = record(value, path);
  return {
    availability: 'available',
    value: {
      slug: string(item.slug, `${path}.slug`),
      name: string(item.displayName, `${path}.displayName`),
      provider: string(item.organization, `${path}.organization`),
    },
    provenance: provenance(envelope.sources[0] ?? fail('sources', 'requires at least one source')),
  };
}

function mapModelLifecycle(value: unknown, envelope: AcceptedUiDataContractV1, path: string): EvidenceValue<ModelLifecycle> {
  return rawEvidence(value, envelope, path, (candidate, candidatePath) => {
    const status = string(candidate, candidatePath);
    return {
      status: status.toLocaleLowerCase() === 'current' ? 'Current' : 'Retirement scheduled',
      sunsetOn: unavailable('No accepted sunset date is available.'),
    };
  });
}

function mapRoutePricing(value: unknown, envelope: AcceptedUiDataContractV1, path: string): EvidenceValue<RoutePricing> {
  const route = record(value, path);
  if (route.status !== 'available') return unavailable('No accepted route price is available.');
  const input = numericEvidence(route.inputMicroDollarsPerMillion, envelope, `${path}.inputMicroDollarsPerMillion`);
  const output = numericEvidence(route.outputMicroDollarsPerMillion, envelope, `${path}.outputMicroDollarsPerMillion`);
  if (input.availability === 'unavailable' || output.availability === 'unavailable') return unavailable('No accepted route price is available.');
  const cacheRead = numericEvidence(route.cacheReadMicroDollarsPerMillion, envelope, `${path}.cacheReadMicroDollarsPerMillion`);
  const cacheWrite = numericEvidence(route.cacheWriteMicroDollarsPerMillion, envelope, `${path}.cacheWriteMicroDollarsPerMillion`);
  return {
    availability: 'available',
    value: {
      route: string(route.routeId, `${path}.routeId`),
      inputUsdPerMillion: input.value / 1_000_000,
      outputUsdPerMillion: output.value / 1_000_000,
      cache: {
        availability: 'available',
        value: {
          readUsdPerMillion: cacheRead.availability === 'available'
            ? { ...cacheRead, value: cacheRead.value / 1_000_000 }
            : cacheRead,
          writeUsdPerMillion: cacheWrite.availability === 'available'
            ? { ...cacheWrite, value: cacheWrite.value / 1_000_000 }
            : cacheWrite,
        },
        provenance: input.provenance,
      },
      blendedUsdPerMillion: unavailable('No accepted blended route price is available.'),
      longContextInputUsdPerMillion: unavailable('No accepted long-context input price is available.'),
    },
    provenance: input.provenance,
  };
}

function mapRuntime(value: unknown, envelope: AcceptedUiDataContractV1, path: string): EvidenceValue<{ readonly ttftP50Seconds: number; readonly outputTokensPerSecond: number; readonly conditions: string }> {
  const route = record(value, path);
  const ttft = numericEvidence(route.ttftP50Ms, envelope, `${path}.ttftP50Ms`);
  const tps = numericEvidence(route.tpsP50, envelope, `${path}.tpsP50`);
  if (ttft.availability === 'unavailable' || tps.availability === 'unavailable') return unavailable('No accepted runtime observation is available.');
  return {
    availability: 'available',
    value: {
      ttftP50Seconds: ttft.value / 1_000,
      outputTokensPerSecond: tps.value,
      conditions: `Accepted ${string(route.routeId, `${path}.routeId`)} p50 runtime observation.`,
    },
    provenance: ttft.provenance,
  };
}

function mapBenchmark(summary: JsonRecord, envelope: AcceptedUiDataContractV1, path: string, releaseOn: string | null): EvidenceValue<{ readonly releaseOn: string; readonly subtasks: readonly { readonly id: string; readonly label: string }[] }> {
  const categories = array(summary.categories, `${path}.categories`);
  if (releaseOn === null) return unavailable('No accepted benchmark release date is available.');
  const subtasks = categories.map((candidate, index) => {
    const category = record(candidate, `${path}.categories[${index}]`);
    return {
      id: string(category.dimensionId, `${path}.categories[${index}].dimensionId`),
      label: string(category.label, `${path}.categories[${index}].label`),
    };
  });
  const firstCategory = record(categories[0] ?? fail(`${path}.categories`, 'requires at least one category'), `${path}.categories[0]`);
  const scoreProvenance = sourceForAvailable(firstCategory.score, envelope, `${path}.categories[0].score`);
  if (!scoreProvenance) return unavailable('No accepted benchmark source is available.');
  return { availability: 'available', value: { releaseOn, subtasks }, provenance: scoreProvenance };
}

function mapCapability(summary: JsonRecord, envelope: AcceptedUiDataContractV1, path: string): EvidenceValue<{ readonly compositeScore: number; readonly radar: readonly { readonly key: string; readonly label: string; readonly percentile: number | null; readonly rank: number | null; readonly fieldSize: number | null }[] }> {
  const overall = record(summary.overall, `${path}.overall`);
  const score = numericEvidence(overall.score, envelope, `${path}.overall.score`);
  if (score.availability === 'unavailable') return unavailable(score.reason);
  const radar = array(summary.categories, `${path}.categories`).map((candidate, index) => {
    const category = record(candidate, `${path}.categories[${index}]`);
    return {
      key: string(category.dimensionId, `${path}.categories[${index}].dimensionId`),
      label: string(category.label, `${path}.categories[${index}].label`),
      percentile: numericValue(category.score),
      rank: numericValue(category.rank),
      fieldSize: numericValue(category.fieldSize),
    };
  });
  return { availability: 'available', value: { compositeScore: score.value, radar }, provenance: score.provenance };
}

function mapTaskEconomics(value: unknown, envelope: AcceptedUiDataContractV1, path: string): EvidenceValue<TaskEconomics> {
  const task = record(value, path);
  return rawEvidence(task.costPerSuccessfulEvaluationUsd, envelope, `${path}.costPerSuccessfulEvaluationUsd`, (candidate, candidatePath) => {
    const costUsdPerSuccessfulTask = finiteNumber(candidate, candidatePath);
    return { costUsdPerSuccessfulTask, workload: string(task.label, `${path}.label`) };
  });
}

function mapSummary(summaryCandidate: unknown, envelope: AcceptedUiDataContractV1, path: string, options: { readonly releaseOn?: string | null; readonly task?: unknown; readonly route?: unknown } = {}): PreviewModel {
  const summary = record(summaryCandidate, path);
  const identity = mapIdentity(summary.identity, envelope, `${path}.identity`);
  const openWeights = rawEvidence(summary.openWeights, envelope, `${path}.openWeights`, (candidate, candidatePath) => {
    if (typeof candidate !== 'boolean') fail(candidatePath, 'must be a boolean');
    return candidate ? 'Open weights' as const : 'Proprietary' as const;
  });
  const route = options.route ?? summary.selectedRoute;
  const releaseOn = options.releaseOn ?? dateFromTimestamp(envelope.freshness.benchmarkReleasedAt);
  const task = options.task;
  return {
    id: identity.availability === 'available' ? identity.value.slug : string(record(summary.identity, `${path}.identity`).slug, `${path}.identity.slug`),
    identity,
    access: openWeights,
    benchmark: mapBenchmark(summary, envelope, path, releaseOn),
    capability: mapCapability(summary, envelope, path),
    routePricing: mapRoutePricing(route, envelope, `${path}.selectedRoute`),
    taskEconomics: task === undefined ? unavailable('No accepted task-economics evidence is available.') : mapTaskEconomics(task, envelope, `${path}.task`),
    runtime: mapRuntime(route, envelope, `${path}.selectedRoute`),
    lifecycle: mapModelLifecycle(summary.lifecycleStatus, envelope, `${path}.lifecycleStatus`),
  };
}

function rootContract<T>(envelope: AcceptedUiDataContractV1, data: T | null): UiDataContractV1<T> {
  return {
    contractVersion: 'ui-data-contract/v1',
    status: envelope.status,
    ...(envelope.reason === null ? {} : { reason: envelope.reason }),
    fetchedAt: envelope.fetchedAt,
    effectiveAt: envelope.effectiveAt,
    data,
    provenance: envelope.sources.map(provenance),
  };
}

function mapModels(envelope: AcceptedUiDataContractV1<'models'>): UiDataContractV1<ModelDirectoryData> {
  if (envelope.data === null) return rootContract(envelope, null);
  const models = array(envelope.data.models, 'data.models').map((model, index) => mapSummary(model, envelope, `data.models[${index}]`));
  return rootContract(envelope, { models });
}

function mapProfile(envelope: AcceptedUiDataContractV1<'profile'>): UiDataContractV1<PreviewModelProfileData> {
  if (envelope.data === null) return rootContract(envelope, null);
  const profile = record(envelope.data.model, 'data.model');
  const summary = record(profile.summary, 'data.model.summary');
  const tasks = array(profile.tasks, 'data.model.tasks');
  return rootContract(envelope, {
    model: mapSummary(summary, envelope, 'data.model.summary', {
      releaseOn: calendarDate(profile.releaseOn),
      task: tasks[0],
      route: array(profile.routes, 'data.model.routes')[0],
    }),
  });
}

function mapLifecycleModel(value: unknown, envelope: AcceptedUiDataContractV1, path: string): LifecycleModel {
  const item = record(value, path);
  const events = array(item.events, `${path}.events`);
  const firstEvent = events.length > 0 ? record(events[0], `${path}.events[0]`) : null;
  const lifecycle: EvidenceValue<ModelLifecycle> = rawEvidence<ModelLifecycle>(item.status, envelope, `${path}.status`, (candidate, candidatePath) => {
    const status = string(candidate, candidatePath);
    const eventDate = firstEvent === null ? null : dateFromTimestamp(firstEvent.effectiveAt);
    return {
      status: status.toLocaleLowerCase() === 'current' ? 'Current' as const : 'Retirement scheduled' as const,
      sunsetOn: eventDate === null
        ? unavailable('No accepted sunset date is available.')
        : { availability: 'available' as const, value: eventDate, provenance: provenance(envelope.sources[0] ?? fail('sources', 'requires source')) },
    };
  });
  const identity = mapIdentity(item.identity, envelope, `${path}.identity`);
  return {
    modelId: identity.availability === 'available' ? identity.value.slug : string(record(item.identity, `${path}.identity`).slug, `${path}.identity.slug`),
    identity,
    lifecycle,
    replacement: rawEvidence(item.replacement, envelope, `${path}.replacement`, (candidate, candidatePath) => {
      const replacement = record(candidate, candidatePath);
      return {
        modelId: string(replacement.modelSlug, `${candidatePath}.modelSlug`),
        migrationNote: string(replacement.migrationNote, `${candidatePath}.migrationNote`),
      };
    }),
  };
}

function mapLifecycle(envelope: AcceptedUiDataContractV1<'lifecycle'>): UiDataContractV1<LifecycleData> {
  if (envelope.data === null) return rootContract(envelope, null);
  return rootContract(envelope, {
    models: array(envelope.data.models, 'data.models').map((model, index) => mapLifecycleModel(model, envelope, `data.models[${index}]`)),
  });
}

function mapRankings(envelope: AcceptedUiDataContractV1<'rankings'>): UiDataContractV1<RankingData> {
  if (envelope.data === null) return rootContract(envelope, null);
  const rows = array(envelope.data.rows, 'data.rows');
  return rootContract(envelope, {
    models: rows.map((candidate, index) => {
      const row = record(candidate, `data.rows[${index}]`);
      const model = mapSummary(row.model, envelope, `data.rows[${index}].model`, { task: Array.isArray(row.taskEconomics) ? row.taskEconomics[0] : undefined });
      const rawRank = row.rank ?? row.sourceRank;
      const rank = typeof rawRank === 'number' && Number.isFinite(rawRank)
        ? { availability: 'available' as const, value: rawRank, provenance: provenance(envelope.sources[0] ?? fail('sources', 'requires source')) }
        : unavailable<number>('No accepted ranking position is available.');
      return { model, rank };
    }),
  });
}

function mapComparison(envelope: AcceptedUiDataContractV1<'comparison'>, query: CompareQuery): UiDataContractV1<CompareData> {
  if (query.modelIds.length < 2 || query.modelIds.length > 4 || new Set(query.modelIds).size !== query.modelIds.length) {
    throw new RangeError('comparison requires 2–4 ordered distinct model slugs');
  }
  if (envelope.data === null) return rootContract(envelope, null);
  const profiles = array(envelope.data.models, 'data.models').map((candidate, index) => record(candidate, `data.models[${index}]`));
  const modelsBySlug = new Map(profiles.map((profile, index) => {
    const summary = record(profile.summary, `data.models[${index}].summary`);
    const tasks = array(profile.tasks, `data.models[${index}].tasks`);
    return [string(record(summary.identity, `data.models[${index}].summary.identity`).slug, `data.models[${index}].summary.identity.slug`), mapSummary(summary, envelope, `data.models[${index}].summary`, {
      releaseOn: calendarDate(profile.releaseOn),
      task: tasks[0],
      route: array(profile.routes, `data.models[${index}].routes`)[0],
    })] as const;
  }));
  const models = query.modelIds.flatMap((slug) => {
    const model = modelsBySlug.get(slug);
    return model ? [model] : [];
  });
  const unavailableModelIds = query.modelIds
    .filter((slug) => !modelsBySlug.has(slug))
    .map((slug) => unavailable<string>(`No accepted comparison evidence is available for ${slug}.`));
  return rootContract(envelope, { models, unavailableModelIds });
}

function mapSubscriptionModel(slug: string, route: unknown, envelope: AcceptedUiDataContractV1, path: string): PreviewModel {
  return {
    id: slug,
    identity: unavailable(`No accepted model identity is available for ${slug}.`),
    access: unavailable('No accepted model access evidence is available.'),
    benchmark: unavailable('No accepted benchmark evidence is available.'),
    capability: unavailable('No accepted capability evidence is available.'),
    routePricing: mapRoutePricing(route, envelope, path),
    taskEconomics: unavailable('No accepted task-economics evidence is available.'),
    runtime: mapRuntime(route, envelope, path),
    lifecycle: unavailable('No accepted lifecycle evidence is available.'),
  };
}

function mapSubscription(envelope: AcceptedUiDataContractV1<'subscription'>): UiDataContractV1<SubscriptionData> {
  if (envelope.data === null) return rootContract(envelope, null);
  const plans = array(envelope.data.plans, 'data.plans').map((candidate, index): SubscriptionPlan => {
    const plan = record(candidate, `data.plans[${index}]`);
    const sourceRefs = array(plan.sourceRefs, `data.plans[${index}].sourceRefs`);
    const source = provenanceByReference(envelope, string(sourceRefs[0], `data.plans[${index}].sourceRefs[0]`));
    return {
      id: string(plan.planId, `data.plans[${index}].planId`),
      provider: { availability: 'available', value: string(plan.providerId, `data.plans[${index}].providerId`), provenance: source },
      displayName: { availability: 'available', value: string(plan.displayName, `data.plans[${index}].displayName`), provenance: source },
      monthlyUsd: { availability: 'available', value: finiteNumber(plan.monthlyCostMicroDollars, `data.plans[${index}].monthlyCostMicroDollars`) / 1_000_000, provenance: source },
      includedUsage: unavailable('No accepted included-usage entitlement is available.'),
    };
  });
  const routes = array(envelope.data.routes, 'data.routes').map((route, index) => record(route, `data.routes[${index}]`));
  const modelMix = array(envelope.request.modelMix ?? [], 'request.modelMix');
  const models = modelMix.map((candidate, index) => {
    const mix = record(candidate, `request.modelMix[${index}]`);
    const routeId = string(mix.routeId, `request.modelMix[${index}].routeId`);
    const route = routes.find((candidate) => candidate.routeId === routeId);
    if (!route) return fail('data.routes', `does not contain ${routeId}`);
    return mapSubscriptionModel(string(mix.modelSlug, `request.modelMix[${index}].modelSlug`), route, envelope, `data.routes[${routeId}]`);
  });
  return rootContract(envelope, {
    plans,
    models,
    selectedModelTaskEconomics: unavailable('No accepted selected-model task-economics evidence is available.'),
  });
}

export function createValidatedPreviewDataAdapter(transport: PreviewDataTransport): PreviewDataAdapter {
  return {
    async models(query: ModelDirectoryQuery) {
      return mapModels(parseUiDataContractV1(await transport.request('models', query), 'models'));
    },
    async profile(slug: string) {
      return mapProfile(parseUiDataContractV1(await transport.request('profile', { slug }), 'profile'));
    },
    async lifecycle(query: LifecycleQuery) {
      return mapLifecycle(parseUiDataContractV1(await transport.request('lifecycle', query), 'lifecycle'));
    },
    async rankings(query: RankingQuery) {
      return mapRankings(parseUiDataContractV1(await transport.request('rankings', query), 'rankings'));
    },
    async comparison(query: CompareQuery) {
      return mapComparison(parseUiDataContractV1(await transport.request('comparison', query), 'comparison'), query);
    },
    async subscription(query: SubscriptionQuery) {
      return mapSubscription(parseUiDataContractV1(await transport.request('subscription', query), 'subscription'));
    },
  };
}
