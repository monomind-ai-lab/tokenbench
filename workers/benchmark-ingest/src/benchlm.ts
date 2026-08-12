import {
  type BenchmarkMetric,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type BenchmarkSourceRecord,
  type ComparisonSeed,
  type EvidenceStatus,
  type NormalizedSourceBatch,
  compareUtf8Binary,
  validateNormalizedSourceBatch,
} from '../../../src/benchmarks/contracts';
import { resolvedModelKey } from '../../../src/benchmarks/model-aliases';
import {
  joinPublicLeaderboardScores,
  parseBenchLmPublicLeaderboard,
  type BenchLmPublicLeaderboard,
  type PublicBenchLmScore,
} from './benchlm-public-leaderboard';

const ARTIFACTS = ['leaderboard', 'models', 'pricing', 'comparisons', 'benchmarks', 'public-leaderboard'] as const;

type ArtifactName = typeof ARTIFACTS[number];

const ARTIFACT_URLS: Record<ArtifactName, string> = {
  leaderboard: 'https://benchlm.ai/data/leaderboard.json',
  models: 'https://benchlm.ai/data/models.json',
  pricing: 'https://benchlm.ai/data/pricing.json',
  comparisons: 'https://benchlm.ai/data/comparisons.json',
  benchmarks: 'https://benchlm.ai/data/benchmarks.json',
  'public-leaderboard': 'https://benchlm.ai/api/data/leaderboard?mode=bench-align-v5&limit=100',
};

export interface BenchLmTransportHeaders {
  etag: string | null;
  lastModified: string | null;
}

export interface RawBenchLmArtifact {
  bytes: Uint8Array;
  headers: BenchLmTransportHeaders;
}

export type RawBenchLmPayloads = Record<ArtifactName, RawBenchLmArtifact>;

export interface BenchLmProjectedPayload {
  schemaVersion: string;
  generatedAt: string;
  items: unknown[];
  upstreamRevision?: string;
  methodologyVersion?: string;
  approvedSnapshotId?: string | null;
}

export interface PreparedBenchLmArtifact {
  readonly payload: BenchLmProjectedPayload;
  readonly projectedBytes: Uint8Array;
  readonly projectedSha256: string;
  readonly originalSha256: string;
  readonly headers: Readonly<BenchLmTransportHeaders>;
}

export type PreparedBenchLmPayloads = Readonly<Record<ArtifactName, PreparedBenchLmArtifact>>;

export interface StoredBenchLmProjectionArtifact {
  readonly projectedBytes: Uint8Array;
  readonly projectedSha256: string;
  readonly originalSha256: string;
  readonly headers: Readonly<BenchLmTransportHeaders>;
}

export type StoredBenchLmProjections = Readonly<Record<ArtifactName, StoredBenchLmProjectionArtifact>>;
export type BenchLmPreparationInput = RawBenchLmArtifact | StoredBenchLmProjectionArtifact;
export type BenchLmPreparationInputs = Readonly<Record<ArtifactName, BenchLmPreparationInput>>;

interface PreparedArtifactState {
  artifact: PreparedBenchLmArtifact;
  payload: BenchLmProjectedPayload;
  projectedBytes: Uint8Array;
  projectedJson: string;
}

interface PreparedBundleState {
  artifacts: Record<ArtifactName, PreparedArtifactState>;
}

const preparedBundles = new WeakMap<object, PreparedBundleState>();

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
  /** Public BenchAlign overall value (`scores.displayScore`). */
  displayScore: number | null;
  /** Diagnostic raw composite (`scores.rawOverallScore`); never the public value. */
  rawOverallScore: number | null;
  /** Published overall rank (`ranking.overallRank`) or null. */
  overallRank: number | null;
  /** Published category ranks (`ranking.categoryRanks`), sparse; absent = null. */
  categoryRanks: Record<string, number | null>;
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

