import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CampaignDraft } from '../src/newsletter/campaign';
import { renderNewsletterHtml, subjectPreviewSet, type CheatsheetDocument } from '../src/newsletter/cheatsheet';
import type { RevisionChanges } from '../src/newsletter/revision-diff';
import {
  BrevoCampaignError,
  createCampaignDraft,
  createCampaignDraftFromReceipt,
  createNewsletterCampaignDraft,
  parseBrevoCampaignConfig,
  parseCreateNewsletterCampaignDraftArgs,
  runCreateNewsletterCampaignDraftCli,
  type BrevoCampaignConfig,
} from './create-brevo-campaign-draft';

const temporaryRoots: string[] = [];
const encoder = new TextEncoder();

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

function config(): BrevoCampaignConfig {
  return {
    apiKey: 'test-server-only-api-key',
    sender: { id: 17 },
    monthlyCheatsheetListId: 23,
  };
}

function draft(): CampaignDraft {
  return {
    dedupeKey: '["benchmark_previous","benchmark_fixture"]',
    audience: 'monthly-cheatsheet',
    name: 'TokenBench monthly cheatsheet benchmark_fixture abcdef0123456789',
    subject: 'TokenBench August 2026: 2 new models and 1 verified price drop',
    previewText: 'Frozen benchmark revision benchmark_fixture with validated ranks.',
    htmlContent: '<!doctype html><p>Frozen benchmark revision benchmark_fixture.</p>',
    recipients: { listIds: [999] },
    attachmentUrl: 'https://artifacts.example.test/newsletters/tokenbench-cheatsheet.pdf',
  };
}

