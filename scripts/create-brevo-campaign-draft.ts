import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  campaignFromArtifacts,
  type CampaignArtifactBundle,
  type CampaignArtifactFile,
  type CampaignDraft,
  type CampaignManifest,
} from '../src/newsletter/campaign';
import { compareUtf8Binary } from '../src/benchmarks/contracts';
import type { NewModelFact, PriceDropFact, RevisionChanges } from '../src/newsletter/revision-diff';

const BREVO_CAMPAIGNS_URL = 'https://api.brevo.com/v3/emailCampaigns';

export interface BrevoCampaignConfig {
  readonly apiKey: string;
  readonly sender: { readonly id: number } | { readonly name: string; readonly email: string };
  readonly monthlyCheatsheetListId: number;
}

export type BrevoFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface CampaignDraftReceipt {
  readonly schemaVersion: 'tokenbench-brevo-campaign-receipt/v1';
  readonly dedupeKey: string;
  readonly campaignId: number;
  readonly campaignName: string;
}

export interface CampaignReceiptBook {
  readonly schemaVersion: 'tokenbench-brevo-campaign-receipts/v1';
  readonly drafts: readonly CampaignDraftReceipt[];
}

export interface CreateNewsletterCampaignDraftArgs {
  readonly manifest: string;
  readonly changes: string;
  readonly artifactBaseUrl: string;
  readonly receiptFile: string;
}

export interface CreateNewsletterCampaignDraftDependencies {
  readonly environment?: unknown;
  readonly fetchImpl?: BrevoFetch;
}

export interface CampaignDraftCliStreams {
  readonly stdout: (value: string) => unknown;
  readonly stderr: (value: string) => unknown;
}

/** Upstream failures deliberately carry status only, never a response body or secret. */
export class BrevoCampaignError extends Error {
  readonly status: number | null;

  constructor(status: number | null) {
    super(status === null
      ? 'Brevo campaign request failed'
      : `Brevo campaign request failed with status ${status}`);
    this.name = 'BrevoCampaignError';
    this.status = status;
  }
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function positiveId(value: unknown): number | null {
  const normalized = nonEmptyString(value);
  if (!normalized || !/^\d+$/u.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function assertOnlyKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) fail(`${label} is invalid`);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} is invalid`);
  return value;
}

function requiredDigest(value: unknown, label: string): string {
  const digest = requiredString(value, label);
  if (!/^sha256:[a-f0-9]{64}$/u.test(digest)) fail(`${label} is invalid`);
  return digest;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} is invalid`);
  return value as number;
}

function nonNegativeRate(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(`${label} is invalid`);
  return value;
}

function safeArtifactName(value: string): boolean {
  return basename(value) === value && /^[a-z0-9][a-z0-9.-]*$/u.test(value);
}

function canonicalTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function parseManifestFile(value: unknown): CampaignArtifactFile {
  const file = asRecord(value, 'campaign manifest file');
  assertOnlyKeys(file, ['name', 'bytes', 'sha256'], 'campaign manifest file');
  const name = requiredString(file.name, 'campaign manifest file.name');
  if (!safeArtifactName(name)) fail('campaign manifest file.name is invalid');
  return {
    name,
    bytes: nonNegativeInteger(file.bytes, 'campaign manifest file.bytes'),
    sha256: requiredDigest(file.sha256, 'campaign manifest file.sha256'),
  };
}

function parseManifest(value: unknown): CampaignManifest {
  const manifest = asRecord(value, 'campaign manifest');
  assertOnlyKeys(manifest, ['schemaVersion', 'revision', 'catalogRevision', 'generatedAt', 'changes', 'files'], 'campaign manifest');
  if (manifest.schemaVersion !== 'tokenbench-cheatsheet/v1') fail('campaign manifest schema is invalid');
  const changes = asRecord(manifest.changes, 'campaign manifest changes');
  assertOnlyKeys(changes, ['fromRevision', 'toRevision', 'dedupeKey'], 'campaign manifest changes');
  if (!Array.isArray(manifest.files)) fail('campaign manifest files are invalid');
  const files = manifest.files.map(parseManifestFile);
  if (new Set(files.map((file) => file.name)).size !== files.length) fail('campaign manifest files are invalid');
  const generatedAt = requiredString(manifest.generatedAt, 'campaign manifest generatedAt');
  if (!canonicalTimestamp(generatedAt)) fail('campaign manifest generatedAt is invalid');
  return {
    schemaVersion: 'tokenbench-cheatsheet/v1',
    revision: requiredString(manifest.revision, 'campaign manifest revision'),
    catalogRevision: requiredString(manifest.catalogRevision, 'campaign manifest catalogRevision'),
    generatedAt,
    changes: {
      fromRevision: requiredString(changes.fromRevision, 'campaign manifest changes.fromRevision'),
      toRevision: requiredString(changes.toRevision, 'campaign manifest changes.toRevision'),
      dedupeKey: requiredString(changes.dedupeKey, 'campaign manifest changes.dedupeKey'),
    },
    files,
  };
}

