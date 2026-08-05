import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateGuidePages } from './generate-guide-pages';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('generateGuidePages', () => {
  it('points crawlable guide calculator calls to the dedicated calculator route', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'tokenbench-guide-pages-'));
    temporaryRoots.push(outputRoot);

    await generateGuidePages(outputRoot);

    const [hub, article] = await Promise.all([
      readFile(join(outputRoot, 'index.html'), 'utf8'),
      readFile(join(outputRoot, 'track-claude-code-usage', 'index.html'), 'utf8'),
    ]);

    for (const html of [hub, article]) {
      expect(html).toContain('href="/tools/subscriptions-vs-apis/#calculator"');
      expect(html).not.toContain('href="/#calculator"');
    }
  });
});
