import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

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

  it('copies one consolidated calculator into the canonical Pages path with shared assets', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'tokenbench-cost-preview-'));
    outputRoots.push(outputDir);
    await execFileAsync('npx', ['vite', 'build', '--outDir', outputDir], { cwd: process.cwd() });

    const html = await readFile(join(outputDir, 'subscribe-vs-api', 'index.html'), 'utf8');
    const redirects = await readFile(join(outputDir, '_redirects'), 'utf8');
    expect(html).toContain('href="/ui-revamp-3-assets/styles.css');
    expect(html).toContain('src="/ui-revamp-3-assets/common.js');
    expect(html).toContain('src="/ui-revamp-3-assets/chart.umd.js');
    expect(html).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/subscribe-vs-api/">');

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

    await expect(access(join(outputDir, 'ui-revamp-3-assets', 'cost-calculator.js'))).resolves.toBeUndefined();
    await expect(access(join(outputDir, 'ui-revamp-3-assets', 'chart.umd.js'))).resolves.toBeUndefined();
  }, 120_000);
});
