import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateGuidePages } from './generate-guide-pages';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('generateGuidePages', () => {
  it('writes only the legacy guide hub because the React manifest owns canonical article detail documents', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'tokenbench-guide-pages-'));
    temporaryRoots.push(outputRoot);

    await generateGuidePages(outputRoot);

    const hub = await readFile(join(outputRoot, 'guides', 'index.html'), 'utf8');

    expect(hub).toContain('id="page-content"');
    expect(hub).toContain('href="/articles/track-claude-code-usage/"');
    await expect(access(join(outputRoot, 'articles', 'track-claude-code-usage', 'index.html'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps the remaining guide hub links canonical', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'tokenbench-guide-pages-'));
    temporaryRoots.push(outputRoot);

    await generateGuidePages(outputRoot);

    const html = await readFile(join(outputRoot, 'guides', 'index.html'), 'utf8');
    expect(html).toContain('TokenBench');
    expect(html).not.toContain('AI Cost Engine');
    expect(html).toContain('href="/articles/track-claude-code-usage/"');
    expect(html).not.toContain('href="/guides/track-claude-code-usage/"');
  });
});
