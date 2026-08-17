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

function commonEffectiveAt(provenance: readonly Provenance[]): string | null {
  const effectiveTimes = new Set(provenance.map((source) => source.effectiveAt));
  return effectiveTimes.size === 1 ? provenance[0]?.effectiveAt ?? null : null;
}

function contract<T>(
  data: T,
  provenance: readonly Provenance[],
  status: 'available' | 'partial' = 'partial',
): UiDataContractV1<T> {
  return {
    contractVersion: 'ui-data-contract/v1',
    status,
    fetchedAt: new Date().toISOString(),
    effectiveAt: commonEffectiveAt(provenance),
    data,
    provenance,
  };
}

function unavailableContract<T>(reason: string): UiDataContractV1<T> {
  return {
    contractVersion: 'ui-data-contract/v1',
    status: 'unavailable',
    reason,
    fetchedAt: new Date().toISOString(),
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

export const fixtureAdapter: PreviewDataAdapter = {
  async models(query): Promise<UiDataContractV1<ModelDirectoryData>> {
    return contract({ models: modelsFor(query) }, ALL_FIXTURE_PROVENANCE);
  },

  async profile(slug): Promise<UiDataContractV1<PreviewModelProfileData>> {
    const model = PREVIEW_FIXTURE_MODELS.find((candidate) => identityOf(candidate)?.slug === slug);
    return model
      ? contract({ model }, ALL_FIXTURE_PROVENANCE)
      : unavailableContract<PreviewModelProfileData>(`No approved fixture for ${slug}`);
  },

  async lifecycle(query): Promise<UiDataContractV1<LifecycleData>> {
    const models = query.horizonDays >= 46 ? PREVIEW_FIXTURE_LIFECYCLE : [];
    return contract({ models }, [PREVIEW_FIXTURE_PROVENANCE.identity, PREVIEW_FIXTURE_PROVENANCE.lifecycle]);
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
    return contract({ models }, ALL_FIXTURE_PROVENANCE);
  },

  async comparison(query): Promise<UiDataContractV1<CompareData>> {
    const models = PREVIEW_FIXTURE_MODELS.filter((model) => query.modelIds.includes(model.id));
    const unavailableModelIds = query.modelIds
      .filter((modelId) => !models.some((model) => model.id === modelId))
      .map((modelId) => ({ availability: 'unavailable' as const, reason: `No approved fixture for ${modelId}` }));
    return contract({ models, unavailableModelIds }, ALL_FIXTURE_PROVENANCE);
  },

  async subscription(query): Promise<UiDataContractV1<SubscriptionData>> {
    const model = query.modelId === undefined
      ? PREVIEW_FIXTURE_MODELS[0]
      : PREVIEW_FIXTURE_MODELS.find((candidate) => candidate.id === query.modelId);
    return contract({
      plans: PREVIEW_FIXTURE_SUBSCRIPTION_PLANS,
      selectedModelTaskEconomics: model?.taskEconomics ?? {
        availability: 'unavailable',
        reason: 'No approved model task-economics source',
      },
    }, [PREVIEW_FIXTURE_PROVENANCE.plans, PREVIEW_FIXTURE_PROVENANCE.economics]);
  },
};
