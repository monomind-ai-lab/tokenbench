import { describe, expect, it, vi } from 'vitest';
import type { BenchmarkMetric, BenchmarkModel, BenchmarkPriceCheck } from './contracts';
import { buildBenchmarkSummaryData } from './api-projections';

/**
 * The home "representative comparison" cards are editorially allowlisted and
 * must clear every published gate before shipping. The allowlist is empty by
 * default, so these tests stub it to prove the gates rather than to add pairs.
 */

vi.mock('./comparison-allowlist', () => ({
  COMPARISON_ALLOWLIST: ['alpha-vs-beta'],
  isEditorialComparisonPair: (pairSlug: string) => pairSlug === 'alpha-vs-beta',
}));

const OBSERVED_AT = '2026-08-10T00:00:00.000Z';
const CATEGORIES = ['coding', 'agentic', 'reasoning', 'knowledge'] as const;

function model(modelKey: string, slug: string): BenchmarkModel {
  return {
    modelKey, slug, name: slug.toUpperCase(), creator: 'Acme',
    sourceType: 'Proprietary', reasoningType: null, releaseDate: null,
    contextWindowTokens: 128_000, evidenceStatus: 'supported', rankingEligible: true,
    confidenceLower: null, confidenceUpper: null, benchmarkCount: 4,
    sourceId: 'benchlm', sourceModelId: modelKey, sourceArtifactId: 'models',
  };
}

function metric(modelKey: string, category: string, value: number): BenchmarkMetric {
  return {
    modelKey, metricKey: `benchlm:category:${category}`, category, value,
    rawValue: null, rank: null, lower: null, upper: null, voteCount: null,
    unit: 'score', sourceId: 'benchlm', sourceUpdatedAt: OBSERVED_AT,
    sourceModelId: modelKey, sourceArtifactId: 'models', rankingEligible: true,
    methodology: 'benchlm_raw_composite', observationCount: null, sessionCount: null,
  };
}

function price(modelKey: string, input: number, output: number): BenchmarkPriceCheck {
  return {
    modelKey, sourceId: 'openrouter', providerId: 'openrouter',
    inputUsdPerMillion: input, cachedInputUsdPerMillion: null, outputUsdPerMillion: output,
    contextWindowTokens: 200_000, verificationStatus: 'primary', routeId: `openrouter:${modelKey}`,
    sourceModelId: modelKey, canonicalSlug: modelKey, maxInputTokens: null, maxOutputTokens: null,
    inputModalities: null, outputModalities: null, supportedParameters: null,
    sourceArtifactId: 'models',
  };
}

function snapshot(overrides: {
  metrics?: BenchmarkMetric[];
  priceChecks?: BenchmarkPriceCheck[];
  models?: BenchmarkModel[];
} = {}) {
  return {
    sources: [{
      sourceId: 'benchlm' as const, artifactId: 'models', sourceUrl: 'https://benchlm.ai/data/models.json',
      observedAt: OBSERVED_AT, etag: null, lastModified: null, upstreamRevision: null, schemaVersion: '1.0',
      snapshotKey: 'benchmarks/benchlm/models/projected/a.json',
      contentHash: `sha256:${'a'.repeat(64)}`, originalContentHash: `sha256:${'b'.repeat(64)}`,
      licenseId: 'MIT' as const, attributionText: 'Data from BenchLM.ai',
    }],
    models: overrides.models ?? [model('alpha', 'alpha'), model('beta', 'beta')],
    metrics: overrides.metrics ?? [
      ...CATEGORIES.map((category, index) => metric('alpha', category, 90 - index)),
      ...CATEGORIES.map((category, index) => metric('beta', category, 80 - index)),
    ],
    priceChecks: overrides.priceChecks ?? [price('alpha', 2, 8), price('beta', 1, 4)],
    comparisonPairs: [],
  };
}

describe('representative home comparisons', () => {
  it('publishes an allowlisted pair that clears every gate', () => {
    const [card] = buildBenchmarkSummaryData(snapshot()).representativeComparisons;

    expect(card).toMatchObject({
      pairSlug: 'alpha-vs-beta',
      modelASlug: 'alpha',
      modelBSlug: 'beta',
      sharedMetricCount: 4,
    });
    // Strongest decision-relevant difference leads, and no tie invents a leader.
    expect(card?.sharedMetrics[0]?.gap).toBeGreaterThan(0);
    expect(card?.sharedMetrics[0]?.leaderSlug).toBe('alpha');
    expect(card?.modelAPriceUsdPerMillion).not.toBeNull();
    expect(card?.modelBPriceUsdPerMillion).not.toBeNull();
  });

  it('omits a pair with fewer than four compatible shared metrics', () => {
    const metrics = [
      ...CATEGORIES.slice(0, 3).map((category, index) => metric('alpha', category, 90 - index)),
      ...CATEGORIES.slice(0, 3).map((category, index) => metric('beta', category, 80 - index)),
    ];

    expect(buildBenchmarkSummaryData(snapshot({ metrics })).representativeComparisons).toEqual([]);
  });

  it('omits a pair whose shared metrics are all ties', () => {
    const metrics = [
      ...CATEGORIES.map((category) => metric('alpha', category, 85)),
      ...CATEGORIES.map((category) => metric('beta', category, 85)),
    ];
    const cards = buildBenchmarkSummaryData(snapshot({ metrics })).representativeComparisons;

    // No decision-relevant difference means the card would say nothing.
    expect(cards).toEqual([]);
  });

  it('reports a tied metric without naming a leader', () => {
    const metrics = [
      metric('alpha', 'coding', 90), metric('alpha', 'agentic', 88), metric('alpha', 'reasoning', 85), metric('alpha', 'knowledge', 80),
      metric('beta', 'coding', 70), metric('beta', 'agentic', 88), metric('beta', 'reasoning', 85), metric('beta', 'knowledge', 80),
    ];
    const [card] = buildBenchmarkSummaryData(snapshot({ metrics })).representativeComparisons;
    const tied = card?.sharedMetrics.filter((shared) => shared.gap === 0) ?? [];

    expect(tied.length).toBeGreaterThan(0);
    expect(tied.every((shared) => shared.leaderSlug === null)).toBe(true);
  });

  it('omits a pair with neither price nor context evidence', () => {
    const models = [
      { ...model('alpha', 'alpha'), contextWindowTokens: null },
      { ...model('beta', 'beta'), contextWindowTokens: null },
    ];

    expect(buildBenchmarkSummaryData(snapshot({ models, priceChecks: [] })).representativeComparisons).toEqual([]);
  });

  it('omits a pair when either model is not supported evidence', () => {
    const models = [
      model('alpha', 'alpha'),
      { ...model('beta', 'beta'), evidenceStatus: 'estimated' as const },
    ];

    expect(buildBenchmarkSummaryData(snapshot({ models })).representativeComparisons).toEqual([]);
  });

  it('omits an allowlisted pair that does not resolve in the active revision', () => {
    const models = [model('alpha', 'alpha'), model('gamma', 'gamma')];

    expect(buildBenchmarkSummaryData(snapshot({ models })).representativeComparisons).toEqual([]);
  });
});
