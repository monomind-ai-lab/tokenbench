/**
 * Bounded, resumable benchmark source retrieval steps.
 *
 * Each exported step is one logical Durable Object alarm: it performs at most
 * one upstream request, never retries in place, and writes only attempt-owned
 * candidate objects below `benchmark-candidates/{cycleId}/`. Active source
 * records, D1 rows, and public pointers are never touched here; a later
 * coordinator phase promotes a complete, validated candidate.
 *
 * Everything runs on Web Crypto and the Fetch/Streams APIs so the module works
 * unchanged inside a Cloudflare Worker (no Node built-ins).
 */

import {
  type BenchmarkSourceRecord,
  type NormalizedSourceBatch,
  compareUtf8Binary,
  validateNormalizedSourceBatch,
} from '../../../src/benchmarks/contracts';
import { providerRetryAt } from '../../_shared/checkpointed-ingestion';
import type {
  CandidateArtifact,
  CandidatePartition,
} from './candidate-storage';
export type { CandidateArtifact, CandidatePartition } from './candidate-storage';
import {
  parseBenchLm,
  prepareBenchLmMixed,
  rehydrateBenchLmProjections,
  type BenchLmPreparationInput,
  type BenchLmPreparationInputs,
  type PreparedBenchLmPayloads,
  type StoredBenchLmProjections,
} from './benchlm';
import { parseLiteLlmPrices } from './litellm';
import {
  lmArenaHubParquetPageArtifactId,
  lmArenaHubParquetSourceUrl,
  lmArenaPageArtifactId,
  lmArenaPageSourceUrl,
  parseLmArenaSubset,
  type LmArenaPageArtifact,
  type LmArenaSubset,
} from './lmarena';

// ---------------------------------------------------------------------------
// Public source identity
// ---------------------------------------------------------------------------

/** The exact six BenchLM artifacts, in retrieval order. */
export const BENCHLM_ARTIFACTS = [
  'leaderboard',
  'models',
  'pricing',
  'comparisons',
  'benchmarks',
  'public-leaderboard',
] as const;

export type BenchLmArtifact = typeof BENCHLM_ARTIFACTS[number];

export const BENCHLM_URLS: Readonly<Record<BenchLmArtifact, string>> = {
  leaderboard: 'https://benchlm.ai/data/leaderboard.json',
  models: 'https://benchlm.ai/data/models.json',
  pricing: 'https://benchlm.ai/data/pricing.json',
  comparisons: 'https://benchlm.ai/data/comparisons.json',
  benchmarks: 'https://benchlm.ai/data/benchmarks.json',
  'public-leaderboard': 'https://benchlm.ai/api/data/leaderboard?mode=bench-align-v5',
};

const LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const LITELLM_ARTIFACT_ID = 'model-prices';
const LMARENA_HUB_INFO_URL = 'https://huggingface.co/api/datasets/lmarena-ai/leaderboard-dataset';
const USER_AGENT = 'TokenBench/1.0 (+https://tokenbench.monomind.one)';

/** Marks a BenchLM candidate whose bytes are the canonical safe projection. */
const BENCHLM_PROJECTION_SCHEMA_VERSION = 'v2';
const LMARENA_HUB_PARQUET_SCHEMA_VERSION = 'hub-parquet-v1';
const BENCHLM_BUNDLE_SCHEMA_VERSION = 'benchlm-bundle-v1';
const NORMALIZED_PARTITION_SCHEMA_VERSION = 'normalized-source-v1';

const MAX_BENCHLM_BYTES = 8 * 1024 * 1024;
const MAX_LITELLM_BYTES = 32 * 1024 * 1024;
const MAX_LMARENA_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_LMARENA_HUB_PARQUET_BYTES = 2 * 1024 * 1024;
const MAX_LMARENA_HUB_INFO_BYTES = 64 * 1024;
const MAX_BENCHLM_BUNDLE_BYTES = 64 * 1024;
const MAX_NORMALIZED_PARTITION_BYTES = 8 * 1024 * 1024;
const MAX_LMARENA_PAGES_PER_SUBSET = 200;
const LMARENA_PAGE_LENGTH = 100;
const LMARENA_SPLIT = 'latest';
const LMARENA_CATEGORY = 'overall';

// ---------------------------------------------------------------------------
// Structural candidate contracts
// ---------------------------------------------------------------------------

/**
 * Structural description of one immutable candidate object. It is deliberately
 * defined here so a retrieval step depends on no concrete storage module: the
 * shape is field-compatible with the attempt-owned candidate manifest records
 * and with the durable `BenchmarkSourceRecord` evidence fields.
 *
 * `key` names exact stored bytes, `contentHash` is the SHA-256 of those bytes,
 * and `originalContentHash` keeps the upstream response traceable without
 * mistaking raw data for the persisted projection.
 */
export interface CandidateObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
  readonly customMetadata?: Record<string, string>;
}

