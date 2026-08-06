import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { renameSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderNewsletterHtml, subjectPreviewSet, type CheatsheetDocument } from '../src/newsletter/cheatsheet';
import type { RevisionChanges } from '../src/newsletter/revision-diff';
import * as campaignDraftModule from './create-brevo-campaign-draft';
import {
  BrevoCampaignError,
  createNewsletterCampaignDraft,
  parseBrevoCampaignConfig,
  parseCreateNewsletterCampaignDraftArgs,
  runCreateNewsletterCampaignDraftCli,
  verifySignedDeploymentReceipt,
  type BrevoCampaignConfig,
} from './create-brevo-campaign-draft';

const temporaryRoots: string[] = [];
const encoder = new TextEncoder();
const TRUSTED_KEYS = generateKeyPairSync('ed25519');
const WRONG_KEYS = generateKeyPairSync('ed25519');
const TRUSTED_PUBLIC_KEY = TRUSTED_KEYS.publicKey.export({ format: 'pem', type: 'spki' }).toString();

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

function canonicalSignatureJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalSignatureJson).sort().join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalSignatureJson(record[key])}`)
      .join(',')}}`;
  }
  throw new TypeError('Unsupported signature value');
}

function signDeploymentReceipt(
  unsigned: Record<string, unknown>,
  privateKey = TRUSTED_KEYS.privateKey,
) {
  return {
    ...unsigned,
    signature: {
      algorithm: 'Ed25519' as const,
      value: sign(null, Buffer.from(canonicalSignatureJson(unsigned)), privateKey).toString('base64'),
    },
  };
}