function parseArtifact(value: unknown, artifact: ArtifactName): BenchLmProjectedPayload {
  if (artifact === 'public-leaderboard') return parsePublicLeaderboardProjection(value);
  const payload = requireRecord(value, `BenchLM ${artifact}`);
  if (payload.schemaVersion !== '1.0') fail(`BenchLM ${artifact} schemaVersion must be 1.0`);
  const generatedAt = requireIsoTimestamp(payload.generatedAt, `BenchLM ${artifact}.generatedAt`);
  if (!Array.isArray(payload.items)) fail(`BenchLM ${artifact}.items must be an array`);
  return {
    schemaVersion: '1.0',
    generatedAt,
    items: payload.items,
  };
}

function publicLeaderboardFromProjection(payload: BenchLmProjectedPayload): BenchLmPublicLeaderboard {
  return parseBenchLmPublicLeaderboard({
    lastUpdated: payload.generatedAt.slice(0, 10),
    mode: 'bench-align-v5',
    methodologyVersion: payload.methodologyVersion,
    sourceSnapshotId: payload.upstreamRevision,
    approvedSnapshotId: payload.approvedSnapshotId ?? null,
    models: payload.items,
  });
}

function parsePublicLeaderboardProjection(value: unknown): BenchLmProjectedPayload {
  const payload = requireRecord(value, 'BenchLM public-leaderboard');
  const parsed = payload.schemaVersion === 'bench-align-v5'
    ? parseBenchLmPublicLeaderboard({
      lastUpdated: requireIsoTimestamp(payload.generatedAt, 'BenchLM public-leaderboard.generatedAt').slice(0, 10),
      mode: 'bench-align-v5',
      methodologyVersion: payload.methodologyVersion,
      sourceSnapshotId: payload.upstreamRevision,
      approvedSnapshotId: payload.approvedSnapshotId ?? null,
      models: payload.items,
    })
    : parseBenchLmPublicLeaderboard(value);
  return {
    schemaVersion: 'bench-align-v5',
    generatedAt: `${parsed.lastUpdated}T00:00:00.000Z`,
    upstreamRevision: parsed.sourceSnapshotId,
    methodologyVersion: parsed.methodologyVersion,
    approvedSnapshotId: parsed.approvedSnapshotId,
    items: [...parsed.models],
  };
}

function sourceRecord(
  artifact: ArtifactName,
  prepared: PreparedBenchLmArtifact,
  observedAt: string,
): BenchmarkSourceRecord {
  return {
    sourceId: 'benchlm',
    artifactId: artifact,
    sourceUrl: ARTIFACT_URLS[artifact],
    observedAt,
    etag: prepared.headers.etag,
    lastModified: prepared.headers.lastModified,
    upstreamRevision: prepared.payload.upstreamRevision ?? prepared.payload.generatedAt,
    schemaVersion: prepared.payload.methodologyVersion ?? prepared.payload.schemaVersion,
    snapshotKey: `benchmarks/benchlm/${artifact}/projected/${prepared.projectedSha256}.json`,
    contentHash: `sha256:${prepared.projectedSha256}`,
    originalContentHash: `sha256:${prepared.originalSha256}`,
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
    displayScore: requireNullableScore(scores.displayScore, `BenchLM models.items[${index}].scores.displayScore`),
    rawOverallScore: requireNullableScore(scores.rawOverallScore, `BenchLM models.items[${index}].scores.rawOverallScore`),
    overallRank: nullablePositiveInteger(ranking.overallRank, `BenchLM models.items[${index}].ranking.overallRank`),
    categoryRanks: parseScoreMap(
      ranking.categoryRanks,
      `BenchLM models.items[${index}].ranking.categoryRanks`,
    ),
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

function isExternalCategory(category: string): boolean {
  return category
    .normalize('NFKC')
    .replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}]/gu, '')
    .toLowerCase() === 'external';
}

function sortedBooleanMap(value: unknown, label: string): Record<string, boolean> {
  const parsed = parseBooleanMap(value, label);
  return Object.fromEntries(
    Object.entries(parsed)
      .filter(([category]) => !isExternalCategory(category))
      .sort(([left], [right]) => compareUtf8Binary(left, right)),
  );
}

