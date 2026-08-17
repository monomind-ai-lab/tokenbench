import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { generateStaticPages } from './generate-static-pages';

const execFileAsync = promisify(execFile);
const outputRoots: string[] = [];

afterEach(async () => {
  await Promise.all(outputRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('cost preview bundle integration', () => {
  it('defines /subscribe-vs-api as the sole preview cost destination', async () => {
    const shell = await readFile('prototypes/ui-revamp-3/common.js', 'utf8');

    expect(shell).toContain("cost:'/subscribe-vs-api'");
    expect(shell).not.toContain("costCalculator:'/cost/calculator'");
    expect(shell).not.toContain("costBreakeven:'/cost/breakeven'");
  });

  it('builds one React calculator document into the canonical Pages path', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'tokenbench-cost-preview-'));
    outputRoots.push(outputDir);
    await generateStaticPages(process.cwd());
    await execFileAsync('npx', ['vite', 'build', '--outDir', outputDir], { cwd: process.cwd() });

    const html = await readFile(join(outputDir, 'subscribe-vs-api', 'index.html'), 'utf8');
    const redirects = await readFile(join(outputDir, '_redirects'), 'utf8');
    expect(html).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/subscribe-vs-api/">');
    expect(html).toContain('<script id="subscribe-vs-api-initial-data" type="application/json">');
    expect(html).toContain('Exact API and Monthly subscription crossover values');
    expect(html).toContain('/assets/main.js');
    expect(html).toContain('/assets/tokenbench.css');
    expect(html).not.toContain('/ui-revamp-3-assets/cost-calculator.js');
    expect(html).not.toContain('/ui-revamp-3-assets/chart.umd.js');

    for (const legacyPath of [
      '/tools/subscriptions-vs-apis',
      '/tools/subscriptions-vs-apis/',
      '/cost',
      '/cost/',
      '/cost/calculator',
      '/cost/calculator/',
      '/cost/breakeven',
      '/cost/breakeven/',
    ]) {
      expect(redirects).toContain(`${legacyPath} /subscribe-vs-api/ 301`);
    }

    for (const route of ['cost', join('cost', 'calculator'), join('cost', 'breakeven'), join('tools', 'subscriptions-vs-apis')]) {
      await expect(access(join(outputDir, route, 'index.html'))).rejects.toMatchObject({ code: 'ENOENT' });
    }

    await expect(access(join(outputDir, 'ui-revamp-3-assets', 'cost-calculator.js'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(join(outputDir, 'ui-revamp-3-assets', 'chart.umd.js'))).rejects.toMatchObject({ code: 'ENOENT' });
  }, 120_000);
});