/** The exact R2 surface these steps need; the Worker passes its bucket binding. */
export interface CandidateObjectStore {
  get(key: string): Promise<CandidateObjectBody | null>;
  put(
    key: string,
    value: Uint8Array,
    options?: {
      httpMetadata?: { contentType: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
}

export interface SourceStepInput {
  readonly cycleId: string;
  readonly store: CandidateObjectStore;
  readonly fetchImpl: typeof fetch;
  /** UTC ISO observation timestamp for this bounded step. */
  readonly observedAt: string;
  /** Immutable artifact eligible for conditional reuse, when one exists. */
  readonly previous?: CandidateArtifact | null;
}

export interface AssembleBenchLmInput {
  readonly cycleId: string;
  readonly store: CandidateObjectStore;
  readonly artifacts: Readonly<Record<BenchLmArtifact, CandidateArtifact>>;
}

export type LmArenaPageTransport = 'dataset-viewer' | 'hub-parquet-resolve' | 'hub-parquet-download';

/** Pinned Hub Parquet download resolved by a dedicated single-request step. */
export interface LmArenaParquetDownload {
  readonly subset: LmArenaSubset;
  readonly upstreamRevision: string;
  readonly downloadUrl: string;
  readonly originalContentHash: string;
  readonly etag: string | null;
}

export interface LmArenaPageStepInput {
  readonly cycleId: string;
  readonly store: CandidateObjectStore;
  readonly fetchImpl: typeof fetch;
  readonly observedAt: string;
  readonly subset: LmArenaSubset;
  readonly offset: number;
  /** The single frozen LMArena revision shared by every subset in the cycle. */
  readonly upstreamRevision: string;
  readonly declaredTotal?: number | null;
  readonly previous?: CandidateArtifact | null;
  readonly transport?: LmArenaPageTransport;
  readonly download?: LmArenaParquetDownload | null;
  readonly readParquetRows?: (bytes: ArrayBuffer) => Promise<Record<string, unknown>[]>;
}

export type LmArenaPageStepOutput =
  | {
    readonly kind: 'page';
    readonly subset: LmArenaSubset;
    readonly offset: number;
    readonly artifact: CandidateArtifact;
    readonly rowCount: number;
    readonly declaredTotal: number;
    readonly complete: boolean;
  }
  | { readonly kind: 'resolved'; readonly download: LmArenaParquetDownload }
  | {
    readonly kind: 'pages';
    readonly subset: LmArenaSubset;
    readonly artifacts: readonly CandidateArtifact[];
    readonly declaredTotal: number;
  };

interface NormalizeSourceStepBase {
  readonly cycleId: string;
  readonly store: CandidateObjectStore;
  readonly observedAt: string;
  readonly index: number;
}

export type NormalizeSourceStepInput =
  | (NormalizeSourceStepBase & { readonly source: 'benchlm'; readonly bundle: CandidatePartition })
  | (NormalizeSourceStepBase & { readonly source: 'litellm'; readonly artifact: CandidateArtifact })
  | (NormalizeSourceStepBase & {
    readonly source: 'lmarena';
    readonly artifact: CandidateArtifact;
    readonly subset: LmArenaSubset;
    readonly offset: number;
  });

// ---------------------------------------------------------------------------
// Typed failures
// ---------------------------------------------------------------------------

export type SourceStepSourceId = BenchmarkSourceRecord['sourceId'];

export class SourceStepFailure extends Error {
  constructor(
    readonly sourceId: SourceStepSourceId,
    readonly artifactId: string,
    message: string,
    readonly transient = false,
  ) {
    super(message);
    this.name = 'SourceStepFailure';
  }
}

/**
 * HTTP 429 is never retried inside a step. The complete provider reset evidence
 * travels with the error so the coordinator can persist it and schedule a later
 * alarm.
 */
export class SourceRateLimitedError extends SourceStepFailure {
  readonly status = 429 as const;

  constructor(
    sourceId: SourceStepSourceId,
    artifactId: string,
    readonly retryAfter: string | null,
    readonly rateLimit: string | null,
    readonly providerRetryAtMs: number | null,
  ) {
    super(sourceId, artifactId, `${sourceId}/${artifactId} returned 429`, true);
    this.name = 'SourceRateLimitedError';
  }
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

async function sha256Digest(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function digestHex(contentHash: string): string {
  return contentHash.slice('sha256:'.length);
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function decodeJson(bytes: Uint8Array, label: string): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} must be valid UTF-8`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function byteArraysEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function normalizeProhibited(value: unknown): string {
  return JSON.stringify(value)
    .normalize('NFKC')
    .replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}_-]/gu, '')
    .toLowerCase();
}

function assertNoProhibitedData(value: unknown, label: string): void {
  if (normalizeProhibited(value).includes('artificialanalysis')) {
    throw new Error(`${label} contains prohibited Artificial Analysis data`);
  }
}

function requestHeaders(previous?: CandidateArtifact | null): Headers {
  const headers = new Headers({ 'user-agent': USER_AGENT, accept: 'application/json' });
  if (previous?.etag) headers.set('if-none-match', previous.etag);
  if (previous?.lastModified) headers.set('if-modified-since', previous.lastModified);
  return headers;
}

function nowMsFrom(observedAt: string): number {
  const parsed = Date.parse(observedAt);
  if (!Number.isFinite(parsed)) throw new Error('observedAt must be a finite UTC timestamp');
  return parsed;
}

/**
 * Converts a non-success upstream status into a typed failure. 429 always
 * becomes a `SourceRateLimitedError` carrying the complete provider reset;
 * nothing here retries.
 */
function assertUpstreamStatus(
  response: Response,
  sourceId: SourceStepSourceId,
  artifactId: string,
  observedAt: string,
): void {
  if (response.status === 429) {
    throw new SourceRateLimitedError(
      sourceId,
      artifactId,
      response.headers.get('retry-after'),
      response.headers.get('ratelimit'),
      providerRetryAt(response.headers, nowMsFrom(observedAt)),
    );
  }
  if (response.ok || response.status === 304) return;
  const transient = response.status === 408 || response.status >= 500;
  throw new SourceStepFailure(
    sourceId,
    artifactId,
    `${sourceId}/${artifactId} returned ${response.status}`,
    transient,
  );
}

async function readBoundedBytes(response: Response, limit: number, label: string): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > limit) {
    throw new Error(`${label} response exceeds ${limit} byte limit`);
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > limit) throw new Error(`${label} response exceeds ${limit} byte limit`);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel('payload too large');
        throw new Error(`${label} response exceeds ${limit} byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Attempt-owned candidate keys and objects
// ---------------------------------------------------------------------------

function candidatePrefix(cycleId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(cycleId)) {
    throw new Error('cycleId must be a safe attempt-owned identifier');
  }
  return `benchmark-candidates/${cycleId}/`;
}

/**
 * Writes one immutable, content-addressed candidate object. Writes are scoped
 * to the attempt prefix, so a step can never alter an active source record, and
 * are idempotent: an existing key must already hold the exact same bytes.
 */
async function putCandidateObject(
  store: CandidateObjectStore,
  cycleId: string,
  key: string,
  bytes: Uint8Array,
  contentHash: string,
  originalContentHash: string,
): Promise<void> {
  const prefix = candidatePrefix(cycleId);
  if (!key.startsWith(prefix)) {
    throw new Error('candidate objects must be written inside the attempt-owned prefix');
  }
  const existing = await store.get(key);
  if (existing) {
    const existingBytes = new Uint8Array(await existing.arrayBuffer());
    if (!byteArraysEqual(existingBytes, bytes)) {
      throw new Error(`candidate object ${key} already holds different bytes`);
    }
    return;
  }
  await store.put(key, bytes, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { content_hash: contentHash, original_content_hash: originalContentHash },
  });
}

/** Reads exact candidate bytes and re-validates them against their record. */
async function readExactCandidateBytes(
  store: CandidateObjectStore,
  artifact: CandidateArtifact,
  label: string,
): Promise<Uint8Array> {
  const object = await store.get(artifact.key);
  if (!object) throw new Error(`${label} immutable candidate object is missing`);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await sha256Digest(bytes) !== artifact.contentHash) {
    throw new Error(`${label} content hash does not match exact bytes`);
  }
  if (bytes.byteLength !== artifact.byteLength) {
    throw new Error(`${label} byte length does not match exact bytes`);
  }
  const recordedOriginal = object.customMetadata?.original_content_hash;
  if (recordedOriginal !== undefined && recordedOriginal !== artifact.originalContentHash) {
    throw new Error(`${label} original content hash does not match its candidate record`);
  }
  return bytes;
}

async function readExactPartitionBytes(
  store: CandidateObjectStore,
  partition: CandidatePartition,
  label: string,
): Promise<Uint8Array> {
  const object = await store.get(partition.key);
  if (!object) throw new Error(`${label} immutable candidate partition is missing`);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await sha256Digest(bytes) !== partition.contentHash) {
    throw new Error(`${label} content hash does not match exact bytes`);
  }
  if (bytes.byteLength !== partition.byteLength) {
    throw new Error(`${label} byte length does not match exact bytes`);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// BenchLM retrieval
// ---------------------------------------------------------------------------

function isBenchLmArtifact(value: string): value is BenchLmArtifact {
  return (BENCHLM_ARTIFACTS as readonly string[]).includes(value);
}

function benchLmRawKey(cycleId: string, artifact: BenchLmArtifact, contentHash: string): string {
  return `${candidatePrefix(cycleId)}benchlm/raw/${artifact}/${digestHex(contentHash)}.json`;
}

function benchLmProjectedKey(cycleId: string, artifact: BenchLmArtifact, contentHash: string): string {
  return `${candidatePrefix(cycleId)}benchlm/projected/${artifact}/${digestHex(contentHash)}.json`;
}

/**
 * Retrieves exactly one BenchLM artifact with at most one upstream request.
 *
 * A 200 stores the exact bounded upstream bytes; the canonical projection is
 * produced once by `assembleBenchLmStep`, which is the only place the six
 * artifacts are known together. A 304 is honored only after the referenced R2
 * object is re-read and re-hashed against the recorded candidate evidence.
 */
export async function retrieveBenchLmArtifactStep(
  input: SourceStepInput & { readonly artifact: BenchLmArtifact },
): Promise<CandidateArtifact> {
  const { cycleId, store, fetchImpl, observedAt, previous, artifact } = input;
  if (typeof artifact !== 'string' || !isBenchLmArtifact(artifact)) {
    throw new Error(`BenchLM artifact ${String(artifact)} is not accepted`);
  }
  const sourceUrl = BENCHLM_URLS[artifact];
  const response = await fetchImpl(sourceUrl, { headers: requestHeaders(previous) });
  assertUpstreamStatus(response, 'benchlm', artifact, observedAt);

  if (response.status === 304) {
    if (!previous) {
      throw new SourceStepFailure('benchlm', artifact, `BenchLM ${artifact} returned 304 without an immutable candidate`);
    }
    if (previous.artifactId !== artifact) {
      throw new SourceStepFailure('benchlm', artifact, `BenchLM ${artifact} conditional candidate has the wrong artifact identity`);
    }
    const bytes = await readExactCandidateBytes(store, previous, `BenchLM ${artifact}`);
    const key = previous.schemaVersion === BENCHLM_PROJECTION_SCHEMA_VERSION
      ? benchLmProjectedKey(cycleId, artifact, previous.contentHash)
      : benchLmRawKey(cycleId, artifact, previous.contentHash);
    await putCandidateObject(
      store,
      cycleId,
      key,
      bytes,
      previous.contentHash,
      previous.originalContentHash,
    );
    return { ...previous, key };
  }

  const bytes = await readBoundedBytes(response, MAX_BENCHLM_BYTES, `BenchLM ${artifact}`);
  // Reject an unusable body now so a later assemble alarm cannot fail on bytes
  // that were already accepted as a completed step.
  decodeJson(bytes, `BenchLM ${artifact} response`);
  const contentHash = await sha256Digest(bytes);
  const key = benchLmRawKey(cycleId, artifact, contentHash);
  await putCandidateObject(store, cycleId, key, bytes, contentHash, contentHash);
  return {
    artifactId: artifact,
    key,
    contentHash,
    originalContentHash: contentHash,
    byteLength: bytes.byteLength,
    sourceUrl,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    upstreamRevision: null,
    schemaVersion: null,
  };
}

async function benchLmPreparationInput(
  store: CandidateObjectStore,
  artifact: BenchLmArtifact,
  candidate: CandidateArtifact,
): Promise<BenchLmPreparationInput> {
  const bytes = await readExactCandidateBytes(store, candidate, `BenchLM ${artifact}`);
  const headers = { etag: candidate.etag, lastModified: candidate.lastModified };
  if (candidate.schemaVersion === BENCHLM_PROJECTION_SCHEMA_VERSION) {
    return {
      projectedBytes: bytes,
      projectedSha256: digestHex(candidate.contentHash),
      originalSha256: digestHex(candidate.originalContentHash),
      headers,
    };
  }
  if (candidate.schemaVersion !== null) {
    throw new Error(`BenchLM ${artifact} candidate has an unsupported schemaVersion`);
  }
  return { bytes, headers };
}

/**
 * Projects the six retrieved BenchLM artifacts into their canonical safe form
 * and records them as one bounded attempt-owned bundle partition.
 *
 * A bundle whose artifacts disagree on `generatedAt` is rejected here, before
 * any normalization, so a torn upstream publish can never reach the candidate.
 */
export async function assembleBenchLmStep(input: AssembleBenchLmInput): Promise<CandidatePartition> {
  const { cycleId, store, artifacts } = input;
  const candidates = requireRecord(artifacts, 'BenchLM candidate artifacts');
  const preparationEntries: [BenchLmArtifact, BenchLmPreparationInput][] = [];
  for (const artifact of BENCHLM_ARTIFACTS) {
    const candidate = candidates[artifact] as CandidateArtifact | undefined;
    if (!candidate) throw new Error(`BenchLM ${artifact} candidate artifact is missing`);
    if (candidate.artifactId !== artifact) {
      throw new Error(`BenchLM ${artifact} candidate artifact has the wrong artifact identity`);
    }
    preparationEntries.push([artifact, await benchLmPreparationInput(store, artifact, candidate)]);
  }

  const prepared: PreparedBenchLmPayloads = await prepareBenchLmMixed(
    Object.fromEntries(preparationEntries) as BenchLmPreparationInputs,
  );
  const generatedAt = prepared.leaderboard.payload.generatedAt;
  for (const artifact of BENCHLM_ARTIFACTS) {
    if (artifact === 'public-leaderboard') continue;
    if (prepared[artifact].payload.generatedAt !== generatedAt) {
      throw new Error('BenchLM artifact generatedAt values must match');
    }
  }

  const projected: CandidateArtifact[] = [];
  for (const artifact of BENCHLM_ARTIFACTS) {
    const bytes = new Uint8Array(prepared[artifact].projectedBytes);
    const contentHash = `sha256:${prepared[artifact].projectedSha256}`;
    const originalContentHash = `sha256:${prepared[artifact].originalSha256}`;
    const key = benchLmProjectedKey(cycleId, artifact, contentHash);
    await putCandidateObject(store, cycleId, key, bytes, contentHash, originalContentHash);
    projected.push({
      artifactId: artifact,
      key,
      contentHash,
      originalContentHash,
      byteLength: bytes.byteLength,
      sourceUrl: BENCHLM_URLS[artifact],
      etag: prepared[artifact].headers.etag,
      lastModified: prepared[artifact].headers.lastModified,
      upstreamRevision: null,
      schemaVersion: BENCHLM_PROJECTION_SCHEMA_VERSION,
    });
  }

  const bundleBytes = jsonBytes({
    schemaVersion: BENCHLM_BUNDLE_SCHEMA_VERSION,
    cycleId,
    generatedAt,
    artifacts: projected,
  });
  if (bundleBytes.byteLength > MAX_BENCHLM_BUNDLE_BYTES) {
    throw new Error(`BenchLM bundle partition exceeds ${MAX_BENCHLM_BUNDLE_BYTES} byte limit`);
  }
  const contentHash = await sha256Digest(bundleBytes);
  const key = `${candidatePrefix(cycleId)}benchlm/bundle/${digestHex(contentHash)}.json`;
  await putCandidateObject(store, cycleId, key, bundleBytes, contentHash, contentHash);
  return {
    partitionId: 'benchlm-bundle:0',
    kind: 'benchlm-bundle',
    index: 0,
    key,
    contentHash,
    byteLength: bundleBytes.byteLength,
    rowCount: projected.length,
  };
}

// ---------------------------------------------------------------------------
// LiteLLM retrieval
// ---------------------------------------------------------------------------

const LITELLM_FIELDS = [
  'litellm_provider', 'mode', 'input_cost_per_token', 'output_cost_per_token',
  'cache_read_input_token_cost', 'max_input_tokens', 'max_output_tokens', 'max_tokens',
  'input_modalities', 'output_modalities', 'supported_modalities',
] as const;

/** The exact bounded LiteLLM projection: allowlisted fields, sorted, no extras. */
function projectLiteLlm(payload: unknown): Record<string, Record<string, unknown>> {
  const document = requireRecord(payload, 'LiteLLM payload');
  const projected = Object.entries(document)
    .filter(([sourceModelId, row]) => sourceModelId !== 'sample_spec'
      && isRecord(row)
      && typeof row.litellm_provider === 'string'
      && row.litellm_provider.trim().length > 0)
    .sort(([left], [right]) => compareUtf8Binary(left, right))
    .map(([sourceModelId, row]) => {
      assertNoProhibitedData(sourceModelId, `LiteLLM source model ${sourceModelId}`);
      const record = row as Record<string, unknown>;
      const fields = Object.fromEntries(LITELLM_FIELDS.flatMap((name) => hasOwn(record, name)
        ? [[name, record[name]]]
        : []));
      assertNoProhibitedData(fields, `LiteLLM source model ${sourceModelId}`);
      return [sourceModelId, fields] as const;
    });
  if (projected.length === 0) throw new Error('LiteLLM payload has no concrete model entries');
  return Object.fromEntries(projected);
}

/**
 * Retrieves the LiteLLM price document with at most one upstream request and
 * stores only the exact bounded projection. A 304 is honored only after the
 * referenced object is re-hashed and re-proven to be that same projection.
 */
export async function retrieveLiteLlmStep(input: SourceStepInput): Promise<CandidateArtifact> {
  const { cycleId, store, fetchImpl, observedAt, previous } = input;
  const response = await fetchImpl(LITELLM_URL, { headers: requestHeaders(previous) });
  assertUpstreamStatus(response, 'litellm', LITELLM_ARTIFACT_ID, observedAt);

  if (response.status === 304) {
    if (!previous) {
      throw new SourceStepFailure('litellm', LITELLM_ARTIFACT_ID, 'LiteLLM returned 304 without an immutable candidate');
    }
    const bytes = await readExactCandidateBytes(store, previous, 'LiteLLM');
    const projection = projectLiteLlm(decodeJson(bytes, 'LiteLLM stored projection'));
    if (!byteArraysEqual(bytes, jsonBytes(projection))) {
      throw new SourceStepFailure('litellm', LITELLM_ARTIFACT_ID, 'LiteLLM immutable candidate is not the exact safe projection');
    }
    const key = `${candidatePrefix(cycleId)}litellm/${LITELLM_ARTIFACT_ID}/${digestHex(previous.contentHash)}.json`;
    await putCandidateObject(
      store,
      cycleId,
      key,
      bytes,
      previous.contentHash,
      previous.originalContentHash,
    );
    return { ...previous, key };
  }

  const raw = await readBoundedBytes(response, MAX_LITELLM_BYTES, 'LiteLLM');
  const projection = projectLiteLlm(decodeJson(raw, 'LiteLLM response'));
  const bytes = jsonBytes(projection);
  const contentHash = await sha256Digest(bytes);
  const originalContentHash = await sha256Digest(raw);
  const key = `${candidatePrefix(cycleId)}litellm/${LITELLM_ARTIFACT_ID}/${digestHex(contentHash)}.json`;
  await putCandidateObject(store, cycleId, key, bytes, contentHash, originalContentHash);
  return {
    artifactId: LITELLM_ARTIFACT_ID,
    key,
    contentHash,
    originalContentHash,
    byteLength: bytes.byteLength,
    sourceUrl: LITELLM_URL,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    upstreamRevision: null,
    schemaVersion: null,
  };
}

// ---------------------------------------------------------------------------
// LMArena retrieval
// ---------------------------------------------------------------------------

/**
 * Resolves the one Hugging Face dataset revision every LMArena subset in this
 * cycle is pinned to, using a single upstream request.
 */
export async function retrieveLmArenaRevisionStep(input: SourceStepInput): Promise<string> {
  const { fetchImpl, observedAt } = input;
  const artifactId = 'dataset-revision';
  const response = await fetchImpl(LMARENA_HUB_INFO_URL, { headers: requestHeaders() });
  assertUpstreamStatus(response, 'lmarena', artifactId, observedAt);
  const bytes = await readBoundedBytes(response, MAX_LMARENA_HUB_INFO_BYTES, 'LMArena Hub dataset info');
  const document = requireRecord(decodeJson(bytes, 'LMArena Hub dataset info'), 'LMArena Hub dataset info');
  if (typeof document.sha !== 'string' || !/^[a-f0-9]{40}$/.test(document.sha)) {
    throw new SourceStepFailure('lmarena', artifactId, 'LMArena Hub dataset info requires a 40-character lowercase sha');
  }
  return document.sha;
}

function lmArenaAllowedFields(subset: LmArenaSubset): readonly string[] {
  return subset === 'agent'
    ? ['model_name', 'organization', 'license', 'score', 'score_ci_lower', 'score_ci_upper', 'observation_count', 'session_count', 'rank', 'category', 'leaderboard_publish_date']
    : ['model_name', 'organization', 'license', 'rating', 'rating_lower', 'rating_upper', 'variance', 'vote_count', 'rank', 'category', 'leaderboard_publish_date'];
}

interface ProjectedLmArenaPage {
  rows: unknown[];
  num_rows_total: number;
}

/** Exact bounded page projection with cursor, page-size, and total validation. */
function projectLmArenaPage(payload: unknown, subset: LmArenaSubset, offset: number): ProjectedLmArenaPage {
  const document = requireRecord(payload, `LMArena ${subset} response`);
  if (!Array.isArray(document.rows)) throw new Error(`LMArena ${subset} response must contain rows`);
  if (document.rows.length > LMARENA_PAGE_LENGTH) {
    throw new Error(`LMArena ${subset} response exceeds the ${LMARENA_PAGE_LENGTH}-row page size`);
  }
  const totalRows = document.num_rows_total;
  if (typeof totalRows !== 'number' || !Number.isSafeInteger(totalRows) || totalRows < 0) {
    throw new Error(`LMArena ${subset} response requires a non-negative safe integer num_rows_total`);
  }
  if (offset > totalRows) throw new Error(`LMArena ${subset} page offset exceeds declared num_rows_total`);
  const rowIndexes = new Set<number>();
  const rows = document.rows.map((value, index) => {
    const envelope = requireRecord(value, `LMArena ${subset} row ${index}`);
    if (!Number.isSafeInteger(envelope.row_idx)) {
      throw new Error(`LMArena ${subset} row ${index}.row_idx must be an integer`);
    }
    const rowIndex = envelope.row_idx as number;
    if (rowIndex < offset || rowIndex >= offset + LMARENA_PAGE_LENGTH) {
      throw new Error(`LMArena ${subset} row ${index}.row_idx is outside its exact page identity`);
    }
    if (rowIndexes.has(rowIndex)) throw new Error(`LMArena ${subset} has duplicate row_idx ${rowIndex}`);
    rowIndexes.add(rowIndex);
    if (!Array.isArray(envelope.truncated_cells) || envelope.truncated_cells.length !== 0) {
      throw new Error(`LMArena ${subset} row ${index} has truncated cells`);
    }
    const row = requireRecord(envelope.row, `LMArena ${subset} row ${index}.row`);
    const projectedRow = Object.fromEntries(lmArenaAllowedFields(subset)
      .flatMap((name) => hasOwn(row, name) ? [[name, row[name]]] : []));
    assertNoProhibitedData(projectedRow, `LMArena ${subset} row ${index}`);
    return { row_idx: rowIndex, row: projectedRow, truncated_cells: [] };
  }).sort((left, right) => left.row_idx - right.row_idx);
  const expectedRows = Math.min(LMARENA_PAGE_LENGTH, totalRows - offset);
  if (rows.length !== expectedRows) {
    throw new Error(`LMArena ${subset} page is missing rows required by num_rows_total`);
  }
  return { rows, num_rows_total: totalRows };
}

function assertLmArenaCursor(subset: LmArenaSubset, offset: number, declaredTotal: number | null): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % LMARENA_PAGE_LENGTH !== 0) {
    throw new Error(`LMArena ${subset} page offset must be a non-negative multiple of ${LMARENA_PAGE_LENGTH}`);
  }
  if (offset / LMARENA_PAGE_LENGTH >= MAX_LMARENA_PAGES_PER_SUBSET) {
    throw new Error(`LMArena ${subset} pagination exceeded the bounded page limit`);
  }
  if (declaredTotal !== null && declaredTotal !== undefined && offset >= declaredTotal) {
    throw new Error(`LMArena ${subset} page cursor ${offset} is beyond the declared num_rows_total ${declaredTotal}`);
  }
}

function requireFrozenRevision(subset: LmArenaSubset, upstreamRevision: unknown): string {
  if (typeof upstreamRevision !== 'string' || upstreamRevision.trim().length === 0) {
    throw new Error(`LMArena ${subset} requires the frozen cycle upstream revision`);
  }
  return upstreamRevision;
}

function lmArenaPageKey(
  cycleId: string,
  subset: LmArenaSubset,
  offset: number,
  contentHash: string,
): string {
  return `${candidatePrefix(cycleId)}lmarena/${subset}/offset-${offset}/${digestHex(contentHash)}.json`;
}

function lmArenaHubParquetPageKey(
  cycleId: string,
  subset: LmArenaSubset,
  offset: number,
  contentHash: string,
): string {
  return `${candidatePrefix(cycleId)}lmarena/${subset}/hub-parquet/offset-${offset}/${digestHex(contentHash)}.json`;
}

function isHubRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function trustedHubDownloadHost(hostname: string): boolean {
  return hostname.endsWith('.hf.co') || hostname === 'cdn-lfs.huggingface.co';
}

function linkedSha256(value: string | null): string | null {
  const match = value?.match(/^"([a-f0-9]{64})"$/);
  return match ? `sha256:${match[1]}` : null;
}

function safeParquetInteger(value: unknown, label: string): number {
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new Error(`${label} exceeds JavaScript's safe integer range`);
    }
    return Number(value);
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`${label} must be an integer`);
  return value;
}

