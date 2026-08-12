/**
 * Inactive, attempt-owned staging of derived benchmark fact partitions into D1.
 *
 * Task 4 stages one derived fact partition (`sources`, `models`, `metrics`,
 * `prices`, `comparisons`) per alarm into the pending benchmark revision. Every
 * staged row is guarded by `publication_attempt_id = cycleId`, so a duplicate
 * alarm converges without duplicate effects, a foreign attempt is rejected, and
 * a failed attempt can be cleaned up without touching any other attempt's rows.
 *
 * This module NEVER moves a public pointer: it does not write
 * `benchmark_publication_state` or `api_response_publication_state`. Superseding
 * the active revision and moving the pointers is the sole responsibility of the
 * final publication transaction in Task 5.
 *
 * The module holds no mutable state — the caller supplies the D1 binding, R2
 * binding, and cycle id on every call. Hashing uses `crypto.subtle`; nothing
 * here depends on Node APIs.
 */

import type { BenchmarkCandidateManifestV1, CandidateR2Bucket } from './candidate-storage';
import {
  type DerivedPartitionKind,
  type DerivedPartitionReceipt,
  DERIVED_PARTITION_KINDS,
  parseDerivedPartitionId,
} from './candidate-derivation';

/** Minimal prepared-statement surface, matching the generated Worker bindings. */
type BoundStatement = {
  bind(...values: unknown[]): BoundStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};

/** Minimal D1 surface consumed here. */
export interface D1Database {
  prepare(sql: string): BoundStatement;
  batch(statements: BoundStatement[]): Promise<unknown>;
}

// D1 platform safety limits, mirrored from the monolithic publication path.
const MAX_D1_BOUND_PARAMETERS = 100;
const MAX_D1_SQL_BYTES = 100 * 1024;
const MAX_D1_JSON_PARAMETER_BYTES = 1_500_000;
// D1 serializes a batch into one 32 MiB RPC value; keep a 50% safety margin.
const MAX_D1_RPC_BATCH_BYTES = 16 * 1024 * 1024;

/** The exact staged fact counts for one pending benchmark revision. */
export interface ValidatedFactCounts {
  readonly sources: number;
  readonly models: number;
  readonly metrics: number;
  readonly prices: number;
  readonly comparisons: number;
}

/** Maps each derived kind to the fact table that receives its rows. */
const TABLE_BY_KIND: Record<DerivedPartitionKind, string> = {
  sources: 'benchmark_source_records',
  models: 'benchmark_models',
  metrics: 'benchmark_metrics',
  prices: 'benchmark_price_checks',
  comparisons: 'benchmark_comparison_pairs',
};

const OWNERSHIP_GUARD =
  "EXISTS (SELECT 1 FROM benchmark_revisions WHERE revision = ? AND publication_state = 'pending' AND publication_attempt_id = ?)";

/**
 * One `INSERT OR IGNORE ... SELECT ... FROM json_each(?)` per kind. The trailing
 * ownership guard means a foreign or non-pending revision stages zero rows, and
 * `OR IGNORE` makes a replayed partition a primary-key no-op.
 */
