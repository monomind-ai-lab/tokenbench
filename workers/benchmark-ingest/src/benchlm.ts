import {
  type BenchmarkMetric,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type BenchmarkSourceRecord,
  type ComparisonSeed,
  type EvidenceStatus,
  type NormalizedSourceBatch,
  validateNormalizedSourceBatch,
} from '../../../src/benchmarks/contracts';
import { resolvedModelKey } from '../../../src/benchmarks/model-aliases';

const ARTIFACTS = ['leaderboard', 'models', 'pricing', 'comparisons', 'benchmarks'] as const;

type ArtifactName = typeof ARTIFACTS[number];

const ARTIFACT_URLS: Record<ArtifactName, string> = {
  leaderboard: 'https://benchlm.ai/data/leaderboard.json',
  models: 'https://benchlm.ai/data/models.json',
  pricing: 'https://benchlm.ai/data/pricing.json',
  comparisons: 'https://benchlm.ai/data/comparisons.json',
  benchmarks: 'https://benchlm.ai/data/benchmarks.json',
};

export interface BenchLmPayloads {
  leaderboard: unknown;
  models: unknown;
  pricing: unknown;
  comparisons: unknown;
  benchmarks: unknown;
}

interface ArtifactPayload {
  schemaVersion: string;
  generatedAt: string;
  items: unknown[];
  fixtureMetadata: FixtureMetadata;
}

interface FixtureMetadata {
  projectedSha256: string;
  originalSha256: string;
  etag: string | null;
  lastModified: string | null;
}

interface SafeModelInput {
  sourceModelId: string;
  modelKey: string;
  slug: string;
  name: string;
  creator: string;
  sourceType: BenchmarkModel['sourceType'];
  reasoningType: string | null;
  releaseDate: string | null;
  contextWindowTokens: number | null;
  evidenceStatus: EvidenceStatus;
  rankingEligible: boolean;
  categoryRankingEligible: Record<string, boolean>;
  trustedBenchmarkCount: number;
  rawOverallScore: number | null;
  displayCategoryScores: Record<string, number | null>;
  verifiedDisplayCategoryScores: Record<string, number | null>;
}

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) fail(`${label} must be an object`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function requireNullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return requireString(value, label);
}

function requireIsoTimestamp(value: unknown, label: string): string {
  const timestamp = requireString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
    fail(`${label} must be a finite ISO timestamp`);
  }
  return timestamp;
}

function requireNullableScore(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`${label} must be a non-negative finite number or null`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) fail(`${label} must be a non-negative integer`);
  return value as number;
}

function nullablePositiveInteger(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value)) fail(`${label} must be an integer or null`);
  if ((value as number) <= 0) return null;
  return value as number;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} must be a boolean`);
  return value;
}

function requireSha256Hex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label} must be a lowercase SHA-256 hex digest`);
  }
  return value;
}

function parseFixtureMetadata(value: unknown, label: string): FixtureMetadata {
  const metadata = requireRecord(value, `${label}.tokenbenchFixtureMetadata`);
  if (metadata.projectionFormat !== 'UTF-8 JSON.stringify({schemaVersion,generatedAt,items})') {
    fail(`${label}.tokenbenchFixtureMetadata.projectionFormat is invalid`);
  }
  const headers = requireRecord(metadata.responseHeaders, `${label}.tokenbenchFixtureMetadata.responseHeaders`);
  if (!Object.prototype.hasOwnProperty.call(headers, 'etag') || !Object.prototype.hasOwnProperty.call(headers, 'lastModified')) {
    fail(`${label}.tokenbenchFixtureMetadata.responseHeaders must include etag and lastModified`);
  }
  return {
    projectedSha256: requireSha256Hex(
      metadata.projectedSha256,
      `${label}.tokenbenchFixtureMetadata.projectedSha256`,
    ),
    originalSha256: requireSha256Hex(
      metadata.originalSha256,
      `${label}.tokenbenchFixtureMetadata.originalSha256`,
    ),
    etag: requireNullableString(headers.etag, `${label}.tokenbenchFixtureMetadata.responseHeaders.etag`),
    lastModified: requireNullableString(headers.lastModified, `${label}.tokenbenchFixtureMetadata.responseHeaders.lastModified`),
  };
}

