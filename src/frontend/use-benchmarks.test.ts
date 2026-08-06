import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeaderboardKey } from '../routing/routes';
import {
  benchmarkSummaryEndpoint,
  leaderboardEndpoint,
  useBenchmarkLeaderboard,
  useDecisionPicks,
  useHomeDecisionSnapshot,
} from './use-benchmarks';

const ISO_TIME = '2026-08-05T12:00:00.000Z';

const BENCHLM_ATTRIBUTION = {
  sourceId: 'benchlm',
  label: 'Data from BenchLM.ai',
  url: 'https://benchlm.ai/data',
  updatedAt: ISO_TIME,
};

const OPENROUTER_ATTRIBUTION = {
  sourceId: 'openrouter',
  label: 'Catalog and pricing data from OpenRouter',
  url: 'https://openrouter.ai/models',
  updatedAt: ISO_TIME,
};

const LMARENA_ATTRIBUTION = {
  sourceId: 'lmarena',
  label: 'Arena ratings from LMArena',
  url: 'https://lmarena.ai/leaderboard',
  updatedAt: ISO_TIME,
};

function benchMetric(overrides: Record<string, unknown> = {}) {
  return {
    modelKey: 'model-a',
    metricKey: 'benchlm:overall:raw',
    category: 'overall',
    value: 82.4,
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
    ...overrides,
  };
}

function primaryOpenRouterPrice(overrides: Record<string, unknown> = {}) {
  return {
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
    maxInputTokens: 126_000,
    maxOutputTokens: 2_000,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: ['temperature'],
    sourceArtifactId: 'openrouter-models',
    ...overrides,
  };
}

function supportedValueEntry(overrides: Record<string, unknown> = {}) {
  const metric = benchMetric();
  return {
    model: {
      modelKey: 'model-a',
      slug: 'model-a',
      name: 'Model A',
      creator: 'Provider A',
      sourceType: 'Proprietary',
      reasoningType: null,
      releaseDate: null,
      contextWindowTokens: null,
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
    metrics: [{ ...metric }],
    primaryPrice: primaryOpenRouterPrice(),
    blendedCostPerMillion: 2,
    contextWindowTokens: 128_000,
    sourceRank: null,
    onValueFrontier: true,
    ...overrides,
  };
}

function estimatedValueEntry() {
  const metric = benchMetric({
    modelKey: 'estimated-model',
    sourceModelId: 'estimated-model',
    rankingEligible: false,
    value: 79,
  });
  return supportedValueEntry({
    model: {
      ...supportedValueEntry().model,
      modelKey: 'estimated-model',
      slug: 'estimated-model',
      name: 'Estimated Model',
      sourceModelId: 'estimated-model',
      evidenceStatus: 'estimated',
      rankingEligible: false,
    },
    metric,
    metrics: [{ ...metric }],
    primaryPrice: null,
    blendedCostPerMillion: null,
    contextWindowTokens: null,
    sourceRank: null,
    onValueFrontier: false,
  });
}

function leaderboardEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    revision: 'benchmark-revision-1',
    publishedAt: ISO_TIME,
    freshness: { status: 'fresh', checkedAt: ISO_TIME },
    attribution: [BENCHLM_ATTRIBUTION, OPENROUTER_ATTRIBUTION],
    data: {
      key: 'llm-value',
      profile: 'balanced',
      definition: {
        kind: 'value',
        sourceId: 'benchlm',
        metricKeys: ['benchlm:overall:raw'],
        defaultSort: 'pareto-score-desc',
      },
      entries: [supportedValueEntry()],
    },
    ...overrides,
  };
}

function codingEnvelope(entryOverrides: Record<string, unknown> = {}) {
  const value = leaderboardEnvelope();
  const currentEntry = value.data.entries[0];
  const metric = {
    ...currentEntry.metric,
    metricKey: 'benchlm:category:coding',
    category: 'coding',
  };
  return {
    ...value,
    attribution: [BENCHLM_ATTRIBUTION],
    data: {
      key: 'llm-coding',
      profile: 'balanced',
      definition: {
        kind: 'benchlm',
        sourceId: 'benchlm',
        metricKeys: ['benchlm:category:coding'],
        defaultSort: 'score-desc',
      },
      entries: [{
        ...currentEntry,
        metric,
        metrics: [{ ...metric }],
        primaryPrice: null,
        blendedCostPerMillion: null,
        contextWindowTokens: null,
        onValueFrontier: false,
        ...entryOverrides,
      }],
    },
  };
}

