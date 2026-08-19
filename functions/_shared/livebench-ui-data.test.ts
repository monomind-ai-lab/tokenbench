import { describe, expect, it } from 'vitest';
import type { LiveBenchReleaseBundle } from '../../src/livebench/contracts';
import type { SourceAttribution } from '../../src/pipeline/ui-data-contract-v1-core';
import type { LeaderboardRankingsRequest } from '../../src/pipeline/ui-data-contract-v1-rankings';
import {
  buildLiveBenchCustomRankingsData,
  buildLiveBenchLeaderboardData,
  buildLiveBenchComparisonData,
  buildLiveBenchModelsData,
  buildLiveBenchProfileData,
  buildLiveBenchRankingDimensionSet,
  buildLiveBenchRankingsEnvelope,
} from './livebench-ui-data';

const source: SourceAttribution = {
  sourceRef: 'livebench:2026-06-25',
  fieldGroup: '/data',
  sourceId: 'livebench',
  sourceRevision: '2026-06-25@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  label: 'LiveBench 2026-06-25',
  url: 'https://github.com/LiveBench/new-livebench',
  licenseId: 'CDLA-Permissive-2.0',
  observedAt: '2026-08-19T09:00:00.000Z',
  effectiveAt: '2026-06-25T00:00:00.000Z',
};

const bundle: LiveBenchReleaseBundle = {
  schemaVersion: 1,
  releaseId: '2026-06-25',
  sourceCommit: 'a'.repeat(40),
  observedAt: source.observedAt,
  categories: [
    { categoryId: 'reasoning', label: 'Reasoning', taskIds: ['logic', 'zebra'] },
    { categoryId: 'coding', label: 'Coding', taskIds: ['typescript'] },
  ],
  tasks: [
    { taskId: 'logic', label: 'Logic', categoryId: 'reasoning' },
    { taskId: 'zebra', label: 'Zebra', categoryId: 'reasoning' },
    { taskId: 'typescript', label: 'TypeScript', categoryId: 'coding' },
  ],
  models: [
    {
      configurationId: 'alpha', sourceModelId: 'alpha', displayName: 'Alpha', organization: 'Example',
      openWeights: null, reasoner: true, isDerivativeFinetune: false,
      baseConfigurationId: null, lineageSourceUrl: null,
    },
    {
      configurationId: 'beta', sourceModelId: 'beta', displayName: 'Beta', organization: 'Open Org',
      openWeights: true, reasoner: false, isDerivativeFinetune: false,
      baseConfigurationId: null, lineageSourceUrl: 'https://example.com/beta',
    },
  ],
  taskScores: [
    { configurationId: 'alpha', taskId: 'logic', score: 100 },
    { configurationId: 'alpha', taskId: 'zebra', score: 0 },
    { configurationId: 'alpha', taskId: 'typescript', score: 60 },
    { configurationId: 'beta', taskId: 'logic', score: 70 },
    { configurationId: 'beta', taskId: 'zebra', score: 70 },
    { configurationId: 'beta', taskId: 'typescript', score: 70 },
  ],
  taskEconomics: [
    ...['logic', 'zebra', 'typescript'].map((taskId) => ({
      configurationId: 'alpha', taskId, questionCount: 10, evaluationCostUsd: 1,
      inputPriceUsdPerMillion: null, outputPriceUsdPerMillion: null,
      meanInputTokens: null, meanOutputTokens: null,
    })),
    ...['logic', 'zebra', 'typescript'].map((taskId) => ({
      configurationId: 'beta', taskId, questionCount: 10, evaluationCostUsd: 0.5,
      inputPriceUsdPerMillion: 1, outputPriceUsdPerMillion: 2,
      meanInputTokens: 100, meanOutputTokens: 50,
    })),
  ],
};

function request(overrides: Partial<LeaderboardRankingsRequest> = {}): LeaderboardRankingsRequest {
  return {
    operation: 'leaderboard',
    releaseId: null,
    filters: { organizationIds: [], openWeights: 'all', excludeDerivativeFinetunes: false },
    limit: 1,
    cursor: null,
    ...overrides,
  };
}

