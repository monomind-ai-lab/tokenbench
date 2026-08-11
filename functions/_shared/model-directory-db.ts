import type { BenchmarkModel, EvidenceStatus } from '../../src/benchmarks/contracts';
import {
  parseModelDirectoryRecord,
  type ModelDirectoryRecord,
  type ModelDirectoryStatus,
  type PopularModelWeek,
} from '../../src/benchmarks/model-directory';
import {
  hashModelProfileSnapshotJson,
  parseModelProfileSnapshotData,
  type ModelProfileCategory,
  type ModelProfilePriceRoute,
  type ModelProfileSnapshotData,
  type ModelProfileSourceAttribution,
} from '../../src/benchmarks/model-profile';
import { decodeOpaqueValue, encodeOpaqueValue, type D1Database } from './benchmark-db';

export interface ModelDirectoryQuery {
  readonly q: string;
  readonly creator: string | null;
  readonly sourceType: BenchmarkModel['sourceType'] | null;
  readonly evidenceStatus: EvidenceStatus | null;
  readonly status: ModelDirectoryStatus | 'all';
  readonly limit: number;
  readonly cursor: string | null;
}

export interface ModelDirectoryEntry extends ModelDirectoryRecord {
  readonly weeklyRank: number | null;
  readonly overallScore: number | null;
  readonly overallRank: number | null;
  readonly strongestCategory: ModelProfileCategory | null;
  readonly representativePrice: ModelProfilePriceRoute | null;
  readonly evidenceStatus: EvidenceStatus;
  readonly profileRevision: string;
  readonly profileFallback: 'none' | 'prior-profile';
  readonly profilePublishedAt: string | null;
  readonly profileCheckedAt: string;
}

export interface ModelDirectoryEnvelope {
  readonly revision: string;
  readonly publishedAt: string;
  readonly freshness: {
    readonly status: 'fresh' | 'stale';
    readonly checkedAt: string;
    readonly message?: string;
  };
  readonly attribution: readonly {
    readonly sourceId: ModelProfileSourceAttribution['sourceId'];
    readonly label: string;
    readonly url: string;
    readonly updatedAt: string;
  }[];
  readonly data: {
    readonly week: PopularModelWeek | null;
    readonly models: readonly ModelDirectoryEntry[];
    readonly nextCursor: string | null;
  };
}

export interface ModelProfileReadResult {
  readonly directory: ModelDirectoryRecord;
  readonly profile: ModelProfileSnapshotData;
  readonly selectedRevision: string;
  readonly fallback: 'none' | 'prior-profile';
  readonly aliasFrom: string | null;
}

interface SnapshotRow {
  readonly modelKey: string;
  readonly revision: string;
  readonly profileJson: string;
  readonly generatedAt: string;
}

interface CursorPayload {
  readonly v: 1;
  readonly offset: number;
  readonly query: string;
}

export class ModelDirectoryRequestError extends Error {}

const DIRECTORY_PAGE_MAX = 100;
const PROFILE_HISTORY_LIMIT = 20;
const DIRECTORY_PROFILE_HISTORY_LIMIT = 5;
const WEEK_STALE_AFTER_MS = 8 * 24 * 60 * 60 * 1000;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function all(db: D1Database, sql: string, ...values: unknown[]): Promise<unknown[]> {
  return (await db.prepare(sql).bind(...values).all()).results;
}

function directoryRecord(value: unknown): ModelDirectoryRecord | null {
  const row = asRecord(value);
  if (!row) return null;
  return parseModelDirectoryRecord({
    modelKey: row.model_key,
    canonicalSlug: row.canonical_slug,
    displayName: row.display_name,
    creator: row.creator,
    sourceType: row.source_type,
    reasoningType: row.reasoning_type,
    familyId: row.family_id,
    variantId: row.variant_id,
    firstSeenRevision: row.first_seen_revision,
    firstSeenAt: row.first_seen_at,
    lastSeenRevision: row.last_seen_revision,
    lastSeenAt: row.last_seen_at,
    latestProfileRevision: row.latest_profile_revision,
    status: row.status,
    sourceId: row.source_id,
    sourceModelId: row.source_model_id,
    updatedAt: row.updated_at,
  });
}

