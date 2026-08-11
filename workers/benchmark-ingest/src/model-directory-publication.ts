import type { ActiveBenchmarkSnapshot } from '../../../functions/_shared/benchmark-db';
import {
  directoryRecordFromModel,
  selectPopularModelRanks,
  weekStartUtc,
} from '../../../src/benchmarks/model-directory';
import {
  buildModelProfileSnapshot,
  serializeModelProfileSnapshot,
} from '../../../src/benchmarks/model-profile';
import type { ModelDirectoryRecord } from '../../../src/benchmarks/model-directory';
import {
  joinPublicLeaderboardRows,
  type BenchLmPublicLeaderboard,
} from './benchlm-public-leaderboard';

const MAX_D1_BOUND_PARAMETERS = 100;
const MAX_D1_SQL_BYTES = 100 * 1024;
const MAX_D1_JSON_PARAMETER_BYTES = 1_500_000;
const MAX_D1_PUBLICATION_STATEMENTS = 900;
const INVALID_JSON_SENTINEL = '!not-json!';

export type BoundStatement = {
  bind(...values: unknown[]): BoundStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};

export type D1Database = {
  prepare(sql: string): BoundStatement;
};

const serializedStatementBytes = new WeakMap<object, number>();

/** Lets the worker's RPC splitter account for statements created here. */
export function modelDirectoryStatementBytes(statement: BoundStatement): number | undefined {
  return serializedStatementBytes.get(statement as object);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function boundedStatement(db: D1Database, sql: string, values: readonly unknown[]): BoundStatement {
  if (byteLength(sql) > MAX_D1_SQL_BYTES) throw new Error('D1 SQL statement exceeds the 100KB limit');
  if (values.length > MAX_D1_BOUND_PARAMETERS) throw new Error('D1 statement exceeds the 100 bound-parameter limit');
  for (const value of values) {
    if (typeof value === 'string' && byteLength(value) > MAX_D1_JSON_PARAMETER_BYTES) {
      throw new Error('D1 bound string exceeds the 1.5MB ingestion safety limit');
    }
  }
  const statement = db.prepare(sql).bind(...values);
  if (sql.startsWith('INSERT INTO benchmark_model_revision_membership')
    || sql.startsWith('INSERT INTO benchmark_model_profile_snapshots')
    || sql.startsWith('SELECT CASE WHEN EXISTS')) {
    modelDirectoryStagingStatements.add(statement as object);
  }
  serializedStatementBytes.set(statement as object, byteLength(JSON.stringify({ sql, values })));
  return statement;
}

const modelDirectoryStagingStatements = new WeakSet<object>();
export function isModelDirectoryStagingStatement(statement: BoundStatement): boolean {
  return modelDirectoryStagingStatements.has(statement as object);
}
function jsonPayloads<T>(rows: readonly T[], label: string): string[] {
  const payloads: string[] = [];
  let chunk: string[] = [];
  let chunkBytes = 2;
  for (const row of rows) {
    const encoded = JSON.stringify(row);
    if (encoded === undefined) throw new Error(`${label} row is not JSON serializable`);
    const encodedBytes = byteLength(encoded);
    if (encodedBytes + 2 > MAX_D1_JSON_PARAMETER_BYTES) {
      throw new Error(`${label} row exceeds the 1.5MB D1 ingestion safety limit`);
    }
    const nextBytes = chunkBytes + (chunk.length === 0 ? 0 : 1) + encodedBytes;
    if (chunk.length > 0 && nextBytes > MAX_D1_JSON_PARAMETER_BYTES) {
      payloads.push(`[${chunk.join(',')}]`);
      chunk = [];
      chunkBytes = 2;
    }
    chunk.push(encoded);
    chunkBytes += (chunk.length === 1 ? 0 : 1) + encodedBytes;
  }
  if (chunk.length > 0) payloads.push(`[${chunk.join(',')}]`);
  return payloads;
}

function appendJsonEachStatements<T>(
  statements: BoundStatement[],
  db: D1Database,
  sql: string,
  prefixValues: readonly unknown[],
  rows: readonly T[],
  label: string,
): void {
  for (const payload of jsonPayloads(rows, label)) {
    statements.push(boundedStatement(db, sql, [...prefixValues, payload]));
  }
}

const INSERT_MEMBERSHIP = `INSERT INTO benchmark_model_revision_membership
  (revision, model_key)
SELECT ?, json_extract(row.value, '$.modelKey')
FROM json_each(?) AS row
WHERE true
ON CONFLICT(revision, model_key) DO NOTHING`;

const INSERT_PROFILE = `INSERT INTO benchmark_model_profile_snapshots
  (model_key, revision, profile_json, content_hash, generated_at)
SELECT json_extract(row.value, '$.modelKey'), ?, json_extract(row.value, '$.profileJson'),
  json_extract(row.value, '$.contentHash'), json_extract(row.value, '$.generatedAt')
FROM json_each(?) AS row
WHERE true
ON CONFLICT(model_key, revision) DO NOTHING`;

const DIRECTORY_CONFLICT_CHECK = `SELECT CASE WHEN EXISTS (
  SELECT 1
  FROM benchmark_model_directory AS existing
  JOIN json_each(?) AS candidate
    ON (
      existing.model_key = json_extract(candidate.value, '$.modelKey')
      OR existing.canonical_slug = json_extract(candidate.value, '$.canonicalSlug')
    )
  WHERE (
    existing.model_key = json_extract(candidate.value, '$.modelKey')
      AND existing.canonical_slug <> json_extract(candidate.value, '$.canonicalSlug')
  ) OR (
    existing.model_key <> json_extract(candidate.value, '$.modelKey')
      AND existing.canonical_slug = json_extract(candidate.value, '$.canonicalSlug')
  )
) THEN json(?) ELSE 1 END`;

const UPSERT_DIRECTORY = `INSERT INTO benchmark_model_directory
  (model_key, canonical_slug, display_name, creator, source_type, reasoning_type, family_id, variant_id,
   first_seen_revision, first_seen_at, last_seen_revision, last_seen_at, latest_profile_revision,
   status, source_id, source_model_id, updated_at)
SELECT json_extract(row.value, '$.modelKey'), json_extract(row.value, '$.canonicalSlug'),
  json_extract(row.value, '$.displayName'), json_extract(row.value, '$.creator'),
  json_extract(row.value, '$.sourceType'), json_extract(row.value, '$.reasoningType'),
  json_extract(row.value, '$.familyId'), json_extract(row.value, '$.variantId'),
  json_extract(row.value, '$.firstSeenRevision'), json_extract(row.value, '$.firstSeenAt'),
  json_extract(row.value, '$.lastSeenRevision'), json_extract(row.value, '$.lastSeenAt'),
  json_extract(row.value, '$.latestProfileRevision'), json_extract(row.value, '$.status'),
  json_extract(row.value, '$.sourceId'), json_extract(row.value, '$.sourceModelId'),
  json_extract(row.value, '$.updatedAt')
FROM json_each(?) AS row
WHERE true
ON CONFLICT(model_key) DO UPDATE SET
  display_name = excluded.display_name,
  creator = excluded.creator,
  source_type = excluded.source_type,
  reasoning_type = excluded.reasoning_type,
  family_id = excluded.family_id,
  variant_id = excluded.variant_id,
  last_seen_revision = excluded.last_seen_revision,
  last_seen_at = excluded.last_seen_at,
  latest_profile_revision = excluded.latest_profile_revision,
  status = 'current',
  source_id = excluded.source_id,
  source_model_id = excluded.source_model_id,
  updated_at = excluded.updated_at,
  canonical_slug = benchmark_model_directory.canonical_slug`;

const ARCHIVE_ABSENT = `UPDATE benchmark_model_directory
SET status = 'archived', updated_at = ?
WHERE status = 'current'
  AND NOT EXISTS (
    SELECT 1
    FROM benchmark_model_revision_membership AS membership
    WHERE membership.revision = ?
      AND membership.model_key = benchmark_model_directory.model_key
  )`;
const INSERT_WEEK = `INSERT OR IGNORE INTO benchmark_popular_model_weeks
  (week_start, benchmark_revision, source_snapshot_id, methodology_version, generated_at)
VALUES (?, ?, ?, ?, ?)`;
const INSERT_RANKS = `WITH target AS (
  SELECT ? AS week_start, ? AS benchmark_revision
)
INSERT INTO benchmark_popular_model_ranks
  (week_start, rank, model_key)
SELECT json_extract(row.value, '$.weekStart'), json_extract(row.value, '$.rank'),
  json_extract(row.value, '$.modelKey')
FROM target
JOIN json_each(?) AS row
WHERE EXISTS (
  SELECT 1 FROM benchmark_popular_model_weeks
  WHERE week_start = target.week_start AND benchmark_revision = target.benchmark_revision
)
AND NOT EXISTS (
  SELECT 1 FROM benchmark_popular_model_ranks AS existing
  WHERE existing.week_start = target.week_start
)
ON CONFLICT(week_start, rank) DO NOTHING`;
function metricIdentity(metric: ActiveBenchmarkSnapshot['metrics'][number]): string {
  return `${metric.metricKey}\u0000${metric.sourceId}\u0000${metric.methodology}\u0000${metric.unit}`;
}

function profileSnapshotForModel(
  snapshot: ActiveBenchmarkSnapshot,
  model: ActiveBenchmarkSnapshot['models'][number],
  metricsByModel: ReadonlyMap<string, readonly ActiveBenchmarkSnapshot['metrics'][number][]>,
  metricsByIdentity: ReadonlyMap<string, readonly ActiveBenchmarkSnapshot['metrics'][number][]>,
  rankedMetricsByIdentity: ReadonlyMap<string, readonly ActiveBenchmarkSnapshot['metrics'][number][]>,
): ActiveBenchmarkSnapshot {
  const modelMetrics = metricsByModel.get(model.modelKey) ?? [];
  const metrics = new Proxy(modelMetrics.slice(), {
    get(target, property, receiver) {
      if (property !== 'filter') return Reflect.get(target, property, receiver);
      return (predicate: (value: ActiveBenchmarkSnapshot['metrics'][number], index: number, array: ActiveBenchmarkSnapshot['metrics'][number][]) => unknown, thisArg?: unknown) => {
        const targetMatches = target.filter(predicate, thisArg);
        for (const metric of target) {
          const peers = metricsByIdentity.get(metricIdentity(metric)) ?? [];
          const hasMatchingPeer = peers.some((candidate) => (
            candidate.modelKey !== model.modelKey
            && predicate.call(thisArg, candidate, 0, peers as ActiveBenchmarkSnapshot['metrics'][number][])
          ));
          if (hasMatchingPeer) {
            return rankedMetricsByIdentity.get(metricIdentity(metric)) ?? [];
          }
        }
        return targetMatches;
      };
    },
  });
  return {
    ...snapshot,
    models: [model],
    metrics: metrics as unknown as ActiveBenchmarkSnapshot['metrics'],
    priceChecks: snapshot.priceChecks.filter((price) => price.modelKey === model.modelKey),
    comparisonPairs: snapshot.comparisonPairs.filter((pair) => pair.modelAKey === model.modelKey || pair.modelBKey === model.modelKey),
  };
}

function requireCandidateIntegrity(
  snapshot: ActiveBenchmarkSnapshot,
  publicLeaderboard: BenchLmPublicLeaderboard,
  updatedAt: string,
): {
  readonly directoryRows: readonly ModelDirectoryRecord[];
  readonly profiles: readonly {
    readonly modelKey: string;
    readonly profileJson: string;
    readonly contentHash: string;
    readonly generatedAt: string;
  }[];
  readonly ranks: readonly { readonly weekStart: string; readonly rank: number; readonly modelKey: string }[];
  readonly weekStart: string;
} {
  if (!Number.isSafeInteger(snapshot.models.length) || snapshot.models.length === 0) {
    throw new Error('model directory publication requires at least one candidate model');
  }
  const modelKeys = new Set<string>();
  const slugs = new Set<string>();
  const metricsByModel = new Map<string, ActiveBenchmarkSnapshot['metrics'][number][]>();
  const metricsByIdentity = new Map<string, ActiveBenchmarkSnapshot['metrics'][number][]>();
  const rankedMetricsByIdentity = new Map<string, ActiveBenchmarkSnapshot['metrics'][number][]>();
  for (const metric of snapshot.metrics) {
    const modelRows = metricsByModel.get(metric.modelKey) ?? [];
    modelRows.push(metric);
    metricsByModel.set(metric.modelKey, modelRows);
    const identity = metricIdentity(metric);
    const identityRows = metricsByIdentity.get(identity) ?? [];
    identityRows.push(metric);
    metricsByIdentity.set(identity, identityRows);
    if (metric.rankingEligible && Number.isSafeInteger(metric.rank) && (metric.rank as number) > 0) {
      const rankedRows = rankedMetricsByIdentity.get(identity) ?? [];
      rankedRows.push(metric);
      rankedMetricsByIdentity.set(identity, rankedRows);
    }
  }
  const directoryRows: ModelDirectoryRecord[] = [];
  const profiles: {
    modelKey: string;
    profileJson: string;
    contentHash: string;
    generatedAt: string;
  }[] = [];
  for (const model of snapshot.models) {
    if (modelKeys.has(model.modelKey)) throw new Error(`model directory candidate repeats model key: ${model.modelKey}`);
    if (slugs.has(model.slug)) throw new Error(`model directory candidate repeats canonical slug: ${model.slug}`);
    modelKeys.add(model.modelKey);
    directoryRows.push(directoryRecordFromModel(model, snapshot.revision.revision, updatedAt));
    const profileSnapshot = profileSnapshotForModel(
      snapshot,
      model,
      metricsByModel,
      metricsByIdentity,
      rankedMetricsByIdentity,
    );
    const serialized = serializeModelProfileSnapshot(buildModelProfileSnapshot(profileSnapshot, model.modelKey));
    profiles.push({
      modelKey: model.modelKey,
      profileJson: serialized.profileJson,
      contentHash: serialized.contentHash,
      generatedAt: snapshot.revision.generatedAt,
    });
  }

  const joinedRows = joinPublicLeaderboardRows(
    snapshot.models.map((model) => ({
      sourceModelId: model.sourceModelId,
      modelKey: model.modelKey,
      name: model.name,
      creator: model.creator,
    })),
    publicLeaderboard,
  );
  const weekStart = weekStartUtc(updatedAt);
  const ranks = selectPopularModelRanks(
    weekStart,
    joinedRows.map((row) => ({ modelKey: row.modelKey, rank: row.score.overallRank })),
  );
  return { directoryRows, profiles, ranks, weekStart };
}

/**
 * Appends every durable directory/profile/week statement only after the entire
 * candidate has been materialized and validated in memory.
 */
export function appendModelDirectoryPublicationStatements(
  statements: BoundStatement[],
  db: D1Database,
  snapshot: ActiveBenchmarkSnapshot,
  publicLeaderboard: BenchLmPublicLeaderboard,
  updatedAt: string,
): void {
  const candidate = requireCandidateIntegrity(snapshot, publicLeaderboard, updatedAt);
  const next: BoundStatement[] = [];
  const membershipRows = snapshot.models.map((model) => ({ modelKey: model.modelKey }));
  const profileRows = candidate.profiles.map((profile) => ({
    modelKey: profile.modelKey,
    profileJson: profile.profileJson,
    contentHash: profile.contentHash,
    generatedAt: profile.generatedAt,
  }));
  const directoryRows = candidate.directoryRows;
  const rankRows = candidate.ranks;

  appendJsonEachStatements(next, db, INSERT_MEMBERSHIP, [snapshot.revision.revision], membershipRows, 'model revision membership');
  appendJsonEachStatements(next, db, INSERT_PROFILE, [snapshot.revision.revision], profileRows, 'model profile snapshots');
  for (const payload of jsonPayloads(directoryRows, 'model directory records')) {
    next.push(boundedStatement(db, DIRECTORY_CONFLICT_CHECK, [payload, INVALID_JSON_SENTINEL]));
    next.push(boundedStatement(db, UPSERT_DIRECTORY, [payload]));
  }
  next.push(boundedStatement(db, ARCHIVE_ABSENT, [updatedAt, snapshot.revision.revision]));
  next.push(boundedStatement(db, INSERT_WEEK, [
    candidate.weekStart,
    snapshot.revision.revision,
    publicLeaderboard.sourceSnapshotId,
    publicLeaderboard.methodologyVersion,
    updatedAt,
  ]));
  appendJsonEachStatements(next, db, INSERT_RANKS, [candidate.weekStart, snapshot.revision.revision], rankRows, 'popular model ranks');

  if (next.length > MAX_D1_PUBLICATION_STATEMENTS) {
    throw new Error(`Model directory publication exceeds the ${MAX_D1_PUBLICATION_STATEMENTS}-statement D1 safety budget`);
  }
  statements.push(...next);
}

/** Removes revision-scoped directory rows if the enclosing publication aborts. */
export function modelDirectoryRevisionCleanupStatements(
  db: D1Database,
  revision: string,
): BoundStatement[] {
  return [
    boundedStatement(
      db,
      'DELETE FROM benchmark_model_profile_snapshots WHERE revision = ?',
      [revision],
    ),
    boundedStatement(
      db,
      'DELETE FROM benchmark_model_revision_membership WHERE revision = ?',
      [revision],
    ),
  ];
}