const INSERT_SQL_BY_KIND: Record<DerivedPartitionKind, string> = {
  sources: `INSERT OR IGNORE INTO benchmark_source_records
  (revision, source_id, artifact_id, source_url, observed_at, etag, last_modified, upstream_revision, schema_version, snapshot_key, content_hash, original_content_hash, license_id, attribution_text)
SELECT ?, json_extract(row.value, '$.sourceId'), json_extract(row.value, '$.artifactId'), json_extract(row.value, '$.sourceUrl'), json_extract(row.value, '$.observedAt'),
  json_extract(row.value, '$.etag'), json_extract(row.value, '$.lastModified'), json_extract(row.value, '$.upstreamRevision'), json_extract(row.value, '$.schemaVersion'),
  json_extract(row.value, '$.snapshotKey'), json_extract(row.value, '$.contentHash'), json_extract(row.value, '$.originalContentHash'),
  json_extract(row.value, '$.licenseId'), json_extract(row.value, '$.attributionText')
FROM json_each(?) AS row
WHERE ${OWNERSHIP_GUARD}`,
  models: `INSERT OR IGNORE INTO benchmark_models
  (revision, model_key, slug, name, creator, source_type, reasoning_type, release_date, context_window_tokens, evidence_status, ranking_eligible, confidence_lower, confidence_upper, benchmark_count, source_id, source_model_id, source_artifact_id)
SELECT ?, json_extract(row.value, '$.modelKey'), json_extract(row.value, '$.slug'), json_extract(row.value, '$.name'), json_extract(row.value, '$.creator'),
  json_extract(row.value, '$.sourceType'), json_extract(row.value, '$.reasoningType'), json_extract(row.value, '$.releaseDate'), json_extract(row.value, '$.contextWindowTokens'),
  json_extract(row.value, '$.evidenceStatus'), CASE WHEN json_extract(row.value, '$.rankingEligible') THEN 1 ELSE 0 END,
  json_extract(row.value, '$.confidenceLower'), json_extract(row.value, '$.confidenceUpper'), json_extract(row.value, '$.benchmarkCount'),
  json_extract(row.value, '$.sourceId'), json_extract(row.value, '$.sourceModelId'), json_extract(row.value, '$.sourceArtifactId')
FROM json_each(?) AS row
WHERE ${OWNERSHIP_GUARD}`,
  metrics: `INSERT OR IGNORE INTO benchmark_metrics
  (revision, model_key, metric_key, category, value, raw_value, rank, lower_bound, upper_bound, vote_count, unit, source_id, source_updated_at, source_model_id, source_artifact_id, ranking_eligible, methodology, observation_count, session_count)
SELECT ?, json_extract(row.value, '$.modelKey'), json_extract(row.value, '$.metricKey'), json_extract(row.value, '$.category'), json_extract(row.value, '$.value'),
  json_extract(row.value, '$.rawValue'), json_extract(row.value, '$.rank'), json_extract(row.value, '$.lower'), json_extract(row.value, '$.upper'), json_extract(row.value, '$.voteCount'), json_extract(row.value, '$.unit'),
  json_extract(row.value, '$.sourceId'), json_extract(row.value, '$.sourceUpdatedAt'), json_extract(row.value, '$.sourceModelId'), json_extract(row.value, '$.sourceArtifactId'),
  CASE WHEN json_extract(row.value, '$.rankingEligible') THEN 1 ELSE 0 END, json_extract(row.value, '$.methodology'), json_extract(row.value, '$.observationCount'), json_extract(row.value, '$.sessionCount')
FROM json_each(?) AS row
WHERE ${OWNERSHIP_GUARD}`,
  prices: `INSERT OR IGNORE INTO benchmark_price_checks
  (revision, model_key, source_id, provider_id, route_id, source_model_id, canonical_slug, input_usd_per_million, cached_input_usd_per_million, output_usd_per_million, context_window_tokens, max_input_tokens, max_output_tokens, input_modalities_json, output_modalities_json, supported_parameters_json, source_artifact_id, verification_status)
SELECT ?, json_extract(row.value, '$.modelKey'), json_extract(row.value, '$.sourceId'), json_extract(row.value, '$.providerId'), json_extract(row.value, '$.routeId'),
  json_extract(row.value, '$.sourceModelId'), json_extract(row.value, '$.canonicalSlug'), json_extract(row.value, '$.inputUsdPerMillion'), json_extract(row.value, '$.cachedInputUsdPerMillion'), json_extract(row.value, '$.outputUsdPerMillion'),
  json_extract(row.value, '$.contextWindowTokens'), json_extract(row.value, '$.maxInputTokens'), json_extract(row.value, '$.maxOutputTokens'),
  json_extract(row.value, '$.inputModalities'), json_extract(row.value, '$.outputModalities'), json_extract(row.value, '$.supportedParameters'),
  json_extract(row.value, '$.sourceArtifactId'), json_extract(row.value, '$.verificationStatus')
FROM json_each(?) AS row
WHERE ${OWNERSHIP_GUARD}`,
  comparisons: `INSERT OR IGNORE INTO benchmark_comparison_pairs
  (revision, pair_slug, model_a_key, model_b_key, indexable, eligibility_reason, featured_rank, shared_metric_count)
SELECT ?, json_extract(row.value, '$.pairSlug'), json_extract(row.value, '$.modelAKey'), json_extract(row.value, '$.modelBKey'),
  CASE WHEN json_extract(row.value, '$.indexable') THEN 1 ELSE 0 END, json_extract(row.value, '$.eligibilityReason'), json_extract(row.value, '$.featuredRank'), json_extract(row.value, '$.sharedMetricCount')
FROM json_each(?) AS row
WHERE ${OWNERSHIP_GUARD}`,
};

