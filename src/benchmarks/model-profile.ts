import {
  compareUtf8Binary,
  isCanonicalIsoTimestamp,
  type BenchmarkMetric,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type BenchmarkRevision,
  type BenchmarkSourceId,
  type BenchmarkSourceRecord,
  type EvidenceStatus,
} from './contracts';
import type { BenchmarkProjectionSnapshot } from './api-projections';
import { isModelSlugRouteSafe, modelPath, MODEL_SLUG_ERROR } from './model-directory';

export const MODEL_PROFILE_SNAPSHOT_MAX_BYTES = 524_288;

type ProfileSnapshotInput = BenchmarkProjectionSnapshot & { readonly revision: BenchmarkRevision };
export type ModelProfileSourceSnapshot = ProfileSnapshotInput;

export interface ModelProfileIdentity {
  readonly modelKey: string;
  readonly slug: string;
  readonly displayName: string;
  readonly creator: string;
  readonly sourceType: BenchmarkModel['sourceType'];
  readonly reasoningType: string | null;
  readonly familyId: string | null;
  readonly variantId: string | null;
  readonly releaseDate: string | null;
}

export interface ModelProfileRevisionFacts {
  readonly revision: string;
  readonly generatedAt: string;
  readonly publishedAt: string | null;
  readonly checkedAt: string;
}

export interface ModelProfileCoverage {
  readonly benchmarkCount: number;
  readonly categoryCount: number;
  readonly rankedCategoryCount: number;
  readonly sourceCount: number;
}

export interface ModelProfileSummary {
  readonly overallScore: number | null;
  readonly overallRank: number | null;
  readonly evidenceStatus: EvidenceStatus;
  readonly benchmarkCount: number;
  readonly coverage: ModelProfileCoverage;
  readonly generatedAt: string;
  readonly publishedAt: string | null;
  readonly checkedAt: string;
  readonly strongestEvidence: string;
  readonly validateBeforeChoosing: string;
}

export interface ModelProfileRadarAxis {
  readonly key: string;
  readonly label: string;
  readonly percentile: number | null;
  readonly rank: number | null;
  readonly fieldSize: number | null;
}

export interface ModelProfileCategory {
  readonly key: string;
  readonly metricKey: string;
  readonly label: string;
  readonly score: number;
  readonly rawScore: number | null;
  readonly rank: number | null;
  readonly fieldSize: number | null;
  readonly percentile: number | null;
  readonly evidenceStatus: EvidenceStatus;
  readonly benchmarkCount: number;
  readonly rankingEligible: boolean;
  readonly unit: BenchmarkMetric['unit'];
  readonly sourceId: BenchmarkSourceId;
}

export interface ModelProfilePriceRoute {
  readonly sourceId: BenchmarkSourceId;
  readonly providerId: string;
  readonly routeId: string;
  readonly sourceModelId: string;
  readonly canonicalSlug: string | null;
  readonly inputUsdPerMillion: number | null;
  readonly cachedInputUsdPerMillion: number | null;
  readonly outputUsdPerMillion: number | null;
  readonly contextWindowTokens: number | null;
  readonly maxInputTokens: number | null;
  readonly maxOutputTokens: number | null;
  readonly inputModalities: readonly string[] | null;
  readonly outputModalities: readonly string[] | null;
  readonly supportedParameters: readonly string[] | null;
  readonly verificationStatus: BenchmarkPriceCheck['verificationStatus'];
  readonly sourceArtifactId: string;
  readonly sourceUrl: string;
  readonly observedAt: string;
}

export interface ModelProfileSpecifications {
  readonly contextWindowTokens: number | null;
  readonly maxInputTokens: number | null;
  readonly maxOutputTokens: number | null;
  readonly inputModalities: readonly string[];
  readonly outputModalities: readonly string[];
  readonly supportedParameters: readonly string[];
  readonly releaseDate: string | null;
  readonly sourceType: BenchmarkModel['sourceType'];
  readonly selfHostingAvailable: boolean | null;
}

export interface ModelProfileLedgerRow {
  readonly metricKey: string;
  readonly category: string;
  readonly benchmarkName: string;
  readonly displayValue: number;
  readonly rawValue: number | null;
  readonly unit: BenchmarkMetric['unit'];
  readonly rank: number | null;
  readonly bestVerifiedComparison: number | null;
  readonly gap: number | null;
  readonly weight: number | null;
  readonly evidenceStatus: EvidenceStatus;
  readonly observedAt: string;
  readonly sourceId: BenchmarkSourceId;
  readonly sourceArtifactId: string;
  readonly sourceUrl: string;
}

export interface ModelProfileComparisonLink {
  readonly pairSlug: string;
  readonly path: string;
  readonly indexable: boolean;
  readonly eligibilityReason: string;
  readonly featuredRank: number | null;
  readonly sharedMetricCount: number;
}

export interface ModelProfileSourceAttribution {
  readonly sourceId: BenchmarkSourceId;
  readonly artifactId: string;
  readonly sourceUrl: string;
  readonly observedAt: string;
  readonly attributionText: string;
}

