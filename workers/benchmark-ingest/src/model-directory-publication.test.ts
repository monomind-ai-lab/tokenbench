import { describe, expect, it } from 'vitest';
import type { ActiveBenchmarkSnapshot } from '../../../functions/_shared/benchmark-db';
import type {
  BenchmarkMetric,
  BenchmarkModel,
  BenchmarkRevision,
  BenchmarkSourceRecord,
} from '../../../src/benchmarks/contracts';
import {
  appendModelDirectoryPublicationStatements,
  type D1Database,
  type BoundStatement,
} from './model-directory-publication';
import type { BenchLmPublicLeaderboard } from './benchlm-public-leaderboard';

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
  };
}

function statementIndex(records: readonly RecordedStatement[], fragment: string): number {
  return records.findIndex((statement) => statement.sql.includes(fragment));
}

describe('atomic model directory publication', () => {
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

  it('caps weekly ranks at 100 and preserves first-week ownership', () => {
    const records: RecordedStatement[] = [];
    const candidate = snapshot(101);

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

  it('computes percentile fields across every ranked peer metric', () => {
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
    expect(target.categories?.find((category) => category.key === 'overall')?.fieldSize).toBe(2);
  });
});