function categoryEvidenceEnvelope(
  key: 'llm-reasoning' | 'llm-knowledge',
  metricKey: 'benchlm:category:reasoning' | 'benchlm:category:knowledge',
  entryOverrides: Record<string, unknown> = {},
) {
  const value = codingEnvelope();
  const currentEntry = value.data.entries[0];
  const category = metricKey === 'benchlm:category:reasoning' ? 'reasoning' : 'knowledge';
  const metric = {
    ...currentEntry.metric,
    metricKey,
    category,
  };
  return {
    ...value,
    attribution: [BENCHLM_ATTRIBUTION],
    data: {
      key,
      profile: 'balanced',
      definition: {
        kind: 'benchlm',
        sourceId: 'benchlm',
        metricKeys: [metricKey],
        defaultSort: 'score-desc',
      },
      entries: [{
        ...currentEntry,
        metric,
        metrics: [{ ...metric }],
        primaryPrice: null,
        blendedCostPerMillion: null,
        contextWindowTokens: null,
        onValueFrontier: false,
        ...entryOverrides,
      }],
    },
  };
}

function overallEnvelope(entryOverrides: Record<string, unknown> = {}) {
  const value = leaderboardEnvelope();
  const currentEntry = value.data.entries[0];
  return {
    ...value,
    attribution: [BENCHLM_ATTRIBUTION],
    data: {
      key: 'llm-overall',
      profile: 'balanced',
      definition: {
        kind: 'benchlm',
        sourceId: 'benchlm',
        metricKeys: ['benchlm:overall:raw'],
        defaultSort: 'score-desc',
      },
      entries: [{
        ...currentEntry,
        primaryPrice: null,
        blendedCostPerMillion: null,
        contextWindowTokens: null,
        onValueFrontier: false,
        ...entryOverrides,
      }],
    },
  };
}

function multimodalEnvelope(
  overrides: Record<string, unknown> = {},
  entryOverrides: Record<string, unknown> = {},
) {
  const value = codingEnvelope();
  const currentEntry = value.data.entries[0];
  const metric = {
    ...currentEntry.metric,
    metricKey: 'benchlm:category:multimodal',
    category: 'multimodal',
  };
  return {
    ...value,
    attribution: [BENCHLM_ATTRIBUTION],
    data: {
      key: 'multimodal-vision-documents',
      profile: 'balanced',
      definition: {
        kind: 'multimodal',
        metricKeys: [
          'benchlm:category:multimodal',
          'lmarena:vision_style_control:overall',
          'lmarena:document_style_control:overall',
        ],
        defaultSort: 'score-desc',
      },
      entries: [{
        ...currentEntry,
        metric,
        metrics: [{ ...metric }],
        ...entryOverrides,
      }],
    },
    ...overrides,
  };
}

function lmArenaEnvelope({
  metricOverrides = {},
  modelOverrides = {},
  entryOverrides = {},
}: {
  readonly metricOverrides?: Record<string, unknown>;
  readonly modelOverrides?: Record<string, unknown>;
  readonly entryOverrides?: Record<string, unknown>;
} = {}) {
  const value = codingEnvelope();
  const currentEntry = value.data.entries[0];
  const metric = {
    ...currentEntry.metric,
    metricKey: 'lmarena:text_style_control:overall',
    category: 'overall',
    unit: 'arena_score',
    sourceId: 'lmarena',
    sourceArtifactId: 'lmarena-text-style',
    methodology: 'bradley_terry',
    rank: 1,
    ...metricOverrides,
  };
  return {
    ...value,
    attribution: [LMARENA_ATTRIBUTION],
    data: {
      key: 'llm-human-preference',
      profile: 'balanced',
      definition: {
        kind: 'lmarena',
        sourceId: 'lmarena',
        metricKeys: ['lmarena:text_style_control:overall'],
        defaultSort: 'rank-asc',
      },
      entries: [{
        ...currentEntry,
        model: {
          ...currentEntry.model,
          sourceId: 'lmarena',
          sourceArtifactId: 'lmarena-text-style',
          evidenceStatus: 'source_only',
          ...modelOverrides,
        },
        metric,
        metrics: [{ ...metric }],
        sourceRank: 1,
        ...entryOverrides,
      }],
    },
  };
}

function pricingEnvelope(entryOverrides: Record<string, unknown> = {}) {
  const value = leaderboardEnvelope();
  const currentEntry = value.data.entries[0];
  return {
    ...value,
    attribution: [OPENROUTER_ATTRIBUTION],
    data: {
      key: 'llm-pricing-context',
      profile: 'balanced',
      definition: {
        kind: 'pricing-context',
        sourceId: 'openrouter',
        metricKeys: [],
        defaultSort: 'price-asc',
        userSortable: true,
      },
      entries: [{
        ...currentEntry,
        metric: null,
        metrics: [],
        sourceRank: null,
        onValueFrontier: false,
        ...entryOverrides,
      }],
    },
  };
}

function valueEnvelopeWithEntryOverrides(entryOverrides: Record<string, unknown>) {
  const value = leaderboardEnvelope();
  return leaderboardEnvelope({
    data: {
      ...value.data,
      entries: [{ ...value.data.entries[0], ...entryOverrides }],
    },
  });
}

