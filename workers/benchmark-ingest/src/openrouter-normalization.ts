import {
  type BenchmarkMetric,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type BenchmarkSourceRecord,
  type NormalizedSourceBatch,
  validateNormalizedSourceBatch,
} from '../../../src/benchmarks/contracts';
import { resolveCanonicalModelKey, sourceSpecificModelKey } from '../../../src/benchmarks/model-aliases';
import {
  parseOpenRouterModels,
  projectOpenRouterModelsPayload,
} from '../../catalog-ingest/src/index';
import type { CandidatePartition, CandidateR2Bucket } from './candidate-storage';
import { candidateKeyPrefix } from './candidate-storage';

export interface FrozenOpenRouterCatalog {
  readonly revision: string;
  readonly sourceUrl: string;
  readonly observedAt: string;
  readonly snapshotKey: string;
  readonly contentHash: string;
  readonly originalContentHash: string;
}

const MAX_NORMALIZED_PARTITION_BYTES = 8 * 1024 * 1024;
const HEX_BYTES = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));

function fail(message: string): never {
  throw new Error(message);
}

async function sha256Digest(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += HEX_BYTES[byte];
  return `sha256:${hex}`;
}

function jsonBytes(value: unknown): Uint8Array {
  const json = JSON.stringify(value);
  if (json === undefined) fail('OpenRouter normalized partition is not JSON serializable');
  return new TextEncoder().encode(json);
}

function decodeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return fail('frozen OpenRouter catalog must be valid UTF-8 JSON');
  }
}

function sourceSpecificSlug(sourceModelId: string): string {
  return `source-openrouter-${encodeURIComponent(sourceModelId)}`;
}

function readNullableStringArray(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    fail('OpenRouter metadata string list is invalid');
  }
  return [...value];
}

function readNullableString(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) fail(`OpenRouter ${label} is invalid`);
  return value;
}

function readCreatedAt(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail('OpenRouter created timestamp is invalid');
  const milliseconds = value * 1_000;
  if (!Number.isSafeInteger(milliseconds)) fail('OpenRouter created timestamp is out of range');
  const result = new Date(milliseconds);
  if (!Number.isFinite(result.getTime())) fail('OpenRouter created timestamp is invalid');
  return result.toISOString();
}

function readExpirationDate(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/u.test(value)
    || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    fail('OpenRouter expiration date is invalid');
  }
  return value;
}

function readNullableBoolean(value: unknown, label: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') fail(`OpenRouter ${label} is invalid`);
  return value;
}

function readPerRequestLimitsJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('OpenRouter per_request_limits is invalid');
  }
  const json = JSON.stringify(value);
  if (json === undefined) fail('OpenRouter per_request_limits is not JSON serializable');
  return json;
}

