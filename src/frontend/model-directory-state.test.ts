import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_DIRECTORY_QUERY,
  filterModelDirectoryEntries,
  modelDirectoryApiQuery,
  modelDirectoryQueryFromSearch,
  modelDirectoryUrl,
  serializeModelDirectoryQuery,
} from './model-directory-state';

const entries = [
  {
    canonicalSlug: 'top-model', displayName: 'Top Model', creator: 'Alpha', sourceType: 'Proprietary', evidenceStatus: 'supported', status: 'current',
  },
  {
    canonicalSlug: 'retained-model', displayName: 'Retained Model', creator: 'Beta', sourceType: 'Open Weight', evidenceStatus: 'estimated', status: 'archived',
  },
] as const;

describe('model directory query state', () => {
  it('normalizes supported filters and ignores unknown URL parameters', () => {
    expect(modelDirectoryQueryFromSearch('?q=%20Retained%20&creator=Beta&provider=openai&modality=text&sourceType=Open%20Weight&evidenceStatus=estimated&status=archived&sort=cost&view=table&page=2&junk=1')).toEqual({
      q: 'Retained', creator: 'Beta', provider: 'openai', modality: 'text', sourceType: 'Open Weight', evidenceStatus: 'estimated', status: 'archived', sort: 'cost', view: 'table', page: 2,
    });
    expect(modelDirectoryQueryFromSearch('?status=not-a-status')).toEqual(DEFAULT_MODEL_DIRECTORY_QUERY);
  });
  it('defaults a search to every retained model while keeping the empty route current-only', () => {
    expect(modelDirectoryQueryFromSearch('?q=retained').status).toBe('all');
    expect(modelDirectoryQueryFromSearch('')).toEqual(DEFAULT_MODEL_DIRECTORY_QUERY);
    expect(modelDirectoryApiQuery({ ...DEFAULT_MODEL_DIRECTORY_QUERY, q: 'retained' })).toContain('status=all');
  });

  it('serializes query state deterministically and keeps canonical URLs on /models/', () => {
    const query = { q: 'Retained model', creator: 'Beta', provider: 'openai', modality: 'text', sourceType: null, evidenceStatus: 'estimated' as const, status: 'archived' as const, sort: 'cost' as const, view: 'table' as const, page: 2 };
    expect(serializeModelDirectoryQuery(query)).toBe('creator=Beta&evidenceStatus=estimated&modality=text&page=2&provider=openai&q=Retained+model&sort=cost&status=archived&view=table');
    expect(modelDirectoryUrl(query)).toBe('/models/?creator=Beta&evidenceStatus=estimated&modality=text&page=2&provider=openai&q=Retained+model&sort=cost&status=archived&view=table');
    expect(modelDirectoryApiQuery(query)).toBe('/api/benchmarks/models?creator=Beta&evidenceStatus=estimated&q=Retained+model&status=archived&limit=100');
    expect(modelDirectoryUrl({ ...DEFAULT_MODEL_DIRECTORY_QUERY, view: 'table', page: 2 })).toContain('view=table');
  });

  it('filters visible fallback entries without changing facts', () => {
    expect(filterModelDirectoryEntries(entries, { ...DEFAULT_MODEL_DIRECTORY_QUERY, q: 'retained' })).toEqual([entries[1]]);
    expect(filterModelDirectoryEntries(entries, { ...DEFAULT_MODEL_DIRECTORY_QUERY, status: 'archived' })).toEqual([entries[1]]);
    expect(filterModelDirectoryEntries(entries, { ...DEFAULT_MODEL_DIRECTORY_QUERY, sourceType: 'Open Weight', status: 'archived' })).toEqual([entries[1]]);
  });
});
