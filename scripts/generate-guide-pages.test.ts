import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateGuidePages } from './generate-guide-pages';
import { GUIDES } from '../src/guides/content';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('generateGuidePages', () => {
  it('points crawlable guide calculator calls to the dedicated calculator route', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'tokenbench-guide-pages-'));
    temporaryRoots.push(outputRoot);

    await generateGuidePages(outputRoot);

    const [hub, article] = await Promise.all([
      readFile(join(outputRoot, 'index.html'), 'utf8'),
      readFile(join(outputRoot, GUIDES[0].slug, 'index.html'), 'utf8'),
    ]);

    for (const html of [hub, article]) {
      expect(html).toContain('id="page-content"');
      expect(html).toContain('tabindex="-1"');
      expect(html).not.toContain('href="/#calculator"');
    }
    expect(hub).toContain('href="/cost/calculator/#calculator"');
    expect(article).toContain('href="/cost/calculator/"');
  });

  it('writes branded canonical articles with honest leaderboard context', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'tokenbench-guide-pages-'));
    temporaryRoots.push(outputRoot);

    await generateGuidePages(outputRoot);

    for (const guide of GUIDES) {
      const html = await readFile(join(outputRoot, guide.slug, 'index.html'), 'utf8');

      expect(html).toContain('TokenBench');
      expect(html).not.toContain('AI Cost Engine');
      expect(html).toContain(`<link rel="canonical" href="https://tokenbench.monomind.one/articles/guides/${guide.slug}/">`);
      expect(html).toContain('"@type":"Article"');
      expect(html).toContain('"@type":"BreadcrumbList"');
      expect(html).toContain('href="/cost/calculator/"');
      expect(html).toContain('"item":"https://tokenbench.monomind.one/articles/guides/"');
      expect(html).toContain('href="/leaderboards/llm/pricing-context/"');
    }
  });

  it('renders all eight no-JS guide contracts with labeled evidence and JSON-LD', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'tokenbench-guide-pages-'));
    temporaryRoots.push(outputRoot);
    await generateGuidePages(outputRoot);
    const hub = await readFile(join(outputRoot, 'index.html'), 'utf8');
    expect(hub).toContain('8 field guides');
    for (const guide of GUIDES) {
      const html = await readFile(join(outputRoot, guide.slug, 'index.html'), 'utf8');
      expect(html).toContain('Decision question');
      expect(html).toContain('Assumptions');
      expect(html).toContain('Sources and effective dates');
      expect(html).toContain('"@type":"Article"');
      expect(html).toContain('"@type":"BreadcrumbList"');
    }
  });
});
