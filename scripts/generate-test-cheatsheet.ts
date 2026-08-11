import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_CHEATSHEET_FILENAME, buildBlankTestCheatsheetPdf } from '../src/newsletter/test-cheatsheet';

export { TEST_CHEATSHEET_FILENAME } from '../src/newsletter/test-cheatsheet';

export interface GeneratedTestCheatsheet {
  readonly filename: string;
  readonly outputPath: string;
  readonly bytes: number;
  readonly sha256: string;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Writes the deterministic blank test-cheatsheet PDF to the public download
 * directory. Reruns are byte-identical, so the committed asset, the prebuild
 * regeneration, and this helper always agree.
 */
export async function generateTestCheatsheet(rootDir: string): Promise<GeneratedTestCheatsheet> {
  const pdf = buildBlankTestCheatsheetPdf();
  const outputPath = resolve(rootDir, 'public', 'downloads', TEST_CHEATSHEET_FILENAME);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, pdf);
  return {
    filename: TEST_CHEATSHEET_FILENAME,
    outputPath,
    bytes: pdf.byteLength,
    sha256: sha256Hex(pdf),
  };
}

async function runTestCheatsheetCli(): Promise<void> {
  const output = await generateTestCheatsheet(process.cwd());
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runTestCheatsheetCli();
}
