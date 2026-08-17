import type {
  CompareData,
  CompareQuery,
  LifecycleData,
  LifecycleQuery,
  ModelDirectoryData,
  ModelDirectoryQuery,
  PreviewDataAdapter,
  PreviewModel,
  PreviewModelProfileData,
  Provenance,
  RankingData,
  RankingQuery,
  SubscriptionData,
  SubscriptionQuery,
  UiDataContractV1,
} from './contracts';
import {
  PREVIEW_FIXTURE_LIFECYCLE,
  PREVIEW_FIXTURE_MODELS,
  PREVIEW_FIXTURE_PROVENANCE,
  PREVIEW_FIXTURE_SUBSCRIPTION_PLANS,
} from './fixtures';

const ALL_FIXTURE_PROVENANCE = Object.values(PREVIEW_FIXTURE_PROVENANCE);
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

function commonEffectiveAt(provenance: readonly Provenance[]): string | null {
  const effectiveTimes = new Set(provenance.map((source) => source.effectiveAt));
  return effectiveTimes.size === 1 ? provenance[0]?.effectiveAt ?? null : null;
}

function contract<T>(
  data: T,
  provenance: readonly Provenance[],
  fetchedAt: string,
  status: 'available' | 'partial' = 'partial',
): UiDataContractV1<T> {
  return {
    contractVersion: 'ui-data-contract/v1',
    status,
    fetchedAt,
    effectiveAt: commonEffectiveAt(provenance),
    data,
    provenance,
  };
}

function unavailableContract<T>(reason: string, fetchedAt: string): UiDataContractV1<T> {
  return {
    contractVersion: 'ui-data-contract/v1',
    status: 'unavailable',
    reason,
    fetchedAt,
    effectiveAt: null,
    data: null,
    provenance: [],
  };
}

function identityOf(model: PreviewModel) {
  return model.identity.availability === 'available' ? model.identity.value : null;
}

function modelsFor(query: ModelDirectoryQuery): readonly PreviewModel[] {
  const search = query.search?.trim().toLocaleLowerCase();
  const provider = query.provider?.trim().toLocaleLowerCase();
  return PREVIEW_FIXTURE_MODELS.filter((model) => {
    const identity = identityOf(model);
    if (!identity) return false;
    const matchesSearch = !search || [identity.name, identity.provider, identity.slug]
      .some((value) => value.toLocaleLowerCase().includes(search));
    const matchesProvider = !provider || identity.provider.toLocaleLowerCase() === provider;
    const matchesAccess = !query.access || (model.access.availability === 'available' && model.access.value === query.access);
    return matchesSearch && matchesProvider && matchesAccess;
  });
}

function modelProvenance(models: readonly PreviewModel[]): readonly Provenance[] {
  return models.length === 0 ? [] : ALL_FIXTURE_PROVENANCE;
}

function lifecycleModelsFor(query: LifecycleQuery, fetchedAt: string) {
  const horizonDays = Math.max(0, query.horizonDays);
  const referenceTime = Date.parse(fetchedAt);
  return PREVIEW_FIXTURE_LIFECYCLE.filter((model) => {
    if (model.lifecycle.availability !== 'available' || model.lifecycle.value.sunsetOn.availability !== 'available') return false;
    const sunsetTime = Date.parse(model.lifecycle.value.sunsetOn.value);
    if (!Number.isFinite(referenceTime) || !Number.isFinite(sunsetTime)) return false;
    const daysUntilSunset = (sunsetTime - referenceTime) / MILLISECONDS_PER_DAY;
    return daysUntilSunset >= 0 && daysUntilSunset <= horizonDays;
  });
}

export function createFixtureAdapter(now: () => Date = () => new Date()): PreviewDataAdapter {
  return {
    async models(query): Promise<UiDataContractV1<ModelDirectoryData>> {
      const models = modelsFor(query);
      return contract({ models }, modelProvenance(models), now().toISOString());
    },

    async profile(slug): Promise<UiDataContractV1<PreviewModelProfileData>> {
      const fetchedAt = now().toISOString();
      const model = PREVIEW_FIXTURE_MODELS.find((candidate) => identityOf(candidate)?.slug === slug);
      return model
        ? contract({ model }, ALL_FIXTURE_PROVENANCE, fetchedAt)
        : unavailableContract<PreviewModelProfileData>(`No approved fixture for ${slug}`, fetchedAt);
    },

    async lifecycle(query): Promise<UiDataContractV1<LifecycleData>> {
      const fetchedAt = now().toISOString();
      const models = lifecycleModelsFor(query, fetchedAt);
      const provenance = models.length === 0
        ? []
        : [PREVIEW_FIXTURE_PROVENANCE.identity, PREVIEW_FIXTURE_PROVENANCE.lifecycle];
      return contract({ models }, provenance, fetchedAt);
    },

    async rankings(query): Promise<UiDataContractV1<RankingData>> {
      const limit = query.limit === undefined ? PREVIEW_FIXTURE_MODELS.length : Math.max(0, query.limit);
      const models = PREVIEW_FIXTURE_MODELS.slice(0, limit).map((model, index) => ({
        model,
        rank: {
          availability: 'available' as const,
          value: index + 1,
          provenance: PREVIEW_FIXTURE_PROVENANCE.benchmark,
        },
      }));
      return contract({ models }, models.length === 0 ? [] : ALL_FIXTURE_PROVENANCE, now().toISOString());
    },

    async comparison(query): Promise<UiDataContractV1<CompareData>> {
      const modelsById = new Map(PREVIEW_FIXTURE_MODELS.map((model) => [model.id, model]));
      const models = query.modelIds.flatMap((modelId) => {
        const model = modelsById.get(modelId);
        return model ? [model] : [];
      });
      const unavailableModelIds = query.modelIds
        .filter((modelId) => !modelsById.has(modelId))
        .map((modelId) => ({ availability: 'unavailable' as const, reason: `No approved fixture for ${modelId}` }));
      return contract({ models, unavailableModelIds }, modelProvenance(models), now().toISOString());
    },

    async subscription(query): Promise<UiDataContractV1<SubscriptionData>> {
      const model = query.modelId === undefined
        ? PREVIEW_FIXTURE_MODELS[0]
        : PREVIEW_FIXTURE_MODELS.find((candidate) => candidate.id === query.modelId);
      const selectedModelTaskEconomics = model?.taskEconomics ?? {
        availability: 'unavailable' as const,
        reason: 'No approved model task-economics source',
      };
      const provenance = selectedModelTaskEconomics.availability === 'available'
        ? [PREVIEW_FIXTURE_PROVENANCE.plans, PREVIEW_FIXTURE_PROVENANCE.economics]
        : [PREVIEW_FIXTURE_PROVENANCE.plans];
      return contract({
        plans: PREVIEW_FIXTURE_SUBSCRIPTION_PLANS,
        selectedModelTaskEconomics,
      }, provenance, now().toISOString());
    },
  };
}

export const fixtureAdapter = createFixtureAdapter();
