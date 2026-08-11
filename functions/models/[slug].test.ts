import { beforeEach, describe, expect, it, vi } from 'vitest';
import { modelProfileViewModelFixture } from '../../src/frontend/model-profile-test-fixture';

const read = vi.hoisted(() => vi.fn());
vi.mock('../_shared/model-directory-db', async (importOriginal) => ({
  ...await importOriginal<typeof import('../_shared/model-directory-db')>(),
  readDurableModelProfile: read,
}));

import { onRequestGet } from './[slug]';

function context(slug = 'gpt-5-6-sol') {
  return {
    request: new Request(`https://tokenbench.monomind.one/models/${slug}/`),
    env: { CATALOG_DB: { prepare() { throw new Error('mocked read'); } } },
    params: { slug },
  };
}

describe('server-rendered model profile', () => {
  beforeEach(() => read.mockReset());

  it('renders substantive evidence, complete metadata, and Dataset JSON-LD before JavaScript', async () => {
    const fixture = modelProfileViewModelFixture();
    read.mockResolvedValue({
      directory: fixture.directory, profile: fixture.profile, selectedRevision: fixture.selectedRevision,
      fallback: fixture.fallback, aliasFrom: fixture.aliasFrom,
    });
    const response = await onRequestGet(context());
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('<h1>GPT-5.6 Sol</h1>');
    expect(html).toContain('77.95');
    expect(html).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/models/gpt-5-6-sol/">');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:title"');
    expect(html).toContain('"@type":"Dataset"');
    expect(html).toContain('id="model-profile-initial-data"');
  });

  it('returns a true noindex 404 for an unknown slug', async () => {
    read.mockResolvedValue(null);
    const response = await onRequestGet(context('not-present'));
    const html = await response.text();
    expect(response.status).toBe(404);
    expect(html).toContain('<meta name="robots" content="noindex,follow,max-image-preview:large">');
    expect(html).toContain('<meta name="description"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:title"');
  });

  it('redirects an alias to the one canonical profile path', async () => {
    const fixture = modelProfileViewModelFixture();
    read.mockResolvedValue({
      directory: fixture.directory, profile: fixture.profile, selectedRevision: fixture.selectedRevision,
      fallback: fixture.fallback, aliasFrom: 'old-sol',
    });
    const response = await onRequestGet(context('old-sol'));
    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe('/models/gpt-5-6-sol/');
  });
});
