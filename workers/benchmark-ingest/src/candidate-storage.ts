/**
 * Attempt-owned R2 storage for one weekly benchmark retrieval cycle.
 *
 * Every candidate object lives under `benchmark-candidates/{cycleId}/`, is
 * written content-addressed by the exact SHA-256 of its bytes, and is therefore
 * idempotent: a replayed alarm rewrites the same key with the same bytes. The
 * manifest is a single canonical JSON payload whose SHA-256 the Durable Object
 * records; reads rehash the stored bytes and runtime-validate the manifest
 * before any downstream step trusts it. This module holds no mutable state — a
 * caller supplies the R2 binding and cycle id on every call.
 */

/** Minimal R2 surface consumed here, matching the generated Worker bindings. */
export interface CandidateR2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
  readonly customMetadata?: Record<string, string>;
}

export interface CandidateR2Bucket {
  get(key: string): Promise<CandidateR2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBufferView,
    options?: { httpMetadata?: { contentType: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>;
}

/** One attempt-owned candidate object stored in R2 during a cycle. */
export interface CandidateArtifact {
  readonly artifactId: string;
  readonly key: string;
  readonly contentHash: string;
  readonly originalContentHash: string;
  readonly byteLength: number;
  readonly sourceUrl: string;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly upstreamRevision: string | null;
  readonly schemaVersion: string | null;
}

/** One normalized or derived partition staged for later publication. */
export interface CandidatePartition {
  readonly partitionId: string;
  readonly kind: string;
  readonly index: number;
  readonly key: string;
  readonly contentHash: string;
  readonly byteLength: number;
  readonly rowCount: number;
}

/** Minimum durable shape of a weekly benchmark candidate manifest. */
export interface BenchmarkCandidateManifestV1 {
  readonly schemaVersion: 1;
  readonly cycleId: string;
  readonly frozenCatalogRevision: string;
  readonly previousBenchmarkRevision: string | null;
  readonly checkedAt: string;
  readonly benchLm: readonly CandidateArtifact[];
  readonly liteLlm: CandidateArtifact | null;
  readonly lmArenaRevision: string | null;
  readonly lmArena: readonly CandidateArtifact[];
  readonly normalizedPartitions: readonly CandidatePartition[];
  readonly derivedPartitions: readonly CandidatePartition[];
}

/** The exactly-six BenchLM artifacts a complete candidate manifest must carry. */
export const BENCHLM_ARTIFACT_IDS = [
  'leaderboard',
  'models',
  'pricing',
  'comparisons',
  'benchmarks',
  'public-leaderboard',
] as const;

/** LMArena dataset-viewer pages are hard-bounded at 200 per the plan. */
export const MAX_LMARENA_CANDIDATE_ARTIFACTS = 200;
/** Normalized and derived partition lists are individually bounded. */
export const MAX_CANDIDATE_PARTITIONS = 64;

const MAX_CANDIDATE_BYTES = 8 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_KEY_LENGTH = 1024;

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CYCLE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTENT_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SAFE_KEY_SEGMENT = /^[A-Za-z0-9._-]+$/;

const MANIFEST_KEYS = [
  'schemaVersion',
  'cycleId',
  'frozenCatalogRevision',
  'previousBenchmarkRevision',
  'checkedAt',
  'benchLm',
  'liteLlm',
  'lmArenaRevision',
  'lmArena',
  'normalizedPartitions',
  'derivedPartitions',
] as const;
const ARTIFACT_KEYS = [
  'artifactId', 'key', 'contentHash', 'originalContentHash', 'byteLength',
  'sourceUrl', 'etag', 'lastModified', 'upstreamRevision', 'schemaVersion',
] as const;
const PARTITION_KEYS = [
  'partitionId', 'kind', 'index', 'key', 'contentHash', 'byteLength', 'rowCount',
] as const;

function fail(message: string): never {
  throw new Error(message);
}

/** The immutable R2 prefix that owns every object of one cycle. */
export function candidateKeyPrefix(cycleId: string): string {
  if (!CYCLE_ID_PATTERN.test(cycleId)) fail('candidate cycleId must be a lowercase UUID');
  return `benchmark-candidates/${cycleId}/`;
}

/** The single fixed key that holds the canonical manifest for one cycle. */
export function candidateManifestKey(cycleId: string): string {
  return `${candidateKeyPrefix(cycleId)}manifest.json`;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertNoUnknownKeys(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set<string>(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) fail(`${label} has an unknown key: ${key}`);
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function readNullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requireString(value, label);
}

function requireContentHash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !CONTENT_HASH_PATTERN.test(value)) {
    fail(`${label} must be a sha256 digest`);
  }
  return value;
}

function requireByteLength(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_CANDIDATE_BYTES) {
    fail(`${label} must be an integer between 1 and ${MAX_CANDIDATE_BYTES}`);
  }
  return value;
}

