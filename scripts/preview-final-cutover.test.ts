import { access, readdir, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { previewRoutes } from '../src/preview/route-manifest';
import { generateStaticPages } from './generate-static-pages';

const execFileAsync = promisify(execFile);
const outputRoots: string[] = [];

afterEach(async () => {
  await Promise.all(outputRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function htmlFileFor(pathname: string): string {
  return join(...pathname.split('/').filter(Boolean), 'index.html');
}

async function builtFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? builtFiles(root, path) : [path.slice(root.length + 1)];
  }));
  return files.flat();
}

describe('final React preview cutover', () => {
  it('ships direct React documents without prototype runtime assets or an SPA catch-all', async () => {
    const outputDir = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(join(tmpdir(), 'tokenbench-final-cutover-')));
    outputRoots.push(outputDir);
    await generateStaticPages(process.cwd());
    await execFileAsync('npx', ['vite', 'build', '--outDir', outputDir], { cwd: process.cwd() });

    for (const route of previewRoutes) {
      const document = join(outputDir, htmlFileFor(route.outputPathname));
      await expect(access(document)).resolves.toBeUndefined();
      const html = await readFile(document, 'utf8');
      expect(html).toContain('class="top-header"');
      expect(html).toContain('class="app-footer"');
      expect(html).toMatch(/<h1(?:\s[^>]*)?>/u);
      expect(html).toContain('/assets/main.js');
      expect(html).toContain('/assets/tokenbench.css');
      expect(html).not.toMatch(/ui-revamp-3-assets|common\.js|data\.js|chart\.umd\.js/u);
    }

    expect((await builtFiles(outputDir)).join('\n')).not.toMatch(/ui-revamp-3-assets|common\.js|data\.js|chart\.umd\.js/u);
    const redirects = await readFile(join(outputDir, '_redirects'), 'utf8');
    expect(redirects).not.toMatch(/^\s*\/\*\s+\//mu);
    for (const pathname of ['/cost', '/cost/calculator', '/guides/track-claude-code-usage/']) {
      expect(redirects).toContain(pathname);
    }
  }, 120_000);
});
