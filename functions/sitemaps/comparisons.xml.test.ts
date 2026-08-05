import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { onRequestGet } from './comparisons.xml';

const ORIGIN = 'https://tokenbench.monomind.one';
const REVISION = 'benchmark-revision-1';
const CATALOG_REVISION = 'catalog-revision-1';
const PUBLISHED_AT = '2026-08-05T00:00:00.000Z';
const OPENROUTER_CONTENT_HASH = `sha256:${'0'.repeat(64)}`;
const OPENROUTER_ARTIFACT_ID = `catalog:${CATALOG_REVISION}`;
const hash = (character: string) => `sha256:${character.repeat(64)}`;
const REVISION_CONTENT_HASH = `sha256:${createHash('sha256').update(JSON.stringify({
  catalogRevision: CATALOG_REVISION,
  openrouterContentHash: OPENROUTER_CONTENT_HASH,
  artifacts: [{
    sourceId: 'openrouter',
    artifactId: OPENROUTER_ARTIFACT_ID,
    contentHash: OPENROUTER_CONTENT_HASH,
  }],
})).digest('hex')}`;

const revision = {
  revision: REVISION,
  generated_at: '2026-08-05T00:00:00.000Z',
  published_at: PUBLISHED_AT,
  checked_at: '2026-08-05T12:00:00.000Z',
  publication_state: 'published',
  content_hash: REVISION_CONTENT_HASH,
  catalog_revision: CATALOG_REVISION,
  openrouter_content_hash: OPENROUTER_CONTENT_HASH,
};

const sources = [{
  revision: REVISION,
  source_id: 'openrouter',
  artifact_id: OPENROUTER_ARTIFACT_ID,
  source_url: 'https://openrouter.ai/api/v1/models',
  observed_at: '2026-08-05T00:00:00.000Z',
  etag: null,
  last_modified: null,
  upstream_revision: CATALOG_REVISION,
  schema_version: null,
  snapshot_key: 'catalog/openrouter/models-r1.json',
  content_hash: OPENROUTER_CONTENT_HASH,
  original_content_hash: hash('1'),
  license_id: 'OpenRouter-ToS',
  attribution_text: 'OpenRouter',
}];

function model(modelKey: string, slug: string) {
  return {
    revision: REVISION,
    model_key: modelKey,
    slug,
    name: slug,
    creator: 'Provider',
    source_type: 'Proprietary',
    reasoning_type: null,
    release_date: null,
    context_window_tokens: null,
    evidence_status: 'supported',
    ranking_eligible: 1,
    confidence_lower: null,
    confidence_upper: null,
    benchmark_count: 0,
    source_id: 'openrouter',
    source_model_id: modelKey,
    source_artifact_id: OPENROUTER_ARTIFACT_ID,
  };
}

const models = [
  model('a:alpha', 'alpha'),
  model('b:beta', 'beta'),
  model('c:gamma', 'gamma'),
  model('d:zeta', 'zeta'),
];

function pair(
  pairSlug: string,
  modelAKey: string,
  modelBKey: string,
  indexable: 0 | 1,
) {
  return {
    revision: REVISION,
    pair_slug: pairSlug,
    model_a_key: modelAKey,
    model_b_key: modelBKey,
    indexable,
    eligibility_reason: 'Reviewed comparison pair',
    featured_rank: null,
    shared_metric_count: indexable ? 2 : 0,
  };
}

type D1Rows = {
  activeRevision: string | null;
  revisions: readonly unknown[];
  sources: readonly unknown[];
  models: readonly unknown[];
  metrics: readonly unknown[];
  prices: readonly unknown[];
  pairs: readonly unknown[];
};

function publishedRows(overrides: Partial<D1Rows> = {}): D1Rows {
  return {
    activeRevision: REVISION,
    revisions: [revision],
    sources,
    models,
    metrics: [],
    prices: [],
    pairs: [
      pair('gamma-vs-zeta', 'c:gamma', 'd:zeta', 1),
      pair('alpha-vs-beta', 'a:alpha', 'b:beta', 1),
      pair('alpha-vs-gamma', 'a:alpha', 'c:gamma', 0),
    ],
    ...overrides,
  };
}

