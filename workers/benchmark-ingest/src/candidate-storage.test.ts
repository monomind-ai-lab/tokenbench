import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  BENCHLM_ARTIFACT_IDS,
  MAX_LMARENA_CANDIDATE_ARTIFACTS,
  MAX_CANDIDATE_PARTITIONS,
  candidateKeyPrefix,
  candidateManifestKey,
  parseBenchmarkCandidateManifest,
  readCandidateArtifact,
  readCandidateManifest,
  writeCandidateArtifact,
  writeCandidateManifest,
  type BenchmarkCandidateManifestV1,
  type CandidateArtifact,
  type CandidatePartition,
} from './candidate-storage';

/** Minimal in-memory R2 stand-in mirroring the Worker bindings under test. */
function createR2() {
  const objects = new Map<string, { bytes: Uint8Array; customMetadata: Record<string, string> }>();
  const puts: string[] = [];
  const bucket = {
    async put(
      key: string,
      value: ArrayBufferView,
      options?: { httpMetadata?: { contentType: string }; customMetadata?: Record<string, string> },
    ) {
      puts.push(key);
      const bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      objects.set(key, { bytes, customMetadata: { ...(options?.customMetadata ?? {}) } });
      return {};
    },
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        customMetadata: { ...object.customMetadata },
        async arrayBuffer() {
          return object.bytes.slice().buffer;
        },
      };
    },
  };
  return { bucket, objects, puts };
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

type MutableArtifact = { -readonly [K in keyof CandidateArtifact]: CandidateArtifact[K] };
type MutablePartition = { -readonly [K in keyof CandidatePartition]: CandidatePartition[K] };
interface MutableManifest {
  schemaVersion: 1;
  cycleId: string;
  frozenCatalogRevision: string;
  previousBenchmarkRevision: string | null;
  checkedAt: string;
  benchLm: MutableArtifact[];
  liteLlm: MutableArtifact | null;
  lmArenaRevision: string | null;
  lmArena: MutableArtifact[];
  normalizedPartitions: MutablePartition[];
  derivedPartitions: MutablePartition[];
}

const CYCLE_ID = '018f7c9a-1b2c-4d5e-8f90-0123456789ab';

function artifact(cycleId: string, id: string, seed: string, revision: string | null = null): MutableArtifact {
  const bytes = new TextEncoder().encode(seed);
  return {
    artifactId: id,
    key: `${candidateKeyPrefix(cycleId)}artifacts/${createHash('sha256').update(bytes).digest('hex')}.json`,
    contentHash: sha256(bytes),
    originalContentHash: sha256(bytes),
    byteLength: bytes.byteLength,
    sourceUrl: `https://example.com/${encodeURIComponent(id)}`,
    etag: '"fixture-etag"',
    lastModified: 'Wed, 12 Aug 2026 02:15:00 GMT',
    upstreamRevision: revision,
    schemaVersion: null,
  };
}

function partition(cycleId: string, id: string, seed: string): MutablePartition {
  const bytes = new TextEncoder().encode(seed);
  return {
    partitionId: id,
    kind: id === 'leaderboard' ? 'derived' : 'normalized',
    index: 0,
    key: `${candidateKeyPrefix(cycleId)}partitions/${id}.json`,
    contentHash: sha256(bytes),
    byteLength: bytes.byteLength,
    rowCount: 1,
  };
}

