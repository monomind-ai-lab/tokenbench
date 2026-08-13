import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ActiveBenchmarkSnapshot } from '../../../functions/_shared/benchmark-db';
import type {
  BenchmarkMetric,
  BenchmarkModel,
  BenchmarkRevision,
  BenchmarkSourceRecord,
} from '../../../src/benchmarks/contracts';
import {
  appendModelDirectoryPublicationStatements,
  prepareModelDirectoryPublicationCandidate,
  prepareModelProfilePartition,
  stageModelProfilePartition,
  type D1Database,
  type BoundStatement,
} from './model-directory-publication';
import type { BenchLmPublicLeaderboard } from './benchlm-public-leaderboard';
import { hashModelProfileSnapshotJson } from '../../../src/benchmarks/model-profile';

const UPDATED_AT = '2026-08-10T01:00:00.000Z';
const WEEK_START = '2026-08-10T00:00:00.000Z';
const METHODOLOGY = 'bench-align-v5.3-2026-07-24';

interface RecordedStatement {
  readonly sql: string;
  readonly values: readonly unknown[];
}

function source(artifactId: string): BenchmarkSourceRecord {
  return {
    sourceId: 'benchlm',
    artifactId,
    sourceUrl: `https://benchlm.ai/${artifactId}`,
    observedAt: UPDATED_AT,
    etag: null,
    lastModified: null,
    upstreamRevision: '2026-08-10-8c567bd96953b15d',
    schemaVersion: METHODOLOGY,
    snapshotKey: `benchmarks/benchlm/${artifactId}.json`,
    contentHash: `sha256:${'a'.repeat(64)}`,
    originalContentHash: `sha256:${'b'.repeat(64)}`,
    licenseId: 'MIT',
    attributionText: 'Data from BenchLM.ai',
  };
}

function model(index: number): BenchmarkModel {
  const slug = index === 0 ? 'alpha' : index === 1 ? 'bravo' : `model-${index}`;
  const name = index === 0 ? 'Alpha' : index === 1 ? 'Bravo' : `Model ${index}`;
  return {
    modelKey: `benchlm:example:${slug}`,
    slug,
    name,
    creator: 'Example Org',
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
    sourceModelId: `example/${slug}`,
    sourceArtifactId: 'models',
  };
}

function metric(candidate: BenchmarkModel, rank: number): BenchmarkMetric {
  return {
    modelKey: candidate.modelKey,
    metricKey: 'benchlm:overall:raw',
    category: 'overall',
    value: 90 - rank,
    rawValue: null,
    rank,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    sourceUpdatedAt: UPDATED_AT,
    sourceModelId: candidate.sourceModelId,
    sourceArtifactId: 'public-leaderboard',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
  };
}

function publicLeaderboard(models: readonly BenchmarkModel[]): BenchLmPublicLeaderboard {
  return {
    lastUpdated: UPDATED_AT.slice(0, 10),
    mode: 'bench-align-v5',
    methodologyVersion: METHODOLOGY,
    sourceSnapshotId: '2026-08-10-8c567bd96953b15d',
    approvedSnapshotId: null,
    models: models.map((candidate, index) => ({
      rank: index + 1,
      model: candidate.name,
      creator: candidate.creator,
      sourceType: candidate.sourceType,
      overallScore: 90 - index,
      categoryScores: { coding: 80 - index },
      evidenceStatus: 'supported',
      methodologyVersion: METHODOLOGY,
    })),
  };
}

function snapshot(count = 2): ActiveBenchmarkSnapshot {
  const models = Array.from({ length: count }, (_, index) => model(index));
  const revision: BenchmarkRevision = {
    revision: 'rev-1',
    generatedAt: UPDATED_AT,
    publishedAt: UPDATED_AT,
    checkedAt: UPDATED_AT,
    publicationState: 'published',
    contentHash: `sha256:${'c'.repeat(64)}`,
    catalogRevision: 'catalog-1',
    openrouterContentHash: `sha256:${'d'.repeat(64)}`,
  };
  return {
    revision,
    sources: [source('models'), source('public-leaderboard')],
    models,
    metrics: models.map((candidate, index) => metric(candidate, index + 1)),
    priceChecks: [],
    comparisonPairs: [],
  };
}