function parseNewModelFact(value: unknown): NewModelFact {
  const fact = asRecord(value, 'campaign new model fact');
  assertOnlyKeys(fact, ['id', 'modelKey'], 'campaign new model fact');
  return {
    id: requiredString(fact.id, 'campaign new model fact.id'),
    modelKey: requiredString(fact.modelKey, 'campaign new model fact.modelKey'),
  };
}

function parsePriceDropFact(value: unknown): PriceDropFact {
  const fact = asRecord(value, 'campaign price drop fact');
  assertOnlyKeys(fact, [
    'id', 'modelKey', 'providerId', 'routeId',
    'previousInputUsdPerMillion', 'currentInputUsdPerMillion',
    'previousOutputUsdPerMillion', 'currentOutputUsdPerMillion',
  ], 'campaign price drop fact');
  return {
    id: requiredString(fact.id, 'campaign price drop fact.id'),
    modelKey: requiredString(fact.modelKey, 'campaign price drop fact.modelKey'),
    providerId: requiredString(fact.providerId, 'campaign price drop fact.providerId'),
    routeId: requiredString(fact.routeId, 'campaign price drop fact.routeId'),
    previousInputUsdPerMillion: nonNegativeRate(fact.previousInputUsdPerMillion, 'campaign price drop fact.previousInputUsdPerMillion'),
    currentInputUsdPerMillion: nonNegativeRate(fact.currentInputUsdPerMillion, 'campaign price drop fact.currentInputUsdPerMillion'),
    previousOutputUsdPerMillion: nonNegativeRate(fact.previousOutputUsdPerMillion, 'campaign price drop fact.previousOutputUsdPerMillion'),
    currentOutputUsdPerMillion: nonNegativeRate(fact.currentOutputUsdPerMillion, 'campaign price drop fact.currentOutputUsdPerMillion'),
  };
}

function compareText(left: string, right: string): number {
  return compareUtf8Binary(left, right);
}

function canonicalFactId(
  toRevision: string,
  kind: 'new-model' | 'price-drop',
  modelKey: string,
  providerId: string,
  routeId: string,
): string {
  return JSON.stringify([toRevision, kind, modelKey, providerId, routeId]);
}

function assertCanonicalChanges(changes: RevisionChanges): void {
  const ids = new Set<string>();
  for (const fact of changes.newModels) {
    if (fact.id !== canonicalFactId(changes.toRevision, 'new-model', fact.modelKey, '', '') || ids.has(fact.id)) {
      fail('campaign changes are not canonical');
    }
    ids.add(fact.id);
  }
  for (const fact of changes.priceDrops) {
    if (fact.id !== canonicalFactId(changes.toRevision, 'price-drop', fact.modelKey, fact.providerId, fact.routeId)
      || ids.has(fact.id)) {
      fail('campaign changes are not canonical');
    }
    ids.add(fact.id);
  }
  const dedupeKey = JSON.stringify([
    changes.fromRevision,
    changes.toRevision,
    ...[...ids].sort(compareText),
  ]);
  if (changes.dedupeKey !== dedupeKey) fail('campaign changes are not canonical');
}

function parseChanges(value: unknown): RevisionChanges {
  const input = asRecord(value, 'campaign changes');
  const changes = Object.hasOwn(input, 'changes') ? asRecord(input.changes, 'campaign changes') : input;
  assertOnlyKeys(changes, ['fromRevision', 'toRevision', 'dedupeKey', 'newModels', 'priceDrops'], 'campaign changes');
  if (!Array.isArray(changes.newModels) || !Array.isArray(changes.priceDrops)) fail('campaign changes are invalid');
  const parsed: RevisionChanges = {
    fromRevision: requiredString(changes.fromRevision, 'campaign changes.fromRevision'),
    toRevision: requiredString(changes.toRevision, 'campaign changes.toRevision'),
    dedupeKey: requiredString(changes.dedupeKey, 'campaign changes.dedupeKey'),
    newModels: changes.newModels.map(parseNewModelFact),
    priceDrops: changes.priceDrops.map(parsePriceDropFact),
  };
  assertCanonicalChanges(parsed);
  return parsed;
}

