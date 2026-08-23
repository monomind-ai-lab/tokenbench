import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type {
  LiveBenchReleaseBundle,
  LiveBenchReleaseDescriptor,
} from '../../src/livebench/contracts';
import {
  LIVEBENCH_STAGE_BATCH_SIZE,
  LIVEBENCH_STAGE_JSON_CHUNK_BYTES,
  LIVEBENCH_STAGE_MAX_D1_STATEMENTS,
  acquireLiveBenchPublicationLease,
  isLiveBenchPublicationLeaseCurrent,
  publishLiveBenchRelease,
  readActiveLiveBenchBundle,
  readActiveLiveBenchRelease,
  stageLiveBenchRelease,
  validateLiveBenchRelease,
  type LiveBenchD1Database,
  type LiveBenchD1Statement,
  LiveBenchPublicationLeaseError,
  type LiveBenchPublicationLease,
} from './livebench-db';

const CHECKED_AT = '2026-08-19T09:00:00.000Z';
const RELEASED_AT = '2026-06-25T00:00:00.000Z';
const PUBLISHED_AT = '2026-08-19T09:05:00.000Z';
const REVISION = 'livebench-2026-06-25';
const ATTEMPT_ID = 'livebench-attempt-1';
const DIGEST: `sha256:${string}` = `sha256:${'a'.repeat(64)}`;

const bundle: LiveBenchReleaseBundle = {
  schemaVersion: 1,
  releaseId: '2026-06-25',
  sourceCommit: 'd5fcb08be7088c84616652660666b8621b683ae6',
  observedAt: CHECKED_AT,
  categories: [
    { categoryId: 'reasoning', label: 'Reasoning', taskIds: ['theory-of-mind', 'zebra-puzzle'] },
  ],
  tasks: [
    { taskId: 'theory-of-mind', label: 'Theory of mind', categoryId: 'reasoning' },
    { taskId: 'zebra-puzzle', label: 'Zebra puzzle', categoryId: 'reasoning' },
  ],
  models: [
    {
      configurationId: 'livebench:alpha', sourceModelId: 'alpha', displayName: 'Alpha', organization: 'Example',
      openWeights: null, reasoner: null, isDerivativeFinetune: false,
      baseConfigurationId: null, lineageSourceUrl: null,
    },
    {
      configurationId: 'livebench:beta', sourceModelId: 'beta', displayName: 'Beta', organization: 'Example',
      openWeights: true, reasoner: false, isDerivativeFinetune: true,
      baseConfigurationId: 'livebench:alpha', lineageSourceUrl: 'https://example.com/beta',
    },
  ],
  taskScores: [
    { configurationId: 'livebench:alpha', taskId: 'theory-of-mind', score: 80 },
    { configurationId: 'livebench:alpha', taskId: 'zebra-puzzle', score: 81 },
    { configurationId: 'livebench:beta', taskId: 'theory-of-mind', score: 82 },
    { configurationId: 'livebench:beta', taskId: 'zebra-puzzle', score: 83 },
  ],
  taskEconomics: [
    {
      configurationId: 'livebench:alpha', taskId: 'theory-of-mind', questionCount: 10, evaluationCostUsd: 0.12,
      inputPriceUsdPerMillion: null, outputPriceUsdPerMillion: null, meanInputTokens: null, meanOutputTokens: null,
    },
    {
      configurationId: 'livebench:alpha', taskId: 'zebra-puzzle', questionCount: 10, evaluationCostUsd: 0.13,
      inputPriceUsdPerMillion: null, outputPriceUsdPerMillion: null, meanInputTokens: null, meanOutputTokens: null,
    },
    {
      configurationId: 'livebench:beta', taskId: 'theory-of-mind', questionCount: 10, evaluationCostUsd: 0.09,
      inputPriceUsdPerMillion: 1, outputPriceUsdPerMillion: 3, meanInputTokens: 120, meanOutputTokens: 60,
    },
    {
      configurationId: 'livebench:beta', taskId: 'zebra-puzzle', questionCount: 10, evaluationCostUsd: 0.1,
      inputPriceUsdPerMillion: 1, outputPriceUsdPerMillion: 3, meanInputTokens: 130, meanOutputTokens: 70,
    },
  ],
};

