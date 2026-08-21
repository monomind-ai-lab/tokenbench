import { describe, expect, it } from 'vitest';
import type {
  BenchmarkMetric,
  BenchmarkModel,
  BenchmarkPriceCheck,
  BenchmarkRevision,
  BenchmarkSourceRecord,
} from './contracts';
import {
  buildModelProfileSnapshot,
  hashModelProfileSnapshotJson,
  hashModelProfileSnapshotJsonAsync,
  parseModelProfileSnapshotData,
  serializeModelProfileSnapshot,
  serializeModelProfileSnapshotAsync,
} from './model-profile';
import type { ModelProfileSourceSnapshot } from './model-profile';

const OBSERVED_AT = '2026-08-10T00:00:00.000Z';
const PUBLISHED_AT = '2026-08-10T00:05:00.000Z';
const REVISION = 'benchmark-2026-08-10';

function source(
  sourceId: BenchmarkSourceRecord['sourceId'],
  artifactId: string,
  sourceUrl: string,
): BenchmarkSourceRecord {
  return {
    sourceId,
    artifactId,
    sourceUrl,
    observedAt: OBSERVED_AT,
    etag: null,
    lastModified: null,
    upstreamRevision: null,
    schemaVersion: null,
    snapshotKey: `${sourceId}/${artifactId}.json`,
    contentHash: `sha256:${'a'.repeat(64)}`,
    originalContentHash: `sha256:${'b'.repeat(64)}`,
    licenseId: sourceId === 'openrouter' ? 'OpenRouter-ToS' : sourceId === 'lmarena' ? 'CC-BY-4.0' : 'MIT',
    attributionText: `${sourceId} source attribution`,
  };
}

function model(overrides: Partial<BenchmarkModel> = {}): BenchmarkModel {
  return {
    modelKey: 'benchlm:openai:gpt-5-6-sol',
    slug: 'gpt-5-6-sol',
    name: 'GPT-5.6 Sol',
    creator: 'OpenAI',
    sourceType: 'Proprietary',
    reasoningType: 'hybrid',
    releaseDate: '2026-08-01',
    contextWindowTokens: 400_000,
    evidenceStatus: 'supported',
    rankingEligible: true,
    confidenceLower: null,
    confidenceUpper: null,
    benchmarkCount: 8,
    sourceId: 'benchlm',
    sourceModelId: 'openai/gpt-5-6-sol',
    sourceArtifactId: 'benchlm-models',
    ...overrides,
  };
}

function metric(overrides: Partial<BenchmarkMetric> = {}): BenchmarkMetric {
  return {
    modelKey: 'benchlm:openai:gpt-5-6-sol',
    metricKey: 'benchlm:overall:raw',
    category: 'overall',
    value: 81.48,
    rawValue: 81,
    rank: 4,
    rankFieldSize: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    sourceUpdatedAt: OBSERVED_AT,
    sourceModelId: 'openai/gpt-5-6-sol',
    sourceArtifactId: 'benchlm-models',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
    ...overrides,
  };
}

function price(overrides: Partial<BenchmarkPriceCheck> = {}): BenchmarkPriceCheck {
  return {
    modelKey: 'benchlm:openai:gpt-5-6-sol',
    sourceId: 'openrouter',
    providerId: 'openai',
    inputUsdPerMillion: 1.25,
    cachedInputUsdPerMillion: 0.125,
    cacheWriteUsdPerMillion: 0.25,
    outputUsdPerMillion: 10,
    contextWindowTokens: 400_000,
    verificationStatus: 'primary',
    routeId: 'openrouter:openai/gpt-5-6-sol',
    sourceModelId: 'openai/gpt-5-6-sol',
    canonicalSlug: 'gpt-5-6-sol',
    maxInputTokens: null,
    maxOutputTokens: 32_000,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    supportedParameters: ['tools'],
    createdAt: '2026-08-01T00:00:00.000Z',
    expirationDate: '2027-08-01',
    knowledgeCutoff: '2025-06',
    tokenizer: 'o200k_base',
    instructionFormat: 'chatml',
    isModerated: true,
    perRequestLimitsJson: '{"max_requests":10}',
    sourceArtifactId: 'openrouter-models',
    ...overrides,
  };
}

