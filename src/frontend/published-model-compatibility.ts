import type { CatalogResponse, ModelOffer } from '../catalog/contracts';
import type { ModelDirectoryEntry, ModelDirectoryEnvelope } from './model-directory-contracts';
import type { ModelProfileViewModel } from './model-profile-contracts';
import type {
  CompareData,
  CachePricing,
  EvidenceValue,
  LifecycleData,
  LifecycleReplacement,
  ModelAccess,
  ModelDirectoryData,
  ModelLifecycle,
  ModelProfileFacts,
  PreviewModel,
  PreviewModelProfileData,
  Provenance,
  RankingData,
  RouteFact,
  RoutePricing,
  UiDataContractV1,
} from './preview-data/contracts';

function unavailable<T>(reason: string, provenance?: Provenance): EvidenceValue<T> {
  return provenance === undefined
    ? { availability: 'unavailable', reason }
    : { availability: 'unavailable', reason, provenance };
}

function available<T>(value: T, provenance: Provenance): EvidenceValue<T> {
  return { availability: 'available', value, provenance };
}

function pipelineProvenance(input: {
  readonly id: string;
  readonly label: string;
  readonly effectiveAt: string | null;
  readonly url?: string;
  readonly note: string;
}): Provenance {
  return { ...input, kind: 'accepted_pipeline' };
}

function modelAccess(sourceType: ModelDirectoryEntry['sourceType'], provenance: Provenance): EvidenceValue<ModelAccess> {
  if (sourceType === 'Proprietary') return available('Proprietary', provenance);
  if (sourceType === 'Open Weight') return available('Open weights', provenance);
  return unavailable('The published model record does not classify access.', provenance);
}

