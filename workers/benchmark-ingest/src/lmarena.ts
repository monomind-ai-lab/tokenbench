import {
  type BenchmarkModel,
  type BenchmarkMetric,
  type BenchmarkSourceRecord,
  type NormalizedSourceBatch,
  validateNormalizedSourceBatch,
} from '../../../src/benchmarks/contracts';
import { resolveCanonicalModelKey, sourceSpecificModelKey } from '../../../src/benchmarks/model-aliases';
import { type ArtifactProvenance, requireArtifactProvenance } from './source-provenance';

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

/**
 * Immutable identity and transport evidence for one Dataset Viewer page.
 * Page scope is explicit so independently fetched pages cannot collapse onto
 * the same durable source artifact.
 */
export interface LmArenaPageArtifact extends ArtifactProvenance {
  artifactId: string;
  sourceUrl: string;
  subset: string;
  split: string;
  category: string;
  offset: number;
  length: number;
}

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

interface ValidatedDatasetViewerRow {
  rowIdx: number;
  row: ArenaRow;
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

function organizationOrUnknown(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label} must be a string`);
  return value.trim().length === 0 ? 'Unknown' : value;
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

function datasetViewerRow(
  value: unknown,
  index: number,
  artifact: LmArenaPageArtifact,
): ValidatedDatasetViewerRow {
  const envelope = requireRecord(value, `LMArena row ${index}`);
  if (!hasOwn(envelope, 'row') || !hasOwn(envelope, 'row_idx') || !hasOwn(envelope, 'truncated_cells')) {
    fail(`LMArena row ${index} must be a Dataset Viewer envelope`);
  }
  if (!Number.isSafeInteger(envelope.row_idx)) {
    fail(`LMArena row ${index}.row_idx must be an integer`);
  }
  const rowIdx = envelope.row_idx as number;
  const pageEnd = artifact.offset + artifact.length;
  if (rowIdx < artifact.offset || rowIdx >= pageEnd) {
    fail(`LMArena row ${index}.row_idx ${rowIdx} must be in descriptor range [${artifact.offset}, ${pageEnd})`);
  }
  if (!Array.isArray(envelope.truncated_cells)) fail(`LMArena row ${index}.truncated_cells must be an array`);
  if (envelope.truncated_cells.length > 0) fail(`LMArena row ${index} contains truncated cells`);
  return {
    rowIdx,
    row: requireRecord(envelope.row, `LMArena row ${index}.row`),
  };
}

function parseStandardRow(value: unknown, index: number): ParsedArenaRow {
  const row = requireRecord(value, `LMArena standard row ${index}`);
  assertAbsent(row, ['score', 'score_ci_lower', 'score_ci_upper', 'observation_count', 'session_count'],
    `LMArena standard row ${index} does not accept agent counts or IPS score fields`);
  const [lower, upper] = optionalInterval(row, 'rating_lower', 'rating_upper', `LMArena standard row ${index}`);

  return {
    sourceModelId: requireString(row.model_name, `LMArena standard row ${index}.model_name`),
    name: requireString(row.model_name, `LMArena standard row ${index}.model_name`),
    creator: organizationOrUnknown(row.organization, `LMArena standard row ${index}.organization`),
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
  const row = requireRecord(value, `LMArena agent row ${index}`);
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
    creator: organizationOrUnknown(row.organization, `LMArena agent row ${index}.organization`),
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

function encodeFilterValue(value: string): string {
  return encodeURIComponent(value).replace(/'/g, '%27');
}

export function lmArenaPageArtifactId(
  subset: LmArenaSubset,
  split: string,
  category: string,
  offset: number,
  length: number,
): string {
  return `${subset}:${split}:${encodeURIComponent(category)}:rows-${offset}-${offset + length}`;
}

export function lmArenaPageSourceUrl(
  subset: LmArenaSubset,
  split: string,
  category: string,
  offset: number,
  length: number,
): string {
  const where = encodeFilterValue(`"category"='${category}'`);
  return `${LMARENA_FILTER_ORIGIN}&config=${encodeURIComponent(subset)}&split=${encodeURIComponent(split)}&where=${where}&offset=${offset}&length=${length}`;
}

function requireLmArenaPageArtifact(
  value: LmArenaPageArtifact | undefined,
  requestedSubset: LmArenaSubset,
): LmArenaPageArtifact {
  const artifact = requireArtifactProvenance(value, 'LMArena') as LmArenaPageArtifact;
  const descriptorSubset = requireString(artifact.subset, 'LMArena descriptor subset');
  if (!isLmArenaSubset(descriptorSubset) || descriptorSubset !== requestedSubset) {
    fail(`LMArena descriptor subset ${descriptorSubset} does not match requested subset ${requestedSubset}`);
  }

  const split = requireString(artifact.split, 'LMArena descriptor split');
  if (split !== 'latest') fail('LMArena descriptor split must be latest');
  const category = requireString(artifact.category, 'LMArena descriptor category');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(category)) {
    fail('LMArena descriptor category must be a safe Dataset Viewer filter value');
  }
  if (!Number.isSafeInteger(artifact.offset) || artifact.offset < 0) {
    fail('LMArena descriptor offset must be a non-negative safe integer');
  }
  if (artifact.length !== 100) {
    fail('LMArena descriptor length must be exactly 100');
  }
  if (artifact.offset % 100 !== 0) {
    fail('LMArena descriptor offset must be a multiple of 100');
  }
  if (!Number.isSafeInteger(artifact.offset + artifact.length)) {
    fail('LMArena descriptor page bounds must be safe integers');
  }

  const expectedArtifactId = lmArenaPageArtifactId(
    requestedSubset,
    split,
    category,
    artifact.offset,
    artifact.length,
  );
  if (artifact.artifactId !== expectedArtifactId) {
    fail(`LMArena descriptor artifactId must include its exact subset, split, category, and page bounds: ${expectedArtifactId}`);
  }
  const expectedSourceUrl = lmArenaPageSourceUrl(
    requestedSubset,
    split,
    category,
    artifact.offset,
    artifact.length,
  );
  if (artifact.sourceUrl !== expectedSourceUrl) {
    fail(`LMArena descriptor sourceUrl must equal the exact official Dataset Viewer URL: ${expectedSourceUrl}`);
  }
  if (typeof artifact.upstreamRevision !== 'string' || artifact.upstreamRevision.trim().length === 0) {
    fail('LMArena provenance requires the non-null Hugging Face x-revision header');
  }
  return artifact;
}

/**
 * Normalizes one accepted LMArena subset. The Worker supplies the Dataset
 * Viewer rows and the exact per-page descriptor/transport evidence that names
 * the sanitized snapshot written by the Worker.
 */
export function parseLmArenaSubset(
  subset: string,
  rows: unknown,
  observedAt: string,
  provenance: LmArenaPageArtifact,
): NormalizedSourceBatch {
  if (!isLmArenaSubset(subset)) fail(`LMArena subset ${subset} is not accepted`);
  if (!Array.isArray(rows) || rows.length === 0) fail(`LMArena subset ${subset} must contain at least one row`);
  const artifactProvenance = requireLmArenaPageArtifact(provenance, subset);

  const artifactId = artifactProvenance.artifactId;
  const source: BenchmarkSourceRecord = {
    sourceId: 'lmarena',
    artifactId,
    sourceUrl: artifactProvenance.sourceUrl,
    observedAt,
    etag: artifactProvenance.etag,
    lastModified: artifactProvenance.lastModified,
    upstreamRevision: artifactProvenance.upstreamRevision,
    schemaVersion: artifactProvenance.schemaVersion,
    snapshotKey: artifactProvenance.snapshotKey,
    contentHash: artifactProvenance.contentHash,
    originalContentHash: artifactProvenance.originalContentHash,
    licenseId: 'CC-BY-4.0',
    attributionText: 'Arena ratings from LMArena',
  };
  const rowIndexes = new Set<number>();
  const datasetRows = rows.map((row, index) => {
    const datasetRow = datasetViewerRow(row, index, artifactProvenance);
    if (rowIndexes.has(datasetRow.rowIdx)) fail(`Duplicate LMArena row_idx ${datasetRow.rowIdx}`);
    rowIndexes.add(datasetRow.rowIdx);
    return datasetRow;
  });
  const parsedRows = datasetRows.map((datasetRow, index) => subset === 'agent'
    ? parseAgentRow(datasetRow.row, index)
    : parseStandardRow(datasetRow.row, index));
  parsedRows.forEach((row, index) => {
    if (row.category !== artifactProvenance.category) {
      fail(`LMArena row ${index} category ${row.category} does not match descriptor category ${artifactProvenance.category}`);
    }
  });
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
