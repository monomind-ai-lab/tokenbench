import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { previewRoutes, type PreviewRoute } from '../src/preview/route-manifest';
import { generatePreviewDocuments, previewHtmlEntries } from './generate-preview-documents';

const outputRoots: string[] = [];

function reactRoute(routeId: PreviewRoute['id']): PreviewRoute {
  const route = previewRoutes.find((candidate) => candidate.id === routeId);
  if (!route) throw new Error(`Missing fixture route: ${routeId}`);
  return { ...route, delivery: 'react', documentReadiness: { status: 'ready' } };
}

afterEach(async () => {
  await Promise.all(outputRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('generatePreviewDocuments', () => {
  it('emits a semantic document only for a React-delivered manifest route', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tokenbench-react-preview-'));
    outputRoots.push(root);

    await generatePreviewDocuments(root, [reactRoute('home')]);

    const html = await readFile(join(root, 'index.html'), 'utf8');
    expect(html).toContain('<header class="top-header"');
    expect(html).toContain('<main id="page-content"');
    expect(html).toContain('<footer class="app-footer"');
  });

  it('does not emit an entry for a prototype-delivered route', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tokenbench-prototype-preview-'));
    outputRoots.push(root);

    await generatePreviewDocuments(root, previewRoutes.filter((route) => route.id === 'models'));

    await expect(access(join(root, 'models', 'index.html'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses an accidental Hybrid Router React delivery until its substantive document is ready', () => {
    const route = previewRoutes.find((candidate) => candidate.id === 'article-detail');
    if (!route) throw new Error('Missing Hybrid Router fixture route');
    const accidentalReactRoute = { ...route, delivery: 'react' } as PreviewRoute;

    expect(() => previewHtmlEntries('/generated-preview', [accidentalReactRoute])).toThrow(
      /article-detail.*Hybrid Router.*static data/iu,
    );
  });

  it('derives article document outputs from the manifest entry tree', () => {
    const root = '/generated-preview';
    const inputs = previewHtmlEntries(root, [reactRoute('article-detail')]);

    expect(Object.values(inputs)).toContain('/generated-preview/articles/hybrid-router/index.html');
    expect(Object.values(inputs)).toContain('/generated-preview/articles/track-claude-code-usage/index.html');
    expect(Object.values(inputs)).toContain('/generated-preview/articles/legitimate-free-ai-api-access-credits/index.html');
  });
});