function requireParquetNumber(value: unknown, label: string, nullable = false): number | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'number') throw new Error(`${label} must be a number${nullable ? ' or null' : ''}`);
  return value;
}

function projectLmArenaHubParquetRow(value: unknown, subset: LmArenaSubset, index: number): Record<string, unknown> {
  const row = requireRecord(value, `LMArena Hub Parquet ${subset} row ${index}`);
  const fields = lmArenaAllowedFields(subset);
  if (Object.keys(row).length !== fields.length || fields.some((name) => !hasOwn(row, name))) {
    throw new Error(`LMArena Hub Parquet ${subset} row ${index} does not have the expected column schema`);
  }
  const projected = Object.fromEntries(fields.map((name) => [name, row[name]])) as Record<string, unknown>;
  for (const name of ['model_name', 'organization', 'license', 'category', 'leaderboard_publish_date']) {
    if (typeof projected[name] !== 'string') {
      throw new Error(`LMArena Hub Parquet ${subset} row ${index}.${name} must be a string`);
    }
  }
  projected.rank = safeParquetInteger(projected.rank, `LMArena Hub Parquet ${subset} row ${index}.rank`);
  if (subset === 'agent') {
    projected.score = requireParquetNumber(projected.score, `LMArena Hub Parquet ${subset} row ${index}.score`);
    for (const name of ['observation_count', 'session_count']) {
      projected[name] = safeParquetInteger(projected[name], `LMArena Hub Parquet ${subset} row ${index}.${name}`);
    }
    for (const name of ['score_ci_lower', 'score_ci_upper']) {
      projected[name] = requireParquetNumber(projected[name], `LMArena Hub Parquet ${subset} row ${index}.${name}`, true);
    }
  } else {
    for (const name of ['rating', 'variance']) {
      projected[name] = requireParquetNumber(projected[name], `LMArena Hub Parquet ${subset} row ${index}.${name}`);
    }
    for (const name of ['rating_lower', 'rating_upper']) {
      projected[name] = requireParquetNumber(projected[name], `LMArena Hub Parquet ${subset} row ${index}.${name}`, true);
    }
    projected.vote_count = safeParquetInteger(projected.vote_count, `LMArena Hub Parquet ${subset} row ${index}.vote_count`);
  }
  assertNoProhibitedData(projected, `LMArena Hub Parquet ${subset} row ${index}`);
  return projected;
}