const descriptor: LiveBenchReleaseDescriptor = {
  releaseId: bundle.releaseId,
  commit: bundle.sourceCommit,
  fingerprint: DIGEST,
  artifacts: [
    {
      artifactId: 'table', path: 'public/table_2026_06_25.csv', blobId: '1'.repeat(40),
      rawUrl: `https://raw.githubusercontent.com/LiveBench/new-livebench/${bundle.sourceCommit}/public/table_2026_06_25.csv`,
    },
    {
      artifactId: 'categories', path: 'public/categories_2026_06_25.json', blobId: '2'.repeat(40),
      rawUrl: `https://raw.githubusercontent.com/LiveBench/new-livebench/${bundle.sourceCommit}/public/categories_2026_06_25.json`,
    },
    {
      artifactId: 'cost', path: 'public/cost_2026_06_25.csv', blobId: '3'.repeat(40),
      rawUrl: `https://raw.githubusercontent.com/LiveBench/new-livebench/${bundle.sourceCommit}/public/cost_2026_06_25.csv`,
    },
    {
      artifactId: 'model-links', path: 'src/Table/modelLinks.js', blobId: '4'.repeat(40),
      rawUrl: `https://raw.githubusercontent.com/LiveBench/new-livebench/${bundle.sourceCommit}/src/Table/modelLinks.js`,
    },
  ],
};

function stagedRelease(overrides: Record<string, unknown> = {}) {
  return {
    revision: REVISION,
    source_release_id: bundle.releaseId,
    release_kind: 'current',
    publication_state: 'staged',
    staging_attempt_id: ATTEMPT_ID,
    source_revision: `${bundle.releaseId}@${bundle.sourceCommit}`,
    source_commit: bundle.sourceCommit,
    source_manifest_key: 'evidence/benchmark/livebench/livebench-attempt-1/manifest.json',
    source_manifest_hash: DIGEST,
    source_fingerprint: DIGEST,
    observed_at: CHECKED_AT,
    checked_at: CHECKED_AT,
    released_at: RELEASED_AT,
    published_at: null,
    license_id: 'Apache-2.0',
    license_verification_state: 'verified',
    license_verification_url: 'https://example.com/license-review',
    license_verified_at: CHECKED_AT,
    license_verified_by: 'reviewer',
    attribution_text: 'LiveBench source attribution',
    ...overrides,
  };
}

function completeValidation(overrides: Record<string, unknown> = {}) {
  return {
    expected_artifact_count: descriptor.artifacts.length,
    artifact_count: descriptor.artifacts.length,
    expected_category_count: bundle.categories.length,
    category_count: bundle.categories.length,
    expected_task_count: bundle.tasks.length,
    task_count: bundle.tasks.length,
    expected_model_count: bundle.models.length,
    model_count: bundle.models.length,
    expected_score_count: bundle.taskScores.length,
    score_count: bundle.taskScores.length,
    expected_economics_count: bundle.taskEconomics.length,
    economics_count: bundle.taskEconomics.length,
    source_manifest_count: 1,
    missing_category_count: 0,
    missing_task_count: 0,
    missing_model_count: 0,
    missing_score_count: 0,
    missing_economics_count: 0,
    missing_artifact_count: 0,
    invalid_identity_count: 0,
    verified_cdla_license: 1,
    ...overrides,
  };
}

type RecordedStatement = {
  readonly sql: string;
  readonly values: readonly unknown[];
};

type FakeStatement = LiveBenchD1Statement & RecordedStatement;
type FakeDatabase = LiveBenchD1Database & {
  readonly statements: FakeStatement[];
  readonly batches: FakeStatement[][];
};

