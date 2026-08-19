import { describe, expect, it } from 'vitest';
import type { BenchmarkMetric, BenchmarkModel, BenchmarkPriceCheck } from './contracts';
import {
  buildLeaderboard,
  LEADERBOARD_DEFINITIONS,
  sortLeaderboardEntries,
} from './leaderboards';
import { LEADERBOARD_ROUTES } from '../routing/leaderboard-routes';

function model(overrides: Partial<BenchmarkModel> = {}): BenchmarkModel {
  return {
    modelKey: 'model-a',
    slug: 'model-a',
    name: 'Model A',
    creator: 'Example',
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
    sourceArtifactId: 'models',
    ...overrides,
  };
}

function metric(overrides: Partial<BenchmarkMetric> = {}): BenchmarkMetric {
  return {
    modelKey: 'model-a',
    metricKey: 'benchlm:overall:raw',
    category: 'overall',
    value: 80,
    rawValue: null,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    sourceUpdatedAt: '2026-08-05T00:00:00.000Z',
    sourceModelId: 'model-a',
    sourceArtifactId: 'models',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
    ...overrides,
  };
}

function price(overrides: Partial<BenchmarkPriceCheck> = {}): BenchmarkPriceCheck {
  return {
    modelKey: 'model-a',
    sourceId: 'openrouter',
    providerId: 'openrouter',
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: 5,
    contextWindowTokens: 128_000,
    verificationStatus: 'primary',
    routeId: 'openrouter:model-a',
    sourceModelId: 'model-a',
    canonicalSlug: 'model-a',
    maxInputTokens: null,
    maxOutputTokens: null,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: null,
    sourceArtifactId: 'catalog-models',
    ...overrides,
  };
}