function projectLmArenaHubParquetPages(rows: unknown[], subset: LmArenaSubset): ProjectedLmArenaPage[] {
  const overallRows = rows
    .map((row, index) => projectLmArenaHubParquetRow(row, subset, index))
    .filter((row) => row.category === LMARENA_CATEGORY)
    .sort((left, right) => {
      const rankDifference = (left.rank as number) - (right.rank as number);
      if (rankDifference !== 0) return rankDifference;
      const modelDifference = compareUtf8Binary(String(left.model_name), String(right.model_name));
      return modelDifference !== 0 ? modelDifference : compareUtf8Binary(JSON.stringify(left), JSON.stringify(right));
    });
  if (overallRows.length === 0) throw new Error(`LMArena Hub Parquet ${subset} has no overall rows`);
  const totalRows = overallRows.length;
  if (Math.ceil(totalRows / LMARENA_PAGE_LENGTH) > MAX_LMARENA_PAGES_PER_SUBSET) {
    throw new Error(`LMArena ${subset} pagination exceeded the bounded page limit`);
  }
  const pages: ProjectedLmArenaPage[] = [];
  for (let offset = 0; offset < totalRows; offset += LMARENA_PAGE_LENGTH) {
    pages.push({
      rows: overallRows.slice(offset, offset + LMARENA_PAGE_LENGTH)
        .map((row, index) => ({ row_idx: offset + index, row, truncated_cells: [] })),
      num_rows_total: totalRows,
    });
  }
  return pages;
}

