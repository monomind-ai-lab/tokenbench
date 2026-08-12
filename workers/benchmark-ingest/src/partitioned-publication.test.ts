import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { BenchmarkCandidateManifestV1 } from './candidate-storage';
import { candidateKeyPrefix } from './candidate-storage';
import type { DerivedPartitionKind, DerivedPartitionReceipt } from './candidate-derivation';
import { derivedPartitionToCandidate } from './candidate-derivation';
import {
  type D1Database,
  cleanupStagedBenchmarkFacts,
  ensurePendingBenchmarkRevision,
  stageBenchmarkFactPartition,
  validateStagedBenchmarkFacts,
} from './partitioned-publication';

const CYCLE_ID = '11111111-2222-4333-8444-555555555555';
const OTHER_CYCLE_ID = '99999999-8888-4777-8666-555555555555';
const REVISION = 'benchmark_00000000000000000000000000000001';
const OTHER_REVISION = 'benchmark_00000000000000000000000000000002';
const CATALOG_REVISION = 'catalog_rev_1';
const CHECKED_AT = '2026-08-05T12:00:00.000Z';
const CONTENT_HASH = `sha256:${'a'.repeat(64)}`;

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

class FakeR2Bucket {
  readonly store = new Map<string, Uint8Array>();

  async get(key: string) {
    const bytes = this.store.get(key);
    if (!bytes) return null;
    return {
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    };
  }

  async put(key: string, value: ArrayBufferView) {
    this.store.set(key, new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)));
    return undefined;
  }
}

const PK_BY_TABLE: Record<string, (row: Record<string, unknown>) => string> = {
  benchmark_source_records: (row) => `${row.sourceId}\u0000${row.artifactId}`,
  benchmark_models: (row) => String(row.modelKey),
  benchmark_metrics: (row) => `${row.modelKey}\u0000${row.metricKey}`,
  benchmark_price_checks: (row) => `${row.modelKey}\u0000${row.sourceId}\u0000${row.providerId}\u0000${row.routeId}`,
  benchmark_comparison_pairs: (row) => String(row.pairSlug),
};

interface RevisionRow {
  state: string;
  attempt: string | null;
}

class FakeD1 implements D1Database {
  readonly revisions = new Map<string, RevisionRow>();
  readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  pointer: string | null = null;
  readonly prepared: string[] = [];

  constructor() {
    for (const table of Object.keys(PK_BY_TABLE)) this.tables.set(table, new Map());
  }

  private tableFor(table: string): Map<string, Record<string, unknown>> {
    const map = this.tables.get(table);
    if (!map) throw new Error(`unknown table ${table}`);
    return map;
  }

  prepare(sql: string) {
    this.prepared.push(sql);
    return new FakeStatement(this, sql);
  }

  async batch(statements: { run(): Promise<{ meta?: { changes?: number } }> }[]) {
    for (const statement of statements) await statement.run();
    return undefined;
  }

