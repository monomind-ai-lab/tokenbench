import { describe, expect, it } from 'vitest';

import {
  FRONTEND_ASSETS,
  FRONTEND_ASSET_REVISION,
  versionFrontendAssetReferences,
} from './frontend-assets';

describe('stable frontend asset URLs', () => {
  it('cache-busts both stable production assets with the same release revision', () => {
    const html = '<link href="/assets/tokenbench.css"><script src="/assets/main.js"></script>';
    const versioned = versionFrontendAssetReferences(html);

    expect(FRONTEND_ASSET_REVISION).toMatch(/^\d{8}-release\d+-\d+$/);
    expect(versioned).toContain(`href="${FRONTEND_ASSETS.stylesheet}"`);
    expect(versioned).toContain(`src="${FRONTEND_ASSETS.script}"`);
    expect(versioned).not.toMatch(/["']\/assets\/(?:main\.js|tokenbench\.css)["']/);
  });

  it('replaces an existing stable-asset revision instead of appending a second query string', () => {
    const versioned = versionFrontendAssetReferences('<link href="/assets/tokenbench.css?v=stale"><script src="/assets/main.js?v=stale"></script>');

    expect(versioned).toContain(`href="${FRONTEND_ASSETS.stylesheet}"`);
    expect(versioned).toContain(`src="${FRONTEND_ASSETS.script}"`);
    expect(versioned).not.toContain('?v=stale?v=');
  });
});
