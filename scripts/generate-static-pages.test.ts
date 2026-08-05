import { execFile, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { FIXED_ROUTES } from '../src/routing/routes';
import { generateStaticPages } from './generate-static-pages';

const outputRoots: string[] = [];
const execFileAsync = promisify(execFile);
const requireFromTest = createRequire(import.meta.url);

function gitCheckIgnoreStatus(pathname: string): number | null {
  const result = spawnSync('git', ['check-ignore', '--quiet', '--no-index', pathname], {
    cwd: process.cwd(),
  });
  if (result.error) throw result.error;
  return result.status;
}

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

  it('preserves unowned files inside generated route trees', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tokenbench-static-pages-'));
    outputRoots.push(root);
    const leaderboardSentinel = join(root, 'leaderboards', 'editor-notes.txt');
    const guideSentinel = join(root, 'guides', 'drafts', 'keep-me.txt');
    await mkdir(join(root, 'leaderboards'), { recursive: true });
    await mkdir(join(root, 'guides', 'drafts'), { recursive: true });
    await writeFile(leaderboardSentinel, 'leaderboard notes');
    await writeFile(guideSentinel, 'guide draft');

    await generateStaticPages(root);

    await expect(readFile(leaderboardSentinel, 'utf8')).resolves.toBe('leaderboard notes');
    await expect(readFile(guideSentinel, 'utf8')).resolves.toBe('guide draft');
  });

  it('preserves unowned guide files when the guide CLI runs directly', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tokenbench-guide-pages-'));
    outputRoots.push(root);
    const sentinel = join(root, 'guides', 'editor-notes.txt');
    await mkdir(join(root, 'guides'), { recursive: true });
    await writeFile(sentinel, 'keep this guide note');

    const scriptPath = resolve(process.cwd(), 'scripts/generate-guide-pages.ts');
    await execFileAsync(process.execPath, ['--import', requireFromTest.resolve('tsx'), scriptPath], { cwd: root });

    await expect(readFile(sentinel, 'utf8')).resolves.toBe('keep this guide note');
  });

  it('ignores every owned generated page without hiding unowned index pages', () => {
    expect(FIXED_ROUTES).toHaveLength(23);
    expect(gitCheckIgnoreStatus('index.html'), 'tracked root source shell').toBe(1);

    const generatedPages = FIXED_ROUTES
      .filter(({ pathname }) => pathname !== '/')
      .map(({ pathname }) => `${pathname.slice(1)}index.html`);
    const unownedPages = [
      'guides/drafts/index.html',
      'leaderboards/llm/research-notes/index.html',
      'leaderboards/media/drafts/index.html',
    ] as const;

    for (const pathname of generatedPages) {
      expect(gitCheckIgnoreStatus(pathname), pathname).toBe(0);
    }
    for (const pathname of unownedPages) {
      expect(gitCheckIgnoreStatus(pathname), pathname).toBe(1);
    }
  });
});
