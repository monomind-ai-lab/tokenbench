import { access, mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { previewStaticEntries, type PreviewStaticEntry } from '../src/preview/route-manifest';
import { generateStaticPages } from './generate-static-pages';
import { copyMakeItYoursPreview, prototypeBundleEntries } from './make-it-yours-preview';

const outputRoots: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(outputRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('approved preview bundle', () => {
  it('copies only prototype-delivered static entries from the manifest', async () => {
    const reactEntry: PreviewStaticEntry = {
      routeId: 'models',
      delivery: 'react',
      source: 'prototype-bundle',
      outputPathname: '/models/',
      output: ['models', 'index.html'],
      document: 'index.html',
      clearOutputDirectory: true,
      match: {
        routeId: 'models',
        pathname: '/models/',
        search: new URLSearchParams(),
        hash: '',
        params: {},
      },
    };

    expect(prototypeBundleEntries()).toEqual(
      previewStaticEntries().filter((entry) => entry.source === 'prototype-bundle' && entry.delivery === 'prototype'),
    );
    expect(prototypeBundleEntries([reactEntry])).toEqual([]);

    const outputDir = await mkdtemp(join(tmpdir(), 'tokenbench-react-delivery-preview-'));
    outputRoots.push(outputDir);
    await mkdir(join(outputDir, 'models'), { recursive: true });
    await writeFile(join(outputDir, 'models', 'index.html'), 'react delivery');

    await copyMakeItYoursPreview(outputDir, [reactEntry]);

    await expect(readFile(join(outputDir, 'models', 'index.html'), 'utf8')).resolves.toBe('react delivery');
  });

  it('ships the list-first weighted score and cost insight contract', async () => {
    const script = await readFile('prototypes/ui-revamp-3/make-it-yours.js', 'utf8');

    expect(script).toContain("let view = 'rows';");
    expect(script).toContain('function weightedFrontier(models)');
    expect(script).toContain('function renderWeightedInsights(models)');
  });

  it('builds a crawlable React Popular Models document without a prototype workbench mount', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'tokenbench-popular-models-preview-'));
    outputRoots.push(outputDir);

    await generateStaticPages(process.cwd());
    await execFileAsync('npx', ['vite', 'build', '--outDir', outputDir], { cwd: process.cwd() });

    const document = await readFile(join(outputDir, 'popular-models', 'index.html'), 'utf8');
    expect(document).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/popular-models/">');
    expect(document).toContain('<meta name="description" content="Explore an interactive TokenBench prototype for comparing popular AI models across quality, category performance, and cost per successful task.">');
    expect(document).toContain('<h1 id="popular-models-heading" class="leaderboard-page-hero-title">Popular models leaderboard</h1>');
    expect(document).toContain('Every name, score, cost, verbosity value');
    expect(document).toContain('<script id="popular-models-initial-data" type="application/json">');
    expect(document).not.toContain('data-popular-models-workbench');
  }, 30_000);

  it('publishes every rebuilt page and its runtime assets at the approved routes', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'tokenbench-make-it-yours-'));
    outputRoots.push(outputDir);

    await generateStaticPages(process.cwd());
    await execFileAsync('npx', ['vite', 'build', '--outDir', outputDir], { cwd: process.cwd() });

    const document = await readFile(join(outputDir, 'make-it-yours', 'index.html'), 'utf8');
    expect(document).toContain('<title>Make it yours — TokenBench</title>');
    expect(document).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/make-it-yours/">');
    expect(document).toContain('<script id="make-it-yours-initial-data" type="application/json">');
    expect(document).toContain('/assets/main.js');
    expect(document).toContain('/assets/tokenbench.css');
    expect(document).not.toContain('/ui-revamp-3-assets/make-it-yours.js');
    const reactPages = [
      ['index.html', 'API cost preview'],
      [join('popular-models', 'index.html'), 'popular-models-page'],
      [join('make-it-yours', 'index.html'), 'make-it-yours-page'],
      [join('subscribe-vs-api', 'index.html'), 'subscribe-vs-api-page'],
    ] as const;
    for (const [file, expectedText] of reactPages) {
      const html = await readFile(join(outputDir, file), 'utf8');
      expect(html).toContain(expectedText);
      expect(html).toContain('/assets/main.js');
      expect(html).toContain('/assets/tokenbench.css');
      expect(html).not.toContain('/ui-revamp-3-assets/common.js');
    }
    await expect(access(join(outputDir, 'ui-revamp-3-assets'))).rejects.toMatchObject({ code: 'ENOENT' });

    const guideDetail = await readFile(join(outputDir, 'articles', 'track-claude-code-usage', 'index.html'), 'utf8');
    expect(guideDetail).toContain('How to Track Claude Code Usage, Tokens, and Spend');
    expect(guideDetail).toContain('href="/articles/monitor-openai-codex-usage/"');
  }, 30_000);
});