function requireSafeKey(value: unknown, prefix: string, label: string): string {
  if (typeof value !== 'string') fail(`${label} key must be a string`);
  if (value.length === 0 || value.length > MAX_KEY_LENGTH) fail(`${label} key length is out of bounds`);
  if (!value.startsWith(prefix)) fail(`${label} key must live under ${prefix}`);
  const suffix = value.slice(prefix.length);
  if (suffix.length === 0) fail(`${label} key must name an object under ${prefix}`);
  for (const segment of suffix.split('/')) {
    if (segment === '' || segment === '.' || segment === '..' || !SAFE_KEY_SEGMENT.test(segment)) {
      fail(`${label} key contains an unsafe segment`);
    }
  }
  return value;
}

function readCandidateArtifactDescriptor(value: unknown, prefix: string, label: string): CandidateArtifact {
  const record = requireRecord(value, label);
  assertNoUnknownKeys(record, ARTIFACT_KEYS, label);
  return {
    artifactId: requireString(record.artifactId, `${label}.artifactId`),
    key: requireSafeKey(record.key, prefix, label),
    contentHash: requireContentHash(record.contentHash, `${label}.contentHash`),
    originalContentHash: requireContentHash(record.originalContentHash, `${label}.originalContentHash`),
    byteLength: requireByteLength(record.byteLength, `${label}.byteLength`),
    sourceUrl: requireSourceUrl(record.sourceUrl, `${label}.sourceUrl`),
    etag: readNullableString(record.etag, `${label}.etag`),
    lastModified: readNullableString(record.lastModified, `${label}.lastModified`),
    upstreamRevision: readNullableString(record.upstreamRevision, `${label}.upstreamRevision`),
    schemaVersion: readNullableString(record.schemaVersion, `${label}.schemaVersion`),
  };
}

function requireSourceUrl(value: unknown, label: string): string {
  const sourceUrl = requireString(value, label);
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return fail(`${label} must be a valid HTTPS URL`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    fail(`${label} must be a credential-free HTTPS URL`);
  }
  return sourceUrl;
}