type FactRows = {
  readonly categories?: readonly Record<string, unknown>[];
  readonly tasks?: readonly Record<string, unknown>[];
  readonly models?: readonly Record<string, unknown>[];
  readonly scores?: readonly Record<string, unknown>[];
  readonly economics?: readonly Record<string, unknown>[];
};

class SqliteD1Statement implements LiveBenchD1Statement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly values: readonly unknown[] = [],
  ) {}

  bind(...values: unknown[]): LiveBenchD1Statement {
    return new SqliteD1Statement(this.db, this.sql, values);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.values as SQLInputValue[]) as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.values as SQLInputValue[]) as T[] };
  }

  async run(): Promise<{ meta?: { changes?: number } }> {
    return { meta: { changes: Number(this.db.prepare(this.sql).run(...this.values as SQLInputValue[]).changes) } };
  }
}

function sqliteDatabase(): { readonly sqlite: DatabaseSync; readonly d1: LiveBenchD1Database } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(resolve(process.cwd(), 'migrations/0013_pipeline_foundation.sql'), 'utf8'));
  sqlite.exec(readFileSync(resolve(process.cwd(), 'migrations/0014_livebench.sql'), 'utf8'));
  sqlite.exec(readFileSync(resolve(process.cwd(), 'migrations/0017_livebench_publication_epoch.sql'), 'utf8'));
  const d1: LiveBenchD1Database = {
    prepare(sql: string) {
      return new SqliteD1Statement(sqlite, sql);
    },
    async batch(statements: readonly LiveBenchD1Statement[]) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sqlite, d1 };
}

function database(options: {
  readonly release?: Record<string, unknown> | null;
  readonly validation?: Record<string, unknown> | null;
  readonly active?: Record<string, unknown> | null;
  readonly facts?: FactRows;
} = {}): FakeDatabase {
  const statements: FakeStatement[] = [];
  const batches: FakeStatement[][] = [];
  const release = options.release ?? stagedRelease();
  const validation = options.validation ?? completeValidation();
  const active = options.active ?? null;
  const facts = options.facts ?? {};
  const statement = (sql: string, values: readonly unknown[] = []): FakeStatement => ({
    sql,
    values,
    bind(...bound: unknown[]) {
      const next = statement(sql, bound);
      statements.push(next);
      return next;
    },
    first: async <T>() => {
      if (sql.includes('FROM livebench_releases AS releases')) return validation as T | null;
      if (sql.includes('FROM livebench_publication_state AS pointer')) return active as T | null;
      if (sql.includes('FROM livebench_releases')) return release as T | null;
      return null;
    },
    all: async <T>() => {
      if (sql.includes('FROM livebench_categories')) return { results: (facts.categories ?? []) as T[] };
      if (sql.includes('FROM livebench_tasks')) return { results: (facts.tasks ?? []) as T[] };
      if (sql.includes('FROM livebench_model_configurations')) return { results: (facts.models ?? []) as T[] };
      if (sql.includes('FROM livebench_task_scores')) return { results: (facts.scores ?? []) as T[] };
      if (sql.includes('FROM livebench_task_economics')) return { results: (facts.economics ?? []) as T[] };
      return { results: [] as T[] };
    },
    run: async () => ({ meta: { changes: 1 } }),
  });
  return {
    statements,
    batches,
    prepare(sql: string) {
      return statement(sql);
    },
    async batch(batch: readonly LiveBenchD1Statement[]) {
      batches.push([...batch] as FakeStatement[]);
      return batch.map(() => ({ meta: { changes: 1 } }));
    },
  };
}

