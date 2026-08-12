/**
 * Deterministic derivation of bounded, canonical benchmark fact partitions from
 * an attempt-owned normalized candidate.
 *
 * Task 3 writes normalized source partitions (`sources`, `models`, `metrics`,
 * `priceChecks`, `comparisonSeeds`) under a cycle's attempt-owned R2 prefix and
 * lists them in the candidate manifest. This module reconstructs the complete
 * `NormalizedSourceBatch` from those partitions, re-runs the exact production
 * comparison-pair derivation, and re-partitions the derived facts into bounded,
 * canonically ordered R2 objects (`sources`, `models`, `metrics`, `prices`,
 * `comparisons`). Every object is content-addressed by the SHA-256 of its exact
 * bytes, so a replayed alarm rewrites identical keys with identical bytes.
 *
 * The module holds no mutable state: the caller supplies the manifest and the
 * R2 binding on every call. It never touches D1 and never moves a public
 * pointer. Hashing uses `crypto.subtle`; nothing here depends on Node APIs.
 */

import {
  type BenchmarkComparisonPair,
  type BenchmarkMetric,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type BenchmarkSourceRecord,
  type NormalizedSourceBatch,
  BENCHMARK_DERIVATION_SCHEMA_VERSION,
  compareUtf8Binary,
  validateNormalizedSourceBatch,
} from '../../../src/benchmarks/contracts';
import {
  type BenchmarkCandidateManifestV1,
  type CandidatePartition,
  type CandidateR2Bucket,
  MAX_CANDIDATE_PARTITIONS,
  candidateKeyPrefix,
  parseBenchmarkCandidateManifest,
} from './candidate-storage';
import { deriveComparisonPairs } from './index';

/** The exactly-five derived fact partition kinds, in canonical emission order. */
export const DERIVED_PARTITION_KINDS = ['sources', 'models', 'metrics', 'prices', 'comparisons'] as const;
export type DerivedPartitionKind = typeof DERIVED_PARTITION_KINDS[number];

/** The normalized partition kinds this module consumes from Task 3. */
const NORMALIZED_PARTITION_KINDS = ['sources', 'models', 'metrics', 'priceChecks', 'comparisonSeeds'] as const;
type NormalizedPartitionKind = typeof NORMALIZED_PARTITION_KINDS[number];

/**
 * Fixed maximum rows per derived partition. Keeps each partition to exactly one
 * bounded D1 `json_each` staging statement well under the 1.5MB parameter and
 * 32MiB RPC limits, and keeps the whole derived set inside the manifest's
 * 64-partition bound for production-scale inputs.
 */
export const MAX_DERIVED_PARTITION_ROWS = 1_000;

/** A single derived partition may not exceed the D1 JSON parameter safety limit. */
const MAX_DERIVED_PARTITION_BYTES = 1_500_000;

/** One canonical, content-addressed derived fact partition stored in R2. */
export interface DerivedPartitionReceipt {
  readonly kind: DerivedPartitionKind;
  readonly index: number;
  readonly rowCount: number;
  readonly key: string;
  readonly contentHash: `sha256:${string}`;
  readonly byteLength: number;
}

/** The durable payload of one derived partition object. */
export interface DerivedPartitionPayload {
  readonly kind: DerivedPartitionKind;
  readonly index: number;
  readonly rows: readonly unknown[];
}

/** Final derived candidate metadata recorded by the coordinator. */
export interface DerivedCandidate {
  readonly revision: string;
  readonly contentHash: `sha256:${string}`;
  readonly partitions: readonly DerivedPartitionReceipt[];
}

/** Minimal R2 surface required for derivation. */
export interface DeriveCandidateEnv {
  readonly SOURCE_SNAPSHOTS: CandidateR2Bucket;
}

function fail(message: string): never {
  throw new Error(message);
}

const HEX_BYTES = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));

async function sha256Digest(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += HEX_BYTES[byte];
  return `sha256:${hex}`;
}

function jsonBytes(value: unknown): Uint8Array {
  const json = JSON.stringify(value);
  if (json === undefined) fail('derived partition payload is not JSON serializable');
  return new TextEncoder().encode(json);
}

