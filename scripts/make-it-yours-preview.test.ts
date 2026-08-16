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
  it('publishes every rebuilt page and its runtime assets at the approved routes', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'tokenbench-make-it-yours-'));
    outputRoots.push(outputDir);

    await execFileAsync('npx', ['vite', 'build', '--outDir', outputDir], { cwd: process.cwd() });

    const document = await readFile(join(outputDir, 'make-it-yours', 'index.html'), 'utf8');
    const shellScript = await readFile(join(outputDir, 'make-it-yours', 'common.js'), 'utf8');
    expect(document).toContain('<title>Make it yours — TokenBench</title>');
    expect(document).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/make-it-yours/">');
    expect(document).toContain('src="make-it-yours.js');
    expect(shellScript).toContain("const leaderboardActive=current==='make-it-yours';");
    expect(shellScript).toContain("location.pathname.replace(/\\/+$/, '').split('/').pop()||'index'");
    await expect(access(join(outputDir, 'make-it-yours', 'styles.css'))).resolves.toBeUndefined();
    await expect(access(join(outputDir, 'make-it-yours', 'data.js'))).resolves.toBeUndefined();
    await expect(access(join(outputDir, 'make-it-yours', 'common.js'))).resolves.toBeUndefined();
    await expect(access(join(outputDir, 'make-it-yours', 'make-it-yours.js'))).resolves.toBeUndefined();
    await expect(access(join(outputDir, 'make-it-yours', 'assets', 'monomind-tokenbench.png'))).resolves.toBeUndefined();

    const expectedPages = [
      ['models', 'Models workbench'],
      ['compare', 'Compare models'],
      ['model-profile', 'Model profile'],
      ['model-lifecycle', 'Model lifecycle'],
      ['articles', 'Articles'],
      [join('articles', 'hybrid-router'), 'A hybrid router for high-stakes agentic work'],
    ] as const;
    for (const [route, expectedText] of expectedPages) {
      const html = await readFile(join(outputDir, route, 'index.html'), 'utf8');
      expect(html).toContain(expectedText);
      await expect(access(join(outputDir, route, 'styles.css'))).resolves.toBeUndefined();
      await expect(access(join(outputDir, route, 'common.js'))).resolves.toBeUndefined();
      await expect(access(join(outputDir, route, 'assets', 'monomind-tokenbench.png'))).resolves.toBeUndefined();
    }
    await expect(access(join(outputDir, 'models', 'data.js'))).resolves.toBeUndefined();
    await expect(access(join(outputDir, 'compare', 'data.js'))).resolves.toBeUndefined();
    await expect(access(join(outputDir, 'model-profile', 'data.js'))).resolves.toBeUndefined();
    await expect(access(join(outputDir, 'model-lifecycle', 'data.js'))).resolves.toBeUndefined();
    await expect(access(join(outputDir, 'articles', 'articles.js'))).resolves.toBeUndefined();
    await expect(access(join(outputDir, 'articles', 'hybrid-router', 'article-detail.js'))).resolves.toBeUndefined();
  }, 30_000);
});
