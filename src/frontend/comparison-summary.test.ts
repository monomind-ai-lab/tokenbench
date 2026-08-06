import { describe, expect, it } from 'vitest';
import type { BenchmarkMetric, BenchmarkModel, BenchmarkPriceCheck } from '../benchmarks/contracts';
import type { ComparisonMetricRow, ComparisonViewModel } from './comparison-contracts';
import { comparisonSummary, friendlyMetricLabel } from './comparison-summary';

function model(
  modelKey: string,
  name: string,
  overrides: Partial<BenchmarkModel> = {},
): BenchmarkModel {
  return {
    modelKey,
    slug: modelKey.replace(':', '-'),
    name,
    creator: 'Example provider',
    sourceType: 'Proprietary',
    reasoningType: null,
    releaseDate: null,
    contextWindowTokens: 128_000,
    evidenceStatus: 'supported',
    rankingEligible: true,
    confidenceLower: null,
    confidenceUpper: null,
    benchmarkCount: 4,
    sourceId: 'benchlm',
    sourceModelId: modelKey,
    sourceArtifactId: 'benchlm-models',
    ...overrides,
  };
}

function metric(
  modelRecord: BenchmarkModel,
  metricKey: string,
  category: string,
  value: number,
  overrides: Partial<BenchmarkMetric> = {},
): BenchmarkMetric {
  return {
    modelKey: modelRecord.modelKey,
    metricKey,
    category,
    value,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    sourceUpdatedAt: '2026-08-06T00:00:00.000Z',
    sourceModelId: modelRecord.sourceModelId,
    sourceArtifactId: 'benchlm-models',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
    ...overrides,
  };
}

function sharedRow(
  modelA: BenchmarkModel,
  modelB: BenchmarkModel,
  category: string,
  modelAValue: number,
  modelBValue: number,
  overrides: Partial<ComparisonMetricRow> = {},
): ComparisonMetricRow {
  const metricKey = `benchlm:category:${category}`;
  return {
    metricKey,
    category,
    unit: 'score',
    sourceId: 'benchlm',
    methodology: 'benchlm_raw_composite',
    modelA: metric(modelA, metricKey, category, modelAValue),
    modelB: metric(modelB, metricKey, category, modelBValue),
    ...overrides,
  };
}

function price(
  modelRecord: BenchmarkModel,
  inputUsdPerMillion: number | null,
  outputUsdPerMillion: number | null,
  overrides: Partial<BenchmarkPriceCheck> = {},
): BenchmarkPriceCheck {
  return {
    modelKey: modelRecord.modelKey,
    sourceId: 'openrouter',
    providerId: modelRecord.creator,
    routeId: `openrouter:${modelRecord.slug}`,
    sourceModelId: modelRecord.sourceModelId,
    sourceArtifactId: 'openrouter-catalog',
    inputUsdPerMillion,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion,
    contextWindowTokens: modelRecord.contextWindowTokens,
    verificationStatus: 'primary',
    canonicalSlug: null,
    maxInputTokens: null,
    maxOutputTokens: null,
    inputModalities: null,
    outputModalities: null,
    supportedParameters: null,
    ...overrides,
  };
}

function comparisonWith(
  models: readonly [BenchmarkModel, BenchmarkModel],
  metricRows: readonly ComparisonMetricRow[] = [],
  priceChecks: readonly [readonly BenchmarkPriceCheck[], readonly BenchmarkPriceCheck[]] = [[], []],
): ComparisonViewModel {
  return {
    revision: 'published-r1',
    publishedAt: '2026-08-06T00:00:00.000Z',
    freshness: { status: 'fresh', checkedAt: '2026-08-06T00:00:00.000Z' },
    canonicalPath: '/compare/alpha-vs-beta',
    models,
    metricRows,
    priceChecks: [
      { modelKey: models[0].modelKey, checks: priceChecks[0] },
      { modelKey: models[1].modelKey, checks: priceChecks[1] },
    ],
    attribution: [],
    indexable: true,
    methodology: [],
    relatedPairs: [],
    subscriptionMatch: null,
  };
}

function pair(
  modelAOverrides: Partial<BenchmarkModel> = {},
  modelBOverrides: Partial<BenchmarkModel> = {},
): readonly [BenchmarkModel, BenchmarkModel] {
  return [model('provider:alpha', 'Alpha', modelAOverrides), model('provider:beta', 'Beta', modelBOverrides)];
}

function sparseComparisonViewModel(): ComparisonViewModel {
  return comparisonWith(pair());
}