function artifactChanges(toRevision = 'benchmark_fixture'): RevisionChanges {
  const newModelIds = [
    JSON.stringify([toRevision, 'new-model', 'fixture:alpha', '', '']),
    JSON.stringify([toRevision, 'new-model', 'fixture:bravo', '', '']),
  ];
  const priceDropId = JSON.stringify([
    toRevision, 'price-drop', 'fixture:alpha', 'fixture', 'direct:alpha',
  ]);
  return {
    fromRevision: 'benchmark_previous',
    toRevision,
    dedupeKey: JSON.stringify(['benchmark_previous', toRevision, ...newModelIds, priceDropId]),
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

function artifactDocument(revision = 'benchmark_fixture'): CheatsheetDocument {
  return {
    revision,
    catalogRevision: 'catalog_fixture',
    generatedAt: '2026-08-01T00:00:00.000Z',
    publishedAt: '2026-08-01T00:00:00.000Z',
    categories: [],
  };
}

async function artifactInputs(options: { revision?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'tokenbench-campaign-'));
  temporaryRoots.push(root);
  const artifactRoot = join(root, 'artifacts');
  const stateRoot = join(root, 'state');
  const bundleRoot = join(artifactRoot, 'bundle');
  await Promise.all([
    mkdir(bundleRoot, { recursive: true }),
    mkdir(stateRoot, { recursive: true }),
  ]);
  const changes = artifactChanges(options.revision);
  const document = artifactDocument(options.revision);
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
  const changesEnvelope = {
    previous: { revision: changes.fromRevision, publicationReceipt: 'trusted-by-deployment-signature' },
    current: { revision: changes.toRevision, snapshot: 'frozen-current-revision' },
    changes,
  };
  const manifestHash = sha256(encoder.encode(canonicalSignatureJson(manifest))).slice('sha256:'.length);
  const artifactBaseUrl = `https://artifacts.example.test/revisions/${manifest.revision}/sha256-${manifestHash}/`;
  const unsignedDeploymentReceipt = {
    schemaVersion: 'tokenbench-cheatsheet-deployment-receipt/v1' as const,
    manifest,
    changesEnvelope,
    artifactBaseUrl,
    artifacts: manifest.files.map((file) => ({
      ...file,
      url: new URL(file.name, artifactBaseUrl).toString(),
    })),
  };
  const deploymentReceipt = signDeploymentReceipt(unsignedDeploymentReceipt);
  await Promise.all(files.map(([name, bytes]) => writeFile(join(bundleRoot, name), bytes)));
  const manifestPath = join(bundleRoot, 'tokenbench-cheatsheet.manifest.json');
  const changesPath = join(bundleRoot, 'changes.json');
  const deploymentReceiptPath = join(bundleRoot, 'deployment-receipt.json');
  const stateKey = sha256(encoder.encode(changes.dedupeKey)).slice('sha256:'.length);
  const stateDirectory = join(stateRoot, 'campaigns', stateKey);
  await Promise.all([
    writeFile(manifestPath, `${JSON.stringify(manifest)}\n`),
    writeFile(changesPath, `${JSON.stringify(changesEnvelope)}\n`),
    writeFile(deploymentReceiptPath, `${JSON.stringify(deploymentReceipt)}\n`),
  ]);
  return {
    artifactRoot,
    stateRoot,
    bundleRoot,
    manifest,
    changes,
    changesEnvelope,
    deploymentReceipt,
    artifactBaseUrl,
    manifestPath,
    changesPath,
    deploymentReceiptPath,
    stateKey,
    stateDirectory,
    pendingPath: join(stateDirectory, 'pending.json'),
    receiptPath: join(stateDirectory, 'receipt.json'),
    lockPath: join(stateDirectory, 'draft.lock'),
    args: {
      manifest: 'bundle/tokenbench-cheatsheet.manifest.json',
      changes: 'bundle/changes.json',
      deploymentReceipt: 'bundle/deployment-receipt.json',
      artifactBaseUrl,
    },
  };
}

function runtimeEnvironment(files: Awaited<ReturnType<typeof artifactInputs>>, overrides: Record<string, unknown> = {}) {
  return environment({
    TOKENBENCH_PUBLICATION_VERIFY_KEY: TRUSTED_PUBLIC_KEY,
    TOKENBENCH_NEWSLETTER_ARTIFACT_ROOT: files.artifactRoot,
    TOKENBENCH_NEWSLETTER_STATE_ROOT: files.stateRoot,
    ...overrides,
  });
}

function lockRecord(
  files: Awaited<ReturnType<typeof artifactInputs>>,
  options: { pid: number; startedAt: string; token?: string },
) {
  return {
    schemaVersion: 'tokenbench-brevo-campaign-lock/v1',
    pid: options.pid,
    startedAt: options.startedAt,
    fingerprint: `sha256:${files.stateKey}`,
    token: options.token ?? '11111111-1111-4111-8111-111111111111',
  };
}

describe('verifySignedDeploymentReceipt', () => {
  it('verifies the canonical full change envelope, manifest hashes, and immutable URLs', async () => {
    const files = await artifactInputs();

    const verified = verifySignedDeploymentReceipt(files.deploymentReceipt, TRUSTED_PUBLIC_KEY);

    expect(verified.manifest).toEqual(files.manifest);
    expect(verified.changesEnvelope).toEqual(files.changesEnvelope);
    expect(verified.artifacts.find((artifact) => artifact.name === 'tokenbench-cheatsheet.pdf')?.url)
      .toBe(`${files.artifactBaseUrl}tokenbench-cheatsheet.pdf`);
  });

  it('rejects a coordinated locally rehashed artifact set without the trusted signature', async () => {
    const files = await artifactInputs();
    const forgedUnsigned = {
      ...files.deploymentReceipt,
      manifest: { ...files.manifest, revision: 'forged_revision' },
      signature: undefined,
    };
    const forged = {
      ...forgedUnsigned,
      signature: {
        algorithm: 'Ed25519' as const,
        value: sign(
          null,
          Buffer.from(canonicalSignatureJson(forgedUnsigned)),
          WRONG_KEYS.privateKey,
        ).toString('base64'),
      },
    };

    expect(() => verifySignedDeploymentReceipt(forged, TRUSTED_PUBLIC_KEY))
      .toThrow(/signature/i);
  });

  it('rejects a signed bare changes object instead of a full publication envelope', async () => {
    const files = await artifactInputs();
    const { signature: _signature, ...unsigned } = files.deploymentReceipt;
    const bare = signDeploymentReceipt({ ...unsigned, changesEnvelope: files.changes });

    expect(() => verifySignedDeploymentReceipt(bare, TRUSTED_PUBLIC_KEY))
      .toThrow(/envelope/i);
  });

  it('enforces signed artifact count and byte limits', async () => {
    const files = await artifactInputs();
    const oversizedManifest = {
      ...files.manifest,
      files: files.manifest.files.map((file) => file.name === 'tokenbench-cheatsheet.pdf'
        ? { ...file, bytes: 8 * 1024 * 1024 + 1 }
        : file),
    };
    const manifestHash = sha256(encoder.encode(canonicalSignatureJson(oversizedManifest))).slice(7);
    const artifactBaseUrl = `https://artifacts.example.test/revisions/${oversizedManifest.revision}/sha256-${manifestHash}/`;
    const oversized = signDeploymentReceipt({
      schemaVersion: 'tokenbench-cheatsheet-deployment-receipt/v1',
      manifest: oversizedManifest,
      changesEnvelope: files.changesEnvelope,
      artifactBaseUrl,
      artifacts: oversizedManifest.files.map((file) => ({
        ...file,
        url: new URL(file.name, artifactBaseUrl).toString(),
      })),
    });

    expect(() => verifySignedDeploymentReceipt(oversized, TRUSTED_PUBLIC_KEY))
      .toThrow(/size|bytes|limit/i);

    const tooManyManifest = {
      ...files.manifest,
      files: [
        ...files.manifest.files,
        ...Array.from({ length: 4 }, (_, index) => ({
          name: `extra-${index}.txt`, bytes: 1, sha256: `sha256:${String(index).repeat(64)}`,
        })),
      ],
    };
    const tooManyHash = sha256(encoder.encode(canonicalSignatureJson(tooManyManifest))).slice(7);
    const tooManyBaseUrl = `https://artifacts.example.test/revisions/${tooManyManifest.revision}/sha256-${tooManyHash}/`;
    const tooMany = signDeploymentReceipt({
      schemaVersion: 'tokenbench-cheatsheet-deployment-receipt/v1',
      manifest: tooManyManifest,
      changesEnvelope: files.changesEnvelope,
      artifactBaseUrl: tooManyBaseUrl,
      artifacts: tooManyManifest.files.map((file) => ({ ...file, url: new URL(file.name, tooManyBaseUrl).toString() })),
    });
    expect(() => verifySignedDeploymentReceipt(tooMany, TRUSTED_PUBLIC_KEY)).toThrow(/count|limit/i);
  });
});

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

  it('rejects control characters and oversized server configuration', () => {
    expect(parseBrevoCampaignConfig(environment({ BREVO_CAMPAIGN_API_KEY: 'secret\r\nInjected: yes' }))).toBeNull();
    expect(parseBrevoCampaignConfig(environment({
      BREVO_CAMPAIGN_SENDER_ID: undefined,
      BREVO_CAMPAIGN_SENDER_NAME: `TokenBench${String.fromCharCode(0)}`,
      BREVO_CAMPAIGN_SENDER_EMAIL: 'news@tokenbench.example',
    }))).toBeNull();
    expect(parseBrevoCampaignConfig(environment({ BREVO_CAMPAIGN_API_KEY: 'x'.repeat(4_097) }))).toBeNull();
  });
});

