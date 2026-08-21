import type { LiveBenchReleaseBundle } from '../../src/livebench/contracts';
import {
  SAFE_MODEL_SLUG,
  validateModelMethodData,
  type ComparisonData,
  type ComparisonRequest,
  type ModelsData,
  type ModelsRequest,
  type ModelProfile,
  type ModelSummary,
  type ProfileData,
  type ProfileRequest,
  type ScoreFact,
  type TaskFact,
} from '../../src/pipeline/ui-data-contract-v1-models';
import {
  buildCustomRankingsData,
  validateRankingsDataIntrinsic,
  type CustomRankingCandidate,
  type CustomRankingsData,
  type CustomRankingsRequest,
  type LeaderboardRankingsData,
  type LeaderboardRankingsRequest,
  type LeaderboardRow,
  type RankingDimensionSet,
} from '../../src/pipeline/ui-data-contract-v1-rankings';
import type {
  DataWarning,
  EvidenceValue,
  SourceAttribution,
  UiDataContractV1Envelope,
} from '../../src/pipeline/ui-data-contract-v1-core';
import { buildUiDataContractV1Envelope } from '../../src/pipeline/ui-data-contract-v1-core';
import { decodeOpaqueValue, encodeOpaqueValue } from './benchmark-db';
import type { StrictModelJoin } from './strict-model-join';

type RankedScore = {
  readonly score: number;
  readonly rank: number;
  readonly fieldSize: number;
};

type ModelProjection = {
  readonly model: ModelSummary;
  readonly tasks: readonly TaskFact[];
  readonly sourceRank: number;
  readonly aggregateCostPerSuccess: EvidenceValue<number>;
  readonly aggregateMeanOutputTokens: EvidenceValue<number>;
};

type CursorPayload = {
  readonly v: 1;
  readonly releaseId: string;
  readonly filterKey: string;
  readonly offset: number;
};

type ModelsCursorPayload = {
  readonly v: 1;
  readonly releaseId: string;
  readonly queryKey: string;
  readonly offset: number;
};

export class LiveBenchRequestBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveBenchRequestBindingError';
  }
}

export class LiveBenchRequestedReleaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveBenchRequestedReleaseUnavailableError';
  }
}