async function retrieveLmArenaDatasetViewerPage(input: LmArenaPageStepInput): Promise<LmArenaPageStepOutput> {
  const { cycleId, store, fetchImpl, observedAt, subset, offset, previous } = input;
  const declaredTotal = input.declaredTotal ?? null;
  const revision = requireFrozenRevision(subset, input.upstreamRevision);
  assertLmArenaCursor(subset, offset, declaredTotal);
  const artifactId = lmArenaPageArtifactId(subset, LMARENA_SPLIT, LMARENA_CATEGORY, offset, LMARENA_PAGE_LENGTH);
  const sourceUrl = lmArenaPageSourceUrl(subset, LMARENA_SPLIT, LMARENA_CATEGORY, offset, LMARENA_PAGE_LENGTH);

  const response = await fetchImpl(sourceUrl, { headers: requestHeaders(previous) });
  assertUpstreamStatus(response, 'lmarena', artifactId, observedAt);

  let artifact: CandidateArtifact;
  let projection: ProjectedLmArenaPage;
  if (response.status === 304) {
    if (!previous) {
      throw new SourceStepFailure('lmarena', artifactId, `LMArena ${artifactId} returned 304 without an immutable candidate`);
    }
    if (previous.upstreamRevision !== revision) {
      throw new SourceStepFailure('lmarena', artifactId, `LMArena ${artifactId} candidate x-revision is not the frozen cycle revision`);
    }
    const bytes = await readExactCandidateBytes(store, previous, `LMArena ${artifactId}`);
    projection = projectLmArenaPage(decodeJson(bytes, `LMArena ${artifactId}`), subset, offset);
    if (!byteArraysEqual(bytes, jsonBytes(projection))) {
      throw new SourceStepFailure('lmarena', artifactId, `LMArena ${artifactId} immutable candidate is not the exact safe projection`);
    }
    artifact = { ...previous };
  } else {
    const observedRevision = response.headers.get('x-revision');
    if (observedRevision !== revision) {
      throw new SourceStepFailure('lmarena', artifactId, `LMArena ${artifactId} x-revision is not the frozen cycle revision`);
    }
    const raw = await readBoundedBytes(response, MAX_LMARENA_PAGE_BYTES, `LMArena ${artifactId}`);
    projection = projectLmArenaPage(decodeJson(raw, `LMArena ${artifactId}`), subset, offset);
    const bytes = jsonBytes(projection);
    const contentHash = await sha256Digest(bytes);
    const originalContentHash = await sha256Digest(raw);
    const key = lmArenaPageKey(cycleId, subset, offset, contentHash);
    await putCandidateObject(store, cycleId, key, bytes, contentHash, originalContentHash);
    artifact = {
      artifactId,
      key,
      contentHash,
      originalContentHash,
      byteLength: bytes.byteLength,
      sourceUrl,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      upstreamRevision: revision,
      schemaVersion: null,
    };
  }

  if (declaredTotal !== null && declaredTotal !== projection.num_rows_total) {
    throw new SourceStepFailure('lmarena', artifactId, `LMArena ${subset} pages disagree on num_rows_total`);
  }
  const rowCount = projection.rows.length;
  return {
    kind: 'page',
    subset,
    offset,
    artifact,
    rowCount,
    declaredTotal: projection.num_rows_total,
    complete: offset + rowCount >= projection.num_rows_total,
  };
}