describe('LiveBench ui-data-contract/v1 projection', () => {
  it('uses category-balanced overall scores and retains unavailable evidence as null', () => {
    const data = buildLiveBenchLeaderboardData({ bundle, request: request(), source });

    expect(data.rows[0]?.model.identity.slug).toBe('beta');
    expect(data.rows[0]?.model.overall.score).toMatchObject({ availability: 'available', value: 70 });
    expect(data.total).toBe(2);
    expect(data.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(data.rows[0]?.meanOutputTokens).toMatchObject({ availability: 'available', value: 50 });
  });

  it('preserves the pinned upstream global-average overrides', () => {
    const overridden: LiveBenchReleaseBundle = {
      ...bundle,
      models: bundle.models.map((model) => model.configurationId === 'alpha'
        ? { ...model, sourceModelId: 'grok-3' }
        : model),
    };
    const data = buildLiveBenchLeaderboardData({
      bundle: overridden,
      request: request({ limit: 50 }),
      source,
    });

    expect(data.rows.find(({ model }) => model.identity.configurationId === 'alpha')?.model.overall.score)
      .toMatchObject({ availability: 'available', value: 58 });
  });

  it('applies the exact submitted capability matrix to the active dimension set', () => {
    const dimensionSet = buildLiveBenchRankingDimensionSet(bundle);
    const submittedWeights = { reasoning: 70, coding: 30 };
    const data = buildLiveBenchCustomRankingsData({
      bundle,
      source,
      request: {
        operation: 'custom',
        dimensionSetRevision: dimensionSet.revision,
        weights: submittedWeights,
        filters: {
          access: 'all', providerIds: [], excludeDerivativeFinetunes: false,
          requiredInputModalities: [], maxInputMicroDollarsPerMillion: null,
          maxOutputMicroDollarsPerMillion: null, minTpsP50: null, maxTtftP50Ms: null,
          minContextWindowTokens: null, minMaxOutputTokens: null,
        },
        includeIneligible: true,
        limit: 50,
      },
    });

    expect(dimensionSet.revision).toBe('livebench-2026-06-25-benchmark-dimensions-v1');
    expect(data.submittedWeights).toEqual(submittedWeights);
    expect(data.normalizedWeights).toEqual({ coding: 0.3, reasoning: 0.7 });
    expect(data.rows.map((row) => [row.model.identity.slug, row.rank])).toEqual([
      ['beta', 1],
      ['alpha', 2],
    ]);
  });

  it('binds pagination cursors to the exact release, filter matrix, and limit', () => {
    const first = buildLiveBenchLeaderboardData({ bundle, request: request(), source });
    const second = buildLiveBenchLeaderboardData({
      bundle,
      request: request({ cursor: first.nextCursor }),
      source,
    });

    expect(second.rows.map((row) => row.model.identity.slug)).toEqual(['alpha']);
    expect(second.nextCursor).toBeNull();
    expect(() => buildLiveBenchLeaderboardData({
      bundle,
      request: request({ cursor: first.nextCursor, limit: 2 }),
      source,
    })).toThrow(/cursor/i);
  });

  it('does not guess unknown open-weight status into filtered results', () => {
    const data = buildLiveBenchLeaderboardData({
      bundle,
      request: request({
        filters: { organizationIds: [], openWeights: 'only', excludeDerivativeFinetunes: false },
      }),
      source,
    });

    expect(data.rows.map((row) => row.model.identity.slug)).toEqual(['beta']);
    expect(data.total).toBe(1);
  });

  it('emits a validated partial envelope with one warning per unavailable evidence path', () => {
    const envelope = buildLiveBenchRankingsEnvelope({
      bundle,
      request: request({ limit: 50 }),
      source,
      fetchedAt: '2026-08-19T09:06:00.000Z',
      projectionRevision: 'livebench-ui-v1:2026-06-25',
      benchmarkRevision: 'livebench-2026-06-25',
      projectionMethodology: 'livebench-upstream-global-average-2026-06-25-v1',
      checkedAt: source.observedAt,
    });

    expect(envelope.status).toBe('partial');
    expect(envelope.warnings.length).toBeGreaterThan(0);
    expect(envelope.warnings.every(({ fieldGroup }) => fieldGroup.startsWith('/data/'))).toBe(true);
    expect(envelope.data?.rows.find(({ model }) => model.identity.slug === 'alpha')?.model.openWeights)
      .toMatchObject({ availability: 'unavailable', value: null });
  });

  it('builds searchable directory, profile, and ordered comparison data from the same release', () => {
    const models = buildLiveBenchModelsData({
      bundle,
      source,
      request: { search: 'open org', access: 'all', providerIds: [], limit: 50, cursor: null },
    });
    expect(models.models.map((model) => model.identity.slug)).toEqual(['beta']);

    const profile = buildLiveBenchProfileData({ bundle, source, request: { slug: 'alpha' } });
    expect(profile?.model.tasks).toHaveLength(3);
    expect(profile?.model.routes).toEqual([]);
    expect(profile?.model.replacement).toMatchObject({ availability: 'unavailable', value: null });

    const comparison = buildLiveBenchComparisonData({
      bundle,
      source,
      request: { modelSlugs: ['beta', 'alpha'] },
    });
    expect(comparison?.models.map((model) => model.summary.identity.slug)).toEqual(['beta', 'alpha']);
    expect(comparison?.requestedModelSlugs).toEqual(['beta', 'alpha']);
  });
});
