import {
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type BenchmarkSourceRecord,
  type NormalizedSourceBatch,
  validateNormalizedSourceBatch,
} from '../../../src/benchmarks/contracts';
import { resolveCanonicalModelKey, sourceSpecificModelKey } from '../../../src/benchmarks/model-aliases';

const LITELLM_SOURCE_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const LITELLM_ARTIFACT_ID = 'model-prices';

type LiteLlmRow = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(message);
}

function requireRecord(value: unknown, label: string): LiteLlmRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as LiteLlmRow;
}

function hasOwn(record: LiteLlmRow, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function optionalPricePerMillion(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`${label} must be a non-negative finite number`);
  }
  const perMillion = value * 1_000_000;
  if (!Number.isFinite(perMillion)) fail(`${label} cannot be represented per million tokens`);
  return perMillion;
}

/** `undefined` distinguishes an absent legacy fallback from an explicit unavailable limit. */
function optionalTokenLimit(value: unknown, label: string): number | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    fail(`${label} must be an integer or null`);
  }
  return value > 0 ? value : null;
}

function limitWithLegacyFallback(primary: number | null | undefined, legacy: number | null | undefined): number | null {
  if (primary !== undefined) return primary;
  return legacy ?? null;
}

function optionalStringArray(value: unknown, label: string): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    fail(`${label} must be an array of non-empty strings or null`);
  }
  return [...value];
}

function optionalMode(row: LiteLlmRow, sourceModelId: string): string | null {
  if (!hasOwn(row, 'mode') || row.mode === null || row.mode === undefined) return null;
  if (typeof row.mode !== 'string' || row.mode.trim().length === 0) {
    fail(`LiteLLM model ${sourceModelId}.mode must be a non-empty string or null`);
  }
  return row.mode;
}

function canonicalSlug(modelKey: string): string {
  const separator = modelKey.lastIndexOf(':');
  return separator === -1 ? modelKey : modelKey.slice(separator + 1);
}

function sourceSpecificSlug(sourceId: string, sourceModelId: string): string {
  return `source-${sourceId}-${encodeURIComponent(sourceModelId)}`;
}

function sourceRecord(observedAt: string): BenchmarkSourceRecord {
  return {
    sourceId: 'litellm',
    artifactId: LITELLM_ARTIFACT_ID,
    sourceUrl: LITELLM_SOURCE_URL,
    observedAt,
    etag: null,
    lastModified: null,
    upstreamRevision: null,
    schemaVersion: null,
    snapshotKey: 'benchmarks/litellm/model-prices/provisional.json',
    contentHash: 'sha256:provisional-litellm-model-prices',
    licenseId: 'MIT',
    attributionText: 'LiteLLM corroboration',
  };
}

/**
 * Normalizes LiteLLM's official price/context document. It deliberately does
 * not establish a hosted route: all resulting prices remain corroborating
 * evidence until the publisher matches them to a current catalog route.
 */
export function parseLiteLlmPrices(payload: unknown, observedAt: string): NormalizedSourceBatch {
  const document = requireRecord(payload, 'LiteLLM payload');
  const modelsByKey = new Map<string, BenchmarkModel>();
  const priceChecks: BenchmarkPriceCheck[] = [];

  const entries = Object.entries(document)
    .filter(([sourceModelId]) => sourceModelId !== 'sample_spec')
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);

  for (const [sourceModelId, value] of entries) {
    const row = requireRecord(value, `LiteLLM entry ${sourceModelId}`);
    // The official document also contains `fallback_generalizations`, which is
    // routing metadata rather than a concrete model row.
    if (!hasOwn(row, 'litellm_provider') || row.litellm_provider === null || row.litellm_provider === undefined) continue;
    if (typeof row.litellm_provider !== 'string' || row.litellm_provider.trim().length === 0) {
      fail(`LiteLLM model ${sourceModelId}.litellm_provider must be a non-empty string`);
    }

    const providerId = row.litellm_provider;
    const mode = optionalMode(row, sourceModelId);
    const legacyLimit = optionalTokenLimit(row.max_tokens, `LiteLLM model ${sourceModelId}.max_tokens`);
    const maxInputTokens = limitWithLegacyFallback(
      optionalTokenLimit(row.max_input_tokens, `LiteLLM model ${sourceModelId}.max_input_tokens`),
      legacyLimit,
    );
    const maxOutputTokens = limitWithLegacyFallback(
      optionalTokenLimit(row.max_output_tokens, `LiteLLM model ${sourceModelId}.max_output_tokens`),
      legacyLimit,
    );
    const inputModalities = optionalStringArray(row.input_modalities, `LiteLLM model ${sourceModelId}.input_modalities`)
      ?? optionalStringArray(row.supported_modalities, `LiteLLM model ${sourceModelId}.supported_modalities`);
    const outputModalities = optionalStringArray(row.output_modalities, `LiteLLM model ${sourceModelId}.output_modalities`);
    const reviewedModelKey = resolveCanonicalModelKey('litellm', sourceModelId);
    const modelKey = reviewedModelKey ?? sourceSpecificModelKey('litellm', sourceModelId);

    if (!modelsByKey.has(modelKey)) {
      modelsByKey.set(modelKey, {
        modelKey,
        slug: reviewedModelKey ? canonicalSlug(reviewedModelKey) : sourceSpecificSlug('litellm', sourceModelId),
        name: sourceModelId,
        creator: providerId,
        sourceType: 'Unknown',
        reasoningType: null,
        releaseDate: null,
        contextWindowTokens: maxInputTokens,
        evidenceStatus: 'source_only',
        rankingEligible: false,
        confidenceLower: null,
        confidenceUpper: null,
        benchmarkCount: 0,
        sourceId: 'litellm',
        sourceModelId,
        sourceArtifactId: LITELLM_ARTIFACT_ID,
      });
    }

    priceChecks.push({
      modelKey,
      sourceId: 'litellm',
      providerId,
      inputUsdPerMillion: optionalPricePerMillion(row.input_cost_per_token, `LiteLLM model ${sourceModelId}.input_cost_per_token`),
      cachedInputUsdPerMillion: optionalPricePerMillion(row.cache_read_input_token_cost, `LiteLLM model ${sourceModelId}.cache_read_input_token_cost`),
      outputUsdPerMillion: optionalPricePerMillion(row.output_cost_per_token, `LiteLLM model ${sourceModelId}.output_cost_per_token`),
      contextWindowTokens: maxInputTokens,
      verificationStatus: 'corroborating',
      routeId: `litellm:${providerId}:${encodeURIComponent(sourceModelId)}:${mode === null ? 'unspecified' : encodeURIComponent(mode)}`,
      sourceModelId,
      canonicalSlug: reviewedModelKey ? canonicalSlug(reviewedModelKey) : null,
      maxInputTokens,
      maxOutputTokens,
      inputModalities,
      outputModalities,
      supportedParameters: null,
      sourceArtifactId: LITELLM_ARTIFACT_ID,
    });
  }

  if (modelsByKey.size === 0) fail('LiteLLM payload must contain at least one concrete model row');

  return validateNormalizedSourceBatch({
    sources: [sourceRecord(observedAt)],
    models: [...modelsByKey.values()],
    metrics: [],
    priceChecks,
    comparisonSeeds: [],
  });
}