function nullableEvidence<T>(
  value: T | null | undefined,
  reason: string,
  provenance: Provenance,
): EvidenceValue<T> {
  return value === null || value === undefined
    ? unavailable(reason, provenance)
    : available(value, provenance);
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

function nonEmptyStringArrayEvidence(
  value: readonly string[] | null | undefined,
  reason: string,
  provenance: Provenance,
): EvidenceValue<readonly string[]> {
  return value === null || value === undefined || value.length === 0
    ? unavailable(reason, provenance)
    : available(value, provenance);
}

function routeProvenance(
  route: NonNullable<ModelDirectoryEntry['representativePrice']>,
): Provenance {
  return pipelineProvenance({
    id: `model-route:${route.sourceId}:${route.providerId}:${route.routeId}:${route.sourceArtifactId}`,
    label: `Published ${route.providerId} route`,
    effectiveAt: route.observedAt,
    url: route.sourceUrl,
    note: `Exact ${route.verificationStatus} route receipt for ${route.sourceModelId}.`,
  });
}

/** Keeps every route field separate so partial price receipts retain their limits and capability facts. */
function routeFact(
  route: NonNullable<ModelDirectoryEntry['representativePrice']>,
): RouteFact {
  const provenance = routeProvenance(route);
  return {
    receipt: {
      sourceId: route.sourceId,
      providerId: route.providerId,
      routeId: route.routeId,
      sourceModelId: route.sourceModelId,
      sourceArtifactId: route.sourceArtifactId,
      sourceUrl: route.sourceUrl,
      observedAt: route.observedAt,
      verificationStatus: route.verificationStatus,
    },
    inputUsdPerMillion: nullableEvidence(route.inputUsdPerMillion, 'No published input price is available for this route.', provenance),
    outputUsdPerMillion: nullableEvidence(route.outputUsdPerMillion, 'No published output price is available for this route.', provenance),
    cacheReadUsdPerMillion: nullableEvidence(route.cachedInputUsdPerMillion, 'No published cache-read price is available for this route.', provenance),
    cacheWriteUsdPerMillion: nullableEvidence(
      route.cacheWriteUsdPerMillion,
      'No published cache-write price is available for this route.',
      provenance,
    ),
    contextWindowTokens: nullableEvidence(route.contextWindowTokens, 'No published context-window value is available for this route.', provenance),
    maxInputTokens: nullableEvidence(route.maxInputTokens, 'No published maximum-input value is available for this route.', provenance),
    maxOutputTokens: nullableEvidence(route.maxOutputTokens, 'No published maximum-output value is available for this route.', provenance),
    inputModalities: nonEmptyStringArrayEvidence(route.inputModalities, 'No published input modalities are available for this route.', provenance),
    outputModalities: nonEmptyStringArrayEvidence(route.outputModalities, 'No published output modalities are available for this route.', provenance),
    supportedParameters: nonEmptyStringArrayEvidence(route.supportedParameters, 'No published supported parameters are available for this route.', provenance),
  };
}

function routePricing(
  route: ModelDirectoryEntry['representativePrice'],
  fallbackProvenance: Provenance,
): EvidenceValue<RoutePricing> {
  if (route === null) return unavailable('No complete published input/output route price is available.', fallbackProvenance);
  const fact = routeFact(route);
  if (fact.inputUsdPerMillion.availability === 'unavailable' || fact.outputUsdPerMillion.availability === 'unavailable') {
    return unavailable('No complete published input/output route price is available.', routeProvenance(route));
  }
  const provenance = fact.inputUsdPerMillion.provenance;
  const cache: EvidenceValue<CachePricing> = fact.cacheReadUsdPerMillion.availability === 'unavailable'
    && fact.cacheWriteUsdPerMillion.availability === 'unavailable'
    ? unavailable('No published cache price is available for this route.', provenance)
    : available({
      readUsdPerMillion: fact.cacheReadUsdPerMillion,
      writeUsdPerMillion: fact.cacheWriteUsdPerMillion,
    }, provenance);
  return available({
    route: route.routeId,
    inputUsdPerMillion: fact.inputUsdPerMillion.value,
    outputUsdPerMillion: fact.outputUsdPerMillion.value,
    contextWindowTokens: fact.contextWindowTokens,
    maxInputTokens: fact.maxInputTokens,
    maxOutputTokens: fact.maxOutputTokens,
    inputModalities: route.inputModalities ?? [],
    outputModalities: route.outputModalities ?? [],
    supportedParameters: fact.supportedParameters,
    receipt: fact.receipt,
    cache,
  }, provenance);
}

function profileSourceProvenance(profileView: ModelProfileViewModel): readonly Provenance[] {
  const profileSources = profileView.profile.sources.map((source) => pipelineProvenance({
    id: `model-profile-source:${profileView.revision}:${source.sourceId}:${source.artifactId}`,
    label: source.attributionText,
    effectiveAt: source.observedAt,
    url: source.sourceUrl,
    note: `Exact ${source.sourceId} profile receipt ${source.artifactId}.`,
  }));
  if (profileSources.length > 0) return profileSources;
  return profileView.attribution.map((source) => pipelineProvenance({
    id: `model-profile-attribution:${profileView.revision}:${source.sourceId}:${source.updatedAt}`,
    label: source.label,
    effectiveAt: source.updatedAt,
    url: source.url,
    note: `Published model profile revision ${profileView.selectedRevision}.`,
  }));
}

function sharedRouteMetadata<T>(
  routes: readonly NonNullable<ModelDirectoryEntry['representativePrice']>[],
  key: string,
  parse: (value: unknown) => T | null,
  unavailableReason: string,
  conflictReason: string,
  fallbackProvenance: Provenance,
): EvidenceValue<T> {
  const candidates = routes.flatMap((route) => {
    const value = parse((route as unknown as Record<string, unknown>)[key]);
    return value === null ? [] : [{ value, provenance: routeProvenance(route) }];
  });
  if (candidates.length === 0) return unavailable(unavailableReason, fallbackProvenance);
  const values = new Map<string, typeof candidates[number]>();
  for (const candidate of candidates) values.set(JSON.stringify(candidate.value), candidate);
  if (values.size !== 1) return unavailable(conflictReason, fallbackProvenance);
  const candidate = values.values().next().value as typeof candidates[number];
  return available(candidate.value, candidate.provenance);
}

function profileFacts(
  profileView: ModelProfileViewModel,
  provenance: Provenance,
): ModelProfileFacts {
  const { profile } = profileView;
  const sources = profileSourceProvenance(profileView);
  const profileProvenance = sources[0] ?? provenance;
  const routes = profile.priceRoutes.map(routeFact);
  const rawRoutes = profile.priceRoutes as readonly NonNullable<ModelDirectoryEntry['representativePrice']>[];
  const stringMetadata = (key: string, label: string) => sharedRouteMetadata(
    rawRoutes,
    key,
    (value) => typeof value === 'string' && value.trim().length > 0 ? value : null,
    `No published ${label} is available for this model's exact routes.`,
    `Published routes disagree about ${label}; inspect individual route receipts.`,
    profileProvenance,
  );
  const booleanMetadata = (key: string, label: string) => sharedRouteMetadata(
    rawRoutes,
    key,
    (value) => typeof value === 'boolean' ? value : null,
    `No published ${label} is available for this model's exact routes.`,
    `Published routes disagree about ${label}; inspect individual route receipts.`,
    profileProvenance,
  );
  const limitsMetadata = sharedRouteMetadata(
    rawRoutes,
    'perRequestLimitsJson',
    (value) => {
      if (typeof value !== 'string') return null;
      try { return recordValue(JSON.parse(value)); } catch { return null; }
    },
    "No published per-request limits are available for this model's exact routes.",
    'Published routes disagree about per-request limits; inspect individual route receipts.',
    profileProvenance,
  );
  return {
    freshness: {
      status: profileView.freshness.status,
      checkedAt: profileView.freshness.checkedAt,
      message: profileView.freshness.message ?? null,
    },
    sourceCoverage: profile.summary.coverage,
    benchmark: {
      overallRank: profile.summary.overallRank,
      evidenceStatus: profile.summary.evidenceStatus,
      publishedAt: profile.summary.publishedAt,
      checkedAt: profile.summary.checkedAt,
      categories: profile.categories,
      ledger: profile.ledger,
    },
    specifications: {
      reasoningType: nullableEvidence(profile.identity.reasoningType, 'No published reasoning type is available.', profileProvenance),
      familyId: nullableEvidence(profile.identity.familyId, 'No published family ID is available.', profileProvenance),
      variantId: nullableEvidence(profile.identity.variantId, 'No published variant ID is available.', profileProvenance),
      releaseDate: nullableEvidence(profile.identity.releaseDate, 'No published release date is available.', profileProvenance),
      createdAt: stringMetadata('createdAt', 'creation date'),
      expirationDate: stringMetadata('expirationDate', 'expiration date'),
      knowledgeCutoff: stringMetadata('knowledgeCutoff', 'knowledge cutoff'),
      tokenizer: stringMetadata('tokenizer', 'tokenizer'),
      instructionFormat: stringMetadata('instructionFormat', 'instruction format'),
      isModerated: booleanMetadata('isModerated', 'moderation status'),
      perRequestLimits: limitsMetadata,
      contextWindowTokens: nullableEvidence(profile.specifications.contextWindowTokens, 'No published context-window value is available.', profileProvenance),
      maxInputTokens: nullableEvidence(profile.specifications.maxInputTokens, 'No published maximum-input value is available.', profileProvenance),
      maxOutputTokens: nullableEvidence(profile.specifications.maxOutputTokens, 'No published maximum-output value is available.', profileProvenance),
      inputModalities: nonEmptyStringArrayEvidence(profile.specifications.inputModalities, 'No published input modalities are available.', profileProvenance),
      outputModalities: nonEmptyStringArrayEvidence(profile.specifications.outputModalities, 'No published output modalities are available.', profileProvenance),
      supportedParameters: nonEmptyStringArrayEvidence(profile.specifications.supportedParameters, 'No published supported parameters are available.', profileProvenance),
      selfHostingAvailable: nullableEvidence(profile.specifications.selfHostingAvailable, 'No published self-hosting availability is available.', profileProvenance),
    },
    routes,
    sources,
  };
}

function directoryModel(entry: ModelDirectoryEntry, envelope: ModelDirectoryEnvelope): PreviewModel {
  const attribution = envelope.attribution.find((source) => source.sourceId === entry.sourceId);
  const provenance = pipelineProvenance({
    id: `model-directory:${envelope.revision}:${entry.canonicalSlug}`,
    label: 'Published model directory',
    effectiveAt: entry.profileCheckedAt,
    url: attribution?.url,
    note: `Validated weekly directory and profile projection for ${entry.canonicalSlug}.`,
  });
  const radar = entry.categories.map((category) => ({
    key: category.key,
    label: category.label,
    percentile: category.percentile,
    rank: category.rank,
    fieldSize: category.fieldSize,
  }));
  const selectedRoute = routePricing(entry.representativePrice, provenance);
  return {
    id: entry.canonicalSlug,
    identity: available({
      slug: entry.canonicalSlug,
      name: entry.displayName,
      provider: entry.creator,
    }, provenance),
    access: modelAccess(entry.sourceType, provenance),
    benchmark: unavailable('The directory does not publish a benchmark release taxonomy.', provenance),
    capability: entry.overallScore === null
      ? unavailable('No published overall capability score is available.', provenance)
      : available({ compositeScore: entry.overallScore, radar }, provenance),
    routePricing: selectedRoute,
    taskEconomics: unavailable('The directory does not publish task-economics evidence.', provenance),
    runtime: unavailable('No published runtime observation is available for this model.', provenance),
    lifecycle: unavailable('Lifecycle status is sourced independently from the endpoint catalog.', provenance),
    routeOptions: selectedRoute.availability === 'available'
      ? available([selectedRoute.value], selectedRoute.provenance)
      : unavailable('No complete published route price is available in the directory.', provenance),
  };
}

function profileModel(profileView: ModelProfileViewModel): PreviewModel {
  const { profile, directory } = profileView;
  const source = profileSourceProvenance(profileView)[0];
  const provenance = pipelineProvenance({
    id: `model-profile:${profileView.revision}:${profile.identity.slug}`,
    label: 'Published model profile',
    effectiveAt: profile.summary.checkedAt,
    url: source?.url,
    note: `Validated model profile revision ${profileView.selectedRevision}.`,
  });
  const selectedRoute = profile.priceRoutes.find((route) => (
    route.verificationStatus === 'primary'
    && route.inputUsdPerMillion !== null
    && route.outputUsdPerMillion !== null
  )) ?? profile.priceRoutes.find((route) => route.inputUsdPerMillion !== null && route.outputUsdPerMillion !== null) ?? null;
  const compatibleRoute = selectedRoute === null ? null : {
    ...selectedRoute,
  };
  const selectedRoutePricing = routePricing(compatibleRoute, provenance);
  const routeOptions = profile.priceRoutes
    .map((route) => routePricing(route, provenance))
    .flatMap((candidate) => candidate.availability === 'available' ? [candidate.value] : []);
  const facts = profileFacts(profileView, provenance);
  return {
    id: profile.identity.slug,
    identity: available({
      slug: profile.identity.slug,
      name: profile.identity.displayName,
      provider: profile.identity.creator,
    }, provenance),
    access: modelAccess(directory.sourceType, provenance),
    benchmark: profile.summary.publishedAt === null || profile.ledger.length === 0
      ? unavailable('The profile does not publish a benchmark release ledger.', provenance)
      : available({
        releaseOn: profile.summary.publishedAt.slice(0, 10),
        subtasks: [...new Map(profile.ledger.map((row) => [row.metricKey, {
          id: row.metricKey,
          label: row.benchmarkName,
        }])).values()],
      }, provenance),
    capability: profile.summary.overallScore === null
      ? unavailable('No published overall capability score is available.', provenance)
      : available({
        compositeScore: profile.summary.overallScore,
        radar: profile.radar.map((axis) => ({
          key: axis.key,
          label: axis.label,
          percentile: axis.percentile,
          rank: axis.rank,
          fieldSize: axis.fieldSize,
        })),
      }, provenance),
    routePricing: selectedRoutePricing,
    taskEconomics: unavailable('The profile does not publish comparable task-economics evidence.', provenance),
    runtime: unavailable('No published runtime observation is available for this model.', provenance),
    lifecycle: unavailable('Lifecycle status is sourced independently from the endpoint catalog.', provenance),
    profileFacts: available(facts, provenance),
    routeOptions: routeOptions.length === 0
      ? unavailable('No complete published route price is available for this profile.', provenance)
      : available(routeOptions, provenance),
  };
}

function envelope<T>(input: {
  readonly data: T;
  readonly fetchedAt: string;
  readonly effectiveAt: string | null;
  readonly provenance: readonly Provenance[];
  readonly status?: UiDataContractV1<T>['status'];
}): UiDataContractV1<T> {
  return {
    contractVersion: 'ui-data-contract/v1',
    status: input.status ?? 'partial',
    fetchedAt: input.fetchedAt,
    effectiveAt: input.effectiveAt,
    data: input.data,
    provenance: input.provenance,
  };
}

export function projectPublishedModelDirectory(
  published: ModelDirectoryEnvelope,
  fetchedAt = new Date().toISOString(),
): UiDataContractV1<ModelDirectoryData> {
  const models = published.data.models.map((entry) => directoryModel(entry, published));
  const provenance = models.flatMap((model) => model.identity.availability === 'available' ? [model.identity.provenance] : []);
  return envelope({
    data: { models },
    fetchedAt,
    effectiveAt: published.publishedAt,
    provenance,
    status: models.length === 0 ? 'available' : 'partial',
  });
}

export function projectPublishedRanking(
  published: ModelDirectoryEnvelope,
  fetchedAt = new Date().toISOString(),
): UiDataContractV1<RankingData> {
  const rows = published.data.models.flatMap((entry) => {
    if (entry.weeklyRank === null) return [];
    const model = directoryModel(entry, published);
    const provenance = model.identity.availability === 'available'
      ? model.identity.provenance
      : pipelineProvenance({
        id: `weekly-ranking:${published.revision}:${entry.canonicalSlug}`,
        label: 'Published weekly model ranking',
        effectiveAt: published.data.week?.generatedAt ?? published.publishedAt,
        note: 'Validated weekly popularity rank.',
      });
    return [{ model, rank: available(entry.weeklyRank, provenance) }];
  });
  return envelope({
    data: { models: rows },
    fetchedAt,
    effectiveAt: published.data.week?.generatedAt ?? published.publishedAt,
    provenance: rows.flatMap((row) => row.rank.availability === 'available' ? [row.rank.provenance] : []),
    status: rows.length === 0 ? 'available' : 'partial',
  });
}

function availableValue<T>(evidence: EvidenceValue<T>): T | null {
  return evidence.availability === 'available' ? evidence.value : null;
}

function rankingModelIndex(ranking: UiDataContractV1<RankingData>): ReadonlyMap<string, PreviewModel> {
  const index = new Map<string, PreviewModel>();
  const ambiguous = new Set<string>();
  const add = (key: string, model: PreviewModel) => {
    if (ambiguous.has(key)) return;
    const current = index.get(key);
    if (current === undefined) index.set(key, model);
    else if (current !== model) {
      index.delete(key);
      ambiguous.add(key);
    }
  };
  for (const entry of ranking.data?.models ?? []) {
    add(entry.model.id, entry.model);
    const identity = availableValue(entry.model.identity);
    if (identity !== null) add(identity.slug, entry.model);
  }
  return index;
}

function mergeModelFacts(directory: PreviewModel, benchmark: PreviewModel): PreviewModel {
  return {
    ...benchmark,
    id: directory.id,
    identity: directory.identity,
    access: benchmark.access.availability === 'available' ? benchmark.access : directory.access,
    routePricing: directory.routePricing,
    lifecycle: directory.lifecycle,
    profileFacts: directory.profileFacts ?? benchmark.profileFacts,
    routeOptions: directory.routeOptions ?? benchmark.routeOptions,
  };
}

/**
 * Effective time of a view merged from two published sources.
 *
 * These sources never share a timestamp by construction: a directory carries a
 * weekly publish date and a LiveBench release carries `{releaseId}T00:00:00Z`.
 * Requiring equality therefore nulled `effectiveAt` on every merge, so the hero
 * and snapshot badge rendered `-` structurally rather than from any data gap.
 *
 * The merged view is only as current as its stalest input, so the earlier of the
 * two is the honest answer. It never overstates freshness, and it degrades to
 * whichever single timestamp exists.
 */
export function mergedEffectiveAt(left: string | null, right: string | null): string | null {
  if (left === null) return right;
  if (right === null) return left;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime)) return Number.isFinite(rightTime) ? right : null;
  if (!Number.isFinite(rightTime)) return left;
  return leftTime <= rightTime ? left : right;
}

