import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { BenchmarkRevision } from '../src/benchmarks/contracts';
import type { CatalogResponse } from '../src/catalog/contracts';
import type { PublishedRevisionSnapshot, RevisionChanges } from '../src/newsletter/revision-diff';
import {
  generateMonthlyCheatsheet,
  parseGenerateMonthlyCheatsheetArgs,
  type CheatsheetBrowser,
  type GenerateMonthlyCheatsheetArgs,
} from './generate-monthly-cheatsheet';

const temporaryRoots: string[] = [];
const SHA = `sha256:${'a'.repeat(64)}`;
const PREVIOUS_SHA = `sha256:${'b'.repeat(64)}`;
const PREVIOUS_FACTS_HASH = 'sha256:cbfbd155ef344f5a8368c99945c671a648e9f9d678ce9e58e25fb8dc39cf13f8';
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

function revision(): BenchmarkRevision {
  return {
    revision: 'benchmark_fixture',
    generatedAt: '2026-08-01T00:00:00.000Z',
    publishedAt: '2026-08-01T00:00:00.000Z',
    checkedAt: '2026-08-01T00:00:00.000Z',
    publicationState: 'published',
    contentHash: SHA,
    catalogRevision: 'catalog_fixture',
    openrouterContentHash: SHA,
  };
}

function benchmarkFixture() {
  return {
    revision: revision(),
    sources: [
      {
        sourceId: 'benchlm', artifactId: 'benchlm-fixture', sourceUrl: 'https://example.test/benchlm',
        observedAt: '2026-08-01T00:00:00.000Z', etag: null, lastModified: null, upstreamRevision: null,
        schemaVersion: 'fixture-v1', snapshotKey: 'fixtures/benchlm.json', contentHash: SHA, originalContentHash: SHA,
        licenseId: 'MIT', attributionText: 'Fixture BenchLM evidence',
      },
      {
        sourceId: 'openrouter', artifactId: 'catalog:catalog_fixture', sourceUrl: 'https://example.test/catalog',
        observedAt: '2026-08-01T00:00:00.000Z', etag: null, lastModified: null, upstreamRevision: 'catalog_fixture',
        schemaVersion: 'fixture-v1', snapshotKey: 'fixtures/catalog.json', contentHash: SHA, originalContentHash: SHA,
        licenseId: 'OpenRouter-ToS', attributionText: 'Fixture OpenRouter evidence',
      },
    ],
    models: [{
      modelKey: 'fixture:alpha', slug: 'alpha', name: 'Alpha', creator: 'Fixture Labs', sourceType: 'Proprietary',
      reasoningType: null, releaseDate: null, contextWindowTokens: 128_000, evidenceStatus: 'supported', rankingEligible: true,
      confidenceLower: null, confidenceUpper: null, benchmarkCount: 1, sourceId: 'benchlm', sourceModelId: 'alpha',
      sourceArtifactId: 'benchlm-fixture',
    }],
    metrics: [{
      modelKey: 'fixture:alpha', metricKey: 'benchlm:overall:raw', category: 'overall', value: 90, rank: null,
      lower: null, upper: null, voteCount: null, unit: 'score', sourceId: 'benchlm',
      sourceUpdatedAt: '2026-08-01T00:00:00.000Z', sourceModelId: 'alpha', sourceArtifactId: 'benchlm-fixture',
      rankingEligible: true, methodology: 'benchlm_raw_composite', observationCount: null, sessionCount: null,
    }],
    priceChecks: [{
      modelKey: 'fixture:alpha', sourceId: 'openrouter', providerId: 'openai', inputUsdPerMillion: 1,
      cachedInputUsdPerMillion: null, outputUsdPerMillion: 2, contextWindowTokens: 128_000, verificationStatus: 'primary',
      routeId: 'openrouter:alpha', sourceModelId: 'alpha', canonicalSlug: 'alpha', maxInputTokens: null,
      maxOutputTokens: null, inputModalities: ['text'], outputModalities: ['text'], supportedParameters: [],
      sourceArtifactId: 'catalog:catalog_fixture',
    }],
    comparisonPairs: [],
  };
}

