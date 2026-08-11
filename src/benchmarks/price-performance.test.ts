import { describe, expect, it } from 'vitest';
import type { BenchmarkMetric, BenchmarkModel, BenchmarkPriceCheck } from './contracts';
import {
  buildPricePerformanceProjection,
  filterPricePerformancePoints,
  markParetoFrontier,
  oneRepresentativePerFamily,
  priceForBasis,
  type PricePerformancePoint,
  type PricePerformanceProjectionInput,
} from './price-performance';
import type {
  PricePerformanceCostBasis,
  PricePerformanceScoreLane,
} from './price-performance-contracts';

const OBSERVED_AT = '2026-08-10T00:00:00.000Z';

function model(overrides: Partial<BenchmarkModel> = {}): BenchmarkModel {
  return {
    modelKey: 'benchlm:openai:model-a',
    slug: 'model-a',
    name: 'Model A',
    creator: 'OpenAI',
    familyId: null,
    variantId: null,
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
    sourceArtifactId: 'public-leaderboard',
    ...overrides,
  };
}

function metric(
  modelKey: string,
  metricKey: string,
  value: number,
  overrides: Partial<BenchmarkMetric> = {},
): BenchmarkMetric {
  const category = metricKey === 'benchlm:overall:raw'
    ? 'overall'
    : metricKey.slice('benchlm:category:'.length);
  return {
    modelKey,
    metricKey,
    category,
    value,
    rawValue: null,
    rank: 1,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    sourceUpdatedAt: OBSERVED_AT,
    sourceModelId: modelKey,
    sourceArtifactId: 'public-leaderboard',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
    ...overrides,
  };
}

function price(overrides: Partial<BenchmarkPriceCheck> = {}): BenchmarkPriceCheck {
  return {
    modelKey: 'benchlm:openai:model-a',
    sourceId: 'openrouter',
    providerId: 'openai',
    inputUsdPerMillion: 2,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: 8,
    contextWindowTokens: 128_000,
    verificationStatus: 'primary',
    routeId: 'openrouter:model-a',
    sourceModelId: 'openai/model-a',
    canonicalSlug: 'model-a',
    maxInputTokens: null,
    maxOutputTokens: null,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: ['tools'],
    sourceArtifactId: 'catalog:current',
    ...overrides,
  };
}

function projectionInput(overrides: Partial<PricePerformanceProjectionInput> = {}): PricePerformanceProjectionInput {
  return {
    models: [model()],
    metrics: [
      metric('benchlm:openai:model-a', 'benchlm:overall:raw', 81.48),
      metric('benchlm:openai:model-a', 'benchlm:category:coding', 77.95),
    ],
    priceChecks: [price()],
    ...overrides,
  };
}

function point(
  modelKey: string,
  score: number | null,
  cost: number | null,
  overrides: Partial<PricePerformancePoint> = {},
): PricePerformancePoint {
  return {
    modelKey,
    slug: modelKey,
    displayName: modelKey,
    creator: 'Provider',
    familyId: null,
    status: 'current',
    sourceType: 'Proprietary',
    evidenceStatus: 'supported',
    scores: {
      overall: score,
      agentic: null,
      coding: null,
      reasoning: null,
      knowledge: null,
      multimodal: null,
      mathematics: null,
      multilingual: null,
      'instruction-following': null,
    },
    route: price({
      modelKey,
      routeId: `${modelKey}:route`,
      canonicalSlug: modelKey,
      inputUsdPerMillion: cost,
      outputUsdPerMillion: cost,
    }),
    ...overrides,
  };
}

describe('price-performance cost derivation', () => {
  it.each([
    [{ input: 2, output: 8 }, 'output', 8],
    [{ input: 2, output: 8 }, 'blended-3-1', 3.5],
    [{ input: 0, output: 0 }, 'blended-3-1', 0],
    [{ input: 0.125, output: 1.875 }, 'blended-3-1', 0.5625],
    [{ input: 1_000_000, output: 2_000_000 }, 'blended-3-1', 1_250_000],
  ] as const)('calculates %j with %s as %s', (values, basis, expected) => {
    expect(priceForBasis(price({
      inputUsdPerMillion: values.input,
      outputUsdPerMillion: values.output,
    }), basis as PricePerformanceCostBasis)).toBe(expected);
  });

  it('returns unavailable when the selected price fact is missing or non-finite', () => {
    expect(priceForBasis(price({ outputUsdPerMillion: null }), 'output')).toBeNull();
    expect(priceForBasis(price({ inputUsdPerMillion: null }), 'blended-3-1')).toBeNull();
    expect(priceForBasis(price({ outputUsdPerMillion: Number.POSITIVE_INFINITY }), 'output')).toBeNull();
  });
});

