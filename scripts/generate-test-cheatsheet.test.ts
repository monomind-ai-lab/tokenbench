import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildBlankTestCheatsheetPdf } from '../src/newsletter/test-cheatsheet';
import { TEST_CHEATSHEET_FILENAME, generateTestCheatsheet, sha256Hex } from './generate-test-cheatsheet';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function freshRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tokenbench-test-cheatsheet-'));
  temporaryRoots.push(root);
  return root;
}

describe('test cheatsheet generator', () => {
  it('writes a deterministic blank PDF asset under public/downloads', async () => {
    const root = await freshRoot();
    const first = await generateTestCheatsheet(root);
    const second = await generateTestCheatsheet(root);

    expect(first.filename).toBe(TEST_CHEATSHEET_FILENAME);
    expect(first.outputPath).toBe(join(root, 'public', 'downloads', TEST_CHEATSHEET_FILENAME));
    expect(first.bytes).toBe(second.bytes);
    expect(first.sha256).toBe(second.sha256);
  });

  it('persists exactly the module-level deterministic PDF bytes', async () => {
    const root = await freshRoot();
    await generateTestCheatsheet(root);

    const written = await readFile(join(root, 'public', 'downloads', TEST_CHEATSHEET_FILENAME));
    expect(Array.from(written)).toEqual(Array.from(buildBlankTestCheatsheetPdf()));
  });

  it('records the SHA-256 hex digest of the generated asset', async () => {
    const root = await freshRoot();
    const output = await generateTestCheatsheet(root);

    expect(output.sha256).toMatch(/^[0-9a-f]{64}$/u);
    const digest = createHash('sha256').update(buildBlankTestCheatsheetPdf()).digest('hex');
    expect(output.sha256).toBe(digest);
    expect(sha256Hex(buildBlankTestCheatsheetPdf())).toBe(output.sha256);
  });
});
