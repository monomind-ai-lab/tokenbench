import type {
  AcceptedSourceAttribution,
  AcceptedUiDataContractV1,
  UiDataContractV1Method,
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
  RankingAggregateEconomics,
  RankingData,
  RankingEntry,
  RankingQuery,
  RankingReleaseReceipt,
  RankingTaskEconomics,
  RankingTaxonomyCategory,
  RoutePricing,
  SubscriptionCalculation,
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

async function parseAcceptedContract<M extends UiDataContractV1Method>(candidate: unknown, expectedMethod: M): Promise<AcceptedUiDataContractV1<M>> {
  const { parseUiDataContractV1 } = await import('./contract-v1');
  return parseUiDataContractV1(candidate, expectedMethod);
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
    url: source.url,
    note: `${source.sourceRevision} · ${source.fieldGroup}`,
  };
}

function provenanceByReference(envelope: AcceptedUiDataContractV1, reference: string): Provenance {
  const source = envelope.sources.find((candidate) => candidate.sourceRef === reference);
  if (!source) return fail('sourceRefs', `references an undeclared source ${reference}`);
  return provenance(source);
}

function provenancesByReference(value: unknown, envelope: AcceptedUiDataContractV1, path: string): readonly Provenance[] {
  return array(value, path).map((reference, index) => provenanceByReference(envelope, string(reference, `${path}[${index}]`)));
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

function rankingNumericEvidence(value: unknown, envelope: AcceptedUiDataContractV1, path: string): EvidenceValue<number> {
  const item = record(value, path);
  if (item.availability !== 'unavailable') return numericEvidence(item, envelope, path);
  const reason = string(item.reason, `${path}.reason`);
  const sourceRefs = array(item.sourceRefs, `${path}.sourceRefs`);
  const sourceRef = sourceRefs[0];
  return sourceRef === undefined
    ? unavailable(reason)
    : { availability: 'unavailable', reason, provenance: provenanceByReference(envelope, string(sourceRef, `${path}.sourceRefs[0]`)) };
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

function lifecycleStatus(value: string): ModelLifecycle['status'] | null {
  switch (value.toLocaleLowerCase()) {
    case 'current': return 'Current';
    case 'sunset_scheduled': return 'Retirement scheduled';
    case 'retired': return 'Retired';
    default: return null;
  }
}

function mapModelLifecycle(value: unknown, envelope: AcceptedUiDataContractV1, path: string): EvidenceValue<ModelLifecycle> {
  return rawEvidence(value, envelope, path, (candidate, candidatePath) => {
    const status = lifecycleStatus(string(candidate, candidatePath));
    if (status === null) return null;
    return {
      status,
      sunsetOn: unavailable('No accepted sunset date is available.'),
    };
  });
}

function mapRoutePricing(value: unknown, envelope: AcceptedUiDataContractV1, path: string): EvidenceValue<RoutePricing> {
  if (value === null) return unavailable('No accepted route price is available.');
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
      contextWindowTokens: numericEvidence(route.contextWindowTokens, envelope, `${path}.contextWindowTokens`),
      maxOutputTokens: numericEvidence(route.maxOutputTokens, envelope, `${path}.maxOutputTokens`),
      inputModalities: array(route.inputModalities, `${path}.inputModalities`).map((candidate, index) => string(candidate, `${path}.inputModalities[${index}]`)),
      outputModalities: array(route.outputModalities, `${path}.outputModalities`).map((candidate, index) => string(candidate, `${path}.outputModalities[${index}]`)),
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
  if (value === null) return unavailable('No accepted runtime observation is available.');
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

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameJsonValue(value, right[index]));
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false;
  const leftRecord = left as JsonRecord;
  const rightRecord = right as JsonRecord;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(leftRecord[key], rightRecord[key]));
}

function normalizedModelsRequest(query: ModelDirectoryQuery): JsonRecord {
  const providerIds = query.providerIds
    ? [...query.providerIds, ...(query.provider === undefined ? [] : [query.provider])]
    : query.provider === undefined ? [] : [query.provider];
  return {
    search: query.search ?? null,
    access: query.access === 'Open weights' ? 'open_weights' : query.access === 'Proprietary' ? 'proprietary' : 'all',
    providerIds: [...new Set(providerIds)],
    limit: query.limit ?? 3,
    cursor: query.cursor ?? null,
  };
}

