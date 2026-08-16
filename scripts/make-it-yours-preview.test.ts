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

describe('Make it yours preview bundle', () => {
  it('publishes the renamed prototype and its runtime assets at the canonical route', async () => {
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
  }, 30_000);
});