export function mergePublishedModelDirectorySources(
  directory: UiDataContractV1<ModelDirectoryData>,
  ranking: UiDataContractV1<RankingData> | null,
): UiDataContractV1<ModelDirectoryData> {
  if (directory.data === null || ranking?.data === null || ranking === null) return directory;
  const index = rankingModelIndex(ranking);
  const matched = new Set<PreviewModel>();
  const models = directory.data.models.map((model) => {
    const identity = availableValue(model.identity);
    const benchmark = index.get(identity?.slug ?? model.id) ?? index.get(model.id);
    if (benchmark === undefined) return model;
    matched.add(benchmark);
    return mergeModelFacts(model, benchmark);
  });
  for (const entry of ranking.data.models) {
    if (matched.has(entry.model)) continue;
    const identity = availableValue(entry.model.identity);
    models.push(identity === null ? entry.model : { ...entry.model, id: identity.slug });
  }
  return {
    ...directory,
    status: directory.status === 'available' && ranking.status === 'available' ? 'available' : 'partial',
    effectiveAt: mergedEffectiveAt(directory.effectiveAt, ranking.effectiveAt),
    data: { models },
    provenance: [...directory.provenance, ...ranking.provenance.filter((source) => !directory.provenance.some((candidate) => candidate.id === source.id))],
  };
}