function normalizedLifecycleRequest(query: LifecycleQuery): JsonRecord {
  return { asOf: query.asOf, horizonDays: query.horizonDays };
}

function normalizedLeaderboardRequest(query: RankingQuery): JsonRecord {
  const filters = query.filters;
  return {
    operation: 'leaderboard',
    releaseId: query.releaseId ?? null,
    filters: {
      organizationIds: filters?.organizationIds ?? [],
      openWeights: filters?.openWeights ?? 'all',
      excludeDerivativeFinetunes: filters?.excludeDerivativeFinetunes ?? false,
    },
    limit: query.limit ?? 50,
    cursor: query.cursor ?? null,
  };
}

function normalizedCustomRankingRequest(query: RankingQuery): JsonRecord {
  const filters = query.filters;
  const access = filters?.access === 'open' ? 'open_weights' : filters?.access === 'closed' ? 'proprietary' : filters?.access ?? 'all';
  return {
    operation: 'custom',
    dimensionSetRevision: query.dimensionSetRevision ?? null,
    weights: query.weights ?? null,
    filters: {
      access,
      providerIds: filters?.providerIds ?? [],
      excludeDerivativeFinetunes: filters?.excludeDerivativeFinetunes ?? false,
      requiredInputModalities: filters?.requiredInputModalities ?? [],
      maxInputMicroDollarsPerMillion: filters?.maxInputMicroDollarsPerMillion ?? null,
      maxOutputMicroDollarsPerMillion: filters?.maxOutputMicroDollarsPerMillion ?? null,
      minTpsP50: filters?.minTpsP50 ?? null,
      maxTtftP50Ms: filters?.maxTtftP50Ms ?? null,
      minContextWindowTokens: filters?.minContextWindowTokens ?? null,
      minMaxOutputTokens: filters?.minMaxOutputTokens ?? null,
    },
    includeIneligible: query.includeIneligible ?? false,
    limit: query.limit ?? 50,
  };
}

function normalizedRankingsRequest(query: RankingQuery): JsonRecord {
  return query.operation === 'custom' ? normalizedCustomRankingRequest(query) : normalizedLeaderboardRequest(query);
}

function normalizedComparisonRequest(query: CompareQuery): JsonRecord {
  return { modelSlugs: [...query.modelIds] };
}

function normalizedSubscriptionRequest(query: SubscriptionQuery): JsonRecord {
  if (query.operation !== 'calculate') return { operation: 'catalog' };
  return {
    operation: 'calculate',
    planId: query.planId ?? null,
    seats: query.seats ?? null,
    modelMix: query.modelMix ?? null,
    workload: query.workload ?? null,
    cacheReadShareBasisPoints: query.cacheReadShareBasisPoints ?? null,
    cacheWriteShareBasisPoints: query.cacheWriteShareBasisPoints ?? null,
    crossoverTokenVolume: query.crossoverTokenVolume ?? null,
  };
}

function normalizedRequest(method: UiDataContractV1Method, query: unknown): JsonRecord {
  switch (method) {
    case 'models': return normalizedModelsRequest(query as ModelDirectoryQuery);
    case 'profile': return { slug: (query as { readonly slug: string }).slug };
    case 'lifecycle': return normalizedLifecycleRequest(query as LifecycleQuery);
    case 'rankings': return normalizedRankingsRequest(query as RankingQuery);
    case 'comparison': return normalizedComparisonRequest(query as CompareQuery);
    case 'subscription': return normalizedSubscriptionRequest(query as SubscriptionQuery);
  }
}

function requestMatches(envelope: AcceptedUiDataContractV1, query: unknown): boolean {
  return sameJsonValue(envelope.request, normalizedRequest(envelope.method, query));
}

function unmatchedRequest<T>(envelope: AcceptedUiDataContractV1): UiDataContractV1<T> {
  return {
    contractVersion: 'ui-data-contract/v1',
    status: 'unavailable',
    reason: `Accepted ${envelope.method} evidence request does not match the requested query.`,
    fetchedAt: envelope.fetchedAt,
    effectiveAt: null,
    data: null,
    provenance: [],
  };
}