function sortedScoreMap(value: unknown, label: string): Record<string, number | null> {
  const parsed = parseScoreMap(value, label);
  return Object.fromEntries(
    Object.entries(parsed)
      .filter(([category]) => !isExternalCategory(category))
      .sort(([left], [right]) => compareUtf8Binary(left, right)),
  );
}

function projectLeaderboardItem(value: unknown, index: number): Record<string, unknown> {
  const label = `BenchLM leaderboard.items[${index}]`;
  const model = requireRecord(value, label);
  requireSourceType(model.sourceType, `${label}.sourceType`);
  requireEvidenceStatus(model.evidenceStatus, `${label}.evidenceStatus`);
  return {
    canonicalModelKey: requireString(model.canonicalModelKey, `${label}.canonicalModelKey`),
    slug: requireString(model.slug, `${label}.slug`),
    model: requireString(model.model, `${label}.model`),
    creator: requireString(model.creator, `${label}.creator`),
    sourceType: model.sourceType,
    reasoningType: requireNullableString(model.reasoningType, `${label}.reasoningType`),
    contextWindowTokens: nullablePositiveInteger(model.contextWindowTokens, `${label}.contextWindowTokens`),
    evidenceStatus: model.evidenceStatus,
    rankingEligible: requireBoolean(model.rankingEligible, `${label}.rankingEligible`),
  };
}

function projectModelItem(value: unknown, index: number): Record<string, unknown> {
  const label = `BenchLM models.items[${index}]`;
  const model = requireRecord(value, label);
  const ranking = requireRecord(model.ranking, `${label}.ranking`);
  const coverage = requireRecord(model.coverage, `${label}.coverage`);
  const scores = requireRecord(model.scores, `${label}.scores`);
  requireSourceType(model.sourceType, `${label}.sourceType`);
  requireEvidenceStatus(model.evidenceStatus, `${label}.evidenceStatus`);
  return {
    canonicalModelKey: requireString(model.canonicalModelKey, `${label}.canonicalModelKey`),
    slug: requireString(model.slug, `${label}.slug`),
    model: requireString(model.model, `${label}.model`),
    creator: requireString(model.creator, `${label}.creator`),
    sourceType: model.sourceType,
    reasoningType: requireNullableString(model.reasoningType, `${label}.reasoningType`),
    releaseDate: requireNullableString(model.releaseDate, `${label}.releaseDate`),
    contextWindowTokens: nullablePositiveInteger(model.contextWindowTokens, `${label}.contextWindowTokens`),
    evidenceStatus: model.evidenceStatus,
    rankingEligible: requireBoolean(model.rankingEligible, `${label}.rankingEligible`),
    ranking: {
      overallRank: nullablePositiveInteger(ranking.overallRank, `${label}.ranking.overallRank`),
      categoryRanks: sortedScoreMap(ranking.categoryRanks, `${label}.ranking.categoryRanks`),
      categoryRankingEligible: sortedBooleanMap(
        ranking.categoryRankingEligible,
        `${label}.ranking.categoryRankingEligible`,
      ),
    },
    coverage: {
      trustedBenchmarkCount: requireNonNegativeInteger(
        coverage.trustedBenchmarkCount,
        `${label}.coverage.trustedBenchmarkCount`,
      ),
    },
    scores: {
      displayScore: requireNullableScore(scores.displayScore, `${label}.scores.displayScore`),
      rawOverallScore: requireNullableScore(scores.rawOverallScore, `${label}.scores.rawOverallScore`),
      displayCategoryScores: sortedScoreMap(
        scores.displayCategoryScores,
        `${label}.scores.displayCategoryScores`,
      ),
      verifiedDisplayCategoryScores: sortedScoreMap(
        scores.verifiedDisplayCategoryScores,
        `${label}.scores.verifiedDisplayCategoryScores`,
      ),
    },
  };
}

