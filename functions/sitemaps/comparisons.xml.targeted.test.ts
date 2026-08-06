import { describe, expect, it } from 'vitest';
import { onRequestGet } from './comparisons.xml';

const ORIGIN = 'https://tokenbench.monomind.one';
const PUBLISHED_AT = '2026-08-06T00:00:00.000Z';

function targetedD1() {
  const queries: string[] = [];
  return {
    queries,
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) {
          queries.push(sql);
          return {
            all: async () => {
              if (sql.includes('INNER JOIN benchmark_comparison_pairs')) {
                return {
                  results: [
                    {
                      pair_slug: 'alpha-vs-beta', published_at: PUBLISHED_AT,
                      model_a_key: 'provider:alpha', model_b_key: 'provider:beta',
                      model_a_slug: 'alpha', model_b_slug: 'beta', resolved_count: 1,
                    },
                    {
                      pair_slug: 'beta-vs-gamma', published_at: PUBLISHED_AT,
                      model_a_key: 'provider:beta', model_b_key: 'provider:gamma',
                      model_a_slug: 'beta', model_b_slug: 'gamma', resolved_count: 1,
                    },
                  ],
                };
              }
              throw new Error('comparison sitemap must not materialize the benchmark fact graph');
            },
          };
        },
      };
    },
  };
}

describe('targeted comparison sitemap', () => {
  it('emits indexable pair URLs from one publication-pointer query', async () => {
    const db = targetedD1();

    const response = await onRequestGet({
      request: new Request(`${ORIGIN}/sitemaps/comparisons.xml`),
      env: { CATALOG_DB: db },
    });

    expect(response.status, db.queries.join('\n')).toBe(200);
    await expect(response.text()).resolves.toBe(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${ORIGIN}/compare/alpha-vs-beta</loc><lastmod>${PUBLISHED_AT}</lastmod></url>\n  <url><loc>${ORIGIN}/compare/beta-vs-gamma</loc><lastmod>${PUBLISHED_AT}</lastmod></url>\n</urlset>\n`);
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0]).toContain('benchmark_publication_state');
    expect(db.queries[0]).toContain('benchmark_comparison_pairs');
  });
});