function parseArtifact(value: unknown, artifact: ArtifactName): ArtifactPayload {
  const payload = requireRecord(value, `BenchLM ${artifact}`);
  if (payload.schemaVersion !== '1.0') fail(`BenchLM ${artifact} schemaVersion must be 1.0`);
  const generatedAt = requireIsoTimestamp(payload.generatedAt, `BenchLM ${artifact}.generatedAt`);
  if (!Array.isArray(payload.items)) fail(`BenchLM ${artifact}.items must be an array`);
  return {
    schemaVersion: '1.0',
    generatedAt,
    items: payload.items,
    fixtureMetadata: parseFixtureMetadata(payload.tokenbenchFixtureMetadata, `BenchLM ${artifact}`),
  };
}

function sourceRecord(artifact: ArtifactName, payload: ArtifactPayload, observedAt: string): BenchmarkSourceRecord {
  return {
    sourceId: 'benchlm',
    artifactId: artifact,
    sourceUrl: ARTIFACT_URLS[artifact],
    observedAt,
    etag: payload.fixtureMetadata.etag,
    lastModified: payload.fixtureMetadata.lastModified,
    upstreamRevision: payload.generatedAt,
    schemaVersion: payload.schemaVersion,
    snapshotKey: `benchmarks/benchlm/${artifact}/projected/${payload.fixtureMetadata.projectedSha256}.json`,
    contentHash: `sha256:${payload.fixtureMetadata.projectedSha256}`,
    originalContentHash: `sha256:${payload.fixtureMetadata.originalSha256}`,
    licenseId: 'MIT',
    attributionText: 'Data from BenchLM.ai',
  };
}

function requireSourceType(value: unknown, label: string): BenchmarkModel['sourceType'] {
  if (value === 'Proprietary' || value === 'Open Weight' || value === 'Unknown') return value;
  if (value === 'Pending') return 'Unknown';
  fail(`${label} must be Proprietary, Open Weight, Unknown, or Pending`);
}

function requireEvidenceStatus(value: unknown, label: string): EvidenceStatus {
  if (value === null) return 'source_only';
  if (value === 'supported' || value === 'estimated' || value === 'source_only') return value;
  fail(`${label} must be supported, estimated, source_only, or null`);
}

function parseBooleanMap(value: unknown, label: string): Record<string, boolean> {
  if (value === null || value === undefined) return {};
  const map = requireRecord(value, label);
  return Object.fromEntries(Object.entries(map).map(([key, entry]) => [key, requireBoolean(entry, `${label}.${key}`)]));
}

function parseScoreMap(value: unknown, label: string): Record<string, number | null> {
  if (value === null || value === undefined) return {};
  const map = requireRecord(value, label);
  return Object.fromEntries(Object.entries(map).map(([key, entry]) => [key, requireNullableScore(entry, `${label}.${key}`)]));
}

