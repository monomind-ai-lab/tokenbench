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
const THEME_BOOTSTRAP = "<script>try{var theme=localStorage.getItem('tokenbench:theme'),explicit=localStorage.getItem('tokenbench:theme:explicit')==='true';if(theme&&explicit){document.documentElement.dataset.theme=theme}else{if(theme)localStorage.removeItem('tokenbench:theme');document.documentElement.dataset.theme='dark'}}catch(e){document.documentElement.dataset.theme='dark'}</script>";

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
    const compareHub = await readFile(join(root, 'compare/index.html'), 'utf8');
    const leaderboardDirectory = await readFile(join(root, 'leaderboards/index.html'), 'utf8');
    const leaderboard = await readFile(join(root, 'leaderboards/llm/overall/index.html'), 'utf8');
    const coding = await readFile(join(root, 'leaderboards/llm/coding/index.html'), 'utf8');
    const reasoning = await readFile(join(root, 'leaderboards/llm/reasoning/index.html'), 'utf8');
    const knowledge = await readFile(join(root, 'leaderboards/llm/knowledge/index.html'), 'utf8');
    const multimodal = await readFile(join(root, 'leaderboards/multimodal/vision-documents/index.html'), 'utf8');
    const methodology = await readFile(join(root, 'methodology/benchalign/index.html'), 'utf8');
    const popularModels = await readFile(join(root, 'popular-models/index.html'), 'utf8');
    const guide = await readFile(join(root, 'guides/track-claude-code-usage/index.html'), 'utf8');
    const sitemap = await readFile(join(root, 'public/sitemaps/static.xml'), 'utf8');

    expect(home).toContain('<h1>Transparent AI Costs. Verified Benchmarks.</h1>');
    expect(home).toContain('<html lang="en" data-theme="dark">');
    expect(home).toContain(THEME_BOOTSTRAP);
    expect(home).toContain('The free decision engine for your AI stack. Evaluate exact model pricing and source-backed performance data so you can choose the best LLM for your workload.');
    expect(home).toContain('<meta name="description" content="The free decision engine for your AI stack. Evaluate exact model pricing and source-backed performance data so you can choose the best LLM for your workload.">');
    expect(home).toContain('<main id="page-content" class="page-main" tabindex="-1">');
    expect(home).toContain('<link rel="canonical" href="https://tokenbench.monomind.one">');
    expect(home).toContain('<script type="application/ld+json">');
    expect(home).toContain('TokenBench');

    expect(compareHub).toContain('<h1>Compare models<br/> side by side</h1>');
    expect(compareHub).toContain('Compare evidence, not a fabricated universal score');

    expect(leaderboardDirectory).toContain('<h1>Model leaderboards</h1>');
    expect(leaderboardDirectory).toContain('Explore current model leaders by capability, workload, cost, and human preference.');
    expect(leaderboardDirectory).toContain('<a href="/leaderboards/llm/coding/">Coding benchmark</a>');
    expect(leaderboardDirectory).toContain('<a href="/leaderboards/multimodal/vision-documents/">Multimodal</a>');
    expect(leaderboardDirectory).not.toContain('Coding performance');
    expect(leaderboardDirectory).not.toContain('Vision and documents');

    expect(leaderboard).toContain('<h1>Overall benchmarks</h1>');
    expect(leaderboard).toContain('Live ranking data is not embedded in this static shell.');
    expect(leaderboard).toContain('<meta property="og:url" content="https://tokenbench.monomind.one/leaderboards/llm/overall/">');
    expect(coding).toContain('<title>Coding benchmark | TokenBench</title>');
    expect(multimodal).toContain('<title>Multimodal | TokenBench</title>');

    expect(reasoning).toContain('<h1>Reasoning</h1>');
    expect(reasoning).toContain('not a validated BenchAlign ranking');
    expect(reasoning).toContain('<meta property="og:url" content="https://tokenbench.monomind.one/leaderboards/llm/reasoning/">');
    expect(knowledge).toContain('<h1>Knowledge</h1>');
    expect(knowledge).toContain('If BenchLM has not published the reviewed category metric');
    expect(knowledge).toContain('<meta property="og:url" content="https://tokenbench.monomind.one/leaderboards/llm/knowledge/">');

    expect(methodology).toContain('<h1>How BenchAlign rankings work</h1>');
    expect(methodology).toContain('TokenBench republishes BenchLM&#039;s BenchAlign results');
    expect(methodology).toContain('https://benchlm.ai/methodology');
    expect(methodology).toContain('Published method version: <strong>Unavailable</strong>.');

    expect(popularModels).toContain('<h1>Popular models leaderboard</h1>');
    expect(popularModels).toContain('Interactive frontend prototype');
    expect(popularModels).toContain('https://tokenbench.monomind.one/popular-models/');

    expect(home).toContain('<a href="/methodology/benchalign/">Methodology</a>');
    expect(home).not.toContain('href="/sources/"');

    expect(guide).toContain('<h1>How to Track Claude Code Usage, Tokens, and Spend</h1>');
    expect(guide).toContain('<html lang="en" data-theme="dark">');
    expect(guide).toContain(THEME_BOOTSTRAP);
    expect(guide).toContain('<main id="page-content" class="guides-main article-main" tabindex="-1">');
    expect(guide).toContain('<meta property="og:type" content="article">');
    expect(guide).toContain('https://tokenbench.monomind.one/guides/track-claude-code-usage/');

    expect(sitemap).toContain('<loc>https://tokenbench.monomind.one/tools/subscriptions-vs-apis/</loc>');
    expect(sitemap).toContain('<loc>https://tokenbench.monomind.one/leaderboards/llm/reasoning/</loc>');
    expect(sitemap).toContain('<loc>https://tokenbench.monomind.one/leaderboards/llm/knowledge/</loc>');
    expect(sitemap).toContain('<loc>https://tokenbench.monomind.one/leaderboards/media/video-editing/</loc>');
    expect(sitemap).toContain('<loc>https://tokenbench.monomind.one/methodology/benchalign/</loc>');
    expect(sitemap).toContain('<loc>https://tokenbench.monomind.one/privacy/</loc>');
    expect(sitemap).toContain('<loc>https://tokenbench.monomind.one/popular-models/</loc>');
    expect(sitemap).not.toContain('/welcome/');
    expect(new Set(sitemap.match(/<loc>[^<]+<\/loc>/g)).size).toBe(sitemap.match(/<loc>[^<]+<\/loc>/g)?.length);
    expect(sitemap).not.toContain('/compare/claude-4-vs-gpt-5');
  });

  it('publishes the standalone confirmation entry with transactional chrome and noindex metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tokenbench-static-pages-'));
    outputRoots.push(root);

    await generateStaticPages(root);

    const confirmed = await readFile(join(root, 'newsletter', 'confirmed', 'index.html'), 'utf8');
    expect(confirmed).toContain('<h1 id="newsletter-confirmed-heading">Your subscription is confirmed.</h1>');
    expect(confirmed).toContain('The current TokenBench test cheatsheet will arrive by email.');
    expect(confirmed).toContain('<meta name="robots" content="noindex,follow,max-image-preview:large">');
    expect(confirmed).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/newsletter/confirmed/">');
    expect(confirmed).toContain('class="transactional-page-shell"');
    expect(confirmed).not.toContain('class="static-page-shell"');
    expect(confirmed).not.toContain('<header class="top-header">');
    expect(confirmed).not.toContain('<footer class="app-footer">');
    expect(confirmed).not.toContain('google_translate_element');
    expect(confirmed).not.toContain('googleTranslateElementInit');
    expect(confirmed).not.toContain('translate.google.com');
    expect(confirmed).toContain('<a class="button" href="/">Start Exploring</a>');
    expect(confirmed.match(/<a\b/gu)).toHaveLength(1);
    expect(confirmed).toContain('<script type="application/ld+json">');
    expect(confirmed).toContain('"@type":"WebPage"');

    const sitemap = await readFile(join(root, 'public', 'sitemaps', 'static.xml'), 'utf8');
    expect(sitemap).not.toContain('/newsletter/confirmed/');
  });

  it('publishes the welcome landing as a noindex static page and the privacy policy as an indexable page', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tokenbench-static-pages-'));
    outputRoots.push(root);

    await generateStaticPages(root);

    const welcome = await readFile(join(root, 'welcome', 'index.html'), 'utf8');
    expect(welcome).toContain('<h1>Welcome to TokenBench</h1>');
    expect(welcome).toContain('<meta name="robots" content="noindex,follow,max-image-preview:large">');
    expect(welcome).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/welcome/">');
    expect(welcome).toContain('class="app-shell static-page-shell"');
    expect(welcome).toContain('class="static-page-links home-hero-actions"');
    expect(welcome).toContain('Review Your Subscriptions');
    expect(welcome).toContain('<img src="/brand/welcome-cover.jpg"');
    expect(welcome).toContain('Nikita Kachanovsky');
    expect(welcome).toContain('welcome-cover');
    expect(welcome).not.toContain('class="transactional-page-shell"');

    const privacy = await readFile(join(root, 'privacy', 'index.html'), 'utf8');
    expect(privacy).toContain('<h1>Privacy Policy for TokenBench</h1>');
    expect(privacy).toContain('<meta name="robots" content="index,follow,max-image-preview:large">');
    expect(privacy).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/privacy/">');
    expect(privacy).toContain('privacy@monomind.one');
    expect(privacy).toContain('We <strong>do not sell or rent</strong>');
    expect(privacy).toContain('class="content-stack static-page-content static-policy"');
  });

  it.each([
    {
      label: 'malicious markup',
      upstreamRevision: '</strong><script>globalThis.compromised=true</script>',
      schemaVersion: 'schema-malicious-environment',
    },
    {
      label: 'a stale revision',
      upstreamRevision: 'benchlm-method-2025-01-stale',
      schemaVersion: 'schema-stale-environment',
    },
    {
      label: 'mismatched revision and schema variables',
      upstreamRevision: 'benchlm-method-from-revision-a',
      schemaVersion: 'schema-from-revision-b',
    },
  ])('does not publish $label from free-text build variables without a validated active summary artifact', async ({
    upstreamRevision,
    schemaVersion,
  }) => {
    const root = await mkdtemp(join(tmpdir(), 'tokenbench-static-pages-'));
    outputRoots.push(root);
    const previousRevision = process.env.TOKENBENCH_BENCHALIGN_UPSTREAM_REVISION;
    const previousSchema = process.env.TOKENBENCH_BENCHALIGN_SCHEMA_VERSION;
    process.env.TOKENBENCH_BENCHALIGN_UPSTREAM_REVISION = upstreamRevision;
    process.env.TOKENBENCH_BENCHALIGN_SCHEMA_VERSION = schemaVersion;

    try {
      await generateStaticPages(root);
      const methodology = await readFile(join(root, 'methodology/benchalign/index.html'), 'utf8');
      expect(methodology).toContain('Published method version: <strong>Unavailable</strong>.');
      expect(methodology).not.toContain(upstreamRevision);
      expect(methodology).not.toContain(schemaVersion);
    } finally {
      if (previousRevision === undefined) delete process.env.TOKENBENCH_BENCHALIGN_UPSTREAM_REVISION;
      else process.env.TOKENBENCH_BENCHALIGN_UPSTREAM_REVISION = previousRevision;
      if (previousSchema === undefined) delete process.env.TOKENBENCH_BENCHALIGN_SCHEMA_VERSION;
      else process.env.TOKENBENCH_BENCHALIGN_SCHEMA_VERSION = previousSchema;
    }
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
    expect(FIXED_ROUTES).toHaveLength(32);
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