function catalogFixture(): CatalogResponse {
  return {
    revision: 'catalog_fixture',
    publishedAt: '2026-08-01T00:00:00.000Z',
    freshness: { status: 'fresh', checkedAt: '2026-08-01T00:00:00.000Z' },
    plans: [],
    modelOffers: [{
      id: 'openrouter:alpha', providerId: 'openai', displayName: 'Alpha', modelId: 'alpha',
      pricingBasis: 'openrouter', route: 'openrouter', currency: 'USD', unit: 'micro_dollars_per_million_tokens',
      inputMicroDollarsPerMillion: 1_000_000, outputMicroDollarsPerMillion: 2_000_000,
      contextWindowTokens: 128_000, sourceId: 'openrouter-models',
    }],
    provenance: [{
      id: 'openrouter-models', providerId: 'openrouter', sourceUrl: 'https://example.test/catalog',
      observedAt: '2026-08-01T00:00:00.000Z', sourceKind: 'official_json', confidence: 'official',
      snapshotKey: 'fixtures/catalog.json', contentHash: SHA, parserVersion: 'fixture-v1', reviewStatus: 'verified',
    }],
  };
}

function previousCatalogFixture(): CatalogResponse {
  const current = catalogFixture();
  return {
    ...current,
    revision: 'catalog_previous',
    modelOffers: current.modelOffers.map((offer) => ({
      ...offer,
      inputMicroDollarsPerMillion: 2_000_000,
      outputMicroDollarsPerMillion: 3_000_000,
    })),
    provenance: current.provenance.map((source) => ({
      ...source,
      snapshotKey: 'fixtures/catalog-previous.json',
      contentHash: PREVIOUS_SHA,
    })),
  };
}

function previousBenchmarkFixture() {
  const current = benchmarkFixture();
  return {
    ...current,
    revision: {
      ...current.revision,
      revision: 'benchmark_previous',
      catalogRevision: 'catalog_previous',
      openrouterContentHash: PREVIOUS_SHA,
    },
    sources: current.sources.map((source) => source.sourceId === 'openrouter'
      ? {
          ...source,
          artifactId: 'catalog:catalog_previous',
          upstreamRevision: 'catalog_previous',
          snapshotKey: 'fixtures/catalog-previous.json',
          contentHash: PREVIOUS_SHA,
          originalContentHash: PREVIOUS_SHA,
        }
      : source),
    priceChecks: current.priceChecks.map((priceCheck) => ({
      ...priceCheck,
      inputUsdPerMillion: 2,
      outputUsdPerMillion: 3,
      sourceArtifactId: 'catalog:catalog_previous',
    })),
  };
}

function previousReceiptFixture() {
  return {
    schemaVersion: 'tokenbench-published-revision-receipt/v1' as const,
    benchmarks: previousBenchmarkFixture(),
    catalog: previousCatalogFixture(),
    factsHash: PREVIOUS_FACTS_HASH,
  };
}

type PreviousRevisionReceiptFixture = ReturnType<typeof previousReceiptFixture>;

interface VerifiedChangesFixture {
  readonly previous: PreviousRevisionReceiptFixture;
  readonly current: PublishedRevisionSnapshot;
  readonly changes?: RevisionChanges;
}

function changesFixture(overrides: Partial<VerifiedChangesFixture> = {}): VerifiedChangesFixture {
  const previous = previousReceiptFixture();
  const current: PublishedRevisionSnapshot = {
    revision: 'benchmark_fixture',
    models: [{ modelKey: 'fixture:alpha' }],
    priceChecks: [{
      modelKey: 'fixture:alpha', providerId: 'openai', routeId: 'openrouter:alpha', verificationStatus: 'primary',
      inputUsdPerMillion: 1, outputUsdPerMillion: 2,
    }],
  };
  const priceDropId = JSON.stringify(['benchmark_fixture', 'price-drop', 'fixture:alpha', 'openai', 'openrouter:alpha']);
  const changes: RevisionChanges = {
    fromRevision: 'benchmark_previous',
    toRevision: 'benchmark_fixture',
    dedupeKey: JSON.stringify(['benchmark_previous', 'benchmark_fixture', priceDropId]),
    newModels: [],
    priceDrops: [{
      id: priceDropId, modelKey: 'fixture:alpha', providerId: 'openai', routeId: 'openrouter:alpha',
      previousInputUsdPerMillion: 2, currentInputUsdPerMillion: 1,
      previousOutputUsdPerMillion: 3, currentOutputUsdPerMillion: 2,
    }],
  };
  return { previous, current, changes, ...overrides };
}

