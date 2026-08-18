import { describe, expect, it } from 'vitest';
import { previewRoutes } from './route-manifest';
import { renderPreviewDocument } from './route-document';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import { ACCEPTED_LIFECYCLE_AS_OF } from '../frontend/preview-data/contracts';
import { SITE_CONFIG } from '../brand/site-config';
import { FRONTEND_ASSETS } from '../routing/frontend-assets';
import type { PreviewRoute, PreviewRouteMatch } from './route-types';

describe('renderPreviewDocument', () => {
  it('renders a React shell with metadata and escapes a closing script payload', () => {
    const route = previewRoutes.find((candidate) => candidate.id === 'home');
    const match = route?.match(new URL('https://tokenbench.test/'));

    expect(route).toBeDefined();
    expect(match).not.toBeNull();

    const html = renderPreviewDocument(route!, match!, { label: '</script><script>alert(1)</script>' });

    expect(html).toContain('<header class="top-header"');
    expect(html).toContain('<footer class="app-footer"');
    expect(html).toContain('<link rel="canonical"');
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(html).toContain('<script id="home-initial-data" type="application/json">');
    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('\\u003c/script>\\u003cscript>alert(1)\\u003c/script>');
  });

  it('keeps the shared Models shell as the only page-content landmark', async () => {
    const route = previewRoutes.find((candidate) => candidate.id === 'models');
    const match = route?.match(new URL('https://tokenbench.test/models'));
    if (!route || !match) throw new Error('Models preview route is unavailable');

    const html = renderPreviewDocument(route, match, await fixtureAdapter.models({}));

    expect(html.match(/id="page-content"/gu)).toHaveLength(1);
  });

  it('uses supplied stable frontend assets when a Pages Function renders a document', () => {
    const route = previewRoutes.find((candidate) => candidate.id === 'home');
    const match = route?.match(new URL('https://tokenbench.test/'));
    if (!route || !match) throw new Error('Home preview route is unavailable');

    const renderWithAssets = renderPreviewDocument as unknown as (
      route: PreviewRoute,
      match: PreviewRouteMatch,
      data: unknown,
      options: { assets: typeof FRONTEND_ASSETS },
    ) => string;
    const html = renderWithAssets(route, match, undefined, { assets: FRONTEND_ASSETS });

    expect(html).toContain(`<link rel="stylesheet" href="${FRONTEND_ASSETS.stylesheet}">`);
    expect(html).toContain(`<script type="module" src="${FRONTEND_ASSETS.script}"></script>`);
    expect(html).not.toContain('/src/main.tsx');
  });

  it('emits the preview query-profile and lifecycle canonical and Open Graph URLs in their documents', async () => {
    const profile = previewRoutes.find((candidate) => candidate.id === 'model-profile');
    const lifecycle = previewRoutes.find((candidate) => candidate.id === 'model-lifecycle');
    const profileMatch = profile?.match(new URL('https://tokenbench.test/model-profile?model=GPT%205.6%2FSol'));
    const lifecycleMatch = lifecycle?.match(new URL('https://tokenbench.test/model-lifecycle'));
    if (!profile || !lifecycle || !profileMatch || !lifecycleMatch) throw new Error('Model metadata preview routes are unavailable');

    const profileHtml = renderPreviewDocument(profile, profileMatch, await fixtureAdapter.profile('GPT 5.6/Sol'));
    const lifecycleHtml = renderPreviewDocument(lifecycle, lifecycleMatch, await fixtureAdapter.lifecycle({ asOf: ACCEPTED_LIFECYCLE_AS_OF, horizonDays: 90 }));

    expect(profileHtml).toContain(`<link rel="canonical" href="${SITE_CONFIG.origin}/model-profile?model=GPT%205.6%2FSol">`);
    expect(profileHtml).toContain(`<meta property="og:url" content="${SITE_CONFIG.origin}/model-profile?model=GPT%205.6%2FSol">`);
    expect(lifecycleHtml).toContain(`<link rel="canonical" href="${SITE_CONFIG.origin}/model-lifecycle">`);
    expect(lifecycleHtml).toContain(`<meta property="og:url" content="${SITE_CONFIG.origin}/model-lifecycle">`);
  });

  it('renders non-default profile and reordered comparison queries as unavailable without leaking default evidence', async () => {
    const profile = previewRoutes.find((candidate) => candidate.id === 'model-profile');
    const compare = previewRoutes.find((candidate) => candidate.id === 'compare');
    const profileMatch = profile?.match(new URL('https://tokenbench.test/model-profile?model=beta'));
    const compareMatch = compare?.match(new URL('https://tokenbench.test/compare?models=beta,alpha'));
    if (!profile || !compare || !profileMatch || !compareMatch) throw new Error('Query preview routes are unavailable');

    const profileHtml = renderPreviewDocument(profile, profileMatch, await profile.staticData(profileMatch));
    const compareHtml = renderPreviewDocument(compare, compareMatch, await compare.staticData(compareMatch));

    expect(profileHtml).toContain('<h1>Model profile unavailable</h1>');
    expect(profileHtml).not.toContain('<h1>ALPHA</h1>');
    expect(compareHtml).toContain('Unavailable model (beta)');
    expect(compareHtml).toContain('Unavailable model (alpha)');
    expect(compareHtml).toContain('Accepted comparison evidence request does not match the requested query.');
    expect(compareHtml).not.toContain('Capability comparison radar for ALPHA, BETA, GAMMA');
  });
});