function projectPricingItem(value: unknown, index: number): Record<string, unknown> {
  const label = `BenchLM pricing.items[${index}]`;
  const pricing = requireRecord(value, label);
  requireSourceType(pricing.sourceType, `${label}.sourceType`);
  return {
    canonicalModelKey: requireString(pricing.canonicalModelKey, `${label}.canonicalModelKey`),
    slug: requireNullableString(pricing.slug, `${label}.slug`),
    model: requireString(pricing.model, `${label}.model`),
    creator: requireString(pricing.creator, `${label}.creator`),
    sourceType: pricing.sourceType,
    contextWindowTokens: nullablePositiveInteger(pricing.contextWindowTokens, `${label}.contextWindowTokens`),
    inputPrice: requireNullableScore(pricing.inputPrice, `${label}.inputPrice`),
    cachedInputPrice: requireNullableScore(pricing.cachedInputPrice, `${label}.cachedInputPrice`),
    outputPrice: requireNullableScore(pricing.outputPrice, `${label}.outputPrice`),
    hasNumericPricing: requireBoolean(pricing.hasNumericPricing, `${label}.hasNumericPricing`),
    isFreePricing: requireBoolean(pricing.isFreePricing, `${label}.isFreePricing`),
  };
}

function projectComparisonItem(value: unknown, index: number): Record<string, unknown> {
  const label = `BenchLM comparisons.items[${index}]`;
  const comparison = requireRecord(value, label);
  const modelA = requireRecord(comparison.modelA, `${label}.modelA`);
  const modelB = requireRecord(comparison.modelB, `${label}.modelB`);
  return {
    slug: requireString(comparison.slug, `${label}.slug`),
    modelA: {
      canonicalModelKey: requireString(modelA.canonicalModelKey, `${label}.modelA.canonicalModelKey`),
      slug: requireString(modelA.slug, `${label}.modelA.slug`),
    },
    modelB: {
      canonicalModelKey: requireString(modelB.canonicalModelKey, `${label}.modelB.canonicalModelKey`),
      slug: requireString(modelB.slug, `${label}.modelB.slug`),
    },
  };
}

function projectBenchmarkItem(value: unknown, index: number): Record<string, unknown> | null {
  const label = `BenchLM benchmarks.items[${index}]`;
  const definition = requireRecord(value, label);
  const weight = definition.weight;
  if (weight !== null && (typeof weight !== 'number' || !Number.isFinite(weight))) {
    fail(`${label}.weight must be a finite number or null`);
  }
  if (definitionContainsProhibitedData(definition)) {
    if (weight !== null && weight !== 0) {
      fail('BenchLM prohibited benchmark definition has a non-zero weight');
    }
    return null;
  }

  const category = requireString(definition.category, `${label}.category`);
  if (isExternalCategory(category)) return null;
  return {
    category,
    benchmarkKey: requireString(definition.benchmarkKey, `${label}.benchmarkKey`),
    weight,
  };
}

function projectArtifact(payload: BenchLmProjectedPayload, artifact: ArtifactName): BenchLmProjectedPayload {
  let items: Record<string, unknown>[];
  switch (artifact) {
    case 'leaderboard':
      items = payload.items.map(projectLeaderboardItem);
      break;
    case 'models':
      items = payload.items.map(projectModelItem);
      break;
    case 'pricing':
      items = payload.items.map(projectPricingItem);
      break;
    case 'comparisons':
      items = payload.items.map(projectComparisonItem);
      break;
    case 'benchmarks':
      items = payload.items
        .map(projectBenchmarkItem)
        .filter((item): item is Record<string, unknown> => item !== null);
      break;
    case 'public-leaderboard':
      items = publicLeaderboardFromProjection(payload).models.map((row) => ({
        rank: row.rank,
        model: row.model,
        creator: row.creator,
        sourceType: row.sourceType,
        overallScore: row.overallScore,
        categoryScores: row.categoryScores,
        evidenceStatus: row.evidenceStatus,
        methodologyVersion: row.methodologyVersion,
      }));
      break;
  }
  return {
    schemaVersion: payload.schemaVersion,
    generatedAt: payload.generatedAt,
    ...(payload.upstreamRevision ? { upstreamRevision: payload.upstreamRevision } : {}),
    ...(payload.methodologyVersion ? { methodologyVersion: payload.methodologyVersion } : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, 'approvedSnapshotId')
      ? { approvedSnapshotId: payload.approvedSnapshotId ?? null }
      : {}),
    items,
  };
}

