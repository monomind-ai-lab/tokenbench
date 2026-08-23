import { describe, expect, it } from 'vitest';
import type { LiveBenchReleaseBundle } from '../../src/livebench/contracts';
import type { SourceAttribution } from '../../src/pipeline/ui-data-contract-v1-core';
import {
  buildLiveBenchComparisonData,
  buildLiveBenchModelsData,
  buildLiveBenchProfileData,
} from './livebench-ui-data';
import {
  buildStrictModelJoin,
  buildStrictModelJoinEnvelope,
  type StrictModelJoinRouteInput,
} from './strict-model-join';

const liveBenchSource: SourceAttribution = {
  sourceRef: 'livebench:release-r1',
  fieldGroup: '/data',
  sourceId: 'livebench',
  sourceRevision: 'release-r1',
  label: 'LiveBench release-r1',
  url: 'https://github.com/LiveBench/new-livebench/tree/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  licenseId: 'Apache-2.0',
  observedAt: '2026-08-20T00:00:00.000Z',
  effectiveAt: '2026-06-25T00:00:00.000Z',
};

const catalogSource: SourceAttribution = {
  sourceRef: 'catalog:catalog-r1:openrouter-models',
  fieldGroup: '/data',
  sourceId: 'openrouter-models',
  sourceRevision: 'catalog-r1',
  label: 'Active catalog source openrouter-models',
  url: 'https://openrouter.ai/api/v1/models',
  licenseId: 'OpenRouter-ToS',
  observedAt: '2026-08-21T00:00:00.000Z',
  effectiveAt: '2026-08-21T00:00:00.000Z',
};

const bundle: LiveBenchReleaseBundle = {
  schemaVersion: 1,
  releaseId: '2026-06-25',
  sourceCommit: 'a'.repeat(40),
  observedAt: liveBenchSource.observedAt,
  categories: [{ categoryId: 'reasoning', label: 'Reasoning', taskIds: ['logic'] }],
  tasks: [{ taskId: 'logic', label: 'Logic', categoryId: 'reasoning' }],
  models: [
    {
      configurationId: 'alpha-livebench', sourceModelId: 'alpha', displayName: 'Alpha', organization: 'Example',
      openWeights: false, reasoner: false, isDerivativeFinetune: false,
      baseConfigurationId: null, lineageSourceUrl: null,
    },
    {
      configurationId: 'beta-livebench', sourceModelId: 'beta', displayName: 'Beta', organization: 'Example',
      openWeights: false, reasoner: false, isDerivativeFinetune: false,
      baseConfigurationId: null, lineageSourceUrl: null,
    },
  ],
  taskScores: [
    { configurationId: 'alpha-livebench', taskId: 'logic', score: 80 },
    { configurationId: 'beta-livebench', taskId: 'logic', score: 70 },
  ],
  taskEconomics: [
    {
      configurationId: 'alpha-livebench', taskId: 'logic', questionCount: 10, evaluationCostUsd: 1,
      inputPriceUsdPerMillion: null, outputPriceUsdPerMillion: null,
      meanInputTokens: null, meanOutputTokens: null,
    },
    {
      configurationId: 'beta-livebench', taskId: 'logic', questionCount: 10, evaluationCostUsd: 1,
      inputPriceUsdPerMillion: null, outputPriceUsdPerMillion: null,
      meanInputTokens: null, meanOutputTokens: null,
    },
  ],
};