function environment(overrides: Record<string, unknown> = {}) {
  return {
    BREVO_CAMPAIGN_API_KEY: 'test-server-only-api-key',
    BREVO_CAMPAIGN_SENDER_ID: '17',
    BREVO_CAMPAIGN_MONTHLY_CHEATSHEET_LIST_ID: '23',
    ...overrides,
  };
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function artifactChanges(): RevisionChanges {
  const newModelIds = [
    JSON.stringify(['benchmark_fixture', 'new-model', 'fixture:alpha', '', '']),
    JSON.stringify(['benchmark_fixture', 'new-model', 'fixture:bravo', '', '']),
  ];
  const priceDropId = JSON.stringify([
    'benchmark_fixture', 'price-drop', 'fixture:alpha', 'fixture', 'direct:alpha',
  ]);
  return {
    fromRevision: 'benchmark_previous',
    toRevision: 'benchmark_fixture',
    dedupeKey: JSON.stringify(['benchmark_previous', 'benchmark_fixture', ...newModelIds, priceDropId]),
    newModels: [
      { id: newModelIds[0], modelKey: 'fixture:alpha' },
      { id: newModelIds[1], modelKey: 'fixture:bravo' },
    ],
    priceDrops: [{
      id: priceDropId,
      modelKey: 'fixture:alpha',
      providerId: 'fixture',
      routeId: 'direct:alpha',
      previousInputUsdPerMillion: 2,
      currentInputUsdPerMillion: 1.5,
      previousOutputUsdPerMillion: 6,
      currentOutputUsdPerMillion: 5,
    }],
  };
}

function artifactDocument(): CheatsheetDocument {
  return {
    revision: 'benchmark_fixture',
    catalogRevision: 'catalog_fixture',
    generatedAt: '2026-08-01T00:00:00.000Z',
    publishedAt: '2026-08-01T00:00:00.000Z',
    categories: [],
  };
}

async function artifactInputs() {
  const root = await mkdtemp(join(tmpdir(), 'tokenbench-campaign-'));
  temporaryRoots.push(root);
  const changes = artifactChanges();
  const document = artifactDocument();
  const files = [
    ['tokenbench-cheatsheet.csv', encoder.encode('modelKey\nfixture:alpha\n')],
    ['tokenbench-cheatsheet.html', encoder.encode('<!doctype html><title>cheatsheet</title>')],
    ['tokenbench-cheatsheet-newsletter.html', encoder.encode(renderNewsletterHtml(document, changes))],
    ['tokenbench-cheatsheet.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46])],
    ['tokenbench-cheatsheet-subjects.json', encoder.encode(`${JSON.stringify(subjectPreviewSet(document, changes), null, 2)}\n`)],
  ] as const;
  const manifest = {
    schemaVersion: 'tokenbench-cheatsheet/v1' as const,
    revision: document.revision,
    catalogRevision: document.catalogRevision,
    generatedAt: document.generatedAt,
    changes: {
      fromRevision: changes.fromRevision,
      toRevision: changes.toRevision,
      dedupeKey: changes.dedupeKey,
    },
    files: files.map(([name, bytes]) => ({ name, bytes: bytes.byteLength, sha256: sha256(bytes) })),
  };
  await Promise.all(files.map(([name, bytes]) => writeFile(join(root, name), bytes)));
  const manifestPath = join(root, 'tokenbench-cheatsheet.manifest.json');
  const changesPath = join(root, 'changes.json');
  await Promise.all([
    writeFile(manifestPath, `${JSON.stringify(manifest)}\n`),
    writeFile(changesPath, `${JSON.stringify(changes)}\n`),
  ]);
  return { manifestPath, changesPath, receiptPath: join(root, 'campaign-receipt.json') };
}

describe('parseBrevoCampaignConfig', () => {
  it('reads only complete server-side campaign configuration', () => {
    expect(parseBrevoCampaignConfig(environment())).toEqual(config());
    expect(parseBrevoCampaignConfig(environment({ BREVO_CAMPAIGN_API_KEY: '  ' }))).toBeNull();
    expect(parseBrevoCampaignConfig(environment({ BREVO_CAMPAIGN_SENDER_ID: '0' }))).toBeNull();
    expect(parseBrevoCampaignConfig(environment({ BREVO_CAMPAIGN_MONTHLY_CHEATSHEET_LIST_ID: '1.5' }))).toBeNull();
  });

  it('accepts one explicit sender identity or a complete sender address', () => {
    expect(parseBrevoCampaignConfig(environment({
      BREVO_CAMPAIGN_SENDER_ID: undefined,
      BREVO_CAMPAIGN_SENDER_NAME: 'TokenBench',
      BREVO_CAMPAIGN_SENDER_EMAIL: 'news@tokenbench.example',
    }))).toEqual({
      apiKey: 'test-server-only-api-key',
      sender: { name: 'TokenBench', email: 'news@tokenbench.example' },
      monthlyCheatsheetListId: 23,
    });
    expect(parseBrevoCampaignConfig(environment({
      BREVO_CAMPAIGN_SENDER_NAME: 'TokenBench',
    }))).toBeNull();
  });
});

describe('parseCreateNewsletterCampaignDraftArgs', () => {
  it('accepts only the explicit local draft command arguments', () => {
    expect(parseCreateNewsletterCampaignDraftArgs([
      '--manifest', 'artifacts/tokenbench-cheatsheet.manifest.json',
      '--changes', 'inputs/changes.json',
      '--artifact-base-url', 'https://artifacts.example.test/newsletters/',
      '--receipt-file', 'state/campaign-receipts.json',
    ])).toEqual({
      manifest: 'artifacts/tokenbench-cheatsheet.manifest.json',
      changes: 'inputs/changes.json',
      artifactBaseUrl: 'https://artifacts.example.test/newsletters/',
      receiptFile: 'state/campaign-receipts.json',
    });
    expect(() => parseCreateNewsletterCampaignDraftArgs([
      '--manifest', 'manifest.json', '--changes', 'changes.json',
      '--artifact-base-url', 'https://artifacts.example.test/',
    ])).toThrow(/required options/i);
    expect(() => parseCreateNewsletterCampaignDraftArgs([
      '--manifest', 'one.json', '--manifest', 'two.json',
      '--changes', 'changes.json', '--artifact-base-url', 'https://artifacts.example.test/',
      '--receipt-file', 'receipt.json',
    ])).toThrow(/once/i);
  });
});

describe('createCampaignDraft', () => {
  it('creates and verifies a draft with the monthly list only', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{"id":42}', { status: 201 }))
      .mockResolvedValueOnce(new Response('{"id":42,"status":"draft"}', { status: 200 }));

    const receipt = await createCampaignDraft(config(), draft(), fetchImpl);

    expect(receipt).toEqual({
      schemaVersion: 'tokenbench-brevo-campaign-receipt/v1',
      dedupeKey: '["benchmark_previous","benchmark_fixture"]',
      campaignId: 42,
      campaignName: 'TokenBench monthly cheatsheet benchmark_fixture abcdef0123456789',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('https://api.brevo.com/v3/emailCampaigns');
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      name: 'TokenBench monthly cheatsheet benchmark_fixture abcdef0123456789',
      sender: { id: 17 },
      subject: 'TokenBench August 2026: 2 new models and 1 verified price drop',
      previewText: 'Frozen benchmark revision benchmark_fixture with validated ranks.',
      htmlContent: '<!doctype html><p>Frozen benchmark revision benchmark_fixture.</p>',
      recipients: { listIds: [23] },
      attachmentUrl: 'https://artifacts.example.test/newsletters/tokenbench-cheatsheet.pdf',
    });
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe('https://api.brevo.com/v3/emailCampaigns/42');
    expect(fetchImpl.mock.calls.map(([url]) => String(url)).join(' ')).not.toMatch(/sendNow|sendTest|schedule|lists|templates|accounts/i);
  });

  it('does not create the same revision draft twice', async () => {
    const fetchImpl = vi.fn();
    const existingReceipt = {
      schemaVersion: 'tokenbench-brevo-campaign-receipt/v1' as const,
      dedupeKey: draft().dedupeKey,
      campaignId: 42,
      campaignName: draft().name,
    };

    await expect(createCampaignDraftFromReceipt(existingReceipt, config(), draft(), fetchImpl))
      .rejects.toThrow(/already drafted/i);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns a typed secret-free error for an upstream response', async () => {
    const responseBody = 'builder@example.com cannot be drafted with test-server-only-api-key';
    const failure = await createCampaignDraft(
      config(),
      draft(),
      vi.fn().mockResolvedValue(new Response(responseBody, { status: 503 })),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BrevoCampaignError);
    expect(failure).toMatchObject({ status: 503 });
    expect(String(failure)).not.toContain('builder@example.com');
    expect(String(failure)).not.toContain('test-server-only-api-key');
    expect(String(failure)).not.toContain(responseBody);
  });

  it('fails closed on malformed campaign configuration before network access', async () => {
    const fetchImpl = vi.fn();

    await expect(createCampaignDraft({
      ...config(),
      monthlyCheatsheetListId: 0,
    }, draft(), fetchImpl)).rejects.toThrow(/configuration/i);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a differently identified campaign even when its status is draft', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{"id":42}', { status: 201 }))
      .mockResolvedValueOnce(new Response('{"id":43,"status":"draft"}', { status: 200 }));

    await expect(createCampaignDraft(config(), draft(), fetchImpl))
      .rejects.toBeInstanceOf(BrevoCampaignError);
  });
});