function revision(): BenchmarkRevision {
  return {
    revision: REVISION,
    generatedAt: PUBLISHED_AT,
    publishedAt: PUBLISHED_AT,
    checkedAt: PUBLISHED_AT,
    publicationState: 'published',
    contentHash: `sha256:${'c'.repeat(64)}`,
    catalogRevision: 'catalog-1',
    openrouterContentHash: `sha256:${'d'.repeat(64)}`,
  };
}

function activeSnapshot(): ModelProfileSourceSnapshot {
  const gpt = model();
  const peers = [
    model({ modelKey: 'benchlm:peer:alpha', slug: 'alpha', name: 'Alpha', sourceModelId: 'peer/alpha' }),
    model({ modelKey: 'benchlm:peer:beta', slug: 'beta', name: 'Beta', sourceModelId: 'peer/beta' }),
    model({ modelKey: 'benchlm:peer:gamma', slug: 'gamma', name: 'Gamma', sourceModelId: 'peer/gamma' }),
  ];
  const overall = [
    // Four models, ranks 1..4: the source publishes an exact cohort size of 4.
    metric({ rankFieldSize: 4 }),
    metric({ modelKey: 'benchlm:peer:alpha', sourceModelId: 'peer/alpha', value: 90, rawValue: 90, rank: 1, rankFieldSize: 4 }),
    metric({ modelKey: 'benchlm:peer:beta', sourceModelId: 'peer/beta', value: 87, rawValue: 87, rank: 2, rankFieldSize: 4 }),
    metric({ modelKey: 'benchlm:peer:gamma', sourceModelId: 'peer/gamma', value: 83, rawValue: 83, rank: 3, rankFieldSize: 4 }),
  ];
  const coding = [
    metric({ metricKey: 'benchlm:category:coding', category: 'coding', value: 77.95, rawValue: null, rank: 3, rankFieldSize: 4 }),
    metric({ modelKey: 'benchlm:peer:alpha', sourceModelId: 'peer/alpha', metricKey: 'benchlm:category:coding', category: 'coding', value: 91, rawValue: null, rank: 1, rankFieldSize: 4 }),
    metric({ modelKey: 'benchlm:peer:beta', sourceModelId: 'peer/beta', metricKey: 'benchlm:category:coding', category: 'coding', value: 85, rawValue: null, rank: 2, rankFieldSize: 4 }),
    metric({ modelKey: 'benchlm:peer:gamma', sourceModelId: 'peer/gamma', metricKey: 'benchlm:category:coding', category: 'coding', value: 75, rawValue: null, rank: 4, rankFieldSize: 4 }),
  ];
  const missing = metric({
    metricKey: 'benchlm:category:missing',
    category: 'missing',
    value: 12,
    rawValue: null,
    rank: null,
    rankingEligible: false,
  });
  return {
    revision: revision(),
    sources: [source('benchlm', 'benchlm-models', 'https://benchlm.ai/leaderboard'), source('openrouter', 'openrouter-models', 'https://openrouter.ai/models')],
    models: [gpt, ...peers],
    metrics: [...overall, ...coding, missing],
    priceChecks: [price(), price({ routeId: 'openrouter:openai/gpt-5-6-sol:conflict', verificationStatus: 'conflict', outputUsdPerMillion: 12 })],
    comparisonPairs: [],
  };
}

  it('uses the standard SHA-256 digest over exact UTF-8 bytes', () => {
    expect(hashModelProfileSnapshotJson('abc')).toBe(
      'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

describe('model profile contracts', () => {
  it('builds a profile with public metrics, route prices, ledger evidence, and null radar axes', () => {
    const profile = buildModelProfileSnapshot(activeSnapshot(), 'benchlm:openai:gpt-5-6-sol');
    expect(profile.identity.slug).toBe('gpt-5-6-sol');
    expect(profile.summary.overallScore).toBe(81.48);
    expect(profile.categories.find((row) => row.key === 'coding')).toMatchObject({ score: 77.95, rank: 3 });
    expect(profile.radar.find((axis) => axis.key === 'missing')?.percentile).toBeNull();
    expect(profile.priceRoutes).toHaveLength(2);
    expect(profile.priceRoutes.some((route) => route.verificationStatus === 'conflict')).toBe(true);
    expect(profile.priceRoutes[0]).toMatchObject({
      cacheWriteUsdPerMillion: 0.25,
      createdAt: '2026-08-01T00:00:00.000Z',
      expirationDate: '2027-08-01',
      knowledgeCutoff: '2025-06',
      tokenizer: 'o200k_base',
      instructionFormat: 'chatml',
      isModerated: true,
      perRequestLimitsJson: '{"max_requests":10}',
      sourceArtifactId: 'openrouter-models',
      sourceUrl: 'https://openrouter.ai/models',
      observedAt: OBSERVED_AT,
    });
    expect(profile.ledger.every((row) => row.sourceUrl.startsWith('https://'))).toBe(true);
  });

  it('calculates ranking percentiles without replacing raw scores or missing values', () => {
    const profile = buildModelProfileSnapshot(activeSnapshot(), 'benchlm:openai:gpt-5-6-sol');
    const coding = profile.categories.find((row) => row.key === 'coding');
    expect(coding?.score).toBe(77.95);
    expect(coding?.rank).toBe(3);
    expect(coding?.fieldSize).toBe(4);
    expect(coding?.percentile).toBeCloseTo(33.3333333333, 8);
    expect(profile.radar.find((axis) => axis.key === 'missing')).toMatchObject({ percentile: null, rank: null });
  });

  it('never reports a rank beyond its own field size', () => {
    // Production shape: a published rank drawn from the full upstream cohort
    // while only a subset of that cohort is ranking-eligible in our window.
    // Counting only eligible rows produced impossible pairs like "#17 of 17".
    const snapshot = activeSnapshot();
    const ineligiblePeers = [
      model({ modelKey: 'benchlm:peer:delta', slug: 'delta', name: 'Delta', sourceModelId: 'peer/delta' }),
      model({ modelKey: 'benchlm:peer:epsilon', slug: 'epsilon', name: 'Epsilon', sourceModelId: 'peer/epsilon' }),
    ];
    const vision = [
      // The profile model ranks #17 in the published cohort but is not
      // ranking-eligible, exactly like Claude Fable 5 on multimodalGrounded.
      metric({
        metricKey: 'benchlm:category:vision',
        category: 'vision',
        value: 63.3,
        rawValue: null,
        rank: 17,
        rankingEligible: false,
      }),
      metric({
        modelKey: 'benchlm:peer:delta',
        sourceModelId: 'peer/delta',
        metricKey: 'benchlm:category:vision',
        category: 'vision',
        value: 88,
        rawValue: null,
        rank: 1,
      }),
      metric({
        modelKey: 'benchlm:peer:epsilon',
        sourceModelId: 'peer/epsilon',
        metricKey: 'benchlm:category:vision',
        category: 'vision',
        value: 70,
        rawValue: null,
        rank: 2,
      }),
    ];

    const profile = buildModelProfileSnapshot({
      ...snapshot,
      models: [...snapshot.models, ...ineligiblePeers],
      metrics: [...snapshot.metrics, ...vision],
    }, 'benchlm:openai:gpt-5-6-sol');

    const category = profile.categories.find((row) => row.key === 'vision');
    expect(category?.rank).toBe(17);
    expect(category?.fieldSize === null || category!.fieldSize >= 17).toBe(true);
    // A last-place artifact of a mismatched denominator is not a measurement.
    expect(category?.percentile).not.toBe(0);
  });

  describe('exact cohort rule', () => {
    // The public leaderboard window is a truncated slice: measured against real
    // upstream data, coding publishes 132 ranks but only 115 of those models
    // appear in the limit=200 window. So an observed rank set can look dense
    // (1..N with no gaps) while still missing the tail. Density of what we
    // happen to observe therefore cannot prove cohort completeness, and the
    // exact size must be carried from the source instead.
    function cohortSnapshot(rankFieldSize: number | null, ranks: readonly number[]) {
      const base = activeSnapshot();
      const peers = ranks.slice(1).map((_, index) => model({
        modelKey: `benchlm:peer:cohort-${index}`,
        slug: `cohort-${index}`,
        name: `Cohort ${index}`,
        sourceModelId: `peer/cohort-${index}`,
      }));
      const metrics = ranks.map((rank, index) => metric({
        ...(index === 0 ? {} : {
          modelKey: `benchlm:peer:cohort-${index - 1}`,
          sourceModelId: `peer/cohort-${index - 1}`,
        }),
        metricKey: 'benchlm:category:vision',
        category: 'vision',
        value: 90 - rank,
        rawValue: null,
        rank,
        rankFieldSize,
      }));
      return buildModelProfileSnapshot({
        ...base,
        models: [...base.models, ...peers],
        metrics: [...base.metrics, ...metrics],
      }, 'benchlm:openai:gpt-5-6-sol');
    }

    it('uses the exact published cohort size when the source supplies it', () => {
      const category = cohortSnapshot(3, [1, 2, 3]).categories.find((row) => row.key === 'vision');
      expect(category?.rank).toBe(1);
      expect(category?.fieldSize).toBe(3);
      expect(category?.percentile).toBe(100);
    });

    it('reports percentile 0 for true last place so the radar floor is reachable', () => {
      // rank === fieldSize is a real measurement when the cohort size is exact.
      const category = cohortSnapshot(3, [3, 1, 2]).categories.find((row) => row.key === 'vision');
      expect(category?.rank).toBe(3);
      expect(category?.fieldSize).toBe(3);
      expect(category?.percentile).toBe(0);
    });

    it('leaves the field unavailable when the source publishes no cohort size', () => {
      // Sparse observation {1, 3}: treating 3 as exact would invent a
      // denominator and overstate the percentile.
      const category = cohortSnapshot(null, [1, 3]).categories.find((row) => row.key === 'vision');
      expect(category?.rank).toBe(1);
      expect(category?.fieldSize).toBeNull();
      expect(category?.percentile).toBeNull();
    });

    it('never reports a rank larger than an exact cohort size', () => {
      const category = cohortSnapshot(2, [5, 1]).categories.find((row) => row.key === 'vision');
      expect(category?.rank).toBe(5);
      expect(category?.fieldSize).toBeNull();
      expect(category?.percentile).toBeNull();
    });
  });

  it('serializes exact UTF-8 profile JSON and validates it at the byte bound', () => {
    const profile = buildModelProfileSnapshot(activeSnapshot(), 'benchlm:openai:gpt-5-6-sol');
    const serialized = serializeModelProfileSnapshot(profile);
    expect(new TextEncoder().encode(serialized.profileJson).byteLength).toBeLessThanOrEqual(524_288);
    expect(serialized.contentHash).toBe(hashModelProfileSnapshotJson(serialized.profileJson));
    expect(parseModelProfileSnapshotData(serialized.profileJson)).toEqual(profile);
    expect(parseModelProfileSnapshotData('{not-json')).toBeNull();
    expect(parseModelProfileSnapshotData({
      ...profile,
      identity: { ...profile.identity, displayName: 'x'.repeat(524_288) },
    })).toBeNull();
  });

  it('uses native asynchronous SHA-256 without changing persisted profile bytes', async () => {
    const profile = buildModelProfileSnapshot(activeSnapshot(), 'benchlm:openai:gpt-5-6-sol');
    const synchronous = serializeModelProfileSnapshot(profile);
    const asynchronous = await serializeModelProfileSnapshotAsync(profile);

    expect(asynchronous).toEqual(synchronous);
    await expect(hashModelProfileSnapshotJsonAsync(synchronous.profileJson))
      .resolves.toBe(synchronous.contentHash);
  });
});
