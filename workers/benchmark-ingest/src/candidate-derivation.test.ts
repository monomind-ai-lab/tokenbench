import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  BenchmarkComparisonPair,
  NormalizedSourceBatch,
} from '../../../src/benchmarks/contracts';
import { compareUtf8Binary } from '../../../src/benchmarks/contracts';
import type { BenchmarkCandidateManifestV1, CandidatePartition } from './candidate-storage';
import { candidateKeyPrefix } from './candidate-storage';
import { deriveComparisonPairs } from './index';
import {
  DERIVED_PARTITION_KINDS,
  MAX_DERIVED_PARTITION_ROWS,
  deriveCandidatePartitions,
  derivedPartitionToCandidate,
  parseDerivedPartitionId,
} from './candidate-derivation';

const CYCLE_ID = '11111111-2222-4333-8444-555555555555';
const CATALOG_REVISION = 'catalog_rev_1';
const CHECKED_AT = '2026-08-05T12:00:00.000Z';
const SOURCE_HASH = `sha256:${'a'.repeat(64)}`;

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

class FakeR2Bucket {
  readonly store = new Map<string, { bytes: Uint8Array; customMetadata?: Record<string, string> }>();
  puts = 0;

  async get(key: string) {
    const object = this.store.get(key);
    if (!object) return null;
    return {
      arrayBuffer: async () => object.bytes.buffer.slice(
        object.bytes.byteOffset,
        object.bytes.byteOffset + object.bytes.byteLength,
      ) as ArrayBuffer,
      customMetadata: object.customMetadata,
    };
  }

  async put(
    key: string,
    value: ArrayBufferView,
    options?: { httpMetadata?: { contentType: string }; customMetadata?: Record<string, string> },
  ) {
    this.puts += 1;
    this.store.set(key, {
      bytes: new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)),
      customMetadata: options?.customMetadata,
    });
    return undefined;
  }
}

function benchLmSource(artifactId: string) {
  return {
    sourceId: 'benchlm' as const,
    artifactId,
    sourceUrl: `https://benchlm.ai/data/${artifactId}.json`,
    observedAt: CHECKED_AT,
    etag: null,
    lastModified: null,
    upstreamRevision: CHECKED_AT,
    schemaVersion: '1.0',
    snapshotKey: `benchmarks/benchlm/${artifactId}.json`,
    contentHash: SOURCE_HASH,
    originalContentHash: SOURCE_HASH,
    licenseId: 'MIT' as const,
    attributionText: 'Data from BenchLM.ai',
  };
}

function benchLmModel(overrides: { modelKey: string; slug: string; name: string; creator: string }) {
  return {
    modelKey: overrides.modelKey,
    slug: overrides.slug,
    name: overrides.name,
    creator: overrides.creator,
    sourceType: 'Proprietary' as const,
    reasoningType: 'Reasoning',
    releaseDate: null,
    contextWindowTokens: 256_000,
    evidenceStatus: 'supported' as const,
    rankingEligible: true,
    confidenceLower: null,
    confidenceUpper: null,
    benchmarkCount: 4,
    sourceId: 'benchlm' as const,
    sourceModelId: overrides.slug,
    sourceArtifactId: 'public-leaderboard',
  };
}

function categoryMetric(modelKey: string, category: string, value: number) {
  return {
    modelKey,
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
    sourceUpdatedAt: CHECKED_AT,
    sourceModelId: modelKey,
    sourceArtifactId: 'public-leaderboard',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite' as const,
    observationCount: null,
    sessionCount: null,
  };
}

function overallMetric(modelKey: string, value: number) {
  return {
    ...categoryMetric(modelKey, 'overall', value),
    metricKey: 'benchlm:overall:raw',
  };
}

function priceCheck(modelKey: string, providerId: string, routeId: string, input: number) {
  return {
    modelKey,
    sourceId: 'benchlm' as const,
    providerId,
    inputUsdPerMillion: input,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: input * 3,
    contextWindowTokens: 256_000,
    verificationStatus: 'primary' as const,
    routeId,
    sourceModelId: modelKey,
    canonicalSlug: null,
    maxInputTokens: 256_000,
    maxOutputTokens: null,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: null,
    sourceArtifactId: 'public-leaderboard',
  };
}

/**
 * A representative BenchLM batch. GPT-5.6 Sol carries the public coding value
 * 77.95 exactly, and both models supply overall + shared-category metrics and
 * priced routes so comparison-pair derivation and price-performance inputs are
 * exercised end to end.
 */