export function mergePublishedProfileSource(
  profile: UiDataContractV1<PreviewModelProfileData>,
  ranking: UiDataContractV1<RankingData> | null,
): UiDataContractV1<PreviewModelProfileData> {
  if (profile.data === null || ranking?.data === null || ranking === null) return profile;
  const identity = availableValue(profile.data.model.identity);
  const benchmark = rankingModelIndex(ranking).get(identity?.slug ?? profile.data.model.id);
  if (benchmark === undefined) return profile;
  return {
    ...profile,
    status: profile.status === 'available' && ranking.status === 'available' ? 'available' : 'partial',
    effectiveAt: mergedEffectiveAt(profile.effectiveAt, ranking.effectiveAt),
    data: { model: mergeModelFacts(profile.data.model, benchmark) },
    provenance: [...profile.provenance, ...ranking.provenance.filter((source) => !profile.provenance.some((candidate) => candidate.id === source.id))],
  };
}

export function mergePublishedComparisonSource(
  comparison: UiDataContractV1<CompareData>,
  ranking: UiDataContractV1<RankingData> | null,
): UiDataContractV1<CompareData> {
  if (comparison.data === null || ranking?.data === null || ranking === null) return comparison;
  const index = rankingModelIndex(ranking);
  return {
    ...comparison,
    status: comparison.status === 'available' && ranking.status === 'available' ? 'available' : 'partial',
    effectiveAt: mergedEffectiveAt(comparison.effectiveAt, ranking.effectiveAt),
    data: {
      ...comparison.data,
      models: comparison.data.models.map((model) => {
        const identity = availableValue(model.identity);
        const benchmark = index.get(identity?.slug ?? model.id);
        return benchmark === undefined ? model : mergeModelFacts(model, benchmark);
      }),
    },
    provenance: [...comparison.provenance, ...ranking.provenance.filter((source) => !comparison.provenance.some((candidate) => candidate.id === source.id))],
  };
}