function decodeJson(bytes: Uint8Array, label: string): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail(`${label} must be valid UTF-8`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return fail(`${label} must be valid JSON`);
  }
}

function sortedByKey<T>(rows: readonly T[], key: (row: T) => string): T[] {
  return rows.slice().sort((left, right) => compareUtf8Binary(key(left), key(right)));
}

/** The canonical partition id encodes kind + index + exact row count. */
export function derivedPartitionId(kind: DerivedPartitionKind, index: number, rowCount: number): string {
  return `${kind}:${index}:${rowCount}`;
}

/** Parse a canonical derived partition id, rejecting any malformed value. */
export function parseDerivedPartitionId(partitionId: string): {
  kind: DerivedPartitionKind;
  index: number;
  rowCount: number;
} {
  const match = /^([a-z]+):(\d+):(\d+)$/.exec(partitionId);
  if (!match) fail(`derived partition id ${partitionId} is malformed`);
  const kind = match[1] as DerivedPartitionKind;
  if (!(DERIVED_PARTITION_KINDS as readonly string[]).includes(kind)) {
    fail(`derived partition id ${partitionId} names an unknown kind`);
  }
  return { kind, index: Number(match[2]), rowCount: Number(match[3]) };
}

/** Project a derived receipt into the manifest's durable partition descriptor. */
export function derivedPartitionToCandidate(receipt: DerivedPartitionReceipt): CandidatePartition {
  return {
    partitionId: derivedPartitionId(receipt.kind, receipt.index, receipt.rowCount),
    key: receipt.key,
    contentHash: receipt.contentHash,
    byteLength: receipt.byteLength,
  };
}

function chunkRows<T>(rows: readonly T[]): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += MAX_DERIVED_PARTITION_ROWS) {
    chunks.push(rows.slice(offset, offset + MAX_DERIVED_PARTITION_ROWS));
  }
  return chunks;
}

async function readNormalizedPartition(
  bucket: CandidateR2Bucket,
  partition: CandidatePartition,
): Promise<{ kind: NormalizedPartitionKind; rows: unknown[] }> {
  const object = await bucket.get(partition.key);
  if (!object) fail(`normalized partition ${partition.partitionId} is missing`);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength !== partition.byteLength) {
    fail(`normalized partition ${partition.partitionId} byte length does not match its descriptor`);
  }
  if (await sha256Digest(bytes) !== partition.contentHash) {
    fail(`normalized partition ${partition.partitionId} content hash does not match its exact bytes`);
  }
  const payload = decodeJson(bytes, `normalized partition ${partition.partitionId}`);
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    fail(`normalized partition ${partition.partitionId} payload must be an object`);
  }
  const { kind, rows } = payload as { kind?: unknown; rows?: unknown };
  if (typeof kind !== 'string' || !(NORMALIZED_PARTITION_KINDS as readonly string[]).includes(kind)) {
    fail(`normalized partition ${partition.partitionId} has an unknown kind`);
  }
  if (!Array.isArray(rows)) fail(`normalized partition ${partition.partitionId} rows must be an array`);
  return { kind: kind as NormalizedPartitionKind, rows };
}

/**
 * Reconstruct the complete normalized batch by concatenating every partition's
 * rows per kind. Ordering is irrelevant here: every collection is re-sorted
 * canonically after validation, so the derived output is independent of the
 * order R2 returns partitions in.
 */
async function reconstructBatch(
  bucket: CandidateR2Bucket,
  manifest: BenchmarkCandidateManifestV1,
): Promise<NormalizedSourceBatch> {
  const grouped: Record<NormalizedPartitionKind, unknown[]> = {
    sources: [], models: [], metrics: [], priceChecks: [], comparisonSeeds: [],
  };
  for (const partition of manifest.normalizedPartitions) {
    const { kind, rows } = await readNormalizedPartition(bucket, partition);
    grouped[kind].push(...rows);
  }
  return validateNormalizedSourceBatch({
    sources: grouped.sources,
    models: grouped.models,
    metrics: grouped.metrics,
    priceChecks: grouped.priceChecks,
    comparisonSeeds: grouped.comparisonSeeds,
  });
}