function exactRoute(overrides: Partial<StrictModelJoinRouteInput> = {}): StrictModelJoinRouteInput {
  return {
    liveBenchConfigurationId: 'alpha-livebench',
    canonicalConfigurationId: 'canonical-alpha',
    liveBenchIdentityMatchKind: 'reviewed',
    liveBenchIdentityReviewStatus: 'verified',
    canonicalModelKey: 'openrouter:alpha',
    directoryModelKey: 'openrouter:alpha',
    directoryCanonicalSlug: 'alpha',
    directorySourceModelId: 'openrouter/alpha',
    routeId: 'openrouter:alpha',
    providerId: 'openrouter',
    catalogModelId: 'openrouter/alpha',
    availability: 'available',
    inputMicroDollarsPerMillion: 1_000_000,
    cacheReadMicroDollarsPerMillion: 500_000,
    cacheWriteMicroDollarsPerMillion: null,
    outputMicroDollarsPerMillion: 2_000_000,
    contextWindowTokens: 128_000,
    maxOutputTokens: 16_384,
    expirationDate: '2026-09-01',
    source: catalogSource,
    inputModalities: ['text'],
    outputModalities: ['text'],
    modalitySource: catalogSource,
    ...overrides,
  };
}

function exactJoin(routes: readonly StrictModelJoinRouteInput[] = [exactRoute()]) {
  return buildStrictModelJoin({
    catalogRevision: 'catalog-r1',
    catalogObservedAt: '2026-08-21T00:00:00.000Z',
    asOf: '2026-08-21T00:00:00.000Z',
    routes,
  });
}