function parseHeaders(value: unknown, artifact: ArtifactName): Readonly<BenchLmTransportHeaders> {
  const headers = requireRecord(value, `BenchLM ${artifact} transport headers`);
  if (!Object.prototype.hasOwnProperty.call(headers, 'etag') || !Object.prototype.hasOwnProperty.call(headers, 'lastModified')) {
    fail(`BenchLM ${artifact} transport headers must include etag and lastModified`);
  }
  return Object.freeze({
    etag: requireNullableString(headers.etag, `BenchLM ${artifact} transport headers.etag`),
    lastModified: requireNullableString(
      headers.lastModified,
      `BenchLM ${artifact} transport headers.lastModified`,
    ),
  });
}

function exactBytes(value: unknown, label: string): Uint8Array {
  if (!(value instanceof Uint8Array)) fail(`${label} must be a Uint8Array`);
  return new Uint8Array(value);
}

function decodeJson(bytes: Uint8Array, label: string): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} must be valid UTF-8`);
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`${label} must be valid JSON`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const stableBuffer = new Uint8Array(bytes).buffer;
  const digest = await crypto.subtle.digest('SHA-256', stableBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function requireSha256Hex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label} must be a lowercase SHA-256 hex digest`);
  }
  return value;
}

function byteArraysEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((byte, index) => byte === right[index]);
}

interface PreparedArtifactDraft {
  payload: BenchLmProjectedPayload;
  projectedBytes: Uint8Array;
  projectedJson: string;
  projectedSha256: string;
  originalSha256: string;
  headers: Readonly<BenchLmTransportHeaders>;
}

function registerPreparedBundle(drafts: Record<ArtifactName, PreparedArtifactDraft>): PreparedBenchLmPayloads {
  const stateArtifacts = {} as Record<ArtifactName, PreparedArtifactState>;
  const exposedArtifacts = {} as Record<ArtifactName, PreparedBenchLmArtifact>;
  for (const artifactName of ARTIFACTS) {
    const draft = drafts[artifactName];
    const payload = deepFreeze(draft.payload);
    const projectedBytes = new Uint8Array(draft.projectedBytes);
    const artifact = Object.freeze({
      payload,
      projectedBytes,
      projectedSha256: draft.projectedSha256,
      originalSha256: draft.originalSha256,
      headers: draft.headers,
    });
    exposedArtifacts[artifactName] = artifact;
    stateArtifacts[artifactName] = {
      artifact,
      payload,
      projectedBytes: new Uint8Array(projectedBytes),
      projectedJson: draft.projectedJson,
    };
  }
  const prepared = Object.freeze(exposedArtifacts);
  preparedBundles.set(prepared, { artifacts: stateArtifacts });
  return prepared;
}

function canonicalProjection(value: unknown, artifact: ArtifactName): {
  payload: BenchLmProjectedPayload;
  bytes: Uint8Array;
  json: string;
} {
  const parsed = parseArtifact(value, artifact);
  const projection = projectArtifact(parsed, artifact);
  const json = JSON.stringify(projection);
  const bytes = new TextEncoder().encode(json);
  return {
    payload: JSON.parse(json) as BenchLmProjectedPayload,
    bytes,
    json,
  };
}

/**
 * Projects exact upstream response bytes into the only BenchLM representation
 * permitted for R2 and normalization. Upstream JSON metadata is never trusted.
 */
