import {
  compareUtf8Binary,
  isCanonicalIsoTimestamp,
  type BenchmarkModel,
  type BenchmarkSourceId,
} from './contracts';

export const MODEL_DIRECTORY_STATUSES = ['current', 'archived'] as const;
export type ModelDirectoryStatus = typeof MODEL_DIRECTORY_STATUSES[number];

export interface ModelDirectoryRecord {
  readonly modelKey: string;
  readonly canonicalSlug: string;
  readonly displayName: string;
  readonly creator: string;
  readonly sourceType: BenchmarkModel['sourceType'];
  readonly reasoningType: string | null;
  readonly familyId: string | null;
  readonly variantId: string | null;
  readonly firstSeenRevision: string;
  readonly firstSeenAt: string;
  readonly lastSeenRevision: string;
  readonly lastSeenAt: string;
  readonly latestProfileRevision: string;
  readonly status: ModelDirectoryStatus;
  readonly sourceId: BenchmarkSourceId;
  readonly sourceModelId: string;
  readonly updatedAt: string;
}

export interface PopularModelWeek {
  readonly weekStart: string;
  readonly benchmarkRevision: string;
  readonly sourceSnapshotId: string;
  readonly methodologyVersion: string;
  readonly generatedAt: string;
}

export interface PopularModelRank {
  readonly weekStart: string;
  readonly rank: number;
  readonly modelKey: string;
}

const MODEL_SLUG_UNSAFE = /[\u0000-\u001f\u007f/\\]/u;
export const MODEL_SLUG_ERROR = 'model slug must be one route segment';

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

function timestamp(value: unknown, label: string): string {
  const result = nonBlank(value, label);
  if (!isCanonicalIsoTimestamp(result)) fail(`${label} must be a canonical ISO timestamp`);
  return result;
}

function sourceType(value: unknown): BenchmarkModel['sourceType'] {
  if (value === 'Proprietary' || value === 'Open Weight' || value === 'Unknown') return value;
  fail('model directory sourceType is invalid');
}

function sourceId(value: unknown): BenchmarkSourceId {
  if (value === 'benchlm' || value === 'lmarena' || value === 'litellm' || value === 'openrouter') return value;
  fail('model directory sourceId is invalid');
}

/** Canonical persisted-record object guard used by the directory parser. */
export function isModelDirectoryRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns true only for a slug that can be encoded as one model route segment. */
export function isModelSlugRouteSafe(slug: unknown): slug is string {
  if (typeof slug !== 'string' || slug.length === 0 || slug === '.' || slug === '..' || MODEL_SLUG_UNSAFE.test(slug)) {
    return false;
  }
  try {
    encodeURIComponent(slug);
    return true;
  } catch {
    return false;
  }
}

/** True when every percent sequence in the slug is already a valid escape. */
function isAlreadyPercentEncoded(slug: string): boolean {
  if (!slug.includes('%')) return false;
  try {
    return decodeURIComponent(slug) !== slug;
  } catch {
    return false;
  }
}

/**
 * Builds the sole canonical internal model link. Encoding happens exactly once
 * here, so callers never concatenate untrusted slug text into a route.
 *
 * Directory slugs produced by `sourceSpecificModelKey()` already carry
 * `encodeURIComponent`-escaped upstream model ids, so encoding again produced
 * `%252F` and a 404 for every such row. A slug that already decodes to
 * something different is emitted as-is; a raw slug is still encoded once.
 */
export function modelPath(slug: string): string {
  if (!isModelSlugRouteSafe(slug)) throw new Error(MODEL_SLUG_ERROR);
  return `/models/${isAlreadyPercentEncoded(slug) ? slug : encodeURIComponent(slug)}/`;
}

/** Returns Monday 00:00:00.000Z for the UTC week containing a timestamp. */
export function weekStartUtc(value: string): string {
  if (!isCanonicalIsoTimestamp(value)) throw new Error('timestamp must be a canonical ISO timestamp');
  const date = new Date(value);
  const daysFromMonday = (date.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - daysFromMonday,
  )).toISOString();
}