function weeklyRank(value: unknown): number | null {
  const row = asRecord(value);
  const rank = row?.weekly_rank;
  return Number.isSafeInteger(rank) && Number(rank) >= 1 && Number(rank) <= 100 ? Number(rank) : null;
}

function popularWeek(value: unknown): PopularModelWeek | null {
  const row = asRecord(value);
  if (!row) return null;
  const week = {
    weekStart: row.week_start,
    benchmarkRevision: row.benchmark_revision,
    sourceSnapshotId: row.source_snapshot_id,
    methodologyVersion: row.methodology_version,
    generatedAt: row.generated_at,
  };
  if (Object.values(week).some((field) => typeof field !== 'string' || field.length === 0)) return null;
  if (!Number.isFinite(Date.parse(week.weekStart as string)) || !Number.isFinite(Date.parse(week.generatedAt as string))) return null;
  return week as PopularModelWeek;
}

function snapshotRow(value: unknown): SnapshotRow | null {
  const row = asRecord(value);
  if (!row
    || typeof row.model_key !== 'string'
    || typeof row.revision !== 'string'
    || typeof row.profile_json !== 'string'
    || typeof row.generated_at !== 'string') return null;
  return {
    modelKey: row.model_key,
    revision: row.revision,
    profileJson: row.profile_json,
    generatedAt: row.generated_at,
  };
}

function queryIdentity(query: ModelDirectoryQuery): string {
  return JSON.stringify({
    q: query.q,
    creator: query.creator,
    sourceType: query.sourceType,
    evidenceStatus: query.evidenceStatus,
    status: query.status,
    limit: query.limit,
  });
}

function cursorOffset(query: ModelDirectoryQuery): number {
  if (query.cursor === null) return 0;
  try {
    const value = asRecord(decodeOpaqueValue(query.cursor));
    if (!value
      || value.v !== 1
      || !Number.isSafeInteger(value.offset)
      || Number(value.offset) < 0
      || Number(value.offset) > 10_000
      || value.query !== queryIdentity(query)) throw new Error('invalid cursor');
    return Number(value.offset);
  } catch {
    throw new ModelDirectoryRequestError('invalid model directory cursor');
  }
}

