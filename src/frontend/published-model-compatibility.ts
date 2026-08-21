import type { CatalogResponse, ModelOffer } from '../catalog/contracts';
import type { ModelDirectoryEntry, ModelDirectoryEnvelope } from './model-directory-contracts';
import type { ModelProfileViewModel } from './model-profile-contracts';
import type {
  CompareData,
  EvidenceValue,
  LifecycleData,
  LifecycleReplacement,
  ModelAccess,
  ModelDirectoryData,
  ModelLifecycle,
  PreviewModel,
  PreviewModelProfileData,
  Provenance,
  RankingData,
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
  readonly note: string;
}): Provenance {
  return { ...input, kind: 'accepted_pipeline' };
}

function modelAccess(sourceType: ModelDirectoryEntry['sourceType'], provenance: Provenance): EvidenceValue<ModelAccess> {
  if (sourceType === 'Proprietary') return available('Proprietary', provenance);
  if (sourceType === 'Open Weight') return available('Open weights', provenance);
  return unavailable('The published model record does not classify access.', provenance);
}

function routePricing(
  route: ModelDirectoryEntry['representativePrice'],
  provenance: Provenance,
): EvidenceValue<RoutePricing> {
  if (route === null || route.inputUsdPerMillion === null || route.outputUsdPerMillion === null) {
    return unavailable('No complete published input/output route price is available.', provenance);
  }
  return available({
    route: route.routeId,
    inputUsdPerMillion: route.inputUsdPerMillion,
    outputUsdPerMillion: route.outputUsdPerMillion,
    contextWindowTokens: route.contextWindowTokens === null
      ? unavailable('No published context-window value is available.', provenance)
      : available(route.contextWindowTokens, provenance),
    maxOutputTokens: route.maxOutputTokens === null
      ? unavailable('No published maximum-output value is available.', provenance)
      : available(route.maxOutputTokens, provenance),
    inputModalities: route.inputModalities ?? [],
    outputModalities: route.outputModalities ?? [],
    cache: route.cachedInputUsdPerMillion === null
      ? unavailable('No published cache-read price is available for this route.', provenance)
      : available({
        readUsdPerMillion: available(route.cachedInputUsdPerMillion, provenance),
        writeUsdPerMillion: unavailable('No published cache-write price is available for this route.', provenance),
      }, provenance),
  }, provenance);
}

function directoryModel(entry: ModelDirectoryEntry, envelope: ModelDirectoryEnvelope): PreviewModel {
  const provenance = pipelineProvenance({
    id: `model-directory:${envelope.revision}:${entry.canonicalSlug}`,
    label: 'Published model directory',
    effectiveAt: entry.profileCheckedAt,
    note: `Validated weekly directory and profile projection for ${entry.canonicalSlug}.`,
  });
  const radar = entry.strongestCategory === null ? [] : [{
    key: entry.strongestCategory.key,
    label: entry.strongestCategory.label,
    percentile: entry.strongestCategory.percentile,
    rank: entry.strongestCategory.rank,
    fieldSize: entry.strongestCategory.fieldSize,
  }];
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
    routePricing: routePricing(entry.representativePrice, provenance),
    taskEconomics: unavailable('The directory does not publish task-economics evidence.', provenance),
    runtime: unavailable('No published runtime observation is available for this model.', provenance),
    lifecycle: unavailable('Lifecycle status is sourced independently from the endpoint catalog.', provenance),
  };
}

function profileModel(profileView: ModelProfileViewModel): PreviewModel {
  const { profile, directory } = profileView;
  const provenance = pipelineProvenance({
    id: `model-profile:${profileView.revision}:${profile.identity.slug}`,
    label: 'Published model profile',
    effectiveAt: profile.summary.checkedAt,
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
    routePricing: routePricing(compatibleRoute, provenance),
    taskEconomics: unavailable('The profile does not publish comparable task-economics evidence.', provenance),
    runtime: unavailable('No published runtime observation is available for this model.', provenance),
    lifecycle: unavailable('Lifecycle status is sourced independently from the endpoint catalog.', provenance),
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
  };
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
    effectiveAt: directory.effectiveAt === ranking.effectiveAt ? directory.effectiveAt : null,
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
    effectiveAt: profile.effectiveAt === ranking.effectiveAt ? profile.effectiveAt : null,
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
    effectiveAt: comparison.effectiveAt === ranking.effectiveAt ? comparison.effectiveAt : null,
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
    effectiveAt: ranking.effectiveAt === directory.effectiveAt ? ranking.effectiveAt : null,
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
