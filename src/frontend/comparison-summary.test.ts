import { describe, expect, it } from 'vitest';
import type { BenchmarkMetric, BenchmarkModel, BenchmarkPriceCheck } from '../benchmarks/contracts';
import type { ComparisonMetricRow, ComparisonViewModel } from './comparison-contracts';
import { comparisonSummary, friendlyMetricLabel } from './comparison-summary';

const COMPACT_LABEL_BYTE_CAP = 32;
const COMPACT_CLAIM_BYTE_CAP = 448;

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function expectSafeSummarySentences(sentences: readonly string[]): void {
  for (const sentence of sentences) {
    expect(utf8ByteLength(sentence)).toBeLessThanOrEqual(COMPACT_CLAIM_BYTE_CAP);
    expect(sentence).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    expect(new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(sentence))).toBe(sentence);
  }
}

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

function supportedScoreLeadRows(
  models: readonly [BenchmarkModel, BenchmarkModel],
  alphaCategories: readonly string[],
  betaCategories: readonly string[],
): readonly ComparisonMetricRow[] {
  return [
    ...alphaCategories.map((category, index) => sharedRow(models[0], models[1], category, 10_000 + index, index)),
    ...betaCategories.map((category, index) => sharedRow(models[0], models[1], category, index, 10_000 + index)),
  ];
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
      { modelKey: models[0].modelKey, selectedRouteId: priceChecks[0][0]?.routeId ?? null, checks: priceChecks[0] },
      { modelKey: models[1].modelKey, selectedRouteId: priceChecks[1][0]?.routeId ?? null, checks: priceChecks[1] },
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

  it('keeps opposing supported score evidence when a verified price reserves a dense-summary slot', () => {
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
        'Across compatible supported BenchLM categories, Alpha has higher scores in Coding, Knowledge, and Multimodal; Beta has a higher score in Reasoning.',
        'Input API price: Alpha has the lower verified rate ($1 / 1M tokens vs $2 / 1M tokens).',
        'Output API price: Beta has the lower verified rate ($3 / 1M tokens vs $4 / 1M tokens).',
        'Context window: Alpha has the larger published context window (128,000 tokens vs 64,000 tokens).',
      ],
    });
  });

  it('keeps balanced supported category leads compact and model-specific', () => {
    const models = pair();
    const summary = comparisonSummary(comparisonWith(
      models,
      [
        sharedRow(models[0], models[1], 'reasoning', 80, 83),
        sharedRow(models[0], models[1], 'coding', 91, 87),
        sharedRow(models[0], models[1], 'multimodal', 76, 70),
        sharedRow(models[0], models[1], 'knowledge', 68, 72),
      ],
      [
        [price(models[0], 1, 4)],
        [price(models[1], 2, 3)],
      ],
    ));

    expect(summary.sentences).toEqual([
      'Across compatible supported BenchLM categories, Alpha has higher scores in Coding and Multimodal; Beta has higher scores in Knowledge and Reasoning.',
      'Input API price: Alpha has the lower verified rate ($1 / 1M tokens vs $2 / 1M tokens).',
      'Output API price: Beta has the lower verified rate ($3 / 1M tokens vs $4 / 1M tokens).',
    ]);
  });

  it('lists every supported category deterministically when many score claims exceed the cap', () => {
    const models = pair();
    const summary = comparisonSummary(comparisonWith(models, [
      sharedRow(models[0], models[1], 'vision', 78, 75),
      sharedRow(models[0], models[1], 'agentic', 73, 76),
      sharedRow(models[0], models[1], 'coding', 91, 87),
      sharedRow(models[0], models[1], 'reasoning', 80, 83),
      sharedRow(models[0], models[1], 'knowledge', 68, 72),
      sharedRow(models[0], models[1], 'multimodal', 76, 70),
    ]));

    expect(summary.sentences).toEqual([
      'Across compatible supported BenchLM categories, Alpha has higher scores in Coding, Multimodal, and Vision; Beta has higher scores in Agentic, Knowledge, and Reasoning.',
    ]);
  });

  it('keeps compact labels intact at the exact 32-byte boundary', () => {
    const alphaName = 'A'.repeat(COMPACT_LABEL_BYTE_CAP);
    const betaName = 'B'.repeat(COMPACT_LABEL_BYTE_CAP);
    const models = [model('provider:alpha', alphaName), model('provider:beta', betaName)] as const;
    const alphaCategories = [
      `${'C'.repeat(31)}1`,
      `${'C'.repeat(31)}2`,
      `${'C'.repeat(31)}3`,
      `${'C'.repeat(31)}4`,
    ];
    const betaCategories = [
      `${'D'.repeat(31)}1`,
      `${'D'.repeat(31)}2`,
      `${'D'.repeat(31)}3`,
      `${'D'.repeat(31)}4`,
    ];

    const [claim] = comparisonSummary(comparisonWith(models, supportedScoreLeadRows(models, alphaCategories, betaCategories))).sentences;

    expect(claim).toBe(`Across compatible supported BenchLM categories, ${alphaName} has higher scores in ${alphaCategories[0]}, ${alphaCategories[1]}, and ${alphaCategories[2]} (and 1 more category); ${betaName} has higher scores in ${betaCategories[0]}, ${betaCategories[1]}, and ${betaCategories[2]} (and 1 more category).`);
    expect(claim).not.toContain('…');
    expect(utf8ByteLength(claim!)).toBeLessThanOrEqual(COMPACT_CLAIM_BYTE_CAP);
  });

  it('truncates compact model and category labels one byte beyond the UTF-8 boundary', () => {
    const alphaName = `A${'x'.repeat(COMPACT_LABEL_BYTE_CAP)}`;
    const betaName = `B${'y'.repeat(COMPACT_LABEL_BYTE_CAP)}`;
    const models = [model('provider:alpha', alphaName), model('provider:beta', betaName)] as const;
    const alphaCategories = [
      `A1${'x'.repeat(31)}`,
      `A2${'x'.repeat(31)}`,
      `A3${'x'.repeat(31)}`,
    ];
    const betaCategories = [
      `B1${'y'.repeat(31)}`,
      `B2${'y'.repeat(31)}`,
      `B3${'y'.repeat(31)}`,
    ];
    const compactAlphaName = `A${'x'.repeat(28)}…`;
    const compactBetaName = `B${'y'.repeat(28)}…`;
    const compactAlphaCategories = [`A1${'x'.repeat(27)}…`, `A2${'x'.repeat(27)}…`, `A3${'x'.repeat(27)}…`];
    const compactBetaCategories = [`B1${'y'.repeat(27)}…`, `B2${'y'.repeat(27)}…`, `B3${'y'.repeat(27)}…`];

    const [claim] = comparisonSummary(comparisonWith(models, supportedScoreLeadRows(models, alphaCategories, betaCategories))).sentences;

    expect(claim).toBe(`Across compatible supported BenchLM categories, ${compactAlphaName} has higher scores in ${compactAlphaCategories[0]}, ${compactAlphaCategories[1]}, and ${compactAlphaCategories[2]}; ${compactBetaName} has higher scores in ${compactBetaCategories[0]}, ${compactBetaCategories[1]}, and ${compactBetaCategories[2]}.`);
    expect(utf8ByteLength(claim!)).toBeLessThanOrEqual(COMPACT_CLAIM_BYTE_CAP);
  });

  it('sanitizes control whitespace and truncates Unicode labels without splitting UTF-8', () => {
    const models = pair();
    const unicodeCategory = `alpha\u0000\n${'🧠'.repeat(9)}`;
    const rows = supportedScoreLeadRows(models, [unicodeCategory, 'alpha-secondary', 'alpha-third'], ['beta-one', 'beta-two']);

    const [claim] = comparisonSummary(comparisonWith(models, rows)).sentences;
    const compactUnicodeLabel = `Alpha ${'🧠'.repeat(5)}…`;

    expect(claim).toContain(compactUnicodeLabel);
    expect(claim).not.toContain('\u0000');
    expect(claim).not.toContain('\n');
    expect(new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(claim))).toBe(claim);
    expect(utf8ByteLength(claim!)).toBeLessThanOrEqual(COMPACT_CLAIM_BYTE_CAP);
  });

  it('bounds 1,023 supported category leads while retaining operational evidence slots', () => {
    const models = pair({ contextWindowTokens: 128_000 }, { contextWindowTokens: 64_000 });
    const alphaCategories = Array.from({ length: 512 }, (_, index) => `alpha-${String(index).padStart(4, '0')}-${'x'.repeat(40)}`);
    const betaCategories = Array.from({ length: 511 }, (_, index) => `beta-${String(index).padStart(4, '0')}-${'y'.repeat(40)}`);
    const summary = comparisonSummary(comparisonWith(
      models,
      supportedScoreLeadRows(models, alphaCategories, betaCategories),
      [[price(models[0], 1, 4)], [price(models[1], 2, 3)]],
    ));

    expect(summary.sentences).toEqual([
      `Across compatible supported BenchLM categories, Alpha has higher scores in Alpha 0000 X${'x'.repeat(17)}…, Alpha 0001 X${'x'.repeat(17)}…, and Alpha 0002 X${'x'.repeat(17)}… (and 509 more categories); Beta has higher scores in Beta 0000 Y${'y'.repeat(18)}…, Beta 0001 Y${'y'.repeat(18)}…, and Beta 0002 Y${'y'.repeat(18)}… (and 508 more categories).`,
      'Input API price: Alpha has the lower verified rate ($1 / 1M tokens vs $2 / 1M tokens).',
      'Output API price: Beta has the lower verified rate ($3 / 1M tokens vs $4 / 1M tokens).',
      'Context window: Alpha has the larger published context window (128,000 tokens vs 64,000 tokens).',
    ]);
    expect(utf8ByteLength(summary.sentences[0]!)).toBeLessThanOrEqual(COMPACT_CLAIM_BYTE_CAP);
    expect(summary.sentences.join(' ')).not.toMatch(/wins|best model|universal winner/i);
  });

  it('sanitizes ordinary supported score labels at Unicode byte boundaries', () => {
    const alphaName = `A\u0000${'界'.repeat(11)}`;
    const models = [model('provider:alpha', alphaName), model('provider:beta', 'Beta')] as const;
    const category = `c\u0007${'🧠'.repeat(9)}`;
    const compactAlphaName = `A ${'界'.repeat(9)}…`;
    const compactCategory = `C ${'🧠'.repeat(6)}…`;
    const summary = comparisonSummary(comparisonWith(models, [sharedRow(models[0], models[1], category, 90, 80)]));

    expect(utf8ByteLength(compactAlphaName)).toBe(COMPACT_LABEL_BYTE_CAP);
    expect(summary.sentences).toEqual([
      `On ${compactCategory}, ${compactAlphaName} has a higher supported BenchLM score (90 vs 80).`,
      'Only 1 compatible shared BenchLM metric is available, so the score evidence is limited.',
    ]);
    expectSafeSummarySentences(summary.sentences);
  });

  it('removes bidi and format controls from ordinary score labels without changing summary copy', () => {
    const alphaName = 'Alpha🧠e\u0301\u202E\u2066\u2069\u200B';
    const models = [model('provider:alpha', alphaName), model('provider:beta', 'Beta')] as const;
    const category = 'coding\u202E\u2066\u2069\u200B';
    const summary = comparisonSummary(comparisonWith(models, [sharedRow(models[0], models[1], category, 90, 80)]));

    expect(summary.sentences).toEqual([
      'On Coding, Alpha🧠é has a higher supported BenchLM score (90 vs 80).',
      'Only 1 compatible shared BenchLM metric is available, so the score evidence is limited.',
    ]);
    expectSafeSummarySentences(summary.sentences);
  });

  it('removes bidi and format controls from compact score labels without changing summary copy', () => {
    const models = [
      model('provider:alpha', 'Alpha\u202E\u2066\u2069\u200B'),
      model('provider:beta', 'Beta\u202E\u2067\u2069\u200C'),
    ] as const;
    const summary = comparisonSummary(comparisonWith(models, supportedScoreLeadRows(
      models,
      ['alpha-a\u202E', 'alpha-b\u2066', 'alpha-c\u200B', 'alpha-d\u2069'],
      ['beta-a\u202E', 'beta-b\u2067', 'beta-c\u200C', 'beta-d\u2069'],
    )));

    expect(summary.sentences).toEqual([
      'Across compatible supported BenchLM categories, Alpha has higher scores in Alpha A, Alpha B, and Alpha C (and 1 more category); Beta has higher scores in Beta A, Beta B, and Beta C (and 1 more category).',
    ]);
    expectSafeSummarySentences(summary.sentences);
  });

  it('removes bidi and format controls from tied price and context labels without changing summary copy', () => {
    const models = [
      model('provider:alpha', 'Alpha🧠e\u0301\u202E\u2066\u2069\u200B', { contextWindowTokens: 256_000 }),
      model('provider:beta', 'Beta🐙n\u0303\u202E\u2067\u2069\u200C', { contextWindowTokens: 128_000 }),
    ] as const;
    const summary = comparisonSummary(comparisonWith(models, [
      sharedRow(models[0], models[1], 'coding', 90, 90),
      sharedRow(models[0], models[1], 'knowledge', 80, 80),
      sharedRow(models[0], models[1], 'multimodal', 70, 70),
      sharedRow(models[0], models[1], 'reasoning', 85, 85),
    ], [[price(models[0], 1, 4)], [price(models[1], 2, 3)]]));

    expect(summary.sentences).toEqual([
      'The compatible supported BenchLM scores are tied across 4 shared metrics.',
      'Input API price: Alpha🧠é has the lower verified rate ($1 / 1M tokens vs $2 / 1M tokens).',
      'Output API price: Beta🐙ñ has the lower verified rate ($3 / 1M tokens vs $4 / 1M tokens).',
      'Context window: Alpha🧠é has the larger published context window (256,000 tokens vs 128,000 tokens).',
    ]);
    expectSafeSummarySentences(summary.sentences);
  });

  it('sanitizes bounded model labels in tied score pricing and context sentences', () => {
    const alphaName = `Alpha\u0000${'x'.repeat(40)}`;
    const betaName = `Beta\u0007${'y'.repeat(40)}`;
    const models = [
      model('provider:alpha', alphaName, { contextWindowTokens: 256_000 }),
      model('provider:beta', betaName, { contextWindowTokens: 128_000 }),
    ] as const;
    const compactAlphaName = `Alpha ${'x'.repeat(23)}…`;
    const compactBetaName = `Beta ${'y'.repeat(24)}…`;
    const summary = comparisonSummary(comparisonWith(models, [
      sharedRow(models[0], models[1], 'coding', 90, 90),
      sharedRow(models[0], models[1], 'knowledge', 80, 80),
      sharedRow(models[0], models[1], 'multimodal', 70, 70),
      sharedRow(models[0], models[1], 'reasoning', 85, 85),
    ], [[price(models[0], 1, 4)], [price(models[1], 2, 3)]]));

    expect(summary.sentences).toEqual([
      'The compatible supported BenchLM scores are tied across 4 shared metrics.',
      `Input API price: ${compactAlphaName} has the lower verified rate ($1 / 1M tokens vs $2 / 1M tokens).`,
      `Output API price: ${compactBetaName} has the lower verified rate ($3 / 1M tokens vs $4 / 1M tokens).`,
      `Context window: ${compactAlphaName} has the larger published context window (256,000 tokens vs 128,000 tokens).`,
    ]);
    expectSafeSummarySentences(summary.sentences);
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

  it('suppresses a score advantage when the displayed values round to the same string', () => {
    const models = pair();
    const summary = comparisonSummary(comparisonWith(
      models,
      [sharedRow(models[0], models[1], 'coding', 80.0001, 80.0002)],
    ));

    expect(summary.sentences).toEqual([
      'Only 1 compatible shared BenchLM metric is available, so the score evidence is limited.',
    ]);
  });

  it('does not describe four rounding-equal score pairs as exact ties', () => {
    const models = pair();
    const summary = comparisonSummary(comparisonWith(models, [
      sharedRow(models[0], models[1], 'coding', 80.0001, 80.0002),
      sharedRow(models[0], models[1], 'knowledge', 81.0001, 81.0002),
      sharedRow(models[0], models[1], 'multimodal', 82.0001, 82.0002),
      sharedRow(models[0], models[1], 'reasoning', 83.0001, 83.0002),
    ]));

    expect(summary.coverage).toBe('strong');
    expect(summary.sentences.join(' ')).not.toMatch(/higher supported BenchLM score|scores are tied/i);
  });

  it('treats signed-zero scores as equal without an advantage sentence', () => {
    const models = pair();
    const summary = comparisonSummary(comparisonWith(models, [
      sharedRow(models[0], models[1], 'coding', -0, 0),
      sharedRow(models[0], models[1], 'knowledge', 81, 81),
      sharedRow(models[0], models[1], 'multimodal', 82, 82),
      sharedRow(models[0], models[1], 'reasoning', 83, 83),
    ]));

    expect(summary.sentences).toEqual([
      'The compatible supported BenchLM scores are tied across 4 shared metrics.',
    ]);
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

  it('suppresses a rate advantage when the displayed rates round to the same string', () => {
    const models = pair();
    const summary = comparisonSummary(comparisonWith(models, [], [
      [price(models[0], 1.00001, 3)],
      [price(models[1], 1.00002, 3)],
    ]));

    expect(summary.sentences).toEqual([
      'There is not enough shared evidence to make a supported BenchLM score comparison.',
    ]);
  });

  it('treats signed-zero rates as equal without an advantage sentence', () => {
    const models = pair();
    const summary = comparisonSummary(comparisonWith(models, [], [
      [price(models[0], -0, 3)],
      [price(models[1], 0, 3)],
    ]));

    expect(summary.sentences).toEqual([
      'There is not enough shared evidence to make a supported BenchLM score comparison.',
    ]);
  });

  it('honors the published route instead of recalculating a lower-priced route', () => {
    const models = pair();
    const summary = comparisonSummary(comparisonWith(models, [], [
      [
        price(models[0], 10, 10, { providerId: 'a-provider', routeId: 'openrouter:alpha-expensive' }),
        price(models[0], 1, 1, { providerId: 'z-provider', routeId: 'openrouter:alpha-inexpensive' }),
      ],
      [price(models[1], 2, 2)],
    ]));

    expect(summary.sentences).toEqual([
      'Input API price: Beta has the lower verified rate ($2 / 1M tokens vs $10 / 1M tokens).',
      'Output API price: Beta has the lower verified rate ($2 / 1M tokens vs $10 / 1M tokens).',
      'There is not enough shared evidence to make a supported BenchLM score comparison.',
    ]);
  });

  it('uses the published selected direct route while preserving a missing rate', () => {
    const models = pair();
    const direct = price(models[0], 0.5, null, {
      sourceId: 'benchlm',
      providerId: 'alpha-direct',
      routeId: 'direct:alpha',
      sourceArtifactId: 'benchlm-pricing',
    });
    const router = price(models[0], 10, 10);
    const beta = price(models[1], 2, 3);
    const base = comparisonWith(models, [], [[router, direct], [beta]]);
    const summary = comparisonSummary({
      ...base,
      priceChecks: [
        { ...base.priceChecks[0], selectedRouteId: direct.routeId },
        base.priceChecks[1],
      ],
    });

    expect(summary.sentences).toEqual([
      'Input API price: Alpha has the lower verified rate ($0.5 / 1M tokens vs $2 / 1M tokens).',
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