function stageInput(db: FakeDatabase) {
  return {
    db,
    bundle,
    descriptor,
    revision: REVISION,
    attemptId: ATTEMPT_ID,
    releaseKind: 'current' as const,
    sourceRevision: `${bundle.releaseId}@${bundle.sourceCommit}`,
    sourceManifestKey: 'evidence/benchmark/livebench/livebench-attempt-1/manifest.json',
    sourceManifestHash: DIGEST,
    checkedAt: CHECKED_AT,
    releasedAt: RELEASED_AT,
    license: {
      licenseId: 'Apache-2.0',
      verificationState: 'verified' as const,
      verificationUrl: 'https://example.com/license-review',
      verifiedAt: CHECKED_AT,
      verifiedBy: 'reviewer',
      attributionText: 'LiveBench source attribution',
    },
    identities: [
      {
        configurationId: 'livebench:alpha', canonicalConfigurationId: null,
        matchKind: 'proposal' as const, reviewStatus: 'needs_review' as const,
        reviewedBy: null, evidenceUrl: null,
      },
      {
        configurationId: 'livebench:beta', canonicalConfigurationId: 'canonical:beta',
        matchKind: 'reviewed' as const, reviewStatus: 'verified' as const,
        reviewedBy: 'reviewer', evidenceUrl: 'https://example.com/identity-review',
      },
    ],
  };
}

function lease(attemptId = ATTEMPT_ID, epoch = 1): LiveBenchPublicationLease {
  return { attemptId, epoch };
}

function sourceRevisionFor(attemptId: string): string {
  return `${bundle.releaseId}@${bundle.sourceCommit}:${attemptId}`;
}

function seedSqliteSourceEvidence(sqlite: DatabaseSync, attemptId: string): string {
  const sourceRevision = sourceRevisionFor(attemptId);
  const manifestKey = `evidence/benchmark/livebench/${attemptId}/manifest.json`;
  sqlite.prepare(`INSERT INTO source_revision_manifests (
    domain, source_id, source_revision, attempt_id, upstream_revision,
    release_id, license_id, r2_manifest_key, content_hash, parser_version,
    observed_at, status
  ) VALUES ('benchmark', 'livebench', ?, ?, ?, ?, 'Apache-2.0', ?, ?, 'livebench-parser-v1', ?, 'validated')`)
    .run(
      sourceRevision,
      attemptId,
      bundle.sourceCommit,
      bundle.releaseId,
      manifestKey,
      DIGEST,
      CHECKED_AT,
    );
  const artifactInsert = sqlite.prepare(`INSERT INTO source_artifacts (
    domain, source_id, source_revision, artifact_id, upstream_url,
    r2_key, content_type, byte_length, content_hash, upstream_blob_id
  ) VALUES ('benchmark', 'livebench', ?, ?, ?, ?, ?, 1, ?, ?)`);
  for (const artifact of descriptor.artifacts) {
    artifactInsert.run(
      sourceRevision,
      artifact.artifactId,
      artifact.rawUrl,
      `evidence/benchmark/livebench/${attemptId}/${artifact.artifactId}`,
      artifact.artifactId === 'categories' ? 'application/json' : 'text/plain',
      DIGEST,
      artifact.blobId,
    );
  }
  return sourceRevision;
}

async function stageValidatedSqliteCandidate(
  sqlite: DatabaseSync,
  d1: LiveBenchD1Database,
  revision: string,
  attemptId: string,
): Promise<void> {
  const sourceRevision = seedSqliteSourceEvidence(sqlite, attemptId);
  await stageLiveBenchRelease({
    ...stageInput(database()),
    db: d1,
    revision,
    attemptId,
    sourceRevision,
    sourceManifestKey: `evidence/benchmark/livebench/${attemptId}/manifest.json`,
    identities: bundle.models.map((model) => ({
      configurationId: model.configurationId,
      canonicalConfigurationId: null,
      matchKind: 'proposal' as const,
      reviewStatus: 'needs_review' as const,
      reviewedBy: null,
      evidenceUrl: null,
    })),
  });
  await validateLiveBenchRelease({ db: d1, revision, attemptId });
}