describe('frozen v1 leaderboard definitions', () => {
  it('builds a value frontier from same-source BenchLM pricing', () => {
    const cheap = model({ modelKey: 'source:benchlm:cheap', slug: 'cheap', sourceModelId: 'cheap' });
    const pricey = model({ modelKey: 'source:benchlm:pricey', slug: 'pricey', sourceModelId: 'pricey' });
    const metrics = [
      metric({ modelKey: cheap.modelKey, metricKey: 'benchlm:overall:raw', value: 70, rank: 2, sourceModelId: 'cheap' }),
      metric({ modelKey: pricey.modelKey, metricKey: 'benchlm:overall:raw', value: 90, rank: 1, sourceModelId: 'pricey' }),
    ];
    const prices = [
      price({ modelKey: cheap.modelKey, sourceId: 'benchlm', providerId: 'anthropic', routeId: 'benchlm:cheap', sourceModelId: 'cheap', sourceArtifactId: 'pricing', inputUsdPerMillion: 1, outputUsdPerMillion: 1 }),
      price({ modelKey: pricey.modelKey, sourceId: 'benchlm', providerId: 'anthropic', routeId: 'benchlm:pricey', sourceModelId: 'pricey', sourceArtifactId: 'pricing', inputUsdPerMillion: 10, outputUsdPerMillion: 50 }),
    ];

    const result = buildLeaderboard('llm-value', [cheap, pricey], metrics, prices, 'balanced');

    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((entry) => entry.primaryPrice !== null)).toBe(true);
    expect(result.entries.filter((entry) => entry.onValueFrontier)).toHaveLength(2);
  });

  it('carries same-source price evidence onto a score leaderboard row', () => {
    const alpha = model({ modelKey: 'source:benchlm:alpha', slug: 'alpha', sourceModelId: 'alpha' });
    const metrics = [metric({ modelKey: alpha.modelKey, metricKey: 'benchlm:category:coding', category: 'coding', value: 80, rank: 1, sourceModelId: 'alpha' })];
    const prices = [price({ modelKey: alpha.modelKey, sourceId: 'benchlm', providerId: 'anthropic', routeId: 'benchlm:alpha', sourceModelId: 'alpha', sourceArtifactId: 'pricing', inputUsdPerMillion: 2, outputUsdPerMillion: 6 })];

    const result = buildLeaderboard('llm-coding', [alpha], metrics, prices, 'balanced');

    expect(result.entries[0].primaryPrice?.routeId).toBe('benchlm:alpha');
    expect(result.entries[0].blendedCostPerMillion).toBe(4);
  });

  it('defines every generated leaderboard route with only exact approved metric keys', () => {
    expect(Object.keys(LEADERBOARD_DEFINITIONS).sort()).toEqual(Object.keys(LEADERBOARD_ROUTES).sort());
    expect(LEADERBOARD_DEFINITIONS).toMatchObject({
      'llm-overall': { metricKeys: ['benchlm:overall:raw'], defaultSort: 'score-desc' },
      'llm-coding': { metricKeys: ['benchlm:category:coding'], defaultSort: 'score-desc' },
      'llm-agentic': { metricKeys: ['benchlm:category:agentic'], defaultSort: 'score-desc' },
      'llm-reasoning': { metricKeys: ['benchlm:category:reasoning'], defaultSort: 'score-desc' },
      'llm-knowledge': { metricKeys: ['benchlm:category:knowledge'], defaultSort: 'score-desc' },
      'llm-human-preference': { metricKeys: ['lmarena:text_style_control:overall'], defaultSort: 'rank-asc' },
      'llm-value': { metricKeys: ['benchlm:overall:raw'], defaultSort: 'pareto-score-desc' },
      'llm-pricing-context': { sourceId: 'openrouter', defaultSort: 'price-asc', userSortable: true },
      'multimodal-vision-documents': {
        metricKeys: [
          'benchlm:category:multimodalGrounded',
          'lmarena:vision_style_control:overall',
          'lmarena:document_style_control:overall',
        ],
      },
      'media-text-to-image': { metricKeys: ['lmarena:text_to_image:overall'], defaultSort: 'rank-asc' },
      'media-image-editing': { metricKeys: ['lmarena:image_edit:overall'], defaultSort: 'rank-asc' },
      'media-text-to-video': { metricKeys: ['lmarena:text_to_video:overall'], defaultSort: 'rank-asc' },
      'media-image-to-video': { metricKeys: ['lmarena:image_to_video:overall'], defaultSort: 'rank-asc' },
      'media-video-editing': { metricKeys: ['lmarena:video_edit:overall'], defaultSort: 'rank-asc' },
    });
  });
});

describe('Reasoning and Knowledge evidence lenses', () => {
  it.each([
    ['llm-reasoning', 'benchlm:category:reasoning', 'reasoning', 'benchlm:category:knowledge', 'knowledge'],
    ['llm-knowledge', 'benchlm:category:knowledge', 'knowledge', 'benchlm:category:reasoning', 'reasoning'],
  ] as const)('maps %s to only its reviewed category metric', (key, metricKey, category, otherMetricKey, otherCategory) => {
    const alpha = model({ modelKey: 'alpha', slug: 'alpha' });
    const zeta = model({ modelKey: 'zeta', slug: 'zeta' });
    const estimated = model({ modelKey: 'estimated', slug: 'estimated', evidenceStatus: 'estimated' });
    const wrongLens = model({ modelKey: 'wrong-lens', slug: 'wrong-lens' });

    expect(LEADERBOARD_DEFINITIONS[key].metricKeys).toEqual([metricKey]);

    const result = buildLeaderboard(key, [wrongLens, zeta, estimated, alpha], [
      metric({ modelKey: 'zeta', sourceModelId: 'zeta', metricKey, category, value: 90 }),
      metric({ modelKey: 'alpha', sourceModelId: 'alpha', metricKey, category, value: 90 }),
      metric({ modelKey: 'estimated', sourceModelId: 'estimated', metricKey, category, value: 100 }),
      metric({ modelKey: 'wrong-lens', sourceModelId: 'wrong-lens', metricKey: otherMetricKey, category: otherCategory, value: 101 }),
    ], [], 'balanced');

    expect(result.entries.map((entry) => entry.model.slug)).toEqual(['alpha', 'zeta']);
    expect(result.entries.every((entry) => entry.metric?.metricKey === metricKey)).toBe(true);
  });

  it('keeps a published-but-absent Knowledge lens explicitly empty', () => {
    const result = buildLeaderboard('llm-knowledge', [model()], [
      metric({ metricKey: 'benchlm:category:reasoning', category: 'reasoning' }),
    ], [], 'balanced');

    expect(result.entries).toEqual([]);
  });

  it('keeps published non-rankable Reasoning evidence visible without inventing a source rank', () => {
    const reasoning = metric({
      metricKey: 'benchlm:category:reasoning',
      category: 'reasoning',
      value: 86.5,
      rankingEligible: false,
      rank: null,
    });

    const result = buildLeaderboard('llm-reasoning', [model()], [reasoning], [], 'balanced');

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ metric: reasoning, sourceRank: null, onValueFrontier: false });
  });
});

