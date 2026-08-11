import { describe, expect, it } from 'vitest';
import type { BenchmarkMetric, BenchmarkModel, BenchmarkPriceCheck } from './contracts';
import { buildLeaderboard, LEADERBOARD_DEFINITIONS, sortLeaderboardEntries } from './leaderboards';
import { leaderboardCsv } from './leaderboard-csv';
import { filterLeaderboardEntries, type LeaderboardQueryState } from './leaderboard-query';

/**
 * These tests pin the BenchLM/BenchAlign republication contract:
 * `value` is the public display value, `rawValue` is a disclosed diagnostic,
 * and `rank` is the published source rank. Nothing here may be recomputed from
 * a filtered row position.
 */

const SOURCE_UPDATED_AT = '2026-08-10T00:00:00.000Z';

function model(overrides: Partial<BenchmarkModel> = {}): BenchmarkModel {
  return {
    modelKey: 'model-a',
    slug: 'model-a',
    name: 'Model A',
    creator: 'Acme',
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
    value: 81.48,
    rawValue: 81,
    rank: 4,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    sourceUpdatedAt: SOURCE_UPDATED_AT,
    sourceModelId: 'model-a',
    sourceArtifactId: 'models',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
    ...overrides,
  };
}

/** The three GPT-5.6 rows the specification reconciles explicitly. */
const GPT_56_ROWS = [
  { key: 'sol', display: 81.48, raw: 81, rank: 4 },
  { key: 'terra', display: 72.28, raw: 77, rank: 12 },
  { key: 'luna', display: 66.86, raw: 70, rank: 23 },
] as const;

function gpt56Fixture(): { models: BenchmarkModel[]; metrics: BenchmarkMetric[] } {
  return {
    models: GPT_56_ROWS.map((row) => model({
      modelKey: `gpt-5-6-${row.key}`,
      slug: `gpt-5-6-${row.key}`,
      name: `GPT-5.6 ${row.key}`,
      sourceModelId: `gpt-5-6-${row.key}`,
    })),
    metrics: GPT_56_ROWS.map((row) => metric({
      modelKey: `gpt-5-6-${row.key}`,
      sourceModelId: `gpt-5-6-${row.key}`,
      value: row.display,
      rawValue: row.raw,
      rank: row.rank,
    })),
  };
}

const NO_FILTERS: LeaderboardQueryState = {
  query: '',
  profile: 'balanced',
  priceMode: 'representative',
  metricKey: null,
  sort: 'score-desc',
  providers: [],
  sourceTypes: [],
  evidence: null,
  priceMinimum: null,
  priceMaximum: null,
  includeEstimated: false,
};