function fixtureBatch(): NormalizedSourceBatch {
  const sol = benchLmModel({ modelKey: 'gpt-5-6-sol', slug: 'gpt-5-6-sol', name: 'GPT-5.6 Sol', creator: 'OpenAI' });
  const rival = benchLmModel({ modelKey: 'claude-opus-9', slug: 'claude-opus-9', name: 'Claude Opus 9', creator: 'Anthropic' });
  return {
    sources: [benchLmSource('public-leaderboard')],
    models: [sol, rival],
    metrics: [
      overallMetric('gpt-5-6-sol', 81.48),
      categoryMetric('gpt-5-6-sol', 'coding', 77.95),
      categoryMetric('gpt-5-6-sol', 'reasoning', 93),
      overallMetric('claude-opus-9', 80.1),
      categoryMetric('claude-opus-9', 'coding', 76.4),
      categoryMetric('claude-opus-9', 'reasoning', 91.2),
    ],
    priceChecks: [
      priceCheck('gpt-5-6-sol', 'openai', 'openai/gpt-5-6-sol', 5),
      priceCheck('claude-opus-9', 'anthropic', 'anthropic/claude-opus-9', 8),
    ],
    comparisonSeeds: [{
      pairSlug: 'claude-opus-9-vs-gpt-5-6-sol',
      modelAKey: 'claude-opus-9',
      modelBKey: 'gpt-5-6-sol',
      sourceId: 'benchlm' as const,
      sourceArtifactId: 'public-leaderboard',
      sourceModelAId: 'claude-opus-9',
      sourceModelBId: 'gpt-5-6-sol',
      featuredRank: null,
    }],
  };
}

type NormalizedKind = 'sources' | 'models' | 'metrics' | 'priceChecks' | 'comparisonSeeds';

function writeNormalizedPartition(
  bucket: FakeR2Bucket,
  kind: NormalizedKind,
  index: number,
  rows: readonly unknown[],
): CandidatePartition {
  const bytes = new TextEncoder().encode(JSON.stringify({ kind, index, rows }));
  const contentHash = sha256(bytes);
  const key = `${candidateKeyPrefix(CYCLE_ID)}normalized/${kind}-${index}.json`;
  bucket.store.set(key, { bytes, customMetadata: { content_hash: contentHash } });
  return { partitionId: `${kind}:${index}`, key, contentHash, byteLength: bytes.byteLength };
}

function benchLmArtifactDescriptor(artifactId: string) {
  const bytes = new TextEncoder().encode(`benchlm-${artifactId}`);
  return {
    artifactId,
    key: `${candidateKeyPrefix(CYCLE_ID)}artifacts/benchlm-${artifactId}.json`,
    contentHash: sha256(bytes),
    originalContentHash: sha256(bytes),
    byteLength: bytes.byteLength,
    sourceUrl: `https://benchlm.ai/data/${artifactId}.json`,
    etag: null,
    lastModified: null,
    upstreamRevision: null,
    schemaVersion: null,
  };
}

function manifestFor(normalizedPartitions: readonly CandidatePartition[]): BenchmarkCandidateManifestV1 {
  return {
    schemaVersion: 1,
    cycleId: CYCLE_ID,
    frozenCatalogRevision: CATALOG_REVISION,
    previousBenchmarkRevision: null,
    checkedAt: CHECKED_AT,
    benchLm: [
      'leaderboard', 'models', 'pricing', 'comparisons', 'benchmarks', 'public-leaderboard',
    ].map(benchLmArtifactDescriptor),
    liteLlm: null,
    lmArenaRevision: null,
    lmArena: [],
    normalizedPartitions,
    derivedPartitions: [],
  };
}

/** Splits a batch into one normalized partition per non-empty kind. */
function normalizeBatch(bucket: FakeR2Bucket, batch: NormalizedSourceBatch): CandidatePartition[] {
  const partitions: CandidatePartition[] = [];
  const kinds: NormalizedKind[] = ['sources', 'models', 'metrics', 'priceChecks', 'comparisonSeeds'];
  for (const kind of kinds) {
    const rows = batch[kind];
    if (rows.length > 0) partitions.push(writeNormalizedPartition(bucket, kind, 0, rows));
  }
  return partitions;
}

async function readPartitionRows(bucket: FakeR2Bucket, key: string): Promise<unknown[]> {
  const object = await bucket.get(key);
  if (!object) throw new Error(`missing partition ${key}`);
  const payload = JSON.parse(new TextDecoder().decode(new Uint8Array(await object.arrayBuffer()))) as { rows: unknown[] };
  return payload.rows;
}

