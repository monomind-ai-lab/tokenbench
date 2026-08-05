import { describe, expect, it } from 'vitest';
import type { BenchmarkMetric, BenchmarkModel, BenchmarkPriceCheck } from './contracts';
import {
  buildLeaderboard,
  LEADERBOARD_DEFINITIONS,
  sortLeaderboardEntries,
} from './leaderboards';
import { LEADERBOARD_ROUTES } from '../routing/routes';

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
  it('defines every generated leaderboard route with only exact approved metric keys', () => {
    expect(Object.keys(LEADERBOARD_DEFINITIONS).sort()).toEqual(Object.keys(LEADERBOARD_ROUTES).sort());
    expect(LEADERBOARD_DEFINITIONS).toMatchObject({
      'llm-overall': { metricKeys: ['benchlm:overall:raw'], defaultSort: 'score-desc' },
      'llm-coding': { metricKeys: ['benchlm:category:coding'], defaultSort: 'score-desc' },
      'llm-agentic': { metricKeys: ['benchlm:category:agentic'], defaultSort: 'score-desc' },
      'llm-human-preference': { metricKeys: ['lmarena:text_style_control:overall'], defaultSort: 'rank-asc' },
      'llm-value': { metricKeys: ['benchlm:overall:raw'], defaultSort: 'pareto-score-desc' },
      'llm-pricing-context': { sourceId: 'openrouter', defaultSort: 'price-asc', userSortable: true },
      'multimodal-vision-documents': {
        metricKeys: [
          'benchlm:category:multimodal',
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

describe('buildLeaderboard', () => {
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
    expect(result.entries[0]).toMatchObject({ blendedCostPerMillion: null, sourceRank: null });
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

  it('retains a primary OpenRouter route with missing money as an unavailable pricing-context row', () => {
    const priced = model({ modelKey: 'priced', slug: 'priced' });
    const unavailable = model({ modelKey: 'unavailable', slug: 'unavailable' });
    const result = buildLeaderboard('llm-pricing-context', [unavailable, priced], [], [
      price({ modelKey: 'priced', routeId: 'openrouter:priced', inputUsdPerMillion: 1, outputUsdPerMillion: 1, contextWindowTokens: 64_000 }),
      price({ modelKey: 'unavailable', routeId: 'openrouter:unavailable', inputUsdPerMillion: null, outputUsdPerMillion: null, contextWindowTokens: 256_000 }),
    ], 'balanced');

    expect(result.entries.map((entry) => [entry.model.slug, entry.blendedCostPerMillion, entry.contextWindowTokens]))
      .toEqual([['priced', 1, 64_000], ['unavailable', null, 256_000]]);
    expect(sortLeaderboardEntries(result.entries, 'context-desc').map((entry) => entry.model.slug))
      .toEqual(['unavailable', 'priced']);
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
      metric({ modelKey: 'bench', sourceModelId: 'bench', metricKey: 'benchlm:category:multimodal', category: 'multimodal', value: 90 }),
      metric({ modelKey: 'source:lmarena:vision', sourceModelId: 'vision', metricKey: 'lmarena:vision_style_control:overall', category: 'overall', sourceId: 'lmarena', methodology: 'bradley_terry', unit: 'arena_score', rank: 2, value: 1_150 }),
      metric({ modelKey: 'source:lmarena:agent', sourceModelId: 'agent', metricKey: 'lmarena:agent:overall:ips', category: 'overall', sourceId: 'lmarena', methodology: 'ips', unit: 'score', rank: 1, value: 0.9 }),
    ], [], 'balanced');

    expect(result.entries.map((entry) => entry.model.slug)).toEqual(['bench', 'vision']);
    expect(result.entries.find((entry) => entry.model.slug === 'vision')?.metrics.map((entry) => entry.metricKey))
      .toEqual(['lmarena:vision_style_control:overall']);
  });
});