function catalogBatch(
  projected: { data: Record<string, unknown>[] },
  catalog: FrozenOpenRouterCatalog,
): NormalizedSourceBatch {
  const artifactId = `catalog:${catalog.revision}`;
  const source: BenchmarkSourceRecord = {
    sourceId: 'openrouter',
    artifactId,
    sourceUrl: catalog.sourceUrl,
    observedAt: catalog.observedAt,
    etag: null,
    lastModified: null,
    upstreamRevision: catalog.revision,
    schemaVersion: null,
    snapshotKey: catalog.snapshotKey,
    contentHash: catalog.contentHash,
    originalContentHash: catalog.originalContentHash,
    licenseId: 'OpenRouter-ToS',
    attributionText: 'Catalog and pricing data from OpenRouter',
  };
  const parsed = parseOpenRouterModels(projected, catalog.observedAt);
  const metadataById = new Map(projected.data.map((model) => [String(model.id), model]));
  const models: BenchmarkModel[] = [];
  const metrics: BenchmarkMetric[] = [];
  const priceChecks: BenchmarkPriceCheck[] = [];
  for (const offer of parsed.modelOffers) {
    const sourceModelId = offer.modelId;
    const reviewedKey = resolveCanonicalModelKey('openrouter', sourceModelId);
    const modelKey = reviewedKey ?? sourceSpecificModelKey('openrouter', sourceModelId);
    const metadata = metadataById.get(sourceModelId) ?? {};
    const architecture = metadata.architecture && typeof metadata.architecture === 'object' && !Array.isArray(metadata.architecture)
      ? metadata.architecture as Record<string, unknown>
      : {};
    const topProvider = metadata.top_provider && typeof metadata.top_provider === 'object' && !Array.isArray(metadata.top_provider)
      ? metadata.top_provider as Record<string, unknown>
      : {};
    const canonicalSlug = typeof metadata.canonical_slug === 'string' && metadata.canonical_slug.length > 0
      ? metadata.canonical_slug
      : null;
    models.push({
      modelKey,
      slug: reviewedKey ? reviewedKey.slice(reviewedKey.lastIndexOf(':') + 1) : sourceSpecificSlug(sourceModelId),
      name: offer.displayName,
      creator: offer.providerId,
      sourceType: 'Unknown',
      reasoningType: null,
      releaseDate: null,
      contextWindowTokens: offer.contextWindowTokens ?? null,
      evidenceStatus: 'source_only',
      rankingEligible: false,
      confidenceLower: null,
      confidenceUpper: null,
      benchmarkCount: 0,
      sourceId: 'openrouter',
      sourceModelId,
      sourceArtifactId: artifactId,
    });
    priceChecks.push({
      modelKey,
      sourceId: 'openrouter',
      providerId: offer.providerId,
      inputUsdPerMillion: offer.inputMicroDollarsPerMillion / 1_000_000,
      cachedInputUsdPerMillion: offer.cachedInputMicroDollarsPerMillion === undefined
        ? null
        : offer.cachedInputMicroDollarsPerMillion / 1_000_000,
      outputUsdPerMillion: offer.outputMicroDollarsPerMillion / 1_000_000,
      contextWindowTokens: offer.contextWindowTokens ?? null,
      verificationStatus: 'primary',
      routeId: offer.id,
      sourceModelId,
      canonicalSlug,
      maxInputTokens: offer.contextWindowTokens ?? null,
      maxOutputTokens: offer.maxOutputTokens ?? null,
      inputModalities: readNullableStringArray(architecture.input_modalities),
      outputModalities: readNullableStringArray(architecture.output_modalities),
      supportedParameters: readNullableStringArray(metadata.supported_parameters),
      cacheWriteUsdPerMillion: offer.cacheWriteMicroDollarsPerMillion === undefined
        ? null
        : offer.cacheWriteMicroDollarsPerMillion / 1_000_000,
      createdAt: readCreatedAt(metadata.created),
      expirationDate: readExpirationDate(metadata.expiration_date),
      knowledgeCutoff: readNullableString(metadata.knowledge_cutoff, 'knowledge_cutoff'),
      tokenizer: readNullableString(architecture.tokenizer, 'architecture.tokenizer'),
      instructionFormat: readNullableString(architecture.instruct_type, 'architecture.instruct_type'),
      isModerated: readNullableBoolean(topProvider.is_moderated, 'top_provider.is_moderated'),
      perRequestLimitsJson: readPerRequestLimitsJson(metadata.per_request_limits),
      sourceArtifactId: artifactId,
    });
  }
  return validateNormalizedSourceBatch({ sources: [source], models, metrics, priceChecks, comparisonSeeds: [] });
}

/** Normalize the frozen active catalog without any upstream request. */
export async function normalizeOpenRouterCatalogStep(input: {
  readonly cycleId: string;
  readonly store: CandidateR2Bucket;
  readonly catalog: FrozenOpenRouterCatalog;
  readonly index: number;
}): Promise<CandidatePartition> {
  const object = await input.store.get(input.catalog.snapshotKey);
  if (!object) fail('frozen OpenRouter catalog snapshot is missing');
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await sha256Digest(bytes) !== input.catalog.contentHash) {
    fail('frozen OpenRouter catalog content hash does not match exact bytes');
  }
  const projection = projectOpenRouterModelsPayload(decodeJson(bytes));
  const canonical = jsonBytes(projection);
  if (canonical.byteLength !== bytes.byteLength || await sha256Digest(canonical) !== input.catalog.contentHash) {
    fail('frozen OpenRouter catalog is not the exact safe projection');
  }
  const recordedOriginal = object.customMetadata?.original_content_hash;
  if (recordedOriginal !== input.catalog.originalContentHash) {
    fail('frozen OpenRouter catalog original content hash is missing or mismatched');
  }
  const batch = catalogBatch(projection, input.catalog);
  const partitionBytes = jsonBytes({
    schemaVersion: 'normalized-source-v1',
    cycleId: input.cycleId,
    index: input.index,
    source: 'openrouter',
    batch,
  });
  if (partitionBytes.byteLength > MAX_NORMALIZED_PARTITION_BYTES) {
    fail('OpenRouter normalized partition exceeds the byte bound');
  }
  const contentHash = await sha256Digest(partitionBytes);
  const key = `${candidateKeyPrefix(input.cycleId)}normalized/${input.index}/${contentHash.slice(7)}.json`;
  await input.store.put(key, partitionBytes, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { content_hash: contentHash, original_content_hash: contentHash },
  });
  return {
    partitionId: `openrouter:${input.index}`,
    kind: 'normalized',
    index: input.index,
    key,
    contentHash,
    byteLength: partitionBytes.byteLength,
    rowCount: batch.sources.length + batch.models.length + batch.priceChecks.length,
  };
}