function readCandidatePartition(value: unknown, prefix: string, label: string): CandidatePartition {
  const record = requireRecord(value, label);
  assertNoUnknownKeys(record, PARTITION_KEYS, label);
  return {
    partitionId: requireString(record.partitionId, `${label}.partitionId`),
    kind: requireString(record.kind, `${label}.kind`),
    index: requireNonNegativeInteger(record.index, `${label}.index`),
    key: requireSafeKey(record.key, prefix, label),
    contentHash: requireContentHash(record.contentHash, `${label}.contentHash`),
    byteLength: requireByteLength(record.byteLength, `${label}.byteLength`),
    rowCount: requireNonNegativeInteger(record.rowCount, `${label}.rowCount`),
  };
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function readBenchLmSet(value: unknown, prefix: string): CandidateArtifact[] {
  if (!Array.isArray(value)) fail('candidate manifest BenchLM set must be an array');
  if (value.length > BENCHLM_ARTIFACT_IDS.length) fail('candidate manifest BenchLM set is unbounded');
  const artifacts = value.map((entry, index) =>
    readCandidateArtifactDescriptor(entry, prefix, `candidate manifest benchLm[${index}]`));
  const ids = new Set(artifacts.map((artifact) => artifact.artifactId));
  if (ids.size !== artifacts.length) fail('candidate manifest BenchLM set has duplicate artifact ids');
  for (const required of BENCHLM_ARTIFACT_IDS) {
    if (!ids.has(required)) fail(`candidate manifest BenchLM set is missing the ${required} artifact`);
  }
  return artifacts;
}

function readLmArenaSet(
  value: unknown,
  revision: string | null,
  prefix: string,
): CandidateArtifact[] {
  if (!Array.isArray(value)) fail('candidate manifest lmArena set must be an array');
  if (value.length > MAX_LMARENA_CANDIDATE_ARTIFACTS) {
    fail('candidate manifest lmArena set exceeds the 200-page bound');
  }
  const artifacts = value.map((entry, index) =>
    readCandidateArtifactDescriptor(entry, prefix, `candidate manifest lmArena[${index}]`));
  const ids = new Set(artifacts.map((artifact) => artifact.artifactId));
  if (ids.size !== artifacts.length) fail('candidate manifest lmArena set has duplicate artifact ids');
  if (artifacts.length === 0) {
    if (revision !== null) fail('candidate manifest LMArena revision must be null without retrieved pages');
    return artifacts;
  }
  if (revision === null) fail('candidate manifest LMArena revision is required for retrieved pages');
  for (const artifact of artifacts) {
    if (artifact.upstreamRevision !== revision) fail('candidate manifest has mixed LMArena revisions');
  }
  return artifacts;
}

function readPartitionSet(value: unknown, prefix: string, label: string): CandidatePartition[] {
  if (!Array.isArray(value)) fail(`candidate manifest ${label} must be an array`);
  if (value.length > MAX_CANDIDATE_PARTITIONS) fail(`candidate manifest ${label} exceeds the candidate partition bound`);
  const partitions = value.map((entry, index) =>
    readCandidatePartition(entry, prefix, `candidate manifest ${label}[${index}]`));
  const ids = new Set(partitions.map((partition) => partition.partitionId));
  if (ids.size !== partitions.length) fail(`candidate manifest ${label} has duplicate partition ids`);
  return partitions;
}

/**
 * Strictly parse an untrusted candidate manifest into the exact V1 shape,
 * rejecting unknown schema/keys, an incomplete or duplicated BenchLM set,
 * mixed LMArena revisions, duplicate R2 keys, unsafe keys, and unbounded counts.
 * The result is deep-frozen so no downstream step can mutate a validated cycle.
 */
export function parseBenchmarkCandidateManifest(value: unknown): BenchmarkCandidateManifestV1 {
  const record = requireRecord(value, 'benchmark candidate manifest');
  assertNoUnknownKeys(record, MANIFEST_KEYS, 'benchmark candidate manifest');
  if (record.schemaVersion !== 1) fail('benchmark candidate manifest schemaVersion must be 1');

  const cycleId = requireString(record.cycleId, 'benchmark candidate manifest cycleId');
  if (!CYCLE_ID_PATTERN.test(cycleId)) fail('benchmark candidate manifest cycleId must be a lowercase UUID');
  const prefix = candidateKeyPrefix(cycleId);

  const checkedAt = requireString(record.checkedAt, 'benchmark candidate manifest checkedAt');
  if (!ISO_TIMESTAMP.test(checkedAt)) fail('benchmark candidate manifest checkedAt must be a canonical ISO timestamp');

  const lmArenaRevision = readNullableString(record.lmArenaRevision, 'benchmark candidate manifest lmArenaRevision');
  const benchLm = readBenchLmSet(record.benchLm, prefix);
  const liteLlm = record.liteLlm === null
    ? null
    : readCandidateArtifactDescriptor(record.liteLlm, prefix, 'benchmark candidate manifest liteLlm');
  const lmArena = readLmArenaSet(record.lmArena, lmArenaRevision, prefix);
  const normalizedPartitions = readPartitionSet(record.normalizedPartitions, prefix, 'normalizedPartitions');
  const derivedPartitions = readPartitionSet(record.derivedPartitions, prefix, 'derivedPartitions');

  const claimed = new Set<string>();
  const artifactKeys = [
    ...benchLm.map((artifact) => artifact.key),
    ...(liteLlm ? [liteLlm.key] : []),
    ...lmArena.map((artifact) => artifact.key),
    ...normalizedPartitions.map((partition) => partition.key),
    ...derivedPartitions.map((partition) => partition.key),
  ];
  for (const key of artifactKeys) {
    if (claimed.has(key)) fail(`benchmark candidate manifest has a duplicate R2 key: ${key}`);
    claimed.add(key);
  }

  return deepFreeze({
    schemaVersion: 1,
    cycleId,
    frozenCatalogRevision: requireString(record.frozenCatalogRevision, 'benchmark candidate manifest frozenCatalogRevision'),
    previousBenchmarkRevision: readNullableString(record.previousBenchmarkRevision, 'benchmark candidate manifest previousBenchmarkRevision'),
    checkedAt,
    benchLm,
    liteLlm,
    lmArenaRevision,
    lmArena,
    normalizedPartitions,
    derivedPartitions,
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = canonicalize(source[key]);
    return sorted;
  }
  return value;
}

async function sha256Digest(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
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

/**
 * Write one attempt-owned candidate object content-addressed by the exact
 * SHA-256 of its bytes. A replay finds the existing object, re-verifies its
 * exact bytes, and performs no second write; a corrupted object is rejected.
 */
export async function writeCandidateArtifact(
  bucket: CandidateR2Bucket,
  cycleId: string,
  input: {
    artifactId: string;
    bytes: Uint8Array;
    originalContentHash: string;
    sourceUrl: string;
    etag: string | null;
    lastModified: string | null;
    upstreamRevision: string | null;
    schemaVersion: string | null;
  },
): Promise<CandidateArtifact> {
  const prefix = candidateKeyPrefix(cycleId);
  const { artifactId, bytes } = input;
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_CANDIDATE_BYTES) {
    fail(`candidate artifact ${artifactId} byte length is out of bounds`);
  }
  const contentHash = await sha256Digest(bytes);
  requireContentHash(input.originalContentHash, 'candidate artifact originalContentHash');
  requireSourceUrl(input.sourceUrl, 'candidate artifact sourceUrl');
  const key = `${prefix}artifacts/${contentHash.slice('sha256:'.length)}.json`;
  const existing = await bucket.get(key);
  if (existing) {
    const existingBytes = new Uint8Array(await existing.arrayBuffer());
    if (await sha256Digest(existingBytes) !== contentHash || existing.customMetadata?.content_hash !== contentHash) {
      fail(`candidate artifact ${artifactId} content-addressed object does not match its exact bytes`);
    }
  } else {
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { content_hash: contentHash },
    });
  }
  return {
    artifactId,
    key,
    contentHash,
    originalContentHash: input.originalContentHash,
    byteLength: bytes.byteLength,
    sourceUrl: input.sourceUrl,
    etag: input.etag,
    lastModified: input.lastModified,
    upstreamRevision: input.upstreamRevision,
    schemaVersion: input.schemaVersion,
  };
}

