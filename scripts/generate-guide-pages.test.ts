import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateGuidePages } from './generate-guide-pages';

const expectedLeaderboardPaths = {
  'track-claude-code-usage': ['/leaderboards/llm/pricing-context/'],
  'monitor-openai-codex-usage': ['/leaderboards/llm/pricing-context/'],
  'openrouter-guide-model-routing-cost-controls': ['/leaderboards/llm/pricing-context/'],
  'legitimate-free-ai-api-access-credits': ['/leaderboards/llm/pricing-context/'],
  'reduce-llm-api-costs-caching-batch-output-limits': ['/leaderboards/llm/coding/', '/leaderboards/llm/value/'],
} as const;

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
      readFile(join(outputRoot, 'track-claude-code-usage', 'index.html'), 'utf8'),
    ]);

    for (const html of [hub, article]) {
      expect(html).toContain('id="page-content"');
      expect(html).toContain('tabindex="-1"');
      expect(html).toContain('href="/cost/calculator/#calculator"');
      expect(html).not.toContain('href="/#calculator"');
    }
  });

  it('writes branded canonical articles with honest leaderboard context', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'tokenbench-guide-pages-'));
    temporaryRoots.push(outputRoot);

    await generateGuidePages(outputRoot);

    for (const [slug, paths] of Object.entries(expectedLeaderboardPaths)) {
      const html = await readFile(join(outputRoot, slug, 'index.html'), 'utf8');

      expect(html).toContain('TokenBench');
      expect(html).not.toContain('AI Cost Engine');
      expect(html).toContain(`<link rel="canonical" href="https://tokenbench.monomind.one/articles/guides/${slug}/">`);
      expect(html).toContain('"@type":"Article"');
      expect(html).toContain('"@type":"BreadcrumbList"');
      expect(html).toContain('href="/cost/calculator/#calculator"');
      expect(html).toContain('"item":"https://tokenbench.monomind.one/articles/guides/"');
      for (const path of paths) expect(html).toContain(`href="${path}"`);
    }
  });
});