async function readLocalJson(path: string, label: string): Promise<unknown> {
  if (typeof path !== 'string' || path.trim().length === 0 || path.includes('://')) fail(`${label} is invalid`);
  let bytes: Uint8Array;
  try {
    const metadata = await lstat(resolve(path));
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`${label} is invalid`);
    bytes = await readFile(resolve(path));
  } catch (error) {
    if (error instanceof Error && error.message === `${label} is invalid`) throw error;
    fail(`${label} could not be read`);
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    fail(`${label} must contain valid JSON`);
  }
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function loadArtifactBundle(manifestPath: string, manifest: CampaignManifest): Promise<CampaignArtifactBundle> {
  const directory = dirname(resolve(manifestPath));
  const artifacts = await Promise.all(manifest.files.map(async (file) => {
    const path = resolve(directory, file.name);
    if (dirname(path) !== directory) fail('campaign artifact path is invalid');
    try {
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.isSymbolicLink()) fail('campaign artifact path is invalid');
      const bytes = await readFile(path);
      return { name: file.name, bytes };
    } catch (error) {
      if (error instanceof Error && error.message === 'campaign artifact path is invalid') throw error;
      fail('campaign artifact could not be read');
    }
  }));
  return { manifest, artifacts };
}

function parseReceipt(value: unknown): CampaignDraftReceipt {
  const receipt = asRecord(value, 'campaign receipt');
  assertOnlyKeys(receipt, ['schemaVersion', 'dedupeKey', 'campaignId', 'campaignName'], 'campaign receipt');
  if (receipt.schemaVersion !== 'tokenbench-brevo-campaign-receipt/v1') fail('campaign receipt is invalid');
  const campaignId = receipt.campaignId;
  if (!Number.isSafeInteger(campaignId) || (campaignId as number) <= 0) fail('campaign receipt is invalid');
  return {
    schemaVersion: 'tokenbench-brevo-campaign-receipt/v1',
    dedupeKey: requiredString(receipt.dedupeKey, 'campaign receipt dedupeKey'),
    campaignId: campaignId as number,
    campaignName: requiredString(receipt.campaignName, 'campaign receipt campaignName'),
  };
}

async function readReceiptBook(receiptFile: string): Promise<CampaignReceiptBook> {
  let raw: string;
  try {
    const metadata = await lstat(receiptFile);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail('campaign receipt is invalid');
    raw = await readFile(receiptFile, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { schemaVersion: 'tokenbench-brevo-campaign-receipts/v1', drafts: [] };
    }
    if (error instanceof Error && error.message === 'campaign receipt is invalid') throw error;
    fail('campaign receipt could not be read');
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    fail('campaign receipt must contain valid JSON');
  }
  const book = asRecord(value, 'campaign receipt');
  assertOnlyKeys(book, ['schemaVersion', 'drafts'], 'campaign receipt');
  if (book.schemaVersion !== 'tokenbench-brevo-campaign-receipts/v1' || !Array.isArray(book.drafts)) {
    fail('campaign receipt is invalid');
  }
  const drafts = book.drafts.map(parseReceipt);
  if (new Set(drafts.map((receipt) => receipt.dedupeKey)).size !== drafts.length) fail('campaign receipt is invalid');
  return { schemaVersion: 'tokenbench-brevo-campaign-receipts/v1', drafts };
}