function fail(message: string): never {
  throw new Error(message);
}

function d1ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

const statementSerializedBytes = new WeakMap<object, number>();

function boundedStatement(db: D1Database, sql: string, values: readonly unknown[]): BoundStatement {
  if (d1ByteLength(sql) > MAX_D1_SQL_BYTES) fail('D1 SQL statement exceeds the 100KB limit');
  if (values.length > MAX_D1_BOUND_PARAMETERS) fail('D1 statement exceeds the 100 bound-parameter limit');
  for (const value of values) {
    if (typeof value === 'string' && d1ByteLength(value) > MAX_D1_JSON_PARAMETER_BYTES) {
      fail('D1 bound string exceeds the 1.5MB ingestion safety limit');
    }
  }
  const serialized = JSON.stringify({ sql, values });
  if (serialized === undefined) fail('D1 statement is not serializable');
  const serializedBytes = d1ByteLength(serialized);
  if (serializedBytes + 2 > MAX_D1_RPC_BATCH_BYTES) fail('A single D1 staging statement exceeds the RPC safety budget');
  const statement = db.prepare(sql).bind(...values);
  statementSerializedBytes.set(statement as object, serializedBytes);
  return statement;
}

const HEX_BYTES = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));

async function sha256Digest(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += HEX_BYTES[byte];
  return `sha256:${hex}`;
}

async function assertOwnedPendingRevision(db: D1Database, revision: string, cycleId: string): Promise<void> {
  const owner = await db.prepare(
    'SELECT publication_state AS state, publication_attempt_id AS attempt FROM benchmark_revisions WHERE revision = ?',
  ).bind(revision).first<{ state: string; attempt: string | null }>();
  if (!owner) fail(`pending benchmark revision ${revision} is missing`);
  if (owner.state !== 'pending') fail(`benchmark revision ${revision} is not pending (state: ${owner.state})`);
  if (owner.attempt !== cycleId) fail(`benchmark revision ${revision} is owned by another attempt`);
}

/**
 * Create the pending benchmark revision once, owned by `cycleId`. A replay finds
 * the existing row and is a no-op. Returns whether this call created the row, and
 * throws if the revision already exists under a foreign attempt or non-pending
 * state.
 */
export async function ensurePendingBenchmarkRevision(input: {
  db: D1Database;
  cycleId: string;
  revision: string;
  generatedAt: string;
  checkedAt: string;
  contentHash: string;
  catalogRevision: string;
  openrouterContentHash: string;
}): Promise<'created' | 'exists'> {
  const { db, cycleId, revision } = input;
  const insert = await boundedStatement(db, `INSERT OR IGNORE INTO benchmark_revisions
      (revision, generated_at, published_at, checked_at, publication_state, content_hash, catalog_revision, openrouter_content_hash, publication_attempt_id)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`, [
    revision,
    input.generatedAt,
    null,
    input.checkedAt,
    input.contentHash,
    input.catalogRevision,
    input.openrouterContentHash,
    cycleId,
  ]).run();
  await assertOwnedPendingRevision(db, revision, cycleId);
  return (insert.meta?.changes ?? 0) > 0 ? 'created' : 'exists';
}

async function readDerivedPartition(
  bucket: CandidateR2Bucket,
  partition: DerivedPartitionReceipt,
): Promise<unknown[]> {
  const object = await bucket.get(partition.key);
  if (!object) fail(`derived partition ${partition.key} is missing`);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength !== partition.byteLength) {
    fail(`derived partition ${partition.key} byte length does not match its receipt`);
  }
  if (await sha256Digest(bytes) !== partition.contentHash) {
    fail(`derived partition ${partition.key} content hash does not match its exact bytes`);
  }
  const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as {
    kind?: unknown;
    index?: unknown;
    rows?: unknown;
  };
  if (payload.kind !== partition.kind || payload.index !== partition.index) {
    fail(`derived partition ${partition.key} does not match its receipt kind/index`);
  }
  if (!Array.isArray(payload.rows) || payload.rows.length !== partition.rowCount) {
    fail(`derived partition ${partition.key} row count does not match its receipt`);
  }
  return payload.rows;
}