function parseSafeModel(value: unknown, index: number): SafeModelInput {
  const model = requireRecord(value, `BenchLM models.items[${index}]`);
  const sourceModelId = requireString(model.canonicalModelKey, `BenchLM models.items[${index}].canonicalModelKey`);
  const ranking = requireRecord(model.ranking, `BenchLM models.items[${index}].ranking`);
  const coverage = requireRecord(model.coverage, `BenchLM models.items[${index}].coverage`);
  const scores = requireRecord(model.scores, `BenchLM models.items[${index}].scores`);
  const evidenceStatus = requireEvidenceStatus(model.evidenceStatus, `BenchLM models.items[${index}].evidenceStatus`);

  return {
    sourceModelId,
    modelKey: resolvedModelKey('benchlm', sourceModelId),
    slug: requireString(model.slug, `BenchLM models.items[${index}].slug`),
    name: requireString(model.model, `BenchLM models.items[${index}].model`),
    creator: requireString(model.creator, `BenchLM models.items[${index}].creator`),
    sourceType: requireSourceType(model.sourceType, `BenchLM models.items[${index}].sourceType`),
    reasoningType: requireNullableString(model.reasoningType, `BenchLM models.items[${index}].reasoningType`),
    releaseDate: requireNullableString(model.releaseDate, `BenchLM models.items[${index}].releaseDate`),
    contextWindowTokens: nullablePositiveInteger(model.contextWindowTokens, `BenchLM models.items[${index}].contextWindowTokens`),
    evidenceStatus,
    rankingEligible: requireBoolean(model.rankingEligible, `BenchLM models.items[${index}].rankingEligible`),
    categoryRankingEligible: parseBooleanMap(
      ranking.categoryRankingEligible,
      `BenchLM models.items[${index}].ranking.categoryRankingEligible`,
    ),
    trustedBenchmarkCount: requireNonNegativeInteger(
      coverage.trustedBenchmarkCount,
      `BenchLM models.items[${index}].coverage.trustedBenchmarkCount`,
    ),
    rawOverallScore: requireNullableScore(scores.rawOverallScore, `BenchLM models.items[${index}].scores.rawOverallScore`),
    displayCategoryScores: parseScoreMap(
      scores.displayCategoryScores,
      `BenchLM models.items[${index}].scores.displayCategoryScores`,
    ),
    verifiedDisplayCategoryScores: parseScoreMap(
      scores.verifiedDisplayCategoryScores,
      `BenchLM models.items[${index}].scores.verifiedDisplayCategoryScores`,
    ),
  };
}

function definitionContainsProhibitedData(definition: Record<string, unknown>): boolean {
  const benchmarkKey = definition.benchmarkKey;
  if (typeof benchmarkKey === 'string' && (/^aa/i.test(benchmarkKey.trim()) || /^artificialanalysis$/i.test(benchmarkKey.trim()))) {
    return true;
  }

  const containsProhibitedText = (value: unknown): boolean => {
    if (typeof value === 'string') return /artificial\s*[-_]?\s*analysis/i.test(value);
    if (Array.isArray(value)) return value.some(containsProhibitedText);
    if (isRecord(value)) return Object.values(value).some(containsProhibitedText);
    return false;
  };
  return containsProhibitedText(definition);
}

function safeBenchmarkCategories(items: unknown[]): Set<string> {
  const categories = new Set<string>();
  items.forEach((value, index) => {
    const definition = requireRecord(value, `BenchLM benchmarks.items[${index}]`);
    const weight = definition.weight;
    if (weight !== null && (typeof weight !== 'number' || !Number.isFinite(weight))) {
      fail(`BenchLM benchmarks.items[${index}].weight must be a finite number or null`);
    }
    if (definitionContainsProhibitedData(definition)) {
      if (weight !== null && weight !== 0) {
        fail('BenchLM prohibited benchmark definition has a non-zero weight');
      }
      return;
    }
    const category = requireString(definition.category, `BenchLM benchmarks.items[${index}].category`);
    requireString(definition.benchmarkKey, `BenchLM benchmarks.items[${index}].benchmarkKey`);
    if (category !== 'external') categories.add(category);
  });
  return categories;
}

function toBenchmarkModels(models: SafeModelInput[]): BenchmarkModel[] {
  return models.map((model) => ({
    modelKey: model.modelKey,
    slug: model.slug,
    name: model.name,
    creator: model.creator,
    sourceType: model.sourceType,
    reasoningType: model.reasoningType,
    releaseDate: model.releaseDate,
    contextWindowTokens: model.contextWindowTokens,
    evidenceStatus: model.evidenceStatus,
    rankingEligible: model.evidenceStatus === 'supported' && model.rankingEligible && model.rawOverallScore !== null,
    confidenceLower: null,
    confidenceUpper: null,
    benchmarkCount: model.trustedBenchmarkCount,
    sourceId: 'benchlm',
    sourceModelId: model.sourceModelId,
    sourceArtifactId: 'models',
  }));
}