function canonicalDerivedRows(
  batch: NormalizedSourceBatch,
  pairs: readonly BenchmarkComparisonPair[],
): Record<DerivedPartitionKind, readonly unknown[]> {
  return {
    sources: sortedByKey<BenchmarkSourceRecord>(batch.sources, (s) => `${s.sourceId}\u0000${s.artifactId}`),
    models: sortedByKey<BenchmarkModel>(batch.models, (model) => model.modelKey),
    metrics: sortedByKey<BenchmarkMetric>(batch.metrics, (m) => `${m.modelKey}\u0000${m.metricKey}`),
    prices: sortedByKey<BenchmarkPriceCheck>(
      batch.priceChecks,
      (p) => `${p.modelKey}\u0000${p.sourceId}\u0000${p.providerId}\u0000${p.routeId}`,
    ),
    // deriveComparisonPairs already returns rows sorted by binary pairSlug.
    comparisons: pairs,
  };
}

async function writeDerivedPartition(
  bucket: CandidateR2Bucket,
  prefix: string,
  payload: DerivedPartitionPayload,
): Promise<{ key: string; contentHash: `sha256:${string}`; byteLength: number }> {
  const bytes = jsonBytes(payload);
  if (bytes.byteLength > MAX_DERIVED_PARTITION_BYTES) {
    fail(`derived ${payload.kind} partition ${payload.index} exceeds the ${MAX_DERIVED_PARTITION_BYTES}-byte bound`);
  }
  const contentHash = await sha256Digest(bytes);
  const key = `${prefix}derived/${contentHash.slice('sha256:'.length)}.json`;
  const existing = await bucket.get(key);
  if (existing) {
    const existingBytes = new Uint8Array(await existing.arrayBuffer());
    if (await sha256Digest(existingBytes) !== contentHash) {
      fail(`derived partition object ${key} does not match its exact bytes`);
    }
  } else {
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { content_hash: contentHash },
    });
  }
  return { key, contentHash, byteLength: bytes.byteLength };
}

/**
 * Reconstruct the normalized candidate, derive comparison pairs, and emit
 * bounded canonical R2 partitions for every fact kind. Returns the combined
 * content hash and revision id that bind this derived candidate, plus one
 * receipt per emitted partition in canonical (kind, index) order.
 */
export async function deriveCandidatePartitions(
  manifest: BenchmarkCandidateManifestV1,
  env: DeriveCandidateEnv,
): Promise<DerivedCandidate> {
  const validated = parseBenchmarkCandidateManifest(manifest);
  const bucket = env.SOURCE_SNAPSHOTS;
  const prefix = candidateKeyPrefix(validated.cycleId);

  const batch = await reconstructBatch(bucket, validated);
  const pairs = deriveComparisonPairs(batch);
  const rowsByKind = canonicalDerivedRows(batch, pairs);

  const partitions: DerivedPartitionReceipt[] = [];
  for (const kind of DERIVED_PARTITION_KINDS) {
    const chunks = chunkRows(rowsByKind[kind]);
    for (let index = 0; index < chunks.length; index += 1) {
      const rows = chunks[index];
      const { key, contentHash, byteLength } = await writeDerivedPartition(bucket, prefix, { kind, index, rows });
      partitions.push({ kind, index, rowCount: rows.length, key, contentHash, byteLength });
    }
  }
  if (partitions.length > MAX_CANDIDATE_PARTITIONS) {
    fail(`derived candidate emits ${partitions.length} partitions, exceeding the ${MAX_CANDIDATE_PARTITIONS} bound`);
  }

  const contentHash = await sha256Digest(jsonBytes({
    derivationSchemaVersion: BENCHMARK_DERIVATION_SCHEMA_VERSION,
    frozenCatalogRevision: validated.frozenCatalogRevision,
    partitions: partitions.map((partition) => ({
      kind: partition.kind,
      index: partition.index,
      rowCount: partition.rowCount,
      contentHash: partition.contentHash,
    })),
  }));
  const fingerprint = await sha256Digest(jsonBytes({
    derivationSchemaVersion: BENCHMARK_DERIVATION_SCHEMA_VERSION,
    contentHash,
  }));
  const revision = `benchmark_${fingerprint.slice('sha256:'.length, 'sha256:'.length + 32)}`;

  return { revision, contentHash, partitions };
}