/**
 * Stage exactly one derived fact partition into the inactive, attempt-owned
 * pending revision. Reads the partition's exact bytes from R2, re-verifies its
 * hash, and inserts its rows under `publication_attempt_id = cycleId`. A replay
 * of an already-staged partition is a primary-key no-op that reports zero rows.
 */
export async function stageBenchmarkFactPartition(input: {
  db: D1Database;
  bucket: CandidateR2Bucket;
  cycleId: string;
  revision: string;
  partition: DerivedPartitionReceipt;
}): Promise<{ statements: number; rows: number }> {
  const { db, cycleId, revision, partition } = input;
  await assertOwnedPendingRevision(db, revision, cycleId);
  const rows = await readDerivedPartition(input.bucket, partition);
  const payload = JSON.stringify(rows);
  if (payload === undefined) fail(`derived partition ${partition.key} rows are not serializable`);
  if (d1ByteLength(payload) > MAX_D1_JSON_PARAMETER_BYTES) {
    fail(`derived partition ${partition.key} exceeds the 1.5MB D1 ingestion safety limit`);
  }
  const staged = await boundedStatement(db, INSERT_SQL_BY_KIND[partition.kind], [
    revision,
    payload,
    revision,
    cycleId,
  ]).run();
  return { statements: 1, rows: staged.meta?.changes ?? 0 };
}

async function countStagedRows(db: D1Database, table: string, revision: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE revision = ?`).bind(revision)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Validate that the exact expected number of rows for every derived kind is
 * staged under the attempt-owned pending revision, and that no public pointer
 * has moved to this revision. Returns the validated per-kind counts.
 */
export async function validateStagedBenchmarkFacts(input: {
  db: D1Database;
  cycleId: string;
  revision: string;
  manifest: BenchmarkCandidateManifestV1;
}): Promise<ValidatedFactCounts> {
  const { db, cycleId, revision, manifest } = input;
  await assertOwnedPendingRevision(db, revision, cycleId);

  const pointer = await db.prepare('SELECT active_revision AS active FROM benchmark_publication_state WHERE singleton = 1')
    .first<{ active: string | null }>();
  if (pointer?.active === revision) fail(`benchmark publication pointer already references pending revision ${revision}`);

  const expected: Record<DerivedPartitionKind, number> = {
    sources: 0, models: 0, metrics: 0, prices: 0, comparisons: 0,
  };
  for (const partition of manifest.derivedPartitions) {
    const parsed = parseDerivedPartitionId(partition.partitionId);
    expected[parsed.kind] += parsed.rowCount;
  }

  const counts = { sources: 0, models: 0, metrics: 0, prices: 0, comparisons: 0 };
  for (const kind of DERIVED_PARTITION_KINDS) {
    const actual = await countStagedRows(db, TABLE_BY_KIND[kind], revision);
    if (actual !== expected[kind]) {
      fail(`staged ${kind} count ${actual} does not match the expected ${expected[kind]}`);
    }
    counts[kind] = actual;
  }
  return counts;
}

/**
 * Delete every staged fact row and the pending revision itself, restricted to
 * the current attempt. A pending revision owned by another attempt is untouched.
 * Returns the number of rows removed.
 */
export async function cleanupStagedBenchmarkFacts(input: {
  db: D1Database;
  cycleId: string;
  revision: string;
}): Promise<number> {
  const { db, cycleId, revision } = input;
  let removed = 0;
  for (const kind of DERIVED_PARTITION_KINDS) {
    const deleted = await boundedStatement(
      db,
      `DELETE FROM ${TABLE_BY_KIND[kind]} WHERE revision = ? AND ${OWNERSHIP_GUARD}`,
      [revision, revision, cycleId],
    ).run();
    removed += deleted.meta?.changes ?? 0;
  }
  const deletedRevision = await boundedStatement(
    db,
    "DELETE FROM benchmark_revisions WHERE revision = ? AND publication_state = 'pending' AND publication_attempt_id = ?",
    [revision, cycleId],
  ).run();
  removed += deletedRevision.meta?.changes ?? 0;
  return removed;
}