function toMetrics(models: SafeModelInput[], safeCategories: Set<string>, generatedAt: string): BenchmarkMetric[] {
  const metrics: BenchmarkMetric[] = [];
  models.forEach((model) => {
    const modelRankingEligible = model.evidenceStatus === 'supported' && model.rankingEligible && model.rawOverallScore !== null;
    if (model.rawOverallScore !== null) {
      metrics.push({
        modelKey: model.modelKey,
        metricKey: 'benchlm:overall:raw',
        category: 'overall',
        value: model.rawOverallScore,
        rank: null,
        lower: null,
        upper: null,
        voteCount: null,
        unit: 'score',
        sourceId: 'benchlm',
        sourceUpdatedAt: generatedAt,
        sourceModelId: model.sourceModelId,
        sourceArtifactId: 'models',
        rankingEligible: modelRankingEligible,
        methodology: 'benchlm_raw_composite',
        observationCount: null,
        sessionCount: null,
      });
    }

    const categories = new Set([
      ...Object.keys(model.displayCategoryScores),
      ...Object.keys(model.verifiedDisplayCategoryScores),
    ]);
    categories.forEach((category) => {
      if (!safeCategories.has(category)) return;
      const value = model.verifiedDisplayCategoryScores[category] ?? model.displayCategoryScores[category] ?? null;
      if (value === null) return;
      metrics.push({
        modelKey: model.modelKey,
        metricKey: `benchlm:category:${category}`,
        category,
        value,
        rank: null,
        lower: null,
        upper: null,
        voteCount: null,
        unit: 'score',
        sourceId: 'benchlm',
        sourceUpdatedAt: generatedAt,
        sourceModelId: model.sourceModelId,
        sourceArtifactId: 'models',
        rankingEligible: model.evidenceStatus === 'supported' && model.categoryRankingEligible[category] === true,
        methodology: 'benchlm_raw_composite',
        observationCount: null,
        sessionCount: null,
      });
    });
  });
  return metrics;
}

function normalizeProviderId(creator: string): string {
  const normalized = creator.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'benchlm';
}

function toPriceChecks(items: unknown[], modelsBySourceId: Map<string, SafeModelInput>): BenchmarkPriceCheck[] {
  const priceChecks: BenchmarkPriceCheck[] = [];
  items.forEach((value, index) => {
    const pricing = requireRecord(value, `BenchLM pricing.items[${index}]`);
    const sourceModelId = requireString(pricing.canonicalModelKey, `BenchLM pricing.items[${index}].canonicalModelKey`);
    const model = modelsBySourceId.get(sourceModelId);
    if (!model) return;

    const inputUsdPerMillion = requireNullableScore(pricing.inputPrice, `BenchLM pricing.items[${index}].inputPrice`);
    const cachedInputUsdPerMillion = requireNullableScore(pricing.cachedInputPrice, `BenchLM pricing.items[${index}].cachedInputPrice`);
    const outputUsdPerMillion = requireNullableScore(pricing.outputPrice, `BenchLM pricing.items[${index}].outputPrice`);
    if (inputUsdPerMillion === null && cachedInputUsdPerMillion === null && outputUsdPerMillion === null) return;

    priceChecks.push({
      modelKey: model.modelKey,
      sourceId: 'benchlm',
      providerId: normalizeProviderId(model.creator),
      inputUsdPerMillion,
      cachedInputUsdPerMillion,
      outputUsdPerMillion,
      contextWindowTokens: nullablePositiveInteger(pricing.contextWindowTokens, `BenchLM pricing.items[${index}].contextWindowTokens`),
      verificationStatus: 'primary',
      routeId: `benchlm:${sourceModelId}`,
      sourceModelId,
      canonicalSlug: model.slug,
      maxInputTokens: null,
      maxOutputTokens: null,
      inputModalities: null,
      outputModalities: null,
      supportedParameters: null,
      sourceArtifactId: 'pricing',
    });
  });
  return priceChecks;
}

