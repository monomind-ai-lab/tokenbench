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

  it('emits a semantic Models workbench document once the route is React-delivered', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tokenbench-models-preview-'));
    outputRoots.push(root);

    await generatePreviewDocuments(root, previewRoutes.filter((route) => route.id === 'models'));

    const html = await readFile(join(root, 'models', 'index.html'), 'utf8');
    expect(html).toContain('<h1 id="models-workbench-heading">Models workbench</h1>');
    expect(html).toContain('<script id="models-initial-data" type="application/json">');
  });

  it('emits Hybrid Router’s substantive React document once the article route is ready', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tokenbench-react-article-preview-'));
    outputRoots.push(root);

    await generatePreviewDocuments(root, previewRoutes.filter((route) => route.id === 'article-detail'));

    const hybrid = await readFile(join(root, 'articles', 'hybrid-router', 'index.html'), 'utf8');
    expect(hybrid).toContain('<h1>A hybrid router for high-stakes agentic work</h1>');
    expect(hybrid).toContain('Illustrative monthly cost index. Lower cost does not imply acceptable quality or operational risk.');
    expect(hybrid).toContain('"@type":"Article"');
    expect(hybrid).toContain('"@type":"BreadcrumbList"');
    expect(hybrid.match(/<main\b/gu)).toHaveLength(1);
    expect(hybrid).toContain('<main id="article-content" class="page-main" tabindex="-1">');
  });

  it('derives article document outputs from the manifest entry tree', () => {
    const root = '/generated-preview';
    const inputs = previewHtmlEntries(root, [reactRoute('article-detail')]);

    expect(Object.values(inputs)).toContain('/generated-preview/articles/hybrid-router/index.html');
    expect(Object.values(inputs)).toContain('/generated-preview/articles/track-claude-code-usage/index.html');
    expect(Object.values(inputs)).toContain('/generated-preview/articles/legitimate-free-ai-api-access-credits/index.html');
  });
});
