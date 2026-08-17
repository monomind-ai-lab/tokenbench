import { access, mkdtemp, rm, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

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

  it('publishes every rebuilt page and its runtime assets at the approved routes', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'tokenbench-make-it-yours-'));
    outputRoots.push(outputDir);

    await execFileAsync('npx', ['vite', 'build', '--outDir', outputDir], { cwd: process.cwd() });

    const document = await readFile(join(outputDir, 'make-it-yours', 'index.html'), 'utf8');
    const sharedAssets = join(outputDir, 'ui-revamp-3-assets');
    const shellScript = await readFile(join(sharedAssets, 'common.js'), 'utf8');
    expect(document).toContain('<title>Make it yours — TokenBench</title>');
    expect(document).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/make-it-yours/">');
    expect(document).toContain('src="/ui-revamp-3-assets/make-it-yours.js');
    expect(document).toContain('href="/ui-revamp-3-assets/styles.css');
    expect(shellScript).toContain("const leaderboardActive=current==='make-it-yours';");
    expect(shellScript).toContain("location.pathname.replace(/\\/+$/, '').split('/').pop()||'index'");

    const expectedPages = [
      ['index.html', 'Empirical evidence for practical AI runtime and cost decisions.'],
      ['models.html', 'Models workbench'],
      [join('models', 'index.html'), 'Models workbench'],
      ['compare.html', 'Compare models'],
      [join('compare', 'index.html'), 'Compare models'],
      [join('model-profile', 'index.html'), 'Model profile'],
      [join('model-lifecycle', 'index.html'), 'Model lifecycle'],
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
  }, 30_000);
});