export function mergePublishedRankingDirectorySource(
  ranking: UiDataContractV1<RankingData>,
  directory: UiDataContractV1<ModelDirectoryData> | null,
): UiDataContractV1<RankingData> {
  if (ranking.data === null || directory?.data === null || directory === null) return ranking;
  const index = new Map<string, PreviewModel>();
  for (const model of directory.data.models) {
    index.set(model.id, model);
    const identity = availableValue(model.identity);
    if (identity !== null) index.set(identity.slug, model);
  }
  return {
    ...ranking,
    effectiveAt: mergedEffectiveAt(ranking.effectiveAt, directory.effectiveAt),
    data: {
      ...ranking.data,
      models: ranking.data.models.map((entry) => {
        const identity = availableValue(entry.model.identity);
        const routeSource = index.get(identity?.slug ?? entry.model.id);
        return routeSource === undefined ? entry : { ...entry, model: mergeModelFacts(routeSource, entry.model) };
      }),
    },
    provenance: [...ranking.provenance, ...directory.provenance.filter((source) => !ranking.provenance.some((candidate) => candidate.id === source.id))],
  };
}

export function projectPublishedModelProfile(
  published: ModelProfileViewModel,
  fetchedAt = new Date().toISOString(),
): UiDataContractV1<PreviewModelProfileData> {
  const model = profileModel(published);
  const provenance = model.identity.availability === 'available' ? [model.identity.provenance] : [];
  return envelope({
    data: { model },
    fetchedAt,
    effectiveAt: published.publishedAt,
    provenance,
  });
}