function nextCursor(query: ModelDirectoryQuery, offset: number): string {
  const payload: CursorPayload = { v: 1, offset, query: queryIdentity(query) };
  return encodeOpaqueValue(payload);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function strongestCategory(profile: ModelProfileSnapshotData): ModelProfileCategory | null {
  return profile.categories
    .filter((category) => category.key !== 'overall' && category.rankingEligible)
    .slice()
    .sort((left, right) => {
      if (left.rank !== null && right.rank !== null && left.rank !== right.rank) return left.rank - right.rank;
      if (left.rank !== null) return -1;
      if (right.rank !== null) return 1;
      return right.score - left.score || compareText(left.key, right.key);
    })[0] ?? null;
}

function representativePrice(profile: ModelProfileSnapshotData): ModelProfilePriceRoute | null {
  return profile.priceRoutes
    .filter((route) => route.inputUsdPerMillion !== null || route.outputUsdPerMillion !== null)
    .slice()
    .sort((left, right) => {
      const priority = (route: ModelProfilePriceRoute) => route.verificationStatus === 'primary' ? 0 : route.verificationStatus === 'conflict' ? 2 : 1;
      return priority(left) - priority(right)
        || compareText(left.providerId, right.providerId)
        || compareText(left.routeId, right.routeId);
    })[0] ?? null;
}

function validProfileFor(directory: ModelDirectoryRecord, row: SnapshotRow): ModelProfileSnapshotData | null {
  const profile = parseModelProfileSnapshotData(row.profileJson);
  if (!profile
    || profile.identity.modelKey !== directory.modelKey
    || profile.identity.slug !== directory.canonicalSlug
    || profile.revision.revision !== row.revision) return null;
  return profile;
}

function profileAttribution(entries: readonly ModelDirectoryEntry[], profiles: ReadonlyMap<string, ModelProfileSnapshotData>) {
  const seen = new Set<string>();
  const result: Array<{ sourceId: ModelProfileSourceAttribution['sourceId']; label: string; url: string; updatedAt: string }> = [];
  entries.forEach((entry) => {
    profiles.get(entry.modelKey)?.sources.forEach((source) => {
      const identity = `${source.sourceId}\u0000${source.artifactId}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      result.push({
        sourceId: source.sourceId,
        label: source.attributionText,
        url: source.sourceUrl,
        updatedAt: source.observedAt,
      });
    });
  });
  return result;
}

async function latestWeek(db: D1Database): Promise<PopularModelWeek | null> {
  const rows = await all(db, `
    SELECT week_start, benchmark_revision, source_snapshot_id, methodology_version, generated_at
    FROM benchmark_popular_model_weeks
    ORDER BY week_start DESC
    LIMIT 1
  `);
  if (rows.length === 0) return null;
  if (rows.length !== 1) throw new Error('popular model week query was not bounded');
  const week = popularWeek(rows[0]);
  if (!week) throw new Error('popular model week is invalid');
  return week;
}

function directoryQuery(query: ModelDirectoryQuery, week: PopularModelWeek | null, offset: number) {
  const isWeeklyDefault = week !== null
    && query.q.length === 0
    && query.creator === null
    && query.sourceType === null
    && query.evidenceStatus === null
    && query.status === 'current';
  if (isWeeklyDefault) {
    return {
      sql: `
        SELECT directory.*, ranks.rank AS weekly_rank
        FROM benchmark_popular_model_ranks AS ranks
        INNER JOIN benchmark_model_directory AS directory ON directory.model_key = ranks.model_key
        WHERE ranks.week_start = ? AND directory.status = 'current'
        ORDER BY ranks.rank ASC, directory.model_key ASC
        LIMIT ? OFFSET ?
      `,
      values: [week.weekStart, query.limit + 1, offset],
    };
  }

  const where: string[] = [];
  const values: unknown[] = [week?.weekStart ?? ''];
  if (query.q.length > 0) {
    where.push(`(
      directory.display_name LIKE ? ESCAPE '\\'
      OR directory.creator LIKE ? ESCAPE '\\'
      OR directory.canonical_slug LIKE ? ESCAPE '\\'
      OR directory.model_key LIKE ? ESCAPE '\\'
    )`);
    const pattern = `%${escapeLike(query.q)}%`;
    values.push(pattern, pattern, pattern, pattern);
  }
  if (query.creator !== null) {
    where.push('directory.creator = ?');
    values.push(query.creator);
  }
  if (query.sourceType !== null) {
    where.push('directory.source_type = ?');
    values.push(query.sourceType);
  }
  if (query.status !== 'all') {
    where.push('directory.status = ?');
    values.push(query.status);
  }
  if (query.evidenceStatus !== null) {
    where.push("json_extract(profile.profile_json, '$.summary.evidenceStatus') = ?");
    values.push(query.evidenceStatus);
  }
  values.push(query.limit + 1, offset);
  return {
    sql: `
      SELECT directory.*, ranks.rank AS weekly_rank
      FROM benchmark_model_directory AS directory
      INNER JOIN benchmark_model_profile_snapshots AS profile
        ON profile.model_key = directory.model_key
       AND profile.revision = directory.latest_profile_revision
      LEFT JOIN benchmark_popular_model_ranks AS ranks
        ON ranks.week_start = ? AND ranks.model_key = directory.model_key
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY lower(directory.display_name) ASC, directory.canonical_slug ASC, directory.model_key ASC
      LIMIT ? OFFSET ?
    `,
    values,
  };
}

async function profilesForDirectoryRows(
  db: D1Database,
  directories: readonly ModelDirectoryRecord[],
): Promise<Map<string, { profile: ModelProfileSnapshotData; revision: string }>> {
  if (directories.length === 0) return new Map();
  const keys = directories.map((directory) => directory.modelKey);
  const rows = await all(db, `
    SELECT model_key, revision, profile_json, generated_at
    FROM (
      SELECT snapshots.*,
        ROW_NUMBER() OVER (
          PARTITION BY snapshots.model_key
          ORDER BY snapshots.generated_at DESC, snapshots.revision DESC
        ) AS profile_order
      FROM benchmark_model_profile_snapshots AS snapshots
      WHERE snapshots.model_key IN (SELECT value FROM json_each(?))
    )
    WHERE profile_order <= ${DIRECTORY_PROFILE_HISTORY_LIMIT}
    ORDER BY model_key ASC, profile_order ASC
  `, JSON.stringify(keys));
  const wantedKeys = new Set(keys);
  const grouped = new Map<string, SnapshotRow[]>();
  rows.map(snapshotRow).filter((row): row is SnapshotRow => row !== null).forEach((row) => {
    if (!wantedKeys.has(row.modelKey)) return;
    const current = grouped.get(row.modelKey) ?? [];
    current.push(row);
    grouped.set(row.modelKey, current);
  });
  const selected = new Map<string, { profile: ModelProfileSnapshotData; revision: string }>();
  directories.forEach((directory) => {
    const candidates = (grouped.get(directory.modelKey) ?? []).slice().sort((left, right) => {
      if (left.revision === directory.latestProfileRevision && right.revision !== directory.latestProfileRevision) return -1;
      if (right.revision === directory.latestProfileRevision && left.revision !== directory.latestProfileRevision) return 1;
      return Date.parse(right.generatedAt) - Date.parse(left.generatedAt) || compareText(right.revision, left.revision);
    });
    for (const row of candidates) {
      const profile = validProfileFor(directory, row);
      if (!profile) continue;
      selected.set(directory.modelKey, { profile, revision: row.revision });
      break;
    }
  });
  return selected;
}

export function modelDirectoryEnvelopeDigest(envelope: ModelDirectoryEnvelope, query: ModelDirectoryQuery): string {
  return hashModelProfileSnapshotJson(JSON.stringify([
    envelope.revision,
    envelope.freshness.checkedAt,
    envelope.freshness.status,
    query,
    envelope.data.models.map((model) => [model.modelKey, model.profileRevision, model.weeklyRank]),
  ]));
}

export async function readModelDirectory(
  db: D1Database,
  query: ModelDirectoryQuery,
): Promise<ModelDirectoryEnvelope> {
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > DIRECTORY_PAGE_MAX) {
    throw new ModelDirectoryRequestError('model directory limit is invalid');
  }
  const offset = cursorOffset(query);
  const week = await latestWeek(db);
  const selection = directoryQuery(query, week, offset);
  const rawRows = await all(db, selection.sql, ...selection.values);
  const parsedRows = rawRows
    .map((row) => ({ row, directory: directoryRecord(row) }))
    .filter((candidate): candidate is { row: unknown; directory: ModelDirectoryRecord } => candidate.directory !== null);
  const hasMore = parsedRows.length > query.limit;
  const pageRows = parsedRows.slice(0, query.limit);
  const selectedProfiles = await profilesForDirectoryRows(db, pageRows.map(({ directory }) => directory));
  const profileMap = new Map<string, ModelProfileSnapshotData>();
  const entries = pageRows.flatMap(({ row, directory }): ModelDirectoryEntry[] => {
    const selected = selectedProfiles.get(directory.modelKey);
    if (!selected) return [];
    const profile = selected.profile;
    if (query.evidenceStatus !== null && profile.summary.evidenceStatus !== query.evidenceStatus) return [];
    profileMap.set(directory.modelKey, profile);
    return [{
      ...directory,
      weeklyRank: weeklyRank(row),
      overallScore: profile.summary.overallScore,
      overallRank: profile.summary.overallRank,
      strongestCategory: strongestCategory(profile),
      representativePrice: representativePrice(profile),
      evidenceStatus: profile.summary.evidenceStatus,
      profileRevision: selected.revision,
      profileFallback: selected.revision === directory.latestProfileRevision ? 'none' : 'prior-profile',
      profilePublishedAt: profile.revision.publishedAt,
      profileCheckedAt: profile.revision.checkedAt,
    }];
  });
  const fallbackDate = entries[0]?.profileCheckedAt ?? new Date(0).toISOString();
  const checkedAt = week?.generatedAt ?? fallbackDate;
  const stale = week === null || Date.now() - Date.parse(checkedAt) > WEEK_STALE_AFTER_MS;
  return {
    revision: week?.benchmarkRevision ?? entries[0]?.profileRevision ?? 'durable-model-directory',
    publishedAt: week?.generatedAt ?? entries[0]?.profilePublishedAt ?? fallbackDate,
    freshness: stale
      ? { status: 'stale', checkedAt, message: 'Showing the latest valid retained model directory snapshot.' }
      : { status: 'fresh', checkedAt },
    attribution: profileAttribution(entries, profileMap),
    data: {
      week,
      models: entries,
      nextCursor: hasMore ? nextCursor(query, offset + query.limit) : null,
    },
  };
}

async function directoryBySlug(db: D1Database, slug: string): Promise<ModelDirectoryRecord | null> {
  const rows = await all(db, `
    SELECT * FROM benchmark_model_directory
    WHERE canonical_slug = ?
    LIMIT 2
  `, slug);
  if (rows.length > 1) throw new Error('canonical model slug is not unique');
  return rows.length === 1 ? directoryRecord(rows[0]) : null;
}

async function directoryByModelKey(db: D1Database, modelKey: string): Promise<ModelDirectoryRecord | null> {
  const rows = await all(db, `
    SELECT * FROM benchmark_model_directory
    WHERE model_key = ?
    LIMIT 2
  `, modelKey);
  if (rows.length > 1) throw new Error('durable model key is not unique');
  return rows.length === 1 ? directoryRecord(rows[0]) : null;
}

async function aliasModelKey(db: D1Database, slug: string): Promise<string | null> {
  const rows = await all(db, `
    SELECT model_key FROM benchmark_model_slug_aliases
    WHERE alias_slug = ?
    LIMIT 2
  `, slug);
  if (rows.length > 1) throw new Error('model alias is not unique');
  const row = rows.length === 1 ? asRecord(rows[0]) : null;
  return typeof row?.model_key === 'string' ? row.model_key : null;
}

export async function readModelSlugAlias(db: D1Database, slug: string): Promise<string | null> {
  const modelKey = await aliasModelKey(db, slug);
  if (modelKey === null) return null;
  return (await directoryByModelKey(db, modelKey))?.canonicalSlug ?? null;
}

export async function readDurableModelProfile(
  db: D1Database,
  slug: string,
): Promise<ModelProfileReadResult | null> {
  let directory = await directoryBySlug(db, slug);
  let aliasFrom: string | null = null;
  if (!directory) {
    const modelKey = await aliasModelKey(db, slug);
    if (modelKey === null) return null;
    directory = await directoryByModelKey(db, modelKey);
    aliasFrom = slug;
  }
  if (!directory) return null;
  const rows = await all(db, `
    SELECT model_key, revision, profile_json, generated_at
    FROM benchmark_model_profile_snapshots
    WHERE model_key = ?
    ORDER BY CASE WHEN revision = ? THEN 0 ELSE 1 END,
      generated_at DESC,
      revision DESC
    LIMIT ${PROFILE_HISTORY_LIMIT}
  `, directory.modelKey, directory.latestProfileRevision);
  for (const candidate of rows) {
    const row = snapshotRow(candidate);
    if (!row || row.modelKey !== directory.modelKey) continue;
    const profile = validProfileFor(directory, row);
    if (!profile) continue;
    return {
      directory,
      profile,
      selectedRevision: row.revision,
      fallback: row.revision === directory.latestProfileRevision ? 'none' : 'prior-profile',
      aliasFrom,
    };
  }
  return null;
}