export interface ModelProfileSnapshotData {
  readonly identity: ModelProfileIdentity;
  readonly revision: ModelProfileRevisionFacts;
  readonly summary: ModelProfileSummary;
  readonly radar: readonly ModelProfileRadarAxis[];
  readonly categories: readonly ModelProfileCategory[];
  readonly priceRoutes: readonly ModelProfilePriceRoute[];
  readonly specifications: ModelProfileSpecifications;
  readonly ledger: readonly ModelProfileLedgerRow[];
  readonly comparisons: readonly ModelProfileComparisonLink[];
  readonly sources: readonly ModelProfileSourceAttribution[];
}

export interface SerializedModelProfileSnapshot {
  readonly profileJson: string;
  readonly contentHash: string;
}

const RADAR_AXIS_LABELS: Record<string, string> = {
  overall: 'Overall',
  coding: 'Coding',
  agentic: 'Agentic',
  reasoning: 'Reasoning',
  knowledge: 'Knowledge',
  multimodalGrounded: 'Multimodal grounded',
};

const SOURCE_PRIORITY: Record<BenchmarkSourceId, number> = {
  benchlm: 0,
  lmarena: 1,
  litellm: 2,
  openrouter: 3,
};

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function fail(message: string): never {
  throw new Error(message);
}

function nonBlank(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return nonBlank(value, label);
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be a finite number`);
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} must be a non-negative integer`);
  return value as number;
}

function positiveIntegerOrNull(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail(`${label} must be a positive integer or null`);
  return value as number;
}

function finiteOrNull(value: unknown, label: string): number | null {
  if (value === null) return null;
  return finiteNumber(value, label);
}

function timestamp(value: unknown, label: string): string {
  const result = nonBlank(value, label);
  if (!isCanonicalIsoTimestamp(result)) fail(`${label} must be a canonical ISO timestamp`);
  return result;
}

function nullableTimestamp(value: unknown, label: string): string | null {
  if (value === null) return null;
  return timestamp(value, label);
}
function httpsUrl(value: unknown, label: string): string {
  const result = nonBlank(value, label);
  try {
    if (new URL(result).protocol !== 'https:') fail(`${label} must be https`);
  } catch {
    fail(`${label} must be https`);
  }
  return result;
}

function sourceId(value: unknown, label: string): BenchmarkSourceId {
  if (value === 'benchlm' || value === 'lmarena' || value === 'litellm' || value === 'openrouter') return value;
  fail(`${label} is invalid`);
}

function evidenceStatus(value: unknown, label: string): EvidenceStatus {
  if (value === 'supported' || value === 'estimated' || value === 'source_only') return value;
  fail(`${label} is invalid`);
}

function sourceType(value: unknown, label: string): BenchmarkModel['sourceType'] {
  if (value === 'Proprietary' || value === 'Open Weight' || value === 'Unknown') return value;
  fail(`${label} is invalid`);
}

function metricUnit(value: unknown, label: string): BenchmarkMetric['unit'] {
  if (value === 'score' || value === 'arena_score' || value === 'rank' || value === 'usd_per_million_tokens' || value === 'tokens') return value;
  fail(`${label} is invalid`);
}

function verificationStatus(value: unknown, label: string): BenchmarkPriceCheck['verificationStatus'] {
  if (value === 'primary' || value === 'corroborating' || value === 'conflict') return value;
  fail(`${label} is invalid`);
}

function nullableStringArray(value: unknown, label: string): readonly string[] | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)) {
    fail(`${label} must be an array of non-empty strings or null`);
  }
  return value as string[];
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)) {
    fail(`${label} must be an array of non-empty strings`);
  }
  return value as string[];
}

/** Canonical object guard for persisted model profile JSON. */
export function isModelProfileRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sourceIdentity(sourceIdValue: BenchmarkSourceId, artifactId: string): string {
  return `${sourceIdValue}\u0000${artifactId}`;
}

function sourceByIdentity(sources: readonly BenchmarkSourceRecord[]): ReadonlyMap<string, BenchmarkSourceRecord> {
  return new Map(sources.map((source) => [sourceIdentity(source.sourceId, source.artifactId), source]));
}

function sourceFor(
  sourceMap: ReadonlyMap<string, BenchmarkSourceRecord>,
  sourceIdValue: BenchmarkSourceId,
  artifactId: string,
  label: string,
): BenchmarkSourceRecord {
  const source = sourceMap.get(sourceIdentity(sourceIdValue, artifactId));
  if (!source) fail(`${label} has no source attribution`);
  httpsUrl(source.sourceUrl, `${label} source URL`);
  return source;
}

function categoryLabel(category: string): string {
  const known = Object.prototype.hasOwnProperty.call(RADAR_AXIS_LABELS, category)
    ? RADAR_AXIS_LABELS[category]
    : undefined;
  if (known) return known;
  return category.replace(/([a-z])([A-Z])/gu, '$1 $2').replace(/[-_]+/gu, ' ').replace(/^./u, (first) => first.toUpperCase());
}

