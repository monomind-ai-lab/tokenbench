import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateGuidePages } from './generate-guide-pages';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('generateGuidePages', () => {
  it('writes the legacy guide hub and canonical article detail pages', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'tokenbench-guide-pages-'));
    temporaryRoots.push(outputRoot);

    await generateGuidePages(outputRoot);

    const [hub, article] = await Promise.all([
      readFile(join(outputRoot, 'guides', 'index.html'), 'utf8'),
      readFile(join(outputRoot, 'articles', 'track-claude-code-usage', 'index.html'), 'utf8'),
    ]);

    expect(hub).toContain('id="page-content"');
    expect(hub).toContain('href="/articles/track-claude-code-usage/"');
    expect(article).toContain('id="page-content"');
    expect(article).toContain('tabindex="-1"');
    expect(article).toContain('href="/articles?channel=guides"');
    expect(article).toContain('href="/make-it-yours/"');
    expect(article).toContain('href="/subscribe-vs-api"');
    expect(article).not.toContain('Related decision context');
    expect(article).not.toContain('href="/tools/subscriptions-vs-apis/#calculator"');
  });

  it('keeps every article canonical and every related guide route-safe', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'tokenbench-guide-pages-'));
    temporaryRoots.push(outputRoot);

    await generateGuidePages(outputRoot);

    for (const slug of ['track-claude-code-usage', 'monitor-openai-codex-usage', 'openrouter-guide-model-routing-cost-controls', 'legitimate-free-ai-api-access-credits', 'reduce-llm-api-costs-caching-batch-output-limits']) {
      const html = await readFile(join(outputRoot, 'articles', slug, 'index.html'), 'utf8');

      expect(html).toContain('TokenBench');
      expect(html).not.toContain('AI Cost Engine');
      expect(html).toContain(`<link rel="canonical" href="https://tokenbench.monomind.one/articles/${slug}/">`);
      expect(html).toContain('"@type":"Article"');
      expect(html).toContain('"@type":"BreadcrumbList"');
      expect(html).not.toContain('href="/guides/');
    }
  });
});
