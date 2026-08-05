import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeaderboardKey } from '../routing/routes';
import { leaderboardEndpoint, useBenchmarkLeaderboard } from './use-benchmarks';

const ISO_TIME = '2026-08-05T12:00:00.000Z';

function leaderboardEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    revision: 'benchmark-revision-1',
    publishedAt: ISO_TIME,
    freshness: { status: 'fresh', checkedAt: ISO_TIME },
    attribution: [{
      sourceId: 'benchlm',
      label: 'Data from BenchLM.ai',
      url: 'https://benchlm.ai/data',
      updatedAt: ISO_TIME,
    }],
    data: {
      key: 'llm-value',
      profile: 'balanced',
      definition: {
        kind: 'value',
        sourceId: 'benchlm',
        metricKeys: ['benchlm:overall:raw'],
        defaultSort: 'pareto-score-desc',
      },
      entries: [{
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
        metric: {
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
        },
        metrics: [],
        primaryPrice: null,
        blendedCostPerMillion: null,
        contextWindowTokens: null,
        sourceRank: null,
        onValueFrontier: true,
      }],
    },
    ...overrides,
  };
}

function codingEnvelope(entryOverrides: Record<string, unknown> = {}) {
  const value = leaderboardEnvelope();
  const currentEntry = value.data.entries[0];
  return {
    ...value,
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
        metric: { ...currentEntry.metric, metricKey: 'benchlm:category:coding', category: 'coding' },
        ...entryOverrides,
      }],
    },
  };
}

function multimodalEnvelope(overrides: Record<string, unknown> = {}) {
  const value = codingEnvelope();
  const currentEntry = value.data.entries[0];
  return {
    ...value,
    attribution: [{
      sourceId: 'benchlm',
      label: 'Data from BenchLM.ai',
      url: 'https://benchlm.ai/data',
      updatedAt: ISO_TIME,
    }],
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
        metric: { ...currentEntry.metric, metricKey: 'benchlm:category:multimodal', category: 'multimodal' },
      }],
    },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('useBenchmarkLeaderboard', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('encodes only the cached leaderboard route, profile, limit, cursor, and reviewed estimated flag', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(leaderboardEnvelope({
      data: { ...leaderboardEnvelope().data, profile: 'inputHeavy' },
    })));
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

  it('preserves null benchmark values from a published cached envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(leaderboardEnvelope())));

    const { result } = renderHook(() => useBenchmarkLeaderboard('llm-value'));

    await waitFor(() => expect(result.current.phase).toBe('ready'));

    const entry = result.current.envelope?.data.entries[0];
    expect(entry?.contextWindowTokens).toBeNull();
    expect(entry?.blendedCostPerMillion).toBeNull();
    expect(entry?.metric?.rank).toBeNull();
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
