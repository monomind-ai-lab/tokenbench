import {
  type BenchmarkComparisonPair,
  type BenchmarkMetric,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type BenchmarkSourceRecord,
  type ComparisonSeed,
  type NormalizedSourceBatch,
  BENCHMARK_DERIVATION_SCHEMA_VERSION,
  compareUtf8Binary,
  createComparisonPairSlugResolver,
  isComparisonPairRouteSafe,
  validateBenchmarkComparisonPair,
  validateIndexableComparisonPairRoute,
  validateNormalizedSourceBatch,
} from '../../../src/benchmarks/contracts';
import { COMPARISON_ALLOWLIST } from '../../../src/benchmarks/comparison-allowlist';
import { resolveCanonicalModelKey, sourceSpecificModelKey } from '../../../src/benchmarks/model-aliases';
import {
  parseBenchLm,
  prepareBenchLmMixed,
  type BenchLmPreparationInputs,
  type PreparedBenchLmPayloads,
} from './benchlm';
import {
  LMARENA_SUBSETS,
  lmArenaPageArtifactId,
  lmArenaPageSourceUrl,
  parseLmArenaSubset,
  type LmArenaSubset,
} from './lmarena';
import { parseLiteLlmPrices } from './litellm';
import { parseOpenRouterModels, projectOpenRouterModelsPayload } from '../../catalog-ingest/src/index';

type BoundStatement = {
  bind(...values: unknown[]): BoundStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
};

interface D1Database {
  prepare(sql: string): BoundStatement;
  batch(statements: BoundStatement[]): Promise<unknown>;
}

interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
  customMetadata?: Record<string, string>;
}

interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBufferView,
    options?: { httpMetadata?: { contentType: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>;
}

export interface BenchmarkIngestEnv {
  CATALOG_DB: D1Database;
  SOURCE_SNAPSHOTS: R2Bucket;
}

export interface RefreshDependencies {
  fetchImpl: typeof fetch;
  now: () => string;
  createAbortController: () => AbortController;
  setTimeoutImpl: (handler: () => void, timeout: number) => ReturnType<typeof setTimeout>;
  clearTimeoutImpl: (timeout: ReturnType<typeof setTimeout>) => void;
  sleep: (timeout: number) => Promise<void>;
  random: () => number;
}

export interface RefreshResult {
  status: 'published' | 'unchanged' | 'failed';
  revision: string | null;
  checkedAt: string;
  error: string | null;
}

interface ActiveCatalogSource {
  revision: string;
  sourceUrl: string;
  observedAt: string;
  snapshotKey: string;
  contentHash: string;
}

interface ActiveBenchmarkRevision {
  revision: string;
  generatedAt: string;
  publishedAt: string | null;
  checkedAt: string;
  contentHash: string;
  catalogRevision: string;
  openrouterContentHash: string;
}

interface StoredSourceRecord extends BenchmarkSourceRecord {}

interface EvidenceWrite {
  sourceId: BenchmarkSourceRecord['sourceId'];
  artifactId: string;
  snapshotKey: string;
  bytes: Uint8Array;
  contentHash: string;
  originalContentHash: string;
}

interface PreparedSource {
  batch: NormalizedSourceBatch;
  evidence: EvidenceWrite[];
}

interface LmArenaPage {
  batch: NormalizedSourceBatch;
  evidence: EvidenceWrite[];
  rowCount: number;
  revision: string;
  totalRows: number | null;
}

const BENCHLM_ARTIFACTS = ['leaderboard', 'models', 'pricing', 'comparisons', 'benchmarks'] as const;
type BenchLmArtifact = typeof BENCHLM_ARTIFACTS[number];

const BENCHLM_URLS: Record<BenchLmArtifact, string> = {
  leaderboard: 'https://benchlm.ai/data/leaderboard.json',
  models: 'https://benchlm.ai/data/models.json',
  pricing: 'https://benchlm.ai/data/pricing.json',
  comparisons: 'https://benchlm.ai/data/comparisons.json',
  benchmarks: 'https://benchlm.ai/data/benchmarks.json',
};
const LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const OPENROUTER_SOURCE_ID = 'openrouter-models';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';
const USER_AGENT = 'TokenBench/1.0 (+https://tokenbench.monomind.one)';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 10_000;
const MAX_ERROR_LENGTH = 1_000;
const MAX_BENCHLM_BYTES = 8 * 1024 * 1024;
const MAX_LMARENA_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_LITELLM_BYTES = 32 * 1024 * 1024;
const MAX_LMARENA_PAGES_PER_SUBSET = 200;
// D1's Worker Paid limit is 1,000 queries per invocation, including the three
// pre-publication reads and a possible failure-state write. Keep the batch well
// below that ceiling so a failed publication can still record its error.
const MAX_D1_PUBLICATION_STATEMENTS = 900;
const MAX_D1_BOUND_PARAMETERS = 100;
const MAX_D1_SQL_BYTES = 100 * 1024;
const MAX_D1_JSON_PARAMETER_BYTES = 1_500_000;

class RefreshFailure extends Error {
  constructor(
    readonly sourceId: BenchmarkSourceRecord['sourceId'],
    readonly artifactId: string,
    message: string,
  ) {
    super(message);
    this.name = 'RefreshFailure';
  }
}

function defaultDependencies(): RefreshDependencies {
  return {
    fetchImpl: (input, init) => globalThis.fetch(input, init),
    now: () => new Date().toISOString(),
    createAbortController: () => new AbortController(),
    setTimeoutImpl: (handler, timeout) => globalThis.setTimeout(handler, timeout),
    clearTimeoutImpl: (timeout) => globalThis.clearTimeout(timeout),
    sleep: (timeout) => new Promise((resolve) => globalThis.setTimeout(resolve, timeout)),
    random: () => Math.random(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return requireString(value, label);
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a sha256 digest`);
  }
  return value;
}

function field(record: Record<string, unknown>, camel: string, snake = camel.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)): unknown {
  return Object.prototype.hasOwnProperty.call(record, camel) ? record[camel] : record[snake];
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

function byteArraysEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Digest(bytes: Uint8Array): Promise<string> {
  return `sha256:${await sha256Hex(bytes)}`;
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

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function parseRetryAfter(value: string | null, now: string): number | null {
  if (value === null) return null;
  if (/^\d+$/.test(value.trim())) return Math.min(Number(value.trim()) * 1_000, MAX_RETRY_DELAY_MS);
  const retryAt = Date.parse(value);
  const nowAt = Date.parse(now);
  if (!Number.isFinite(retryAt) || !Number.isFinite(nowAt)) return null;
  return Math.max(0, Math.min(retryAt - nowAt, MAX_RETRY_DELAY_MS));
}

function retryDelay(response: Response | null, attempt: number, dependencies: RefreshDependencies): number {
  const retryAfter = response ? parseRetryAfter(response.headers.get('retry-after'), dependencies.now()) : null;
  if (retryAfter !== null) return retryAfter;
  const jitter = Math.floor(Math.max(0, Math.min(1, dependencies.random())) * 250);
  return Math.min((attempt + 1) * 250 + jitter, MAX_RETRY_DELAY_MS);
}

function requestHeaders(conditional?: StoredSourceRecord): Headers {
  const headers = new Headers({ 'user-agent': USER_AGENT, accept: 'application/json' });
  if (conditional?.etag) headers.set('if-none-match', conditional.etag);
  if (conditional?.lastModified) headers.set('if-modified-since', conditional.lastModified);
  return headers;
}

function abortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  return reason instanceof Error
    ? reason
    : new Error(typeof reason === 'string' && reason.length > 0 ? reason : 'upstream request aborted');
}

async function awaitWithAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  onAbort?: () => void,
): Promise<T> {
  if (signal.aborted) {
    onAbort?.();
    throw abortError(signal);
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      callback();
    };
    const abort = () => {
      onAbort?.();
      settle(() => reject(abortError(signal)));
    };
    signal.addEventListener('abort', abort, { once: true });
    operation.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
  });
}

async function fetchWithRetry<T>(
  url: string,
  sourceId: BenchmarkSourceRecord['sourceId'],
  artifactId: string,
  conditional: StoredSourceRecord | undefined,
  dependencies: RefreshDependencies,
  consume: (response: Response, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const abort = dependencies.createAbortController();
    const timeout = dependencies.setTimeoutImpl(() => abort.abort('upstream timeout'), REQUEST_TIMEOUT_MS);
    let retryResponse: Response | null = null;
    try {
      const response = await dependencies.fetchImpl(url, { headers: requestHeaders(conditional), signal: abort.signal });
      if (response.ok || response.status === 304) return await consume(response, abort.signal);
      const transient = response.status === 429 || response.status === 408 || response.status >= 500;
      if (!transient || attempt === MAX_RETRIES) {
        throw new RefreshFailure(sourceId, artifactId, `${sourceId}/${artifactId} returned ${response.status}`);
      }
      retryResponse = response;
    } catch (error) {
      lastError = error;
      if (error instanceof RefreshFailure) throw error;
      if (attempt === MAX_RETRIES) {
        const message = abort.signal.aborted
          ? `${sourceId}/${artifactId} timed out after ${REQUEST_TIMEOUT_MS}ms`
          : `${sourceId}/${artifactId} request failed: ${error instanceof Error ? error.message : String(error)}`;
        throw new RefreshFailure(sourceId, artifactId, message);
      }
    } finally {
      dependencies.clearTimeoutImpl(timeout);
    }
    await dependencies.sleep(retryDelay(retryResponse, attempt, dependencies));
  }
  throw new RefreshFailure(sourceId, artifactId, `Unexpected exhausted retry state: ${String(lastError)}`);
}

async function readBoundedResponse(
  response: Response,
  limit: number,
  label: string,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > limit) {
    throw new Error(`${label} response exceeds ${limit} byte limit`);
  }
  if (!response.body) {
    const bytes = new Uint8Array(await awaitWithAbort(response.arrayBuffer(), signal));
    if (bytes.byteLength > limit) throw new Error(`${label} response exceeds ${limit} byte limit`);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let cancellation: Promise<void> | null = null;
  const cancelReader = () => {
    cancellation ??= reader.cancel(abortError(signal)).then(() => undefined, () => undefined);
  };
  try {
    while (true) {
      const { done, value } = await awaitWithAbort(reader.read(), signal, cancelReader);
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel('payload too large');
        throw new Error(`${label} response exceeds ${limit} byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    if (cancellation) await cancellation;
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

async function readStoredBytes(bucket: R2Bucket, source: StoredSourceRecord, label: string): Promise<{ bytes: Uint8Array; metadata: Record<string, string> }> {
  const object = await bucket.get(source.snapshotKey);
  if (!object) throw new Error(`${label} immutable snapshot is missing`);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await sha256Digest(bytes) !== source.contentHash) {
    throw new Error(`${label} immutable snapshot content hash does not match exact bytes`);
  }
  const metadata = object.customMetadata ?? {};
  if (metadata.original_content_hash !== source.originalContentHash) {
    throw new Error(`${label} immutable snapshot original content hash does not match source provenance`);
  }
  return { bytes, metadata };
}

function sourceKey(sourceId: string, artifactId: string): string {
  return `${sourceId}\u0000${artifactId}`;
}

function binaryCompare(left: string, right: string): number {
  return compareUtf8Binary(left, right);
}

function toStoredSourceRecord(value: Record<string, unknown>): StoredSourceRecord {
  const sourceId = requireString(field(value, 'sourceId'), 'stored source sourceId') as BenchmarkSourceRecord['sourceId'];
  const artifactId = requireString(field(value, 'artifactId'), 'stored source artifactId');
  return {
    sourceId,
    artifactId,
    sourceUrl: requireString(field(value, 'sourceUrl'), 'stored source sourceUrl'),
    observedAt: requireString(field(value, 'observedAt'), 'stored source observedAt'),
    etag: nullableString(field(value, 'etag'), 'stored source etag'),
    lastModified: nullableString(field(value, 'lastModified'), 'stored source lastModified'),
    upstreamRevision: nullableString(field(value, 'upstreamRevision'), 'stored source upstreamRevision'),
    schemaVersion: nullableString(field(value, 'schemaVersion'), 'stored source schemaVersion'),
    snapshotKey: requireString(field(value, 'snapshotKey'), 'stored source snapshotKey'),
    contentHash: requireSha256(field(value, 'contentHash'), 'stored source contentHash'),
    originalContentHash: requireSha256(field(value, 'originalContentHash'), 'stored source originalContentHash'),
    licenseId: 'MIT',
    attributionText: 'stored evidence',
  };
}

async function readActiveCatalogSource(db: D1Database): Promise<ActiveCatalogSource> {
  const row = await db.prepare(`
    SELECT catalog_revisions.revision AS revision, source_records.source_url AS sourceUrl,
      source_records.observed_at AS observedAt, source_records.snapshot_key AS snapshotKey,
      source_records.content_hash AS contentHash
    FROM catalog_publication_state
    JOIN catalog_revisions ON catalog_revisions.revision = catalog_publication_state.active_revision
    JOIN source_records ON source_records.revision = catalog_revisions.revision
    WHERE catalog_publication_state.singleton = 1
      AND catalog_revisions.publication_state = 'published'
      AND source_records.id = ?
  `).bind(OPENROUTER_SOURCE_ID).first<Record<string, unknown>>();
  if (!row) throw new RefreshFailure('openrouter', 'catalog', 'No active OpenRouter catalog snapshot exists');
  const record = requireRecord(row, 'active OpenRouter catalog source');
  const source = {
    revision: requireString(field(record, 'revision'), 'active catalog revision'),
    sourceUrl: requireString(field(record, 'sourceUrl'), 'active catalog source URL'),
    observedAt: requireString(field(record, 'observedAt'), 'active catalog observedAt'),
    snapshotKey: requireString(field(record, 'snapshotKey'), 'active catalog snapshotKey'),
    contentHash: requireSha256(field(record, 'contentHash'), 'active catalog contentHash'),
  };
  if (source.sourceUrl !== OPENROUTER_URL) {
    throw new RefreshFailure('openrouter', 'catalog', 'Active catalog OpenRouter source URL is not official');
  }
  return source;
}

async function readActiveBenchmarkRevision(db: D1Database): Promise<ActiveBenchmarkRevision | null> {
  const row = await db.prepare(`
    SELECT benchmark_revisions.revision AS revision, generated_at AS generatedAt, published_at AS publishedAt,
      checked_at AS checkedAt, content_hash AS contentHash, catalog_revision AS catalogRevision,
      openrouter_content_hash AS openrouterContentHash
    FROM benchmark_publication_state
    JOIN benchmark_revisions ON benchmark_revisions.revision = benchmark_publication_state.active_revision
    WHERE benchmark_publication_state.singleton = 1 AND benchmark_revisions.publication_state = 'published'
  `).first<Record<string, unknown>>();
  if (!row) return null;
  const record = requireRecord(row, 'active benchmark revision');
  return {
    revision: requireString(field(record, 'revision'), 'active benchmark revision'),
    generatedAt: requireString(field(record, 'generatedAt'), 'active benchmark generatedAt'),
    publishedAt: nullableString(field(record, 'publishedAt'), 'active benchmark publishedAt'),
    checkedAt: requireString(field(record, 'checkedAt'), 'active benchmark checkedAt'),
    contentHash: requireSha256(field(record, 'contentHash'), 'active benchmark contentHash'),
    catalogRevision: requireString(field(record, 'catalogRevision'), 'active benchmark catalogRevision'),
    openrouterContentHash: requireSha256(field(record, 'openrouterContentHash'), 'active benchmark openrouterContentHash'),
  };
}

async function readActiveSourceRecords(db: D1Database, revision: string | null): Promise<Map<string, StoredSourceRecord>> {
  if (revision === null) return new Map();
  const result = await db.prepare(`
    SELECT source_id AS sourceId, artifact_id AS artifactId, source_url AS sourceUrl, observed_at AS observedAt,
      etag AS etag, last_modified AS lastModified, upstream_revision AS upstreamRevision,
      schema_version AS schemaVersion, snapshot_key AS snapshotKey, content_hash AS contentHash,
      original_content_hash AS originalContentHash
    FROM benchmark_source_records WHERE revision = ?
  `).bind(revision).all<Record<string, unknown>>();
  const records = new Map<string, StoredSourceRecord>();
  for (const row of result.results) {
    const source = toStoredSourceRecord(requireRecord(row, 'stored source record'));
    const key = sourceKey(source.sourceId, source.artifactId);
    if (records.has(key)) throw new Error(`Duplicate stored source identity ${source.sourceId}/${source.artifactId}`);
    records.set(key, source);
  }
  return records;
}

function sourceSpecificSlug(sourceId: string, sourceModelId: string): string {
  return `source-${sourceId}-${encodeURIComponent(sourceModelId)}`;
}

function optionalStringArray(value: unknown, label: string): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings or null`);
  }
  assertNoProhibitedData(value, label);
  return [...value];
}

function openRouterBatch(
  projected: { data: Record<string, unknown>[] },
  catalog: ActiveCatalogSource,
  originalContentHash: string,
): NormalizedSourceBatch {
  const artifactId = `catalog:${catalog.revision}`;
  const source: BenchmarkSourceRecord = {
    sourceId: 'openrouter', artifactId, sourceUrl: catalog.sourceUrl, observedAt: catalog.observedAt,
    etag: null, lastModified: null, upstreamRevision: catalog.revision, schemaVersion: null,
    snapshotKey: catalog.snapshotKey, contentHash: catalog.contentHash, originalContentHash,
    licenseId: 'OpenRouter-ToS', attributionText: 'Catalog and pricing data from OpenRouter',
  };
  const parsed = parseOpenRouterModels(projected, catalog.observedAt);
  const metadataById = new Map(projected.data.map((model) => [String(model.id), model]));
  const models: BenchmarkModel[] = [];
  const priceChecks: BenchmarkPriceCheck[] = [];
  for (const offer of parsed.modelOffers) {
    const sourceModelId = offer.modelId;
    const reviewedKey = resolveCanonicalModelKey('openrouter', sourceModelId);
    const modelKey = reviewedKey ?? sourceSpecificModelKey('openrouter', sourceModelId);
    const metadata = metadataById.get(sourceModelId) ?? {};
    const architecture = metadata.architecture === undefined ? {} : requireRecord(metadata.architecture, `OpenRouter ${sourceModelId}.architecture`);
    const canonicalSlug = nullableString(metadata.canonical_slug, `OpenRouter ${sourceModelId}.canonical_slug`);
    if (canonicalSlug !== null) assertNoProhibitedData(canonicalSlug, `OpenRouter ${sourceModelId}.canonical_slug`);
    models.push({
      modelKey,
      slug: reviewedKey ? reviewedKey.slice(reviewedKey.lastIndexOf(':') + 1) : sourceSpecificSlug('openrouter', sourceModelId),
      name: offer.displayName,
      creator: offer.providerId,
      sourceType: 'Unknown', reasoningType: null, releaseDate: null,
      contextWindowTokens: offer.contextWindowTokens ?? null,
      evidenceStatus: 'source_only', rankingEligible: false,
      confidenceLower: null, confidenceUpper: null, benchmarkCount: 0,
      sourceId: 'openrouter', sourceModelId, sourceArtifactId: artifactId,
    });
    priceChecks.push({
      modelKey, sourceId: 'openrouter', providerId: offer.providerId,
      inputUsdPerMillion: offer.inputMicroDollarsPerMillion / 1_000_000,
      cachedInputUsdPerMillion: offer.cachedInputMicroDollarsPerMillion === undefined ? null : offer.cachedInputMicroDollarsPerMillion / 1_000_000,
      outputUsdPerMillion: offer.outputMicroDollarsPerMillion / 1_000_000,
      contextWindowTokens: offer.contextWindowTokens ?? null, verificationStatus: 'primary', routeId: offer.id,
      sourceModelId, canonicalSlug,
      maxInputTokens: offer.contextWindowTokens ?? null, maxOutputTokens: offer.maxOutputTokens ?? null,
      inputModalities: optionalStringArray(architecture.input_modalities, `OpenRouter ${sourceModelId}.architecture.input_modalities`),
      outputModalities: optionalStringArray(architecture.output_modalities, `OpenRouter ${sourceModelId}.architecture.output_modalities`),
      supportedParameters: optionalStringArray(metadata.supported_parameters, `OpenRouter ${sourceModelId}.supported_parameters`),
      sourceArtifactId: artifactId,
    });
  }
  return validateNormalizedSourceBatch({ sources: [source], models, metrics: [], priceChecks, comparisonSeeds: [] });
}

async function loadOpenRouterCatalog(bucket: R2Bucket, catalog: ActiveCatalogSource): Promise<NormalizedSourceBatch> {
  const object = await bucket.get(catalog.snapshotKey);
  if (!object) throw new RefreshFailure('openrouter', 'catalog', 'Active OpenRouter catalog snapshot is missing');
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await sha256Digest(bytes) !== catalog.contentHash) {
    throw new RefreshFailure('openrouter', 'catalog', 'Active OpenRouter catalog content hash does not match exact bytes');
  }
  const decoded = decodeJson(bytes, 'Active OpenRouter catalog snapshot');
  let projected: { data: Record<string, unknown>[] };
  try {
    projected = projectOpenRouterModelsPayload(decoded);
  } catch (error) {
    throw new RefreshFailure('openrouter', 'catalog', error instanceof Error ? error.message : String(error));
  }
  const canonicalBytes = jsonBytes(projected);
  if (!byteArraysEqual(bytes, canonicalBytes)) {
    throw new RefreshFailure('openrouter', 'catalog', 'Active OpenRouter catalog is a contaminated legacy snapshot, not the exact safe projection');
  }
  const originalContentHash = object.customMetadata?.original_content_hash;
  try {
    requireSha256(originalContentHash, 'Active OpenRouter original content hash');
  } catch (error) {
    throw new RefreshFailure('openrouter', 'catalog', error instanceof Error ? error.message : String(error));
  }
  return openRouterBatch(projected, catalog, originalContentHash as string);
}

function sourceFromPreparedBenchLm(
  prepared: PreparedBenchLmPayloads,
  freshArtifacts: ReadonlySet<BenchLmArtifact>,
  snapshotKeys: Readonly<Record<BenchLmArtifact, string>>,
): EvidenceWrite[] {
  return BENCHLM_ARTIFACTS.filter((artifact) => freshArtifacts.has(artifact)).map((artifact) => ({
    sourceId: 'benchlm', artifactId: artifact,
    snapshotKey: snapshotKeys[artifact],
    bytes: new Uint8Array(prepared[artifact].projectedBytes),
    contentHash: `sha256:${prepared[artifact].projectedSha256}`,
    originalContentHash: `sha256:${prepared[artifact].originalSha256}`,
  }));
}

function benchLmSnapshotKey(artifact: BenchLmArtifact, prepared: PreparedBenchLmPayloads): string {
  return `benchmarks/benchlm/${artifact}/projected/${prepared[artifact].projectedSha256}/original/${prepared[artifact].originalSha256}.json`;
}

async function prepareBenchLmSource(
  bucket: R2Bucket,
  previous: Map<string, StoredSourceRecord>,
  observedAt: string,
  dependencies: RefreshDependencies,
): Promise<PreparedSource> {
  const responses = await Promise.all(BENCHLM_ARTIFACTS.map(async (artifact) => {
    const existing = previous.get(sourceKey('benchlm', artifact));
    const fetched = await fetchWithRetry(
      BENCHLM_URLS[artifact],
      'benchlm',
      artifact,
      existing,
      dependencies,
      async (response, signal) => ({
        response,
        bytes: response.status === 304
          ? null
          : await readBoundedResponse(response, MAX_BENCHLM_BYTES, `BenchLM ${artifact}`, signal),
      }),
    );
    return [artifact, fetched, existing] as const;
  }));
  const statuses = responses.map(([, fetched]) => fetched.response.status);
  if (statuses.some((status) => status !== 200 && status !== 304)) {
    throw new RefreshFailure('benchlm', 'bundle', 'BenchLM returned an unsupported conditional response status');
  }
  let prepared: PreparedBenchLmPayloads;
  const freshArtifacts = new Set<BenchLmArtifact>();
  const artifactEntries = await Promise.all(responses.map(async ([artifact, fetched, existing]) => {
    if (fetched.response.status === 304) {
      if (!existing) throw new RefreshFailure('benchlm', artifact, 'BenchLM returned 304 without an immutable active snapshot');
      const { bytes } = await readStoredBytes(bucket, existing, `BenchLM ${artifact}`);
      return [artifact, {
        projectedBytes: bytes,
        projectedSha256: existing.contentHash.slice('sha256:'.length),
        originalSha256: existing.originalContentHash.slice('sha256:'.length),
        headers: { etag: existing.etag, lastModified: existing.lastModified },
      }] as const;
    }
    if (!fetched.bytes) throw new RefreshFailure('benchlm', artifact, 'BenchLM 200 response has no body bytes');
    freshArtifacts.add(artifact);
    return [artifact, {
      bytes: fetched.bytes,
      headers: { etag: fetched.response.headers.get('etag'), lastModified: fetched.response.headers.get('last-modified') },
    }] as const;
  }));
  try {
    prepared = await prepareBenchLmMixed(Object.fromEntries(artifactEntries) as BenchLmPreparationInputs);
  } catch (error) {
    throw new RefreshFailure('benchlm', 'bundle', error instanceof Error ? error.message : String(error));
  }
  const snapshotKeys = {} as Record<BenchLmArtifact, string>;
  for (const [artifact, fetched, existing] of responses) {
    if (fetched.response.status === 304) {
      if (!existing) throw new RefreshFailure('benchlm', artifact, 'BenchLM returned 304 without an immutable active snapshot');
      snapshotKeys[artifact] = existing.snapshotKey;
    } else {
      snapshotKeys[artifact] = benchLmSnapshotKey(artifact, prepared);
    }
  }
  try {
    const parsed = await parseBenchLm(prepared, observedAt);
    const batch = validateNormalizedSourceBatch({
      ...parsed,
      sources: parsed.sources.map((source) => {
        const snapshotKey = snapshotKeys[source.artifactId as BenchLmArtifact];
        if (!snapshotKey) throw new Error(`BenchLM ${source.artifactId} has no immutable snapshot key`);
        return { ...source, snapshotKey };
      }),
    });
    return { batch, evidence: sourceFromPreparedBenchLm(prepared, freshArtifacts, snapshotKeys) };
  } catch (error) {
    throw new RefreshFailure('benchlm', 'bundle', error instanceof Error ? error.message : String(error));
  }
}

const LITELLM_FIELDS = [
  'litellm_provider', 'mode', 'input_cost_per_token', 'output_cost_per_token',
  'cache_read_input_token_cost', 'max_input_tokens', 'max_output_tokens', 'max_tokens',
  'input_modalities', 'output_modalities', 'supported_modalities',
] as const;

function projectLiteLlm(payload: unknown): Record<string, Record<string, unknown>> {
  const document = requireRecord(payload, 'LiteLLM payload');
  const projected = Object.entries(document)
    .filter(([sourceModelId, row]) => sourceModelId !== 'sample_spec' && isRecord(row) && typeof row.litellm_provider === 'string' && row.litellm_provider.trim().length > 0)
    .sort(([left], [right]) => binaryCompare(left, right))
    .map(([sourceModelId, row]) => {
      assertNoProhibitedData(sourceModelId, `LiteLLM source model ${sourceModelId}`);
      const record = row as Record<string, unknown>;
      const fields = Object.fromEntries(LITELLM_FIELDS.flatMap((name) => Object.prototype.hasOwnProperty.call(record, name) ? [[name, record[name]]] : []));
      assertNoProhibitedData(fields, `LiteLLM source model ${sourceModelId}`);
      return [sourceModelId, fields] as const;
    });
  if (projected.length === 0) throw new Error('LiteLLM payload has no concrete model entries');
  return Object.fromEntries(projected);
}

function liteLlmSnapshotKey(contentHash: string, originalContentHash: string): string {
  return `benchmarks/litellm/model-prices/${contentHash.slice('sha256:'.length)}/original/${originalContentHash.slice('sha256:'.length)}.json`;
}

async function prepareLiteLlmSource(
  bucket: R2Bucket,
  previous: Map<string, StoredSourceRecord>,
  observedAt: string,
  dependencies: RefreshDependencies,
): Promise<PreparedSource> {
  const existing = previous.get(sourceKey('litellm', 'model-prices'));
  const fetched = await fetchWithRetry(
    LITELLM_URL,
    'litellm',
    'model-prices',
    existing,
    dependencies,
    async (response, signal) => ({
      response,
      bytes: response.status === 304
        ? null
        : await readBoundedResponse(response, MAX_LITELLM_BYTES, 'LiteLLM', signal),
    }),
  );
  const response = fetched.response;
  let projected: Record<string, Record<string, unknown>>;
  let contentHash: string;
  let originalContentHash: string;
  let etag: string | null;
  let lastModified: string | null;
  let evidence: EvidenceWrite[];
  if (response.status === 304) {
    if (!existing) throw new RefreshFailure('litellm', 'model-prices', 'LiteLLM returned 304 without an immutable active snapshot');
    const stored = await readStoredBytes(bucket, existing, 'LiteLLM');
    projected = projectLiteLlm(decodeJson(stored.bytes, 'LiteLLM stored projection'));
    if (!byteArraysEqual(stored.bytes, jsonBytes(projected))) {
      throw new RefreshFailure('litellm', 'model-prices', 'LiteLLM immutable snapshot is not the exact safe projection');
    }
    contentHash = existing.contentHash;
    originalContentHash = existing.originalContentHash;
    etag = existing.etag;
    lastModified = existing.lastModified;
    evidence = [];
  } else {
    if (!fetched.bytes) throw new RefreshFailure('litellm', 'model-prices', 'LiteLLM 200 response has no body bytes');
    const raw = fetched.bytes;
    try {
      projected = projectLiteLlm(decodeJson(raw, 'LiteLLM response'));
    } catch (error) {
      throw new RefreshFailure('litellm', 'model-prices', error instanceof Error ? error.message : String(error));
    }
    const bytes = jsonBytes(projected);
    contentHash = await sha256Digest(bytes);
    originalContentHash = await sha256Digest(raw);
    etag = response.headers.get('etag');
    lastModified = response.headers.get('last-modified');
    evidence = [{
      sourceId: 'litellm', artifactId: 'model-prices',
      snapshotKey: liteLlmSnapshotKey(contentHash, originalContentHash),
      bytes, contentHash, originalContentHash,
    }];
  }
  const provenance = {
    etag, lastModified, upstreamRevision: null, schemaVersion: null,
    snapshotKey: evidence[0]?.snapshotKey ?? existing?.snapshotKey,
    contentHash, originalContentHash,
  };
  try {
    return { batch: parseLiteLlmPrices(projected, observedAt, provenance), evidence };
  } catch (error) {
    throw new RefreshFailure('litellm', 'model-prices', error instanceof Error ? error.message : String(error));
  }
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

function projectLmArenaPage(payload: unknown, subset: LmArenaSubset, offset: number): ProjectedLmArenaPage {
  const document = requireRecord(payload, `LMArena ${subset} response`);
  if (!Array.isArray(document.rows)) throw new Error(`LMArena ${subset} response must contain rows`);
  if (document.rows.length > 100) throw new Error(`LMArena ${subset} response exceeds the 100-row page size`);
  const totalRows = document.num_rows_total;
  if (typeof totalRows !== 'number' || !Number.isSafeInteger(totalRows) || totalRows < 0) {
    throw new Error(`LMArena ${subset} response requires a non-negative safe integer num_rows_total`);
  }
  if (offset > totalRows) {
    throw new Error(`LMArena ${subset} page offset exceeds declared num_rows_total`);
  }
  const rowIndexes = new Set<number>();
  const rows = document.rows.map((value, index) => {
    const envelope = requireRecord(value, `LMArena ${subset} row ${index}`);
    if (!Number.isSafeInteger(envelope.row_idx)) throw new Error(`LMArena ${subset} row ${index}.row_idx must be an integer`);
    const rowIndex = envelope.row_idx as number;
    if (rowIndex < offset || rowIndex >= offset + 100) {
      throw new Error(`LMArena ${subset} row ${index}.row_idx is outside its exact page identity`);
    }
    if (rowIndexes.has(rowIndex)) throw new Error(`LMArena ${subset} has duplicate row_idx ${rowIndex}`);
    rowIndexes.add(rowIndex);
    if (!Array.isArray(envelope.truncated_cells) || envelope.truncated_cells.length !== 0) {
      throw new Error(`LMArena ${subset} row ${index} has truncated cells`);
    }
    const row = requireRecord(envelope.row, `LMArena ${subset} row ${index}.row`);
    const projectedRow = Object.fromEntries(lmArenaAllowedFields(subset).flatMap((name) => Object.prototype.hasOwnProperty.call(row, name) ? [[name, row[name]]] : []));
    assertNoProhibitedData(projectedRow, `LMArena ${subset} row ${index}`);
    return { row_idx: rowIndex, row: projectedRow, truncated_cells: [] };
  }).sort((left, right) => left.row_idx - right.row_idx);
  const expectedRows = Math.min(100, totalRows - offset);
  if (rows.length !== expectedRows) {
    throw new Error(`LMArena ${subset} page is missing rows required by num_rows_total`);
  }
  return { rows, num_rows_total: totalRows };
}

function lmArenaSnapshotKey(
  subset: LmArenaSubset,
  offset: number,
  contentHash: string,
  originalContentHash: string,
): string {
  return `benchmarks/lmarena/${subset}/latest/overall/offset-${offset}-length-100/${contentHash.slice('sha256:'.length)}/original/${originalContentHash.slice('sha256:'.length)}.json`;
}

async function reuseLmArenaPage(
  bucket: R2Bucket,
  source: StoredSourceRecord,
  subset: LmArenaSubset,
  offset: number,
  observedAt: string,
): Promise<LmArenaPage> {
  const stored = await readStoredBytes(bucket, source, `LMArena ${source.artifactId}`);
  const projection = projectLmArenaPage(decodeJson(stored.bytes, `LMArena ${source.artifactId}`), subset, offset);
  if (!byteArraysEqual(stored.bytes, jsonBytes(projection))) {
    throw new RefreshFailure('lmarena', source.artifactId, 'LMArena immutable snapshot is not the exact safe projection');
  }
  if (!source.upstreamRevision) throw new RefreshFailure('lmarena', source.artifactId, 'LMArena immutable snapshot has no x-revision');
  const provenance = {
    artifactId: source.artifactId, sourceUrl: source.sourceUrl, subset, split: 'latest', category: 'overall', offset, length: 100,
    etag: source.etag, lastModified: source.lastModified, upstreamRevision: source.upstreamRevision,
    schemaVersion: source.schemaVersion, snapshotKey: source.snapshotKey, contentHash: source.contentHash,
    originalContentHash: source.originalContentHash,
  };
  return {
    batch: parseLmArenaSubset(subset, projection.rows, observedAt, provenance),
    evidence: [],
    rowCount: projection.rows.length,
    revision: source.upstreamRevision,
    totalRows: projection.num_rows_total,
  };
}

async function fetchLmArenaSubset(
  subset: LmArenaSubset,
  bucket: R2Bucket,
  previous: Map<string, StoredSourceRecord>,
  observedAt: string,
  dependencies: RefreshDependencies,
): Promise<LmArenaPage[]> {
  const pages: LmArenaPage[] = [];
  let declaredTotal: number | null = null;
  for (let pageNumber = 0; pageNumber < MAX_LMARENA_PAGES_PER_SUBSET; pageNumber += 1) {
    const offset = pageNumber * 100;
    if (declaredTotal !== null && offset >= declaredTotal) break;
    const artifactId = lmArenaPageArtifactId(subset, 'latest', 'overall', offset, 100);
    const sourceUrl = lmArenaPageSourceUrl(subset, 'latest', 'overall', offset, 100);
    const existing = previous.get(sourceKey('lmarena', artifactId));
    const fetched = await fetchWithRetry(
      sourceUrl,
      'lmarena',
      artifactId,
      existing,
      dependencies,
      async (response, signal) => ({
        response,
        bytes: response.status === 304
          ? null
          : await readBoundedResponse(response, MAX_LMARENA_PAGE_BYTES, `LMArena ${artifactId}`, signal),
      }),
    );
    const response = fetched.response;
    let page: LmArenaPage;
    if (response.status === 304) {
      if (!existing) throw new RefreshFailure('lmarena', artifactId, 'LMArena returned 304 without an immutable page snapshot');
      page = await reuseLmArenaPage(bucket, existing, subset, offset, observedAt);
    } else {
      if (!fetched.bytes) throw new RefreshFailure('lmarena', artifactId, 'LMArena 200 response has no body bytes');
      const raw = fetched.bytes;
      const revision = response.headers.get('x-revision');
      if (revision === null || revision.trim().length === 0) {
        throw new RefreshFailure('lmarena', artifactId, 'LMArena response requires a non-null x-revision header');
      }
      let projection: ProjectedLmArenaPage;
      try {
        projection = projectLmArenaPage(decodeJson(raw, `LMArena ${artifactId}`), subset, offset);
      } catch (error) {
        throw new RefreshFailure('lmarena', artifactId, error instanceof Error ? error.message : String(error));
      }
      if (projection.rows.length === 0) {
        if (declaredTotal !== null && offset < declaredTotal) {
          throw new RefreshFailure('lmarena', artifactId, 'LMArena page is missing rows required by a previously declared num_rows_total');
        }
        break;
      }
      const bytes = jsonBytes(projection);
      const contentHash = await sha256Digest(bytes);
      const originalContentHash = await sha256Digest(raw);
      const provenance = {
        artifactId, sourceUrl, subset, split: 'latest', category: 'overall', offset, length: 100,
        etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified'), upstreamRevision: revision,
        schemaVersion: null, snapshotKey: lmArenaSnapshotKey(subset, offset, contentHash, originalContentHash), contentHash, originalContentHash,
      };
      try {
        page = {
          batch: parseLmArenaSubset(subset, projection.rows, observedAt, provenance),
          evidence: [{ sourceId: 'lmarena', artifactId, snapshotKey: provenance.snapshotKey, bytes, contentHash, originalContentHash }],
          rowCount: projection.rows.length,
          revision,
          totalRows: projection.num_rows_total,
        };
      } catch (error) {
        throw new RefreshFailure('lmarena', artifactId, error instanceof Error ? error.message : String(error));
      }
    }
    if (page.totalRows === null) {
      throw new RefreshFailure('lmarena', artifactId, 'LMArena page has no verified num_rows_total');
    }
    if (declaredTotal !== null && declaredTotal !== page.totalRows) {
      throw new RefreshFailure('lmarena', artifactId, 'LMArena pages disagree on num_rows_total');
    }
    declaredTotal = page.totalRows;
    const expectedRows = Math.min(100, declaredTotal - offset);
    if (page.rowCount !== expectedRows) {
      throw new RefreshFailure('lmarena', artifactId, 'LMArena page is missing rows required by num_rows_total');
    }
    if (page.rowCount === 0) break;
    pages.push(page);
    if (offset + page.rowCount === declaredTotal) break;
  }
  if (pages.length === 0) throw new RefreshFailure('lmarena', `${subset}:latest:overall`, 'LMArena subset has no complete page');
  if (pages.length === MAX_LMARENA_PAGES_PER_SUBSET && pages.at(-1)?.rowCount === 100
    && (declaredTotal === null || declaredTotal > pages.length * 100)) {
    throw new RefreshFailure('lmarena', `${subset}:latest:overall`, 'LMArena pagination exceeded the bounded page limit');
  }
  if (declaredTotal === null || pages.reduce((count, page) => count + page.rowCount, 0) !== declaredTotal) {
    throw new RefreshFailure('lmarena', `${subset}:latest:overall`, 'LMArena pages do not cover the verified num_rows_total');
  }
  return pages;
}

async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, operation: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await operation(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function sourcePriority(sourceId: BenchmarkSourceRecord['sourceId']): number {
  return ({ benchlm: 0, lmarena: 1, openrouter: 2, litellm: 3 } as const)[sourceId];
}

function mergeNormalizedBatches(batches: readonly NormalizedSourceBatch[]): NormalizedSourceBatch {
  const sources = batches.flatMap((batch) => batch.sources).sort((left, right) => binaryCompare(sourceKey(left.sourceId, left.artifactId), sourceKey(right.sourceId, right.artifactId)));
  const models = new Map<string, BenchmarkModel>();
  for (const candidate of batches.flatMap((batch) => batch.models)) {
    const previous = models.get(candidate.modelKey);
    if (!previous || sourcePriority(candidate.sourceId) < sourcePriority(previous.sourceId)
      || (candidate.sourceId === previous.sourceId && binaryCompare(candidate.sourceArtifactId, previous.sourceArtifactId) < 0)) {
      models.set(candidate.modelKey, { ...candidate });
    } else if (candidate.sourceId === previous.sourceId && candidate.sourceModelId === previous.sourceModelId) {
      previous.benchmarkCount += candidate.benchmarkCount;
    }
  }
  const metrics = batches.flatMap((batch) => batch.metrics).sort((left, right) => binaryCompare(`${left.modelKey}\u0000${left.metricKey}`, `${right.modelKey}\u0000${right.metricKey}`));
  const prices = batches.flatMap((batch) => batch.priceChecks).sort((left, right) => binaryCompare(`${left.modelKey}\u0000${left.sourceId}\u0000${left.providerId}\u0000${left.routeId}`, `${right.modelKey}\u0000${right.sourceId}\u0000${right.providerId}\u0000${right.routeId}`));
  const seeds = batches.flatMap((batch) => batch.comparisonSeeds).sort((left, right) => binaryCompare(left.pairSlug, right.pairSlug));
  return validateNormalizedSourceBatch({ sources, models: [...models.values()].sort((left, right) => binaryCompare(left.modelKey, right.modelKey)), metrics, priceChecks: prices, comparisonSeeds: seeds });
}

function safeBenchLmCategories(metrics: readonly BenchmarkMetric[], modelKey: string): Map<string, BenchmarkMetric> {
  return new Map(metrics
    .filter((metric) => metric.modelKey === modelKey && metric.sourceId === 'benchlm'
      && metric.metricKey.startsWith('benchlm:category:') && metric.rankingEligible
      && Number.isFinite(metric.value) && !normalizeProhibited(metric).includes('artificialanalysis'))
    .map((metric) => [metric.category, metric]));
}

function editorialSeeds(models: readonly BenchmarkModel[]): ComparisonSeed[] {
  const bySlug = new Map(models.map((model) => [model.slug, model]));
  return COMPARISON_ALLOWLIST.flatMap((pairSlug) => {
    const [leftSlug, rightSlug] = pairSlug.split('-vs-');
    const left = bySlug.get(leftSlug);
    const right = bySlug.get(rightSlug);
    if (!left || !right || left.modelKey === right.modelKey) return [];
    const [modelA, modelB] = compareUtf8Binary(left.modelKey, right.modelKey) < 0 ? [left, right] : [right, left];
    return [{ pairSlug: `${modelA.slug}-vs-${modelB.slug}`, modelAKey: modelA.modelKey, modelBKey: modelB.modelKey, sourceId: 'benchlm', sourceArtifactId: 'comparisons', sourceModelAId: modelA.sourceModelId, sourceModelBId: modelB.sourceModelId, featuredRank: null }];
  });
}

export function deriveComparisonPairs(batch: NormalizedSourceBatch): BenchmarkComparisonPair[] {
  const byKey = new Map(batch.models.map((model) => [model.modelKey, model]));
  const resolvePairSlug = createComparisonPairSlugResolver(batch.models);
  const records = new Map<string, BenchmarkComparisonPair>();
  for (const seed of [...batch.comparisonSeeds, ...editorialSeeds(batch.models)]) {
    const left = byKey.get(seed.modelAKey);
    const right = byKey.get(seed.modelBKey);
    if (!left || !right || left.modelKey === right.modelKey) continue;
    const [modelA, modelB] = compareUtf8Binary(left.modelKey, right.modelKey) < 0 ? [left, right] : [right, left];
    const pairSlug = `${modelA.slug}-vs-${modelB.slug}`;
    const overall = batch.metrics.filter((metric) => metric.metricKey === 'benchlm:overall:raw' && metric.rankingEligible);
    const bothOverall = overall.some((metric) => metric.modelKey === modelA.modelKey) && overall.some((metric) => metric.modelKey === modelB.modelKey);
    const categoriesA = safeBenchLmCategories(batch.metrics, modelA.modelKey);
    const categoriesB = safeBenchLmCategories(batch.metrics, modelB.modelKey);
    const sharedMetricCount = [...categoriesA.keys()].filter((category) => categoriesB.has(category)).length;
    const qualityEligible = modelA.evidenceStatus === 'supported' && modelB.evidenceStatus === 'supported'
      && modelA.rankingEligible && modelB.rankingEligible && bothOverall && sharedMetricCount >= 2;
    const resolved = resolvePairSlug(pairSlug);
    const routeEligible = isComparisonPairRouteSafe(pairSlug)
      && resolved !== null
      && resolved.modelA.modelKey === modelA.modelKey
      && resolved.modelB.modelKey === modelB.modelKey
      && resolved.canonicalPairSlug === pairSlug;
    const indexable = qualityEligible && routeEligible;
    const eligibilityReason = !qualityEligible
      ? 'quality-gates-not-met'
      : routeEligible
        ? 'supported-safe-shared-benchlm-categories'
        : 'route-ineligible';
    const pair = validateBenchmarkComparisonPair({ pairSlug, modelAKey: modelA.modelKey, modelBKey: modelB.modelKey, indexable, eligibilityReason, featuredRank: seed.featuredRank, sharedMetricCount });
    validateIndexableComparisonPairRoute(batch.models, pair, resolvePairSlug);
    records.set(`${pair.modelAKey}\u0000${pair.modelBKey}`, pair);
  }
  return [...records.values()].sort((left, right) => binaryCompare(left.pairSlug, right.pairSlug));
}

async function combinedContentHash(catalog: ActiveCatalogSource, sources: readonly BenchmarkSourceRecord[]): Promise<string> {
  const artifacts = sources.map((source) => ({ sourceId: source.sourceId, artifactId: source.artifactId, contentHash: source.contentHash }))
    .sort((left, right) => binaryCompare(sourceKey(left.sourceId, left.artifactId), sourceKey(right.sourceId, right.artifactId)));
  return sha256Digest(jsonBytes({ catalogRevision: catalog.revision, openrouterContentHash: catalog.contentHash, artifacts }));
}

async function revisionIdForContentHash(contentHash: string): Promise<string> {
  const fingerprint = await sha256Digest(jsonBytes({
    derivationSchemaVersion: BENCHMARK_DERIVATION_SCHEMA_VERSION,
    contentHash,
  }));
  return `benchmark_${fingerprint.slice('sha256:'.length, 'sha256:'.length + 32)}`;
}

async function writeEvidence(bucket: R2Bucket, sources: readonly BenchmarkSourceRecord[], evidence: readonly EvidenceWrite[]): Promise<void> {
  const sourceByKey = new Map(sources.map((source) => [sourceKey(source.sourceId, source.artifactId), source]));
  for (const entry of [...evidence].sort((left, right) => binaryCompare(left.snapshotKey, right.snapshotKey))) {
    const source = sourceByKey.get(sourceKey(entry.sourceId, entry.artifactId));
    if (!source) throw new Error(`Evidence ${entry.sourceId}/${entry.artifactId} is not a normalized source`);
    if (source.snapshotKey !== entry.snapshotKey || source.contentHash !== entry.contentHash || source.originalContentHash !== entry.originalContentHash) {
      throw new Error(`Evidence ${entry.sourceId}/${entry.artifactId} does not match source provenance`);
    }
    if (await sha256Digest(entry.bytes) !== entry.contentHash) {
      throw new Error(`Evidence ${entry.sourceId}/${entry.artifactId} bytes do not match content hash`);
    }
    const existing = await bucket.get(entry.snapshotKey);
    if (existing) {
      const existingBytes = new Uint8Array(await existing.arrayBuffer());
      if (await sha256Digest(existingBytes) !== entry.contentHash) {
        throw new Error(`Evidence ${entry.sourceId}/${entry.artifactId} immutable key has mismatched bytes`);
      }
      if (existing.customMetadata?.original_content_hash !== entry.originalContentHash) {
        throw new Error(`Evidence ${entry.sourceId}/${entry.artifactId} immutable key has mismatched original provenance`);
      }
      continue;
    }
    await bucket.put(entry.snapshotKey, entry.bytes, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { original_content_hash: entry.originalContentHash },
    });
  }
}

function d1ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function boundedStatement(db: D1Database, sql: string, values: readonly unknown[]): BoundStatement {
  if (d1ByteLength(sql) > MAX_D1_SQL_BYTES) throw new Error('D1 SQL statement exceeds the 100KB limit');
  if (values.length > MAX_D1_BOUND_PARAMETERS) throw new Error('D1 statement exceeds the 100 bound-parameter limit');
  for (const value of values) {
    if (typeof value === 'string' && d1ByteLength(value) > MAX_D1_JSON_PARAMETER_BYTES) {
      throw new Error('D1 bound string exceeds the 1.5MB ingestion safety limit');
    }
  }
  return db.prepare(sql).bind(...values);
}

function jsonPayloads<T>(rows: readonly T[], label: string): string[] {
  const payloads: string[] = [];
  let chunk: string[] = [];
  let chunkBytes = 2; // []
  for (const row of rows) {
    const encoded = JSON.stringify(row);
    if (encoded === undefined) throw new Error(`${label} row is not JSON serializable`);
    const bytes = d1ByteLength(encoded);
    if (bytes + 2 > MAX_D1_JSON_PARAMETER_BYTES) {
      throw new Error(`${label} row exceeds the 1.5MB D1 ingestion safety limit`);
    }
    const nextBytes = chunkBytes + (chunk.length === 0 ? 0 : 1) + bytes;
    if (nextBytes > MAX_D1_JSON_PARAMETER_BYTES) {
      payloads.push(`[${chunk.join(',')}]`);
      chunk = [];
      chunkBytes = 2;
    }
    chunk.push(encoded);
    chunkBytes += (chunk.length === 1 ? 0 : 1) + bytes;
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

const INSERT_BENCHMARK_SOURCES = `INSERT INTO benchmark_source_records
  (revision, source_id, artifact_id, source_url, observed_at, etag, last_modified, upstream_revision, schema_version, snapshot_key, content_hash, original_content_hash, license_id, attribution_text)
SELECT ?, json_extract(row.value, '$.sourceId'), json_extract(row.value, '$.artifactId'), json_extract(row.value, '$.sourceUrl'), json_extract(row.value, '$.observedAt'),
  json_extract(row.value, '$.etag'), json_extract(row.value, '$.lastModified'), json_extract(row.value, '$.upstreamRevision'), json_extract(row.value, '$.schemaVersion'),
  json_extract(row.value, '$.snapshotKey'), json_extract(row.value, '$.contentHash'), json_extract(row.value, '$.originalContentHash'),
  json_extract(row.value, '$.licenseId'), json_extract(row.value, '$.attributionText')
FROM json_each(?) AS row`;

const INSERT_BENCHMARK_MODELS = `INSERT INTO benchmark_models
  (revision, model_key, slug, name, creator, source_type, reasoning_type, release_date, context_window_tokens, evidence_status, ranking_eligible, confidence_lower, confidence_upper, benchmark_count, source_id, source_model_id, source_artifact_id)
SELECT ?, json_extract(row.value, '$.modelKey'), json_extract(row.value, '$.slug'), json_extract(row.value, '$.name'), json_extract(row.value, '$.creator'),
  json_extract(row.value, '$.sourceType'), json_extract(row.value, '$.reasoningType'), json_extract(row.value, '$.releaseDate'), json_extract(row.value, '$.contextWindowTokens'),
  json_extract(row.value, '$.evidenceStatus'), CASE WHEN json_extract(row.value, '$.rankingEligible') THEN 1 ELSE 0 END,
  json_extract(row.value, '$.confidenceLower'), json_extract(row.value, '$.confidenceUpper'), json_extract(row.value, '$.benchmarkCount'),
  json_extract(row.value, '$.sourceId'), json_extract(row.value, '$.sourceModelId'), json_extract(row.value, '$.sourceArtifactId')
FROM json_each(?) AS row`;

const INSERT_BENCHMARK_METRICS = `INSERT INTO benchmark_metrics
  (revision, model_key, metric_key, category, value, rank, lower_bound, upper_bound, vote_count, unit, source_id, source_updated_at, source_model_id, source_artifact_id, ranking_eligible, methodology, observation_count, session_count)
SELECT ?, json_extract(row.value, '$.modelKey'), json_extract(row.value, '$.metricKey'), json_extract(row.value, '$.category'), json_extract(row.value, '$.value'),
  json_extract(row.value, '$.rank'), json_extract(row.value, '$.lower'), json_extract(row.value, '$.upper'), json_extract(row.value, '$.voteCount'), json_extract(row.value, '$.unit'),
  json_extract(row.value, '$.sourceId'), json_extract(row.value, '$.sourceUpdatedAt'), json_extract(row.value, '$.sourceModelId'), json_extract(row.value, '$.sourceArtifactId'),
  CASE WHEN json_extract(row.value, '$.rankingEligible') THEN 1 ELSE 0 END, json_extract(row.value, '$.methodology'), json_extract(row.value, '$.observationCount'), json_extract(row.value, '$.sessionCount')
FROM json_each(?) AS row`;

const INSERT_BENCHMARK_PRICES = `INSERT INTO benchmark_price_checks
  (revision, model_key, source_id, provider_id, route_id, source_model_id, canonical_slug, input_usd_per_million, cached_input_usd_per_million, output_usd_per_million, context_window_tokens, max_input_tokens, max_output_tokens, input_modalities_json, output_modalities_json, supported_parameters_json, source_artifact_id, verification_status)
SELECT ?, json_extract(row.value, '$.modelKey'), json_extract(row.value, '$.sourceId'), json_extract(row.value, '$.providerId'), json_extract(row.value, '$.routeId'),
  json_extract(row.value, '$.sourceModelId'), json_extract(row.value, '$.canonicalSlug'), json_extract(row.value, '$.inputUsdPerMillion'), json_extract(row.value, '$.cachedInputUsdPerMillion'), json_extract(row.value, '$.outputUsdPerMillion'),
  json_extract(row.value, '$.contextWindowTokens'), json_extract(row.value, '$.maxInputTokens'), json_extract(row.value, '$.maxOutputTokens'),
  json_extract(row.value, '$.inputModalities'), json_extract(row.value, '$.outputModalities'), json_extract(row.value, '$.supportedParameters'),
  json_extract(row.value, '$.sourceArtifactId'), json_extract(row.value, '$.verificationStatus')
FROM json_each(?) AS row`;

const INSERT_BENCHMARK_PAIRS = `INSERT INTO benchmark_comparison_pairs
  (revision, pair_slug, model_a_key, model_b_key, indexable, eligibility_reason, featured_rank, shared_metric_count)
SELECT ?, json_extract(row.value, '$.pairSlug'), json_extract(row.value, '$.modelAKey'), json_extract(row.value, '$.modelBKey'),
  CASE WHEN json_extract(row.value, '$.indexable') THEN 1 ELSE 0 END, json_extract(row.value, '$.eligibilityReason'), json_extract(row.value, '$.featuredRank'), json_extract(row.value, '$.sharedMetricCount')
FROM json_each(?) AS row`;

const UPSERT_BENCHMARK_REFRESH = `INSERT INTO benchmark_refresh_state
  (source_id, artifact_id, last_success_at, last_revision, last_error)
SELECT json_extract(row.value, '$.sourceId'), json_extract(row.value, '$.artifactId'), ?, ?, NULL
FROM json_each(?) AS row
WHERE true
ON CONFLICT(source_id, artifact_id) DO UPDATE SET
  last_success_at = excluded.last_success_at, last_revision = excluded.last_revision, last_error = NULL`;

function refreshSuccessStatements(db: D1Database, sources: readonly BenchmarkSourceRecord[], checkedAt: string, revision: string): BoundStatement[] {
  const statements: BoundStatement[] = [];
  appendJsonEachStatements(statements, db, UPSERT_BENCHMARK_REFRESH, [checkedAt, revision], sources, 'benchmark refresh state');
  if (statements.length > MAX_D1_PUBLICATION_STATEMENTS) {
    throw new Error(`Benchmark refresh-state update exceeds the ${MAX_D1_PUBLICATION_STATEMENTS}-statement D1 safety budget`);
  }
  return statements;
}

export function buildPublicationStatements(
  db: D1Database,
  revision: string,
  generatedAt: string,
  checkedAt: string,
  contentHash: string,
  catalog: ActiveCatalogSource,
  batch: NormalizedSourceBatch,
  pairs: readonly BenchmarkComparisonPair[],
): BoundStatement[] {
  const resolvePairSlug = createComparisonPairSlugResolver(batch.models);
  for (const value of pairs) {
    const pair = validateBenchmarkComparisonPair(value);
    validateIndexableComparisonPairRoute(batch.models, pair, resolvePairSlug);
  }
  const statements: BoundStatement[] = [
    boundedStatement(db, `INSERT INTO benchmark_revisions
      (revision, generated_at, published_at, checked_at, publication_state, content_hash, catalog_revision, openrouter_content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [revision, generatedAt, null, checkedAt, 'pending', contentHash, catalog.revision, catalog.contentHash]),
  ];
  appendJsonEachStatements(statements, db, INSERT_BENCHMARK_SOURCES, [revision], batch.sources, 'benchmark source records');
  appendJsonEachStatements(statements, db, INSERT_BENCHMARK_MODELS, [revision], batch.models, 'benchmark models');
  appendJsonEachStatements(statements, db, INSERT_BENCHMARK_METRICS, [revision], batch.metrics, 'benchmark metrics');
  appendJsonEachStatements(statements, db, INSERT_BENCHMARK_PRICES, [revision], batch.priceChecks, 'benchmark price checks');
  appendJsonEachStatements(statements, db, INSERT_BENCHMARK_PAIRS, [revision], pairs, 'benchmark comparison pairs');
  statements.push(
    boundedStatement(db, `UPDATE benchmark_revisions SET publication_state = 'superseded' WHERE publication_state = 'published'`, []),
    boundedStatement(db, `UPDATE benchmark_revisions SET publication_state = 'published', published_at = ? WHERE revision = ?`, [checkedAt, revision]),
    boundedStatement(db, `INSERT INTO benchmark_publication_state (singleton, active_revision, updated_at) VALUES (1, ?, ?)
      ON CONFLICT(singleton) DO UPDATE SET active_revision = excluded.active_revision, updated_at = excluded.updated_at`, [revision, checkedAt]),
    ...refreshSuccessStatements(db, batch.sources, checkedAt, revision),
  );
  if (statements.length > MAX_D1_PUBLICATION_STATEMENTS) {
    throw new Error(`Benchmark publication exceeds the ${MAX_D1_PUBLICATION_STATEMENTS}-statement D1 safety budget`);
  }
  return statements;
}

async function recordFailure(env: BenchmarkIngestEnv, sourceId: BenchmarkSourceRecord['sourceId'], artifactId: string, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH);
  await env.CATALOG_DB.batch([env.CATALOG_DB.prepare(`
    INSERT INTO benchmark_refresh_state (source_id, artifact_id, last_success_at, last_revision, last_error)
    VALUES (?, ?, NULL, NULL, ?)
    ON CONFLICT(source_id, artifact_id) DO UPDATE SET last_error = excluded.last_error
  `).bind(sourceId, artifactId, message)]);
}