/** Read and rehash one exact candidate artifact before any normalization step. */
export async function readCandidateArtifact(
  bucket: CandidateR2Bucket,
  cycleId: string,
  artifact: CandidateArtifact,
): Promise<Uint8Array> {
  const validated = readCandidateArtifactDescriptor(artifact, candidateKeyPrefix(cycleId), 'candidate artifact');
  const object = await bucket.get(validated.key);
  if (!object) fail(`candidate artifact ${validated.artifactId} is missing`);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength !== validated.byteLength || await sha256Digest(bytes) !== validated.contentHash) {
    fail(`candidate artifact ${validated.artifactId} content hash does not match its exact bytes`);
  }
  return bytes;
}

/**
 * Validate, canonicalize, and store the cycle manifest at its fixed key,
 * returning the SHA-256 the Durable Object records. Identical manifest content
 * always yields identical canonical bytes and hash, so a replayed update is a
 * no-op write of the same bytes.
 */
export async function writeCandidateManifest(
  bucket: CandidateR2Bucket,
  cycleId: string,
  manifest: BenchmarkCandidateManifestV1,
): Promise<{ key: string; contentHash: string; byteLength: number }> {
  const validated = parseBenchmarkCandidateManifest(manifest);
  if (validated.cycleId !== cycleId) fail('candidate manifest cycleId does not match the target cycle');
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(validated)));
  if (bytes.byteLength > MAX_MANIFEST_BYTES) fail('candidate manifest exceeds the manifest byte bound');
  const key = candidateManifestKey(cycleId);
  const contentHash = await sha256Digest(bytes);
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { content_hash: contentHash },
  });
  return { key, contentHash, byteLength: bytes.byteLength };
}

/**
 * Read the cycle manifest, rehash the exact stored bytes against the recorded
 * SHA-256, and runtime-validate the payload before any step trusts it.
 */
export async function readCandidateManifest(
  bucket: CandidateR2Bucket,
  cycleId: string,
  expectedContentHash: string,
): Promise<BenchmarkCandidateManifestV1> {
  const object = await bucket.get(candidateManifestKey(cycleId));
  if (!object) fail('candidate manifest is missing');
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength > MAX_MANIFEST_BYTES) fail('stored candidate manifest exceeds the manifest byte bound');
  if (await sha256Digest(bytes) !== expectedContentHash) {
    fail('candidate manifest content hash does not match its exact bytes');
  }
  return parseBenchmarkCandidateManifest(decodeJson(bytes, 'candidate manifest'));
}