describe('strict LiveBench model join', () => {
  it('joins only an exact reviewed canonical configuration to the active catalog route', () => {
    const join = exactJoin();
    const profile = buildLiveBenchProfileData({
      bundle,
      source: liveBenchSource,
      join,
      request: { slug: 'alpha' },
    });

    expect(profile?.model.summary.selectedRouteId).toBe('openrouter:alpha');
    expect(profile?.model.summary.selectedRoute?.inputMicroDollarsPerMillion).toEqual({
      availability: 'available', value: 1_000_000, sourceRefs: [catalogSource.sourceRef],
    });
    expect(profile?.model.summary.lifecycleStatus).toEqual({
      availability: 'available', value: 'sunset_scheduled', sourceRefs: [catalogSource.sourceRef],
    });
    expect(profile?.model.routes[0]?.inputModalities).toEqual(['text']);
    expect(profile?.model.lifecycleEvents).toMatchObject([{
      eventType: 'expiration', effectiveAt: '2026-09-01T00:00:00.000Z',
    }]);

    const directory = buildLiveBenchModelsData({
      bundle,
      source: liveBenchSource,
      join,
      request: { search: null, access: 'all', providerIds: ['openrouter'], limit: 50, cursor: null },
    });
    expect(directory.models.map((model) => model.identity.slug)).toEqual(['alpha']);
  });

  it('rejects an identity mismatch instead of joining a similarly named catalog row', () => {
    const join = exactJoin([exactRoute({ catalogModelId: 'openrouter/alpha-neighbor' })]);
    const profile = buildLiveBenchProfileData({
      bundle,
      source: liveBenchSource,
      join,
      request: { slug: 'alpha' },
    });

    expect(join.modelsByConfigurationId.size).toBe(0);
    expect(profile?.model.summary.selectedRoute).toBeNull();
    expect(profile?.model.summary.lifecycleStatus).toMatchObject({ availability: 'unavailable', value: null });
  });

  it('keeps a no-catalog projection benchmark-only without a fallback route', () => {
    const join = buildStrictModelJoin({
      catalogRevision: null,
      catalogObservedAt: null,
      asOf: '2026-08-21T00:00:00.000Z',
      // A missing active revision must reject even a mistakenly supplied
      // in-memory row; the loader itself also returns no rows in this case.
      routes: [exactRoute()],
    });
    const profile = buildLiveBenchProfileData({
      bundle,
      source: liveBenchSource,
      join,
      request: { slug: 'alpha' },
    });

    expect(join.sources).toEqual([]);
    expect(profile?.model.routes).toEqual([]);
    expect(profile?.model.summary.selectedRoute).toBeNull();
    expect(profile?.model.replacement).toMatchObject({ availability: 'unavailable', value: null });
  });

  it('preserves published zero prices while leaving null and unsupported cache facts unavailable', () => {
    const join = exactJoin([exactRoute({
      inputMicroDollarsPerMillion: 0,
      cacheReadMicroDollarsPerMillion: 0,
      cacheWriteMicroDollarsPerMillion: 0,
      outputMicroDollarsPerMillion: 0,
      contextWindowTokens: null,
      maxOutputTokens: null,
    })]);
    const route = join.modelsByConfigurationId.get('alpha-livebench')?.routes[0];

    expect(route?.inputMicroDollarsPerMillion).toMatchObject({ availability: 'available', value: 0 });
    expect(route?.cacheReadMicroDollarsPerMillion).toMatchObject({ availability: 'available', value: 0 });
    expect(route?.outputMicroDollarsPerMillion).toMatchObject({ availability: 'available', value: 0 });
    expect(route?.contextWindowTokens).toMatchObject({ availability: 'unavailable', value: null });
    expect(route?.maxOutputTokens).toMatchObject({ availability: 'unavailable', value: null });
    expect(route?.cacheWriteMicroDollarsPerMillion).toMatchObject({ availability: 'available', value: 0 });
    expect(route?.runtimeObservation).toMatchObject({ availability: 'unavailable', value: null });
  });

  it('does not infer a model-level lifecycle status from only one of multiple routes', () => {
    const join = exactJoin([
      exactRoute(),
      exactRoute({
        routeId: 'secondary:alpha',
        providerId: 'secondary',
        expirationDate: null,
      }),
    ]);
    const model = join.modelsByConfigurationId.get('alpha-livebench');

    expect(model?.routes).toHaveLength(2);
    expect(model?.lifecycleEvents).toHaveLength(1);
    expect(model?.lifecycleStatus).toMatchObject({ availability: 'unavailable', value: null });
  });

  it('retains independent source revisions and effective times in a mixed-source envelope', () => {
    const join = exactJoin();
    const data = buildLiveBenchModelsData({
      bundle,
      source: liveBenchSource,
      join,
      request: { search: null, access: 'all', providerIds: [], limit: 50, cursor: null },
    });
    const envelope = buildStrictModelJoinEnvelope({
      method: 'models',
      request: { search: null, access: 'all', providerIds: [], limit: 50, cursor: null },
      data,
      context: {
        revision: 'release-r1',
        releasedAt: liveBenchSource.effectiveAt ?? '2026-06-25T00:00:00.000Z',
        checkedAt: liveBenchSource.observedAt,
        source: liveBenchSource,
      },
      join,
      fetchedAt: '2026-08-21T01:00:00.000Z',
    });

    expect(envelope.effectiveAt).toBeNull();
    expect(envelope.revisions).toMatchObject({ catalog: 'catalog-r1', benchmark: 'release-r1' });
    expect(envelope.sources.map((source) => [source.sourceRef, source.effectiveAt])).toEqual([
      [liveBenchSource.sourceRef, '2026-06-25T00:00:00.000Z'],
      [catalogSource.sourceRef, '2026-08-21T00:00:00.000Z'],
    ]);
    expect(envelope.provenance.map((source) => source.effectiveAt)).toEqual([
      '2026-06-25T00:00:00.000Z',
      '2026-08-21T00:00:00.000Z',
    ]);
  });

  it('preserves the exact requested comparison order after joining catalog facts', () => {
    const comparison = buildLiveBenchComparisonData({
      bundle,
      source: liveBenchSource,
      join: exactJoin(),
      request: { modelSlugs: ['beta', 'alpha'] },
    });

    expect(comparison?.requestedModelSlugs).toEqual(['beta', 'alpha']);
    expect(comparison?.models.map((model) => model.summary.identity.slug)).toEqual(['beta', 'alpha']);
    expect(comparison?.models[0]?.summary.selectedRoute).toBeNull();
    expect(comparison?.models[1]?.summary.selectedRouteId).toBe('openrouter:alpha');
  });
});
