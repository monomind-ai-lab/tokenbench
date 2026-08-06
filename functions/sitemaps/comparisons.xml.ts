import { SITE_CONFIG } from '../../src/brand/site-config';
import { readActiveIndexableComparisonSitemapEntries, type BenchmarkApiEnv } from '../_shared/benchmark-db';
import { escapeXmlText } from '../_shared/html';

const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';

function comparisonSitemap(entries: readonly { readonly pairSlug: string; readonly publishedAt: string }[]): string {
  const urls = entries.map(({ pairSlug, publishedAt }) => (
    `  <url><loc>${escapeXmlText(`${SITE_CONFIG.origin}/compare/${encodeURIComponent(pairSlug)}`)}</loc><lastmod>${escapeXmlText(publishedAt)}</lastmod></url>`
  ));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NAMESPACE}">\n${urls.join('\n')}${urls.length === 0 ? '' : '\n'}</urlset>\n`;
}

function unavailableSitemapResponse(): Response {
  return new Response(comparisonSitemap([]), {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/xml; charset=utf-8',
      Vary: 'Accept-Encoding',
    },
  });
}

/** Emits only publication-pointer-selected, indexable comparison rows. */
export async function onRequestGet({ env }: { request: Request; env: BenchmarkApiEnv }): Promise<Response> {
  if (!env.CATALOG_DB) return unavailableSitemapResponse();
  try {
    const entries = await readActiveIndexableComparisonSitemapEntries(env.CATALOG_DB);

    return new Response(comparisonSitemap(entries), {
      headers: {
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Content-Type': 'application/xml; charset=utf-8',
        Vary: 'Accept-Encoding',
      },
    });
  } catch {
    return unavailableSitemapResponse();
  }
}