async function prepareRawArtifact(
  value: Record<string, unknown>,
  artifact: ArtifactName,
): Promise<PreparedArtifactDraft> {
  const rawBytes = exactBytes(value.bytes, `BenchLM raw ${artifact}.bytes`);
  const headers = parseHeaders(value.headers, artifact);
  const canonical = canonicalProjection(decodeJson(rawBytes, `BenchLM raw ${artifact}.bytes`), artifact);
  return {
    payload: canonical.payload,
    projectedBytes: canonical.bytes,
    projectedJson: canonical.json,
    projectedSha256: await sha256Hex(canonical.bytes),
    originalSha256: await sha256Hex(rawBytes),
    headers,
  };
}

/**
 * Rehydrates an immutable projection from trusted R2/source metadata. The exact
 * stored bytes are re-hashed and must already be the canonical safe projection.
 */
async function rehydrateStoredArtifact(
  value: Record<string, unknown>,
  artifact: ArtifactName,
): Promise<PreparedArtifactDraft> {
  const projectedBytes = exactBytes(value.projectedBytes, `BenchLM stored ${artifact}.projectedBytes`);
  const projectedSha256 = requireSha256Hex(value.projectedSha256, `BenchLM stored ${artifact}.projectedSha256`);
  const originalSha256 = requireSha256Hex(value.originalSha256, `BenchLM stored ${artifact}.originalSha256`);
  const headers = parseHeaders(value.headers, artifact);
  const canonical = canonicalProjection(decodeJson(projectedBytes, `BenchLM stored ${artifact}.projectedBytes`), artifact);
  if (!byteArraysEqual(projectedBytes, canonical.bytes)) {
    fail(`BenchLM stored ${artifact} projected bytes are not the canonical safe projection`);
  }
  if (await sha256Hex(projectedBytes) !== projectedSha256) {
    fail(`BenchLM stored ${artifact} projected content hash does not match its exact bytes`);
  }
  return {
    payload: canonical.payload,
    projectedBytes,
    projectedJson: canonical.json,
    projectedSha256,
    originalSha256,
    headers,
  };
}

async function prepareBenchLmInputs(
  payloads: BenchLmPreparationInputs,
  label: 'raw payloads' | 'stored projections' | 'mixed inputs',
): Promise<PreparedBenchLmPayloads> {
  if (!isRecord(payloads)) fail(`BenchLM ${label} must be an object`);
  if (Object.prototype.hasOwnProperty.call(payloads, 'speed')) fail('BenchLM speed.json is prohibited');
  const draftEntries = await Promise.all(ARTIFACTS.map(async (artifact) => {
    const value = requireRecord(payloads[artifact], `BenchLM ${label} ${artifact}`);
    const hasRawBytes = Object.prototype.hasOwnProperty.call(value, 'bytes');
    const hasStoredBytes = Object.prototype.hasOwnProperty.call(value, 'projectedBytes');
    if (hasRawBytes === hasStoredBytes) {
      fail(`BenchLM ${label} ${artifact} must be exactly one raw or immutable stored artifact`);
    }
    return [artifact, hasRawBytes
      ? await prepareRawArtifact(value, artifact)
      : await rehydrateStoredArtifact(value, artifact)] as const;
  }));
  return registerPreparedBundle(Object.fromEntries(draftEntries) as Record<ArtifactName, PreparedArtifactDraft>);
}

/**
 * Projects exact upstream response bytes into the only BenchLM representation
 * permitted for R2 and normalization. Upstream JSON metadata is never trusted.
 */
export async function prepareBenchLm(rawPayloads: RawBenchLmPayloads): Promise<PreparedBenchLmPayloads> {
  return prepareBenchLmInputs(rawPayloads, 'raw payloads');
}

/**
 * Rehydrates immutable projections and fresh raw artifacts as one verified
 * bundle. parseBenchLm subsequently verifies the common generatedAt value.
 */
export async function prepareBenchLmMixed(
  payloads: BenchLmPreparationInputs,
): Promise<PreparedBenchLmPayloads> {
  return prepareBenchLmInputs(payloads, 'mixed inputs');
}

/**
 * Rehydrates an immutable projection from trusted R2/source metadata. The exact
 * stored bytes are re-hashed and must already be the canonical safe projection.
 */