describe('buildLeaderboard', () => {
  it('materializes a complete verified 50/50 representative price without changing BenchLM score order', () => {
    const alpha = model({ modelKey: 'alpha', slug: 'alpha' });
    const beta = model({ modelKey: 'beta', slug: 'beta' });
    const result = buildLeaderboard('llm-overall', [alpha, beta], [
      metric({ modelKey: 'alpha', sourceModelId: 'alpha', value: 80 }),
      metric({ modelKey: 'beta', sourceModelId: 'beta', value: 90 }),
    ], [
      price({ modelKey: 'alpha', sourceModelId: 'alpha', canonicalSlug: 'alpha', inputUsdPerMillion: 0, outputUsdPerMillion: 4 }),
      price({ modelKey: 'beta', sourceModelId: 'beta', canonicalSlug: 'beta', inputUsdPerMillion: 1, outputUsdPerMillion: 5 }),
    ], 'inputHeavy');

    expect(result.entries.map((entry) => entry.model.slug)).toEqual(['beta', 'alpha']);
    expect(result.entries.map((entry) => entry.blendedCostPerMillion)).toEqual([3, 2]);
    expect(result.entries.every((entry) => entry.primaryPrice?.verificationStatus === 'primary')).toBe(true);
  });

  it('materializes the same fixed representative price for an exact LMArena row', () => {
    const arena = model({
      modelKey: 'lmarena:arena',
      slug: 'arena',
      sourceId: 'lmarena',
      sourceModelId: 'arena',
      evidenceStatus: 'source_only',
    });
    const arenaMetric = metric({
      modelKey: arena.modelKey,
      sourceModelId: arena.sourceModelId,
      metricKey: 'lmarena:text_style_control:overall',
      sourceId: 'lmarena',
      sourceArtifactId: 'lmarena-text-style',
      methodology: 'bradley_terry',
      unit: 'arena_score',
      rank: 1,
      value: 1_200,
    });
    const result = buildLeaderboard('llm-human-preference', [arena], [arenaMetric], [
      price({ modelKey: arena.modelKey, sourceModelId: arena.modelKey, canonicalSlug: arena.slug, inputUsdPerMillion: 2, outputUsdPerMillion: 8 }),
    ], 'balanced');

    expect(result.entries[0]).toMatchObject({
      sourceRank: 1,
      blendedCostPerMillion: 5,
      primaryPrice: { modelKey: arena.modelKey, verificationStatus: 'primary' },
    });
  });

  it('keeps an otherwise eligible row but omits representative pricing when either rate is missing', () => {
    const result = buildLeaderboard('llm-overall', [model()], [metric()], [
      price({ outputUsdPerMillion: null }),
    ], 'balanced');

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ primaryPrice: null, blendedCostPerMillion: null });
  });

  it('requires supported BenchLM models and an exact ranking-eligible safe metric', () => {
    const categoryOnly = model({ modelKey: 'category-only', slug: 'category-only', rankingEligible: false });
    const estimated = model({ modelKey: 'estimated', slug: 'estimated', evidenceStatus: 'estimated' });
    const result = buildLeaderboard('llm-coding', [categoryOnly, estimated], [
      metric({ modelKey: 'category-only', sourceModelId: 'category-only', metricKey: 'benchlm:category:coding', category: 'coding', value: 91, rank: 1 }),
      metric({ modelKey: 'estimated', sourceModelId: 'estimated', metricKey: 'benchlm:category:coding', category: 'coding', value: 99 }),
      metric({ modelKey: 'category-only', sourceModelId: 'category-only', metricKey: 'benchlm:category:coding-unreviewed', category: 'coding', value: 100 }),
      metric({ modelKey: 'category-only', sourceModelId: 'category-only', metricKey: 'benchlm:category:coding', category: 'coding', sourceId: 'lmarena', methodology: 'bradley_terry', value: 100 }),
      metric({ modelKey: 'category-only-typo', sourceModelId: 'category-only-typo', metricKey: 'benchlm:category:coding', category: 'coding', value: 100 }),
    ], [], 'balanced');

    expect(result.entries.map((entry) => entry.model.slug)).toEqual(['category-only']);
    // The published BenchLM category rank is preserved, not synthesized.
    expect(result.entries[0]).toMatchObject({ blendedCostPerMillion: null, sourceRank: 1 });
  });

  it('rejects non-score units from BenchLM routes and the BenchLM multimodal lens', () => {
    const bench = model({ modelKey: 'bench', slug: 'bench' });
    const wrongUnitOverall = metric({ modelKey: 'bench', sourceModelId: 'bench', unit: 'arena_score' });
    const wrongUnitMultimodal = metric({
      modelKey: 'bench',
      sourceModelId: 'bench',
      metricKey: 'benchlm:category:multimodalGrounded',
      category: 'multimodalGrounded',
      unit: 'arena_score',
    });

    expect(buildLeaderboard('llm-overall', [bench], [wrongUnitOverall], [], 'balanced').entries).toEqual([]);
    expect(buildLeaderboard('multimodal-vision-documents', [bench], [wrongUnitMultimodal], [], 'balanced').entries)
      .toEqual([]);
  });

  it('requires the model-level overall eligibility for overall and value views only', () => {
    const categoryOnly = model({ modelKey: 'category-only', slug: 'category-only', rankingEligible: false });
    const metrics = [metric({ modelKey: 'category-only', sourceModelId: 'category-only', value: 90 })];
    const prices = [price({ modelKey: 'category-only', routeId: 'openrouter:category-only' })];

    expect(buildLeaderboard('llm-overall', [categoryOnly], metrics, prices, 'balanced').entries).toEqual([]);
    expect(buildLeaderboard('llm-value', [categoryOnly], metrics, prices, 'balanced').entries).toEqual([]);
    expect(buildLeaderboard('llm-coding', [categoryOnly], [metric({
      modelKey: 'category-only',
      sourceModelId: 'category-only',
      metricKey: 'benchlm:category:coding',
      category: 'coding',
      value: 90,
    })], prices, 'balanced').entries).toHaveLength(1);
  });

  it('allows an exact LMArena source-only model only in its matching subset and orders tied ranks by slug', () => {
    const alpha = model({ modelKey: 'source:lmarena:alpha', slug: 'alpha', sourceId: 'lmarena', evidenceStatus: 'source_only', rankingEligible: true });
    const zeta = model({ modelKey: 'source:lmarena:zeta', slug: 'zeta', sourceId: 'lmarena', evidenceStatus: 'source_only', rankingEligible: true });
    const otherSource = model({ modelKey: 'source:benchlm:other', slug: 'other', sourceId: 'benchlm', evidenceStatus: 'source_only' });
    const arenaMetric = (modelKey: string, metricKey: string, rank: number) => metric({
      modelKey,
      sourceModelId: modelKey,
      metricKey,
      category: 'overall',
      sourceId: 'lmarena',
      methodology: 'bradley_terry',
      unit: 'arena_score',
      rank,
      value: 1_200,
      sourceArtifactId: 'text-style-page',
    });
    const result = buildLeaderboard('llm-human-preference', [zeta, alpha, otherSource], [
      arenaMetric(alpha.modelKey, 'lmarena:text_style_control:overall', 1),
      arenaMetric(zeta.modelKey, 'lmarena:text_style_control:overall', 1),
      arenaMetric(otherSource.modelKey, 'lmarena:text_style_control:overall', 1),
      arenaMetric(alpha.modelKey, 'lmarena:image_edit:overall', 1),
    ], [], 'balanced');

    expect(result.entries.map((entry) => entry.model.slug)).toEqual(['alpha', 'zeta']);
    expect(result.entries.map((entry) => entry.sourceRank)).toEqual([1, 1]);
  });

  it('rejects non-arena-score units from LMArena routes and multimodal lenses', () => {
    const arena = model({
      modelKey: 'source:lmarena:arena',
      slug: 'arena',
      sourceId: 'lmarena',
      evidenceStatus: 'source_only',
    });
    const wrongUnit = (metricKey: string) => metric({
      modelKey: arena.modelKey,
      sourceModelId: arena.sourceModelId,
      metricKey,
      sourceId: 'lmarena',
      methodology: 'bradley_terry',
      unit: 'score',
      rank: 1,
      value: 1_200,
    });

    expect(buildLeaderboard(
      'llm-human-preference',
      [arena],
      [wrongUnit('lmarena:text_style_control:overall')],
      [],
      'balanced',
    ).entries).toEqual([]);
    expect(buildLeaderboard(
      'multimodal-vision-documents',
      [arena],
      [wrongUnit('lmarena:vision_style_control:overall')],
      [],
      'balanced',
    ).entries).toEqual([]);
  });

  it('keeps a supported capability row when price is unavailable but excludes it from the value frontier', () => {
    const models = [model()];
    const metrics = [metric()];

    expect(buildLeaderboard('llm-overall', models, metrics, [], 'balanced').entries).toHaveLength(1);
    expect(buildLeaderboard('llm-value', models, metrics, [], 'balanced').entries).toEqual([]);
  });

  it('marks Pareto membership transparently and orders value candidates by frontier, score, then slug', () => {
    const alpha = model({ modelKey: 'alpha', slug: 'alpha' });
    const zeta = model({ modelKey: 'zeta', slug: 'zeta' });
    const economical = model({ modelKey: 'economical', slug: 'economical' });
    const dominated = model({ modelKey: 'dominated', slug: 'dominated' });
    const models = [zeta, dominated, economical, alpha];
    const metrics = [
      metric({ modelKey: 'alpha', sourceModelId: 'alpha', value: 90 }),
      metric({ modelKey: 'zeta', sourceModelId: 'zeta', value: 90 }),
      metric({ modelKey: 'economical', sourceModelId: 'economical', value: 80 }),
      metric({ modelKey: 'dominated', sourceModelId: 'dominated', value: 79 }),
    ];
    const prices = [
      price({ modelKey: 'alpha', routeId: 'openrouter:alpha', inputUsdPerMillion: 2, outputUsdPerMillion: 2 }),
      price({ modelKey: 'zeta', routeId: 'openrouter:zeta', inputUsdPerMillion: 2, outputUsdPerMillion: 2 }),
      price({ modelKey: 'economical', routeId: 'openrouter:economical', inputUsdPerMillion: 1, outputUsdPerMillion: 1 }),
      price({ modelKey: 'dominated', routeId: 'openrouter:dominated', inputUsdPerMillion: 3, outputUsdPerMillion: 3 }),
    ];
    const result = buildLeaderboard('llm-value', models, metrics, prices, 'balanced');

    expect(result.entries.map((entry) => [entry.model.slug, entry.onValueFrontier]))
      .toEqual([['alpha', true], ['zeta', true], ['economical', true], ['dominated', false]]);
  });

  it('accepts explicit finite zero pricing and keeps pricing context user-sortable', () => {
    const priced = model({ modelKey: 'priced', slug: 'priced' });
    const zero = model({ modelKey: 'zero', slug: 'zero' });
    const result = buildLeaderboard('llm-pricing-context', [zero, priced], [], [
      price({ modelKey: 'priced', routeId: 'openrouter:priced', inputUsdPerMillion: 1, outputUsdPerMillion: 1, contextWindowTokens: 64_000 }),
      price({ modelKey: 'zero', routeId: 'openrouter:zero', inputUsdPerMillion: 0, outputUsdPerMillion: 0, contextWindowTokens: 256_000 }),
    ], 'balanced');

    expect(result.entries.map((entry) => [entry.model.slug, entry.blendedCostPerMillion, entry.contextWindowTokens]))
      .toEqual([['zero', 0, 256_000], ['priced', 1, 64_000]]);
    expect(sortLeaderboardEntries(result.entries, 'context-desc').map((entry) => entry.model.slug))
      .toEqual(['zero', 'priced']);
  });

  it.each([
    ['null input', null, 1],
    ['null output', 1, null],
    ['negative input', -1, 1],
    ['negative output', 1, -1],
    ['NaN input', Number.NaN, 1],
    ['NaN output', 1, Number.NaN],
    ['infinite input', Number.POSITIVE_INFINITY, 1],
    ['infinite output', 1, Number.POSITIVE_INFINITY],
  ] as const)('excludes a primary pricing-context route with %s money', (_label, input, output) => {
    const malformed = price({ inputUsdPerMillion: input, outputUsdPerMillion: output });

    expect(buildLeaderboard('llm-pricing-context', [model()], [], [malformed], 'balanced').entries).toEqual([]);
  });

  it('preserves a missing route context instead of substituting a different source value', () => {
    const result = buildLeaderboard('llm-pricing-context', [model({ contextWindowTokens: 128_000 })], [], [
      price({ contextWindowTokens: null }),
    ], 'balanced');

    expect(result.entries[0]).toMatchObject({ contextWindowTokens: null });
  });

  it('keeps multimodal lenses separate instead of treating unrelated Arena metrics as a combined score', () => {
    const bench = model({ modelKey: 'bench', slug: 'bench', sourceId: 'benchlm' });
    const vision = model({ modelKey: 'source:lmarena:vision', slug: 'vision', sourceId: 'lmarena', evidenceStatus: 'source_only' });
    const agent = model({ modelKey: 'source:lmarena:agent', slug: 'agent', sourceId: 'lmarena', evidenceStatus: 'source_only' });
    const result = buildLeaderboard('multimodal-vision-documents', [agent, vision, bench], [
      metric({ modelKey: 'bench', sourceModelId: 'bench', metricKey: 'benchlm:category:multimodalGrounded', category: 'multimodalGrounded', value: 90 }),
      metric({ modelKey: 'source:lmarena:vision', sourceModelId: 'vision', metricKey: 'lmarena:vision_style_control:overall', category: 'overall', sourceId: 'lmarena', methodology: 'bradley_terry', unit: 'arena_score', rank: 2, value: 1_150 }),
      metric({ modelKey: 'source:lmarena:agent', sourceModelId: 'agent', metricKey: 'lmarena:agent:overall:ips', category: 'overall', sourceId: 'lmarena', methodology: 'ips', unit: 'score', rank: 1, value: 0.9 }),
    ], [], 'balanced');

    expect(result.entries.map((entry) => entry.model.slug)).toEqual(['bench', 'vision']);
    expect(result.entries.find((entry) => entry.model.slug === 'vision')?.metrics.map((entry) => entry.metricKey))
      .toEqual(['lmarena:vision_style_control:overall']);
  });
});
