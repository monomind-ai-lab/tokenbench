import { SITE_CONFIG } from '../../src/brand/site-config';
import { compareUtf8Binary } from '../../src/benchmarks/contracts';
import { readActiveBenchmarkSnapshot, type BenchmarkApiEnv } from '../_shared/benchmark-db';
import { escapeXmlText } from '../_shared/html';

const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';

function comparisonSitemap(entries: readonly { readonly pairSlug: string; readonly publishedAt: string }[]): string {
  const urls = entries.map(({ pairSlug, publishedAt }) => (
    `  <url><loc>${escapeXmlText(`${SITE_CONFIG.origin}/compare/${encodeURIComponent(pairSlug)}`)}</loc><lastmod>${escapeXmlText(publishedAt)}</lastmod></url>`
  ));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NAMESPACE}">\n${urls.join('\n')}${urls.length === 0 ? '' : '\n'}</urlset>\n`;
}

/**
 * Emits only comparison rows from the published revision selected by the
 * publication pointer. The snapshot reader validates that each persisted slug
 * already matches its active models' canonical order.
 */
export async function onRequestGet({ env }: { request: Request; env: BenchmarkApiEnv }): Promise<Response> {
  try {
    const snapshot = env.CATALOG_DB ? await readActiveBenchmarkSnapshot(env.CATALOG_DB) : null;
    const publishedAt = snapshot?.revision.publishedAt;
    const entries = snapshot && publishedAt
      ? snapshot.comparisonPairs
        .filter((pair) => pair.indexable === true)
        .slice()
        .sort((left, right) => compareUtf8Binary(left.pairSlug, right.pairSlug))
        .map((pair) => ({ pairSlug: pair.pairSlug, publishedAt }))
      : [];

    return new Response(comparisonSitemap(entries), {
      headers: {
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Content-Type': 'application/xml; charset=utf-8',
        Vary: 'Accept-Encoding',
      },
    });
  } catch {
    return new Response(comparisonSitemap([]), {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/xml; charset=utf-8',
        Vary: 'Accept-Encoding',
      },
    });
  }
}