function mapModels(envelope: AcceptedUiDataContractV1<'models'>): UiDataContractV1<ModelDirectoryData> {
  if (envelope.data === null) return rootContract<ModelDirectoryData>(envelope, null);
  const models = array(envelope.data.models, 'data.models').map((model, index) => mapSummary(model, envelope, `data.models[${index}]`));
  return rootContract(envelope, { models });
}

function mapProfile(envelope: AcceptedUiDataContractV1<'profile'>): UiDataContractV1<PreviewModelProfileData> {
  if (envelope.data === null) return rootContract<PreviewModelProfileData>(envelope, null);
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
    const status = lifecycleStatus(string(candidate, candidatePath));
    if (status === null) return null;
    const eventDate = firstEvent === null ? null : dateFromTimestamp(firstEvent.effectiveAt);
    return {
      status,
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
  if (envelope.data === null) return rootContract<LifecycleData>(envelope, null);
  return rootContract(envelope, {
    models: array(envelope.data.models, 'data.models').map((model, index) => mapLifecycleModel(model, envelope, `data.models[${index}]`)),
  });
}

function mapRankingTaskEconomics(value: unknown, envelope: AcceptedUiDataContractV1, path: string): RankingTaskEconomics {
  const task = record(value, path);
  return {
    taskId: string(task.taskId, `${path}.taskId`),
    label: string(task.label, `${path}.label`),
    categoryId: string(task.categoryId, `${path}.categoryId`),
    score: rankingNumericEvidence(task.score, envelope, `${path}.score`),
    questionCount: rankingNumericEvidence(task.questionCount, envelope, `${path}.questionCount`),
    evaluationCostUsd: rankingNumericEvidence(task.evaluationCostUsd, envelope, `${path}.evaluationCostUsd`),
    inputPriceUsdPerMillion: rankingNumericEvidence(task.inputPriceUsdPerMillion, envelope, `${path}.inputPriceUsdPerMillion`),
    outputPriceUsdPerMillion: rankingNumericEvidence(task.outputPriceUsdPerMillion, envelope, `${path}.outputPriceUsdPerMillion`),
    equivalentSuccesses: rankingNumericEvidence(task.equivalentSuccesses, envelope, `${path}.equivalentSuccesses`),
    costPerSuccessfulEvaluationUsd: rankingNumericEvidence(task.costPerSuccessfulEvaluationUsd, envelope, `${path}.costPerSuccessfulEvaluationUsd`),
    meanInputTokens: rankingNumericEvidence(task.meanInputTokens, envelope, `${path}.meanInputTokens`),
    meanOutputTokens: rankingNumericEvidence(task.meanOutputTokens, envelope, `${path}.meanOutputTokens`),
  };
}

function mapRankingAggregate(row: JsonRecord, envelope: AcceptedUiDataContractV1, path: string): RankingAggregateEconomics {
  if (typeof row.pareto !== 'boolean') return fail(`${path}.pareto`, 'must be a boolean');
  return {
    costPerSuccessfulEvaluationUsd: rankingNumericEvidence(row.costPerSuccessfulEvaluationUsd, envelope, `${path}.costPerSuccessfulEvaluationUsd`),
    meanOutputTokens: rankingNumericEvidence(row.meanOutputTokens, envelope, `${path}.meanOutputTokens`),
    pareto: row.pareto,
  };
}

function mapLeaderboardRelease(data: JsonRecord, envelope: AcceptedUiDataContractV1): RankingReleaseReceipt {
  const release = record(data.release, 'data.release');
  return {
    releaseId: string(release.releaseId, 'data.release.releaseId'),
    releaseOn: calendarDate(release.releaseOn) ?? fail('data.release.releaseOn', 'must be a calendar date'),
    licenseId: string(release.licenseId, 'data.release.licenseId'),
    provenance: provenancesByReference(release.sourceRefs, envelope, 'data.release.sourceRefs'),
  };
}

function mapLeaderboardTaxonomy(data: JsonRecord): readonly RankingTaxonomyCategory[] {
  return array(data.taxonomy, 'data.taxonomy').map((candidate, categoryIndex) => {
    const category = record(candidate, `data.taxonomy[${categoryIndex}]`);
    return {
      categoryId: string(category.categoryId, `data.taxonomy[${categoryIndex}].categoryId`),
      label: string(category.label, `data.taxonomy[${categoryIndex}].label`),
      tasks: array(category.tasks, `data.taxonomy[${categoryIndex}].tasks`).map((taskCandidate, taskIndex) => {
        const task = record(taskCandidate, `data.taxonomy[${categoryIndex}].tasks[${taskIndex}]`);
        return {
          taskId: string(task.taskId, `data.taxonomy[${categoryIndex}].tasks[${taskIndex}].taskId`),
          label: string(task.label, `data.taxonomy[${categoryIndex}].tasks[${taskIndex}].label`),
        };
      }),
    };
  });
}

function mapRankingRows(
  rows: readonly unknown[],
  envelope: AcceptedUiDataContractV1<'rankings'>,
  leaderboard: boolean,
): readonly RankingEntry[] {
  return rows.map((candidate, index): RankingEntry => {
    const path = `data.rows[${index}]`;
    const row = record(candidate, path);
    const tasks = leaderboard ? array(row.taskEconomics, `${path}.taskEconomics`) : [];
    const model = mapSummary(row.model, envelope, `${path}.model`, { task: tasks[0] });
    const rawRank = row.rank ?? row.sourceRank;
    const rank = typeof rawRank === 'number' && Number.isFinite(rawRank)
      ? { availability: 'available' as const, value: rawRank, provenance: provenance(envelope.sources[0] ?? fail('sources', 'requires source')) }
      : unavailable<number>('No accepted ranking position is available.');
    if (!leaderboard) return { model, rank };
    return {
      model,
      rank,
      sourceRank: finiteNumber(row.sourceRank, `${path}.sourceRank`),
      aggregate: mapRankingAggregate(row, envelope, path),
      taskEconomics: tasks.map((task, taskIndex) => mapRankingTaskEconomics(task, envelope, `${path}.taskEconomics[${taskIndex}]`)),
    };
  });
}

function mapRankings(envelope: AcceptedUiDataContractV1<'rankings'>): UiDataContractV1<RankingData> {
  if (envelope.data === null) return rootContract<RankingData>(envelope, null);
  const rows = array(envelope.data.rows, 'data.rows');
  if (envelope.data.operation !== 'leaderboard') return rootContract(envelope, { models: mapRankingRows(rows, envelope, false) });
  return rootContract(envelope, {
    models: mapRankingRows(rows, envelope, true),
    release: mapLeaderboardRelease(envelope.data, envelope),
    taxonomy: mapLeaderboardTaxonomy(envelope.data),
    total: finiteNumber(envelope.data.total, 'data.total'),
    nextCursor: envelope.data.nextCursor === null ? null : string(envelope.data.nextCursor, 'data.nextCursor'),
  });
}

function mapComparison(envelope: AcceptedUiDataContractV1<'comparison'>, query: CompareQuery): UiDataContractV1<CompareData> {
  if (query.modelIds.length < 2 || query.modelIds.length > 4 || new Set(query.modelIds).size !== query.modelIds.length) {
    throw new RangeError('comparison requires 2–4 ordered distinct model slugs');
  }
  if (envelope.data === null) return rootContract<CompareData>(envelope, null);
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

function mapSubscriptionCalculation(envelope: AcceptedUiDataContractV1<'subscription'>): EvidenceValue<SubscriptionCalculation> {
  if (envelope.data === null || envelope.data.calculation === null) {
    return unavailable('This subscription response does not include a calculation.');
  }
  const calculation = record(envelope.data.calculation, 'data.calculation');
  const request = record(envelope.request, 'request');
  const modelMix = array(request.modelMix, 'request.modelMix').map((candidate, index) => {
    const item = record(candidate, `request.modelMix[${index}]`);
    return {
      modelSlug: string(item.modelSlug, `request.modelMix[${index}].modelSlug`),
      pricingTierId: item.pricingTierId === null ? null : string(item.pricingTierId, `request.modelMix[${index}].pricingTierId`),
      routeId: string(item.routeId, `request.modelMix[${index}].routeId`),
      shareBasisPoints: finiteNumber(item.shareBasisPoints, `request.modelMix[${index}].shareBasisPoints`),
      tierContextTokens: finiteNumber(item.tierContextTokens, `request.modelMix[${index}].tierContextTokens`),
    };
  });
  const workload = record(request.workload, 'request.workload');
  const crossoverTokenVolume = finiteNumber(request.crossoverTokenVolume, 'request.crossoverTokenVolume');
  const domain = array(calculation.crossoverDomain, 'data.calculation.crossoverDomain').map((candidate, index) => {
    const point = record(candidate, `data.calculation.crossoverDomain[${index}]`);
    return {
      tokens: finiteNumber(point.tokenVolume, `data.calculation.crossoverDomain[${index}].tokenVolume`),
      apiUsd: finiteNumber(point.apiCostMicroDollars, `data.calculation.crossoverDomain[${index}].apiCostMicroDollars`) / 1_000_000,
      monthlySubscriptionUsd: finiteNumber(point.subscriptionCostMicroDollars, `data.calculation.crossoverDomain[${index}].subscriptionCostMicroDollars`) / 1_000_000,
    };
  });
  const selectedVolume = domain.find((point) => point.tokens === crossoverTokenVolume);
  if (!selectedVolume) return unavailable('The validated subscription calculation does not include the selected token volume.');
  const lineItems = array(calculation.lineItems, 'data.calculation.lineItems').map((candidate, index) => {
    const item = record(candidate, `data.calculation.lineItems[${index}]`);
    return {
      id: `${string(item.modelSlug, `data.calculation.lineItems[${index}].modelSlug`)}-${string(item.kind, `data.calculation.lineItems[${index}].kind`)}`,
      tokens: finiteNumber(item.tokens, `data.calculation.lineItems[${index}].tokens`),
      rateUsdPerMillion: finiteNumber(item.rateMicroDollarsPerMillion, `data.calculation.lineItems[${index}].rateMicroDollarsPerMillion`) / 1_000_000,
      costUsd: finiteNumber(item.costMicroDollars, `data.calculation.lineItems[${index}].costMicroDollars`) / 1_000_000,
    };
  });
  const source = provenance(envelope.sources[0] ?? fail('sources', 'requires source'));
  return {
    availability: 'available',
    value: {
      request: {
        planId: string(request.planId, 'request.planId'),
        seats: finiteNumber(request.seats, 'request.seats'),
        modelMix,
        workload: {
          activeDaysPerMonth: finiteNumber(workload.activeDaysPerMonth, 'request.workload.activeDaysPerMonth'),
          conversationsPerDay: finiteNumber(workload.conversationsPerDay, 'request.workload.conversationsPerDay'),
          inputTokensPerMessage: finiteNumber(workload.inputTokensPerMessage, 'request.workload.inputTokensPerMessage'),
          messagesPerConversation: finiteNumber(workload.messagesPerConversation, 'request.workload.messagesPerConversation'),
          outputTokensPerMessage: finiteNumber(workload.outputTokensPerMessage, 'request.workload.outputTokensPerMessage'),
        },
        cacheReadShareBasisPoints: finiteNumber(request.cacheReadShareBasisPoints, 'request.cacheReadShareBasisPoints'),
        cacheWriteShareBasisPoints: finiteNumber(request.cacheWriteShareBasisPoints, 'request.cacheWriteShareBasisPoints'),
        crossoverTokenVolume,
      },
      monthlySubscriptionUsd: finiteNumber(calculation.monthlySubscriptionCostMicroDollars, 'data.calculation.monthlySubscriptionCostMicroDollars') / 1_000_000,
      selectedVolumeApiUsd: selectedVolume.apiUsd,
      crossoverTokens: calculation.crossoverTokens === null ? null : finiteNumber(calculation.crossoverTokens, 'data.calculation.crossoverTokens'),
      domain,
      lineItems,
    },
    provenance: source,
  };
}

function mapSubscription(envelope: AcceptedUiDataContractV1<'subscription'>): UiDataContractV1<SubscriptionData> {
  if (envelope.data === null) return rootContract<SubscriptionData>(envelope, null);
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
    calculation: mapSubscriptionCalculation(envelope),
  });
}