describe('price-performance score and route projection', () => {
  it('uses the corrected GPT-5.6 Sol coding lane', () => {
    const sol = model({
      modelKey: 'benchlm:openai:gpt-5-6-sol',
      slug: 'gpt-5-6-sol',
      name: 'GPT-5.6 Sol',
      sourceModelId: 'gpt-5.6-sol',
    });
    const projection = buildPricePerformanceProjection({
      models: [sol],
      metrics: [
        metric(sol.modelKey, 'benchlm:overall:raw', 81.48),
        metric(sol.modelKey, 'benchlm:category:coding', 77.95),
      ],
      priceChecks: [price({
        modelKey: sol.modelKey,
        sourceModelId: sol.sourceModelId,
        canonicalSlug: sol.slug,
      })],
    });
    expect(projection.points.find((point) => point.slug === 'gpt-5-6-sol')?.scores.coding).toBe(77.95);
  });

  it('maps every supported lane to its explicit public metric key', () => {
    const candidate = model();
    const lanes: readonly [PricePerformanceScoreLane, string][] = [
      ['overall', 'benchlm:overall:raw'],
      ['agentic', 'benchlm:category:agentic'],
      ['coding', 'benchlm:category:coding'],
      ['reasoning', 'benchlm:category:reasoning'],
      ['knowledge', 'benchlm:category:knowledge'],
      ['multimodal', 'benchlm:category:multimodalGrounded'],
      ['mathematics', 'benchlm:category:math'],
      ['multilingual', 'benchlm:category:multilingual'],
      ['instruction-following', 'benchlm:category:instructionFollowing'],
    ];
    const projection = buildPricePerformanceProjection({
      models: [candidate],
      metrics: lanes.map(([lane, key], index) => metric(candidate.modelKey, key, index + 1)),
      priceChecks: [price()],
    });
    expect(projection.points[0]?.scores).toEqual({
      overall: 1,
      agentic: 2,
      coding: 3,
      reasoning: 4,
      knowledge: 5,
      multimodal: 6,
      mathematics: 7,
      multilingual: 8,
      'instruction-following': 9,
    });
  });

  it('excludes candidates without a public score, valid price, or safe durable slug', () => {
    const valid = model();
    const noScore = model({ modelKey: 'benchlm:openai:no-score', slug: 'no-score', sourceModelId: 'no-score' });
    const noPrice = model({ modelKey: 'benchlm:openai:no-price', slug: 'no-price', sourceModelId: 'no-price' });
    const unsafe = model({ modelKey: 'benchlm:openai:unsafe', slug: 'unsafe/slug', sourceModelId: 'unsafe' });
    expect(buildPricePerformanceProjection({
      models: [valid, noScore, noPrice, unsafe],
      metrics: [metric(valid.modelKey, 'benchlm:overall:raw', 80), metric(noPrice.modelKey, 'benchlm:overall:raw', 70)],
      priceChecks: [price(), price({ modelKey: noScore.modelKey }), price({ modelKey: unsafe.modelKey })],
    }).points.map((candidate) => candidate.modelKey)).toEqual([valid.modelKey]);
  });

  it('prioritizes exact direct-provider evidence over OpenRouter and sorts ties by binary route identity', () => {
    const candidate = model();
    const routes = [
      price({ sourceId: 'openrouter', providerId: 'zeta', routeId: 'z-route', canonicalSlug: candidate.slug }),
      price({ sourceId: 'benchlm', providerId: 'provider', routeId: 'z-direct', canonicalSlug: candidate.slug }),
      price({ sourceId: 'benchlm', providerId: 'provider', routeId: 'a-direct', canonicalSlug: candidate.slug }),
    ];
    const projection = buildPricePerformanceProjection({
      models: [candidate],
      metrics: [metric(candidate.modelKey, 'benchlm:overall:raw', 80)],
      priceChecks: routes,
    });
    expect(projection.points[0]?.route).toMatchObject({ sourceId: 'benchlm', providerId: 'provider', routeId: 'a-direct' });
  });
});

describe('price-performance selection and frontier', () => {
  it('selects one representative per supplied family and treats null family as unique', () => {
    const points = [
      point('family-a:slow', 80, 2, { familyId: 'family-a' }),
      point('family-a:best', 90, 3, { familyId: 'family-a' }),
      point('no-family:one', 80, 1),
      point('no-family:two', 70, 1),
    ];
    expect(oneRepresentativePerFamily(points).map((candidate) => candidate.modelKey)).toEqual([
      'family-a:best',
      'no-family:one',
      'no-family:two',
    ]);
  });

  it('keeps exact ties on the frontier and deterministically removes dominated points', () => {
    const views = markParetoFrontier([
      point('a', 80, 4),
      point('b', 80, 4),
      point('c', 79, 5),
      point('d', 81, 6),
    ]);
    expect(views.filter((candidate) => candidate.frontier).map((candidate) => candidate.modelKey)).toEqual(['a', 'b', 'd']);
    expect(views.find((candidate) => candidate.modelKey === 'c')?.frontier).toBe(false);
  });

  it('marks zero-cost points frontier without producing an infinite score-per-dollar ratio', () => {
    const views = markParetoFrontier([point('free', 50, 0), point('paid', 60, 1)]);
    expect(views.find((candidate) => candidate.modelKey === 'free')).toMatchObject({ frontier: true, scorePerDollar: null });
  });

  it('filters by lane, selected cost basis, creator, evidence, and lifecycle', () => {
    const points = [
      point('open-current', 80, 2, {
        creator: 'OpenAI',
        status: 'current',
        scores: {
          ...point('open-current', 80, 2).scores,
          coding: 90,
        },
      }),
      point('other-archived', 81, 1, { creator: 'Other', status: 'archived' }),
    ];
    expect(filterPricePerformancePoints(points, {
      lane: 'coding',
      costBasis: 'blended-3-1',
      creator: 'OpenAI',
      status: 'current',
      evidenceStatus: 'supported',
    }).map((candidate) => candidate.modelKey)).toEqual(['open-current']);
  });
});