async function writeReceiptBook(receiptFile: string, book: CampaignReceiptBook): Promise<void> {
  const temporary = resolve(dirname(receiptFile), `.${basename(receiptFile)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(book, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, receiptFile);
  } finally {
    try {
      await unlink(temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

async function acquireReceiptLock(receiptFile: string, dedupeKey: string): Promise<() => Promise<void>> {
  const directory = dirname(receiptFile);
  try {
    const parent = await lstat(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink()) fail('campaign receipt path is invalid');
  } catch (error) {
    if (error instanceof Error && error.message === 'campaign receipt path is invalid') throw error;
    fail('campaign receipt path is invalid');
  }
  const lockPath = `${receiptFile}.lock`;
  let lock: Awaited<ReturnType<typeof open>>;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('campaign receipt is locked');
    fail('campaign receipt lock could not be acquired');
  }
  const identity = await lock.stat();
  try {
    await lock.writeFile(sha256(new TextEncoder().encode(dedupeKey)), 'utf8');
  } catch {
    await lock.close();
    try {
      await unlink(lockPath);
    } catch {
      // The failed lock is intentionally left for human review when unlinking is unsafe.
    }
    fail('campaign receipt lock could not be acquired');
  }
  return async () => {
    try {
      await lock.close();
    } finally {
      try {
        const current = await lstat(lockPath);
        if (current.dev === identity.dev && current.ino === identity.ino) await unlink(lockPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  };
}

/** Reads campaign credentials from process-only configuration, never browser variables. */
export function parseBrevoCampaignConfig(value: unknown): BrevoCampaignConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const environment = value as Record<string, unknown>;
  const apiKey = nonEmptyString(environment.BREVO_CAMPAIGN_API_KEY);
  const listId = positiveId(environment.BREVO_CAMPAIGN_MONTHLY_CHEATSHEET_LIST_ID);
  if (!apiKey || !listId) return null;

  const rawSenderId = environment.BREVO_CAMPAIGN_SENDER_ID;
  const rawSenderName = environment.BREVO_CAMPAIGN_SENDER_NAME;
  const rawSenderEmail = environment.BREVO_CAMPAIGN_SENDER_EMAIL;
  const hasSenderId = rawSenderId !== undefined;
  const hasSenderAddress = rawSenderName !== undefined || rawSenderEmail !== undefined;
  if (hasSenderId === hasSenderAddress) return null;
  if (hasSenderId) {
    const senderId = positiveId(rawSenderId);
    return senderId ? { apiKey, sender: { id: senderId }, monthlyCheatsheetListId: listId } : null;
  }
  const name = nonEmptyString(rawSenderName);
  const email = nonEmptyString(rawSenderEmail);
  if (!name || !email || !validEmail(email)) return null;
  return { apiKey, sender: { name, email }, monthlyCheatsheetListId: listId };
}

function fail(message: string): never {
  throw new Error(message);
}

function campaignId(value: unknown, status: number): number {
  if (!value || typeof value !== 'object' || !Number.isSafeInteger((value as { id?: unknown }).id)
    || (value as { id: number }).id <= 0) {
    throw new BrevoCampaignError(status);
  }
  return (value as { id: number }).id;
}

function isValidCampaignConfig(value: unknown): value is BrevoCampaignConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  if (!nonEmptyString(config.apiKey) || !Number.isSafeInteger(config.monthlyCheatsheetListId)
    || (config.monthlyCheatsheetListId as number) <= 0) {
    return false;
  }
  if (!config.sender || typeof config.sender !== 'object' || Array.isArray(config.sender)) return false;
  const sender = config.sender as Record<string, unknown>;
  const senderKeys = Object.keys(sender).sort(compareText);
  if (senderKeys.length === 1 && senderKeys[0] === 'id') {
    return Number.isSafeInteger(sender.id) && (sender.id as number) > 0;
  }
  return senderKeys.length === 2 && senderKeys[0] === 'email' && senderKeys[1] === 'name'
    && nonEmptyString(sender.name) !== null
    && typeof sender.email === 'string'
    && validEmail(sender.email);
}

/** Creates one email campaign, then proves the returned lifecycle is draft. */
export async function createCampaignDraft(
  config: BrevoCampaignConfig,
  draft: CampaignDraft,
  fetchImpl: BrevoFetch = (input, init) => globalThis.fetch(input, init),
): Promise<CampaignDraftReceipt> {
  if (!isValidCampaignConfig(config)) fail('campaign configuration is invalid');
  if (draft.audience !== 'monthly-cheatsheet') fail('campaign audience is invalid');
  try {
    const headers = { 'content-type': 'application/json', 'api-key': config.apiKey };
    const created = await fetchImpl(BREVO_CAMPAIGNS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: draft.name,
        sender: config.sender,
        subject: draft.subject,
        previewText: draft.previewText,
        htmlContent: draft.htmlContent,
        recipients: { listIds: [config.monthlyCheatsheetListId] },
        attachmentUrl: draft.attachmentUrl,
      }),
    });
    if (created.status !== 201) throw new BrevoCampaignError(created.status);
    const id = campaignId(await created.json(), created.status);
    const verified = await fetchImpl(`${BREVO_CAMPAIGNS_URL}/${id}`, {
      method: 'GET',
      headers: { 'api-key': config.apiKey },
    });
    if (verified.status !== 200) throw new BrevoCampaignError(verified.status);
    const campaign = await verified.json() as { id?: unknown; status?: unknown };
    if (campaign.id !== id || campaign.status !== 'draft') throw new BrevoCampaignError(verified.status);
    return {
      schemaVersion: 'tokenbench-brevo-campaign-receipt/v1',
      dedupeKey: draft.dedupeKey,
      campaignId: id,
      campaignName: draft.name,
    };
  } catch (error) {
    if (error instanceof BrevoCampaignError) throw error;
    throw new BrevoCampaignError(null);
  }
}

/** Refuses a matching durable receipt before any remote campaign mutation. */
export async function createCampaignDraftFromReceipt(
  existingReceipt: CampaignDraftReceipt | null | undefined,
  config: BrevoCampaignConfig,
  draft: CampaignDraft,
  fetchImpl: BrevoFetch = (input, init) => globalThis.fetch(input, init),
): Promise<CampaignDraftReceipt> {
  if (existingReceipt?.dedupeKey === draft.dedupeKey) {
    fail('campaign revision is already drafted');
  }
  return createCampaignDraft(config, draft, fetchImpl);
}

function localReceiptPath(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('://')) {
    fail('campaign receipt path is invalid');
  }
  const path = resolve(value);
  if (basename(path) === '.' || basename(path) === '..') fail('campaign receipt path is invalid');
  return path;
}

/**
 * Performs the local-only artifact and receipt workflow around one remote
 * draft creation. The receipt lock spans the only two Brevo requests.
 */
export async function createNewsletterCampaignDraft(
  args: CreateNewsletterCampaignDraftArgs,
  dependencies: CreateNewsletterCampaignDraftDependencies = {},
): Promise<CampaignDraftReceipt> {
  const config = parseBrevoCampaignConfig(dependencies.environment ?? process.env);
  if (!config) fail('campaign configuration is unavailable');
  if (!args || typeof args !== 'object') fail('campaign arguments are invalid');
  const receiptFile = localReceiptPath(args.receiptFile);
  const [rawManifest, rawChanges] = await Promise.all([
    readLocalJson(args.manifest, 'campaign manifest'),
    readLocalJson(args.changes, 'campaign changes'),
  ]);
  const manifest = parseManifest(rawManifest);
  const changes = parseChanges(rawChanges);
  const bundle = await loadArtifactBundle(args.manifest, manifest);
  const draft = campaignFromArtifacts(bundle, changes, args.artifactBaseUrl);
  const releaseLock = await acquireReceiptLock(receiptFile, draft.dedupeKey);
  try {
    const receiptBook = await readReceiptBook(receiptFile);
    if (receiptBook.drafts.some((receipt) => receipt.dedupeKey === draft.dedupeKey)) {
      fail('campaign revision is already drafted');
    }
    const receipt = await createCampaignDraft(
      config,
      draft,
      dependencies.fetchImpl ?? ((input, init) => globalThis.fetch(input, init)),
    );
    await writeReceiptBook(receiptFile, {
      schemaVersion: 'tokenbench-brevo-campaign-receipts/v1',
      drafts: [...receiptBook.drafts, receipt],
    });
    return receipt;
  } finally {
    await releaseLock();
  }
}

/** Parses the intentionally small CLI surface; no network options are accepted. */
export function parseCreateNewsletterCampaignDraftArgs(
  argv: readonly string[],
): CreateNewsletterCampaignDraftArgs {
  const values: Partial<Record<'manifest' | 'changes' | 'artifactBaseUrl' | 'receiptFile', string>> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const key = argument === '--manifest'
      ? 'manifest'
      : argument === '--changes'
        ? 'changes'
        : argument === '--artifact-base-url'
          ? 'artifactBaseUrl'
          : argument === '--receipt-file'
            ? 'receiptFile'
            : null;
    if (!key) fail(`unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--') || values[key] !== undefined) {
      fail(`${argument} must be supplied once with a value`);
    }
    values[key] = value;
    index += 1;
  }
  if (!values.manifest || !values.changes || !values.artifactBaseUrl || !values.receiptFile) {
    fail('required options are --manifest, --changes, --artifact-base-url, and --receipt-file');
  }
  return {
    manifest: values.manifest,
    changes: values.changes,
    artifactBaseUrl: values.artifactBaseUrl,
    receiptFile: values.receiptFile,
  };
}

/** Runs the command without surfacing configuration, artifact, or upstream content. */
export async function runCreateNewsletterCampaignDraftCli(
  argv: readonly string[],
  dependencies: CreateNewsletterCampaignDraftDependencies = {},
  streams: CampaignDraftCliStreams = {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  },
): Promise<0 | 1> {
  try {
    const receipt = await createNewsletterCampaignDraft(
      parseCreateNewsletterCampaignDraftArgs(argv),
      dependencies,
    );
    streams.stdout(`${JSON.stringify(receipt)}\n`);
    return 0;
  } catch {
    streams.stderr('Unable to create newsletter campaign draft\n');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void runCreateNewsletterCampaignDraftCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
