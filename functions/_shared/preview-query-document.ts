import comparisonEvidence from '../../contracts/ui-data-contract/v1/evidence/responses/comparison.json' with { type: 'json' };
import profileEvidence from '../../contracts/ui-data-contract/v1/evidence/responses/profile.json' with { type: 'json' };
import { createElement, type ComponentType } from 'react';
import { mapRetainedComparisonEvidence, mapRetainedProfileEvidence } from '../../src/frontend/preview-data/api-adapter';
import type { AcceptedUiDataContractV1 } from '../../src/frontend/preview-data/contract-v1';
import { compareStateFromQuery } from '../../src/frontend/preview-workbench/compare-state';
import { PreviewComparePage, parsePreviewComparePageData } from '../../src/pages/preview-compare-page';
import { PreviewModelProfilePage, parsePreviewModelProfilePageData } from '../../src/pages/preview-model-profile-page';
import { renderPreviewDocument } from '../../src/preview/route-document';
import type { PreviewPageProps, PreviewRoute, PreviewRouteMatch } from '../../src/preview/route-types';
import { SITE_CONFIG } from '../../src/brand/site-config';
import { metadataForRoute, type PageMetadata } from '../../src/seo/metadata';
import { FRONTEND_ASSETS } from '../../src/routing/frontend-assets';

type PreviewQueryRouteId = 'model-profile' | 'compare';

const defaultSkipLink = {
  skipLinkTarget: 'page-content',
  skipLinkLabel: 'Skip to page content',
} as const;

const acceptedStaticCompareState = { modelIds: ['alpha', 'beta', 'gamma'] } as const;
const retainedProfileEvidence = profileEvidence as AcceptedUiDataContractV1<'profile'>;
const retainedComparisonEvidence = comparisonEvidence as AcceptedUiDataContractV1<'comparison'>;

function normalizePathname(pathname: string): string {
  return pathname === '/' ? '/' : pathname.replace(/\/+$/u, '') || '/';
}

function exactPathMatcher(routeId: PreviewQueryRouteId, pathname: string): (url: URL) => PreviewRouteMatch | null {
  const normalizedPathname = normalizePathname(pathname);
  return (url) => normalizePathname(url.pathname) === normalizedPathname
    ? {
      routeId,
      pathname: url.pathname,
      search: new URLSearchParams(url.search),
      hash: url.hash,
      params: {},
    }
    : null;
}

function profileMetadata(match: PreviewRouteMatch): PageMetadata {
  const slug = match.search.get('model') ?? 'model';
  const metadata = metadataForRoute({ kind: 'modelProfile', slug });
  const canonical = `${SITE_CONFIG.origin}/model-profile?model=${encodeURIComponent(slug)}`;
  return {
    ...metadata,
    canonical,
    openGraph: { ...metadata.openGraph, url: canonical },
  };
}

function routeStructuredData(metadata: PageMetadata): readonly unknown[] {
  return [{
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: metadata.h1,
    description: metadata.description,
    url: metadata.canonical,
  }];
}

const queryRoutes = {
  'model-profile': {
    id: 'model-profile',
    match: exactPathMatcher('model-profile', '/model-profile'),
    outputPathname: '/model-profile',
    delivery: 'react',
    documentReadiness: { status: 'ready' },
    shell: { activePage: 'models', ...defaultSkipLink },
    metadata: profileMetadata,
    structuredData: (match) => routeStructuredData(profileMetadata(match)),
    staticData: async (match) => mapRetainedProfileEvidence(retainedProfileEvidence, match.search.get('model') ?? 'alpha'),
    payload: { key: 'preview-model-profile-initial-data', parse: parsePreviewModelProfilePageData },
    Page: ((props) => createElement(PreviewModelProfilePage, props)) as ComponentType<PreviewPageProps>,
  },
  compare: {
    id: 'compare',
    match: exactPathMatcher('compare', '/compare'),
    outputPathname: '/compare',
    delivery: 'react',
    documentReadiness: { status: 'ready' },
    shell: { activePage: 'compare', ...defaultSkipLink },
    metadata: () => metadataForRoute({ kind: 'compareHub' }),
    structuredData: () => routeStructuredData(metadataForRoute({ kind: 'compareHub' })),
    staticData: async (match) => mapRetainedComparisonEvidence(
      retainedComparisonEvidence,
      compareStateFromQuery(match.search, acceptedStaticCompareState),
    ),
    payload: { key: 'compare-initial-data', parse: parsePreviewComparePageData },
    Page: ((props) => createElement(PreviewComparePage, props)) as ComponentType<PreviewPageProps>,
  },
} as const satisfies Record<PreviewQueryRouteId, PreviewRoute>;

/**
 * Renders only the query-aware Pages routes from their prevalidated retained
 * evidence. This avoids importing Ajv's dynamic compiler into Workers while
 * preserving the adapter's request-correlation gate.
 */
export async function renderPreviewQueryDocument(request: Request, routeId: PreviewQueryRouteId): Promise<Response> {
  const route = queryRoutes[routeId];
  const match = route.match(new URL(request.url));
  if (!match) return new Response('Not found', { status: 404 });

  const data = await route.staticData(match);
  return new Response(renderPreviewDocument(route, match, data, { assets: FRONTEND_ASSETS }), {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
