import type { BenchmarkModel, EvidenceStatus } from '../benchmarks/contracts';
import type { ModelDirectoryStatus } from '../benchmarks/model-directory';
import type { ModelDirectoryEntry } from './model-directory-contracts';

export interface ModelDirectoryQueryState {
  readonly q: string;
  readonly creator: string | null;
  readonly provider: string | null;
  readonly modality: string | null;
  readonly sourceType: BenchmarkModel['sourceType'] | null;
  readonly evidenceStatus: EvidenceStatus | null;
  readonly status: ModelDirectoryStatus | 'all';
  readonly sort: 'rank' | 'score' | 'cost' | 'name';
  readonly view: 'cards' | 'table';
  readonly page: number;
}

export const DEFAULT_MODEL_DIRECTORY_QUERY: ModelDirectoryQueryState = {
  q: '',
  creator: null,
  provider: null,
  modality: null,
  sourceType: null,
  evidenceStatus: null,
  status: 'current',
  sort: 'rank',
  view: 'cards',
  page: 1,
};

const SOURCE_TYPES = new Set<BenchmarkModel['sourceType']>(['Proprietary', 'Open Weight', 'Unknown']);
const EVIDENCE_STATUSES = new Set<EvidenceStatus>(['supported', 'estimated', 'source_only']);
const STATUSES = new Set<ModelDirectoryQueryState['status']>(['current', 'archived', 'all']);
const SORTS = new Set<ModelDirectoryQueryState['sort']>(['rank', 'score', 'cost', 'name']);
const VIEWS = new Set<ModelDirectoryQueryState['view']>(['cards', 'table']);
const QUERY_KEYS = ['creator', 'evidenceStatus', 'modality', 'page', 'provider', 'q', 'sort', 'sourceType', 'status', 'view'] as const;

type DirectoryFilterEntry = Pick<ModelDirectoryEntry, 'canonicalSlug' | 'displayName' | 'creator' | 'sourceType' | 'evidenceStatus' | 'status'>
  & Partial<Pick<ModelDirectoryEntry, 'modelKey' | 'representativePrice'>>;

function boundedText(value: string | null, maximum: number): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : null;
}

function queryInput(search: string | URLSearchParams): URLSearchParams {
  return typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
}

function pageInput(value: string | null): number {
  if (value === null || !/^\d{1,4}$/.test(value)) return DEFAULT_MODEL_DIRECTORY_QUERY.page;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= 1_000 ? page : DEFAULT_MODEL_DIRECTORY_QUERY.page;
}

/** Parses only supported, bounded filters; unsupported URL keys are ignored. */
export function modelDirectoryQueryFromSearch(search: string | URLSearchParams): ModelDirectoryQueryState {
  const params = queryInput(search);
  const q = boundedText(params.get('q'), 80) ?? '';
  const creator = boundedText(params.get('creator'), 80);
  const provider = boundedText(params.get('provider'), 80);
  const modality = boundedText(params.get('modality'), 40);
  const sourceTypeValue = params.get('sourceType');
  const sourceType = sourceTypeValue !== null && SOURCE_TYPES.has(sourceTypeValue as BenchmarkModel['sourceType'])
    ? sourceTypeValue as BenchmarkModel['sourceType']
    : null;
  const evidenceValue = params.get('evidenceStatus');
  const evidenceStatus = evidenceValue !== null && EVIDENCE_STATUSES.has(evidenceValue as EvidenceStatus)
    ? evidenceValue as EvidenceStatus
    : null;
  const statusValue = params.get('status');
  const status = statusValue === null
    ? q.length > 0 ? 'all' : DEFAULT_MODEL_DIRECTORY_QUERY.status
    : STATUSES.has(statusValue as ModelDirectoryQueryState['status'])
      ? statusValue as ModelDirectoryQueryState['status']
      : DEFAULT_MODEL_DIRECTORY_QUERY.status;
  const sortValue = params.get('sort');
  const sort = sortValue !== null && SORTS.has(sortValue as ModelDirectoryQueryState['sort'])
    ? sortValue as ModelDirectoryQueryState['sort']
    : DEFAULT_MODEL_DIRECTORY_QUERY.sort;
  const viewValue = params.get('view');
  const view = viewValue !== null && VIEWS.has(viewValue as ModelDirectoryQueryState['view'])
    ? viewValue as ModelDirectoryQueryState['view']
    : DEFAULT_MODEL_DIRECTORY_QUERY.view;
  return { q, creator, provider, modality, sourceType, evidenceStatus, status, sort, view, page: pageInput(params.get('page')) };
}

