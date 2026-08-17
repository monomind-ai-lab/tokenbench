import { describe, expect, it } from 'vitest';
import { FRONTEND_ASSETS } from '../routing/frontend-assets';
import { previewRoutes } from './route-manifest';
import { renderPreviewDocument } from './route-document';

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
    expect(html).toContain(`<link rel="stylesheet" href="${FRONTEND_ASSETS.stylesheet}">`);
    expect(html).toContain(`<script type="module" src="${FRONTEND_ASSETS.script}"></script>`);
    expect(html).toContain('<script id="preview-initial-data" type="application/json">');
    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('\\u003c/script>\\u003cscript>alert(1)\\u003c/script>');
  });
});