/**
 * Maps compile-time retained evidence for Workers without loading Ajv's dynamic
 * schema compiler. The source artifact is still validated by the accepted
 * contract pipeline before it is committed.
 */
export function mapRetainedProfileEvidence(candidate: AcceptedUiDataContractV1<'profile'>, slug: string): UiDataContractV1<PreviewModelProfileData> {
  return requestMatches(candidate, { slug })
    ? mapProfile(candidate)
    : unmatchedRequest<PreviewModelProfileData>(candidate);
}

/** See mapRetainedProfileEvidence for the retained-evidence boundary. */
export function mapRetainedComparisonEvidence(candidate: AcceptedUiDataContractV1<'comparison'>, query: CompareQuery): UiDataContractV1<CompareData> {
  return requestMatches(candidate, query)
    ? mapComparison(candidate, query)
    : unmatchedRequest<CompareData>(candidate);
}

/** See mapRetainedProfileEvidence for the retained-evidence boundary. */
export function mapRetainedModelsEvidence(candidate: AcceptedUiDataContractV1<'models'>, query: ModelDirectoryQuery): UiDataContractV1<ModelDirectoryData> {
  return requestMatches(candidate, query)
    ? mapModels(candidate)
    : unmatchedRequest<ModelDirectoryData>(candidate);
}