export async function rehydrateBenchLmProjections(
  storedPayloads: StoredBenchLmProjections,
): Promise<PreparedBenchLmPayloads> {
  return prepareBenchLmInputs(storedPayloads, 'stored projections');
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
    if (!isExternalCategory(category)) categories.add(category);
  });
  return categories;
}

function toBenchmarkModels(
  models: SafeModelInput[],
  publicScores: ReadonlyMap<string, PublicBenchLmScore>,
): BenchmarkModel[] {
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
    rankingEligible: model.evidenceStatus === 'supported'
      && model.rankingEligible
      && publicScores.get(model.modelKey)?.evidenceStatus === 'supported',
    confidenceLower: null,
    confidenceUpper: null,
    benchmarkCount: model.trustedBenchmarkCount,
    sourceId: 'benchlm',
    sourceModelId: model.sourceModelId,
    sourceArtifactId: 'models',
  }));
}

function toMetrics(
  models: SafeModelInput[],
  publicScores: ReadonlyMap<string, PublicBenchLmScore>,
  safeCategories: Set<string>,
  generatedAt: string,
): BenchmarkMetric[] {
  const metrics: BenchmarkMetric[] = [];
  models.forEach((model) => {
    const publicScore = publicScores.get(model.modelKey);
    if (!publicScore) return;
    const modelRankingEligible = model.evidenceStatus === 'supported'
      && model.rankingEligible
      && publicScore.evidenceStatus === 'supported';
    // Public overall value is the BenchAlign display score; the raw composite
    // remains available only as a disclosed diagnostic (rawValue). The overall
    // raw diagnostics must never become the public value when upstream does
    // not publish a display score.
    const overallValue = publicScore.overallScore;
    if (overallValue !== null) {
      metrics.push({
        modelKey: model.modelKey,
        metricKey: 'benchlm:overall:raw',
        category: 'overall',
        value: overallValue,
        rawValue: model.rawOverallScore,
        rank: publicScore.overallRank,
        lower: null,
        upper: null,
        voteCount: null,
        unit: 'score',
        sourceId: 'benchlm',
        sourceUpdatedAt: generatedAt,
        sourceModelId: model.sourceModelId,
        sourceArtifactId: 'public-leaderboard',
        rankingEligible: modelRankingEligible,
        methodology: 'benchlm_raw_composite',
        observationCount: null,
        sessionCount: null,
      });
    }

    const categories = new Set([
      ...Object.keys(publicScore.categoryScores),
    ]);
    categories.forEach((category) => {
      if (!safeCategories.has(category)) return;
      // The public category value is the display score. verifiedDisplayCategoryScores
      // did not replace it, and category ranks are preserved exactly when published.
      const value = publicScore.categoryScores[category] ?? null;
      if (value === null) return;
      metrics.push({
        modelKey: model.modelKey,
        metricKey: `benchlm:category:${category}`,
        category,
        value,
        rawValue: null,
        rank: publicScore.categoryRanks[category] ?? null,
        lower: null,
        upper: null,
        voteCount: null,
        unit: 'score',
        sourceId: 'benchlm',
        sourceUpdatedAt: generatedAt,
        sourceModelId: model.sourceModelId,
        sourceArtifactId: 'public-leaderboard',
        rankingEligible: model.evidenceStatus === 'supported'
          && publicScore.evidenceStatus === 'supported'
          && model.categoryRankingEligible[category] === true,
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

    const [modelARecord, modelBRecord] = compareUtf8Binary(first.modelKey, second.modelKey) < 0 ? [first, second] : [second, first];
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

async function verifyPreparedBundle(payloads: PreparedBenchLmPayloads): Promise<{
  artifacts: Record<ArtifactName, BenchLmProjectedPayload>;
  prepared: PreparedBenchLmPayloads;
}> {
  if (!isRecord(payloads)) fail('BenchLM prepared payloads must be an object');
  const state = preparedBundles.get(payloads);
  if (!state) fail('BenchLM payloads must be created by a verified preparation boundary');

  const verifiedEntries = await Promise.all(ARTIFACTS.map(async (artifactName) => {
    const artifact = payloads[artifactName];
    const artifactState = state.artifacts[artifactName];
    if (artifact !== artifactState.artifact || artifact.payload !== artifactState.payload) {
      fail(`BenchLM ${artifactName} provenance does not match its prepared representation`);
    }

    const stableBytes = exactBytes(artifact.projectedBytes, `BenchLM prepared ${artifactName}.projectedBytes`);
    const computedHash = await sha256Hex(stableBytes);
    if (computedHash !== artifact.projectedSha256) {
      fail(`BenchLM prepared ${artifactName} projected content hash does not match its exact bytes`);
    }
    if (!byteArraysEqual(stableBytes, artifact.projectedBytes)
      || !byteArraysEqual(stableBytes, artifactState.projectedBytes)) {
      fail(`BenchLM prepared ${artifactName} projected bytes changed after verification`);
    }

    const canonical = canonicalProjection(
      decodeJson(stableBytes, `BenchLM prepared ${artifactName}.projectedBytes`),
      artifactName,
    );
    if (!byteArraysEqual(stableBytes, canonical.bytes)
      || canonical.json !== artifactState.projectedJson
      || JSON.stringify(artifact.payload) !== canonical.json) {
      fail(`BenchLM prepared ${artifactName} projected bytes are not the verified canonical projection`);
    }
    if (artifact.projectedSha256 !== artifactState.artifact.projectedSha256
      || artifact.originalSha256 !== artifactState.artifact.originalSha256
      || artifact.headers !== artifactState.artifact.headers) {
      fail(`BenchLM ${artifactName} provenance changed after preparation`);
    }
    return [artifactName, canonical.payload] as const;
  }));
  return {
    artifacts: Object.fromEntries(verifiedEntries) as Record<ArtifactName, BenchLmProjectedPayload>,
    prepared: payloads,
  };
}

/**
 * Converts a cryptographically verified BenchLM projection into a source-linked
 * batch. Every projected hash is recomputed from exact bytes immediately before
 * normalization; calibrated scores, ranks, intervals, external groups, and speed
 * evidence never enter the result.
 */
export async function parseBenchLm(
  payloads: PreparedBenchLmPayloads,
  observedAt: string,
): Promise<NormalizedSourceBatch> {
  requireIsoTimestamp(observedAt, 'BenchLM observedAt');
  const { artifacts, prepared } = await verifyPreparedBundle(payloads);
  const generatedAt = artifacts.leaderboard.generatedAt;
  ARTIFACTS.filter((artifact) => artifact !== 'public-leaderboard').forEach((artifact) => {
    if (artifacts[artifact].generatedAt !== generatedAt) {
      fail('BenchLM artifact generatedAt values must match');
    }
  });

  const safeModels = artifacts.models.items.map((model, index) => parseSafeModel(model, index));
  const modelsBySourceId = new Map(safeModels.map((model) => [model.sourceModelId, model]));
  if (modelsBySourceId.size !== safeModels.length) fail('BenchLM models must not duplicate canonicalModelKey');
  const publicLeaderboard = publicLeaderboardFromProjection(artifacts['public-leaderboard']);
  const publicScores = joinPublicLeaderboardScores(safeModels.map((model) => ({
    sourceModelId: model.sourceModelId,
    modelKey: model.modelKey,
    name: model.name,
    creator: model.creator,
  })), publicLeaderboard);

  const batch: NormalizedSourceBatch = {
    sources: ARTIFACTS.map((artifact) => sourceRecord(artifact, prepared[artifact], observedAt)),
    models: toBenchmarkModels(safeModels, publicScores),
    metrics: toMetrics(
      safeModels,
      publicScores,
      safeBenchmarkCategories(artifacts.benchmarks.items),
      artifacts['public-leaderboard'].generatedAt,
    ),
    priceChecks: toPriceChecks(artifacts.pricing.items, modelsBySourceId),
    comparisonSeeds: toComparisonSeeds(artifacts.comparisons.items, modelsBySourceId),
  };
  return validateNormalizedSourceBatch(batch);
}