describe('parseCreateNewsletterCampaignDraftArgs', () => {
  it('accepts only the explicit local draft command arguments', () => {
    expect(parseCreateNewsletterCampaignDraftArgs([
      '--manifest', 'artifacts/tokenbench-cheatsheet.manifest.json',
      '--changes', 'inputs/changes.json',
      '--deployment-receipt', 'receipts/deployment.json',
      '--artifact-base-url', 'https://artifacts.example.test/newsletters/',
    ])).toEqual({
      manifest: 'artifacts/tokenbench-cheatsheet.manifest.json',
      changes: 'inputs/changes.json',
      deploymentReceipt: 'receipts/deployment.json',
      artifactBaseUrl: 'https://artifacts.example.test/newsletters/',
    });
    expect(() => parseCreateNewsletterCampaignDraftArgs([
      '--manifest', 'manifest.json', '--changes', 'changes.json',
      '--artifact-base-url', 'https://artifacts.example.test/',
    ])).toThrow(/required options/i);
    expect(() => parseCreateNewsletterCampaignDraftArgs([
      '--manifest', 'one.json', '--manifest', 'two.json',
      '--changes', 'changes.json', '--deployment-receipt', 'deployment.json',
      '--artifact-base-url', 'https://artifacts.example.test/',
    ])).toThrow(/once/i);
    expect(() => parseCreateNewsletterCampaignDraftArgs([
      '--manifest', 'manifest.json', '--changes', 'changes.json',
      '--deployment-receipt', 'deployment.json',
      '--artifact-base-url', 'https://artifacts.example.test/',
      '--receipt-file', 'alternate-lock.json',
    ])).toThrow(/unknown argument/i);
  });
});