function failureTarget(error: unknown): { sourceId: BenchmarkSourceRecord['sourceId']; artifactId: string } {
  return error instanceof RefreshFailure
    ? { sourceId: error.sourceId, artifactId: error.artifactId }
    : { sourceId: 'benchlm', artifactId: 'bundle' };
}

export async function refreshBenchmarkRevision(
  env: BenchmarkIngestEnv,
  dependencies: RefreshDependencies = defaultDependencies(),
): Promise<RefreshResult> {
  const checkedAt = dependencies.now();
  try {
    const catalog = await readActiveCatalogSource(env.CATALOG_DB);
    const active = await readActiveBenchmarkRevision(env.CATALOG_DB);
    const previous = await readActiveSourceRecords(env.CATALOG_DB, active?.revision ?? null);
    const openRouter = await loadOpenRouterCatalog(env.SOURCE_SNAPSHOTS, catalog);
    const benchLm = await prepareBenchLmSource(env.SOURCE_SNAPSHOTS, previous, checkedAt, dependencies);
    const liteLlm = await prepareLiteLlmSource(env.SOURCE_SNAPSHOTS, previous, checkedAt, dependencies);
    const lmarenaBySubset = await mapWithConcurrency(LMARENA_SUBSETS, 6, (subset) => fetchLmArenaSubset(subset, env.SOURCE_SNAPSHOTS, previous, checkedAt, dependencies));
    const pages = lmarenaBySubset.flat();
    const revisions = new Set(pages.map((page) => page.revision));
    if (revisions.size !== 1 || ![...revisions][0]) {
      throw new RefreshFailure('lmarena', 'bundle', 'LMArena pages must share one non-null x-revision');
    }
    const normalized = mergeNormalizedBatches([benchLm.batch, liteLlm.batch, openRouter, ...pages.map((page) => page.batch)]);
    const pairs = deriveComparisonPairs(normalized);
    const contentHash = await combinedContentHash(catalog, normalized.sources);
    const revision = await revisionIdForContentHash(contentHash);
    const evidence = [...benchLm.evidence, ...liteLlm.evidence, ...pages.flatMap((page) => page.evidence)];
    if (active?.contentHash === contentHash && active.revision === revision) {
      const unchangedStatements = [
        boundedStatement(env.CATALOG_DB, `UPDATE benchmark_revisions SET checked_at = ? WHERE revision = ?`, [checkedAt, active.revision]),
        ...refreshSuccessStatements(env.CATALOG_DB, normalized.sources, checkedAt, active.revision),
      ];
      if (unchangedStatements.length > MAX_D1_PUBLICATION_STATEMENTS) {
        throw new Error(`Unchanged benchmark refresh exceeds the ${MAX_D1_PUBLICATION_STATEMENTS}-statement D1 safety budget`);
      }
      await env.CATALOG_DB.batch(unchangedStatements);
      return { status: 'unchanged', revision: active.revision, checkedAt, error: null };
    }
    const generatedAt = normalized.sources.find((source) => source.sourceId === 'benchlm' && source.artifactId === 'leaderboard')?.upstreamRevision ?? checkedAt;
    await writeEvidence(env.SOURCE_SNAPSHOTS, normalized.sources, evidence);
    await env.CATALOG_DB.batch(buildPublicationStatements(env.CATALOG_DB, revision, generatedAt, checkedAt, contentHash, catalog, normalized, pairs));
    return { status: 'published', revision, checkedAt, error: null };
  } catch (error) {
    const target = failureTarget(error);
    const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH);
    try {
      await recordFailure(env, target.sourceId, target.artifactId, message);
    } catch (recordError) {
      console.error(JSON.stringify({ message: 'benchmark refresh failure could not be recorded', error: recordError instanceof Error ? recordError.message : String(recordError) }));
    }
    console.error(JSON.stringify({ message: 'benchmark refresh failed', sourceId: target.sourceId, artifactId: target.artifactId, error: message }));
    return { status: 'failed', revision: null, checkedAt, error: message };
  }
}

export default {
  async fetch(
    _request: Request,
    _env: BenchmarkIngestEnv,
    _ctx: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<Response> {
    return new Response('Scheduled ingestion only', { status: 405 });
  },
  async scheduled(
    controller: { cron: string; scheduledTime?: number; noRetry(): void },
    env: BenchmarkIngestEnv,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<void> {
    ctx.waitUntil((async () => {
      const result = await refreshBenchmarkRevision(env);
      if (result.status === 'failed') controller.noRetry();
      console.log(JSON.stringify({ message: 'benchmark refresh finished', status: result.status, revision: result.revision, checkedAt: result.checkedAt }));
    })());
  },
};