export function projectPublishedComparison(
  profiles: readonly ModelProfileViewModel[],
  requestedModelIds: readonly string[],
  fetchedAt = new Date().toISOString(),
): UiDataContractV1<CompareData> {
  const bySlug = new Map(profiles.map((profile) => [profile.profile.identity.slug, profile]));
  const models = requestedModelIds.flatMap((id) => {
    const profile = bySlug.get(id);
    return profile === undefined ? [] : [profileModel(profile)];
  });
  const provenance = models.flatMap((model) => model.identity.availability === 'available' ? [model.identity.provenance] : []);
  const unavailableModelIds = requestedModelIds
    .filter((id) => !bySlug.has(id))
    .map((id) => unavailable<string>(`No published profile is available for ${id}.`));
  return envelope({
    data: { models, unavailableModelIds },
    fetchedAt,
    effectiveAt: profiles.length > 0 && profiles.every((profile) => profile.publishedAt === profiles[0]!.publishedAt)
      ? profiles[0]!.publishedAt
      : null,
    provenance,
    status: unavailableModelIds.length === 0 ? 'partial' : models.length === 0 ? 'unavailable' : 'partial',
  });
}

function lifecycleIdentity(offer: ModelOffer, provenance: Provenance) {
  return available({ slug: offer.modelId, name: offer.displayName, provider: offer.providerId }, provenance);
}