function lmarenaSharedRows(): readonly ComparisonMetricRow[] {
  const [modelA, modelB] = pair({ sourceId: 'lmarena' }, { sourceId: 'lmarena' });
  const metricKey = 'lmarena:text_style_control:overall';
  return [{
    metricKey,
    category: 'overall',
    sourceId: 'lmarena',
    unit: 'arena_score',
    methodology: 'bradley_terry',
    modelA: metric(modelA, metricKey, 'overall', 1_200, {
      sourceId: 'lmarena', unit: 'arena_score', methodology: 'bradley_terry', sourceArtifactId: 'lmarena-text-style', voteCount: 100,
    }),
    modelB: metric(modelB, metricKey, 'overall', 1_150, {
      sourceId: 'lmarena', unit: 'arena_score', methodology: 'bradley_terry', sourceArtifactId: 'lmarena-text-style', voteCount: 100,
    }),
  }];
}

function mismatchedSourceRows(): readonly ComparisonMetricRow[] {
  const [modelA, modelB] = pair();
  const metricKey = 'benchlm:category:coding';
  return [{
    metricKey,
    category: 'coding',
    sourceId: 'benchlm',
    unit: 'score',
    methodology: 'benchlm_raw_composite',
    modelA: metric(modelA, metricKey, 'coding', 88),
    modelB: metric(modelB, metricKey, 'coding', 80, { sourceId: 'lmarena', sourceArtifactId: 'lmarena-text-style' }),
  }];
}

function estimatedSharedRows(): readonly ComparisonMetricRow[] {
  const [modelA, modelB] = pair({ evidenceStatus: 'estimated', rankingEligible: false }, { evidenceStatus: 'estimated', rankingEligible: false });
  return [sharedRow(
    modelA,
    modelB,
    'coding',
    88,
    80,
    {
      modelA: metric(modelA, 'benchlm:category:coding', 'coding', 88, { rankingEligible: false }),
      modelB: metric(modelB, 'benchlm:category:coding', 'coding', 80, { rankingEligible: false }),
    },
  )];
}

function comparisonWithRows(rows: readonly ComparisonMetricRow[]): ComparisonViewModel {
  const models = rows[0]
    ? [
      rows[0].modelA === null ? pair()[0] : model('provider:alpha', 'Alpha', {
        evidenceStatus: rows[0].modelA.rankingEligible ? 'supported' : 'estimated',
        rankingEligible: rows[0].modelA.rankingEligible,
        sourceId: rows[0].modelA.sourceId,
        sourceArtifactId: rows[0].modelA.sourceArtifactId,
      }),
      rows[0].modelB === null ? pair()[1] : model('provider:beta', 'Beta', {
        evidenceStatus: rows[0].modelB.rankingEligible ? 'supported' : 'estimated',
        rankingEligible: rows[0].modelB.rankingEligible,
        sourceId: rows[0].modelB.sourceId,
        sourceArtifactId: rows[0].modelB.sourceArtifactId,
      }),
    ] as const
    : pair();
  return comparisonWith(models, rows);
}

describe('friendlyMetricLabel', () => {
  it('removes source prefixes from metric titles', () => {
    expect(friendlyMetricLabel('benchlm:category:coding', 'coding')).toBe('Coding');
    expect(friendlyMetricLabel('lmarena:text_style_control:overall', 'overall')).toBe('Overall');
  });
});

