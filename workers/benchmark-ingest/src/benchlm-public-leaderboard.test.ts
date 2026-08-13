import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ActiveBenchmarkSnapshot } from '../../../functions/_shared/benchmark-db';
import type { BenchmarkMetric, BenchmarkModel, BenchmarkSourceRecord } from '../../../src/benchmarks/contracts';
import {
  joinPublicLeaderboardScores,
  parseBenchLmPublicLeaderboard,
  publicLeaderboardFromSnapshot,
  type SafeBenchLmModelIdentity,
} from './benchlm-public-leaderboard';

function fixture(): unknown {
  return JSON.parse(readFileSync(resolve(
    process.cwd(),
    'workers/benchmark-ingest/test-fixtures/benchlm/public-leaderboard.json',
  ), 'utf8'));
}

function identities(): SafeBenchLmModelIdentity[] {
  return [
    ['model-a', 'source:benchlm:model-a', 'Model A', 'Acme'],
    ['model-b', 'source:benchlm:model-b', 'Model B', 'Acme'],
    ['kimi-3', 'source:benchlm:kimi-3', 'Kimi K3', 'Moonshot AI'],
    ['gpt-5-6-sol', 'source:benchlm:gpt-5-6-sol', 'GPT-5.6 Sol', 'OpenAI'],
    ['sakana-fugu-ultra', 'source:benchlm:sakana-fugu-ultra', 'Sakana Fugu-Ultra', 'Sakana AI'],
  ].map(([sourceModelId, modelKey, name, creator]) => ({
    sourceModelId,
    modelKey,
    name,
    creator,
    // Published ranks travel with the identity; the join never derives them.
    categoryRanks: publishedRanks[sourceModelId!] ?? {},
  }));
}

/** Published `ranking.categoryRanks` mirrored from the models.json fixture. */
const publishedRanks: Record<string, Record<string, number | null>> = {
  'model-a': { coding: 3, multimodalGrounded: 5 },
  'model-b': { coding: 8 },
  'kimi-3': {},
  'gpt-5-6-sol': { coding: 99 },
  'sakana-fugu-ultra': { coding: 2, reasoning: 1, multimodalGrounded: 1 },
};
function snapshotFromFixture(): ActiveBenchmarkSnapshot {
  const parsed = parseBenchLmPublicLeaderboard(fixture());
  const models: BenchmarkModel[] = parsed.models.map((row, index) => ({
    modelKey: `source:benchlm:${index}`,
    slug: `model-${index}`,
    name: row.model,
    creator: row.creator,
    sourceType: row.sourceType,
    reasoningType: null,
    releaseDate: null,
    contextWindowTokens: null,
    evidenceStatus: row.evidenceStatus,
    rankingEligible: row.evidenceStatus === 'supported',
    confidenceLower: null,
    confidenceUpper: null,
    benchmarkCount: 1,
    sourceId: 'benchlm',
    sourceModelId: `source-model-${index}`,
    sourceArtifactId: 'models',
  }));
  const metrics: BenchmarkMetric[] = parsed.models.flatMap((row, index) => [
    {
      modelKey: models[index]!.modelKey,
      metricKey: 'benchlm:overall:raw',
      category: 'overall',
      value: row.overallScore,
      rawValue: null,
      rank: row.rank,
      lower: null,
      upper: null,
      voteCount: null,
      unit: 'score',
      sourceId: 'benchlm',
      sourceUpdatedAt: '2026-08-10T00:00:00.000Z',
      sourceModelId: models[index]!.sourceModelId,
      sourceArtifactId: 'public-leaderboard',
      rankingEligible: row.evidenceStatus === 'supported',
      methodology: 'benchlm_raw_composite',
      observationCount: null,
      sessionCount: null,
    },
    ...Object.entries(row.categoryScores)
      .filter((entry): entry is [string, number] => entry[1] !== null)
      .map(([category, value]) => ({
        modelKey: models[index]!.modelKey,
        metricKey: `benchlm:category:${category}`,
        category,
        value,
        rawValue: null,
        rank: null,
        lower: null,
        upper: null,
        voteCount: null,
        unit: 'score' as const,
        sourceId: 'benchlm' as const,
        sourceUpdatedAt: '2026-08-10T00:00:00.000Z',
        sourceModelId: models[index]!.sourceModelId,
        sourceArtifactId: 'public-leaderboard',
        rankingEligible: false,
        methodology: 'benchlm_raw_composite' as const,
        observationCount: null,
        sessionCount: null,
      })),
  ]);
  const source: BenchmarkSourceRecord = {
    sourceId: 'benchlm',
    artifactId: 'public-leaderboard',
    sourceUrl: 'https://benchlm.ai/api/data/leaderboard?mode=bench-align-v5&limit=200',
    observedAt: '2026-08-10T00:00:00.000Z',
    etag: null,
    lastModified: null,
    upstreamRevision: parsed.sourceSnapshotId,
    schemaVersion: parsed.methodologyVersion,
    snapshotKey: 'benchlm/public-leaderboard.json',
    contentHash: `sha256:${'a'.repeat(64)}`,
    originalContentHash: `sha256:${'b'.repeat(64)}`,
    licenseId: 'MIT',
    attributionText: 'Data from BenchLM.ai',
  };
  return {
    revision: {
      revision: 'revision-1',
      generatedAt: '2026-08-10T00:00:00.000Z',
      publishedAt: '2026-08-10T00:00:00.000Z',
      checkedAt: '2026-08-10T00:00:00.000Z',
      publicationState: 'published',
      contentHash: `sha256:${'c'.repeat(64)}`,
      catalogRevision: 'catalog-1',
      openrouterContentHash: `sha256:${'d'.repeat(64)}`,
    },
    sources: [source],
    models,
    metrics,
    priceChecks: [],
    comparisonPairs: [],
  };
}

