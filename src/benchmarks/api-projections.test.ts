import { describe, expect, it } from 'vitest';
import type {
  BenchmarkMetric,
  BenchmarkModel,
  BenchmarkPriceCheck,
  BenchmarkSourceRecord,
} from './contracts';
import { buildBenchmarkSummaryData, type BenchmarkProjectionSnapshot } from './api-projections';

const OBSERVED_AT = '2026-08-05T11:00:00.000Z';

function model(modelKey: string, evidenceStatus: BenchmarkModel['evidenceStatus'], rankingEligible: boolean): BenchmarkModel {
  return {
    modelKey,
    slug: modelKey.replace('provider:', ''),
    name: modelKey,
    creator: 'Provider',
    sourceType: 'Proprietary',
    reasoningType: null,
    releaseDate: null,
    contextWindowTokens: 32_000,
    evidenceStatus,
    rankingEligible,
    confidenceLower: null,
    confidenceUpper: null,
    benchmarkCount: 6,
    sourceId: 'benchlm',
    sourceModelId: modelKey,
    sourceArtifactId: 'benchlm-models',
  };
}

function metric(modelKey: string, metricKey: string, value: number, rankingEligible: boolean): BenchmarkMetric {
  return {
    modelKey,
    metricKey,
    category: metricKey.split(':').at(-1)!,
    value,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    sourceUpdatedAt: '2026-08-05T10:00:00.000Z',
    sourceModelId: modelKey,
    sourceArtifactId: 'benchlm-models',
    rankingEligible,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
  };
}

function price(modelKey: string, inputUsdPerMillion: number, outputUsdPerMillion: number): BenchmarkPriceCheck {
  return {
    modelKey,
    sourceId: 'openrouter',
    providerId: 'openrouter',
    inputUsdPerMillion,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion,
    contextWindowTokens: 128_000,
    verificationStatus: 'primary',
    routeId: `openrouter:${modelKey}`,
    sourceModelId: modelKey,
    canonicalSlug: modelKey,
    maxInputTokens: null,
    maxOutputTokens: null,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: null,
    sourceArtifactId: 'openrouter-models',
  };
}

function snapshot(): BenchmarkProjectionSnapshot {
  const supported = model('provider:supported', 'supported', true);
  const estimated = model('provider:estimated', 'estimated', false);
  const metricKeys = [
    'benchlm:overall:raw',
    'benchlm:category:agentic',
    'benchlm:category:coding',
    'benchlm:category:reasoning',
    'benchlm:category:multimodal',
    'benchlm:category:knowledge',
  ];
  const sources: readonly BenchmarkSourceRecord[] = [
    {
      sourceId: 'benchlm', artifactId: 'benchlm-models', sourceUrl: 'https://benchlm.ai/data/models.json', observedAt: OBSERVED_AT,
      etag: null, lastModified: null, upstreamRevision: null, schemaVersion: null, snapshotKey: 'benchlm.json',
      contentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      originalContentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      licenseId: 'MIT', attributionText: 'BenchLM',
    },
    {
      sourceId: 'openrouter', artifactId: 'openrouter-models', sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt: OBSERVED_AT,
      etag: null, lastModified: null, upstreamRevision: null, schemaVersion: null, snapshotKey: 'openrouter.json',
      contentHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      originalContentHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      licenseId: 'OpenRouter-ToS', attributionText: 'OpenRouter',
    },
  ];
  return {
    sources,
    models: [estimated, supported],
    metrics: [
      ...metricKeys.map((metricKey) => metric(supported.modelKey, metricKey, 80, true)),
      ...metricKeys.map((metricKey) => metric(estimated.modelKey, metricKey, 99, false)),
    ],
    priceChecks: [price(supported.modelKey, 1, 3), price(estimated.modelKey, 0, 0)],
    comparisonPairs: [],
  };
}

describe('buildBenchmarkSummaryData', () => {
  it('adds the supported-only picks and Home snapshot to the canonical summary data', () => {
    const result = buildBenchmarkSummaryData(snapshot());

    expect(result.decisionPicks.map((group) => group.key)).toEqual([
      'llm-overall',
      'llm-agentic',
      'llm-coding',
      'llm-reasoning',
      'multimodal-vision-documents',
      'llm-knowledge',
    ]);
    expect(result.decisionPicks.flatMap((group) => group.entries)).toEqual(expect.arrayContaining([
      expect.objectContaining({ modelKey: 'provider:supported', evidenceStatus: 'supported' }),
    ]));
    expect(result.decisionPicks.flatMap((group) => group.entries).some((entry) => entry.modelKey === 'provider:estimated')).toBe(false);
    expect(result.homeDecisionSnapshot).toMatchObject({
      benchAlignLeader: { status: 'ready', value: { modelKey: 'provider:supported' } },
      valueFrontierLeader: { status: 'ready', value: { modelKey: 'provider:supported' } },
      lowestVerifiedRepresentativeRate: {
        status: 'ready',
        value: { modelKey: 'provider:supported', representativePriceUsdPerMillion: 2 },
      },
      pricePerformancePoints: [
        expect.objectContaining({ modelKey: 'provider:supported', representativePriceUsdPerMillion: 2 }),
      ],
    });
  });
});