/** Serializes filters in stable lexical key order so every equivalent state has one URL. */
export function serializeModelDirectoryQuery(query: ModelDirectoryQueryState): string {
  const values: Record<string, string> = {};
  if (query.creator) values.creator = query.creator;
  if (query.evidenceStatus) values.evidenceStatus = query.evidenceStatus;
  if (query.modality) values.modality = query.modality;
  if (query.page !== DEFAULT_MODEL_DIRECTORY_QUERY.page) values.page = String(query.page);
  if (query.provider) values.provider = query.provider;
  if (query.q) values.q = query.q;
  if (query.sort !== DEFAULT_MODEL_DIRECTORY_QUERY.sort) values.sort = query.sort;
  if (query.sourceType) values.sourceType = query.sourceType;
  if (query.status !== DEFAULT_MODEL_DIRECTORY_QUERY.status) values.status = query.status;
  if (query.view !== DEFAULT_MODEL_DIRECTORY_QUERY.view) values.view = query.view;
  const serialized = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    const value = values[key];
    if (value !== undefined) serialized.set(key, value);
  }
  return serialized.toString();
}

export function modelDirectoryUrl(query: ModelDirectoryQueryState): string {
  const serialized = serializeModelDirectoryQuery(query);
  return serialized.length === 0 ? '/models/' : `/models/?${serialized}`;
}

/** Builds the bounded API request; a search includes archived records unless explicitly narrowed. */
export function modelDirectoryApiQuery(query: ModelDirectoryQueryState): string {
  const params = new URLSearchParams();
  if (query.creator) params.set('creator', query.creator);
  if (query.evidenceStatus) params.set('evidenceStatus', query.evidenceStatus);
  if (query.q) params.set('q', query.q);
  if (query.sourceType) params.set('sourceType', query.sourceType);
  const effectiveStatus = query.q && query.status === 'current' ? 'all' : query.status;
  if (effectiveStatus !== DEFAULT_MODEL_DIRECTORY_QUERY.status) params.set('status', effectiveStatus);
  params.set('limit', '100');
  return `/api/benchmarks/models?${params.toString()}`;
}

export function filterModelDirectoryEntries<T extends DirectoryFilterEntry>(entries: readonly T[], query: ModelDirectoryQueryState): readonly T[] {
  const needle = query.q.toLocaleLowerCase();
  return entries.filter((entry) => {
    const searchable = `${entry.displayName}\u0000${entry.creator}\u0000${entry.canonicalSlug}\u0000${entry.modelKey ?? ''}`.toLocaleLowerCase();
    return (needle.length === 0 || searchable.includes(needle))
      && (query.creator === null || entry.creator === query.creator)
      && (query.provider === null || entry.representativePrice?.providerId === query.provider)
      && (query.modality === null || [
        ...(entry.representativePrice?.inputModalities ?? []),
        ...(entry.representativePrice?.outputModalities ?? []),
      ].includes(query.modality))
      && (query.sourceType === null || entry.sourceType === query.sourceType)
      && (query.evidenceStatus === null || entry.evidenceStatus === query.evidenceStatus)
      && ((query.q.length > 0 && query.status === 'current') || query.status === 'all' || entry.status === query.status);
  });
}