describe('campaign mutation export boundary', () => {
  it('does not expose low-level Brevo mutation helpers that bypass signed artifact verification', () => {
    expect(campaignDraftModule).not.toHaveProperty('createCampaignDraft');
    expect(campaignDraftModule).not.toHaveProperty('createCampaignDraftFromReceipt');
    expect(campaignDraftModule).toHaveProperty('createNewsletterCampaignDraft');
  });
});

function documentedBrevoCampaign(
  payload: Record<string, unknown>,
  status: string,
): { id: number; status: string } & Record<string, unknown> {
  return {
    id: 42,
    name: payload.name,
    status,
    type: 'classic',
    createdAt: '2026-08-07T00:00:00.000Z',
    footer: '[DEFAULT_FOOTER]',
    header: '[DEFAULT_HEADER]',
    htmlContent: payload.htmlContent,
    modifiedAt: '2026-08-07T00:00:01.000Z',
    replyTo: 'news@tokenbench.example',
    sender: { email: 'news@tokenbench.example', id: 17, name: 'TokenBench' },
    testSent: false,
    recipients: { exclusionLists: [], lists: [23] },
    statistics: { campaignStats: [], globalStats: {} },
    attachmentFile: 'https://img.brevo.example.test/42/tokenbench-cheatsheet.pdf',
    attachmentUrl: payload.attachmentUrl,
    previewText: payload.previewText,
    scheduledAt: '',
    subject: payload.subject,
    inlineImageActivation: false,
    mirrorActive: false,
    recurring: false,
    shareLink: 'Draft campaign has no public share URL',
    tags: [],
    toField: '',
  };
}