describe('deriveCandidatePartitions', () => {
  it('reconstructs canonical facts with parity to the derivation helpers', async () => {
    const batch = fixtureBatch();
    const bucket = new FakeR2Bucket();
    const manifest = manifestFor(normalizeBatch(bucket, batch));

    const result = await deriveCandidatePartitions(manifest, { SOURCE_SNAPSHOTS: bucket });

    const rowsFor = async (kind: string) => {
      const receipts = result.partitions.filter((partition) => partition.kind === kind);
      const rows: unknown[] = [];
      for (const receipt of receipts.sort((left, right) => left.index - right.index)) {
        rows.push(...await readPartitionRows(bucket, receipt.key));
      }
      return rows;
    };

    const expectedModels = batch.models.slice().sort((left, right) => compareUtf8Binary(left.modelKey, right.modelKey));
    const expectedMetrics = batch.metrics.slice().sort((left, right) => compareUtf8Binary(
      `${left.modelKey}\u0000${left.metricKey}`,
      `${right.modelKey}\u0000${right.metricKey}`,
    ));
    const expectedPrices = batch.priceChecks.slice().sort((left, right) => compareUtf8Binary(
      `${left.modelKey}\u0000${left.sourceId}\u0000${left.providerId}\u0000${left.routeId}`,
      `${right.modelKey}\u0000${right.sourceId}\u0000${right.providerId}\u0000${right.routeId}`,
    ));
    const expectedPairs: BenchmarkComparisonPair[] = deriveComparisonPairs(batch);

    expect(await rowsFor('sources')).toEqual(batch.sources);
    expect(await rowsFor('models')).toEqual(expectedModels);
    expect(await rowsFor('metrics')).toEqual(expectedMetrics);
    // Price-performance inputs are the models, metrics, and priced routes.
    expect(await rowsFor('prices')).toEqual(expectedPrices);
    expect(await rowsFor('comparisons')).toEqual(expectedPairs);

    // GPT-5.6 Sol keeps its exact public coding value through partitioning.
    const solCoding = (await rowsFor('metrics') as { modelKey: string; category: string; value: number }[])
      .find((metric) => metric.modelKey === 'gpt-5-6-sol' && metric.category === 'coding');
    expect(solCoding?.value).toBe(77.95);
  });

  it('emits a deterministic revision and content hash independent of partition order', async () => {
    const batch = fixtureBatch();
    const forwardBucket = new FakeR2Bucket();
    const forward = normalizeBatch(forwardBucket, batch);
    const shuffledBucket = new FakeR2Bucket();
    const shuffled = normalizeBatch(shuffledBucket, batch).reverse();

    const first = await deriveCandidatePartitions(manifestFor(forward), { SOURCE_SNAPSHOTS: forwardBucket });
    const second = await deriveCandidatePartitions(manifestFor(shuffled), { SOURCE_SNAPSHOTS: shuffledBucket });

    expect(second.revision).toBe(first.revision);
    expect(second.contentHash).toBe(first.contentHash);
    expect(first.revision).toMatch(/^benchmark_[0-9a-f]{32}$/);
    expect(first.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(second.partitions.map((partition) => partition.contentHash))
      .toEqual(first.partitions.map((partition) => partition.contentHash));
  });

  it('bounds each partition to the fixed maximum row count', async () => {
    const models = Array.from({ length: MAX_DERIVED_PARTITION_ROWS + 5 }, (_, index) => benchLmModel({
      modelKey: `model-${String(index).padStart(4, '0')}`,
      slug: `model-${String(index).padStart(4, '0')}`,
      name: `Model ${index}`,
      creator: 'BenchLM',
    }));
    const batch: NormalizedSourceBatch = {
      sources: [benchLmSource('public-leaderboard')],
      models,
      metrics: [],
      priceChecks: [],
      comparisonSeeds: [],
    };
    const bucket = new FakeR2Bucket();
    const result = await deriveCandidatePartitions(manifestFor(normalizeBatch(bucket, batch)), { SOURCE_SNAPSHOTS: bucket });

    const modelPartitions = result.partitions.filter((partition) => partition.kind === 'models');
    expect(modelPartitions).toHaveLength(2);
    expect(modelPartitions[0].rowCount).toBe(MAX_DERIVED_PARTITION_ROWS);
    expect(modelPartitions[1].rowCount).toBe(5);
    expect(modelPartitions.every((partition) => partition.rowCount <= MAX_DERIVED_PARTITION_ROWS)).toBe(true);
    expect(modelPartitions.map((partition) => partition.index)).toEqual([0, 1]);
  });

  it('is idempotent: a replay rewrites identical content-addressed objects', async () => {
    const batch = fixtureBatch();
    const bucket = new FakeR2Bucket();
    const manifest = manifestFor(normalizeBatch(bucket, batch));

    const first = await deriveCandidatePartitions(manifest, { SOURCE_SNAPSHOTS: bucket });
    const putsAfterFirst = bucket.puts;
    const second = await deriveCandidatePartitions(manifest, { SOURCE_SNAPSHOTS: bucket });

    expect(second.partitions).toEqual(first.partitions);
    // The replay finds every content-addressed derived object and writes nothing.
    expect(bucket.puts).toBe(putsAfterFirst);
  });

  it('bridges receipts to canonical manifest partition descriptors', async () => {
    const batch = fixtureBatch();
    const bucket = new FakeR2Bucket();
    const result = await deriveCandidatePartitions(manifestFor(normalizeBatch(bucket, batch)), { SOURCE_SNAPSHOTS: bucket });

    for (const receipt of result.partitions) {
      const descriptor = derivedPartitionToCandidate(receipt);
      expect(descriptor.key).toBe(receipt.key);
      expect(descriptor.contentHash).toBe(receipt.contentHash);
      expect(descriptor.byteLength).toBe(receipt.byteLength);
      expect(parseDerivedPartitionId(descriptor.partitionId)).toEqual({
        kind: receipt.kind,
        index: receipt.index,
        rowCount: receipt.rowCount,
      });
    }
    expect(DERIVED_PARTITION_KINDS).toContain('comparisons');
  });
});