export function projectPublishedLifecycle(
  catalog: CatalogResponse,
  query: { readonly asOf: string; readonly horizonDays: number },
  fetchedAt = new Date().toISOString(),
): UiDataContractV1<LifecycleData> {
  const asOf = Date.parse(query.asOf);
  const horizon = asOf + query.horizonDays * 86_400_000;
  const models = catalog.modelOffers.flatMap((offer) => {
    if (offer.expirationDate === undefined) return [];
    const expiration = Date.parse(`${offer.expirationDate}T00:00:00.000Z`);
    if (!Number.isFinite(expiration) || expiration < asOf || expiration > horizon) return [];
    const source = catalog.provenance.find((candidate) => candidate.id === offer.sourceId);
    const provenance = pipelineProvenance({
      id: `catalog:${catalog.revision}:${offer.id}`,
      label: 'Published endpoint catalog',
      effectiveAt: source?.observedAt ?? catalog.freshness.checkedAt,
      note: 'Official endpoint expiration date retained by the reviewed catalog.',
    });
    const lifecycle: ModelLifecycle = {
      status: 'Retirement scheduled',
      sunsetOn: available(offer.expirationDate, provenance),
    };
    return [{
      modelId: offer.modelId,
      identity: lifecycleIdentity(offer, provenance),
      lifecycle: available(lifecycle, provenance),
      replacement: unavailable<LifecycleReplacement>('No reviewed replacement model is published for this endpoint.', provenance),
    }];
  });
  const catalogProvenance = pipelineProvenance({
    id: `catalog:${catalog.revision}`,
    label: 'Published endpoint catalog',
    effectiveAt: catalog.freshness.checkedAt,
    note: 'Reviewed catalog expiration-date projection.',
  });
  return envelope({
    data: { models },
    fetchedAt,
    effectiveAt: catalog.freshness.checkedAt,
    provenance: models.length === 0 ? [catalogProvenance] : models.flatMap((model) => model.identity.availability === 'available' ? [model.identity.provenance] : []),
    status: catalog.freshness.status === 'stale' ? 'partial' : 'available',
  });
}
