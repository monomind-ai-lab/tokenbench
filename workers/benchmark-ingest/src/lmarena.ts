import {
  type BenchmarkModel,
  type BenchmarkMetric,
  type BenchmarkSourceRecord,
  type NormalizedSourceBatch,
  validateNormalizedSourceBatch,
} from '../../../src/benchmarks/contracts';
import { resolveCanonicalModelKey, sourceSpecificModelKey } from '../../../src/benchmarks/model-aliases';

export const LMARENA_SUBSETS = [
  'text_style_control',
  'vision_style_control',
  'search_style_control',
  'document_style_control',
  'webdev',
  'agent',
  'text_to_image',
  'image_edit',
  'text_to_video',
  'image_to_video',
  'video_edit',
] as const;

export type LmArenaSubset = typeof LMARENA_SUBSETS[number];

const LMARENA_FILTER_ORIGIN = 'https://datasets-server.huggingface.co/filter?dataset=lmarena-ai%2Fleaderboard-dataset';

type ArenaRow = Record<string, unknown>;

interface ParsedArenaRow {
  sourceModelId: string;
  name: string;
  creator: string;
  sourceType: BenchmarkModel['sourceType'];
  category: string;
  sourceUpdatedAt: string;
  value: number;
  lower: number | null;
  upper: number | null;
  rank: number;
  voteCount: number | null;
  observationCount: number | null;
  sessionCount: number | null;
  methodology: BenchmarkMetric['methodology'];
  unit: BenchmarkMetric['unit'];
}

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is ArenaRow {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): ArenaRow {
  if (!isRecord(value)) fail(`${label} must be an object`);
  return value;
}

function hasOwn(record: ArenaRow, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function requireFiniteNonNegative(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`${label} must be a non-negative finite number`);
  }
  return value;
}

