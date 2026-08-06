import { describe, expect, it } from 'vitest';
import type { LeaderboardEntry } from './leaderboards';
import { LEADERBOARD_DEFINITIONS } from './leaderboards';
import {
  createLeaderboardQueryCapabilities,
  filterLeaderboardEntries,
  leaderboardQueryToSearchParams,
  parseLeaderboardQuery,
  type LeaderboardQueryState,
} from './leaderboard-query';

const ISO_TIME = '2026-08-06T00:00:00.000Z';

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  const metric: NonNullable<LeaderboardEntry['metric']> = {
    modelKey: 'model-a',
    metricKey: 'benchlm:category:coding',
    category: 'coding',
    value: 80,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    sourceUpdatedAt: ISO_TIME,
    sourceModelId: 'model-a',
    sourceArtifactId: 'benchlm-models',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
  };
  return {
    model: {
      modelKey: 'model-a',
      slug: 'model-a',
      name: 'Model A',
      creator: 'Provider A',
      sourceType: 'Proprietary',
      reasoningType: null,
      releaseDate: null,
      contextWindowTokens: 128_000,
      evidenceStatus: 'supported',
      rankingEligible: true,
      confidenceLower: null,
      confidenceUpper: null,
      benchmarkCount: 1,
      sourceId: 'benchlm',
      sourceModelId: 'model-a',
      sourceArtifactId: 'benchlm-models',
    },
    metric,
    metrics: [metric],
    primaryPrice: {
      modelKey: 'model-a',
      sourceId: 'openrouter',
      providerId: 'openrouter',
      inputUsdPerMillion: 1,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: 5,
      contextWindowTokens: 128_000,
      verificationStatus: 'primary',
      routeId: 'openrouter:model-a',
      sourceModelId: 'model-a',
      canonicalSlug: 'model-a',
      maxInputTokens: null,
      maxOutputTokens: null,
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportedParameters: null,
      sourceArtifactId: 'openrouter-models',
    },
    blendedCostPerMillion: 2,
    contextWindowTokens: 128_000,
    sourceRank: null,
    onValueFrontier: false,
    ...overrides,
  };
}

const DEFAULT_STATE: LeaderboardQueryState = {
  query: '',
  profile: 'balanced',
  priceMode: 'representative',
  metricKey: null,
  sort: 'score-desc',
  providers: [],
  sourceTypes: [],
  evidence: null,
  priceMinimum: null,
  priceMaximum: null,
  includeEstimated: false,
};