function valueEnvelopeForProfile(
  profile: 'inputHeavy' | 'balanced' | 'outputHeavy',
  blendedCostPerMillion: number,
) {
  const value = leaderboardEnvelope();
  return leaderboardEnvelope({
    data: {
      ...value.data,
      profile,
      entries: [{ ...value.data.entries[0], blendedCostPerMillion }],
    },
  });
}

function pricingEnvelopeForProfile(
  profile: 'inputHeavy' | 'balanced' | 'outputHeavy',
  blendedCostPerMillion: number,
) {
  const value = pricingEnvelope();
  return {
    ...value,
    data: {
      ...value.data,
      profile,
      entries: [{ ...value.data.entries[0], blendedCostPerMillion }],
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function decisionPick(overrides: Record<string, unknown> = {}) {
  return {
    rank: 1,
    modelKey: 'model-a',
    slug: 'model-a',
    name: 'Model A',
    provider: 'Provider A',
    score: 82.4,
    unit: 'score',
    evidenceStatus: 'supported',
    updatedAt: ISO_TIME,
    routePath: '/leaderboards/llm/overall/',
    representativePriceUsdPerMillion: 3,
    contextWindowTokens: 128_000,
    ...overrides,
  };
}

function decisionSummaryEnvelope(overrides: Record<string, unknown> = {}) {
  const overall = decisionPick();
  return {
    revision: 'benchmark-revision-1',
    publishedAt: ISO_TIME,
    freshness: { status: 'fresh', checkedAt: ISO_TIME },
    attribution: [BENCHLM_ATTRIBUTION, OPENROUTER_ATTRIBUTION],
    data: {
      decisionPicks: [
        { key: 'llm-overall', label: 'BenchAlign leaders', status: 'benchalign', entries: [overall] },
        { key: 'llm-agentic', label: 'Agentic BenchAlign leaders', status: 'benchalign', entries: [] },
        { key: 'llm-coding', label: 'Coding BenchAlign leaders', status: 'benchalign', entries: [] },
        { key: 'llm-reasoning', label: 'Reasoning evidence lens', status: 'evidence-lens', entries: [] },
        { key: 'multimodal-vision-documents', label: 'Vision and documents evidence lens', status: 'evidence-lens', entries: [] },
        { key: 'llm-knowledge', label: 'Knowledge evidence lens', status: 'evidence-lens', entries: [] },
      ],
      homeDecisionSnapshot: {
        benchAlignLeader: { status: 'ready', value: overall, updatedAt: ISO_TIME },
        valueFrontierLeader: {
          status: 'ready',
          value: decisionPick({ routePath: '/leaderboards/llm/value/' }),
          updatedAt: ISO_TIME,
        },
        lowestVerifiedRepresentativeRate: {
          status: 'ready',
          value: {
            modelKey: 'model-a',
            slug: 'model-a',
            name: 'Model A',
            provider: 'Provider A',
            evidenceStatus: 'supported',
            representativePriceUsdPerMillion: 3,
            contextWindowTokens: 128_000,
            routePath: '/leaderboards/llm/pricing-context/',
          },
          updatedAt: ISO_TIME,
        },
        pricePerformancePoints: [{
          modelKey: 'model-a',
          slug: 'model-a',
          name: 'Model A',
          provider: 'Provider A',
          evidenceStatus: 'supported',
          representativePriceUsdPerMillion: 3,
          contextWindowTokens: 128_000,
          routePath: '/leaderboards/llm/overall/',
          score: 82.4,
          unit: 'score',
          updatedAt: ISO_TIME,
        }],
      },
    },
    ...overrides,
  };
}

describe('useBenchmarkLeaderboard', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('encodes only the cached leaderboard route, profile, limit, cursor, and reviewed estimated flag', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(valueEnvelopeForProfile('inputHeavy', 1.4)));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-value', 'inputHeavy', 3, 'page/2', true));

    await waitFor(() => expect(result.current.phase).toBe('ready'));

    expect(leaderboardEndpoint('llm-value', 'inputHeavy', 3, 'page/2', true))
      .toBe('/api/benchmarks/leaderboards/llm-value?profile=inputHeavy&limit=3&cursor=page%2F2&includeEstimated=1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/benchmarks/leaderboards/llm-value?profile=inputHeavy&limit=3&cursor=page%2F2&includeEstimated=1');
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/^\/api\/benchmarks\//);
  });

  it('does not request estimates from pure LMArena or pricing routes', () => {
    expect(leaderboardEndpoint('llm-human-preference', 'balanced', 50, undefined, true))
      .toBe('/api/benchmarks/leaderboards/llm-human-preference?profile=balanced&limit=50');
    expect(leaderboardEndpoint('llm-pricing-context', 'balanced', 50, undefined, true))
      .toBe('/api/benchmarks/leaderboards/llm-pricing-context?profile=balanced&limit=50');
  });

  it.each([
    ['llm-reasoning', 'benchlm:category:reasoning'],
    ['llm-knowledge', 'benchlm:category:knowledge'],
  ] as const)('accepts the published %s category evidence lens', async (key, metricKey) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(categoryEvidenceEnvelope(key, metricKey))));

    const { result } = renderHook(() => useBenchmarkLeaderboard(key));

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.envelope?.data.definition.metricKeys).toEqual([metricKey]);
    expect(result.current.envelope?.data.entries[0]?.metric?.metricKey).toBe(metricKey);
  });

  it('keeps an explicitly empty published Knowledge lens available to the frontend', async () => {
    const payload = categoryEvidenceEnvelope('llm-knowledge', 'benchlm:category:knowledge');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      ...payload,
      data: { ...payload.data, entries: [] },
    })));

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-knowledge'));

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.envelope?.data.entries).toEqual([]);
  });

  it.each([
    ['llm-reasoning', 'benchlm:category:reasoning', 'benchlm:category:knowledge'],
    ['llm-knowledge', 'benchlm:category:knowledge', 'benchlm:category:reasoning'],
  ] as const)('rejects a %s response that substitutes another category metric', async (key, metricKey, wrongMetricKey) => {
    const payload = categoryEvidenceEnvelope(key, metricKey);
    const currentEntry = payload.data.entries[0];
    const wrongMetric = {
      ...currentEntry.metric,
      metricKey: wrongMetricKey,
      category: wrongMetricKey.endsWith('reasoning') ? 'reasoning' : 'knowledge',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      ...payload,
      data: {
        ...payload.data,
        entries: [{ ...currentEntry, metric: wrongMetric, metrics: [{ ...wrongMetric }] }],
      },
    })));

    const { result } = renderHook(() => useBenchmarkLeaderboard(key));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.envelope).toBeNull();
  });

  it('preserves published primary pricing and nullable source rank', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(leaderboardEnvelope())));

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-value'));

    await waitFor(() => expect(result.current.phase).toBe('ready'));

    const entry = result.current.envelope?.data.entries[0];
    expect(entry?.primaryPrice?.modelKey).toBe('model-a');
    expect(entry?.blendedCostPerMillion).toBe(2);
    expect(entry?.metric?.rank).toBeNull();
  });

  it.each([
    ['value input price is missing', 'llm-value', 'balanced', valueEnvelopeWithEntryOverrides({
      primaryPrice: primaryOpenRouterPrice({ inputUsdPerMillion: null }),
    })],
    ['value output price is missing', 'llm-value', 'balanced', valueEnvelopeWithEntryOverrides({
      primaryPrice: primaryOpenRouterPrice({ outputUsdPerMillion: null }),
    })],
    ['value blended cost disagrees with its price', 'llm-value', 'balanced', valueEnvelopeWithEntryOverrides({
      blendedCostPerMillion: 2.01,
    })],
    ['value blended cost uses the wrong workload profile', 'llm-value', 'inputHeavy', valueEnvelopeForProfile('inputHeavy', 2)],
    ['value context disagrees with its selected price', 'llm-value', 'balanced', valueEnvelopeWithEntryOverrides({
      contextWindowTokens: 64_000,
    })],
    ['value context survives a null selected-price context', 'llm-value', 'balanced', valueEnvelopeWithEntryOverrides({
      primaryPrice: primaryOpenRouterPrice({ contextWindowTokens: null }),
      contextWindowTokens: 64_000,
    })],
    ['pricing input price is missing', 'llm-pricing-context', 'balanced', pricingEnvelope({
      primaryPrice: primaryOpenRouterPrice({ inputUsdPerMillion: null }),
    })],
    ['pricing blended cost disagrees with its price', 'llm-pricing-context', 'balanced', pricingEnvelope({
      blendedCostPerMillion: 2.01,
    })],
    ['pricing blended cost uses the wrong workload profile', 'llm-pricing-context', 'outputHeavy', pricingEnvelopeForProfile('outputHeavy', 2)],
    ['pricing context disagrees with its selected price', 'llm-pricing-context', 'balanced', pricingEnvelope({
      contextWindowTokens: 64_000,
    })],
  ] as const)('rejects derived evidence when %s', async (_label, key, profile, payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)));

    const { result } = renderHook(() => useBenchmarkLeaderboard(key, profile));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.envelope).toBeNull();
  });

  it('keeps a stale revision out of the ready state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(leaderboardEnvelope({
      freshness: { status: 'stale', checkedAt: '2026-08-01T00:00:00.000Z', message: 'Refresh overdue.' },
    }))));

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-value'));

    await waitFor(() => expect(result.current.phase).toBe('stale'));
    expect(result.current.envelope?.freshness.status).toBe('stale');
  });

  it('reports an unavailable state when no published revision can be served', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'No published benchmark revision.' }, 503)));

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-value'));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.envelope).toBeNull();
  });

  it('exposes an HTTP failure and retries the cached API request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Database unavailable.' }, 500))
      .mockResolvedValueOnce(jsonResponse(leaderboardEnvelope()));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-value'));

    await waitFor(() => expect(result.current.phase).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ignores an aborted stale response after the route changes', async () => {
    let resolveFirst: ((response: Response) => void) | undefined;
    const firstResponse = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const fetchMock = vi.fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(jsonResponse(codingEnvelope()));
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(({ key }) => useBenchmarkLeaderboard(key), {
      initialProps: { key: 'llm-value' as LeaderboardKey },
    });
    rerender({ key: 'llm-coding' });
    resolveFirst?.(jsonResponse(leaderboardEnvelope()));

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.envelope?.data.key).toBe('llm-coding');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.signal?.aborted).toBe(true);
  });

  it('treats a malformed cached response as unavailable instead of an empty leaderboard', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ revision: 'bad', data: { entries: [] } })));

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-value'));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.envelope).toBeNull();
  });

  it.each([
    ['omitted from the metrics collection', (() => {
      const payload = leaderboardEnvelope();
      return leaderboardEnvelope({
        data: {
          ...payload.data,
          entries: [{ ...payload.data.entries[0], metrics: [] }],
        },
      });
    })()],
    ['replaced by a conflicting value', (() => {
      const payload = leaderboardEnvelope();
      const entry = payload.data.entries[0];
      return leaderboardEnvelope({
        data: {
          ...payload.data,
          entries: [{ ...entry, metrics: [{ ...entry.metric, value: 12.5 }] }],
        },
      });
    })()],
    ['duplicated with a conflicting value', (() => {
      const payload = leaderboardEnvelope();
      const entry = payload.data.entries[0];
      return leaderboardEnvelope({
        data: {
          ...payload.data,
          entries: [{
            ...entry,
            metrics: [{ ...entry.metric }, { ...entry.metric, value: 12.5 }],
          }],
        },
      });
    })()],
  ])('rejects a primary metric that is %s', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)));

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-value'));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.envelope).toBeNull();
  });

  it.each([
    ['has no primary price', valueEnvelopeWithEntryOverrides({ primaryPrice: null })],
    ['has a price for a different model', valueEnvelopeWithEntryOverrides({
      primaryPrice: primaryOpenRouterPrice({ modelKey: 'model-b' }),
    })],
    ['uses a non-OpenRouter price source', valueEnvelopeWithEntryOverrides({
      primaryPrice: primaryOpenRouterPrice({ sourceId: 'litellm' }),
    })],
    ['uses a non-primary price check', valueEnvelopeWithEntryOverrides({
      primaryPrice: primaryOpenRouterPrice({ verificationStatus: 'corroborating' }),
    })],
    ['has no blended cost', valueEnvelopeWithEntryOverrides({ blendedCostPerMillion: null })],
    ['has a negative blended cost', valueEnvelopeWithEntryOverrides({ blendedCostPerMillion: -0.01 })],
    ['carries a source rank', valueEnvelopeWithEntryOverrides({ sourceRank: 1 })],
  ])('rejects a supported value row that %s', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)));

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-value'));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.envelope).toBeNull();
  });

  it('accepts an off-frontier supported value row from a paginated response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(valueEnvelopeWithEntryOverrides({
      onValueFrontier: false,
    }))));

    const { result } = renderHook(() => useBenchmarkLeaderboard(
      'llm-value',
      'balanced',
      1,
      'page-2',
    ));

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.envelope?.data.entries[0]?.onValueFrontier).toBe(false);
  });

  it.each([
    ['has no primary price', pricingEnvelope({ primaryPrice: null })],
    ['has a price for a different model', pricingEnvelope({
      primaryPrice: primaryOpenRouterPrice({ modelKey: 'model-b' }),
    })],
    ['uses a non-OpenRouter price source', pricingEnvelope({
      primaryPrice: primaryOpenRouterPrice({ sourceId: 'litellm' }),
    })],
    ['uses a non-primary price check', pricingEnvelope({
      primaryPrice: primaryOpenRouterPrice({ verificationStatus: 'corroborating' }),
    })],
    ['has no blended cost', pricingEnvelope({ blendedCostPerMillion: null })],
    ['has a negative blended cost', pricingEnvelope({ blendedCostPerMillion: -0.01 })],
    ['carries a source rank', pricingEnvelope({ sourceRank: 1 })],
    ['claims value-frontier membership', pricingEnvelope({ onValueFrontier: true })],
    ['contains an estimated model', pricingEnvelope({
      model: { ...supportedValueEntry().model, evidenceStatus: 'estimated' },
    })],
  ])('rejects a pricing-context row that %s', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)));

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-pricing-context'));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.envelope).toBeNull();
  });

  it.each([
    ['claims value-frontier membership', codingEnvelope({ onValueFrontier: true })],
    ['carries hosted pricing', codingEnvelope({
      primaryPrice: primaryOpenRouterPrice(),
      blendedCostPerMillion: 2,
    })],
    ['carries a source rank', codingEnvelope({ sourceRank: 1 })],
  ])('rejects a BenchLM capability row that %s', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)));

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-coding'));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.envelope).toBeNull();
  });

  it.each([
    ['an overall model is not ranking-eligible', 'llm-overall', overallEnvelope({
      model: { ...supportedValueEntry().model, rankingEligible: false },
    })],
    ['a value model is not ranking-eligible', 'llm-value', valueEnvelopeWithEntryOverrides({
      model: { ...supportedValueEntry().model, rankingEligible: false },
    })],
    ['an overall model uses a non-boolean eligibility marker', 'llm-overall', overallEnvelope({
      model: { ...supportedValueEntry().model, rankingEligible: 'true' },
    })],
    ['a value metric is not ranking-eligible', 'llm-value', (() => {
      const payload = leaderboardEnvelope();
      const entry = payload.data.entries[0];
      const metric = { ...entry.metric, rankingEligible: false };
      return leaderboardEnvelope({
        data: { ...payload.data, entries: [{ ...entry, metric, metrics: [{ ...metric }] }] },
      });
    })()],
    ['a category metric is not ranking-eligible', 'llm-coding', (() => {
      const payload = codingEnvelope();
      const metric = { ...payload.data.entries[0].metric, rankingEligible: false };
      return codingEnvelope({ metric, metrics: [{ ...metric }] });
    })()],
    ['a category model uses a non-boolean eligibility marker', 'llm-coding', codingEnvelope({
      model: { ...supportedValueEntry().model, rankingEligible: 'false' },
    })],
    ['a multimodal category metric is not ranking-eligible', 'multimodal-vision-documents', (() => {
      const payload = multimodalEnvelope();
      const metric = { ...payload.data.entries[0].metric, rankingEligible: false };
      return multimodalEnvelope({}, { metric, metrics: [{ ...metric }] });
    })()],
    ['a LMArena metric has no positive source rank', 'llm-human-preference', lmArenaEnvelope({
      metricOverrides: { rank: null },
      entryOverrides: { sourceRank: null },
    })],
    ['a LMArena metric is not ranking-eligible', 'llm-human-preference', lmArenaEnvelope({
      metricOverrides: { rankingEligible: false },
    })],
    ['a LMArena metric uses a non-boolean eligibility marker', 'llm-human-preference', lmArenaEnvelope({
      metricOverrides: { rankingEligible: 'true' },
    })],
    ['a LMArena source rank disagrees with its primary metric', 'llm-human-preference', lmArenaEnvelope({
      entryOverrides: { sourceRank: 2 },
    })],
    ['a BenchLM-primary multimodal row carries a source rank', 'multimodal-vision-documents', multimodalEnvelope({}, {
      sourceRank: 1,
    })],
    ['a pricing row uses a LMArena source-only model', 'llm-pricing-context', pricingEnvelope({
      model: {
        ...supportedValueEntry().model,
        sourceId: 'lmarena',
        evidenceStatus: 'source_only',
        sourceArtifactId: 'lmarena-text-style',
      },
    })],
    ['a pricing row uses a non-boolean eligibility marker', 'llm-pricing-context', pricingEnvelope({
      model: { ...supportedValueEntry().model, rankingEligible: 'false' },
    })],
  ] as const)('rejects route ranking evidence when %s', async (_label, key, payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)));

    const { result } = renderHook(() => useBenchmarkLeaderboard(key));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.envelope).toBeNull();
  });

  it.each([
    ['a BenchLM category model lacks overall eligibility', 'llm-coding', codingEnvelope({
      model: { ...supportedValueEntry().model, rankingEligible: false },
    })],
    ['a multimodal BenchLM category model lacks overall eligibility', 'multimodal-vision-documents', multimodalEnvelope({}, {
      model: { ...supportedValueEntry().model, rankingEligible: false },
    })],
    ['a supported canonical model carries exact LMArena evidence', 'llm-human-preference', lmArenaEnvelope({
      modelOverrides: {
        sourceId: 'benchlm',
        sourceArtifactId: 'benchlm-models',
        evidenceStatus: 'supported',
      },
    })],
  ] as const)('preserves valid route evidence when %s', async (_label, key, payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)));

    const { result } = renderHook(() => useBenchmarkLeaderboard(key));

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.envelope?.data.key).toBe(key);
  });

  it('preserves the reviewed null-price value exception for appended estimates', async () => {
    const payload = leaderboardEnvelope();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(leaderboardEnvelope({
      data: {
        ...payload.data,
        entries: [payload.data.entries[0], estimatedValueEntry()],
      },
    }))));

    const { result } = renderHook(() => useBenchmarkLeaderboard(
      'llm-value',
      'balanced',
      50,
      undefined,
      true,
    ));

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.envelope?.data.entries[1]).toMatchObject({
      primaryPrice: null,
      blendedCostPerMillion: null,
      sourceRank: null,
      onValueFrontier: false,
    });
  });

  it.each([
    ['model ranking eligibility', (() => {
      const estimate = estimatedValueEntry();
      return {
        ...estimate,
        model: { ...estimate.model, rankingEligible: true },
      };
    })()],
    ['metric ranking eligibility', (() => {
      const estimate = estimatedValueEntry();
      const metric = { ...estimate.metric, rankingEligible: true };
      return { ...estimate, metric, metrics: [{ ...metric }] };
    })()],
    ['a metric source rank', (() => {
      const estimate = estimatedValueEntry();
      const metric = { ...estimate.metric, rank: 1 };
      return { ...estimate, metric, metrics: [{ ...metric }] };
    })()],
  ])('rejects an opted-in estimated row that hides %s', async (_label, estimate) => {
    const payload = leaderboardEnvelope();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(leaderboardEnvelope({
      data: {
        ...payload.data,
        entries: [payload.data.entries[0], estimate],
      },
    }))));

    const { result } = renderHook(() => useBenchmarkLeaderboard(
      'llm-value',
      'balanced',
      50,
      undefined,
      true,
    ));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.envelope).toBeNull();
  });

  it.each([
    ['an invalid publication timestamp', leaderboardEnvelope({ publishedAt: 'not-a-date' })],
    ['an invalid freshness timestamp', leaderboardEnvelope({ freshness: { status: 'fresh', checkedAt: '2026-08-05' } })],
    ['an invalid attribution timestamp', leaderboardEnvelope({ attribution: [{ ...leaderboardEnvelope().attribution[0], updatedAt: 'not-a-date' }] })],
    ['an invalid metric timestamp', leaderboardEnvelope({
      data: {
        ...leaderboardEnvelope().data,
        entries: [{
          ...leaderboardEnvelope().data.entries[0],
          metric: { ...leaderboardEnvelope().data.entries[0].metric, sourceUpdatedAt: 'not-a-date' },
        }],
      },
    })],
    ['an empty attribution list', leaderboardEnvelope({ attribution: [] })],
    ['an attribution from an unrelated source', leaderboardEnvelope({ attribution: [{
      sourceId: 'lmarena',
      label: 'Arena ratings from LMArena',
      url: 'https://lmarena.ai/leaderboard',
      updatedAt: ISO_TIME,
    }] })],
  ])('treats %s as unavailable evidence', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)));

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-value'));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.envelope).toBeNull();
  });

  it.each([
    ['a LMArena human-preference row', (() => {
      const payload = codingEnvelope();
      const currentEntry = payload.data.entries[0];
      const arenaMetric = {
        ...currentEntry.metric,
        modelKey: 'source:lmarena:arena-model',
        metricKey: 'lmarena:text_style_control:overall',
        category: 'overall',
        sourceId: 'lmarena',
        sourceModelId: 'arena-model',
        sourceArtifactId: 'lmarena-text-style',
        methodology: 'bradley_terry',
        unit: 'arena_score',
        rank: 1,
      };
      return {
        ...payload,
        data: {
          ...payload.data,
          entries: [{
            ...currentEntry,
            model: {
              ...currentEntry.model,
              modelKey: 'source:lmarena:arena-model',
              slug: 'arena-model',
              sourceId: 'lmarena',
              sourceModelId: 'arena-model',
              sourceArtifactId: 'lmarena-text-style',
              evidenceStatus: 'source_only',
            },
            metric: arenaMetric,
            metrics: [arenaMetric],
            sourceRank: 1,
          }],
        },
      };
    })()],
    ['a matched key with LMArena source and methodology', (() => {
      const payload = codingEnvelope();
      const currentEntry = payload.data.entries[0];
      return codingEnvelope({
        metric: {
          ...currentEntry.metric,
          sourceId: 'lmarena',
          methodology: 'bradley_terry',
          unit: 'arena_score',
          rank: 1,
        },
      });
    })()],
    ['a BenchLM metric carried by an LMArena-only model', (() => {
      const payload = codingEnvelope();
      const currentEntry = payload.data.entries[0];
      return codingEnvelope({
        model: {
          ...currentEntry.model,
          sourceId: 'lmarena',
          sourceArtifactId: 'lmarena-text-style',
          evidenceStatus: 'source_only',
        },
      });
    })()],
    ['a secondary metric from a different source lens', (() => {
      const payload = codingEnvelope();
      const currentEntry = payload.data.entries[0];
      return codingEnvelope({
        metrics: [{
          ...currentEntry.metric,
          metricKey: 'lmarena:text_style_control:overall',
          category: 'overall',
          sourceId: 'lmarena',
          sourceModelId: 'arena-model',
          sourceArtifactId: 'lmarena-text-style',
          methodology: 'bradley_terry',
          unit: 'arena_score',
          rank: 1,
        }],
      });
    })()],
  ])('rejects %s even when the requested coding definition matches', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)));

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-coding'));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.envelope).toBeNull();
  });

  it('requires multimodal attribution to cover the lens carried by the response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(multimodalEnvelope({ attribution: [{
      sourceId: 'openrouter',
      label: 'Catalog and pricing data from OpenRouter',
      url: 'https://openrouter.ai/models',
      updatedAt: ISO_TIME,
    }] }))));

    const { result } = renderHook(() => useBenchmarkLeaderboard('multimodal-vision-documents'));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.envelope).toBeNull();
  });

  it('requires OpenRouter attribution when a value row displays primary hosted pricing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(leaderboardEnvelope({
      attribution: [BENCHLM_ATTRIBUTION],
    }))));

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-value'));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.envelope).toBeNull();
  });

  it.each([
    ['a definition mismatched to the requested route', leaderboardEnvelope({
      data: {
        ...leaderboardEnvelope().data,
        definition: {
          kind: 'lmarena',
          sourceId: 'lmarena',
          metricKeys: ['lmarena:text_style_control:overall'],
          defaultSort: 'rank-asc',
        },
      },
    })],
    ['a non-HTTPS attribution link', leaderboardEnvelope({ attribution: [{ ...leaderboardEnvelope().attribution[0], url: 'http://benchlm.ai/data' }] })],
    ['an unknown model evidence status', leaderboardEnvelope({
      data: {
        ...leaderboardEnvelope().data,
        entries: [{
          ...leaderboardEnvelope().data.entries[0],
          model: { ...leaderboardEnvelope().data.entries[0].model, evidenceStatus: 'unreviewed' },
        }],
      },
    })],
    ['negative published route money', leaderboardEnvelope({
      data: {
        ...leaderboardEnvelope().data,
        entries: [{
          ...leaderboardEnvelope().data.entries[0],
          primaryPrice: {
            modelKey: 'model-a',
            sourceId: 'openrouter',
            providerId: 'openrouter',
            inputUsdPerMillion: -1,
            cachedInputUsdPerMillion: null,
            outputUsdPerMillion: 1,
            contextWindowTokens: 128_000,
            verificationStatus: 'primary',
            routeId: 'openrouter:model-a',
          },
        }],
      },
    })],
  ])('rejects %s without rendering an invented result', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)));

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-value'));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.envelope).toBeNull();
  });
});