function validManifest(cycleId = CYCLE_ID): MutableManifest {
  const revision = 'lmarena-rev-7';
  return {
    schemaVersion: 1,
    cycleId,
    frozenCatalogRevision: 'catalog-rev-1',
    previousBenchmarkRevision: 'benchmark-rev-0',
    checkedAt: '2026-08-12T02:15:00.000Z',
    benchLm: BENCHLM_ARTIFACT_IDS.map((id) => artifact(cycleId, id, `benchlm:${id}`)),
    liteLlm: artifact(cycleId, 'model-prices', 'litellm:model-prices'),
    lmArenaRevision: revision,
    lmArena: [
      artifact(cycleId, 'lmarena:text:0', 'lmarena:0', revision),
      artifact(cycleId, 'lmarena:text:100', 'lmarena:100', revision),
    ],
    normalizedPartitions: [
      partition(cycleId, 'benchlm', 'norm:benchlm'),
      partition(cycleId, 'lmarena', 'norm:lmarena'),
    ],
    derivedPartitions: [partition(cycleId, 'leaderboard', 'derived:leaderboard')],
  };
}

describe('parseBenchmarkCandidateManifest', () => {
  it('accepts and deep-freezes a complete valid manifest', () => {
    const parsed = parseBenchmarkCandidateManifest(structuredClone(validManifest()));
    expect(parsed).toEqual(validManifest());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.benchLm)).toBe(true);
    expect(Object.isFrozen(parsed.benchLm[0])).toBe(true);
  });

  it('rejects an unknown schema version', () => {
    const bad = { ...structuredClone(validManifest()), schemaVersion: 2 };
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/schemaVersion/);
  });

  it('rejects unknown top-level keys', () => {
    const bad = { ...structuredClone(validManifest()), leakedField: true };
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/unknown key/i);
  });

  it('rejects unknown keys inside a candidate artifact', () => {
    const bad = structuredClone(validManifest());
    (bad.benchLm[0] as unknown as Record<string, unknown>).smuggled = 1;
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/unknown key/i);
  });

  it('rejects a BenchLM set missing one of the six artifacts', () => {
    const bad = structuredClone(validManifest());
    bad.benchLm = bad.benchLm.slice(0, 5);
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/BenchLM/);
  });

  it('rejects a BenchLM set with a duplicate artifact id', () => {
    const bad = structuredClone(validManifest());
    bad.benchLm = [...bad.benchLm.slice(0, 5), { ...bad.benchLm[4] }];
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/BenchLM/);
  });

  it('rejects mixed LMArena revisions', () => {
    const bad = structuredClone(validManifest());
    bad.lmArena = [
      { ...bad.lmArena[0], upstreamRevision: 'lmarena-rev-7' },
      { ...bad.lmArena[1], upstreamRevision: 'lmarena-rev-8' },
    ];
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/LMArena revision/i);
  });

  it('rejects a null LMArena revision with retrieved pages', () => {
    const bad = structuredClone(validManifest());
    bad.lmArenaRevision = null;
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/LMArena revision/i);
  });

  it('accepts an empty LMArena set only with a null revision', () => {
    const empty = structuredClone(validManifest());
    empty.lmArena = [];
    empty.lmArenaRevision = null;
    expect(() => parseBenchmarkCandidateManifest(empty)).not.toThrow();
  });

  it('rejects duplicate R2 keys across artifacts', () => {
    const bad = structuredClone(validManifest());
    bad.liteLlm = { ...bad.liteLlm!, key: bad.benchLm[0].key };
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/duplicate/i);
  });

  it('rejects keys outside the cycle prefix', () => {
    const bad = structuredClone(validManifest());
    bad.benchLm[0] = { ...bad.benchLm[0], key: 'benchmark-candidates/other-cycle/artifacts/x.json' };
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/key/i);
  });

  it('rejects path-traversal keys', () => {
    const bad = structuredClone(validManifest());
    bad.benchLm[0] = { ...bad.benchLm[0], key: `${candidateKeyPrefix(CYCLE_ID)}../escape.json` };
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/key/i);
  });

  it('rejects an unsafe cycle id', () => {
    const bad = structuredClone(validManifest());
    bad.cycleId = '../../etc';
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/cycleId/);
  });

  it('rejects an unbounded LMArena page set', () => {
    const bad = structuredClone(validManifest());
    bad.lmArena = Array.from({ length: MAX_LMARENA_CANDIDATE_ARTIFACTS + 1 }, (_, index) =>
      artifact(CYCLE_ID, `lmarena:text:${index}`, `lmarena:page:${index}`, 'lmarena-rev-7'));
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/bound|too many/i);
  });

  it('rejects unbounded normalized partitions', () => {
    const bad = structuredClone(validManifest());
    bad.normalizedPartitions = Array.from({ length: MAX_CANDIDATE_PARTITIONS + 1 }, (_, index) =>
      partition(CYCLE_ID, `partition-${index}`, `norm:${index}`));
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/bound|too many/i);
  });

  it('rejects a non-ISO checkedAt timestamp', () => {
    const bad = structuredClone(validManifest());
    bad.checkedAt = '2026-08-12 02:15:00';
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/checkedAt/);
  });

  it('rejects a malformed content hash', () => {
    const bad = structuredClone(validManifest());
    bad.benchLm[0] = { ...bad.benchLm[0], contentHash: 'deadbeef' };
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/contentHash|hash/);
  });

  it('rejects missing or malformed immutable provenance', () => {
    const missing = structuredClone(validManifest()) as unknown as Record<string, unknown>;
    delete (missing.benchLm as Record<string, unknown>[])[0].originalContentHash;
    expect(() => parseBenchmarkCandidateManifest(missing)).toThrow(/originalContentHash/);

    const badUrl = structuredClone(validManifest());
    badUrl.benchLm[0] = { ...badUrl.benchLm[0], sourceUrl: 'http://example.com/unsafe' };
    expect(() => parseBenchmarkCandidateManifest(badUrl)).toThrow(/sourceUrl/);
  });

  it('rejects a non-positive byte length', () => {
    const bad = structuredClone(validManifest());
    bad.benchLm[0] = { ...bad.benchLm[0], byteLength: 0 };
    expect(() => parseBenchmarkCandidateManifest(bad)).toThrow(/byteLength/);
  });
});

