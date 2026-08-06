import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { BenchmarkRevision } from '../src/benchmarks/contracts';
import type { CatalogResponse } from '../src/catalog/contracts';
import type { RevisionChanges } from '../src/newsletter/revision-diff';
import {
  generateMonthlyCheatsheet,
  parseGenerateMonthlyCheatsheetArgs,
  type CheatsheetBrowser,
  type GenerateMonthlyCheatsheetArgs,
} from './generate-monthly-cheatsheet';

const temporaryRoots: string[] = [];
const SHA = `sha256:${'a'.repeat(64)}`;
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
      modelKey: 'fixture:alpha', sourceId: 'openrouter', providerId: 'openrouter', inputUsdPerMillion: 1,
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
    modelOffers: [],
    provenance: [],
  };
}

function changesFixture(overrides: Partial<RevisionChanges> = {}): RevisionChanges {
  return {
    fromRevision: 'benchmark_previous',
    toRevision: 'benchmark_fixture',
    dedupeKey: 'fixture-dedupe',
    newModels: [{ id: 'new-alpha', modelKey: 'fixture:new-model' }],
    priceDrops: [],
    ...overrides,
  };
}

class FakePage {
  readonly contents: string[] = [];
  readonly pdfOptions: unknown[] = [];
  readonly screenshotOptions: unknown[] = [];
  closed = false;
  failPdf = false;

  async setContent(html: string): Promise<void> {
    this.contents.push(html);
  }

  async emulateMedia(): Promise<void> {}

  async pdf(options: unknown): Promise<Uint8Array> {
    this.pdfOptions.push(options);
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
  const root = await mkdtemp(join(tmpdir(), `tokenbench-cheatsheet-${name}-`));
  temporaryRoots.push(root);
  const benchmarks = join(root, 'benchmarks.json');
  const catalog = join(root, 'catalog.json');
  const changes = join(root, 'changes.json');
  await Promise.all([
    writeFile(benchmarks, `${JSON.stringify(benchmarkFixture(), null, 2)}\n`),
    writeFile(catalog, `${JSON.stringify(catalogFixture(), null, 2)}\n`),
    writeFile(changes, `${JSON.stringify(changesFixture(), null, 2)}\n`),
  ]);
  return { benchmarks, catalog, changes, outDir: join(root, 'artifacts'), shareImage: true, ...overrides };
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
    await writeFile(args.changes, `${JSON.stringify(changesFixture({ toRevision: 'other_revision' }))}\n`);
    const browser = new FakeBrowser();

    await expect(generateMonthlyCheatsheet(args, fakeDependencies(browser))).rejects.toThrow(/changes.*revision/i);
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