describe('BenchLM public leaderboard contract', () => {
  it('parses the public BenchAlign identity and canonical GPT-5.6 Sol values', () => {
    const parsed = parseBenchLmPublicLeaderboard(fixture());
    expect(parsed).toMatchObject({
      lastUpdated: '2026-08-10',
      mode: 'bench-align-v5',
      methodologyVersion: 'bench-align-v5.3-2026-07-24',
      sourceSnapshotId: '2026-08-10-8c567bd96953b15d',
      approvedSnapshotId: null,
    });
    expect(parsed.models.find((row) => row.model === 'GPT-5.6 Sol')).toMatchObject({
      rank: 4,
      overallScore: 81.48,
      categoryScores: { coding: 77.95 },
    });
  });

  it('joins one-to-one and keeps the published GPT-5.6 Sol coding rank', () => {
    const joined = joinPublicLeaderboardScores(identities(), parseBenchLmPublicLeaderboard(fixture()));
    expect(joined.get('source:benchlm:gpt-5-6-sol')).toMatchObject({
      modelKey: 'source:benchlm:gpt-5-6-sol',
      overallScore: 81.48,
      overallRank: 4,
      categoryScores: { coding: 77.95 },
      categoryRanks: { coding: 99 },
      methodologyVersion: 'bench-align-v5.3-2026-07-24',
      sourceSnapshotId: '2026-08-10-8c567bd96953b15d',
    });
  });

  it('reports null for a category the source ranked no model on', () => {
    // Kimi K3 has a coding score but publishes no coding rank.
    const joined = joinPublicLeaderboardScores(identities(), parseBenchLmPublicLeaderboard(fixture()));
    expect(joined.get('source:benchlm:kimi-3')?.categoryRanks).toEqual({ coding: null, reasoning: null });
  });

  /**
   * Source-of-truth contract for the public category rank.
   *
   * `models.json` -> `ranking.categoryRanks` is the only upstream field that
   * publishes a category rank. The public leaderboard response carries
   * `categoryScores` and a single overall `rank`, but no per-category ranks.
   *
   * Verified against production upstream on 2026-08-13 for GPT-5.6 Sol:
   *   published ranking.categoryRanks = { agentic: 6, coding: 3,
   *                                       multimodalGrounded: 5, knowledge: 6 }
   *   live tokenbench profile          = agentic #6, coding #3, knowledge #6
   * Agentic, coding and knowledge already matched the published values, which
   * is why those ranks are unchanged by using the published field directly.
   *
   * Ranks are also order-consistent with scores: across 214 adjacent
   * published-rank pairs in the live cohort there were zero cases where a
   * lower rank held a lower score. The published ranks are therefore a real
   * ordering of a larger cohort, not an artifact of our fetched window.
   */
  it('takes category ranks only from the published rank field', () => {
    const leaderboard = parseBenchLmPublicLeaderboard(fixture());
    // The public leaderboard response itself publishes no category ranks.
    expect(leaderboard.models.every((row) => !('categoryRanks' in row))).toBe(true);

    const joined = joinPublicLeaderboardScores(identities(), leaderboard);
    // Model A publishes coding #3 and multimodalGrounded #5.
    expect(joined.get('source:benchlm:model-a')?.categoryRanks)
      .toEqual({ coding: 3, multimodalGrounded: 5, reasoning: null });
  });

  it('ignores a published rank that is not a positive integer', () => {
    const models = identities().map((identity) => (identity.sourceModelId === 'model-a'
      ? { ...identity, categoryRanks: { coding: 0, multimodalGrounded: -2 } }
      : identity));
    const joined = joinPublicLeaderboardScores(models, parseBenchLmPublicLeaderboard(fixture()));
    expect(joined.get('source:benchlm:model-a')?.categoryRanks)
      .toEqual({ coding: null, multimodalGrounded: null, reasoning: null });
  });

  it('accepts a unique normalized fallback but rejects ambiguous normalized identities', () => {
    const source = fixture() as { models: Array<Record<string, unknown>> };
    const gpt = source.models.find((row) => row.model === 'GPT-5.6 Sol');
    if (!gpt) throw new Error('fixture is missing GPT-5.6 Sol');
    gpt.model = 'ＧＰＴ 5.6 SOL';
    gpt.creator = ' openai ';
    const parsed = parseBenchLmPublicLeaderboard(source);
    expect(joinPublicLeaderboardScores(identities(), parsed).has('source:benchlm:gpt-5-6-sol')).toBe(true);

    const ambiguous = [
      ...identities(),
      { sourceModelId: 'duplicate', modelKey: 'source:benchlm:duplicate', name: 'gpt 5.6 sol', creator: 'OPENAI' },
    ];
    expect(() => joinPublicLeaderboardScores(ambiguous, parsed)).toThrow(/identity is ambiguous/i);
  });

  it('rejects malformed public rows instead of treating them as unavailable', () => {
    const source = fixture() as { models: Array<Record<string, unknown>> };
    const gpt = source.models.find((row) => row.model === 'GPT-5.6 Sol');
    if (!gpt) throw new Error('fixture is missing GPT-5.6 Sol');
    gpt.overallScore = '81.48';
    expect(() => parseBenchLmPublicLeaderboard(source)).toThrow(/overallScore/i);
  });
  it('reconstructs the corrected public ordering from a validated active snapshot', () => {
    const snapshot = snapshotFromFixture();
    const derived = publicLeaderboardFromSnapshot(snapshot);
    expect(derived).toMatchObject({
      mode: 'bench-align-v5',
      sourceSnapshotId: '2026-08-10-8c567bd96953b15d',
      methodologyVersion: 'bench-align-v5.3-2026-07-24',
    });
    expect(derived.models.map((row) => row.rank)).toEqual([4, 4, 8, 12, 22]);
    expect(derived.models.find((row) => row.model === 'GPT-5.6 Sol')).toMatchObject({
      overallScore: 81.48,
      categoryScores: { coding: 77.95 },
    });
  });
});
