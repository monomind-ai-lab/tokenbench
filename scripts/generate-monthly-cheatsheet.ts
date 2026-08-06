import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm, rmdir, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';
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
import {
  diffPublishedRevisions,
  type PublishedRevisionPriceCheck,
  type PublishedRevisionSnapshot,
  type RevisionChanges,
} from '../src/newsletter/revision-diff';

export interface GenerateMonthlyCheatsheetArgs {
  readonly benchmarks: string;
  readonly catalog: string;
  readonly changes: string;
  readonly artifactRoot?: string;
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

function assertOnlyKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) fail(`${label}.${unknown} is not allowed`);
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
  assertOnlyKeys(record, ['fromRevision', 'toRevision', 'dedupeKey', 'newModels', 'priceDrops'], 'changes');
  const newModels = asArray(record.newModels, 'changes.newModels').map((value, index) => {
    const fact = asRecord(value, `changes.newModels[${index}]`);
    assertOnlyKeys(fact, ['id', 'modelKey'], `changes.newModels[${index}]`);
    return {
      id: requireString(fact.id, `changes.newModels[${index}].id`),
      modelKey: requireString(fact.modelKey, `changes.newModels[${index}].modelKey`),
    };
  });
  const priceDrops = asArray(record.priceDrops, 'changes.priceDrops').map((value, index) => {
    const fact = asRecord(value, `changes.priceDrops[${index}]`);
    assertOnlyKeys(fact, [
      'id', 'modelKey', 'providerId', 'routeId',
      'previousInputUsdPerMillion', 'currentInputUsdPerMillion',
      'previousOutputUsdPerMillion', 'currentOutputUsdPerMillion',
    ], `changes.priceDrops[${index}]`);
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
  const changes = {
    fromRevision: requireString(record.fromRevision, 'changes.fromRevision'),
    toRevision: requireString(record.toRevision, 'changes.toRevision'),
    dedupeKey: requireString(record.dedupeKey, 'changes.dedupeKey'),
    newModels,
    priceDrops,
  };
  const factIds = [...newModels.map((fact) => fact.id), ...priceDrops.map((fact) => fact.id)];
  if (new Set(factIds).size !== factIds.length) fail('changes facts must have unique ids');
  const routeIdentities = priceDrops.map((fact) => JSON.stringify([fact.modelKey, fact.providerId, fact.routeId]));
  if (new Set(routeIdentities).size !== routeIdentities.length) fail('changes price-drop routes must be unique');
  return changes;
}

function parsePublishedRevisionSnapshot(value: unknown, label: string): PublishedRevisionSnapshot {
  const record = asRecord(value, label);
  assertOnlyKeys(record, ['revision', 'models', 'priceChecks'], label);
  const models = asArray(record.models, `${label}.models`).map((value, index) => {
    const model = asRecord(value, `${label}.models[${index}]`);
    assertOnlyKeys(model, ['modelKey'], `${label}.models[${index}]`);
    return { modelKey: requireString(model.modelKey, `${label}.models[${index}].modelKey`) };
  });
  const modelKeys = models.map((model) => model.modelKey);
  if (new Set(modelKeys).size !== modelKeys.length) fail(`${label}.models must be unique`);

  const priceChecks = asArray(record.priceChecks, `${label}.priceChecks`).map((value, index) => {
    const price = asRecord(value, `${label}.priceChecks[${index}]`);
    assertOnlyKeys(price, [
      'modelKey', 'providerId', 'routeId', 'verificationStatus',
      'inputUsdPerMillion', 'outputUsdPerMillion',
    ], `${label}.priceChecks[${index}]`);
    const verificationStatus = requireString(
      price.verificationStatus,
      `${label}.priceChecks[${index}].verificationStatus`,
    );
    if (!['primary', 'corroborating', 'conflict'].includes(verificationStatus)) {
      fail(`${label}.priceChecks[${index}].verificationStatus is invalid`);
    }
    const parsed: PublishedRevisionPriceCheck = {
      modelKey: requireString(price.modelKey, `${label}.priceChecks[${index}].modelKey`),
      providerId: requireString(price.providerId, `${label}.priceChecks[${index}].providerId`),
      routeId: requireString(price.routeId, `${label}.priceChecks[${index}].routeId`),
      verificationStatus: verificationStatus as PublishedRevisionPriceCheck['verificationStatus'],
      inputUsdPerMillion: requireNullableRate(price.inputUsdPerMillion ?? null, `${label}.priceChecks[${index}].inputUsdPerMillion`),
      outputUsdPerMillion: requireNullableRate(price.outputUsdPerMillion ?? null, `${label}.priceChecks[${index}].outputUsdPerMillion`),
    };
    if (!modelKeys.includes(parsed.modelKey)) fail(`${label}.priceChecks[${index}].modelKey must refer to a model`);
    return parsed;
  });
  const priceIdentities = priceChecks.map((price) => JSON.stringify([
    price.modelKey, price.providerId, price.routeId, price.verificationStatus,
  ]));
  if (new Set(priceIdentities).size !== priceIdentities.length) fail(`${label}.priceChecks must be unique`);
  return {
    revision: requireString(record.revision, `${label}.revision`),
    models,
    priceChecks,
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalPublishedSnapshot(snapshot: PublishedRevisionSnapshot): string {
  const models = snapshot.models.map((model) => model.modelKey).slice().sort(compareText);
  const prices = snapshot.priceChecks.map((price) => [
    price.modelKey,
    price.providerId,
    price.routeId,
    price.verificationStatus,
    price.inputUsdPerMillion ?? null,
    price.outputUsdPerMillion ?? null,
  ]).slice().sort((left, right) => compareText(JSON.stringify(left), JSON.stringify(right)));
  return JSON.stringify({ revision: snapshot.revision, models, prices });
}

function expectedCurrentRevision(snapshot: FrozenBenchmarkSnapshot): PublishedRevisionSnapshot {
  return {
    revision: snapshot.revision.revision,
    models: snapshot.models.map((model) => ({ modelKey: model.modelKey })),
    priceChecks: snapshot.priceChecks
      .filter((price) => price.verificationStatus === 'primary')
      .map((price) => ({
        modelKey: price.modelKey,
        providerId: price.providerId,
        routeId: price.routeId,
        verificationStatus: price.verificationStatus,
        inputUsdPerMillion: price.inputUsdPerMillion,
        outputUsdPerMillion: price.outputUsdPerMillion,
      })),
  };
}

function parsePreviousRevisionReceipt(value: unknown): PublishedRevisionSnapshot {
  const receipt = asRecord(value, 'changes envelope.previous receipt');
  assertOnlyKeys(receipt, ['schemaVersion', 'benchmarks', 'catalog', 'factsHash'], 'changes envelope.previous receipt');
  if (receipt.schemaVersion !== 'tokenbench-published-revision-receipt/v1') {
    fail('changes envelope.previous receipt schemaVersion is invalid');
  }
  const factsHash = requireString(receipt.factsHash, 'changes envelope.previous receipt.factsHash');
  if (!/^sha256:[a-f0-9]{64}$/u.test(factsHash)) {
    fail('changes envelope.previous receipt.factsHash must be a SHA-256 digest');
  }
  const snapshot = parseBenchmarkSnapshot(receipt.benchmarks);
  const catalog = validateCatalogResponse(receipt.catalog);
  assertRevisionRelationship(snapshot, catalog);
  buildCheatsheet(snapshot, catalog);
  const facts = expectedCurrentRevision(snapshot);
  if (facts.models.length === 0) {
    fail('changes envelope.previous receipt must contain published model facts');
  }
  const actualFactsHash = sha256(new TextEncoder().encode(canonicalPublishedSnapshot(facts)));
  if (actualFactsHash !== factsHash) {
    fail('changes envelope.previous receipt facts hash does not match its published facts');
  }
  return facts;
}

function parseVerifiedChanges(value: unknown, snapshot: FrozenBenchmarkSnapshot): RevisionChanges {
  const envelope = asRecord(value, 'changes envelope');
  if (!Object.hasOwn(envelope, 'previous') || !Object.hasOwn(envelope, 'current')) {
    fail('changes must contain verified previous and current published revision snapshots');
  }
  assertOnlyKeys(envelope, ['previous', 'current', 'changes'], 'changes envelope');
  const previous = parsePreviousRevisionReceipt(envelope.previous);
  const current = parsePublishedRevisionSnapshot(envelope.current, 'changes envelope.current');
  if (previous.revision === current.revision) fail('changes envelope revisions must be different');
  if (current.revision !== snapshot.revision.revision) {
    fail('changes envelope current revision must target the benchmark revision');
  }
  if (canonicalPublishedSnapshot(current) !== canonicalPublishedSnapshot(expectedCurrentRevision(snapshot))) {
    fail('changes envelope current snapshot must exactly match current benchmark models and primary routes');
  }

  const canonical = diffPublishedRevisions(previous, current);
  if (Object.hasOwn(envelope, 'changes')) {
    const claimed = parseChanges(envelope.changes);
    if (JSON.stringify(claimed) !== JSON.stringify(canonical)) {
      fail('changes envelope diff must be the canonical diff of its verified snapshots');
    }
  }
  return canonical;
}

function assertRevisionRelationship(
  snapshot: FrozenBenchmarkSnapshot,
  catalog: CatalogResponse,
): void {
  if (snapshot.revision.catalogRevision !== catalog.revision) {
    fail('catalog revision must match the benchmark revision');
  }
}

async function absent(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}

function pathIsWithin(root: string, candidate: string): boolean {
  const offset = relative(root, candidate);
  return offset === '' || (offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset));
}

async function assertNoSymbolicLinkAncestors(path: string): Promise<void> {
  const absolute = resolve(path);
  const pathRoot = parse(absolute).root;
  const components = relative(pathRoot, absolute).split(sep).filter(Boolean);
  let cursor = pathRoot;
  for (const component of components) {
    cursor = resolve(cursor, component);
    try {
      const metadata = await lstat(cursor);
      if (metadata.isSymbolicLink()) fail(`refusing symbolic link traversal at ${cursor}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

async function outputLocation(
  outDir: string,
  configuredArtifactRoot: string | undefined,
): Promise<{ readonly output: string; readonly parent: string; readonly stagingPrefix: string; readonly lockPath: string }> {
  if (typeof outDir !== 'string' || outDir.trim().length === 0) fail('outDir must be a new local directory');
  if (outDir.includes('://')) fail('outDir must be a new local directory');
  const workspaceRoot = resolve(process.cwd());
  const defaultArtifactRoot = resolve(workspaceRoot, 'newsletter-artifacts');
  const artifactRoot = resolve(configuredArtifactRoot ?? defaultArtifactRoot);
  const output = resolve(outDir);
  if (pathIsWithin(workspaceRoot, artifactRoot) && !pathIsWithin(defaultArtifactRoot, artifactRoot)) {
    fail('outDir and artifact root must not be inside the source directory');
  }
  if (!pathIsWithin(artifactRoot, output) || artifactRoot === output) {
    fail('outDir must be beneath the configured artifact root');
  }
  const parent = dirname(output);
  const name = basename(output);
  if (name === '.' || name === '..' || name.length === 0) fail('outDir must name a new directory');
  await assertNoSymbolicLinkAncestors(artifactRoot);
  await mkdir(artifactRoot, { recursive: true });
  await assertNoSymbolicLinkAncestors(artifactRoot);
  if (await realpath(artifactRoot) !== artifactRoot) fail('artifact root must use its canonical path');
  await assertNoSymbolicLinkAncestors(parent);
  await mkdir(parent, { recursive: true });
  await assertNoSymbolicLinkAncestors(parent);
  if (!pathIsWithin(artifactRoot, await realpath(parent))) {
    fail('outDir parent must resolve beneath the configured artifact root');
  }
  await assertNoSymbolicLinkAncestors(output);
  return { output, parent, stagingPrefix: `.${name}.staging-`, lockPath: `${output}.lock` };
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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'"><style>
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

async function publishNoReplace(staging: string, output: string, names: readonly string[]): Promise<void> {
  try {
    await mkdir(output, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('outDir must be a new directory and already exists');
    throw error;
  }

  const moved: string[] = [];
  try {
    for (const name of names) {
      await rename(resolve(staging, name), resolve(output, name));
      moved.push(name);
    }
    await rmdir(staging);
  } catch (error) {
    for (const name of moved.slice().reverse()) {
      try {
        await rename(resolve(output, name), resolve(staging, name));
      } catch {
        // Keep the original publication error and never delete an unknown file.
      }
    }
    try {
      await rmdir(output);
    } catch {
      // A non-empty target may contain another actor's file; leave it intact.
    }
    throw error;
  }
}

/**
 * Generates a fully local artifact bundle in a sibling staging directory.
 * An exclusive target lock and exclusive final-directory creation prevent
 * clobbering; the manifest is moved last as the completion marker.
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
  const changes = parseVerifiedChanges(rawChanges, snapshot);
  assertRevisionRelationship(snapshot, catalog);
  const document = buildCheatsheet(snapshot, catalog);
  const { output, parent, stagingPrefix, lockPath } = await outputLocation(args.outDir, args.artifactRoot);
  let lock: Awaited<ReturnType<typeof open>>;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('outDir is locked by another generator');
    throw error;
  }
  const ownedLockIdentity = await lock.stat();

  let staging: string | undefined;
  try {
    if (!await absent(output)) fail('outDir must be a new directory');
    await assertNoSymbolicLinkAncestors(output);
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
    await assertNoSymbolicLinkAncestors(output);
    await publishNoReplace(staging, output, [...generated.map((file) => file.name), manifestFile.name]);
    staging = undefined;
    return { document, manifest, files: stableFiles([...generated, manifestFile]) };
  } finally {
    try {
      if (staging && validatedStagingDirectory(staging, parent, stagingPrefix)) {
        await rm(staging, { force: true, recursive: true });
      }
    } finally {
      try {
        await lock.close();
      } finally {
        try {
          const currentLockIdentity = await lstat(lockPath);
          if (currentLockIdentity.dev === ownedLockIdentity.dev && currentLockIdentity.ino === ownedLockIdentity.ino) {
            await unlink(lockPath);
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
  }
}

/** Parses the intentionally small local-only CLI surface. */
export function parseGenerateMonthlyCheatsheetArgs(argv: readonly string[]): GenerateMonthlyCheatsheetArgs {
  const values: Partial<Record<'benchmarks' | 'catalog' | 'changes' | 'artifactRoot' | 'outDir', string>> = {};
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
          : argument === '--artifact-root'
            ? 'artifactRoot'
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
    artifactRoot: values.artifactRoot,
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
