import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateStaticPages } from './generate-static-pages';

const outputRoots: string[] = [];

afterEach(async () => {
  await Promise.all(outputRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('crawlable static-page generator', () => {
  it('writes fixed-route HTML, guide articles, and a static-only sitemap from the TokenBench registry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tokenbench-static-pages-'));
    outputRoots.push(root);

    await generateStaticPages(root);

    const home = await readFile(join(root, 'index.html'), 'utf8');
    const leaderboard = await readFile(join(root, 'leaderboards/llm/overall/index.html'), 'utf8');
    const guide = await readFile(join(root, 'guides/track-claude-code-usage/index.html'), 'utf8');
    const sitemap = await readFile(join(root, 'public/sitemaps/static.xml'), 'utf8');

    expect(home).toContain('<h1>AI cost and model benchmark decisions</h1>');
    expect(home).toContain('<link rel="canonical" href="https://tokenbench.monomind.one">');
    expect(home).toContain('<script type="application/ld+json">');
    expect(home).toContain('TokenBench');

    expect(leaderboard).toContain('<h1>Overall AI model benchmarks</h1>');
    expect(leaderboard).toContain('Live ranking data is not embedded in this static shell.');
    expect(leaderboard).toContain('<meta property="og:url" content="https://tokenbench.monomind.one/leaderboards/llm/overall/">');

    expect(guide).toContain('<h1>How to Track Claude Code Usage, Tokens, and Spend</h1>');
    expect(guide).toContain('<meta property="og:type" content="article">');
    expect(guide).toContain('https://tokenbench.monomind.one/guides/track-claude-code-usage/');

    expect(sitemap).toContain('<loc>https://tokenbench.monomind.one/tools/subscriptions-vs-apis/</loc>');
    expect(sitemap).toContain('<loc>https://tokenbench.monomind.one/leaderboards/media/video-editing/</loc>');
    expect(sitemap).not.toContain('/compare/claude-4-vs-gpt-5');
  });
});