async function resolveLmArenaHubParquet(input: LmArenaPageStepInput): Promise<LmArenaPageStepOutput> {
  const { fetchImpl, observedAt, subset } = input;
  const revision = requireFrozenRevision(subset, input.upstreamRevision);
  const artifactId = `${subset}:${LMARENA_SPLIT}:${LMARENA_CATEGORY}:hub-parquet`;
  const sourceUrl = lmArenaHubParquetSourceUrl(subset, revision);
  const resolver = await fetchImpl(sourceUrl, {
    headers: new Headers({ 'user-agent': USER_AGENT, accept: 'application/octet-stream' }),
    redirect: 'manual',
  });
  if (!isHubRedirect(resolver.status)) {
    assertUpstreamStatus(resolver, 'lmarena', artifactId, observedAt);
    throw new SourceStepFailure('lmarena', artifactId, `lmarena/${artifactId} resolver returned ${resolver.status}`);
  }
  if (resolver.headers.get('x-repo-commit') !== revision) {
    throw new SourceStepFailure('lmarena', artifactId, `lmarena/${artifactId} resolver x-repo-commit does not match the frozen dataset revision`);
  }
  const originalContentHash = linkedSha256(resolver.headers.get('x-linked-etag'));
  if (!originalContentHash) {
    throw new SourceStepFailure('lmarena', artifactId, `lmarena/${artifactId} resolver requires a quoted SHA-256 x-linked-etag`);
  }
  const location = resolver.headers.get('location');
  if (!location) {
    throw new SourceStepFailure('lmarena', artifactId, `lmarena/${artifactId} resolver did not provide a download location`);
  }
  let downloadUrl: URL;
  try {
    downloadUrl = new URL(location, sourceUrl);
  } catch {
    throw new SourceStepFailure('lmarena', artifactId, `lmarena/${artifactId} resolver returned an invalid download location`);
  }
  if (downloadUrl.protocol !== 'https:' || !trustedHubDownloadHost(downloadUrl.hostname)) {
    throw new SourceStepFailure('lmarena', artifactId, `lmarena/${artifactId} resolver returned an untrusted download location`);
  }
  return {
    kind: 'resolved',
    download: {
      subset,
      upstreamRevision: revision,
      downloadUrl: downloadUrl.toString(),
      originalContentHash,
      etag: resolver.headers.get('x-linked-etag'),
    },
  };
}