function compareMetrics(left: BenchmarkMetric, right: BenchmarkMetric): number {
  const sourceOrder = SOURCE_PRIORITY[left.sourceId] - SOURCE_PRIORITY[right.sourceId];
  return sourceOrder
    || compareUtf8Binary(left.metricKey, right.metricKey)
    || compareUtf8Binary(left.sourceArtifactId, right.sourceArtifactId);
}

function metricForCategory(metrics: readonly BenchmarkMetric[], category: string): BenchmarkMetric {
  const candidates = metrics.filter((metric) => metric.category === category).slice().sort(compareMetrics);
  const selected = candidates[0];
  if (!selected) fail(`category ${category} has no metric`);
  return selected;
}

function metricIdentity(metric: BenchmarkMetric): string {
  return `${metric.metricKey}\u0000${metric.sourceId}\u0000${metric.methodology}\u0000${metric.unit}`;
}

/**
 * Size of the ranked field a published rank is measured against.
 *
 * Rank and field size must describe one population. Counting only
 * ranking-eligible rows while the rank itself comes from the source's full
 * published cohort produced impossible pairs such as "#17 of 17" and "#33 of
 * 32", and a spurious 0 percentile for merely uneligible rows.
 *
 * The size is therefore taken only from the source, never inferred from the
 * rows we happen to observe. The public leaderboard window is a truncated
 * slice: measured against real upstream data, coding publishes 132 ranks while
 * only 115 of those models appear in the limit=200 window. An observed set can
 * be dense 1..N and still be missing the tail, so the highest rank we can see
 * is only a lower bound. Without an exact published size the field is unknown
 * rather than wrong, and the percentile stays unavailable.
 *
 * A size that cannot accommodate the rank is self-contradictory evidence, so
 * it is rejected instead of being reconciled.
 */
function rankFieldSize(metric: BenchmarkMetric): number | null {
  const published = metric.rankFieldSize;
  if (!Number.isSafeInteger(published) || (published as number) < 1) return null;
  if (metric.rank !== null && metric.rank > (published as number)) return null;
  return published as number;
}

/**
 * Relative field position for a published rank.
 *
 * The field size is an exact published cohort size, so last place is a real
 * measurement: `rank === fieldSize` yields 0 and the radar's measured-floor
 * marker stays reachable. When no exact size exists the caller passes null and
 * no percentile is reported at all.
 */
function percentile(rank: number | null, fieldSize: number | null): number | null {
  if (rank === null || fieldSize === null || fieldSize <= 1 || rank < 1 || rank > fieldSize) return null;
  return Math.max(0, Math.min(100, 100 * (fieldSize - rank) / (fieldSize - 1)));
}

function modalities(routes: readonly ModelProfilePriceRoute[], key: 'inputModalities' | 'outputModalities' | 'supportedParameters'): readonly string[] {
  const values = new Set<string>();
  routes.forEach((route) => (route[key] ?? []).forEach((value) => values.add(value)));
  return [...values].sort(compareUtf8Binary);
}

function routeFromPrice(
  price: BenchmarkPriceCheck,
  sourceMap: ReadonlyMap<string, BenchmarkSourceRecord>,
): ModelProfilePriceRoute {
  const source = sourceFor(sourceMap, price.sourceId, price.sourceArtifactId, `price route ${price.routeId}`);
  return {
    sourceId: price.sourceId,
    providerId: price.providerId,
    routeId: price.routeId,
    sourceModelId: price.sourceModelId,
    canonicalSlug: price.canonicalSlug,
    inputUsdPerMillion: price.inputUsdPerMillion,
    cachedInputUsdPerMillion: price.cachedInputUsdPerMillion,
    outputUsdPerMillion: price.outputUsdPerMillion,
    contextWindowTokens: price.contextWindowTokens,
    maxInputTokens: price.maxInputTokens,
    maxOutputTokens: price.maxOutputTokens,
    inputModalities: price.inputModalities,
    outputModalities: price.outputModalities,
    supportedParameters: price.supportedParameters,
    verificationStatus: price.verificationStatus,
    sourceArtifactId: price.sourceArtifactId,
    sourceUrl: source.sourceUrl,
    observedAt: source.observedAt,
  };
}

function ledgerRow(
  metric: BenchmarkMetric,
  modelEvidenceStatus: EvidenceStatus,
  sourceMap: ReadonlyMap<string, BenchmarkSourceRecord>,
): ModelProfileLedgerRow {
  const source = sourceFor(sourceMap, metric.sourceId, metric.sourceArtifactId, `metric ${metric.metricKey}`);
  return {
    metricKey: metric.metricKey,
    category: metric.category,
    benchmarkName: metric.metricKey,
    displayValue: metric.value,
    rawValue: metric.rawValue,
    unit: metric.unit,
    rank: metric.rank,
    bestVerifiedComparison: null,
    gap: null,
    weight: null,
    evidenceStatus: modelEvidenceStatus,
    observedAt: metric.sourceUpdatedAt,
    sourceId: metric.sourceId,
    sourceArtifactId: metric.sourceArtifactId,
    sourceUrl: source.sourceUrl,
  };
}

