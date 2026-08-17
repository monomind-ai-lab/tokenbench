import { access, mkdtemp, rm, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { generateStaticPages } from './generate-static-pages';

const outputRoots: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(outputRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('approved preview bundle', () => {
  it('ships the list-first weighted score and cost insight contract', async () => {
    const script = await readFile('prototypes/ui-revamp-3/make-it-yours.js', 'utf8');

    expect(script).toContain("let view = 'rows';");
    expect(script).toContain('function weightedFrontier(models)');
    expect(script).toContain('function renderWeightedInsights(models)');
  });

  it('copies a crawlable Popular Models fallback into the built preview', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'tokenbench-popular-models-preview-'));
    outputRoots.push(outputDir);

    await generateStaticPages(process.cwd());
    await execFileAsync('npx', ['vite', 'build', '--outDir', outputDir], { cwd: process.cwd() });

    const document = await readFile(join(outputDir, 'popular-models', 'index.html'), 'utf8');
    expect(document).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/popular-models/">');
    expect(document).toContain('<meta name="description" content="Explore an interactive TokenBench prototype for comparing popular AI models across quality, category performance, and cost per successful task.">');
    expect(document).toContain('<h1 id="popular-models-fallback-heading">Popular models leaderboard</h1>');
    expect(document).toContain('Data boundary:');
    expect(document).toContain('illustrative prototype data until LiveBench and TokenBench data adapters are connected.');
  }, 30_000);

  it('publishes every rebuilt page and its runtime assets at the approved routes', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'tokenbench-make-it-yours-'));
    outputRoots.push(outputDir);

    await generateStaticPages(process.cwd());
    await execFileAsync('npx', ['vite', 'build', '--outDir', outputDir], { cwd: process.cwd() });

    const document = await readFile(join(outputDir, 'make-it-yours', 'index.html'), 'utf8');
    const sharedAssets = join(outputDir, 'ui-revamp-3-assets');
    const shellScript = await readFile(join(sharedAssets, 'common.js'), 'utf8');
    expect(document).toContain('<title>Make it yours — TokenBench</title>');
    expect(document).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/make-it-yours/">');
    expect(document).toContain('src="/ui-revamp-3-assets/make-it-yours.js');
    expect(document).toContain('href="/ui-revamp-3-assets/styles.css');
    expect(shellScript).toContain("const leaderboardActive=['make-it-yours','popular-models'].includes(currentPage);");
    expect(shellScript).toContain("location.pathname.replace(/\\/+$/, '').split('/').pop()||'index'");
    expect(shellScript).toContain("const currentPage=current.replace(/\\.html$/,'');");
    expect(shellScript).toContain("const costActive=['subscribe-vs-api'].includes(currentPage);");

    const expectedPages = [
      ['index.html', 'Empirical evidence for practical AI runtime and cost decisions.'],
      ['models.html', 'Models workbench'],
      [join('models', 'index.html'), 'Models workbench'],
      ['compare.html', 'Compare models'],
      [join('compare', 'index.html'), 'Compare models'],
      [join('model-profile', 'index.html'), 'Model profile'],
      [join('model-lifecycle', 'index.html'), 'Model lifecycle'],
      [join('popular-models', 'index.html'), 'data-popular-models-workbench'],
      ['articles.html', 'Articles'],
      [join('articles', 'index.html'), 'Articles'],
      [join('articles', 'hybrid-router.html'), 'A hybrid router for high-stakes agentic work'],
      [join('articles', 'hybrid-router', 'index.html'), 'A hybrid router for high-stakes agentic work'],
    ] as const;
    for (const [file, expectedText] of expectedPages) {
      const html = await readFile(join(outputDir, file), 'utf8');
      expect(html).toContain(expectedText);
      expect(html).toContain('href="/ui-revamp-3-assets/styles.css');
      expect(html).toContain('src="/ui-revamp-3-assets/common.js');
    }
    await expect(access(join(sharedAssets, 'styles.css'))).resolves.toBeUndefined();
    await expect(access(join(sharedAssets, 'data.js'))).resolves.toBeUndefined();
    await expect(access(join(sharedAssets, 'common.js'))).resolves.toBeUndefined();
    await expect(access(join(sharedAssets, 'make-it-yours.js'))).resolves.toBeUndefined();
    await expect(access(join(sharedAssets, 'articles.js'))).resolves.toBeUndefined();
    await expect(access(join(sharedAssets, 'article-detail.js'))).resolves.toBeUndefined();
    await expect(access(join(sharedAssets, 'assets', 'monomind-tokenbench.png'))).resolves.toBeUndefined();

    const guideDetail = await readFile(join(outputDir, 'articles', 'track-claude-code-usage', 'index.html'), 'utf8');
    expect(guideDetail).toContain('How to Track Claude Code Usage, Tokens, and Spend');
    expect(guideDetail).toContain('href="/articles/monitor-openai-codex-usage/"');
  }, 30_000);
});