/** Converts a validated active model into the durable directory shape. */
export function directoryRecordFromModel(
  model: BenchmarkModel,
  revision: string,
  seenAt: string,
  status: ModelDirectoryStatus = 'current',
): ModelDirectoryRecord {
  nonBlank(revision, 'revision');
  timestamp(seenAt, 'seenAt');
  if (!isModelSlugRouteSafe(model.slug)) throw new Error(MODEL_SLUG_ERROR);
  return {
    modelKey: nonBlank(model.modelKey, 'model.modelKey'),
    canonicalSlug: model.slug,
    displayName: nonBlank(model.name, 'model.name'),
    creator: nonBlank(model.creator, 'model.creator'),
    sourceType: model.sourceType,
    reasoningType: model.reasoningType,
    familyId: model.familyId ?? null,
    variantId: model.variantId ?? null,
    firstSeenRevision: revision,
    firstSeenAt: seenAt,
    lastSeenRevision: revision,
    lastSeenAt: seenAt,
    latestProfileRevision: revision,
    status,
    sourceId: model.sourceId,
    sourceModelId: nonBlank(model.sourceModelId, 'model.sourceModelId'),
    updatedAt: seenAt,
  };
}

export function sortModelDirectoryRecords(records: readonly ModelDirectoryRecord[]): readonly ModelDirectoryRecord[] {
  return records.slice().sort((left, right) => compareUtf8Binary(left.canonicalSlug, right.canonicalSlug)
    || compareUtf8Binary(left.modelKey, right.modelKey));
}

/**
 * Keeps the first occurrence of each eligible model in source rank order and
 * caps a weekly snapshot at the public top 100.
 */
export function selectPopularModelRanks(
  weekStart: string,
  rows: readonly { readonly modelKey: string; readonly rank: number }[],
): readonly PopularModelRank[] {
  if (weekStartUtc(weekStart) !== weekStart) throw new Error('weekStart must be Monday 00:00:00.000Z');
  const seen = new Set<string>();
  const seenRanks = new Set<number>();
  return rows
    .filter((row) => Number.isSafeInteger(row.rank) && row.rank >= 1 && row.rank <= 100 && typeof row.modelKey === 'string' && row.modelKey.length > 0)
    .slice()
    .sort((left, right) => left.rank - right.rank || compareUtf8Binary(left.modelKey, right.modelKey))
    .filter((row) => {
      if (seen.has(row.modelKey) || seenRanks.has(row.rank)) return false;
      seen.add(row.modelKey);
      seenRanks.add(row.rank);
      return true;
    })
    .slice(0, 100)
    .map((row) => ({ weekStart, rank: row.rank, modelKey: row.modelKey }));
}

/** Parses a persisted directory record without allowing unsafe route values. */
export function parseModelDirectoryRecord(value: unknown): ModelDirectoryRecord | null {
  if (!isModelDirectoryRecordObject(value)) return null;
  try {
    const status = value.status;
    if (status !== 'current' && status !== 'archived') return null;
    const canonicalSlug = nonBlank(value.canonicalSlug, 'canonicalSlug');
    if (!isModelSlugRouteSafe(canonicalSlug)) return null;
    return {
      modelKey: nonBlank(value.modelKey, 'modelKey'),
      canonicalSlug,
      displayName: nonBlank(value.displayName, 'displayName'),
      creator: nonBlank(value.creator, 'creator'),
      sourceType: sourceType(value.sourceType),
      reasoningType: nullableString(value.reasoningType, 'reasoningType'),
      familyId: nullableString(value.familyId, 'familyId'),
      variantId: nullableString(value.variantId, 'variantId'),
      firstSeenRevision: nonBlank(value.firstSeenRevision, 'firstSeenRevision'),
      firstSeenAt: timestamp(value.firstSeenAt, 'firstSeenAt'),
      lastSeenRevision: nonBlank(value.lastSeenRevision, 'lastSeenRevision'),
      lastSeenAt: timestamp(value.lastSeenAt, 'lastSeenAt'),
      latestProfileRevision: nonBlank(value.latestProfileRevision, 'latestProfileRevision'),
      status,
      sourceId: sourceId(value.sourceId),
      sourceModelId: nonBlank(value.sourceModelId, 'sourceModelId'),
      updatedAt: timestamp(value.updatedAt, 'updatedAt'),
    };
  } catch {
    return null;
  }
}