describe('createNewsletterCampaignDraft', () => {
  it('records a verified draft atomically and rejects its rerun before network access', async () => {
    const files = await artifactInputs();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{"id":42}', { status: 201 }))
      .mockResolvedValueOnce(new Response('{"id":42,"status":"draft"}', { status: 200 }));
    const args = {
      manifest: files.manifestPath,
      changes: files.changesPath,
      artifactBaseUrl: 'https://artifacts.example.test/newsletters/',
      receiptFile: files.receiptPath,
    };

    const receipt = await createNewsletterCampaignDraft(args, {
      environment: environment(),
      fetchImpl,
    });

    expect(JSON.parse(await readFile(files.receiptPath, 'utf8'))).toEqual({
      schemaVersion: 'tokenbench-brevo-campaign-receipts/v1',
      drafts: [receipt],
    });
    await expect(createNewsletterCampaignDraft(args, {
      environment: environment(),
      fetchImpl,
    })).rejects.toThrow(/already drafted/i);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('fails closed on missing campaign configuration before network access', async () => {
    const files = await artifactInputs();
    const fetchImpl = vi.fn();

    await expect(createNewsletterCampaignDraft({
      manifest: files.manifestPath,
      changes: files.changesPath,
      artifactBaseUrl: 'https://artifacts.example.test/newsletters/',
      receiptFile: files.receiptPath,
    }, { environment: {}, fetchImpl })).rejects.toThrow(/configuration/i);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails before network access when the receipt lock is held', async () => {
    const files = await artifactInputs();
    await writeFile(`${files.receiptPath}.lock`, 'another process');
    const fetchImpl = vi.fn();

    await expect(createNewsletterCampaignDraft({
      manifest: files.manifestPath,
      changes: files.changesPath,
      artifactBaseUrl: 'https://artifacts.example.test/newsletters/',
      receiptFile: files.receiptPath,
    }, { environment: environment(), fetchImpl })).rejects.toThrow(/locked/i);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not record a campaign unless Brevo returns draft status', async () => {
    const files = await artifactInputs();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{"id":42}', { status: 201 }))
      .mockResolvedValueOnce(new Response('{"id":42,"status":"scheduled"}', { status: 200 }));

    await expect(createNewsletterCampaignDraft({
      manifest: files.manifestPath,
      changes: files.changesPath,
      artifactBaseUrl: 'https://artifacts.example.test/newsletters/',
      receiptFile: files.receiptPath,
    }, { environment: environment(), fetchImpl })).rejects.toBeInstanceOf(BrevoCampaignError);

    await expect(readFile(files.receiptPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('checks local artifact hashes before any remote campaign request', async () => {
    const files = await artifactInputs();
    await writeFile(join(files.manifestPath, '..', 'tokenbench-cheatsheet-newsletter.html'), 'tampered');
    const fetchImpl = vi.fn();

    await expect(createNewsletterCampaignDraft({
      manifest: files.manifestPath,
      changes: files.changesPath,
      artifactBaseUrl: 'https://artifacts.example.test/newsletters/',
      receiptFile: files.receiptPath,
    }, { environment: environment(), fetchImpl })).rejects.toThrow(/digest|facts/i);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed on a malformed receipt before network access', async () => {
    const files = await artifactInputs();
    await writeFile(files.receiptPath, JSON.stringify({
      schemaVersion: 'tokenbench-brevo-campaign-receipts/v1',
      drafts: [{
        schemaVersion: 'tokenbench-brevo-campaign-receipt/v1',
        dedupeKey: 'different-revision',
        campaignId: '42',
        campaignName: 'TokenBench monthly cheatsheet',
      }],
    }));
    const fetchImpl = vi.fn();

    await expect(createNewsletterCampaignDraft({
      manifest: files.manifestPath,
      changes: files.changesPath,
      artifactBaseUrl: 'https://artifacts.example.test/newsletters/',
      receiptFile: files.receiptPath,
    }, { environment: environment(), fetchImpl })).rejects.toThrow(/receipt/i);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('runCreateNewsletterCampaignDraftCli', () => {
  it('prints a safe receipt only after a verified draft', async () => {
    const files = await artifactInputs();
    const stdout = vi.fn();
    const stderr = vi.fn();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{"id":42}', { status: 201 }))
      .mockResolvedValueOnce(new Response('{"id":42,"status":"draft"}', { status: 200 }));

    const exitCode = await runCreateNewsletterCampaignDraftCli([
      '--manifest', files.manifestPath,
      '--changes', files.changesPath,
      '--artifact-base-url', 'https://artifacts.example.test/newsletters/',
      '--receipt-file', files.receiptPath,
    ], { environment: environment(), fetchImpl }, { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({ campaignId: 42 });
    expect(String(stdout.mock.calls[0]?.[0])).not.toContain('test-server-only-api-key');
    expect(stderr).not.toHaveBeenCalled();
  });
});