  run(sql: string, values: unknown[]): { meta: { changes: number } } {
    if (sql.startsWith('INSERT OR IGNORE INTO benchmark_revisions')) {
      const [revision, , , , , , , attempt] = values as string[];
      if (this.revisions.has(revision)) return { meta: { changes: 0 } };
      this.revisions.set(revision, { state: 'pending', attempt });
      return { meta: { changes: 1 } };
    }
    const insert = /^INSERT OR IGNORE INTO (\w+)/.exec(sql);
    if (insert) {
      const table = insert[1];
      const [revision, jsonArray, revisionExists, attempt] = values as [string, string, string, string];
      const owner = this.revisions.get(revisionExists);
      if (!owner || owner.state !== 'pending' || owner.attempt !== attempt) return { meta: { changes: 0 } };
      const rows = JSON.parse(jsonArray) as Record<string, unknown>[];
      const map = this.tableFor(table);
      let changes = 0;
      for (const row of rows) {
        const key = `${revision}\u0000${PK_BY_TABLE[table](row)}`;
        if (!map.has(key)) {
          map.set(key, row);
          changes += 1;
        }
      }
      return { meta: { changes } };
    }
    if (sql.startsWith('DELETE FROM benchmark_revisions')) {
      const [revision, attempt] = values as string[];
      const owner = this.revisions.get(revision);
      if (owner && owner.state === 'pending' && owner.attempt === attempt) {
        this.revisions.delete(revision);
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    const del = /^DELETE FROM (\w+)/.exec(sql);
    if (del) {
      const table = del[1];
      const [revision, revisionExists, attempt] = values as string[];
      const owner = this.revisions.get(revisionExists);
      if (!owner || owner.state !== 'pending' || owner.attempt !== attempt) return { meta: { changes: 0 } };
      const map = this.tableFor(table);
      let changes = 0;
      for (const key of [...map.keys()]) {
        if (key.startsWith(`${revision}\u0000`)) {
          map.delete(key);
          changes += 1;
        }
      }
      return { meta: { changes } };
    }
    throw new Error(`unhandled run sql: ${sql}`);
  }

  first(sql: string, values: unknown[]): Record<string, unknown> | null {
    if (sql.startsWith('SELECT publication_state')) {
      const owner = this.revisions.get(values[0] as string);
      return owner ? { state: owner.state, attempt: owner.attempt } : null;
    }
    if (sql.startsWith('SELECT active_revision')) {
      return { active: this.pointer };
    }
    const count = /^SELECT COUNT\(\*\) AS n FROM (\w+)/.exec(sql);
    if (count) {
      const map = this.tableFor(count[1]);
      const revision = values[0] as string;
      let n = 0;
      for (const key of map.keys()) if (key.startsWith(`${revision}\u0000`)) n += 1;
      return { n };
    }
    throw new Error(`unhandled first sql: ${sql}`);
  }
}

class FakeStatement {
  private values: unknown[] = [];

  constructor(private readonly db: FakeD1, private readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async run() {
    return this.db.run(this.sql, this.values);
  }

  async first<T = Record<string, unknown>>() {
    return this.db.first(this.sql, this.values) as T | null;
  }

  async all<T = Record<string, unknown>>() {
    return { results: [] as T[] };
  }
}

function receiptFor(
  bucket: FakeR2Bucket,
  cycleId: string,
  kind: DerivedPartitionKind,
  index: number,
  rows: readonly unknown[],
): DerivedPartitionReceipt {
  const bytes = new TextEncoder().encode(JSON.stringify({ kind, index, rows }));
  const contentHash = sha256(bytes) as `sha256:${string}`;
  const key = `${candidateKeyPrefix(cycleId)}derived/${contentHash.slice('sha256:'.length)}.json`;
  bucket.store.set(key, bytes);
  return { kind, index, rowCount: rows.length, key, contentHash, byteLength: bytes.byteLength };
}

function factRows() {
  return {
    sources: [{
      sourceId: 'benchlm', artifactId: 'public-leaderboard', sourceUrl: 'https://benchlm.ai/data/public-leaderboard.json',
    }],
    models: [
      { modelKey: 'claude-opus-9', slug: 'claude-opus-9' },
      { modelKey: 'gpt-5-6-sol', slug: 'gpt-5-6-sol' },
    ],
    metrics: [
      { modelKey: 'gpt-5-6-sol', metricKey: 'benchlm:category:coding', value: 77.95 },
      { modelKey: 'gpt-5-6-sol', metricKey: 'benchlm:overall:raw', value: 81.48 },
      { modelKey: 'claude-opus-9', metricKey: 'benchlm:category:coding', value: 76.4 },
    ],
    prices: [
      { modelKey: 'gpt-5-6-sol', sourceId: 'benchlm', providerId: 'openai', routeId: 'openai/gpt-5-6-sol' },
      { modelKey: 'claude-opus-9', sourceId: 'benchlm', providerId: 'anthropic', routeId: 'anthropic/claude-opus-9' },
    ],
    comparisons: [{ pairSlug: 'claude-opus-9-vs-gpt-5-6-sol', modelAKey: 'claude-opus-9', modelBKey: 'gpt-5-6-sol' }],
  };
}

/** One derived partition per kind, written to R2 with authentic receipts. */
function derivedPartitions(bucket: FakeR2Bucket, cycleId = CYCLE_ID): DerivedPartitionReceipt[] {
  const rows = factRows();
  return (Object.keys(rows) as DerivedPartitionKind[]).map((kind) => receiptFor(bucket, cycleId, kind, 0, rows[kind]));
}

function manifestWith(partitions: readonly DerivedPartitionReceipt[]): BenchmarkCandidateManifestV1 {
  return {
    schemaVersion: 1,
    cycleId: CYCLE_ID,
    frozenCatalogRevision: CATALOG_REVISION,
    previousBenchmarkRevision: null,
    checkedAt: CHECKED_AT,
    benchLm: [],
    liteLlm: null,
    lmArenaRevision: null,
    lmArena: [],
    normalizedPartitions: [],
    derivedPartitions: partitions.map(derivedPartitionToCandidate),
  };
}

async function seedPendingRevision(db: FakeD1, cycleId = CYCLE_ID, revision = REVISION): Promise<void> {
  await ensurePendingBenchmarkRevision({
    db,
    cycleId,
    revision,
    generatedAt: CHECKED_AT,
    checkedAt: CHECKED_AT,
    contentHash: CONTENT_HASH,
    catalogRevision: CATALOG_REVISION,
    openrouterContentHash: CONTENT_HASH,
  });
}

describe('partitioned benchmark fact staging', () => {
  it('creates the pending revision once and reports idempotent creation', async () => {
    const db = new FakeD1();
    expect(await ensurePendingBenchmarkRevision({
      db, cycleId: CYCLE_ID, revision: REVISION, generatedAt: CHECKED_AT, checkedAt: CHECKED_AT,
      contentHash: CONTENT_HASH, catalogRevision: CATALOG_REVISION, openrouterContentHash: CONTENT_HASH,
    })).toBe('created');
    expect(await ensurePendingBenchmarkRevision({
      db, cycleId: CYCLE_ID, revision: REVISION, generatedAt: CHECKED_AT, checkedAt: CHECKED_AT,
      contentHash: CONTENT_HASH, catalogRevision: CATALOG_REVISION, openrouterContentHash: CONTENT_HASH,
    })).toBe('exists');
    await expect(seedPendingRevision(db, OTHER_CYCLE_ID)).rejects.toThrow('owned by another attempt');
  });

  it('stages one partition per alarm and validates the exact staged counts', async () => {
    const db = new FakeD1();
    const bucket = new FakeR2Bucket();
    const partitions = derivedPartitions(bucket);
    await seedPendingRevision(db);

    for (const partition of partitions) {
      const staged = await stageBenchmarkFactPartition({ db, bucket, cycleId: CYCLE_ID, revision: REVISION, partition });
      expect(staged.statements).toBe(1);
      expect(staged.rows).toBe(partition.rowCount);
    }

    const counts = await validateStagedBenchmarkFacts({ db, cycleId: CYCLE_ID, revision: REVISION, manifest: manifestWith(partitions) });
    expect(counts).toEqual({ sources: 1, models: 2, metrics: 3, prices: 2, comparisons: 1 });
    // The public pointer never moved while staging inactive rows.
    expect(db.pointer).toBeNull();
  });

  it('treats a duplicate partition alarm as a no-op', async () => {
    const db = new FakeD1();
    const bucket = new FakeR2Bucket();
    const [models] = derivedPartitions(bucket).filter((partition) => partition.kind === 'models');
    await seedPendingRevision(db);

    const first = await stageBenchmarkFactPartition({ db, bucket, cycleId: CYCLE_ID, revision: REVISION, partition: models });
    const second = await stageBenchmarkFactPartition({ db, bucket, cycleId: CYCLE_ID, revision: REVISION, partition: models });
    expect(first.rows).toBe(2);
    expect(second).toEqual({ statements: 1, rows: 0 });
    expect(db.tables.get('benchmark_models')?.size).toBe(2);
  });

  it('rejects staging into a revision owned by a foreign attempt', async () => {
    const db = new FakeD1();
    const bucket = new FakeR2Bucket();
    const [models] = derivedPartitions(bucket).filter((partition) => partition.kind === 'models');
    await seedPendingRevision(db, OTHER_CYCLE_ID);

    await expect(stageBenchmarkFactPartition({ db, bucket, cycleId: CYCLE_ID, revision: REVISION, partition: models }))
      .rejects.toThrow('owned by another attempt');
    expect(db.tables.get('benchmark_models')?.size).toBe(0);
  });

  it('never prepares a public pointer mutation and rejects a pointer collision', async () => {
    const db = new FakeD1();
    const bucket = new FakeR2Bucket();
    const partitions = derivedPartitions(bucket);
    await seedPendingRevision(db);
    for (const partition of partitions) {
      await stageBenchmarkFactPartition({ db, bucket, cycleId: CYCLE_ID, revision: REVISION, partition });
    }
    await validateStagedBenchmarkFacts({ db, cycleId: CYCLE_ID, revision: REVISION, manifest: manifestWith(partitions) });

    const pointerMutations = db.prepared.filter((sql) =>
      /^(INSERT|UPDATE|DELETE)\b/.test(sql)
      && /\b(benchmark_publication_state|api_response_publication_state)\b/.test(sql));
    expect(pointerMutations).toEqual([]);

    db.pointer = REVISION;
    await expect(validateStagedBenchmarkFacts({ db, cycleId: CYCLE_ID, revision: REVISION, manifest: manifestWith(partitions) }))
      .rejects.toThrow('already references pending revision');
  });

  it('scopes failure cleanup to the current attempt', async () => {
    const db = new FakeD1();
    const bucket = new FakeR2Bucket();
    await seedPendingRevision(db, CYCLE_ID, REVISION);
    await seedPendingRevision(db, OTHER_CYCLE_ID, OTHER_REVISION);
    for (const partition of derivedPartitions(bucket, CYCLE_ID)) {
      await stageBenchmarkFactPartition({ db, bucket, cycleId: CYCLE_ID, revision: REVISION, partition });
    }
    const otherBucket = new FakeR2Bucket();
    for (const partition of derivedPartitions(otherBucket, OTHER_CYCLE_ID)) {
      await stageBenchmarkFactPartition({ db, bucket: otherBucket, cycleId: OTHER_CYCLE_ID, revision: OTHER_REVISION, partition });
    }

    const removed = await cleanupStagedBenchmarkFacts({ db, cycleId: CYCLE_ID, revision: REVISION });
    // Five fact rows + models(2) + metrics(3) + prices(2) + comparisons(1) + sources(1) + the revision row.
    expect(removed).toBe(1 + 2 + 3 + 2 + 1 + 1);
    expect(db.revisions.has(REVISION)).toBe(false);

    // The foreign attempt's pending revision and staged rows are untouched.
    expect(db.revisions.has(OTHER_REVISION)).toBe(true);
    let otherModels = 0;
    for (const key of db.tables.get('benchmark_models')?.keys() ?? []) {
      if (key.startsWith(`${OTHER_REVISION}\u0000`)) otherModels += 1;
    }
    expect(otherModels).toBe(2);
  });

  it('rejects a partition that exceeds the D1 parameter safety limit', async () => {
    const db = new FakeD1();
    const bucket = new FakeR2Bucket();
    await seedPendingRevision(db);
    const oversized = receiptFor(bucket, CYCLE_ID, 'models', 0, [
      { modelKey: 'huge', slug: 'huge', pad: 'x'.repeat(1_600_000) },
    ]);

    await expect(stageBenchmarkFactPartition({ db, bucket, cycleId: CYCLE_ID, revision: REVISION, partition: oversized }))
      .rejects.toThrow('1.5MB');
  });

  it('rejects validation when staged counts do not match the manifest', async () => {
    const db = new FakeD1();
    const bucket = new FakeR2Bucket();
    const partitions = derivedPartitions(bucket);
    await seedPendingRevision(db);
    // Stage every partition except metrics, so the metrics count will be short.
    for (const partition of partitions.filter((entry) => entry.kind !== 'metrics')) {
      await stageBenchmarkFactPartition({ db, bucket, cycleId: CYCLE_ID, revision: REVISION, partition });
    }

    await expect(validateStagedBenchmarkFacts({ db, cycleId: CYCLE_ID, revision: REVISION, manifest: manifestWith(partitions) }))
      .rejects.toThrow('staged metrics count 0 does not match the expected 3');
  });
});
