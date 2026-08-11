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
    metric(),
    metric({ modelKey: 'benchlm:peer:alpha', sourceModelId: 'peer/alpha', value: 90, rawValue: 90, rank: 1 }),
    metric({ modelKey: 'benchlm:peer:beta', sourceModelId: 'peer/beta', value: 87, rawValue: 87, rank: 2 }),
    metric({ modelKey: 'benchlm:peer:gamma', sourceModelId: 'peer/gamma', value: 83, rawValue: 83, rank: 3 }),
  ];
  const coding = [
    metric({ metricKey: 'benchlm:category:coding', category: 'coding', value: 77.95, rawValue: null, rank: 3 }),
    metric({ modelKey: 'benchlm:peer:alpha', sourceModelId: 'peer/alpha', metricKey: 'benchlm:category:coding', category: 'coding', value: 91, rawValue: null, rank: 1 }),
    metric({ modelKey: 'benchlm:peer:beta', sourceModelId: 'peer/beta', metricKey: 'benchlm:category:coding', category: 'coding', value: 85, rawValue: null, rank: 2 }),
    metric({ modelKey: 'benchlm:peer:gamma', sourceModelId: 'peer/gamma', metricKey: 'benchlm:category:coding', category: 'coding', value: 75, rawValue: null, rank: 4 }),
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