describe('LiveBench D1 staging and publication', () => {
  it('stages immutable release rows in bounded attempt-owned batches and preserves a reviewed-null identity explicitly', async () => {
    const db = database();
    await stageLiveBenchRelease(stageInput(db));

    expect(db.batches).toHaveLength(1);
    expect(db.batches.every((batch) => batch.length <= LIVEBENCH_STAGE_BATCH_SIZE)).toBe(true);
    const modelStatement = db.statements.find(({ sql }) => sql.includes('livebench_model_configurations'));
    const stagedModels = JSON.parse(String(modelStatement?.values[2])) as Record<string, unknown>[];
    expect(stagedModels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configurationId: 'livebench:alpha',
        canonicalConfigurationId: null,
        identityMatchKind: 'proposal',
        identityReviewStatus: 'needs_review',
      }),
    ]));
    expect(db.statements.filter(({ sql }) => sql.includes('livebench_') && sql.includes('INSERT OR IGNORE'))
      .every(({ values }) => values.includes(REVISION) && values.includes(ATTEMPT_ID))).toBe(true);
  });

  it('stages an actual-size 44 by 23 release below the free-plan D1 query budget', async () => {
    const categories = Array.from({ length: 7 }, (_, index) => ({
      categoryId: `category-${index}`,
      label: `Category ${index}`,
      taskIds: Array.from({ length: 23 }, (_value, taskIndex) => taskIndex)
        .filter((taskIndex) => taskIndex % 7 === index)
        .map((taskIndex) => `task-${taskIndex}`),
    }));
    const tasks = Array.from({ length: 23 }, (_, index) => ({
      taskId: `task-${index}`,
      label: `Task ${index}`,
      categoryId: `category-${index % 7}`,
    }));
    const models = Array.from({ length: 44 }, (_, index) => ({
      configurationId: `livebench:model-${index}`,
      sourceModelId: `model-${index}`,
      displayName: `Model ${index}`,
      organization: `Organization ${index % 8}`,
      openWeights: index % 3 === 0 ? true : index % 3 === 1 ? false : null,
      reasoner: index % 2 === 0,
      isDerivativeFinetune: false,
      baseConfigurationId: null,
      lineageSourceUrl: null,
    }));
    const productionSizedBundle: LiveBenchReleaseBundle = {
      ...bundle,
      categories,
      tasks,
      models,
      taskScores: models.flatMap((model, modelIndex) => tasks.map((task, taskIndex) => ({
        configurationId: model.configurationId,
        taskId: task.taskId,
        score: (modelIndex + taskIndex) % 101,
      }))),
      taskEconomics: models.flatMap((model) => tasks.map((task) => ({
        configurationId: model.configurationId,
        taskId: task.taskId,
        questionCount: 10,
        evaluationCostUsd: 0.1,
        inputPriceUsdPerMillion: null,
        outputPriceUsdPerMillion: null,
        meanInputTokens: null,
        meanOutputTokens: null,
      }))),
    };
    const db = database();
    await stageLiveBenchRelease({
      ...stageInput(db),
      bundle: productionSizedBundle,
      identities: models.map((model) => ({
        configurationId: model.configurationId,
        canonicalConfigurationId: null,
        matchKind: 'proposal' as const,
        reviewStatus: 'needs_review' as const,
        reviewedBy: null,
        evidenceUrl: null,
      })),
    });

    expect(productionSizedBundle.taskScores).toHaveLength(1_012);
    expect(productionSizedBundle.taskEconomics).toHaveLength(1_012);
    // Four metadata collections + 44×23 scores + 44×23 economics fit in six
    // json_each inserts; add the release insert and ownership read = eight.
    expect(db.statements).toHaveLength(8);
    expect(db.statements.length).toBeLessThanOrEqual(LIVEBENCH_STAGE_MAX_D1_STATEMENTS);
    expect(db.batches.flat()).toHaveLength(db.statements.length - 2);
    expect(db.batches.flat().length + 2).toBeLessThanOrEqual(LIVEBENCH_STAGE_MAX_D1_STATEMENTS);
    const jsonPayloads = db.statements.flatMap(({ values }) => values)
      .filter((value): value is string => typeof value === 'string' && value.startsWith('[{'));
    expect(jsonPayloads.length).toBeGreaterThanOrEqual(6);
    expect(jsonPayloads.every((value) => new TextEncoder().encode(value).byteLength <= LIVEBENCH_STAGE_JSON_CHUNK_BYTES))
      .toBe(true);
  });

  it('executes JSON staging, validation, and publication against real SQLite', async () => {
    const { sqlite, d1 } = sqliteDatabase();
    const sourceRevision = `${bundle.releaseId}@${bundle.sourceCommit}`;
    try {
      sqlite.prepare(`INSERT INTO source_revision_manifests (
        domain, source_id, source_revision, attempt_id, upstream_revision,
        release_id, license_id, r2_manifest_key, content_hash, parser_version,
        observed_at, status
      ) VALUES ('benchmark', 'livebench', ?, ?, ?, ?, 'Apache-2.0', ?, ?, 'livebench-parser-v1', ?, 'validated')`)
        .run(
          sourceRevision,
          ATTEMPT_ID,
          bundle.sourceCommit,
          bundle.releaseId,
          'evidence/benchmark/livebench/livebench-attempt-1/manifest.json',
          DIGEST,
          CHECKED_AT,
        );
      const artifactInsert = sqlite.prepare(`INSERT INTO source_artifacts (
        domain, source_id, source_revision, artifact_id, upstream_url,
        r2_key, content_type, byte_length, content_hash, upstream_blob_id
      ) VALUES ('benchmark', 'livebench', ?, ?, ?, ?, ?, 1, ?, ?)`);
      for (const artifact of descriptor.artifacts) {
        artifactInsert.run(
          sourceRevision,
          artifact.artifactId,
          artifact.rawUrl,
          `evidence/benchmark/livebench/${ATTEMPT_ID}/${artifact.artifactId}`,
          artifact.artifactId === 'categories' ? 'application/json' : 'text/plain',
          DIGEST,
          artifact.blobId,
        );
      }

      const checkpointedStage = {
        ...stageInput(database()),
        db: d1,
        identities: bundle.models.map((model) => ({
          configurationId: model.configurationId,
          canonicalConfigurationId: null,
          matchKind: 'proposal' as const,
          reviewStatus: 'needs_review' as const,
          reviewedBy: null,
          evidenceUrl: null,
        })),
      };
      await stageLiveBenchRelease(checkpointedStage);
      // The release+attempt is a durable checkpoint: a retry repeats the
      // deterministic bulk plan without duplicating immutable facts.
      await stageLiveBenchRelease(checkpointedStage);
      await validateLiveBenchRelease({ db: d1, revision: REVISION, attemptId: ATTEMPT_ID });
      const publicationLease = await acquireLiveBenchPublicationLease({
        db: d1,
        attemptId: ATTEMPT_ID,
        acquiredAt: PUBLISHED_AT,
      });
      await publishLiveBenchRelease({
        db: d1,
        revision: REVISION,
        attemptId: ATTEMPT_ID,
        lease: publicationLease,
        publishedAt: PUBLISHED_AT,
      });
      const active = await readActiveLiveBenchBundle(d1);

      expect(active?.release.revision).toBe(REVISION);
      expect(active?.bundle).toEqual(bundle);
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM livebench_task_scores').get())
        .toEqual({ count: 4 });
    } finally {
      sqlite.close();
    }
  });

  it('atomically rejects a stale completion after a later persisted lease is acquired', async () => {
    const { sqlite, d1 } = sqliteDatabase();
    const oldRevision = 'livebench-last-good';
    const oldAttempt = 'attempt-last-good';
    const staleRevision = 'livebench-stale';
    const staleAttempt = 'attempt-stale';
    const newerRevision = 'livebench-newer';
    const newerAttempt = 'attempt-newer';
    try {
      await stageValidatedSqliteCandidate(sqlite, d1, oldRevision, oldAttempt);
      const oldLease = await acquireLiveBenchPublicationLease({
        db: d1,
        attemptId: oldAttempt,
        acquiredAt: '2026-08-19T09:01:00.000Z',
      });
      await publishLiveBenchRelease({
        db: d1,
        revision: oldRevision,
        attemptId: oldAttempt,
        lease: oldLease,
        publishedAt: '2026-08-19T09:01:00.000Z',
      });

      await stageValidatedSqliteCandidate(sqlite, d1, staleRevision, staleAttempt);
      await stageValidatedSqliteCandidate(sqlite, d1, newerRevision, newerAttempt);
      const staleLease = await acquireLiveBenchPublicationLease({
        db: d1,
        attemptId: staleAttempt,
        acquiredAt: '2026-08-19T09:02:00.000Z',
      });
      const newerLease = await acquireLiveBenchPublicationLease({
        db: d1,
        attemptId: newerAttempt,
        acquiredAt: '2026-08-19T09:03:00.000Z',
      });

      expect(staleLease.epoch).toBeLessThan(newerLease.epoch);
      await expect(isLiveBenchPublicationLeaseCurrent({ db: d1, lease: staleLease })).resolves.toBe(false);
      await expect(isLiveBenchPublicationLeaseCurrent({ db: d1, lease: newerLease })).resolves.toBe(true);
      await expect(publishLiveBenchRelease({
        db: d1,
        revision: staleRevision,
        attemptId: staleAttempt,
        lease: staleLease,
        publishedAt: '2026-08-19T09:04:00.000Z',
      })).rejects.toBeInstanceOf(LiveBenchPublicationLeaseError);

      expect(sqlite.prepare('SELECT publication_state FROM livebench_releases WHERE revision = ?').get(staleRevision))
        .toEqual({ publication_state: 'validated' });
      expect(sqlite.prepare('SELECT active_revision FROM livebench_publication_state WHERE singleton = 1').get())
        .toEqual({ active_revision: oldRevision });

      await publishLiveBenchRelease({
        db: d1,
        revision: newerRevision,
        attemptId: newerAttempt,
        lease: newerLease,
        publishedAt: '2026-08-19T09:05:00.000Z',
      });
      expect(sqlite.prepare('SELECT active_revision FROM livebench_publication_state WHERE singleton = 1').get())
        .toEqual({ active_revision: newerRevision });
      expect(sqlite.prepare('SELECT current_epoch, active_epoch FROM livebench_publication_epochs WHERE singleton = 1').get())
        .toEqual({ current_epoch: newerLease.epoch, active_epoch: newerLease.epoch });
    } finally {
      sqlite.close();
    }
  });

  it('rejects incomplete artifact coverage before the candidate can become validated', async () => {
    const db = database({ validation: completeValidation({ missing_artifact_count: 1 }) });

    await expect(validateLiveBenchRelease({ db, revision: REVISION, attemptId: ATTEMPT_ID }))
      .rejects.toThrow(/artifact/i);
    expect(db.statements.some(({ sql }) => sql.includes("publication_state = 'validated'"))).toBe(false);
  });

  it('requires independently verified CDLA evidence before the candidate can become validated', async () => {
    const db = database({ validation: completeValidation({ verified_cdla_license: 0 }) });

    await expect(validateLiveBenchRelease({ db, revision: REVISION, attemptId: ATTEMPT_ID }))
      .rejects.toThrow(/license/i);
    expect(db.statements.some(({ sql }) => sql.includes("publication_state = 'validated'"))).toBe(false);
  });

  it('promotes only a validated current release in one final pointer batch', async () => {
    const db = database({ release: stagedRelease({ publication_state: 'validated' }) });
    const result = await publishLiveBenchRelease({
      db,
      revision: REVISION,
      attemptId: ATTEMPT_ID,
      lease: lease(),
      publishedAt: PUBLISHED_AT,
    });

    expect(result).toEqual({ revision: REVISION, publishedAt: PUBLISHED_AT });
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]).toHaveLength(3);
    expect(db.batches[0]?.[1]?.sql).toContain('livebench_publication_state');
    expect(db.batches[0]?.[0]?.sql).toContain('livebench_publication_epochs');
    expect(db.batches[0]?.[2]?.sql).toContain('active_epoch');
  });

  it('never allows a historical release to move the active pointer', async () => {
    const db = database({ release: stagedRelease({ release_kind: 'historical', publication_state: 'validated' }) });

    await expect(publishLiveBenchRelease({
      db,
      revision: REVISION,
      attemptId: ATTEMPT_ID,
      lease: lease(),
      publishedAt: PUBLISHED_AT,
    }))
      .rejects.toThrow(/historical/i);
    expect(db.batches).toHaveLength(0);
  });

  it('reads last-good data only through the current, published active pointer', async () => {
    const db = database({ active: stagedRelease({ publication_state: 'published', published_at: PUBLISHED_AT }) });
    const active = await readActiveLiveBenchRelease(db);

    expect(active).toMatchObject({ revision: REVISION, releaseKind: 'current', publishedAt: PUBLISHED_AT });
    const query = db.statements.find(({ sql }) => sql.includes('livebench_publication_state AS pointer'))?.sql;
    expect(query).toContain("release_kind = 'current'");
    expect(query).toContain("publication_state = 'published'");
  });

  it('reads and revalidates all active facts in deterministic order without mixing a historical revision', async () => {
    const db = database({
      active: stagedRelease({ publication_state: 'published', published_at: PUBLISHED_AT }),
      facts: {
        categories: bundle.categories.map(({ categoryId, label }) => ({ category_id: categoryId, label })),
        tasks: bundle.tasks.map(({ taskId, label, categoryId }) => ({ task_id: taskId, label, category_id: categoryId })),
        models: bundle.models.map((model) => ({
          configuration_id: model.configurationId,
          source_model_id: model.sourceModelId,
          display_name: model.displayName,
          organization: model.organization,
          open_weights: model.openWeights === null ? null : model.openWeights ? 1 : 0,
          reasoner: model.reasoner === null ? null : model.reasoner ? 1 : 0,
          is_derivative_finetune: model.isDerivativeFinetune ? 1 : 0,
          base_configuration_id: model.baseConfigurationId,
          lineage_source_url: model.lineageSourceUrl,
        })),
        scores: bundle.taskScores.map(({ configurationId, taskId, score }) => ({
          configuration_id: configurationId, task_id: taskId, score,
        })),
        economics: bundle.taskEconomics.map((economics) => ({
          configuration_id: economics.configurationId,
          task_id: economics.taskId,
          question_count: economics.questionCount,
          evaluation_cost_usd: economics.evaluationCostUsd,
          input_price_usd_per_million: economics.inputPriceUsdPerMillion,
          output_price_usd_per_million: economics.outputPriceUsdPerMillion,
          mean_input_tokens: economics.meanInputTokens,
          mean_output_tokens: economics.meanOutputTokens,
        })),
      },
    });

    const active = await readActiveLiveBenchBundle(db);

    expect(active?.release).toMatchObject({ revision: REVISION, releaseKind: 'current' });
    expect(active?.bundle).toEqual(bundle);
    const queries = db.statements.map(({ sql }) => sql);
    expect(queries.some((sql) => sql.includes('livebench_categories') && sql.includes('ORDER BY category_id ASC'))).toBe(true);
    expect(queries.some((sql) => sql.includes('livebench_tasks') && sql.includes('ORDER BY category_id ASC, task_id ASC'))).toBe(true);
    expect(queries.some((sql) => sql.includes('livebench_task_scores') && sql.includes('ORDER BY configuration_id ASC, task_id ASC'))).toBe(true);
  });
});
