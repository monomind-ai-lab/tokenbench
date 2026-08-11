import type { BenchmarkSourceId } from '../benchmarks/contracts';
import { parseModelDirectoryRecord, type ModelDirectoryRecord } from '../benchmarks/model-directory';
import { parseModelProfileSnapshotData, type ModelProfileSnapshotData } from '../benchmarks/model-profile';

export interface ModelProfileAttribution {
  readonly sourceId: BenchmarkSourceId;
  readonly label: string;
  readonly url: string;
  readonly updatedAt: string;
}

export interface ModelProfileViewModel {
  readonly revision: string;
  readonly publishedAt: string;
  readonly freshness: {
    readonly status: 'fresh' | 'stale';
    readonly checkedAt: string;
    readonly message?: string;
  };
  readonly attribution: readonly ModelProfileAttribution[];
  readonly directory: ModelDirectoryRecord;
  readonly profile: ModelProfileSnapshotData;
  readonly selectedRevision: string;
  readonly fallback: 'none' | 'prior-profile';
  readonly aliasFrom: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sourceId(value: unknown): BenchmarkSourceId | null {
  return value === 'benchlm' || value === 'lmarena' || value === 'litellm' || value === 'openrouter' ? value : null;
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function httpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

function parseAttribution(value: unknown): readonly ModelProfileAttribution[] | null {
  if (!Array.isArray(value)) return null;
  const result: ModelProfileAttribution[] = [];
  for (const candidate of value) {
    const row = record(candidate);
    const id = sourceId(row?.sourceId);
    if (!row || !id || typeof row.label !== 'string' || row.label.trim().length === 0 || !httpsUrl(row.url) || !timestamp(row.updatedAt)) return null;
    result.push({ sourceId: id, label: row.label, url: row.url, updatedAt: row.updatedAt });
  }
  return result;
}

/** Strictly validates the only profile shape allowed to hydrate SSR markup. */
export function parseModelProfileViewModel(value: unknown): ModelProfileViewModel | null {
  const row = record(value);
  if (!row) return null;
  const directory = parseModelDirectoryRecord(row.directory);
  const profile = parseModelProfileSnapshotData(row.profile);
  const freshness = record(row.freshness);
  const attribution = parseAttribution(row.attribution);
  if (!directory || !profile || !freshness || !attribution) return null;
  if (typeof row.revision !== 'string' || row.revision.length === 0 || !timestamp(row.publishedAt)) return null;
  if ((freshness.status !== 'fresh' && freshness.status !== 'stale') || !timestamp(freshness.checkedAt)) return null;
  if (freshness.message !== undefined && (typeof freshness.message !== 'string' || freshness.message.trim().length === 0)) return null;
  if (typeof row.selectedRevision !== 'string' || row.selectedRevision.length === 0) return null;
  if (row.fallback !== 'none' && row.fallback !== 'prior-profile') return null;
  if (row.aliasFrom !== null && typeof row.aliasFrom !== 'string') return null;
  if (directory.modelKey !== profile.identity.modelKey
    || directory.canonicalSlug !== profile.identity.slug
    || row.selectedRevision !== profile.revision.revision
    || row.revision !== row.selectedRevision) return null;
  return {
    revision: row.revision,
    publishedAt: row.publishedAt,
    freshness: {
      status: freshness.status,
      checkedAt: freshness.checkedAt,
      ...(typeof freshness.message === 'string' ? { message: freshness.message } : {}),
    },
    attribution,
    directory,
    profile,
    selectedRevision: row.selectedRevision,
    fallback: row.fallback,
    aliasFrom: row.aliasFrom as string | null,
  };
}