function brevoDraftHarness(options: {
  ambiguousPost?: boolean;
  scheduled?: boolean;
  wrongName?: boolean;
  wrongRecipients?: boolean;
  wrongSender?: boolean;
  wrongType?: boolean;
} = {}) {
  let remote: ({ id: number; status: string } & Record<string, unknown>) | null = null;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    expect(init?.redirect).toBe('error');
    if (init?.method === 'GET' && url.includes('?')) {
      return new Response(JSON.stringify({ campaigns: remote ? [remote] : [], count: remote ? 1 : 0 }), { status: 200 });
    }
    if (init?.method === 'POST') {
      const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
      remote = documentedBrevoCampaign(payload, options.scheduled ? 'scheduled' : 'draft');
      if (options.wrongName) remote = { ...remote, name: `${String(remote.name)} altered` };
      if (options.wrongRecipients) remote = { ...remote, recipients: { exclusionLists: [], lists: [99] } };
      if (options.wrongSender) remote = { ...remote, sender: { email: 'other@example.test', id: 99, name: 'Other' } };
      if (options.wrongType) remote = { ...remote, type: 'trigger' };
      if (options.ambiguousPost) throw new TypeError('connection reset after request body');
      return new Response('{"id":42}', { status: 201 });
    }
    if (init?.method === 'GET' && url === 'https://api.brevo.com/v3/emailCampaigns/42' && remote) {
      return new Response(JSON.stringify(remote), { status: 200 });
    }
    throw new Error(`Unexpected Brevo request: ${init?.method} ${url}`);
  });
  return { fetchImpl, remote: () => remote };
}