// The pinned upstream Averaging.js intentionally overrides these two global
// averages. Discovery blocks methodology-blob changes until this projection is
// reviewed, so a future upstream rule cannot silently change source ranking.
const LIVEBENCH_GLOBAL_AVERAGE_OVERRIDES: Readonly<Record<string, number>> = {
  'grok-3-thinking': 72,
  'grok-3': 58,
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function average(values: readonly number[]): number {
  if (values.length === 0) throw new Error('cannot average an empty LiveBench dimension');
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function available<T>(value: T, sourceRef: string): EvidenceValue<T> {
  return { availability: 'available', value, sourceRefs: [sourceRef] };
}

function unavailable<T>(reason: string, sourceRef: string): EvidenceValue<T> {
  return { availability: 'unavailable', value: null, reason, sourceRefs: [sourceRef] };
}

function slugFor(sourceModelId: string): string {
  if (SAFE_MODEL_SLUG.test(sourceModelId)) return sourceModelId;
  const normalized = sourceModelId
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/gu, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gu, '')
    .slice(0, 160);
  if (!SAFE_MODEL_SLUG.test(normalized)) {
    throw new Error(`LiveBench model ID ${sourceModelId} cannot produce a safe public slug`);
  }
  return normalized;
}

function rankedScores(
  values: readonly { readonly slug: string; readonly score: number }[],
): ReadonlyMap<string, RankedScore> {
  const sorted = [...values].sort((left, right) => (
    right.score - left.score || compareText(left.slug, right.slug)
  ));
  const result = new Map<string, RankedScore>();
  let rank = 0;
  for (const [index, value] of sorted.entries()) {
    if (index === 0 || value.score !== sorted[index - 1]!.score) rank = index + 1;
    result.set(value.slug, { score: value.score, rank, fieldSize: sorted.length });
  }
  return result;
}

function scoreFact(
  dimensionId: string,
  label: string,
  ranked: RankedScore,
  sourceRef: string,
): ScoreFact {
  return {
    dimensionId,
    label,
    score: available(ranked.score, sourceRef),
    rank: available(ranked.rank, sourceRef),
    fieldSize: available(ranked.fieldSize, sourceRef),
  };
}

function filterKey(request: LeaderboardRankingsRequest): string {
  return JSON.stringify({
    releaseId: request.releaseId,
    filters: {
      organizationIds: [...request.filters.organizationIds],
      openWeights: request.filters.openWeights,
      excludeDerivativeFinetunes: request.filters.excludeDerivativeFinetunes,
    },
    limit: request.limit,
  });
}

function cursorOffset(request: LeaderboardRankingsRequest, releaseId: string): number {
  if (request.cursor === null) return 0;
  let decoded: unknown;
  try {
    decoded = decodeOpaqueValue(request.cursor);
  } catch {
    throw new LiveBenchRequestBindingError('invalid LiveBench leaderboard cursor');
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new LiveBenchRequestBindingError('invalid LiveBench leaderboard cursor');
  }
  const value = decoded as Partial<CursorPayload>;
  if (value.v !== 1
    || value.releaseId !== releaseId
    || value.filterKey !== filterKey(request)
    || !Number.isSafeInteger(value.offset)
    || value.offset === undefined
    || value.offset < 1
    || value.offset % request.limit !== 0) {
    throw new LiveBenchRequestBindingError('invalid LiveBench leaderboard cursor');
  }
  return value.offset;
}

function nextCursor(
  request: LeaderboardRankingsRequest,
  releaseId: string,
  nextOffset: number,
  total: number,
): string | null {
  if (nextOffset >= total) return null;
  return encodeOpaqueValue({
    v: 1,
    releaseId,
    filterKey: filterKey(request),
    offset: nextOffset,
  } satisfies CursorPayload);
}

function matchesFilters(model: ModelSummary, request: LeaderboardRankingsRequest): boolean {
  if (request.filters.organizationIds.length > 0
    && !request.filters.organizationIds.includes(model.identity.organization)) return false;
  if (request.filters.excludeDerivativeFinetunes && model.isDerivativeFinetune) return false;
  if (request.filters.openWeights === 'all') return true;
  if (model.openWeights.availability !== 'available') return false;
  return request.filters.openWeights === 'only' ? model.openWeights.value : !model.openWeights.value;
}

function paretoSlugs(values: readonly ModelProjection[]): ReadonlySet<string> {
  const comparable = values.filter((value) => value.aggregateCostPerSuccess.availability === 'available');
  return new Set(comparable.filter((candidate) => !comparable.some((other) => {
    if (candidate === other
      || candidate.model.overall.score.availability !== 'available'
      || other.model.overall.score.availability !== 'available'
      || candidate.aggregateCostPerSuccess.availability !== 'available'
      || other.aggregateCostPerSuccess.availability !== 'available') return false;
    const noWorse = other.model.overall.score.value >= candidate.model.overall.score.value
      && other.aggregateCostPerSuccess.value <= candidate.aggregateCostPerSuccess.value;
    const strictlyBetter = other.model.overall.score.value > candidate.model.overall.score.value
      || other.aggregateCostPerSuccess.value < candidate.aggregateCostPerSuccess.value;
    return noWorse && strictlyBetter;
  })).map((value) => value.model.identity.slug));
}

/**
 * Build the benchmark-only portion of ui-data-contract/v1 from one validated,
 * commit-pinned LiveBench release. Catalog routes and lifecycle facts stay
 * explicitly unavailable until their independently revisioned sources join the
 * projection; they are never synthesized from benchmark data.
 */
export function buildLiveBenchLeaderboardData(input: {
  readonly bundle: LiveBenchReleaseBundle;
  readonly request: LeaderboardRankingsRequest;
  readonly source: SourceAttribution;
}): LeaderboardRankingsData {
  const { bundle, request, source } = input;
  if (request.releaseId !== null && request.releaseId !== bundle.releaseId) {
    throw new LiveBenchRequestedReleaseUnavailableError(`LiveBench release ${request.releaseId} is not active`);
  }
  const sourceRef = source.sourceRef;
  const tasksById = new Map(bundle.tasks.map((task) => [task.taskId, task]));
  const scoresByModel = new Map<string, Map<string, number>>();
  const economicsByModel = new Map<string, Map<string, LiveBenchReleaseBundle['taskEconomics'][number]>>();
  for (const score of bundle.taskScores) {
    const values = scoresByModel.get(score.configurationId) ?? new Map<string, number>();
    values.set(score.taskId, score.score);
    scoresByModel.set(score.configurationId, values);
  }
  for (const economics of bundle.taskEconomics) {
    const values = economicsByModel.get(economics.configurationId)
      ?? new Map<string, LiveBenchReleaseBundle['taskEconomics'][number]>();
    values.set(economics.taskId, economics);
    economicsByModel.set(economics.configurationId, values);
  }

  const slugs = new Map(bundle.models.map((model) => [model.configurationId, slugFor(model.sourceModelId)]));
  if (new Set(slugs.values()).size !== slugs.size) throw new Error('LiveBench public model slugs must be unique');
  const categoryScores = new Map<string, ReadonlyMap<string, RankedScore>>();
  for (const category of bundle.categories) {
    categoryScores.set(category.categoryId, rankedScores(bundle.models.map((model) => {
      const scores = scoresByModel.get(model.configurationId);
      if (!scores) throw new Error(`LiveBench scores are missing for ${model.configurationId}`);
      return {
        slug: slugs.get(model.configurationId)!,
        score: average(category.taskIds.map((taskId) => {
          const score = scores.get(taskId);
          if (score === undefined) throw new Error(`LiveBench score is missing for ${model.configurationId}/${taskId}`);
          return score;
        })),
      };
    })));
  }
  const overallScores = rankedScores(bundle.models.map((model) => {
    const slug = slugs.get(model.configurationId)!;
    return {
      slug,
      score: LIVEBENCH_GLOBAL_AVERAGE_OVERRIDES[model.sourceModelId]
        ?? average(bundle.categories.map((category) => (
          categoryScores.get(category.categoryId)!.get(slug)!.score
        ))),
    };
  }));

  const projections = bundle.models.map((configuration): ModelProjection => {
    const slug = slugs.get(configuration.configurationId)!;
    const scores = scoresByModel.get(configuration.configurationId)!;
    const economics = economicsByModel.get(configuration.configurationId)!;
    const tasks = bundle.tasks.map((task): TaskFact => {
      const score = scores.get(task.taskId);
      const taskEconomics = economics.get(task.taskId);
      if (score === undefined || taskEconomics === undefined) {
        throw new Error(`LiveBench release is incomplete for ${configuration.configurationId}/${task.taskId}`);
      }
      const equivalentSuccesses = taskEconomics.questionCount * score / 100;
      return {
        taskId: task.taskId,
        label: task.label,
        categoryId: task.categoryId,
        score: available(score, sourceRef),
        questionCount: available(taskEconomics.questionCount, sourceRef),
        evaluationCostUsd: available(taskEconomics.evaluationCostUsd, sourceRef),
        inputPriceUsdPerMillion: taskEconomics.inputPriceUsdPerMillion === null
          ? unavailable('The benchmark release does not provide this input price.', sourceRef)
          : available(taskEconomics.inputPriceUsdPerMillion, sourceRef),
        outputPriceUsdPerMillion: taskEconomics.outputPriceUsdPerMillion === null
          ? unavailable('The benchmark release does not provide this output price.', sourceRef)
          : available(taskEconomics.outputPriceUsdPerMillion, sourceRef),
        equivalentSuccesses: available(equivalentSuccesses, sourceRef),
        costPerSuccessfulEvaluationUsd: equivalentSuccesses === 0
          ? unavailable('This task has no equivalent successful evaluations.', sourceRef)
          : available(taskEconomics.evaluationCostUsd / equivalentSuccesses, sourceRef),
        meanInputTokens: taskEconomics.meanInputTokens === null
          ? unavailable('The benchmark release does not provide mean input tokens.', sourceRef)
          : available(Math.round(taskEconomics.meanInputTokens), sourceRef),
        meanOutputTokens: taskEconomics.meanOutputTokens === null
          ? unavailable('The benchmark release does not provide mean output tokens.', sourceRef)
          : available(Math.round(taskEconomics.meanOutputTokens), sourceRef),
      };
    });
    const totalCost = tasks.reduce((sum, task) => sum + (task.evaluationCostUsd.availability === 'available' ? task.evaluationCostUsd.value : 0), 0);
    const totalEquivalentSuccesses = tasks.reduce((sum, task) => sum + (task.equivalentSuccesses.availability === 'available' ? task.equivalentSuccesses.value : 0), 0);
    const outputFacts = tasks.flatMap((task) => (
      task.meanOutputTokens.availability === 'available' && task.questionCount.availability === 'available'
        ? [{ meanOutputTokens: task.meanOutputTokens.value, questionCount: task.questionCount.value }]
        : []
    ));
    const outputQuestionCount = outputFacts.reduce((sum, task) => sum + task.questionCount, 0);
    const model: ModelSummary = {
      identity: {
        configurationId: configuration.configurationId,
        slug,
        displayName: configuration.displayName,
        organization: configuration.organization,
      },
      openWeights: configuration.openWeights === null
        ? unavailable('The benchmark release does not declare this model\'s open-weight status.', sourceRef)
        : available(configuration.openWeights, sourceRef),
      isDerivativeFinetune: configuration.isDerivativeFinetune,
      baseModelSlug: configuration.isDerivativeFinetune
        ? configuration.baseConfigurationId === null
          ? unavailable('The derivative model has no reviewed base-model configuration.', sourceRef)
          : available(slugs.get(configuration.baseConfigurationId) ?? slugFor(configuration.baseConfigurationId), sourceRef)
        : null,
      overall: scoreFact('overall', 'Overall', overallScores.get(slug)!, sourceRef),
      categories: bundle.categories.map((category) => scoreFact(
        category.categoryId,
        category.label,
        categoryScores.get(category.categoryId)!.get(slug)!,
        sourceRef,
      )),
      selectedRouteId: null,
      selectedRoutePolicy: 'Benchmark-only projection; no catalog route has been joined.',
      selectedRoute: null,
      lifecycleStatus: unavailable('The benchmark release is not a lifecycle source.', sourceRef),
    };
    return {
      model,
      tasks,
      sourceRank: overallScores.get(slug)!.rank,
      aggregateCostPerSuccess: totalEquivalentSuccesses === 0
        ? unavailable('This model has no equivalent successful evaluations.', sourceRef)
        : available(totalCost / totalEquivalentSuccesses, sourceRef),
      aggregateMeanOutputTokens: outputFacts.length !== tasks.length || outputQuestionCount === 0
        ? unavailable('The benchmark release does not provide complete mean output tokens.', sourceRef)
        : available(Math.round(outputFacts.reduce((sum, task) => (
          sum + task.meanOutputTokens * task.questionCount
        ), 0) / outputQuestionCount), sourceRef),
    };
  });

  const filtered = projections
    .filter((projection) => matchesFilters(projection.model, request))
    .sort((left, right) => left.sourceRank - right.sourceRank
      || compareText(left.model.identity.slug, right.model.identity.slug));
  const frontier = paretoSlugs(filtered);
  const offset = cursorOffset(request, bundle.releaseId);
  if (offset > filtered.length) throw new LiveBenchRequestBindingError('invalid LiveBench leaderboard cursor');
  const page = filtered.slice(offset, offset + request.limit);
  const rows: LeaderboardRow[] = page.map((projection) => ({
    sourceRank: projection.sourceRank,
    model: projection.model,
    taskEconomics: projection.tasks,
    costPerSuccessfulEvaluationUsd: projection.aggregateCostPerSuccess,
    meanOutputTokens: projection.aggregateMeanOutputTokens,
    pareto: frontier.has(projection.model.identity.slug),
  }));
  const data: LeaderboardRankingsData = {
    operation: 'leaderboard',
    release: {
      releaseId: bundle.releaseId,
      releaseOn: bundle.releaseId,
      licenseId: 'CDLA-Permissive-2.0',
      sourceRefs: [sourceRef],
    },
    taxonomy: bundle.categories.map((category) => ({
      categoryId: category.categoryId,
      label: category.label,
      tasks: category.taskIds.map((taskId) => {
        const task = tasksById.get(taskId);
        if (!task) throw new Error(`LiveBench taxonomy task ${taskId} is missing`);
        return { taskId, label: task.label };
      }),
    })),
    rows,
    total: filtered.length,
    nextCursor: nextCursor(request, bundle.releaseId, offset + rows.length, filtered.length),
  };
  validateRankingsDataIntrinsic(request, data, [source]);
  return data;
}

function unavailableWarnings(value: unknown): DataWarning[] {
  const warnings: DataWarning[] = [];
  const walk = (current: unknown, path: string): void => {
    if (Array.isArray(current)) {
      current.forEach((entry, index) => walk(entry, `${path}/${index}`));
      return;
    }
    if (!current || typeof current !== 'object') return;
    const record = current as Record<string, unknown>;
    if (record.availability === 'unavailable' && record.value === null) {
      warnings.push({
        code: 'livebench_field_unavailable',
        fieldGroup: path,
        state: 'unknown',
        message: typeof record.reason === 'string' && record.reason.trim().length > 0
          ? record.reason
          : 'This benchmark-backed field is unavailable.',
      });
      return;
    }
    for (const [key, nested] of Object.entries(record)) walk(nested, `${path}/${key}`);
  };
  walk(value, '/data');
  return warnings;
}

function allLiveBenchRows(
  bundle: LiveBenchReleaseBundle,
  source: SourceAttribution,
): readonly LeaderboardRow[] {
  const rows: LeaderboardRow[] = [];
  let cursor: string | null = null;
  do {
    const page = buildLiveBenchLeaderboardData({
      bundle,
      source,
      request: {
        operation: 'leaderboard',
        releaseId: null,
        filters: {
          organizationIds: [],
          openWeights: 'all',
          excludeDerivativeFinetunes: false,
        },
        limit: 100,
        cursor,
      },
    });
    rows.push(...page.rows);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return rows;
}

function modelMethodSources(source: SourceAttribution, join: StrictModelJoin | undefined): readonly SourceAttribution[] {
  const seen = new Set<string>();
  return [source, ...(join?.sources ?? [])].filter((candidate) => {
    if (seen.has(candidate.sourceRef)) return false;
    seen.add(candidate.sourceRef);
    return true;
  });
}

function joinedModel(model: ModelSummary, join: StrictModelJoin | undefined): ModelSummary {
  const joined = join?.modelsByConfigurationId.get(model.identity.configurationId);
  if (!joined) return model;
  return {
    ...model,
    selectedRouteId: joined.selectedRoute?.routeId ?? null,
    selectedRoutePolicy: joined.selectedRoute === null
      ? 'No exact reviewed catalog route has been joined.'
      : joined.selectedRoutePolicy,
    selectedRoute: joined.selectedRoute,
    lifecycleStatus: joined.lifecycleStatus,
  };
}

function joinedRows(
  bundle: LiveBenchReleaseBundle,
  source: SourceAttribution,
  join: StrictModelJoin | undefined,
): readonly LeaderboardRow[] {
  return allLiveBenchRows(bundle, source).map((row) => {
    const model = joinedModel(row.model, join);
    return model === row.model ? row : { ...row, model };
  });
}

export function buildLiveBenchRankingDimensionSet(
  bundle: LiveBenchReleaseBundle,
): RankingDimensionSet {
  return {
    revision: `livebench-${bundle.releaseId}-benchmark-dimensions-v1`,
    transformationVersion: 'livebench-score-identity-v1',
    dimensions: bundle.categories.map((category) => ({
      dimensionId: category.categoryId,
      label: category.label,
      kind: 'benchmark' as const,
      unit: 'score' as const,
      utilityAnchor: { best: 100, worst: 0, transform: 'identity' as const },
    })),
  };
}

/** Apply the exact submitted matrix to the active benchmark dimensions. */
export function buildLiveBenchCustomRankingsData(input: {
  readonly bundle: LiveBenchReleaseBundle;
  readonly request: CustomRankingsRequest;
  readonly source: SourceAttribution;
}): CustomRankingsData {
  const candidates: CustomRankingCandidate[] = allLiveBenchRows(input.bundle, input.source).map((row) => ({
    model: row.model,
    values: Object.fromEntries(row.model.categories.map((category) => [
      category.dimensionId,
      category.score,
    ])),
  }));
  return buildCustomRankingsData(
    input.request,
    buildLiveBenchRankingDimensionSet(input.bundle),
    candidates,
  );
}

function modelsQueryKey(request: ModelsRequest): string {
  return JSON.stringify({
    search: request.search,
    access: request.access,
    providerIds: [...request.providerIds],
    limit: request.limit,
  });
}

function modelsCursorOffset(request: ModelsRequest, releaseId: string): number {
  if (request.cursor === null) return 0;
  let decoded: unknown;
  try {
    decoded = decodeOpaqueValue(request.cursor);
  } catch {
    throw new LiveBenchRequestBindingError('invalid LiveBench models cursor');
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new LiveBenchRequestBindingError('invalid LiveBench models cursor');
  }
  const value = decoded as Partial<ModelsCursorPayload>;
  if (value.v !== 1
    || value.releaseId !== releaseId
    || value.queryKey !== modelsQueryKey(request)
    || !Number.isSafeInteger(value.offset)
    || value.offset === undefined
    || value.offset < 1
    || value.offset % request.limit !== 0) {
    throw new LiveBenchRequestBindingError('invalid LiveBench models cursor');
  }
  return value.offset;
}

function modelsNextCursor(
  request: ModelsRequest,
  releaseId: string,
  nextOffset: number,
  total: number,
): string | null {
  if (nextOffset >= total) return null;
  return encodeOpaqueValue({
    v: 1,
    releaseId,
    queryKey: modelsQueryKey(request),
    offset: nextOffset,
  } satisfies ModelsCursorPayload);
}

/** Build the current LiveBench directory with only exact reviewed catalog joins. */
export function buildLiveBenchModelsData(input: {
  readonly bundle: LiveBenchReleaseBundle;
  readonly request: ModelsRequest;
  readonly source: SourceAttribution;
  readonly join?: StrictModelJoin;
}): ModelsData {
  const search = input.request.search?.toLocaleLowerCase() ?? null;
  const filtered = joinedRows(input.bundle, input.source, input.join)
    .filter((row) => search === null || [
      row.model.identity.slug,
      row.model.identity.displayName,
      row.model.identity.organization,
    ].some((value) => value.toLocaleLowerCase().includes(search)))
    .filter((row) => {
      const model = row.model;
      if (input.request.access === 'all') return true;
      if (model.openWeights.availability !== 'available') return false;
      return input.request.access === 'open_weights' ? model.openWeights.value : !model.openWeights.value;
    })
    .filter((row) => {
      if (input.request.providerIds.length === 0) return true;
      // Provider filtering is a catalog-route constraint. A benchmark-only
      // row stays out rather than being associated by a similar model name.
      const joined = input.join?.modelsByConfigurationId.get(row.model.identity.configurationId);
      return joined?.routes.some((route) => input.request.providerIds.includes(route.providerId)) ?? false;
    })
    .map((row) => row.model)
    .sort((left, right) => compareText(left.identity.slug, right.identity.slug));
  const offset = modelsCursorOffset(input.request, input.bundle.releaseId);
  if (offset > filtered.length) throw new LiveBenchRequestBindingError('invalid LiveBench models cursor');
  const models = filtered.slice(offset, offset + input.request.limit);
  const data: ModelsData = {
    models,
    total: filtered.length,
    nextCursor: modelsNextCursor(
      input.request,
      input.bundle.releaseId,
      offset + models.length,
      filtered.length,
    ),
  };
  validateModelMethodData('models', data, input.request, modelMethodSources(input.source, input.join));
  return data;
}

function profileForSlug(
  bundle: LiveBenchReleaseBundle,
  source: SourceAttribution,
  slug: string,
  join: StrictModelJoin | undefined,
): ModelProfile | null {
  const row = joinedRows(bundle, source, join).find((candidate) => candidate.model.identity.slug === slug);
  if (!row) return null;
  const joined = join?.modelsByConfigurationId.get(row.model.identity.configurationId);
  return {
    summary: row.model,
    releaseOn: bundle.releaseId,
    tasks: row.taskEconomics,
    routes: joined?.routes ?? [],
    lifecycleEvents: joined?.lifecycleEvents ?? [],
    replacement: joined?.replacement
      ?? unavailable('The benchmark release is not a lifecycle or replacement source.', source.sourceRef),
  };
}

export function buildLiveBenchProfileData(input: {
  readonly bundle: LiveBenchReleaseBundle;
  readonly request: ProfileRequest;
  readonly source: SourceAttribution;
  readonly join?: StrictModelJoin;
}): ProfileData | null {
  const model = profileForSlug(input.bundle, input.source, input.request.slug, input.join);
  if (!model) return null;
  const data: ProfileData = { model };
  validateModelMethodData('profile', data, input.request, modelMethodSources(input.source, input.join));
  return data;
}

export function buildLiveBenchComparisonData(input: {
  readonly bundle: LiveBenchReleaseBundle;
  readonly request: ComparisonRequest;
  readonly source: SourceAttribution;
  readonly join?: StrictModelJoin;
}): ComparisonData | null {
  const models = input.request.modelSlugs.map((slug) => profileForSlug(
    input.bundle,
    input.source,
    slug,
    input.join,
  ));
  if (models.some((model) => model === null)) return null;
  const data: ComparisonData = {
    requestedModelSlugs: [...input.request.modelSlugs],
    models: models as ModelProfile[],
  };
  validateModelMethodData('comparison', data, input.request, modelMethodSources(input.source, input.join));
  return data;
}

export { unavailableWarnings as collectUiDataUnavailableWarnings };

/** Build a fully validated v1 rankings envelope from one active LiveBench revision. */
export function buildLiveBenchRankingsEnvelope(input: {
  readonly bundle: LiveBenchReleaseBundle;
  readonly request: LeaderboardRankingsRequest;
  readonly source: SourceAttribution;
  readonly fetchedAt: string;
  readonly projectionRevision: string;
  readonly benchmarkRevision: string;
  readonly projectionMethodology: string;
  readonly checkedAt: string;
}): UiDataContractV1Envelope<'rankings', LeaderboardRankingsRequest, LeaderboardRankingsData> {
  const data = buildLiveBenchLeaderboardData(input);
  const warnings = unavailableWarnings(data);
  return buildUiDataContractV1Envelope({
    method: 'rankings',
    request: input.request,
    status: warnings.length === 0 ? 'available' : 'partial',
    reason: null,
    fetchedAt: input.fetchedAt,
    data,
    revisions: {
      projection: input.projectionRevision,
      catalog: null,
      benchmark: input.benchmarkRevision,
      runtimeObservationSet: null,
      projectionMethodology: input.projectionMethodology,
    },
    freshness: {
      catalogObservedAt: null,
      runtimeObservedAt: null,
      benchmarkReleasedAt: `${input.bundle.releaseId}T00:00:00.000Z`,
      benchmarkCheckedAt: input.checkedAt,
    },
    sources: [input.source],
    warnings,
  });
}