describe('writeCandidateArtifact', () => {
  it('writes a content-addressed artifact under the cycle prefix and returns provenance', async () => {
    const { bucket, objects, puts } = createR2();
    const bytes = new TextEncoder().encode('{"a":1}');
    const result = await writeCandidateArtifact(bucket, CYCLE_ID, {
      artifactId: 'leaderboard',
      bytes,
      originalContentHash: sha256(bytes),
      sourceUrl: 'https://benchlm.ai/data/leaderboard.json',
      etag: '"leaderboard-v1"',
      lastModified: null,
      upstreamRevision: null,
      schemaVersion: 'benchlm-v2',
    });
    expect(result.key.startsWith(`${candidateKeyPrefix(CYCLE_ID)}artifacts/`)).toBe(true);
    expect(result.contentHash).toBe(sha256(bytes));
    expect(result.byteLength).toBe(bytes.byteLength);
    expect(result.originalContentHash).toBe(sha256(bytes));
    expect(result.sourceUrl).toBe('https://benchlm.ai/data/leaderboard.json');
    expect(objects.get(result.key)?.customMetadata.content_hash).toBe(sha256(bytes));
    expect(puts).toEqual([result.key]);
  });

  it('is idempotent for identical bytes (no second put)', async () => {
    const { bucket, puts } = createR2();
    const bytes = new TextEncoder().encode('{"a":1}');
    const input = {
      artifactId: 'a', bytes, originalContentHash: sha256(bytes),
      sourceUrl: 'https://example.com/a', etag: null, lastModified: null,
      upstreamRevision: null, schemaVersion: null,
    };
    const first = await writeCandidateArtifact(bucket, CYCLE_ID, input);
    const second = await writeCandidateArtifact(bucket, CYCLE_ID, input);
    expect(second).toEqual(first);
    expect(puts).toEqual([first.key]);
  });

  it('rejects a corrupted content-addressed object rather than trusting the key', async () => {
    const { bucket, objects } = createR2();
    const bytes = new TextEncoder().encode('{"a":1}');
    const input = {
      artifactId: 'a', bytes, originalContentHash: sha256(bytes),
      sourceUrl: 'https://example.com/a', etag: null, lastModified: null,
      upstreamRevision: null, schemaVersion: null,
    };
    const result = await writeCandidateArtifact(bucket, CYCLE_ID, input);
    objects.set(result.key, {
      bytes: new TextEncoder().encode('{"a":2}'),
      customMetadata: { content_hash: result.contentHash },
    });
    await expect(writeCandidateArtifact(bucket, CYCLE_ID, input))
      .rejects.toThrow(/content hash|exact bytes/i);
  });

  it('rehashes exact stored bytes before a downstream source step uses them', async () => {
    const { bucket, objects } = createR2();
    const bytes = new TextEncoder().encode('{"a":1}');
    const artifact = await writeCandidateArtifact(bucket, CYCLE_ID, {
      artifactId: 'a', bytes, originalContentHash: sha256(bytes),
      sourceUrl: 'https://example.com/a', etag: null, lastModified: null,
      upstreamRevision: null, schemaVersion: null,
    });
    await expect(readCandidateArtifact(bucket, CYCLE_ID, artifact)).resolves.toEqual(bytes);
    objects.get(artifact.key)!.bytes = new TextEncoder().encode('{"a":2}');
    await expect(readCandidateArtifact(bucket, CYCLE_ID, artifact)).rejects.toThrow(/exact bytes/);
  });
});