describe('createNewsletterCampaignDraft', () => {
  it('rejects caller-selected state filenames before local or remote mutation', async () => {
    const files = await artifactInputs();
    const fetchImpl = vi.fn();

    const alternateStateArgs = {
      ...files.args,
      receiptFile: 'alternate-lock.json',
    } as unknown as Parameters<typeof createNewsletterCampaignDraft>[0];
    await expect(createNewsletterCampaignDraft(alternateStateArgs, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toThrow(/arguments|receipt|unknown/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reconciles first, fsyncs pending before POST, then records a verified draft atomically', async () => {
    const files = await artifactInputs();
    const harness = brevoDraftHarness();
    const events: string[] = [];
    let observedLock: Record<string, unknown> | undefined;
    const receipt = await createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files),
      fetchImpl: async (input, init) => {
        observedLock ??= JSON.parse(await readFile(files.lockPath, 'utf8')) as Record<string, unknown>;
        events.push(init?.method === 'POST' ? 'post' : 'get');
        return harness.fetchImpl(input, init);
      },
      syncImpl: async (handle, stage) => {
        events.push(`sync:${stage}`);
        await handle.sync();
      },
    });

    expect(JSON.parse(await readFile(files.receiptPath, 'utf8'))).toEqual(receipt);
    await expect(readFile(files.pendingPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(observedLock).toEqual({
      schemaVersion: 'tokenbench-brevo-campaign-lock/v1',
      pid: process.pid,
      startedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
      fingerprint: `sha256:${files.stateKey}`,
      token: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    });
    expect(events.indexOf('sync:pending-file')).toBeLessThan(events.indexOf('post'));
    expect(events.indexOf('sync:state-directory')).toBeLessThan(events.indexOf('post'));
    expect(String(harness.fetchImpl.mock.calls[0]?.[0]))
      .toBe('https://api.brevo.com/v3/emailCampaigns?type=classic&status=draft&limit=50&offset=0');
    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files),
      fetchImpl: harness.fetchImpl,
    })).rejects.toThrow(/already drafted/i);
    expect(harness.fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('fails closed on missing campaign configuration before network access', async () => {
    const files = await artifactInputs();
    const fetchImpl = vi.fn();

    await expect(createNewsletterCampaignDraft(files.args, { environment: {}, fetchImpl }))
      .rejects.toThrow(/configuration/i);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails before network access when the receipt lock is held', async () => {
    const files = await artifactInputs();
    await mkdir(files.stateDirectory, { recursive: true });
    await writeFile(files.lockPath, JSON.stringify(lockRecord(files, {
      pid: process.pid,
      startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })));
    const fetchImpl = vi.fn();

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toThrow(/locked/i);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('recovers an old lock only after its process owner has terminated', async () => {
    const files = await artifactInputs();
    await mkdir(files.stateDirectory, { recursive: true });
    const terminated = spawnSync(process.execPath, [
      '-e',
      `require('node:fs').writeFileSync(process.argv[1], JSON.stringify({
        schemaVersion: 'tokenbench-brevo-campaign-lock/v1',
        pid: process.pid,
        startedAt: process.argv[2],
        fingerprint: process.argv[3],
        token: '11111111-1111-4111-8111-111111111111',
      }))`,
      files.lockPath,
      new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      `sha256:${files.stateKey}`,
    ], { encoding: 'utf8' });
    expect(terminated.status, terminated.stderr).toBe(0);
    const harness = brevoDraftHarness();

    const receipt = await createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl: harness.fetchImpl,
    });

    expect(receipt.campaignId).toBe(42);
    await expect(readFile(files.lockPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(harness.fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('does not steal a recently created lock from a dead owner', async () => {
    const files = await artifactInputs();
    await mkdir(files.stateDirectory, { recursive: true });
    await writeFile(files.lockPath, JSON.stringify(lockRecord(files, {
      pid: 2_147_483_647,
      startedAt: new Date(Date.now() - 60 * 1000).toISOString(),
    })));
    const fetchImpl = vi.fn();

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toThrow(/locked/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed when a stale lock is replaced during dead-owner verification', async () => {
    const files = await artifactInputs();
    await mkdir(files.stateDirectory, { recursive: true });
    await writeFile(files.lockPath, JSON.stringify(lockRecord(files, {
      pid: 2_147_483_647,
      startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })));
    const replacement = lockRecord(files, {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      token: '22222222-2222-4222-8222-222222222222',
    });
    const oldPath = `${files.lockPath}.old`;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      renameSync(files.lockPath, oldPath);
      writeFileSync(files.lockPath, JSON.stringify(replacement));
      throw Object.assign(new Error('dead owner'), { code: 'ESRCH' });
    });
    const fetchImpl = vi.fn();
    try {
      await expect(createNewsletterCampaignDraft(files.args, {
        environment: runtimeEnvironment(files), fetchImpl,
      })).rejects.toThrow(/locked|ownership/i);
    } finally {
      killSpy.mockRestore();
    }

    expect(JSON.parse(await readFile(files.lockPath, 'utf8'))).toEqual(replacement);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not record a receipt after live lock ownership is replaced', async () => {
    const files = await artifactInputs();
    const harness = brevoDraftHarness();
    const displacedLock = `${files.lockPath}.displaced`;
    const replacement = lockRecord(files, {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      token: '22222222-2222-4222-8222-222222222222',
    });
    let replaced = false;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await harness.fetchImpl(input, init);
      if (!replaced && init?.method === 'POST') {
        replaced = true;
        renameSync(files.lockPath, displacedLock);
        writeFileSync(files.lockPath, JSON.stringify(replacement));
      }
      return response;
    });

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toThrow(/lock|ownership/i);

    await expect(readFile(files.receiptPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.parse(await readFile(files.pendingPath, 'utf8'))).toMatchObject({
      dedupeKey: files.changes.dedupeKey,
    });
    expect(JSON.parse(await readFile(files.lockPath, 'utf8'))).toEqual(replacement);
  });

  it('does not record a campaign unless Brevo returns draft status', async () => {
    const files = await artifactInputs();
    const harness = brevoDraftHarness({ scheduled: true });

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl: harness.fetchImpl,
    })).rejects.toBeInstanceOf(BrevoCampaignError);

    expect(JSON.parse(await readFile(files.pendingPath, 'utf8'))).toMatchObject({
      dedupeKey: files.changes.dedupeKey,
    });
    await expect(readFile(files.receiptPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a non-classic campaign even when Brevo reports draft status', async () => {
    const files = await artifactInputs();
    const harness = brevoDraftHarness({ wrongType: true });

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl: harness.fetchImpl,
    })).rejects.toBeInstanceOf(BrevoCampaignError);
    expect(JSON.parse(await readFile(files.pendingPath, 'utf8'))).toMatchObject({
      dedupeKey: files.changes.dedupeKey,
    });
  });

  it.each([
    ['name', { wrongName: true }],
    ['expanded sender', { wrongSender: true }],
    ['recipient lists', { wrongRecipients: true }],
  ] as const)('rejects a documented Brevo detail with mismatched %s', async (_field, options) => {
    const files = await artifactInputs();
    const harness = brevoDraftHarness(options);

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl: harness.fetchImpl,
    })).rejects.toBeInstanceOf(BrevoCampaignError);
    await expect(readFile(files.receiptPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.parse(await readFile(files.pendingPath, 'utf8'))).toMatchObject({
      dedupeKey: files.changes.dedupeKey,
    });
  });

  it('checks local artifact hashes before any remote campaign request', async () => {
    const files = await artifactInputs();
    await writeFile(join(files.manifestPath, '..', 'tokenbench-cheatsheet-newsletter.html'), 'tampered');
    const fetchImpl = vi.fn();

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toThrow(/digest|facts/i);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed on a malformed receipt before network access', async () => {
    const files = await artifactInputs();
    await mkdir(files.stateDirectory, { recursive: true });
    await writeFile(files.receiptPath, JSON.stringify({
      schemaVersion: 'tokenbench-brevo-campaign-receipt/v1',
      dedupeKey: 'different-revision',
      campaignId: '42',
      campaignName: 'TokenBench monthly cheatsheet',
      fingerprint: `sha256:${'a'.repeat(64)}`,
    }));
    const fetchImpl = vi.fn();

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toThrow(/receipt|state/i);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('leaves a durable pending outbox after an ambiguous POST and reconciles it without a second POST', async () => {
    const files = await artifactInputs();
    const harness = brevoDraftHarness({ ambiguousPost: true });

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl: harness.fetchImpl,
    })).rejects.toBeInstanceOf(BrevoCampaignError);
    expect(JSON.parse(await readFile(files.pendingPath, 'utf8'))).toMatchObject({
      dedupeKey: files.changes.dedupeKey,
    });

    const receipt = await createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl: harness.fetchImpl,
    });
    expect(receipt.campaignId).toBe(42);
    expect(harness.fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    expect(JSON.parse(await readFile(files.receiptPath, 'utf8'))).toEqual(receipt);
    await expect(readFile(files.pendingPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not POST when the pending outbox cannot be fsynced', async () => {
    const files = await artifactInputs();
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      new Response('{"campaigns":[],"count":0}', { status: 200 })
    ));

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files),
      fetchImpl,
      syncImpl: async (_handle, stage) => {
        if (stage === 'pending-file') throw new Error('simulated fsync failure');
      },
    })).rejects.toThrow(/fsync failure/i);
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('keeps an unresolved pending outbox and refuses a retry POST when no exact draft is found', async () => {
    const files = await artifactInputs();
    const failing = brevoDraftHarness({ ambiguousPost: true });
    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl: failing.fetchImpl,
    })).rejects.toBeInstanceOf(BrevoCampaignError);
    const emptyFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      new Response('{"campaigns":[],"count":0}', { status: 200 })
    ));

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl: emptyFetch,
    })).rejects.toThrow(/pending|reconcil/i);
    expect(emptyFetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('fails closed when draft-list pagination exceeds the reconciliation bound', async () => {
    const files = await artifactInputs();
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      new Response('{"campaigns":[],"count":151}', { status: 200 })
    ));

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toBeInstanceOf(BrevoCampaignError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('serializes concurrent attempts with an exclusive no-follow lock', async () => {
    const files = await artifactInputs();
    const harness = brevoDraftHarness();
    const outcomes = await Promise.allSettled([
      createNewsletterCampaignDraft(files.args, {
        environment: runtimeEnvironment(files), fetchImpl: harness.fetchImpl,
      }),
      createNewsletterCampaignDraft(files.args, {
        environment: runtimeEnvironment(files), fetchImpl: harness.fetchImpl,
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(harness.fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('rejects an ancestor replacement race without writing state through a symlink', async () => {
    const files = await artifactInputs();
    const harness = brevoDraftHarness();
    const displacedDirectory = `${files.stateDirectory}.displaced`;
    const attackerDirectory = join(files.stateRoot, 'attacker-controlled');
    let replaced = false;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await harness.fetchImpl(input, init);
      if (!replaced && init?.method === 'POST') {
        replaced = true;
        await mkdir(attackerDirectory);
        await rename(files.stateDirectory, displacedDirectory);
        await symlink(attackerDirectory, files.stateDirectory);
      }
      return response;
    });

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toThrow(/state|ancestor|path|ownership/i);

    await expect(readFile(join(attackerDirectory, 'receipt.json'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.parse(await readFile(join(displacedDirectory, 'pending.json'), 'utf8')))
      .toMatchObject({ dedupeKey: files.changes.dedupeKey });
  });

  it('rejects absolute, escaping, and symlinked paths before network access', async () => {
    const files = await artifactInputs();
    const fetchImpl = vi.fn();
    await expect(createNewsletterCampaignDraft({ ...files.args, manifest: files.manifestPath }, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toThrow(/path|relative/i);
    await expect(createNewsletterCampaignDraft({ ...files.args, changes: '../outside.json' }, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toThrow(/path|relative/i);
    await expect(createNewsletterCampaignDraft({ ...files.args, deploymentReceipt: 'bad\r\nreceipt.json' }, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toThrow(/path|relative/i);
    await symlink(files.bundleRoot, join(files.artifactRoot, 'linked'));
    await expect(createNewsletterCampaignDraft({ ...files.args, manifest: 'linked/tokenbench-cheatsheet.manifest.json' }, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toThrow(/symlink|path|state/i);
    await symlink(files.bundleRoot, join(files.stateRoot, 'campaigns'));
    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toThrow(/symlink|path|state/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects local artifact bytes beyond the declared bound before network access', async () => {
    const files = await artifactInputs();
    await writeFile(join(files.bundleRoot, 'tokenbench-cheatsheet-newsletter.html'), new Uint8Array(10 * 1024 * 1024 + 1));
    const fetchImpl = vi.fn();

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toThrow(/size|large|bytes/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('applies Brevo destination field limits before any POST', async () => {
    const files = await artifactInputs({ revision: `benchmark_${'r'.repeat(240)}` });
    const { fetchImpl } = brevoDraftHarness();

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toThrow(/preview|Brevo|length|limit/i);
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it.each([
    ['unsupported campaign-name grammar', 'benchmark@fixture', /grammar/i],
    ['campaign control characters', 'benchmark\r\nfixture', /invalid|control|limit/i],
  ] as const)('rejects %s before any POST', async (_case, revision, message) => {
    const files = await artifactInputs({ revision });
    const { fetchImpl } = brevoDraftHarness();

    await expect(createNewsletterCampaignDraft(files.args, {
      environment: runtimeEnvironment(files), fetchImpl,
    })).rejects.toThrow(message);
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });
});

describe('runCreateNewsletterCampaignDraftCli', () => {
  it('prints a safe receipt only after a verified draft', async () => {
    const files = await artifactInputs();
    const stdout = vi.fn();
    const stderr = vi.fn();
    const { fetchImpl } = brevoDraftHarness();

    const exitCode = await runCreateNewsletterCampaignDraftCli([
      '--manifest', files.args.manifest,
      '--changes', files.args.changes,
      '--deployment-receipt', files.args.deploymentReceipt,
      '--artifact-base-url', files.args.artifactBaseUrl,
    ], { environment: runtimeEnvironment(files), fetchImpl }, { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({ campaignId: 42 });
    expect(String(stdout.mock.calls[0]?.[0])).not.toContain('test-server-only-api-key');
    expect(stderr).not.toHaveBeenCalled();
  });
});