describe('comparisonSummary', () => {
  it('does not name a winner when no compatible shared metric exists', () => {
    const summary = comparisonSummary(sparseComparisonViewModel());

    expect(summary.coverage).toBe('none');
    expect(summary.sentences.join(' ')).toMatch(/not enough shared evidence/i);
    expect(summary.sentences.join(' ')).not.toMatch(/wins|best model/i);
  });

  it.each([[lmarenaSharedRows()], [mismatchedSourceRows()], [estimatedSharedRows()]])(
    'does not turn non-BenchLM or incompatible evidence into a score winner', (rows) => {
      const summary = comparisonSummary(comparisonWithRows(rows));

      expect(summary.sentences.join(' ')).not.toMatch(/wins|higher capability|best model/i);
      expect(summary.sentences.join(' ')).not.toMatch(/higher supported BenchLM score/i);
    },
  );

  it('orders supported score, verified rate, and context advantages deterministically', () => {
    const models = pair({ contextWindowTokens: 128_000 }, { contextWindowTokens: 64_000 });
    const summary = comparisonSummary(comparisonWith(
      models,
      [
        sharedRow(models[0], models[1], 'reasoning', 80, 83),
        sharedRow(models[0], models[1], 'coding', 91, 87),
        sharedRow(models[0], models[1], 'multimodal', 76, 70),
        sharedRow(models[0], models[1], 'knowledge', 72, 68),
      ],
      [
        [price(models[0], 1, 4)],
        [price(models[1], 2, 3)],
      ],
    ));

    expect(summary).toEqual({
      heading: 'Comparison summary',
      coverage: 'strong',
      sentences: [
        'On Coding, Alpha has a higher supported BenchLM score (91 vs 87).',
        'On Knowledge, Alpha has a higher supported BenchLM score (72 vs 68).',
        'On Multimodal, Alpha has a higher supported BenchLM score (76 vs 70).',
        'On Reasoning, Beta has a higher supported BenchLM score (83 vs 80).',
      ],
    });
  });

  it('adds a limited-evidence caveat after one compatible shared metric', () => {
    const models = pair();
    const summary = comparisonSummary(comparisonWith(models, [sharedRow(models[0], models[1], 'coding', 88, 80)]));

    expect(summary).toEqual({
      heading: 'Comparison summary',
      coverage: 'limited',
      sentences: [
        'On Coding, Alpha has a higher supported BenchLM score (88 vs 80).',
        'Only 1 compatible shared BenchLM metric is available, so the score evidence is limited.',
      ],
    });
  });

  it('reports a price-only advantage only when both verified selected routes publish that rate', () => {
    const models = pair();
    const summary = comparisonSummary(comparisonWith(models, [], [
      [price(models[0], 1, 3)],
      [price(models[1], 2, 3)],
    ]));

    expect(summary).toEqual({
      heading: 'Comparison summary',
      coverage: 'none',
      sentences: [
        'Input API price: Alpha has the lower verified rate ($1 / 1M tokens vs $2 / 1M tokens).',
        'There is not enough shared evidence to make a supported BenchLM score comparison.',
      ],
    });
  });

  it('uses the same deterministic primary route selection as comparison pricing', () => {
    const models = pair();
    const summary = comparisonSummary(comparisonWith(models, [], [
      [
        price(models[0], 10, 10, { providerId: 'a-provider', routeId: 'openrouter:alpha-expensive' }),
        price(models[0], 1, 1, { providerId: 'z-provider', routeId: 'openrouter:alpha-inexpensive' }),
      ],
      [price(models[1], 2, 2)],
    ]));

    expect(summary.sentences).toEqual([
      'Input API price: Alpha has the lower verified rate ($1 / 1M tokens vs $2 / 1M tokens).',
      'Output API price: Alpha has the lower verified rate ($1 / 1M tokens vs $2 / 1M tokens).',
      'There is not enough shared evidence to make a supported BenchLM score comparison.',
    ]);
  });

  it('reports a context-only advantage only when both published model facts exist', () => {
    const models = pair({ contextWindowTokens: 256_000 }, { contextWindowTokens: 128_000 });
    const summary = comparisonSummary(comparisonWith(models));

    expect(summary).toEqual({
      heading: 'Comparison summary',
      coverage: 'none',
      sentences: [
        'Context window: Alpha has the larger published context window (256,000 tokens vs 128,000 tokens).',
        'There is not enough shared evidence to make a supported BenchLM score comparison.',
      ],
    });
  });

  it('describes tied compatible scores without naming a score winner', () => {
    const models = pair();
    const summary = comparisonSummary(comparisonWith(models, [
      sharedRow(models[0], models[1], 'coding', 88, 88),
      sharedRow(models[0], models[1], 'knowledge', 82, 82),
      sharedRow(models[0], models[1], 'multimodal', 71, 71),
      sharedRow(models[0], models[1], 'reasoning', 85, 85),
    ]));

    expect(summary).toEqual({
      heading: 'Comparison summary',
      coverage: 'strong',
      sentences: ['The compatible supported BenchLM scores are tied across 4 shared metrics.'],
    });
    expect(summary.sentences.join(' ')).not.toMatch(/wins|higher capability|best model/i);
  });

  it('keeps the caveat within the four-sentence cap when evidence is limited', () => {
    const models = pair({ contextWindowTokens: 256_000 }, { contextWindowTokens: 128_000 });
    const summary = comparisonSummary(comparisonWith(
      models,
      [
        sharedRow(models[0], models[1], 'coding', 90, 80),
        sharedRow(models[0], models[1], 'knowledge', 81, 80),
        sharedRow(models[0], models[1], 'reasoning', 85, 80),
      ],
      [[price(models[0], 1, 2)], [price(models[1], 2, 3)]],
    ));

    expect(summary.sentences).toHaveLength(4);
    expect(summary.sentences.at(-1)).toBe('Only 3 compatible shared BenchLM metrics are available, so the score evidence is limited.');
  });
});