function recordingDatabase(records: RecordedStatement[]): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]): BoundStatement {
          const statement = { sql, values };
          records.push(statement);
          return statement as unknown as BoundStatement;
        },
      } as unknown as BoundStatement;
    },
    async batch() { return undefined; },
  };
}

function statementIndex(records: readonly RecordedStatement[], fragment: string): number {
  return records.findIndex((statement) => statement.sql.includes(fragment));
}

describe('atomic model directory publication', () => {
  it('prepares deterministic profile windows capped at 100 models', async () => {
    const candidate = snapshot(205);
    const leaderboard = publicLeaderboard(candidate.models);
    const windows = await Promise.all([0, 100, 200].map((offset) =>
      prepareModelProfilePartition(candidate, leaderboard, UPDATED_AT, offset)));

    expect(windows.map((window) => window.profiles.length)).toEqual([100, 100, 5]);
    expect(windows.every((window) => window.limit === 100 && window.totalModelCount === 205)).toBe(true);
    expect(windows.flatMap((window) => window.modelKeys)).toEqual(candidate.models.map((entry) => entry.modelKey));
    expect(windows.flatMap((window) => window.profiles).every((profile) =>
      profile.contentHash === hashModelProfileSnapshotJson(profile.profileJson))).toBe(true);
    // Each 100-model D1 window carries only the ranks of the models it holds,
    // and the weekly ranked list stops at the top 100.
    expect(windows[0]?.ranks).toHaveLength(100);
    expect(windows[1]?.ranks).toHaveLength(0);
  });

  it('rejects invalid or oversized profile windows', async () => {
    const candidate = snapshot(2);
    const leaderboard = publicLeaderboard(candidate.models);
    await expect(prepareModelProfilePartition(candidate, leaderboard, UPDATED_AT, -1))
      .rejects.toThrow(/offset/);
    await expect(prepareModelProfilePartition(candidate, leaderboard, UPDATED_AT, 0, 101))
      .rejects.toThrow(/limit/);
  });

  it('stages one profile window idempotently without mutable directory or rank changes', async () => {
    const records: RecordedStatement[] = [];
    const candidate = snapshot(101);
    const partition = await prepareModelProfilePartition(
      candidate, publicLeaderboard(candidate.models), UPDATED_AT, 0,
    );
    const result = await stageModelProfilePartition({
      db: recordingDatabase(records),
      cycleId: 'cycle-1',
      revision: candidate.revision.revision,
      partition,
    });

    expect(result).toEqual({ models: 100, profiles: 100 });
    expect(records.some(({ sql }) => sql.includes('benchmark_model_revision_membership'))).toBe(true);
    expect(records.some(({ sql }) => sql.includes('benchmark_model_profile_snapshots'))).toBe(true);
    expect(records.every(({ sql }) => !sql.includes('benchmark_model_directory'))).toBe(true);
    expect(records.every(({ sql }) => !sql.includes('benchmark_popular_model'))).toBe(true);
    expect(records.every(({ sql }) => !sql.includes('benchmark_publication_state'))).toBe(true);
    expect(records.every(({ sql }) => sql.includes('publication_attempt_id = ?'))).toBe(true);
  });

  it('prepares exact profile hashes through the native asynchronous publication path', async () => {
    const records: RecordedStatement[] = [];
    const candidate = snapshot();
    const prepared = await prepareModelDirectoryPublicationCandidate(
      candidate,
      publicLeaderboard(candidate.models),
      UPDATED_AT,
    );

    appendModelDirectoryPublicationStatements(
      [],
      recordingDatabase(records),
      candidate,
      publicLeaderboard(candidate.models),
      UPDATED_AT,
      prepared,
    );

    expect(prepared.profiles).toHaveLength(candidate.models.length);
    expect(prepared.profiles.every((profile) => (
      profile.contentHash === hashModelProfileSnapshotJson(profile.profileJson)
    ))).toBe(true);
    expect(records.some((statement) => statement.sql.includes('benchmark_model_profile_snapshots'))).toBe(true);
  });

  it('writes membership and immutable profiles before current/archive transitions', () => {
    const records: RecordedStatement[] = [];
    const candidate = snapshot();

    appendModelDirectoryPublicationStatements(
      [],
      recordingDatabase(records),
      candidate,
      publicLeaderboard(candidate.models),
      UPDATED_AT,
    );

    const membership = statementIndex(records, 'benchmark_model_revision_membership');
    const profiles = statementIndex(records, 'benchmark_model_profile_snapshots');
    const directory = statementIndex(records, 'benchmark_model_directory');
    const archive = statementIndex(records, "status = 'archived'");
    expect(membership).toBeGreaterThanOrEqual(0);
    expect(profiles).toBeGreaterThan(membership);
    expect(directory).toBeGreaterThan(profiles);
    expect(archive).toBeGreaterThan(directory);
    expect(records[profiles]?.values.join('|')).toContain('rev-1');
    expect(records[archive]?.sql).toContain('NOT EXISTS');
    expect(records[archive]?.sql).toContain('benchmark_model_revision_membership');
  });

  it('caps weekly ranks at the Popular Models top 100 and preserves first-week ownership', () => {
    const records: RecordedStatement[] = [];
    const candidate = snapshot(201);

    appendModelDirectoryPublicationStatements(
      [],
      recordingDatabase(records),
      candidate,
      publicLeaderboard(candidate.models),
      UPDATED_AT,
    );

    const week = records.find((statement) => statement.sql.includes('benchmark_popular_model_weeks'));
    const ranks = records.find((statement) => statement.sql.includes('benchmark_popular_model_ranks'));
    expect(week?.sql).toContain('INSERT OR IGNORE');
    expect(ranks?.sql).toContain('benchmark_revision');
    const encodedRanks = ranks?.values.at(-1);
    expect(typeof encodedRanks).toBe('string');
    // The ranked list stays at 100 even though 201 models are ingested:
    // benchmark_popular_model_ranks.rank is CHECK (rank BETWEEN 1 AND 100).
    expect(JSON.parse(String(encodedRanks))).toHaveLength(100);
    expect(String(encodedRanks)).toContain(WEEK_START);
    expect(ranks?.values.slice(0, -1)).toEqual([WEEK_START, 'rev-1']);
  });

  it('uses canonical slug conflict guards and deterministic updated timestamps', () => {
    const records: RecordedStatement[] = [];
    const candidate = snapshot();

    appendModelDirectoryPublicationStatements(
      [],
      recordingDatabase(records),
      candidate,
      publicLeaderboard(candidate.models),
      UPDATED_AT,
    );

    const directory = records.find((statement) => statement.sql.includes('benchmark_model_directory') && statement.sql.includes('ON CONFLICT'));
    expect(directory?.sql).toContain('canonical_slug');
    expect(directory?.sql).toContain('ON CONFLICT');
    expect(directory?.sql).toContain('updated_at');
    expect(directory?.values.some((value) => String(value).includes(UPDATED_AT))).toBe(true);
  });

  it('skips rank insertion when the weekly snapshot already has rows', () => {
    const records: RecordedStatement[] = [];
    const candidate = snapshot();

    appendModelDirectoryPublicationStatements(
      [],
      recordingDatabase(records),
      candidate,
      publicLeaderboard(candidate.models),
      UPDATED_AT,
    );

    const ranks = records.find((statement) => statement.sql.includes('benchmark_popular_model_ranks'));
    expect(ranks?.sql).toContain('NOT EXISTS');
  });

  it('guards canonical slug ownership against existing models', () => {
    const records: RecordedStatement[] = [];
    const candidate = snapshot();

    appendModelDirectoryPublicationStatements(
      [],
      recordingDatabase(records),
      candidate,
      publicLeaderboard(candidate.models),
      UPDATED_AT,
    );

    const conflict = records.find((statement) => statement.sql.startsWith('SELECT CASE WHEN EXISTS'));
    expect(conflict?.sql).toContain('existing.canonical_slug = json_extract');
    expect(conflict?.sql).toContain('existing.model_key <> json_extract');
  });

  it('sizes the ranked field by the highest published rank, not the row count', () => {
    const records: RecordedStatement[] = [];
    const base = snapshot(3);
    const candidate: ActiveBenchmarkSnapshot = {
      ...base,
      metrics: base.metrics.map((entry, index) => index === 1 ? { ...entry, rank: null } : entry),
    };

    appendModelDirectoryPublicationStatements(
      [],
      recordingDatabase(records),
      candidate,
      publicLeaderboard(candidate.models),
      UPDATED_AT,
    );

    const profileStatement = records.find((statement) => statement.sql.startsWith('INSERT INTO benchmark_model_profile_snapshots'));
    const profiles = JSON.parse(String(profileStatement?.values.at(-1))) as Array<{ modelKey: string; profileJson: string }>;
    const target = JSON.parse(profiles.find((profile) => profile.modelKey === candidate.models[0]?.modelKey)?.profileJson ?? '{}') as {
      categories?: Array<{ key: string; fieldSize: number | null }>;
    };
    // One of three peer ranks is nulled, leaving published ranks #1 and #3.
    // The field is 3 because rank #3 exists: counting surviving rows instead
    // would report "#3 of 2" and a fabricated 0 percentile.
    expect(target.categories?.find((category) => category.key === 'overall')?.fieldSize).toBe(3);
  });

  it('never rewrites a profile snapshot already stored for the same revision', async () => {
    // Proven against real SQLite rather than a recording double: INSERT_PROFILE
    // is ON CONFLICT(model_key, revision) DO NOTHING, so replaying the same
    // revision cannot repair a stored profile. A derivation fix to profile
    // contents therefore requires a newly published revision, not a replay.
    const sqlite = new DatabaseSync(':memory:');
    for (const file of ['0001_catalog.sql', '0004_benchmarks.sql', '0009_model_directory.sql']) {
      sqlite.exec(readFileSync(resolve(process.cwd(), 'migrations', file), 'utf8'));
    }
    const candidate = snapshot();
    const stale = JSON.stringify({ summary: { evidenceStatus: 'stale-before-fix' } });
    sqlite.prepare(`INSERT INTO benchmark_model_profile_snapshots
      (model_key, revision, profile_json, content_hash, generated_at) VALUES (?, ?, ?, ?, ?)`)
      .run(candidate.models[0]!.modelKey, candidate.revision.revision, stale,
        hashModelProfileSnapshotJson(stale), UPDATED_AT);

    const records: RecordedStatement[] = [];
    appendModelDirectoryPublicationStatements(
      [], recordingDatabase(records), candidate, publicLeaderboard(candidate.models), UPDATED_AT,
    );
    for (const statement of records.filter(({ sql }) => sql.startsWith('INSERT INTO benchmark_model_profile_snapshots'))) {
      sqlite.prepare(statement.sql).run(...statement.values as Array<string | number | null>);
    }

    const stored = sqlite.prepare('SELECT profile_json FROM benchmark_model_profile_snapshots WHERE model_key = ? AND revision = ?')
      .get(candidate.models[0]!.modelKey, candidate.revision.revision) as { profile_json: string };
    expect(stored.profile_json).toBe(stale);
    sqlite.close();
  });
});
