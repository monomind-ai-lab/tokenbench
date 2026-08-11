import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  joinPublicLeaderboardScores,
  parseBenchLmPublicLeaderboard,
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
  ].map(([sourceModelId, modelKey, name, creator]) => ({ sourceModelId, modelKey, name, creator }));
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

  it('joins one-to-one and derives GPT-5.6 Sol coding rank from the public rows', () => {
    const joined = joinPublicLeaderboardScores(identities(), parseBenchLmPublicLeaderboard(fixture()));
    expect(joined.get('source:benchlm:gpt-5-6-sol')).toMatchObject({
      modelKey: 'source:benchlm:gpt-5-6-sol',
      overallScore: 81.48,
      overallRank: 4,
      categoryScores: { coding: 77.95 },
      categoryRanks: { coding: 3 },
      methodologyVersion: 'bench-align-v5.3-2026-07-24',
      sourceSnapshotId: '2026-08-10-8c567bd96953b15d',
    });
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
});