async function downloadLmArenaHubParquet(input: LmArenaPageStepInput): Promise<LmArenaPageStepOutput> {
  const { cycleId, store, fetchImpl, observedAt, subset, download, readParquetRows } = input;
  const revision = requireFrozenRevision(subset, input.upstreamRevision);
  const artifactId = `${subset}:${LMARENA_SPLIT}:${LMARENA_CATEGORY}:hub-parquet`;
  if (!download) {
    throw new SourceStepFailure('lmarena', artifactId, `lmarena/${artifactId} download requires a resolved pinned location`);
  }
  if (download.subset !== subset || download.upstreamRevision !== revision) {
    throw new SourceStepFailure('lmarena', artifactId, `lmarena/${artifactId} resolved location belongs to another subset or revision`);
  }
  if (!readParquetRows) {
    throw new SourceStepFailure('lmarena', artifactId, `lmarena/${artifactId} download requires a parquet reader`);
  }
  const response = await fetchImpl(download.downloadUrl, {
    headers: new Headers({ 'user-agent': USER_AGENT, accept: 'application/octet-stream' }),
    redirect: 'manual',
  });
  assertUpstreamStatus(response, 'lmarena', artifactId, observedAt);
  const bytes = await readBoundedBytes(response, MAX_LMARENA_HUB_PARQUET_BYTES, `LMArena Hub Parquet ${subset}`);
  const originalContentHash = await sha256Digest(bytes);
  if (originalContentHash !== download.originalContentHash) {
    throw new SourceStepFailure('lmarena', artifactId, `lmarena/${artifactId} download SHA-256 does not match the pinned resolver digest`);
  }
  const decoded = await readParquetRows(bytes.slice().buffer as ArrayBuffer);
  const projections = projectLmArenaHubParquetPages(decoded, subset);
  const sourceUrl = lmArenaHubParquetSourceUrl(subset, revision);
  const artifacts: CandidateArtifact[] = [];
  for (const [pageNumber, projection] of projections.entries()) {
    const offset = pageNumber * LMARENA_PAGE_LENGTH;
    const pageBytes = jsonBytes(projection);
    const contentHash = await sha256Digest(pageBytes);
    const key = lmArenaHubParquetPageKey(cycleId, subset, offset, contentHash);
    await putCandidateObject(store, cycleId, key, pageBytes, contentHash, originalContentHash);
    artifacts.push({
      artifactId: lmArenaHubParquetPageArtifactId(subset, LMARENA_SPLIT, LMARENA_CATEGORY, offset, LMARENA_PAGE_LENGTH),
      key,
      contentHash,
      originalContentHash,
      byteLength: pageBytes.byteLength,
      sourceUrl,
      etag: download.etag,
      lastModified: response.headers.get('last-modified'),
      upstreamRevision: revision,
      schemaVersion: LMARENA_HUB_PARQUET_SCHEMA_VERSION,
    });
  }
  return {
    kind: 'pages',
    subset,
    artifacts,
    declaredTotal: projections[0]?.num_rows_total ?? 0,
  };
}

/**
 * Retrieves LMArena evidence with at most one upstream request per call.
 *
 * The Dataset Viewer transport fetches exactly one 100-row page and validates
 * the cursor, declared total, and frozen `x-revision`. The pinned Hub Parquet
 * fallback needs a resolver request and a download request, so it is modeled as
 * two distinct resumable transports rather than one two-request step.
 */
export async function retrieveLmArenaPageStep(input: LmArenaPageStepInput): Promise<LmArenaPageStepOutput> {
  const transport = input.transport ?? 'dataset-viewer';
  if (transport === 'hub-parquet-resolve') return resolveLmArenaHubParquet(input);
  if (transport === 'hub-parquet-download') return downloadLmArenaHubParquet(input);
  if (transport !== 'dataset-viewer') throw new Error('LMArena page transport is invalid');
  return retrieveLmArenaDatasetViewerPage(input);
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizedPartitionKey(cycleId: string, index: number, contentHash: string): string {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error('normalized partition index must be a non-negative safe integer');
  }
  return `${candidatePrefix(cycleId)}normalized/${index}/${digestHex(contentHash)}.json`;
}

function parseCandidateArtifactRecord(value: unknown, label: string): CandidateArtifact {
  const record = requireRecord(value, label);
  const text = (name: keyof CandidateArtifact): string => {
    const field = record[name];
    if (typeof field !== 'string' || field.length === 0) throw new Error(`${label}.${String(name)} must be a non-empty string`);
    return field;
  };
  const nullableText = (name: keyof CandidateArtifact): string | null => {
    const field = record[name];
    if (field === null || field === undefined) return null;
    if (typeof field !== 'string') throw new Error(`${label}.${String(name)} must be a string or null`);
    return field;
  };
  const byteLength = record.byteLength;
  if (!Number.isSafeInteger(byteLength) || (byteLength as number) < 0) {
    throw new Error(`${label}.byteLength must be a non-negative safe integer`);
  }
  return {
    artifactId: text('artifactId'),
    key: text('key'),
    contentHash: text('contentHash'),
    originalContentHash: text('originalContentHash'),
    byteLength: byteLength as number,
    sourceUrl: text('sourceUrl'),
    etag: nullableText('etag'),
    lastModified: nullableText('lastModified'),
    upstreamRevision: nullableText('upstreamRevision'),
    schemaVersion: nullableText('schemaVersion'),
  };
}