/** See mapRetainedProfileEvidence for the retained-evidence boundary. */
export function mapRetainedRankingsEvidence(candidate: AcceptedUiDataContractV1<'rankings'>, query: RankingQuery): UiDataContractV1<RankingData> {
  return requestMatches(candidate, query)
    ? mapRankings(candidate)
    : unmatchedRequest<RankingData>(candidate);
}

/** See mapRetainedProfileEvidence for the retained-evidence boundary. */
export function mapRetainedSubscriptionEvidence(candidate: AcceptedUiDataContractV1<'subscription'>, query: SubscriptionQuery): UiDataContractV1<SubscriptionData> {
  return requestMatches(candidate, query)
    ? mapSubscription(candidate)
    : unmatchedRequest<SubscriptionData>(candidate);
}

export function createValidatedPreviewDataAdapter(transport: PreviewDataTransport): PreviewDataAdapter {
  return {
    async models(query: ModelDirectoryQuery) {
      const envelope = await parseAcceptedContract(await transport.request('models', query), 'models');
      return requestMatches(envelope, query) ? mapModels(envelope) : unmatchedRequest<ModelDirectoryData>(envelope);
    },
    async profile(slug: string) {
      const envelope = await parseAcceptedContract(await transport.request('profile', { slug }), 'profile');
      return requestMatches(envelope, { slug }) ? mapProfile(envelope) : unmatchedRequest<PreviewModelProfileData>(envelope);
    },
    async lifecycle(query: LifecycleQuery) {
      const envelope = await parseAcceptedContract(await transport.request('lifecycle', query), 'lifecycle');
      return requestMatches(envelope, query) ? mapLifecycle(envelope) : unmatchedRequest<LifecycleData>(envelope);
    },
    async rankings(query: RankingQuery) {
      const envelope = await parseAcceptedContract(await transport.request('rankings', query), 'rankings');
      return requestMatches(envelope, query) ? mapRankings(envelope) : unmatchedRequest<RankingData>(envelope);
    },
    async comparison(query: CompareQuery) {
      const envelope = await parseAcceptedContract(await transport.request('comparison', query), 'comparison');
      return requestMatches(envelope, query) ? mapComparison(envelope, query) : unmatchedRequest<CompareData>(envelope);
    },
    async subscription(query: SubscriptionQuery) {
      const envelope = await parseAcceptedContract(await transport.request('subscription', query), 'subscription');
      return requestMatches(envelope, query) ? mapSubscription(envelope) : unmatchedRequest<SubscriptionData>(envelope);
    },
  };
}