describe('candidate manifest storage', () => {
  it('writes a canonical manifest at the fixed key and records its hash', async () => {
    const { bucket, objects } = createR2();
    const written = await writeCandidateManifest(bucket, CYCLE_ID, validManifest());
    expect(written.key).toBe(candidateManifestKey(CYCLE_ID));
    const stored = objects.get(written.key)!;
    expect(sha256(stored.bytes)).toBe(written.contentHash);
    // Canonical: byte-for-byte stable regardless of top-level key order.
    const reordered = Object.fromEntries(Object.entries(validManifest()).reverse());
    const again = await writeCandidateManifest(bucket, CYCLE_ID, reordered as unknown as BenchmarkCandidateManifestV1);
    expect(again.contentHash).toBe(written.contentHash);
  });

  it('round-trips through read with rehash and runtime validation', async () => {
    const { bucket } = createR2();
    const written = await writeCandidateManifest(bucket, CYCLE_ID, validManifest());
    const manifest = await readCandidateManifest(bucket, CYCLE_ID, written.contentHash);
    expect(manifest).toEqual(validManifest());
  });

  it('rejects a read whose bytes do not match the recorded hash', async () => {
    const { bucket, objects } = createR2();
    const written = await writeCandidateManifest(bucket, CYCLE_ID, validManifest());
    objects.set(written.key, {
      bytes: new TextEncoder().encode('{"schemaVersion":1}'),
      customMetadata: {},
    });
    await expect(readCandidateManifest(bucket, CYCLE_ID, written.contentHash))
      .rejects.toThrow(/content hash|exact bytes/i);
  });

  it('runtime-validates the manifest on read even when the hash matches its bytes', async () => {
    const { bucket, objects } = createR2();
    const key = candidateManifestKey(CYCLE_ID);
    const tampered = new TextEncoder().encode('{"schemaVersion":2}');
    objects.set(key, { bytes: tampered, customMetadata: {} });
    await expect(readCandidateManifest(bucket, CYCLE_ID, sha256(tampered)))
      .rejects.toThrow(/schemaVersion/);
  });

  it('keeps candidate keys of distinct cycles disjoint', async () => {
    const other = randomUUID();
    expect(candidateKeyPrefix(CYCLE_ID)).not.toBe(candidateKeyPrefix(other));
    expect(candidateManifestKey(other).startsWith(candidateKeyPrefix(other))).toBe(true);
  });
});