function toComparisonSeeds(items: unknown[], modelsBySourceId: Map<string, SafeModelInput>): ComparisonSeed[] {
  const seeds: ComparisonSeed[] = [];
  const seenPairs = new Set<string>();
  items.forEach((value, index) => {
    const comparison = requireRecord(value, `BenchLM comparisons.items[${index}]`);
    const modelA = requireRecord(comparison.modelA, `BenchLM comparisons.items[${index}].modelA`);
    const modelB = requireRecord(comparison.modelB, `BenchLM comparisons.items[${index}].modelB`);
    const sourceModelAId = requireString(modelA.canonicalModelKey, `BenchLM comparisons.items[${index}].modelA.canonicalModelKey`);
    const sourceModelBId = requireString(modelB.canonicalModelKey, `BenchLM comparisons.items[${index}].modelB.canonicalModelKey`);
    const first = modelsBySourceId.get(sourceModelAId);
    const second = modelsBySourceId.get(sourceModelBId);
    if (!first || !second || first.modelKey === second.modelKey) return;

    const [modelARecord, modelBRecord] = first.modelKey < second.modelKey ? [first, second] : [second, first];
    const pairIdentity = `${modelARecord.modelKey}\u0000${modelBRecord.modelKey}`;
    if (seenPairs.has(pairIdentity)) return;
    seenPairs.add(pairIdentity);
    seeds.push({
      pairSlug: `${modelARecord.slug}-vs-${modelBRecord.slug}`,
      modelAKey: modelARecord.modelKey,
      modelBKey: modelBRecord.modelKey,
      sourceId: 'benchlm',
      sourceArtifactId: 'comparisons',
      sourceModelAId: modelARecord.sourceModelId,
      sourceModelBId: modelBRecord.sourceModelId,
      featuredRank: index + 1,
    });
  });
  return seeds;
}

/**
 * Converts BenchLM's volatile export bundle into a persistence-safe, source-linked
 * batch. Only the documented allowlist is read from model rows; calibrated scores,
 * ranks, intervals, external groups, and speed evidence never enter the result.
 */
export function parseBenchLm(payloads: BenchLmPayloads, observedAt: string): NormalizedSourceBatch {
  if (!isRecord(payloads)) fail('BenchLM payloads must be an object');
  if (Object.prototype.hasOwnProperty.call(payloads, 'speed')) fail('BenchLM speed.json is prohibited');
  requireIsoTimestamp(observedAt, 'BenchLM observedAt');

  const artifacts = Object.fromEntries(ARTIFACTS.map((artifact) => [artifact, parseArtifact(payloads[artifact], artifact)])) as Record<ArtifactName, ArtifactPayload>;
  const generatedAt = artifacts.leaderboard.generatedAt;
  ARTIFACTS.forEach((artifact) => {
    if (artifacts[artifact].generatedAt !== generatedAt) {
      fail('BenchLM artifact generatedAt values must match');
    }
  });

  const safeModels = artifacts.models.items.map((model, index) => parseSafeModel(model, index));
  const modelsBySourceId = new Map(safeModels.map((model) => [model.sourceModelId, model]));
  if (modelsBySourceId.size !== safeModels.length) fail('BenchLM models must not duplicate canonicalModelKey');

  const batch: NormalizedSourceBatch = {
    sources: ARTIFACTS.map((artifact) => sourceRecord(artifact, artifacts[artifact], observedAt)),
    models: toBenchmarkModels(safeModels),
    metrics: toMetrics(safeModels, safeBenchmarkCategories(artifacts.benchmarks.items), generatedAt),
    priceChecks: toPriceChecks(artifacts.pricing.items, modelsBySourceId),
    comparisonSeeds: toComparisonSeeds(artifacts.comparisons.items, modelsBySourceId),
  };
  return validateNormalizedSourceBatch(batch);
}