async function normalizeBenchLmBundle(
  store: CandidateObjectStore,
  bundle: CandidatePartition,
  observedAt: string,
): Promise<NormalizedSourceBatch> {
  if (bundle.kind !== 'benchlm-bundle') throw new Error('BenchLM normalization requires a benchlm-bundle partition');
  const bytes = await readExactPartitionBytes(store, bundle, 'BenchLM bundle');
  const document = requireRecord(decodeJson(bytes, 'BenchLM bundle'), 'BenchLM bundle');
  if (document.schemaVersion !== BENCHLM_BUNDLE_SCHEMA_VERSION) {
    throw new Error(`BenchLM bundle schemaVersion must be ${BENCHLM_BUNDLE_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(document.artifacts)) throw new Error('BenchLM bundle artifacts must be an array');
  const byArtifactId = new Map<string, CandidateArtifact>();
  for (const [index, value] of document.artifacts.entries()) {
    const artifact = parseCandidateArtifactRecord(value, `BenchLM bundle artifact ${index}`);
    if (byArtifactId.has(artifact.artifactId)) {
      throw new Error(`BenchLM bundle has duplicate artifact ${artifact.artifactId}`);
    }
    byArtifactId.set(artifact.artifactId, artifact);
  }

  const storedEntries: [BenchLmArtifact, unknown][] = [];
  for (const artifact of BENCHLM_ARTIFACTS) {
    const candidate = byArtifactId.get(artifact);
    if (!candidate) throw new Error(`BenchLM bundle is missing artifact ${artifact}`);
    if (candidate.schemaVersion !== BENCHLM_PROJECTION_SCHEMA_VERSION) {
      throw new Error(`BenchLM bundle artifact ${artifact} is not a canonical projection`);
    }
    const projectedBytes = await readExactCandidateBytes(store, candidate, `BenchLM ${artifact}`);
    storedEntries.push([artifact, {
      projectedBytes,
      projectedSha256: digestHex(candidate.contentHash),
      originalSha256: digestHex(candidate.originalContentHash),
      headers: { etag: candidate.etag, lastModified: candidate.lastModified },
    }]);
  }

  const prepared = await rehydrateBenchLmProjections(
    Object.fromEntries(storedEntries) as StoredBenchLmProjections,
  );
  const parsed = await parseBenchLm(prepared, observedAt);
  return validateNormalizedSourceBatch({
    ...parsed,
    sources: parsed.sources.map((source) => {
      const candidate = byArtifactId.get(source.artifactId);
      if (!candidate) throw new Error(`BenchLM ${source.artifactId} has no immutable candidate key`);
      return {
        ...source,
        snapshotKey: candidate.key,
        contentHash: candidate.contentHash,
        originalContentHash: candidate.originalContentHash,
      };
    }),
  });
}

async function normalizeLiteLlmArtifact(
  store: CandidateObjectStore,
  artifact: CandidateArtifact,
  observedAt: string,
): Promise<NormalizedSourceBatch> {
  const bytes = await readExactCandidateBytes(store, artifact, 'LiteLLM');
  const projection = projectLiteLlm(decodeJson(bytes, 'LiteLLM candidate'));
  if (!byteArraysEqual(bytes, jsonBytes(projection))) {
    throw new Error('LiteLLM candidate is not the exact safe projection');
  }
  return parseLiteLlmPrices(projection, observedAt, {
    etag: artifact.etag,
    lastModified: artifact.lastModified,
    upstreamRevision: artifact.upstreamRevision,
    schemaVersion: artifact.schemaVersion,
    snapshotKey: artifact.key,
    contentHash: artifact.contentHash,
    originalContentHash: artifact.originalContentHash,
  });
}

async function normalizeLmArenaPage(
  store: CandidateObjectStore,
  artifact: CandidateArtifact,
  subset: LmArenaSubset,
  offset: number,
  observedAt: string,
): Promise<NormalizedSourceBatch> {
  const bytes = await readExactCandidateBytes(store, artifact, `LMArena ${artifact.artifactId}`);
  const projection = projectLmArenaPage(decodeJson(bytes, `LMArena ${artifact.artifactId}`), subset, offset);
  if (!byteArraysEqual(bytes, jsonBytes(projection))) {
    throw new Error(`LMArena ${artifact.artifactId} candidate is not the exact safe projection`);
  }
  const provenance: LmArenaPageArtifact = {
    artifactId: artifact.artifactId,
    sourceUrl: artifact.sourceUrl,
    transport: artifact.schemaVersion === LMARENA_HUB_PARQUET_SCHEMA_VERSION ? 'hub-parquet' : 'dataset-viewer',
    subset,
    split: LMARENA_SPLIT,
    category: LMARENA_CATEGORY,
    offset,
    length: LMARENA_PAGE_LENGTH,
    etag: artifact.etag,
    lastModified: artifact.lastModified,
    upstreamRevision: artifact.upstreamRevision,
    schemaVersion: artifact.schemaVersion,
    snapshotKey: artifact.key,
    contentHash: artifact.contentHash,
    originalContentHash: artifact.originalContentHash,
  };
  return parseLmArenaSubset(subset, projection.rows, observedAt, provenance);
}

/**
 * Normalizes one exact retrieved candidate into a single canonical, bounded
 * normalized partition. It reads only attempt-owned candidate bytes, writes
 * only inside the attempt-owned prefix, and never touches an active row.
 */
export async function normalizeSourceStep(input: NormalizeSourceStepInput): Promise<CandidatePartition> {
  const { cycleId, store, observedAt, index } = input;
  let batch: NormalizedSourceBatch;
  if (input.source === 'benchlm') {
    batch = await normalizeBenchLmBundle(store, input.bundle, observedAt);
  } else if (input.source === 'litellm') {
    batch = await normalizeLiteLlmArtifact(store, input.artifact, observedAt);
  } else if (input.source === 'lmarena') {
    batch = await normalizeLmArenaPage(store, input.artifact, input.subset, input.offset, observedAt);
  } else {
    throw new Error('normalizeSourceStep requires a supported source');
  }

  const bytes = jsonBytes({
    schemaVersion: NORMALIZED_PARTITION_SCHEMA_VERSION,
    cycleId,
    index,
    source: input.source,
    batch,
  });
  if (bytes.byteLength > MAX_NORMALIZED_PARTITION_BYTES) {
    throw new Error(`normalized partition exceeds ${MAX_NORMALIZED_PARTITION_BYTES} byte limit`);
  }
  const contentHash = await sha256Digest(bytes);
  const key = normalizedPartitionKey(cycleId, index, contentHash);
  await putCandidateObject(store, cycleId, key, bytes, contentHash, contentHash);
  return {
    partitionId: `${input.source}:${index}`,
    kind: 'normalized',
    index,
    key,
    contentHash,
    byteLength: bytes.byteLength,
    rowCount: batch.sources.length
      + batch.models.length
      + batch.metrics.length
      + batch.priceChecks.length
      + batch.comparisonSeeds.length,
  };
}