describe('leaderboard query contract', () => {
  it('filters by route-supported predicates before applying deterministic score ties', () => {
    const alpha = entry({
      model: { ...entry().model, modelKey: 'alpha', slug: 'alpha', name: 'Alpha', creator: 'Provider A', sourceType: 'Open Weight' },
      metric: { ...entry().metric!, modelKey: 'alpha', sourceModelId: 'alpha', value: 90 },
      primaryPrice: { ...entry().primaryPrice!, modelKey: 'alpha', sourceModelId: 'alpha', canonicalSlug: 'alpha' },
    });
    const zeta = entry({
      model: { ...entry().model, modelKey: 'zeta', slug: 'zeta', name: 'Zeta', creator: 'Provider A', sourceType: 'Open Weight' },
      metric: { ...entry().metric!, modelKey: 'zeta', sourceModelId: 'zeta', value: 90 },
      primaryPrice: { ...entry().primaryPrice!, modelKey: 'zeta', sourceModelId: 'zeta', canonicalSlug: 'zeta' },
    });
    const wrongProvider = entry({
      model: { ...entry().model, modelKey: 'wrong-provider', slug: 'wrong-provider', creator: 'Provider B', sourceType: 'Open Weight' },
      metric: { ...entry().metric!, modelKey: 'wrong-provider', sourceModelId: 'wrong-provider', value: 99 },
      primaryPrice: { ...entry().primaryPrice!, modelKey: 'wrong-provider', sourceModelId: 'wrong-provider', canonicalSlug: 'wrong-provider' },
    });
    const sourceOnly = entry({
      model: { ...entry().model, modelKey: 'source-only', slug: 'source-only', creator: 'Provider A', sourceType: 'Open Weight', evidenceStatus: 'source_only' },
      metric: { ...entry().metric!, modelKey: 'source-only', sourceModelId: 'source-only', value: 100 },
      primaryPrice: { ...entry().primaryPrice!, modelKey: 'source-only', sourceModelId: 'source-only', canonicalSlug: 'source-only' },
    });

    const filtered = filterLeaderboardEntries([zeta, wrongProvider, sourceOnly, alpha], {
      ...DEFAULT_STATE,
      query: 'a',
      metricKey: 'benchlm:category:coding',
      providers: ['Provider A'],
      sourceTypes: ['Open Weight'],
      evidence: 'supported',
      priceMinimum: 0,
      priceMaximum: 5,
    });

    expect(filtered.map((item) => item.model.slug)).toEqual(['alpha', 'zeta']);
  });

  it('uses a fixed 50/50 verified-primary representative rate outside value and pricing routes', () => {
    const alpha = entry({
      model: { ...entry().model, modelKey: 'alpha', slug: 'alpha' },
      metric: { ...entry().metric!, modelKey: 'alpha', sourceModelId: 'alpha', value: 90 },
      primaryPrice: { ...entry().primaryPrice!, modelKey: 'alpha', sourceModelId: 'alpha', canonicalSlug: 'alpha', inputUsdPerMillion: 1, outputUsdPerMillion: 9 },
      blendedCostPerMillion: null,
    });
    const zeta = entry({
      model: { ...entry().model, modelKey: 'zeta', slug: 'zeta' },
      metric: { ...entry().metric!, modelKey: 'zeta', sourceModelId: 'zeta', value: 90 },
      primaryPrice: { ...entry().primaryPrice!, modelKey: 'zeta', sourceModelId: 'zeta', canonicalSlug: 'zeta', inputUsdPerMillion: 9, outputUsdPerMillion: 1 },
      blendedCostPerMillion: null,
    });
    const incomplete = entry({
      model: { ...entry().model, modelKey: 'incomplete', slug: 'incomplete' },
      metric: { ...entry().metric!, modelKey: 'incomplete', sourceModelId: 'incomplete', value: 99 },
      primaryPrice: { ...entry().primaryPrice!, modelKey: 'incomplete', sourceModelId: 'incomplete', canonicalSlug: 'incomplete', outputUsdPerMillion: null },
      blendedCostPerMillion: null,
    });

    const filtered = filterLeaderboardEntries([zeta, incomplete, alpha], {
      ...DEFAULT_STATE,
      sort: 'price-asc',
      priceMinimum: 5,
      priceMaximum: 5,
    });

    expect(filtered.map((item) => [item.model.slug, item.blendedCostPerMillion]))
      .toEqual([['alpha', 5], ['zeta', 5]]);
  });

  it('round trips a canonical supported query state and encodes list values once', () => {
    const entries = [entry({
      model: { ...entry().model, creator: 'Provider B', sourceType: 'Open Weight' },
    }), entry()];
    const definition = LEADERBOARD_DEFINITIONS['llm-coding'];
    const capabilities = createLeaderboardQueryCapabilities(definition, entries);
    const state: LeaderboardQueryState = {
      query: 'Alpha',
      profile: 'balanced',
      priceMode: 'representative',
      metricKey: 'benchlm:category:coding',
      sort: 'price-asc',
      providers: ['Provider A', 'Provider B'],
      sourceTypes: ['Open Weight'],
      evidence: 'supported',
      priceMinimum: 0,
      priceMaximum: 5,
      includeEstimated: false,
    };

    const params = leaderboardQueryToSearchParams(state);

    expect(params.toString())
      .toBe('profile=balanced&sort=price-asc&q=Alpha&metric=benchlm%3Acategory%3Acoding&provider=Provider+A&provider=Provider+B&sourceType=Open+Weight&evidence=supported&minPrice=0&maxPrice=5');
    expect(parseLeaderboardQuery(params, definition, capabilities, 'ui')).toEqual({ ok: true, state });
  });

  it('round trips providers containing commas with canonical repeated list parameters', () => {
    const definition = LEADERBOARD_DEFINITIONS['llm-coding'];
    const entries = [
      entry({ model: { ...entry().model, creator: 'Provider, Inc.', sourceType: 'Open Weight' } }),
      entry({ model: { ...entry().model, creator: 'Provider A', sourceType: 'Proprietary' } }),
    ];
    const capabilities = createLeaderboardQueryCapabilities(definition, entries);
    const state: LeaderboardQueryState = {
      ...DEFAULT_STATE,
      providers: ['Provider A', 'Provider, Inc.'],
      sourceTypes: ['Open Weight', 'Proprietary'],
    };

    const params = leaderboardQueryToSearchParams(state);

    expect(params.getAll('provider')).toEqual(['Provider A', 'Provider, Inc.']);
    expect(params.getAll('sourceType')).toEqual(['Open Weight', 'Proprietary']);
    expect(params.toString()).toBe('profile=balanced&sort=score-desc&provider=Provider+A&provider=Provider%2C+Inc.&sourceType=Open+Weight&sourceType=Proprietary');
    expect(parseLeaderboardQuery(params, definition, capabilities, 'ui')).toEqual({ ok: true, state });
    expect(parseLeaderboardQuery(params, definition, capabilities, 'api')).toEqual({ ok: true, state });
  });

  it('uses only the explicit representative price mode even when a profile blend is present', () => {
    const priced = entry({
      primaryPrice: { ...entry().primaryPrice!, inputUsdPerMillion: 1, outputUsdPerMillion: 9 },
      blendedCostPerMillion: 2,
    });
    const state = {
      ...DEFAULT_STATE,
      priceMode: 'representative',
      priceMinimum: 5,
      priceMaximum: 5,
    } as LeaderboardQueryState & { readonly priceMode: 'representative' };

    expect(filterLeaderboardEntries([priced], state).map((item) => item.blendedCostPerMillion)).toEqual([5]);
  });

  it('never falls back to a profile blend when representative price evidence is incomplete', () => {
    const incomplete = entry({
      primaryPrice: { ...entry().primaryPrice!, outputUsdPerMillion: null },
      blendedCostPerMillion: 2,
    });
    const state = {
      ...DEFAULT_STATE,
      priceMode: 'representative',
      priceMinimum: 2,
      priceMaximum: 2,
    } as LeaderboardQueryState & { readonly priceMode: 'representative' };

    expect(filterLeaderboardEntries([incomplete], state)).toEqual([]);
  });

  it.each([
    'unknown=1',
    'profile=not-real',
    'profile=outputHeavy',
    'provider=Missing',
    'metric=benchlm%3Acategory%3Aagentic',
    'lifecycle=current',
    'minPrice=9&maxPrice=2',
    'evidence=estimated&estimated=0',
    `q=${'x'.repeat(121)}`,
    'sort=score-desc&sort=price-asc',
  ])('rejects malformed, duplicate, or unsupported API query %s', (query) => {
    const definition = LEADERBOARD_DEFINITIONS['llm-coding'];
    const capabilities = createLeaderboardQueryCapabilities(definition, [entry()]);

    expect(parseLeaderboardQuery(new URLSearchParams(query), definition, capabilities, 'api'))
      .toMatchObject({ ok: false, status: 400 });
  });

  it('ignores unknown UI keys and normalizes invalid known values to route defaults', () => {
    const definition = LEADERBOARD_DEFINITIONS['llm-coding'];
    const capabilities = createLeaderboardQueryCapabilities(definition, [entry()]);

    expect(parseLeaderboardQuery(new URLSearchParams(`unknown=1&profile=outputHeavy&provider=Missing&sort=not-real&q=${'x'.repeat(121)}`), definition, capabilities, 'ui'))
      .toEqual({ ok: true, state: DEFAULT_STATE });
  });

  it('does not serialize contradictory price bounds into a share URL', () => {
    const params = leaderboardQueryToSearchParams({
      ...DEFAULT_STATE,
      priceMinimum: 9,
      priceMaximum: 2,
    });

    expect(params.has('minPrice')).toBe(false);
    expect(params.has('maxPrice')).toBe(false);
  });

  it('trims CSV selections before URL encoding them', () => {
    expect(leaderboardQueryToSearchParams({
      ...DEFAULT_STATE,
      providers: [' Provider B ', 'Provider A'],
      sourceTypes: ['Open Weight'],
    }).toString()).toBe('profile=balanced&sort=score-desc&provider=Provider+A&provider=Provider+B&sourceType=Open+Weight');
  });
});
