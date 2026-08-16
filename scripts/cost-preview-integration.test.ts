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
  it('defines the hub and canonical calculator destinations in the preview shell', async () => {
    const [hub, shell] = await Promise.all([
      readFile('prototypes/ui-revamp-3/cost.html', 'utf8'),
      readFile('prototypes/ui-revamp-3/common.js', 'utf8'),
    ]);

    expect(hub).toContain('Monthly cost simulator');
    expect(hub).toContain('Breakeven calculator');
    expect(hub).toContain('href="/cost/calculator"');
    expect(hub).toContain('href="/cost/breakeven"');
    expect(shell).toContain("cost:'/cost'");
    expect(shell).toContain("costCalculator:'/cost/calculator'");
    expect(shell).toContain("costBreakeven:'/cost/breakeven'");
  });

  it('copies the hub and calculators into canonical Pages paths with shared assets', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'tokenbench-cost-preview-'));
    outputRoots.push(outputDir);
    await execFileAsync('npx', ['vite', 'build', '--outDir', outputDir], { cwd: process.cwd() });

    for (const route of ['cost', join('cost', 'calculator'), join('cost', 'breakeven')]) {
      const htmlPath = join(outputDir, route, 'index.html');
      const html = await readFile(htmlPath, 'utf8');
      expect(html).toContain('href="/ui-revamp-3-assets/styles.css');
      expect(html).toContain('src="/ui-revamp-3-assets/common.js');
      if (route === join('cost', 'breakeven')) expect(html).toContain('src="/ui-revamp-3-assets/chart.umd.js');
    }

    for (const document of ['cost.html', join('cost', 'calculator.html'), join('cost', 'breakeven.html')]) {
      await expect(access(join(outputDir, document))).resolves.toBeUndefined();
    }

    await expect(access(join(outputDir, 'ui-revamp-3-assets', 'cost-calculator.js'))).resolves.toBeUndefined();
    await expect(access(join(outputDir, 'ui-revamp-3-assets', 'cost-breakeven.js'))).resolves.toBeUndefined();
    await expect(access(join(outputDir, 'ui-revamp-3-assets', 'chart.umd.js'))).resolves.toBeUndefined();
  }, 120_000);
});