describe('decision summary hooks', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads supported picks from one bounded summary request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(decisionSummaryEnvelope()));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDecisionPicks());

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(benchmarkSummaryEndpoint()).toBe('/api/benchmarks');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/benchmarks');
    expect(result.current.decisionPicks?.[0]).toMatchObject({
      key: 'llm-overall',
      entries: [{ evidenceStatus: 'supported', routePath: '/leaderboards/llm/overall/' }],
    });
  });

  it('keeps a stale Home decision snapshot available without inventing a fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(decisionSummaryEnvelope({
      freshness: { status: 'stale', checkedAt: ISO_TIME, message: 'Refresh overdue.' },
    }))));

    const { result } = renderHook(() => useHomeDecisionSnapshot());

    await waitFor(() => expect(result.current.phase).toBe('stale'));
    expect(result.current.homeDecisionSnapshot?.benchAlignLeader).toMatchObject({
      status: 'ready',
      value: { modelKey: 'model-a', evidenceStatus: 'supported' },
    });
    expect(result.current.homeDecisionSnapshot?.pricePerformancePoints).toHaveLength(1);
    expect(result.current.error).toBe('Refresh overdue.');
  });

  it('shares one in-flight summary request between the picks and Home hooks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(decisionSummaryEnvelope()));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => ({
      picks: useDecisionPicks(),
      home: useHomeDecisionSnapshot(),
    }));

    await waitFor(() => expect(result.current.picks.phase).toBe('ready'));
    expect(result.current.home.phase).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a summary that lets an estimated model occupy a decision slot', async () => {
    const payload = decisionSummaryEnvelope();
    const estimated = decisionPick({ evidenceStatus: 'estimated' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      ...payload,
      data: {
        ...payload.data,
        decisionPicks: [{ ...payload.data.decisionPicks[0], entries: [estimated] }, ...payload.data.decisionPicks.slice(1)],
      },
    })));

    const { result } = renderHook(() => useDecisionPicks());

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
    expect(result.current.decisionPicks).toBeNull();
  });
});