function sha256(bytes: Uint8Array): string {
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = bytes.length * 8;
  padded[paddedLength - 4] = (bitLength >>> 24) & 0xff;
  padded[paddedLength - 3] = (bitLength >>> 16) & 0xff;
  padded[paddedLength - 2] = (bitLength >>> 8) & 0xff;
  padded[paddedLength - 1] = bitLength & 0xff;

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const schedule = new Uint32Array(64);
  const rotateRight = (value: number, count: number): number => (value >>> count) | (value << (32 - count));

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const position = offset + index * 4;
      schedule[index] = ((padded[position] << 24)
        | (padded[position + 1] << 16)
        | (padded[position + 2] << 8)
        | padded[position + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(schedule[index - 15], 7)
        ^ rotateRight(schedule[index - 15], 18)
        ^ (schedule[index - 15] >>> 3);
      const s1 = rotateRight(schedule[index - 2], 17)
        ^ rotateRight(schedule[index - 2], 19)
        ^ (schedule[index - 2] >>> 10);
      schedule[index] = (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choose + SHA256_K[index] + schedule[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('');
}

function profileBytes(profileJson: string): Uint8Array {
  const bytes = new TextEncoder().encode(profileJson);
  if (bytes.byteLength > MODEL_PROFILE_SNAPSHOT_MAX_BYTES) {
    throw new RangeError(`model profile snapshot exceeds ${MODEL_PROFILE_SNAPSHOT_MAX_BYTES} UTF-8 bytes`);
  }
  return bytes;
}

function validateProfileSnapshot(value: unknown): ModelProfileSnapshotData {
  if (!isModelProfileRecord(value)) fail('model profile snapshot must be an object');
  const identity = value.identity;
  const revision = value.revision;
  const summary = value.summary;
  if (!isModelProfileRecord(identity) || !isModelProfileRecord(revision) || !isModelProfileRecord(summary)) {
    fail('model profile snapshot identity, revision, and summary are required');
  }
  const identityResult: ModelProfileIdentity = {
    modelKey: nonBlank(identity.modelKey, 'identity.modelKey'),
    slug: nonBlank(identity.slug, 'identity.slug'),
    displayName: nonBlank(identity.displayName, 'identity.displayName'),
    creator: nonBlank(identity.creator, 'identity.creator'),
    sourceType: sourceType(identity.sourceType, 'identity.sourceType'),
    reasoningType: nullableString(identity.reasoningType, 'identity.reasoningType'),
    familyId: nullableString(identity.familyId, 'identity.familyId'),
    variantId: nullableString(identity.variantId, 'identity.variantId'),
    releaseDate: nullableString(identity.releaseDate, 'identity.releaseDate'),
  };
  if (!isModelSlugRouteSafe(identityResult.slug)) fail(MODEL_SLUG_ERROR);
  const revisionResult: ModelProfileRevisionFacts = {
    revision: nonBlank(revision.revision, 'revision.revision'),
    generatedAt: timestamp(revision.generatedAt, 'revision.generatedAt'),
    publishedAt: nullableTimestamp(revision.publishedAt, 'revision.publishedAt'),
    checkedAt: timestamp(revision.checkedAt, 'revision.checkedAt'),
  };
  const coverageValue = summary.coverage;
  if (!isModelProfileRecord(coverageValue)) fail('summary.coverage must be an object');
  const coverage: ModelProfileCoverage = {
    benchmarkCount: nonNegativeInteger(coverageValue.benchmarkCount, 'summary.coverage.benchmarkCount'),
    categoryCount: nonNegativeInteger(coverageValue.categoryCount, 'summary.coverage.categoryCount'),
    rankedCategoryCount: nonNegativeInteger(coverageValue.rankedCategoryCount, 'summary.coverage.rankedCategoryCount'),
    sourceCount: nonNegativeInteger(coverageValue.sourceCount, 'summary.coverage.sourceCount'),
  };
  const summaryResult: ModelProfileSummary = {
    overallScore: finiteOrNull(summary.overallScore, 'summary.overallScore'),
    overallRank: positiveIntegerOrNull(summary.overallRank, 'summary.overallRank'),
    evidenceStatus: evidenceStatus(summary.evidenceStatus, 'summary.evidenceStatus'),
    benchmarkCount: nonNegativeInteger(summary.benchmarkCount, 'summary.benchmarkCount'),
    coverage,
    generatedAt: timestamp(summary.generatedAt, 'summary.generatedAt'),
    publishedAt: nullableTimestamp(summary.publishedAt, 'summary.publishedAt'),
    checkedAt: timestamp(summary.checkedAt, 'summary.checkedAt'),
    strongestEvidence: nonBlank(summary.strongestEvidence, 'summary.strongestEvidence'),
    validateBeforeChoosing: nonBlank(summary.validateBeforeChoosing, 'summary.validateBeforeChoosing'),
  };

  if (!Array.isArray(value.radar) || !Array.isArray(value.categories) || !Array.isArray(value.priceRoutes)
    || !isModelProfileRecord(value.specifications) || !Array.isArray(value.ledger)
    || !Array.isArray(value.comparisons) || !Array.isArray(value.sources)) {
    fail('model profile snapshot collections are invalid');
  }

  const radar = value.radar.map((candidate, index): ModelProfileRadarAxis => {
    if (!isModelProfileRecord(candidate)) fail(`radar[${index}] must be an object`);
    const axis: ModelProfileRadarAxis = {
      key: nonBlank(candidate.key, `radar[${index}].key`),
      label: nonBlank(candidate.label, `radar[${index}].label`),
      percentile: finiteOrNull(candidate.percentile, `radar[${index}].percentile`),
      rank: positiveIntegerOrNull(candidate.rank, `radar[${index}].rank`),
      fieldSize: positiveIntegerOrNull(candidate.fieldSize, `radar[${index}].fieldSize`),
    };
    if (axis.percentile !== null && (axis.percentile < 0 || axis.percentile > 100)) fail(`radar[${index}].percentile is outside 0..100`);
    if (axis.percentile !== null && (axis.rank === null || axis.fieldSize === null || axis.fieldSize <= 1 || axis.rank > axis.fieldSize)) {
      fail(`radar[${index}].percentile requires a valid rank field`);
    }
    return axis;
  });
  const radarKeys = new Set<string>();
  radar.forEach((axis) => {
    if (radarKeys.has(axis.key)) fail(`duplicate radar key ${axis.key}`);
    radarKeys.add(axis.key);
  });

  const categories = value.categories.map((candidate, index): ModelProfileCategory => {
    if (!isModelProfileRecord(candidate)) fail(`categories[${index}] must be an object`);
    const category: ModelProfileCategory = {
      key: nonBlank(candidate.key, `categories[${index}].key`),
      metricKey: nonBlank(candidate.metricKey, `categories[${index}].metricKey`),
      label: nonBlank(candidate.label, `categories[${index}].label`),
      score: finiteNumber(candidate.score, `categories[${index}].score`),
      rawScore: finiteOrNull(candidate.rawScore, `categories[${index}].rawScore`),
      rank: positiveIntegerOrNull(candidate.rank, `categories[${index}].rank`),
      fieldSize: positiveIntegerOrNull(candidate.fieldSize, `categories[${index}].fieldSize`),
      percentile: finiteOrNull(candidate.percentile, `categories[${index}].percentile`),
      evidenceStatus: evidenceStatus(candidate.evidenceStatus, `categories[${index}].evidenceStatus`),
      benchmarkCount: nonNegativeInteger(candidate.benchmarkCount, `categories[${index}].benchmarkCount`),
      rankingEligible: candidate.rankingEligible === true,
      unit: metricUnit(candidate.unit, `categories[${index}].unit`),
      sourceId: sourceId(candidate.sourceId, `categories[${index}].sourceId`),
    };
    if (candidate.rankingEligible !== true && candidate.rankingEligible !== false) fail(`categories[${index}].rankingEligible must be boolean`);
    if (category.percentile !== null && (category.percentile < 0 || category.percentile > 100)) fail(`categories[${index}].percentile is outside 0..100`);
    if (category.percentile !== null && (category.rank === null || category.fieldSize === null || category.fieldSize <= 1 || category.rank > category.fieldSize)) {
      fail(`categories[${index}].percentile requires a valid rank field`);
    }
    return category;
  });
  const categoryKeys = new Set<string>();
  categories.forEach((category) => {
    if (categoryKeys.has(category.key)) fail(`duplicate category key ${category.key}`);
    categoryKeys.add(category.key);
  });

  const priceRoutes = value.priceRoutes.map((candidate, index): ModelProfilePriceRoute => {
    if (!isModelProfileRecord(candidate)) fail(`priceRoutes[${index}] must be an object`);
    const sourceUrl = httpsUrl(candidate.sourceUrl, `priceRoutes[${index}].sourceUrl`);
    return {
      sourceId: sourceId(candidate.sourceId, `priceRoutes[${index}].sourceId`),
      providerId: nonBlank(candidate.providerId, `priceRoutes[${index}].providerId`),
      routeId: nonBlank(candidate.routeId, `priceRoutes[${index}].routeId`),
      sourceModelId: nonBlank(candidate.sourceModelId, `priceRoutes[${index}].sourceModelId`),
      canonicalSlug: nullableString(candidate.canonicalSlug, `priceRoutes[${index}].canonicalSlug`),
      inputUsdPerMillion: finiteOrNull(candidate.inputUsdPerMillion, `priceRoutes[${index}].inputUsdPerMillion`),
      cachedInputUsdPerMillion: finiteOrNull(candidate.cachedInputUsdPerMillion, `priceRoutes[${index}].cachedInputUsdPerMillion`),
      outputUsdPerMillion: finiteOrNull(candidate.outputUsdPerMillion, `priceRoutes[${index}].outputUsdPerMillion`),
      contextWindowTokens: positiveIntegerOrNull(candidate.contextWindowTokens, `priceRoutes[${index}].contextWindowTokens`),
      maxInputTokens: positiveIntegerOrNull(candidate.maxInputTokens, `priceRoutes[${index}].maxInputTokens`),
      maxOutputTokens: positiveIntegerOrNull(candidate.maxOutputTokens, `priceRoutes[${index}].maxOutputTokens`),
      inputModalities: nullableStringArray(candidate.inputModalities, `priceRoutes[${index}].inputModalities`),
      outputModalities: nullableStringArray(candidate.outputModalities, `priceRoutes[${index}].outputModalities`),
      supportedParameters: nullableStringArray(candidate.supportedParameters, `priceRoutes[${index}].supportedParameters`),
      verificationStatus: verificationStatus(candidate.verificationStatus, `priceRoutes[${index}].verificationStatus`),
      sourceArtifactId: nonBlank(candidate.sourceArtifactId, `priceRoutes[${index}].sourceArtifactId`),
      sourceUrl,
      observedAt: timestamp(candidate.observedAt, `priceRoutes[${index}].observedAt`),
    };
  });

  const specifications: ModelProfileSpecifications = {
    contextWindowTokens: positiveIntegerOrNull(value.specifications.contextWindowTokens, 'specifications.contextWindowTokens'),
    maxInputTokens: positiveIntegerOrNull(value.specifications.maxInputTokens, 'specifications.maxInputTokens'),
    maxOutputTokens: positiveIntegerOrNull(value.specifications.maxOutputTokens, 'specifications.maxOutputTokens'),
    inputModalities: stringArray(value.specifications.inputModalities, 'specifications.inputModalities'),
    outputModalities: stringArray(value.specifications.outputModalities, 'specifications.outputModalities'),
    supportedParameters: stringArray(value.specifications.supportedParameters, 'specifications.supportedParameters'),
    releaseDate: nullableString(value.specifications.releaseDate, 'specifications.releaseDate'),
    sourceType: sourceType(value.specifications.sourceType, 'specifications.sourceType'),
    selfHostingAvailable: value.specifications.selfHostingAvailable === null ? null : value.specifications.selfHostingAvailable === true
      ? true
      : value.specifications.selfHostingAvailable === false ? false : fail('specifications.selfHostingAvailable must be boolean or null'),
  };

  const ledger = value.ledger.map((candidate, index): ModelProfileLedgerRow => {
    if (!isModelProfileRecord(candidate)) fail(`ledger[${index}] must be an object`);
    const sourceUrl = httpsUrl(candidate.sourceUrl, `ledger[${index}].sourceUrl`);
    return {
      metricKey: nonBlank(candidate.metricKey, `ledger[${index}].metricKey`),
      category: nonBlank(candidate.category, `ledger[${index}].category`),
      benchmarkName: nonBlank(candidate.benchmarkName, `ledger[${index}].benchmarkName`),
      displayValue: finiteNumber(candidate.displayValue, `ledger[${index}].displayValue`),
      rawValue: finiteOrNull(candidate.rawValue, `ledger[${index}].rawValue`),
      unit: metricUnit(candidate.unit, `ledger[${index}].unit`),
      rank: positiveIntegerOrNull(candidate.rank, `ledger[${index}].rank`),
      bestVerifiedComparison: finiteOrNull(candidate.bestVerifiedComparison, `ledger[${index}].bestVerifiedComparison`),
      gap: finiteOrNull(candidate.gap, `ledger[${index}].gap`),
      weight: finiteOrNull(candidate.weight, `ledger[${index}].weight`),
      evidenceStatus: evidenceStatus(candidate.evidenceStatus, `ledger[${index}].evidenceStatus`),
      observedAt: timestamp(candidate.observedAt, `ledger[${index}].observedAt`),
      sourceId: sourceId(candidate.sourceId, `ledger[${index}].sourceId`),
      sourceArtifactId: nonBlank(candidate.sourceArtifactId, `ledger[${index}].sourceArtifactId`),
      sourceUrl,
    };
  });

  const comparisons = value.comparisons.map((candidate, index): ModelProfileComparisonLink => {
    if (!isModelProfileRecord(candidate)) fail(`comparisons[${index}] must be an object`);
    return {
      pairSlug: nonBlank(candidate.pairSlug, `comparisons[${index}].pairSlug`),
      path: nonBlank(candidate.path, `comparisons[${index}].path`),
      indexable: candidate.indexable === true,
      eligibilityReason: nonBlank(candidate.eligibilityReason, `comparisons[${index}].eligibilityReason`),
      featuredRank: positiveIntegerOrNull(candidate.featuredRank, `comparisons[${index}].featuredRank`),
      sharedMetricCount: nonNegativeInteger(candidate.sharedMetricCount, `comparisons[${index}].sharedMetricCount`),
    };
  });

  const sources = value.sources.map((candidate, index): ModelProfileSourceAttribution => {
    if (!isModelProfileRecord(candidate)) fail(`sources[${index}] must be an object`);
    const sourceUrl = httpsUrl(candidate.sourceUrl, `sources[${index}].sourceUrl`);
    return {
      sourceId: sourceId(candidate.sourceId, `sources[${index}].sourceId`),
      artifactId: nonBlank(candidate.artifactId, `sources[${index}].artifactId`),
      sourceUrl,
      observedAt: timestamp(candidate.observedAt, `sources[${index}].observedAt`),
      attributionText: nonBlank(candidate.attributionText, `sources[${index}].attributionText`),
    };
  });

  return {
    identity: identityResult,
    revision: revisionResult,
    summary: summaryResult,
    radar,
    categories,
    priceRoutes,
    specifications,
    ledger,
    comparisons,
    sources,
  };
}

/** Materializes one durable, source-linked profile from a complete snapshot. */
export function buildModelProfileSnapshot(
  snapshot: ModelProfileSourceSnapshot,
  modelKey: string,
): ModelProfileSnapshotData {
  const models = snapshot.models.filter((candidate) => candidate.modelKey === modelKey);
  if (models.length !== 1) fail(`model profile requires one model for ${modelKey}`);
  const model = models[0]!;
  if (!isModelSlugRouteSafe(model.slug)) fail(MODEL_SLUG_ERROR);
  const sourceMap = sourceByIdentity(snapshot.sources);
  const metrics = snapshot.metrics.filter((metric) => metric.modelKey === modelKey).slice().sort(compareMetrics);
  const prices = snapshot.priceChecks.filter((price) => price.modelKey === modelKey).slice().sort((left, right) => compareUtf8Binary(left.routeId, right.routeId));
  const categories = [...new Set(metrics.map((metric) => metric.category))]
    .sort(compareUtf8Binary)
    .map((category): ModelProfileCategory => {
      const metric = metricForCategory(metrics, category);
      const fieldSize = rankFieldSize(metric);
      return {
        key: category,
        metricKey: metric.metricKey,
        label: categoryLabel(category),
        score: metric.value,
        rawScore: metric.rawValue,
        rank: metric.rank,
        fieldSize,
        percentile: percentile(metric.rank, fieldSize),
        evidenceStatus: model.evidenceStatus,
        benchmarkCount: model.benchmarkCount,
        rankingEligible: metric.rankingEligible,
        unit: metric.unit,
        sourceId: metric.sourceId,
      };
    });
  const categoriesByKey = new Map(categories.map((category) => [category.key, category]));
  const radarKeys = [...new Set([...Object.keys(RADAR_AXIS_LABELS), ...categories.map((category) => category.key)])]
    .sort(compareUtf8Binary);
  const radar = radarKeys.map((key): ModelProfileRadarAxis => {
    const category = categoriesByKey.get(key);
    return {
      key,
      label: category?.label ?? categoryLabel(key),
      percentile: category?.percentile ?? null,
      rank: category?.rank ?? null,
      fieldSize: category?.fieldSize ?? null,
    };
  });
  const overall = categoriesByKey.get('overall');
  const priceRoutes = prices.map((price) => routeFromPrice(price, sourceMap));
  const ledger = metrics.map((metric) => ledgerRow(metric, model.evidenceStatus, sourceMap));
  const sourcesByIdentity = new Set<string>();
  const sourceAttribution = [...metrics.map((metric) => [metric.sourceId, metric.sourceArtifactId] as const), ...prices.map((price) => [price.sourceId, price.sourceArtifactId] as const)]
    .filter(([sourceIdValue, artifactId]) => {
      const identity = sourceIdentity(sourceIdValue, artifactId);
      if (sourcesByIdentity.has(identity)) return false;
      sourcesByIdentity.add(identity);
      return true;
    })
    .map(([sourceIdValue, artifactId]) => sourceFor(sourceMap, sourceIdValue, artifactId, `profile source ${artifactId}`))
    .sort((left, right) => SOURCE_PRIORITY[left.sourceId] - SOURCE_PRIORITY[right.sourceId] || compareUtf8Binary(left.artifactId, right.artifactId))
    .map((source): ModelProfileSourceAttribution => ({
      sourceId: source.sourceId,
      artifactId: source.artifactId,
      sourceUrl: source.sourceUrl,
      observedAt: source.observedAt,
      attributionText: source.attributionText,
    }));
  const comparisons = snapshot.comparisonPairs
    .filter((pair) => pair.modelAKey === modelKey || pair.modelBKey === modelKey)
    .slice()
    .sort((left, right) => compareUtf8Binary(left.pairSlug, right.pairSlug))
    .map((pair): ModelProfileComparisonLink => ({
      pairSlug: pair.pairSlug,
      path: `/compare/${encodeURIComponent(pair.pairSlug)}/`,
      indexable: pair.indexable,
      eligibilityReason: pair.eligibilityReason,
      featuredRank: pair.featuredRank,
      sharedMetricCount: pair.sharedMetricCount,
    }));
  const maxInputTokens = priceRoutes.reduce<number | null>((current, route) => route.maxInputTokens !== null && (current === null || route.maxInputTokens > current) ? route.maxInputTokens : current, null);
  const maxOutputTokens = priceRoutes.reduce<number | null>((current, route) => route.maxOutputTokens !== null && (current === null || route.maxOutputTokens > current) ? route.maxOutputTokens : current, null);
  const specifications: ModelProfileSpecifications = {
    contextWindowTokens: model.contextWindowTokens,
    maxInputTokens,
    maxOutputTokens,
    inputModalities: modalities(priceRoutes, 'inputModalities'),
    outputModalities: modalities(priceRoutes, 'outputModalities'),
    supportedParameters: modalities(priceRoutes, 'supportedParameters'),
    releaseDate: model.releaseDate,
    sourceType: model.sourceType,
    selfHostingAvailable: null,
  };
  const revision = {
    revision: snapshot.revision.revision,
    generatedAt: snapshot.revision.generatedAt,
    publishedAt: snapshot.revision.publishedAt,
    checkedAt: snapshot.revision.checkedAt,
  } satisfies ModelProfileRevisionFacts;
  const summary: ModelProfileSummary = {
    overallScore: overall?.score ?? null,
    overallRank: overall?.rank ?? null,
    evidenceStatus: model.evidenceStatus,
    benchmarkCount: model.benchmarkCount,
    coverage: {
      benchmarkCount: model.benchmarkCount,
      categoryCount: categories.length,
      rankedCategoryCount: categories.filter((category) => category.percentile !== null).length,
      sourceCount: sourceAttribution.length,
    },
    generatedAt: revision.generatedAt,
    publishedAt: revision.publishedAt,
    checkedAt: revision.checkedAt,
    strongestEvidence: overall
      ? `Public overall score ${overall.score} at source rank ${overall.rank === null ? 'unranked' : `#${overall.rank}`}.`
      : 'No eligible public overall score is available.',
    validateBeforeChoosing: priceRoutes.length > 0
      ? 'Validate the selected route price, context limits, and evidence freshness before choosing.'
      : 'Validate current route pricing and evidence availability before choosing.',
  };
  return {
    identity: {
      modelKey: model.modelKey,
      slug: model.slug,
      displayName: model.name,
      creator: model.creator,
      sourceType: model.sourceType,
      reasoningType: model.reasoningType,
      familyId: model.familyId ?? null,
      variantId: model.variantId ?? null,
      releaseDate: model.releaseDate,
    },
    revision,
    summary,
    radar,
    categories,
    priceRoutes,
    specifications,
    ledger,
    comparisons,
    sources: sourceAttribution,
  };
}

/** Parses persisted profile JSON and returns null for malformed or over-bound data. */
export function parseModelProfileSnapshotData(value: unknown): ModelProfileSnapshotData | null {
  try {
    let parsed: unknown;
    if (typeof value === 'string') {
      const bytes = profileBytes(value);
      parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } else {
      const serialized = JSON.stringify(value);
      if (typeof serialized !== 'string') return null;
      profileBytes(serialized);
      parsed = value;
    }
    return validateProfileSnapshot(parsed);
  } catch {
    return null;
  }
}

/** Hashes the exact UTF-8 JSON bytes persisted in D1. */
export function hashModelProfileSnapshotJson(profileJson: string): string {
  return `sha256:${sha256(profileBytes(profileJson))}`;
}

/** Uses the runtime's native Web Crypto implementation for bulk publication. */
export async function hashModelProfileSnapshotJsonAsync(profileJson: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', profileBytes(profileJson));
  const hexadecimal = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hexadecimal}`;
}

export function serializeModelProfileSnapshotJson(profile: ModelProfileSnapshotData): string {
  const validated = validateProfileSnapshot(profile);
  const profileJson = JSON.stringify(validated);
  profileBytes(profileJson);
  return profileJson;
}

/** Validates, serializes, bounds, and hashes one profile snapshot atomically. */
export function serializeModelProfileSnapshot(profile: ModelProfileSnapshotData): SerializedModelProfileSnapshot {
  const profileJson = serializeModelProfileSnapshotJson(profile);
  return { profileJson, contentHash: hashModelProfileSnapshotJson(profileJson) };
}

/** Native-crypto variant used when a complete revision contains thousands of profiles. */
export async function serializeModelProfileSnapshotAsync(profile: ModelProfileSnapshotData): Promise<SerializedModelProfileSnapshot> {
  const profileJson = serializeModelProfileSnapshotJson(profile);
  return { profileJson, contentHash: await hashModelProfileSnapshotJsonAsync(profileJson) };
}

export { modelPath };