describe('BenchAlign republication contract', () => {
  it('publishes the source display value and source rank, never the raw composite', () => {
    const fixture = gpt56Fixture();
    const result = buildLeaderboard('llm-overall', fixture.models, fixture.metrics, []);

    expect(result.entries.map((entry) => ({
      slug: entry.model.slug,
      value: entry.metric?.value,
      rawValue: entry.metric?.rawValue,
      sourceRank: entry.sourceRank,
    }))).toEqual([
      { slug: 'gpt-5-6-sol', value: 81.48, rawValue: 81, sourceRank: 4 },
      { slug: 'gpt-5-6-terra', value: 72.28, rawValue: 77, sourceRank: 12 },
      { slug: 'gpt-5-6-luna', value: 66.86, rawValue: 70, sourceRank: 23 },
    ]);
    // The raw composite must never be the published number for any row.
    expect(result.entries.every((entry) => entry.metric?.value !== entry.metric?.rawValue)).toBe(true);
  });

  it('keeps absolute source ranks when a filtered subset removes the leaders', () => {
    const fixture = gpt56Fixture();
    const result = buildLeaderboard('llm-overall', fixture.models, fixture.metrics, []);
    const filtered = filterLeaderboardEntries(result.entries, { ...NO_FILTERS, query: 'luna' });

    expect(filtered).toHaveLength(1);
    // Filtering to a single row must not promote it to rank 1.
    expect(filtered[0]?.sourceRank).toBe(23);
    expect(filtered[0]?.metric?.value).toBe(66.86);
  });

  it('never exports a filtered row index as a source rank', () => {
    const fixture = gpt56Fixture();
    const result = buildLeaderboard('llm-overall', fixture.models, fixture.metrics, []);
    const rows = leaderboardCsv(result, { ...NO_FILTERS, query: 'luna' }).trim().split('\r\n');
    const header = rows[0]!.split(',');
    const cells = rows[1]!.split(',');

    expect(header[0]).toBe('rank');
    expect(header).toContain('source_rank');
    // A single filtered row keeps its published rank of 23 in both columns.
    expect(cells[0]).toBe('23');
    expect(cells[header.indexOf('source_rank')]).toBe('23');
    expect(cells[header.indexOf('score')]).toBe('66.86');
  });

  it('lets equal source scores and ranks remain ties', () => {
    const tied = [
      model({ modelKey: 'alpha', slug: 'alpha', sourceModelId: 'alpha' }),
      model({ modelKey: 'beta', slug: 'beta', sourceModelId: 'beta' }),
    ];
    const tiedMetrics = tied.map((entry) => metric({
      modelKey: entry.modelKey,
      sourceModelId: entry.sourceModelId,
      value: 74.5,
      rawValue: 74.5,
      rank: 6,
    }));

    const result = buildLeaderboard('llm-overall', tied, tiedMetrics, []);

    expect(result.entries.map((entry) => entry.sourceRank)).toEqual([6, 6]);
    expect(new Set(result.entries.map((entry) => entry.metric?.value))).toEqual(new Set([74.5]));
  });

  it('shows a published value without synthesizing a rank the source did not publish', () => {
    const unranked = buildLeaderboard(
      'llm-overall',
      [model({ modelKey: 'unranked', slug: 'unranked', sourceModelId: 'unranked' })],
      [metric({ modelKey: 'unranked', sourceModelId: 'unranked', value: 63.2, rawValue: 64, rank: null })],
      [],
    );

    expect(unranked.entries[0]?.metric?.value).toBe(63.2);
    expect(unranked.entries[0]?.sourceRank).toBeNull();
  });

  it('routes the published multimodalGrounded category to the Multimodal route', () => {
    expect(LEADERBOARD_DEFINITIONS['multimodal-vision-documents'].metricKeys)
      .toContain('benchlm:category:multimodalGrounded');

    const result = buildLeaderboard(
      'multimodal-vision-documents',
      [model()],
      [metric({
        metricKey: 'benchlm:category:multimodalGrounded',
        category: 'multimodalGrounded',
        value: 84.7,
        rawValue: null,
        rank: 5,
      })],
      [],
    );

    expect(result.entries[0]?.metric?.metricKey).toBe('benchlm:category:multimodalGrounded');
    expect(result.entries[0]?.metric?.value).toBe(84.7);
    expect(result.entries[0]?.sourceRank).toBe(5);
  });

  it('orders by the published display value rather than the raw composite', () => {
    // Raw order would be terra (77) above sol (81.48 display / 81 raw) is false,
    // but luna's raw 70 beats terra's display 72.28 only on the raw axis.
    const fixture = gpt56Fixture();
    const sorted = sortLeaderboardEntries(
      buildLeaderboard('llm-overall', fixture.models, fixture.metrics, []).entries,
      'score-desc',
    );

    expect(sorted.map((entry) => entry.metric?.value)).toEqual([81.48, 72.28, 66.86]);
  });

  it('keeps an estimated row ineligible for the ranked flow while preserving source truth', () => {
    const estimated = model({
      modelKey: 'estimated',
      slug: 'estimated',
      sourceModelId: 'estimated',
      evidenceStatus: 'estimated',
      rankingEligible: false,
    });
    const result = buildLeaderboard(
      'llm-overall',
      [model(), estimated],
      [
        metric(),
        metric({ modelKey: 'estimated', sourceModelId: 'estimated', value: 99, rawValue: 98, rank: 1, rankingEligible: false }),
      ],
      [],
    );

    // A higher estimated value must not take the leader position.
    expect(result.entries.map((entry) => entry.model.slug)).toEqual(['model-a']);
  });
});

describe('BenchAlign price-check evidence', () => {
  it('keeps display value and source rank stable when price evidence is attached', () => {
    const price: BenchmarkPriceCheck = {
      modelKey: 'model-a',
      sourceId: 'openrouter',
      providerId: 'openrouter',
      inputUsdPerMillion: 2,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: 8,
      contextWindowTokens: 200_000,
      verificationStatus: 'primary',
      routeId: 'openrouter:model-a',
      sourceModelId: 'model-a',
      canonicalSlug: 'model-a',
      maxInputTokens: null,
      maxOutputTokens: null,
      inputModalities: null,
      outputModalities: null,
      supportedParameters: null,
      sourceArtifactId: 'models',
    };

    const result = buildLeaderboard('llm-overall', [model()], [metric()], [price]);

    expect(result.entries[0]).toMatchObject({ sourceRank: 4, contextWindowTokens: 200_000 });
    expect(result.entries[0]?.metric?.value).toBe(81.48);
    expect(result.entries[0]?.metric?.rawValue).toBe(81);
  });
});