class FakePage {
  readonly contents: string[] = [];
  readonly pdfOptions: unknown[] = [];
  readonly screenshotOptions: unknown[] = [];
  closed = false;
  failPdf = false;
  onPdf: (() => Promise<void>) | undefined;

  async setContent(html: string): Promise<void> {
    this.contents.push(html);
  }

  async emulateMedia(): Promise<void> {}

  async pdf(options: unknown): Promise<Uint8Array> {
    this.pdfOptions.push(options);
    if (this.onPdf) await this.onPdf();
    if (this.failPdf) throw new Error('PDF failed');
    return new TextEncoder().encode("%PDF-1.4\n/CreationDate (D:20260806123456+08'00')\n/ModDate (D:20260806123456+08'00')\n");
  }

  async screenshot(options: unknown): Promise<Uint8Array> {
    this.screenshotOptions.push(options);
    return new Uint8Array([137, 80, 78, 71]);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

class FakeContext {
  readonly page = new FakePage();
  closed = false;

  async newPage(): Promise<FakePage> {
    return this.page;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

class FakeBrowser implements CheatsheetBrowser {
  readonly contexts: FakeContext[] = [];
  readonly contextOptions: unknown[] = [];
  closed = false;

  async newContext(options: unknown): Promise<FakeContext> {
    this.contextOptions.push(options);
    const context = new FakeContext();
    this.contexts.push(context);
    return context;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

async function fixtureArgs(name: string, overrides: Partial<GenerateMonthlyCheatsheetArgs> = {}): Promise<GenerateMonthlyCheatsheetArgs> {
  const root = await realpath(await mkdtemp(join(tmpdir(), `tokenbench-cheatsheet-${name}-`)));
  temporaryRoots.push(root);
  const benchmarks = join(root, 'benchmarks.json');
  const catalog = join(root, 'catalog.json');
  const changes = join(root, 'changes.json');
  await Promise.all([
    writeFile(benchmarks, `${JSON.stringify(benchmarkFixture(), null, 2)}\n`),
    writeFile(catalog, `${JSON.stringify(catalogFixture(), null, 2)}\n`),
    writeFile(changes, `${JSON.stringify(changesFixture(), null, 2)}\n`),
  ]);
  return {
    benchmarks,
    catalog,
    changes,
    artifactRoot: join(root, 'newsletter-artifacts'),
    outDir: join(root, 'newsletter-artifacts', 'artifacts'),
    shareImage: true,
    ...overrides,
  };
}

function fakeDependencies(browser: FakeBrowser) {
  return { launchBrowser: async () => browser };
}

async function runCli(args: GenerateMonthlyCheatsheetArgs): Promise<void> {
  await execFileAsync('npm', [
    'run', 'generate:cheatsheet', '--',
    '--benchmarks', args.benchmarks,
    '--catalog', args.catalog,
    '--changes', args.changes,
    '--out-dir', args.outDir,
    ...(args.artifactRoot ? ['--artifact-root', args.artifactRoot] : []),
    ...(args.shareImage ? ['--share-image'] : []),
  ], { cwd: process.cwd() });
}

describe('generateMonthlyCheatsheet', () => {
  it('rejects an unrecognized positional CLI argument', () => {
    expect(() => parseGenerateMonthlyCheatsheetArgs([
      '--benchmarks', 'benchmarks.json',
      '--catalog', 'catalog.json',
      '--changes', 'changes.json',
      '--out-dir', 'artifacts',
      'unexpected',
    ])).toThrow(/unknown argument/i);
  });

  it('accepts a hash-bound frozen prior publication receipt for deterministic changes', async () => {
    const args = await fixtureArgs('prior-receipt');
    const envelope = changesFixture();
    await writeFile(args.changes, `${JSON.stringify(envelope)}\n`);

    const output = await generateMonthlyCheatsheet(args, fakeDependencies(new FakeBrowser()));

    expect(output.manifest.changes).toEqual({
      fromRevision: 'benchmark_previous',
      toRevision: 'benchmark_fixture',
      dedupeKey: envelope.changes?.dedupeKey,
    });
  });

  it('rejects a caller-supplied thin previous snapshot without a frozen receipt', async () => {
    const args = await fixtureArgs('thin-prior');
    const envelope = changesFixture();
    const previous: PublishedRevisionSnapshot = {
      revision: 'benchmark_previous',
      models: [{ modelKey: 'fixture:alpha' }],
      priceChecks: [{
        modelKey: 'fixture:alpha', providerId: 'openai', routeId: 'openrouter:alpha', verificationStatus: 'primary',
        inputUsdPerMillion: 2, outputUsdPerMillion: 3,
      }],
    };
    await writeFile(args.changes, `${JSON.stringify({ ...envelope, previous })}\n`);

    await expect(generateMonthlyCheatsheet(args, fakeDependencies(new FakeBrowser())))
      .rejects.toThrow(/previous.*receipt/i);
  });

  it.each([
    ['an unpublished revision', (receipt: PreviousRevisionReceiptFixture) => ({
      ...receipt,
      benchmarks: {
        ...receipt.benchmarks,
        revision: { ...receipt.benchmarks.revision, publicationState: 'superseded' },
      },
    }), /published/i],
    ['a mismatched source artifact ID', (receipt: PreviousRevisionReceiptFixture) => ({
      ...receipt,
      benchmarks: {
        ...receipt.benchmarks,
        sources: receipt.benchmarks.sources.map((source) => source.sourceId === 'openrouter'
          ? { ...source, artifactId: 'catalog:stale' }
          : source),
        priceChecks: receipt.benchmarks.priceChecks.map((price) => ({
          ...price,
          sourceArtifactId: 'catalog:stale',
        })),
      },
    }), /source artifact|catalog revision/i],
    ['a mismatched upstream revision', (receipt: PreviousRevisionReceiptFixture) => ({
      ...receipt,
      benchmarks: {
        ...receipt.benchmarks,
        sources: receipt.benchmarks.sources.map((source) => source.sourceId === 'openrouter'
          ? { ...source, upstreamRevision: 'catalog_stale' }
          : source),
      },
    }), /upstream revision/i],
    ['a mismatched source content hash', (receipt: PreviousRevisionReceiptFixture) => ({
      ...receipt,
      benchmarks: {
        ...receipt.benchmarks,
        sources: receipt.benchmarks.sources.map((source) => source.sourceId === 'openrouter'
          ? { ...source, contentHash: SHA, originalContentHash: SHA }
          : source),
      },
    }), /content hash/i],
    ['a forged receipt facts hash', (receipt: PreviousRevisionReceiptFixture) => ({
      ...receipt,
      factsHash: SHA,
    }), /facts hash/i],
    ['an omitted prior price fact', (receipt: PreviousRevisionReceiptFixture) => ({
      ...receipt,
      benchmarks: { ...receipt.benchmarks, priceChecks: [] },
    }), /facts hash/i],
    ['inflated prior prices', (receipt: PreviousRevisionReceiptFixture) => ({
      ...receipt,
      benchmarks: {
        ...receipt.benchmarks,
        priceChecks: receipt.benchmarks.priceChecks.map((price) => ({
          ...price,
          inputUsdPerMillion: 99,
          outputUsdPerMillion: 99,
        })),
      },
      catalog: {
        ...receipt.catalog,
        modelOffers: receipt.catalog.modelOffers.map((offer) => ({
          ...offer,
          inputMicroDollarsPerMillion: 99_000_000,
          outputMicroDollarsPerMillion: 99_000_000,
        })),
      },
    }), /facts hash/i],
    ['no prior published facts', (receipt: PreviousRevisionReceiptFixture) => ({
      ...receipt,
      benchmarks: { ...receipt.benchmarks, models: [], metrics: [], priceChecks: [] },
    }), /published model facts/i],
  ] as const)('rejects a prior receipt containing %s before rendering', async (_label, mutate, expected) => {
    const args = await fixtureArgs(`prior-${_label.replaceAll(' ', '-')}`);
    const envelope = changesFixture();
    await writeFile(args.changes, `${JSON.stringify({ ...envelope, previous: mutate(envelope.previous) })}\n`);
    const browser = new FakeBrowser();

    await expect(generateMonthlyCheatsheet(args, fakeDependencies(browser))).rejects.toThrow(expected);
    await expect(access(args.outDir)).rejects.toThrow();
    expect(browser.contexts).toEqual([]);
  });

  it('writes the full factual artifact set with hashes, frozen PDF metadata, and fixed browser settings', async () => {
    const args = await fixtureArgs('full');
    const browser = new FakeBrowser();

    const output = await generateMonthlyCheatsheet(args, fakeDependencies(browser));
    const names = output.files.map((file) => file.name).sort();
    const manifest = JSON.parse(await readFile(join(args.outDir, 'tokenbench-cheatsheet.manifest.json'), 'utf8')) as typeof output.manifest;
    const pdf = await readFile(join(args.outDir, 'tokenbench-cheatsheet.pdf'), 'utf8');

    expect(names).toEqual([
      'tokenbench-cheatsheet-newsletter.html',
      'tokenbench-cheatsheet-share.png',
      'tokenbench-cheatsheet-subjects.json',
      'tokenbench-cheatsheet.csv',
      'tokenbench-cheatsheet.html',
      'tokenbench-cheatsheet.manifest.json',
      'tokenbench-cheatsheet.pdf',
    ]);
    expect(output.manifest.revision).toBe('benchmark_fixture');
    expect(manifest.files).toEqual(output.manifest.files);
    expect(pdf).toContain("D:20260801000000+00'00'");
    expect(browser.contextOptions).toContainEqual(expect.objectContaining({ locale: 'en-US', timezoneId: 'UTC' }));
    expect(browser.contexts[0].page.pdfOptions).toEqual([expect.objectContaining({ format: 'A4', printBackground: true })]);
    expect(browser.contexts[1].page.contents[0]).toContain('Content-Security-Policy');
    expect(browser.contexts.every((context) => context.page.closed && context.closed)).toBe(true);
    expect(browser.closed).toBe(true);

    for (const file of output.files) {
      const bytes = await readFile(join(args.outDir, file.name));
      expect(file.sha256).toBe(`sha256:${createHash('sha256').update(bytes).digest('hex')}`);
    }
  });

  it('is byte-for-byte reproducible for one frozen input revision', async () => {
    const firstArgs = await fixtureArgs('first');
    const secondArgs = await fixtureArgs('second');
    const first = await generateMonthlyCheatsheet(firstArgs, fakeDependencies(new FakeBrowser()));
    const second = await generateMonthlyCheatsheet(secondArgs, fakeDependencies(new FakeBrowser()));

    expect(first.manifest.files).toEqual(second.manifest.files);
    for (const file of first.files) {
      expect(await readFile(join(firstArgs.outDir, file.name))).toEqual(await readFile(join(secondArgs.outDir, file.name)));
    }
  });

  it('runs the local CLI twice with bundled Playwright Chromium and produces reproducible PDF bytes', async () => {
    const firstArgs = await fixtureArgs('chromium-first', { shareImage: true });
    const secondArgs = await fixtureArgs('chromium-second', { shareImage: true });

    await runCli(firstArgs);
    await runCli(secondArgs);
    const first = JSON.parse(await readFile(join(firstArgs.outDir, 'tokenbench-cheatsheet.manifest.json'), 'utf8'));
    const second = JSON.parse(await readFile(join(secondArgs.outDir, 'tokenbench-cheatsheet.manifest.json'), 'utf8'));

    expect(first.files).toEqual(second.files);
    expect(await readFile(join(firstArgs.outDir, 'tokenbench-cheatsheet.pdf')))
      .toEqual(await readFile(join(secondArgs.outDir, 'tokenbench-cheatsheet.pdf')));
    expect(await readFile(join(firstArgs.outDir, 'tokenbench-cheatsheet-share.png')))
      .toEqual(await readFile(join(secondArgs.outDir, 'tokenbench-cheatsheet-share.png')));
  }, 20_000);

  it('rejects mismatched frozen revisions before creating an output directory', async () => {
    const args = await fixtureArgs('mismatch');
    const envelope = changesFixture();
    await writeFile(args.changes, `${JSON.stringify({
      ...envelope,
      current: { ...envelope.current, revision: 'other_revision' },
    })}\n`);
    const browser = new FakeBrowser();

    await expect(generateMonthlyCheatsheet(args, fakeDependencies(browser))).rejects.toThrow(/current.*revision/i);
    await expect(access(args.outDir)).rejects.toThrow();
    expect(browser.contexts).toEqual([]);
  });

  it('rejects a bare revision diff because its claimed price drops have no verified snapshots', async () => {
    const args = await fixtureArgs('bare-diff');
    await writeFile(args.changes, `${JSON.stringify(changesFixture().changes)}\n`);
    const browser = new FakeBrowser();

    await expect(generateMonthlyCheatsheet(args, fakeDependencies(browser))).rejects.toThrow(/verified previous and current/i);
    await expect(access(args.outDir)).rejects.toThrow();
    expect(browser.contexts).toEqual([]);
  });

  it('rejects output outside the configured artifact root', async () => {
    const args = await fixtureArgs('outside-root');
    const outside = join(dirname(args.artifactRoot!), 'outside');
    const browser = new FakeBrowser();

    await expect(generateMonthlyCheatsheet({ ...args, outDir: outside }, fakeDependencies(browser)))
      .rejects.toThrow(/artifact root/i);
    await expect(access(outside)).rejects.toThrow();
    expect(browser.contexts).toEqual([]);
  });

  it.each(['src', 'scripts', 'workers', 'browser-tests'])('rejects a configured artifact root inside the %s source tree', async (sourceTree) => {
    const args = await fixtureArgs(`source-root-${sourceTree}`);
    const sourceArtifactRoot = resolve(sourceTree, '.newsletter-artifacts-test');
    const output = join(sourceArtifactRoot, 'artifacts');
    const browser = new FakeBrowser();

    await expect(generateMonthlyCheatsheet({
      ...args,
      artifactRoot: sourceArtifactRoot,
      outDir: output,
    }, fakeDependencies(browser))).rejects.toThrow(/source directory/i);
    await expect(access(output)).rejects.toThrow();
    expect(browser.contexts).toEqual([]);
  });

  it('rejects symbolic-link traversal anywhere beneath the artifact root', async () => {
    const args = await fixtureArgs('symlink');
    await mkdir(args.artifactRoot!, { recursive: true });
    await symlink(resolve('src'), join(args.artifactRoot!, 'source-link'), 'dir');
    const output = join(args.artifactRoot!, 'source-link', 'artifacts');
    const browser = new FakeBrowser();

    await expect(generateMonthlyCheatsheet({ ...args, outDir: output }, fakeDependencies(browser)))
      .rejects.toThrow(/symbolic link/i);
    expect(browser.contexts).toEqual([]);
  });

  it('honors an exclusive publish lock and never removes another generator lock', async () => {
    const args = await fixtureArgs('locked');
    await mkdir(dirname(args.outDir), { recursive: true });
    const lock = `${args.outDir}.lock`;
    await writeFile(lock, 'other generator');
    const browser = new FakeBrowser();

    await expect(generateMonthlyCheatsheet(args, fakeDependencies(browser))).rejects.toThrow(/locked/i);
    expect(await readFile(lock, 'utf8')).toBe('other generator');
    await expect(access(args.outDir)).rejects.toThrow();
    expect(browser.contexts).toEqual([]);
  });

  it('publishes with no-replace semantics when another actor creates the target during rendering', async () => {
    const args = await fixtureArgs('publish-race');
    const browser = new FakeBrowser();
    const originalNewContext = browser.newContext.bind(browser);
    browser.newContext = async (options: unknown) => {
      const context = await originalNewContext(options);
      context.page.onPdf = async () => mkdir(args.outDir);
      return context;
    };

    await expect(generateMonthlyCheatsheet(args, fakeDependencies(browser))).rejects.toThrow(/new directory|already exists/i);
    expect(await readdir(args.outDir)).toEqual([]);
    await expect(access(`${args.outDir}.lock`)).rejects.toThrow();
    expect((await readdir(dirname(args.outDir))).some((name) => name.startsWith(`.${basename(args.outDir)}.staging-`))).toBe(false);
  });

  it('does not unlink a foreign file that replaces its lock path during rendering', async () => {
    const args = await fixtureArgs('lock-swap');
    const browser = new FakeBrowser();
    const originalNewContext = browser.newContext.bind(browser);
    browser.newContext = async (options: unknown) => {
      const context = await originalNewContext(options);
      context.page.onPdf = async () => {
        await unlink(`${args.outDir}.lock`);
        await writeFile(`${args.outDir}.lock`, 'foreign lock');
      };
      return context;
    };

    await generateMonthlyCheatsheet(args, fakeDependencies(browser));

    expect(await readFile(`${args.outDir}.lock`, 'utf8')).toBe('foreign lock');
  });

  it('derives the canonical revision diff when the verified envelope omits a claimed diff', async () => {
    const args = await fixtureArgs('derived-diff');
    const { previous, current } = changesFixture();
    await writeFile(args.changes, `${JSON.stringify({ previous, current })}\n`);

    const output = await generateMonthlyCheatsheet(args, fakeDependencies(new FakeBrowser()));

    expect(output.manifest.changes).toEqual({
      fromRevision: changesFixture().changes?.fromRevision,
      toRevision: changesFixture().changes?.toRevision,
      dedupeKey: changesFixture().changes?.dedupeKey,
    });
  });

  it.each([
    ['noncanonical fact id', (envelope: VerifiedChangesFixture) => ({
      ...envelope,
      changes: { ...envelope.changes!, priceDrops: [{ ...envelope.changes!.priceDrops[0], id: 'fabricated' }] },
    })],
    ['duplicate fact', (envelope: VerifiedChangesFixture) => ({
      ...envelope,
      changes: { ...envelope.changes!, priceDrops: [envelope.changes!.priceDrops[0], envelope.changes!.priceDrops[0]] },
    })],
    ['fabricated route', (envelope: VerifiedChangesFixture) => ({
      ...envelope,
      changes: { ...envelope.changes!, priceDrops: [{ ...envelope.changes!.priceDrops[0], routeId: 'openrouter:invented' }] },
    })],
    ['current route values that differ from the benchmark', (envelope: VerifiedChangesFixture) => ({
      ...envelope,
      current: {
        ...envelope.current,
        priceChecks: [{ ...envelope.current.priceChecks[0], inputUsdPerMillion: 0.5 }],
      },
    })],
  ] as const)('rejects a %s in a purported verified revision envelope', async (_label, mutate) => {
    const args = await fixtureArgs(`forged-${_label.replaceAll(' ', '-')}`);
    await writeFile(args.changes, `${JSON.stringify(mutate(changesFixture()))}\n`);
    const browser = new FakeBrowser();

    await expect(generateMonthlyCheatsheet(args, fakeDependencies(browser))).rejects.toThrow(/canonical|current snapshot|unique/i);
    await expect(access(args.outDir)).rejects.toThrow();
    expect(browser.contexts).toEqual([]);
  });

  it('cleans only its sibling staging directory and closes the browser when rendering fails', async () => {
    const args = await fixtureArgs('failure');
    const browser = new FakeBrowser();
    const originalNewContext = browser.newContext.bind(browser);
    browser.newContext = async (options: unknown) => {
      const context = await originalNewContext(options);
      context.page.failPdf = true;
      return context;
    };

    await expect(generateMonthlyCheatsheet(args, fakeDependencies(browser))).rejects.toThrow('PDF failed');
    await expect(access(args.outDir)).rejects.toThrow();
    expect((await readdir(dirname(args.outDir))).some((name) => name.startsWith(`.${basename(args.outDir)}.staging-`))).toBe(false);
    expect(browser.contexts[0].page.closed).toBe(true);
    expect(browser.contexts[0].closed).toBe(true);
    expect(browser.closed).toBe(true);
  });
});