function requireFinite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be a finite number`);
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) fail(`${label} must be a positive integer`);
  return value as number;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) fail(`${label} must be a non-negative integer`);
  return value as number;
}

function optionalInterval(
  row: ArenaRow,
  lowerKey: string,
  upperKey: string,
  label: string,
  allowNegative = false,
): [number | null, number | null] {
  const lower = row[lowerKey];
  const upper = row[upperKey];
  const hasLower = lower !== undefined && lower !== null;
  const hasUpper = upper !== undefined && upper !== null;
  if (!hasLower && !hasUpper) return [null, null];
  if (!hasLower || !hasUpper) fail(`${label} confidence bounds must both be present or null`);
  const normalizeBound = allowNegative ? requireFinite : requireFiniteNonNegative;
  const normalizedLower = normalizeBound(lower, lowerKey);
  const normalizedUpper = normalizeBound(upper, upperKey);
  if (normalizedLower > normalizedUpper) fail(`${label} confidence bounds are inverted`);
  return [normalizedLower, normalizedUpper];
}

function sourceTimestamp(value: unknown, label: string): string {
  const date = requireString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`${label} must be YYYY-MM-DD`);
  const timestamp = `${date}T00:00:00.000Z`;
  if (!Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    fail(`${label} must be a real calendar date`);
  }
  return timestamp;
}

function sourceTypeForLicense(value: unknown, label: string): BenchmarkModel['sourceType'] {
  if (value === null || value === undefined || value === '') return 'Unknown';
  const license = requireString(value, label);
  if (license.toLowerCase() === 'proprietary') return 'Proprietary';
  if (license.toLowerCase() === 'unknown') return 'Unknown';
  return 'Open Weight';
}

function isLmArenaSubset(value: string): value is LmArenaSubset {
  return (LMARENA_SUBSETS as readonly string[]).includes(value);
}

function assertAbsent(row: ArenaRow, fields: readonly string[], message: string): void {
  if (fields.some((field) => hasOwn(row, field))) fail(message);
}

function datasetViewerRow(value: unknown, index: number): ArenaRow {
  const envelope = requireRecord(value, `LMArena row ${index}`);
  // Hugging Face Dataset Viewer `/filter` responses wrap each source record in
  // `{ row_idx, row, truncated_cells }`. Keeping direct-row support makes the
  // normalizer usable for the Worker projection without changing the facts.
  if (!hasOwn(envelope, 'row')) return envelope;
  if (!Array.isArray(envelope.truncated_cells)) fail(`LMArena row ${index}.truncated_cells must be an array`);
  if (envelope.truncated_cells.length > 0) fail(`LMArena row ${index} contains truncated cells`);
  return requireRecord(envelope.row, `LMArena row ${index}.row`);
}

function parseStandardRow(value: unknown, index: number): ParsedArenaRow {
  const row = datasetViewerRow(value, index);
  assertAbsent(row, ['score', 'score_ci_lower', 'score_ci_upper', 'observation_count', 'session_count'],
    `LMArena standard row ${index} does not accept agent counts or IPS score fields`);
  const [lower, upper] = optionalInterval(row, 'rating_lower', 'rating_upper', `LMArena standard row ${index}`);

  return {
    sourceModelId: requireString(row.model_name, `LMArena standard row ${index}.model_name`),
    name: requireString(row.model_name, `LMArena standard row ${index}.model_name`),
    creator: requireString(row.organization, `LMArena standard row ${index}.organization`),
    sourceType: sourceTypeForLicense(row.license, `LMArena standard row ${index}.license`),
    category: requireString(row.category, `LMArena standard row ${index}.category`),
    sourceUpdatedAt: sourceTimestamp(row.leaderboard_publish_date, `LMArena standard row ${index}.leaderboard_publish_date`),
    value: requireFiniteNonNegative(row.rating, `LMArena standard row ${index}.rating`),
    lower,
    upper,
    rank: requirePositiveInteger(row.rank, `LMArena standard row ${index}.rank`),
    voteCount: requireNonNegativeInteger(row.vote_count, `LMArena standard row ${index}.vote_count`),
    observationCount: null,
    sessionCount: null,
    methodology: 'bradley_terry',
    unit: 'arena_score',
  };
}

function parseAgentRow(value: unknown, index: number): ParsedArenaRow {
  const row = datasetViewerRow(value, index);
  assertAbsent(row, ['rating', 'rating_lower', 'rating_upper', 'variance', 'vote_count'],
    `LMArena agent row ${index} does not accept vote counts or Bradley-Terry rating fields`);
  const [lower, upper] = optionalInterval(
    row,
    'score_ci_lower',
    'score_ci_upper',
    `LMArena agent row ${index}`,
    true,
  );

  return {
    sourceModelId: requireString(row.model_name, `LMArena agent row ${index}.model_name`),
    name: requireString(row.model_name, `LMArena agent row ${index}.model_name`),
    creator: requireString(row.organization, `LMArena agent row ${index}.organization`),
    sourceType: sourceTypeForLicense(row.license, `LMArena agent row ${index}.license`),
    category: requireString(row.category, `LMArena agent row ${index}.category`),
    sourceUpdatedAt: sourceTimestamp(row.leaderboard_publish_date, `LMArena agent row ${index}.leaderboard_publish_date`),
    value: requireFinite(row.score, `LMArena agent row ${index}.score`),
    lower,
    upper,
    rank: requirePositiveInteger(row.rank, `LMArena agent row ${index}.rank`),
    voteCount: null,
    observationCount: requireNonNegativeInteger(row.observation_count, `LMArena agent row ${index}.observation_count`),
    sessionCount: requireNonNegativeInteger(row.session_count, `LMArena agent row ${index}.session_count`),
    methodology: 'ips',
    unit: 'score',
  };
}

function sourceSpecificSlug(sourceId: string, sourceModelId: string): string {
  return `source-${sourceId}-${encodeURIComponent(sourceModelId)}`;
}

function canonicalSlug(modelKey: string): string {
  const separator = modelKey.lastIndexOf(':');
  return separator === -1 ? modelKey : modelKey.slice(separator + 1);
}

function sourceUrlForSubset(subset: LmArenaSubset): string {
  return `${LMARENA_FILTER_ORIGIN}&config=${subset}&split=latest&where=%22category%22%3D%27overall%27&offset=0&length=100`;
}

/**
 * Normalizes one accepted LMArena subset. The Worker supplies the Dataset
 * Viewer `latest`/`overall` rows; fixture-stage source metadata is deliberately
 * provisional because transport validators and evidence hashes belong to Task 8.
 */
export function parseLmArenaSubset(subset: string, rows: unknown, observedAt: string): NormalizedSourceBatch {
  if (!isLmArenaSubset(subset)) fail(`LMArena subset ${subset} is not accepted`);
  if (!Array.isArray(rows) || rows.length === 0) fail(`LMArena subset ${subset} must contain at least one row`);

  const artifactId = `${subset}-latest-overall`;
  const source: BenchmarkSourceRecord = {
    sourceId: 'lmarena',
    artifactId,
    sourceUrl: sourceUrlForSubset(subset),
    observedAt,
    etag: null,
    lastModified: null,
    upstreamRevision: null,
    schemaVersion: null,
    snapshotKey: `benchmarks/lmarena/${subset}/latest/overall/provisional.json`,
    contentHash: `sha256:provisional-lmarena-${subset}`,
    licenseId: 'CC-BY-4.0',
    attributionText: 'Arena ratings from LMArena',
  };
  const parsedRows = rows.map((row, index) => subset === 'agent'
    ? parseAgentRow(row, index)
    : parseStandardRow(row, index));
  const modelsByKey = new Map<string, BenchmarkModel>();
  const metrics: BenchmarkMetric[] = [];

  for (const row of parsedRows) {
    const reviewedModelKey = resolveCanonicalModelKey('lmarena', row.sourceModelId);
    const modelKey = reviewedModelKey ?? sourceSpecificModelKey('lmarena', row.sourceModelId);
    const existingModel = modelsByKey.get(modelKey);
    if (existingModel) {
      existingModel.benchmarkCount += 1;
    } else {
      modelsByKey.set(modelKey, {
        modelKey,
        slug: reviewedModelKey ? canonicalSlug(reviewedModelKey) : sourceSpecificSlug('lmarena', row.sourceModelId),
        name: row.name,
        creator: row.creator,
        sourceType: row.sourceType,
        reasoningType: null,
        releaseDate: null,
        contextWindowTokens: null,
        evidenceStatus: 'source_only',
        rankingEligible: true,
        confidenceLower: null,
        confidenceUpper: null,
        benchmarkCount: 1,
        sourceId: 'lmarena',
        sourceModelId: row.sourceModelId,
        sourceArtifactId: artifactId,
      });
    }

    const categoryKey = encodeURIComponent(row.category);
    metrics.push({
      modelKey,
      metricKey: row.methodology === 'ips'
        ? `lmarena:${subset}:${categoryKey}:ips`
        : `lmarena:${subset}:${categoryKey}`,
      category: row.category,
      value: row.value,
      rank: row.rank,
      lower: row.lower,
      upper: row.upper,
      voteCount: row.voteCount,
      unit: row.unit,
      sourceId: 'lmarena',
      sourceUpdatedAt: row.sourceUpdatedAt,
      sourceModelId: row.sourceModelId,
      sourceArtifactId: artifactId,
      rankingEligible: true,
      methodology: row.methodology,
      observationCount: row.observationCount,
      sessionCount: row.sessionCount,
    });
  }

  return validateNormalizedSourceBatch({
    sources: [source],
    models: [...modelsByKey.values()],
    metrics,
    priceChecks: [],
    comparisonSeeds: [],
  });
}