function d1(rows: D1Rows) {
  const bindings: Array<{ readonly sql: string; readonly values: readonly unknown[] }> = [];
  return {
    bindings,
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          bindings.push({ sql, values });
          return {
            all: async () => {
              if (sql.includes('benchmark_publication_state')) {
                const active = rows.revisions.find((candidate) => {
                  if (!candidate || typeof candidate !== 'object') return false;
                  const record = candidate as Record<string, unknown>;
                  return record.revision === rows.activeRevision && record.publication_state === 'published';
                });
                return { results: active ? [active] : [] };
              }
              const key = sql.includes('benchmark_source_records') ? 'sources'
                : sql.includes('benchmark_models') ? 'models'
                  : sql.includes('benchmark_metrics') ? 'metrics'
                    : sql.includes('benchmark_price_checks') ? 'prices'
                      : 'pairs';
              return {
                results: rows[key].filter((candidate) => candidate
                  && typeof candidate === 'object'
                  && (candidate as Record<string, unknown>).revision === values[0]),
              };
            },
          };
        },
      };
    },
  };
}

async function sitemap(rows = publishedRows()): Promise<{ readonly response: Response; readonly db: ReturnType<typeof d1> }> {
  const db = d1(rows);
  const response = await onRequestGet({
    request: new Request(`${ORIGIN}/sitemaps/comparisons.xml`),
    env: { CATALOG_DB: db },
  });
  return { response, db };
}

describe('comparison sitemap', () => {
  it('lists only exact, canonical persisted indexable pairs in lexical order from the publication-pointer snapshot', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const { response, db } = await sitemap(publishedRows({
        pairs: [
          pair('gamma-vs-zeta', 'c:gamma', 'd:zeta', 1),
          pair('alpha-vs-gamma', 'a:alpha', 'c:gamma', 0),
          pair('alpha-vs-beta', 'a:alpha', 'b:beta', 1),
        ],
      }));

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8');
      await expect(response.text()).resolves.toBe(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${ORIGIN}/compare/alpha-vs-beta</loc><lastmod>${PUBLISHED_AT}</lastmod></url>\n  <url><loc>${ORIGIN}/compare/gamma-vs-zeta</loc><lastmod>${PUBLISHED_AT}</lastmod></url>\n</urlset>\n`);
      expect(db.bindings).toHaveLength(6);
      expect(db.bindings[0].sql).toContain('benchmark_publication_state');
      expect(db.bindings[0].sql).toContain('publication.active_revision');
      expect(db.bindings[0].sql).not.toContain('ORDER BY');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('returns an empty valid urlset when no published active revision exists', async () => {
    const { response, db } = await sitemap(publishedRows({ activeRevision: null }));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n`);
    expect(db.bindings).toHaveLength(1);
    expect(db.bindings[0].sql).toContain('benchmark_publication_state');
  });

  it('percent-encodes URL-segment pair slugs before XML escaping without changing publication timestamp', async () => {
    const escapedModels = [
      model('a:escaped', 'alpha ?#'),
      model('b:escaped', 'beta &<"\'😀'),
    ];
    const { response } = await sitemap(publishedRows({
      models: escapedModels,
      pairs: [pair('alpha ?#-vs-beta &<"\'😀', 'a:escaped', 'b:escaped', 1)],
    }));

    await expect(response.text()).resolves.toContain(`<loc>${ORIGIN}/compare/alpha%20%3F%23-vs-beta%20%26%3C%22&apos;%F0%9F%98%80</loc><lastmod>${PUBLISHED_AT}</lastmod>`);
  });

  it('does not publish an indexable sitemap URL when its persisted slug cannot resolve uniquely through the comparison route', async () => {
    const ambiguousModels = [
      model('a:one', 'a'),
      model('b:two', 'a-vs-b'),
      model('c:three', 'b-vs-c'),
      model('d:four', 'c'),
    ];
    const { response } = await sitemap(publishedRows({
      models: ambiguousModels,
      pairs: [pair('a-vs-b-vs-c', 'a:one', 'c:three', 1)],
    }));

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.not.toContain('a-vs-b-vs-c');
  });

  it('publishes the static and dynamic sitemap index entries and the canonical TokenBench robots sitemap URL', async () => {
    const [index, robots] = await Promise.all([
      readFile(resolve(process.cwd(), 'public/sitemap.xml'), 'utf8'),
      readFile(resolve(process.cwd(), 'public/robots.txt'), 'utf8'),
    ]);

    expect(index).toBe(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${ORIGIN}/sitemaps/static.xml</loc></sitemap>\n  <sitemap><loc>${ORIGIN}/sitemaps/comparisons.xml</loc></sitemap>\n</sitemapindex>\n`);
    expect(robots).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
  });
});
