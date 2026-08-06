import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateNormalizedSourceBatch, type BenchmarkRevision } from '../src/benchmarks/contracts';
import { validateCatalogResponse } from '../src/catalog/validation';
import {
  buildCheatsheet,
  normalizePdfMetadata,
  renderCheatsheetCsv,
  renderCheatsheetHtml,
  renderNewsletterHtml,
  subjectPreviewSet,
  type CheatsheetDocument,
  type FrozenBenchmarkSnapshot,
} from '../src/newsletter/cheatsheet';
import type { CatalogResponse } from '../src/catalog/contracts';
import type { RevisionChanges } from '../src/newsletter/revision-diff';

export interface GenerateMonthlyCheatsheetArgs {
  readonly benchmarks: string;
  readonly catalog: string;
  readonly changes: string;
  readonly outDir: string;
  readonly shareImage?: boolean;
}

export interface GeneratedCheatsheetFile {
  readonly name: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface CheatsheetManifest {
  readonly schemaVersion: 'tokenbench-cheatsheet/v1';
  readonly revision: string;
  readonly catalogRevision: string;
  readonly generatedAt: string;
  readonly changes: {
    readonly fromRevision: string;
    readonly toRevision: string;
    readonly dedupeKey: string;
  };
  /** All generated assets except this manifest, which is written last. */
  readonly files: readonly GeneratedCheatsheetFile[];
}

export interface GeneratedCheatsheetBundle {
  readonly document: CheatsheetDocument;
  readonly manifest: CheatsheetManifest;
  /** Includes the manifest itself; manifest.files deliberately does not. */
  readonly files: readonly GeneratedCheatsheetFile[];
}

export interface CheatsheetBrowserPage {
  setContent(html: string, options?: { readonly waitUntil?: 'load' }): Promise<void>;
  emulateMedia(options?: { readonly media?: 'print' | 'screen' }): Promise<void>;
  pdf(options?: { readonly format?: 'A4'; readonly printBackground?: boolean }): Promise<Uint8Array>;
  screenshot(options?: { readonly type?: 'png' }): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface CheatsheetBrowserContext {
  newPage(): Promise<CheatsheetBrowserPage>;
  close(): Promise<void>;
}

export interface CheatsheetBrowser {
  newContext(options: {
    readonly locale: 'en-US';
    readonly timezoneId: 'UTC';
    readonly viewport?: { readonly width: number; readonly height: number };
    readonly deviceScaleFactor?: number;
  }): Promise<CheatsheetBrowserContext>;
  close(): Promise<void>;
}

export interface GenerateMonthlyCheatsheetDependencies {
  readonly launchBrowser: () => Promise<CheatsheetBrowser>;
}

const DEFAULT_DEPENDENCIES: GenerateMonthlyCheatsheetDependencies = {
  launchBrowser: async () => {
    const { chromium } = await import('@playwright/test');
    return chromium.launch();
  },
};
const ARTIFACT_NAMES = {
  csv: 'tokenbench-cheatsheet.csv',
  html: 'tokenbench-cheatsheet.html',
  newsletter: 'tokenbench-cheatsheet-newsletter.html',
  pdf: 'tokenbench-cheatsheet.pdf',
  share: 'tokenbench-cheatsheet-share.png',
  subjects: 'tokenbench-cheatsheet-subjects.json',
  manifest: 'tokenbench-cheatsheet.manifest.json',
} as const;

function fail(message: string): never {
  throw new Error(message);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function requireNullableRate(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`${label} must be a non-negative finite number or null`);
  }
  return value;
}

async function readLocalJson(path: string, label: string): Promise<unknown> {
  if (typeof path !== 'string' || path.trim().length === 0 || path.includes('://')) {
    fail(`${label} must be an explicit local JSON path`);
  }
  let raw: string;
  try {
    raw = await readFile(resolve(path), 'utf8');
  } catch {
    fail(`${label} could not be read`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    fail(`${label} must contain valid JSON`);
  }
}

function parseRevision(value: unknown): BenchmarkRevision {
  const revision = asRecord(value, 'benchmark revision');
  const publicationState = requireString(revision.publicationState, 'benchmark revision.publicationState');
  if (!['pending', 'published', 'superseded', 'failed'].includes(publicationState)) {
    fail('benchmark revision.publicationState is invalid');
  }
  const publishedAt = revision.publishedAt === null
    ? null
    : requireString(revision.publishedAt, 'benchmark revision.publishedAt');
  return {
    revision: requireString(revision.revision, 'benchmark revision.revision'),
    generatedAt: requireString(revision.generatedAt, 'benchmark revision.generatedAt'),
    publishedAt,
    checkedAt: requireString(revision.checkedAt, 'benchmark revision.checkedAt'),
    publicationState: publicationState as BenchmarkRevision['publicationState'],
    contentHash: requireString(revision.contentHash, 'benchmark revision.contentHash'),
    catalogRevision: requireString(revision.catalogRevision, 'benchmark revision.catalogRevision'),
    openrouterContentHash: requireString(revision.openrouterContentHash, 'benchmark revision.openrouterContentHash'),
  };
}

function parseBenchmarkSnapshot(value: unknown): FrozenBenchmarkSnapshot {
  const record = asRecord(value, 'benchmarks');
  const batch = validateNormalizedSourceBatch({
    sources: asArray(record.sources, 'benchmarks.sources'),
    models: asArray(record.models, 'benchmarks.models'),
    metrics: asArray(record.metrics, 'benchmarks.metrics'),
    priceChecks: asArray(record.priceChecks, 'benchmarks.priceChecks'),
    comparisonSeeds: [],
  });
  return {
    revision: parseRevision(record.revision),
    sources: batch.sources,
    models: batch.models,
    metrics: batch.metrics,
    priceChecks: batch.priceChecks,
    comparisonPairs: [],
  };
}

function parseChanges(value: unknown): RevisionChanges {
  const record = asRecord(value, 'changes');
  const newModels = asArray(record.newModels, 'changes.newModels').map((value, index) => {
    const fact = asRecord(value, `changes.newModels[${index}]`);
    return {
      id: requireString(fact.id, `changes.newModels[${index}].id`),
      modelKey: requireString(fact.modelKey, `changes.newModels[${index}].modelKey`),
    };
  });
  const priceDrops = asArray(record.priceDrops, 'changes.priceDrops').map((value, index) => {
    const fact = asRecord(value, `changes.priceDrops[${index}]`);
    return {
      id: requireString(fact.id, `changes.priceDrops[${index}].id`),
      modelKey: requireString(fact.modelKey, `changes.priceDrops[${index}].modelKey`),
      providerId: requireString(fact.providerId, `changes.priceDrops[${index}].providerId`),
      routeId: requireString(fact.routeId, `changes.priceDrops[${index}].routeId`),
      previousInputUsdPerMillion: requireNullableRate(fact.previousInputUsdPerMillion, `changes.priceDrops[${index}].previousInputUsdPerMillion`),
      currentInputUsdPerMillion: requireNullableRate(fact.currentInputUsdPerMillion, `changes.priceDrops[${index}].currentInputUsdPerMillion`),
      previousOutputUsdPerMillion: requireNullableRate(fact.previousOutputUsdPerMillion, `changes.priceDrops[${index}].previousOutputUsdPerMillion`),
      currentOutputUsdPerMillion: requireNullableRate(fact.currentOutputUsdPerMillion, `changes.priceDrops[${index}].currentOutputUsdPerMillion`),
    };
  });
  return {
    fromRevision: requireString(record.fromRevision, 'changes.fromRevision'),
    toRevision: requireString(record.toRevision, 'changes.toRevision'),
    dedupeKey: requireString(record.dedupeKey, 'changes.dedupeKey'),
    newModels,
    priceDrops,
  };
}

function assertRevisionRelationship(
  snapshot: FrozenBenchmarkSnapshot,
  catalog: CatalogResponse,
  changes: RevisionChanges,
): void {
  if (snapshot.revision.catalogRevision !== catalog.revision) {
    fail('catalog revision must match the benchmark revision');
  }
  if (changes.toRevision !== snapshot.revision.revision) {
    fail('changes revision must target the benchmark revision');
  }
}

async function absent(path: string): Promise<boolean> {
  try {
    await stat(path);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}

function outputLocation(outDir: string): { readonly output: string; readonly parent: string; readonly stagingPrefix: string } {
  if (typeof outDir !== 'string' || outDir.trim().length === 0) fail('outDir must be a new local directory');
  const output = resolve(outDir);
  const sourceDirectory = resolve(process.cwd(), 'src');
  if (output === sourceDirectory || output.startsWith(`${sourceDirectory}/`)) {
    fail('outDir must not be inside the source directory');
  }
  const parent = dirname(output);
  const name = basename(output);
  if (name === '.' || name === '..' || name.length === 0) fail('outDir must name a new directory');
  return { output, parent, stagingPrefix: `.${name}.staging-` };
}

function validatedStagingDirectory(staging: string, parent: string, prefix: string): boolean {
  return dirname(staging) === parent && basename(staging).startsWith(prefix);
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function writeArtifact(staging: string, name: string, contents: Uint8Array | string): Promise<GeneratedCheatsheetFile> {
  const bytes = typeof contents === 'string' ? new TextEncoder().encode(contents) : contents;
  await writeFile(resolve(staging, name), bytes);
  return { name, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

async function closePageAndContext(
  page: CheatsheetBrowserPage | undefined,
  context: CheatsheetBrowserContext | undefined,
): Promise<void> {
  try {
    if (page) await page.close();
  } finally {
    if (context) await context.close();
  }
}

async function renderPdf(
  browser: CheatsheetBrowser,
  html: string,
  frozenGeneratedAt: string,
): Promise<Uint8Array> {
  let context: CheatsheetBrowserContext | undefined;
  let page: CheatsheetBrowserPage | undefined;
  try {
    context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' });
    page = await context.newPage();
    await page.emulateMedia({ media: 'print' });
    await page.setContent(html, { waitUntil: 'load' });
    return normalizePdfMetadata(await page.pdf({ format: 'A4', printBackground: true }), frozenGeneratedAt);
  } finally {
    await closePageAndContext(page, context);
  }
}

function shareEscape(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}

function renderShareHtml(document: CheatsheetDocument): string {
  const leaders = document.categories
    .flatMap((category) => category.entries.slice(0, 1).map((entry) => `${category.label}: ${entry.name}`))
    .slice(0, 3);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; } body { margin: 0; background: #101827; color: #f8fafc; font-family: Arial, sans-serif; }
    main { display: flex; flex-direction: column; height: 630px; justify-content: center; padding: 72px; width: 1200px; }
    p { color: #b9c6de; font-size: 25px; margin: 14px 0; } h1 { font-size: 64px; line-height: 1.05; margin: 0; max-width: 960px; }
    ul { font-size: 26px; line-height: 1.45; margin: 28px 0 0; padding-left: 28px; }
  </style></head><body><main><p>TokenBench frozen revision ${shareEscape(document.revision)}</p><h1>Monthly LLM API cost &amp; benchmark cheatsheet</h1><ul>${leaders.map((leader) => `<li>${shareEscape(leader)}</li>`).join('')}</ul></main></body></html>`;
}

async function renderShareImage(browser: CheatsheetBrowser, document: CheatsheetDocument): Promise<Uint8Array> {
  let context: CheatsheetBrowserContext | undefined;
  let page: CheatsheetBrowserPage | undefined;
  try {
    context = await browser.newContext({
      locale: 'en-US',
      timezoneId: 'UTC',
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
    });
    page = await context.newPage();
    await page.setContent(renderShareHtml(document), { waitUntil: 'load' });
    return await page.screenshot({ type: 'png' });
  } finally {
    await closePageAndContext(page, context);
  }
}

function stableFiles(files: readonly GeneratedCheatsheetFile[]): readonly GeneratedCheatsheetFile[] {
  return files.slice().sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
}

/**
 * Generates a fully local artifact bundle in a sibling staging directory and
 * commits it through one atomic rename. Browser pages, contexts, and the
 * browser itself are closed on both success and failure.
 */
export async function generateMonthlyCheatsheet(
  args: GenerateMonthlyCheatsheetArgs,
  dependencies: GenerateMonthlyCheatsheetDependencies = DEFAULT_DEPENDENCIES,
): Promise<GeneratedCheatsheetBundle> {
  const [rawSnapshot, rawCatalog, rawChanges] = await Promise.all([
    readLocalJson(args.benchmarks, 'benchmarks'),
    readLocalJson(args.catalog, 'catalog'),
    readLocalJson(args.changes, 'changes'),
  ]);
  const snapshot = parseBenchmarkSnapshot(rawSnapshot);
  const catalog = validateCatalogResponse(rawCatalog);
  const changes = parseChanges(rawChanges);
  assertRevisionRelationship(snapshot, catalog, changes);
  const document = buildCheatsheet(snapshot, catalog);
  const { output, parent, stagingPrefix } = outputLocation(args.outDir);
  if (!await absent(output)) fail('outDir must be a new directory');
  await mkdir(parent, { recursive: true });
  if (!await absent(output)) fail('outDir must be a new directory');

  let staging: string | undefined;
  try {
    staging = await mkdtemp(resolve(parent, stagingPrefix));
    if (!validatedStagingDirectory(staging, parent, stagingPrefix)) fail('refusing an invalid staging directory');
    const generated: GeneratedCheatsheetFile[] = [];
    generated.push(await writeArtifact(staging, ARTIFACT_NAMES.csv, renderCheatsheetCsv(document)));
    const cheatsheetHtml = renderCheatsheetHtml(document);
    generated.push(await writeArtifact(staging, ARTIFACT_NAMES.html, cheatsheetHtml));
    generated.push(await writeArtifact(staging, ARTIFACT_NAMES.newsletter, renderNewsletterHtml(document, changes)));
    generated.push(await writeArtifact(staging, ARTIFACT_NAMES.subjects, `${JSON.stringify(subjectPreviewSet(document, changes), null, 2)}\n`));

    const browser = await dependencies.launchBrowser();
    try {
      generated.push(await writeArtifact(staging, ARTIFACT_NAMES.pdf, await renderPdf(browser, cheatsheetHtml, document.generatedAt)));
      if (args.shareImage) {
        generated.push(await writeArtifact(staging, ARTIFACT_NAMES.share, await renderShareImage(browser, document)));
      }
    } finally {
      await browser.close();
    }

    const manifest: CheatsheetManifest = {
      schemaVersion: 'tokenbench-cheatsheet/v1',
      revision: document.revision,
      catalogRevision: document.catalogRevision,
      generatedAt: document.generatedAt,
      changes: {
        fromRevision: changes.fromRevision,
        toRevision: changes.toRevision,
        dedupeKey: changes.dedupeKey,
      },
      files: stableFiles(generated),
    };
    const manifestFile = await writeArtifact(staging, ARTIFACT_NAMES.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(staging, output);
    staging = undefined;
    return { document, manifest, files: stableFiles([...generated, manifestFile]) };
  } finally {
    if (staging && validatedStagingDirectory(staging, parent, stagingPrefix)) {
      await rm(staging, { force: true, recursive: true });
    }
  }
}

/** Parses the intentionally small local-only CLI surface. */
export function parseGenerateMonthlyCheatsheetArgs(argv: readonly string[]): GenerateMonthlyCheatsheetArgs {
  const values: Partial<Record<'benchmarks' | 'catalog' | 'changes' | 'outDir', string>> = {};
  let shareImage = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--share-image') {
      if (shareImage) fail('--share-image may be supplied once');
      shareImage = true;
      continue;
    }
    const key = argument === '--benchmarks'
      ? 'benchmarks'
      : argument === '--catalog'
        ? 'catalog'
        : argument === '--changes'
          ? 'changes'
          : argument === '--out-dir'
            ? 'outDir'
            : null;
    if (key === null) fail(`unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`${argument} must be supplied once with a value`);
    if (values[key] !== undefined) fail(`${argument} must be supplied once with a value`);
    values[key] = value;
    index += 1;
  }
  if (!values.benchmarks || !values.catalog || !values.changes || !values.outDir) {
    fail('required options are --benchmarks, --catalog, --changes, and --out-dir');
  }
  return {
    benchmarks: values.benchmarks,
    catalog: values.catalog,
    changes: values.changes,
    outDir: values.outDir,
    shareImage,
  };
}

async function runCli(): Promise<void> {
  try {
    const output = await generateMonthlyCheatsheet(parseGenerateMonthlyCheatsheetArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ revision: output.manifest.revision, files: output.files }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Unable to generate cheatsheet'}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void runCli();
}
