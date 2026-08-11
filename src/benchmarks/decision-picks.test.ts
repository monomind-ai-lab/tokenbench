import { describe, expect, it } from 'vitest';
import type {
  BenchmarkMetric,
  BenchmarkModel,
  BenchmarkPriceCheck,
  BenchmarkSourceRecord,
} from './contracts';
import type { BenchmarkProjectionSnapshot } from './api-projections';
import { decisionPicks, homeDecisionSnapshot } from './decision-picks';

const BENCHLM_OBSERVED_AT = '2026-08-05T11:00:00.000Z';
const OPENROUTER_OBSERVED_AT = '2026-08-05T11:10:00.000Z';

const approvedMetricKeys = [
  'benchlm:overall:raw',
  'benchlm:category:agentic',
  'benchlm:category:coding',
  'benchlm:category:reasoning',
  'benchlm:category:multimodalGrounded',
  'benchlm:category:knowledge',
] as const;

function model(
  modelKey: string,
  slug: string,
  evidenceStatus: BenchmarkModel['evidenceStatus'] = 'supported',
  rankingEligible = true,
): BenchmarkModel {
  return {
    modelKey,
    slug,
    name: `${slug} model`,
    creator: `${slug} provider`,
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

function metric(
  modelKey: string,
  metricKey: typeof approvedMetricKeys[number],
  value: number,
  rankingEligible = true,
): BenchmarkMetric {
  return {
    modelKey,
    metricKey,
    category: metricKey.split(':').at(-1)!,
    value,
    rawValue: null,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    // The public pick must surface the source artifact observation instead.
    sourceUpdatedAt: '2026-08-05T10:00:00.000Z',
    sourceModelId: modelKey,
    sourceArtifactId: 'benchlm-models',
    rankingEligible,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
  };
}

function primaryPrice(
  modelKey: string,
  inputUsdPerMillion: number | null,
  outputUsdPerMillion: number | null,
): BenchmarkPriceCheck {
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

function snapshotWithSupportedAndEstimatedModels(): BenchmarkProjectionSnapshot {
  const alpha = model('provider:alpha', 'alpha');
  const beta = model('provider:beta', 'beta');
  const gamma = model('provider:gamma', 'gamma');
  const delta = model('provider:delta', 'delta');
  const estimated = model('provider:estimated', 'estimated', 'estimated', false);
  const values = new Map([
    [alpha.modelKey, 90],
    [beta.modelKey, 90],
    [gamma.modelKey, 80],
    [delta.modelKey, 70],
    [estimated.modelKey, 99],
  ]);
  const models = [delta, estimated, gamma, beta, alpha];

  return {
    sources: [
      {
        sourceId: 'benchlm',
        artifactId: 'benchlm-models',
        sourceUrl: 'https://benchlm.ai/data/models.json',
        observedAt: BENCHLM_OBSERVED_AT,
        etag: null,
        lastModified: null,
        upstreamRevision: null,
        schemaVersion: null,
        snapshotKey: 'benchlm-models.json',
        contentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        originalContentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        licenseId: 'MIT',
        attributionText: 'BenchLM',
      },
      {
        sourceId: 'openrouter',
        artifactId: 'openrouter-models',
        sourceUrl: 'https://openrouter.ai/api/v1/models',
        observedAt: OPENROUTER_OBSERVED_AT,
        etag: null,
        lastModified: null,
        upstreamRevision: null,
        schemaVersion: null,
        snapshotKey: 'openrouter-models.json',
        contentHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        originalContentHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        licenseId: 'OpenRouter-ToS',
        attributionText: 'OpenRouter',
      },
    ] satisfies readonly BenchmarkSourceRecord[],
    models,
    metrics: models.flatMap((candidate) => approvedMetricKeys.map((metricKey) => metric(
      candidate.modelKey,
      metricKey,
      values.get(candidate.modelKey)!,
      candidate.rankingEligible,
    ))),
    priceChecks: [
      primaryPrice(alpha.modelKey, 2, 6),
      primaryPrice(beta.modelKey, 1, 3),
      primaryPrice(gamma.modelKey, null, 1),
      primaryPrice(estimated.modelKey, 0, 0),
    ],
    comparisonPairs: [],
  };
}

describe('decisionPicks', () => {
  it('publishes at most three supported picks in approved category order', () => {
    const groups = decisionPicks(snapshotWithSupportedAndEstimatedModels());

    expect(groups.map((group) => group.key)).toEqual([
      'llm-overall',
      'llm-agentic',
      'llm-coding',
      'llm-reasoning',
      'multimodal-vision-documents',
      'llm-knowledge',
    ]);
    expect(groups.every((group) => group.entries.length <= 3)).toBe(true);
    expect(groups.flatMap((group) => group.entries).every((entry) => entry.evidenceStatus === 'supported')).toBe(true);
    expect(groups[0]).toMatchObject({
      label: 'BenchAlign leaders',
      status: 'benchalign',
      entries: [
        {
          // Source rank, not a synthesized 1/2/3 row position: these fixture
          // metrics publish no rank, so the pick stays "not ranked by source".
          rank: null,
          slug: 'alpha',
          representativePriceUsdPerMillion: 4,
          contextWindowTokens: 128_000,
          updatedAt: BENCHLM_OBSERVED_AT,
        },
        { rank: null, slug: 'beta', representativePriceUsdPerMillion: 2 },
        { rank: null, slug: 'gamma', representativePriceUsdPerMillion: null },
      ],
    });
    expect(groups.find((group) => group.key === 'llm-reasoning')?.status).toBe('evidence-lens');
    expect(groups.find((group) => group.key === 'multimodal-vision-documents')?.status).toBe('evidence-lens');
  });

  it('materializes the four Home decision fields without sample fallbacks', () => {
    const home = homeDecisionSnapshot(snapshotWithSupportedAndEstimatedModels());

    expect(home.benchAlignLeader).toMatchObject({
      status: 'ready',
      updatedAt: BENCHLM_OBSERVED_AT,
      value: { slug: 'alpha', evidenceStatus: 'supported', representativePriceUsdPerMillion: 4 },
    });
    expect(home.valueFrontierLeader).toMatchObject({
      status: 'ready',
      updatedAt: BENCHLM_OBSERVED_AT,
      value: { slug: 'beta', evidenceStatus: 'supported', representativePriceUsdPerMillion: 2 },
    });
    expect(home.lowestVerifiedRepresentativeRate).toMatchObject({
      status: 'ready',
      updatedAt: OPENROUTER_OBSERVED_AT,
      value: { slug: 'beta', evidenceStatus: 'supported', representativePriceUsdPerMillion: 2 },
    });
    expect(home.pricePerformancePoints).toEqual([
      expect.objectContaining({
        slug: 'alpha',
        score: 90,
        representativePriceUsdPerMillion: 4,
        evidenceStatus: 'supported',
        updatedAt: BENCHLM_OBSERVED_AT,
      }),
      expect.objectContaining({
        slug: 'beta',
        score: 90,
        representativePriceUsdPerMillion: 2,
        evidenceStatus: 'supported',
        updatedAt: BENCHLM_OBSERVED_AT,
      }),
    ]);
  });

  it('withholds rate-derived facts when their primary source artifact is absent', () => {
    const complete = snapshotWithSupportedAndEstimatedModels();
    const snapshot = {
      ...complete,
      priceChecks: complete.priceChecks.map((price) => ({ ...price, sourceArtifactId: 'missing-openrouter-artifact' })),
    };

    const groups = decisionPicks(snapshot);
    const home = homeDecisionSnapshot(snapshot);

    expect(groups.flatMap((group) => group.entries).every((entry) => entry.representativePriceUsdPerMillion === null)).toBe(true);
    expect(home.benchAlignLeader).toMatchObject({ status: 'ready', value: { slug: 'alpha' } });
    expect(home.valueFrontierLeader).toEqual({ status: 'unavailable' });
    expect(home.lowestVerifiedRepresentativeRate).toEqual({ status: 'unavailable' });
    expect(home.pricePerformancePoints).toEqual([]);
  });

  it('keeps empty categories and rate ties deterministic across input order', () => {
    const complete = snapshotWithSupportedAndEstimatedModels();
    const withEmptyKnowledgeAndRateTie = {
      ...complete,
      metrics: complete.metrics.filter((metric) => metric.metricKey !== 'benchlm:category:knowledge'),
      priceChecks: complete.priceChecks.map((price) => price.modelKey === 'provider:alpha'
        ? { ...price, inputUsdPerMillion: 1, outputUsdPerMillion: 3 }
        : price),
    };
    const reordered = {
      ...withEmptyKnowledgeAndRateTie,
      sources: [...withEmptyKnowledgeAndRateTie.sources].reverse(),
      models: [...withEmptyKnowledgeAndRateTie.models].reverse(),
      metrics: [...withEmptyKnowledgeAndRateTie.metrics].reverse(),
      priceChecks: [...withEmptyKnowledgeAndRateTie.priceChecks].reverse(),
    };

    expect(decisionPicks(reordered)).toEqual(decisionPicks(withEmptyKnowledgeAndRateTie));
    expect(homeDecisionSnapshot(reordered)).toEqual(homeDecisionSnapshot(withEmptyKnowledgeAndRateTie));
    expect(decisionPicks(reordered).find((group) => group.key === 'llm-knowledge')?.entries).toEqual([]);
    expect(homeDecisionSnapshot(reordered).lowestVerifiedRepresentativeRate).toMatchObject({
      status: 'ready',
      value: { slug: 'alpha', representativePriceUsdPerMillion: 2 },
    });
  });

  it('keeps supported category evidence and verified rate facts independent of Overall eligibility', () => {
    const complete = snapshotWithSupportedAndEstimatedModels();
    const categoryOnly = model('provider:category-only', 'category-only', 'supported', false);
    const snapshot = {
      ...complete,
      models: [...complete.models, categoryOnly],
      metrics: [
        ...complete.metrics,
        metric(categoryOnly.modelKey, 'benchlm:category:coding', 100, true),
      ],
      priceChecks: [
        ...complete.priceChecks,
        primaryPrice(categoryOnly.modelKey, 0.5, 1.5),
      ],
    };

    const coding = decisionPicks(snapshot).find((group) => group.key === 'llm-coding');
    const home = homeDecisionSnapshot(snapshot);

    expect(coding?.entries[0]).toMatchObject({ slug: 'category-only', evidenceStatus: 'supported' });
    expect(decisionPicks(snapshot).find((group) => group.key === 'llm-overall')?.entries
      .some((entry) => entry.slug === 'category-only')).toBe(false);
    expect(home.lowestVerifiedRepresentativeRate).toMatchObject({
      status: 'ready',
      value: { slug: 'category-only', representativePriceUsdPerMillion: 1 },
    });
    expect(home.pricePerformancePoints.some((point) => point.slug === 'category-only')).toBe(false);
  });
});
