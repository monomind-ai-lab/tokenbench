import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { link, lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
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
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_ARTIFACTS = 8;
const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_ARTIFACT_BYTES = 20 * 1024 * 1024;
const MAX_BREVO_RESPONSE_BYTES = 1024 * 1024;
const BREVO_TIMEOUT_MS = 10_000;
const BREVO_PAGE_SIZE = 50;
const MAX_BREVO_PAGES = 3;
const MAX_LOCK_BYTES = 4_096;
const LOCK_STALE_AFTER_MS = 15 * 60 * 1_000;

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
  readonly fingerprint: string;
}

export interface CampaignPendingDraft {
  readonly dedupeKey: string;
  readonly campaignName: string;
  readonly fingerprint: string;
}

export interface CreateNewsletterCampaignDraftArgs {
  readonly manifest: string;
  readonly changes: string;
  readonly deploymentReceipt: string;
  readonly artifactBaseUrl: string;
}

export interface CreateNewsletterCampaignDraftDependencies {
  readonly environment?: unknown;
  readonly fetchImpl?: BrevoFetch;
  readonly syncImpl?: (
    handle: FileHandle,
    stage: 'pending-file' | 'verified-file' | 'state-directory',
  ) => Promise<void>;
}

export interface SignedDeploymentArtifact extends CampaignArtifactFile {
  readonly url: string;
}

export interface VerifiedDeploymentReceipt {
  readonly schemaVersion: 'tokenbench-cheatsheet-deployment-receipt/v1';
  readonly manifest: CampaignManifest;
  readonly changesEnvelope: Record<string, unknown>;
  readonly artifactBaseUrl: string;
  readonly artifacts: readonly SignedDeploymentArtifact[];
  readonly signature: { readonly algorithm: 'Ed25519'; readonly value: string };
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

function boundedConfigurationString(value: unknown, maximum = 4_096): string | null {
  const normalized = nonEmptyString(value);
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) return null;
  return normalized;
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
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096
    || /[\u0000-\u001f\u007f]/u.test(value)) fail(`${label} is invalid`);
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

function canonicalSignatureJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalSignatureJson).sort(compareUtf8Binary).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort(compareUtf8Binary)
      .map((key) => `${JSON.stringify(key)}:${canonicalSignatureJson(record[key])}`)
      .join(',')}}`;
  }
  fail('deployment receipt contains an unsupported signed value');
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
  if (manifest.files.length === 0 || manifest.files.length > MAX_ARTIFACTS) {
    fail('campaign manifest file count exceeds its limit');
  }
  const files = manifest.files.map(parseManifestFile);
  const totalBytes = files.reduce((total, file) => total + file.bytes, 0);
  if (files.some((file) => file.bytes > MAX_ARTIFACT_BYTES)
    || totalBytes > MAX_TOTAL_ARTIFACT_BYTES
    || files.some((file) => file.name.endsWith('.pdf') && file.bytes > MAX_PDF_BYTES)) {
    fail('campaign manifest artifact size exceeds its limit');
  }
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

function trustedEd25519Key(value: unknown): ReturnType<typeof createPublicKey> {
  const pem = nonEmptyString(value);
  if (!pem || !pem.startsWith('-----BEGIN PUBLIC KEY-----') || !pem.endsWith('-----END PUBLIC KEY-----')) {
    fail('trusted publication verification key is invalid');
  }
  try {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== 'ed25519') fail('trusted publication verification key is invalid');
    return key;
  } catch {
    fail('trusted publication verification key is invalid');
  }
}

function deploymentArtifactUrl(value: unknown, expected: CampaignArtifactFile, baseUrl: URL): SignedDeploymentArtifact {
  const artifact = asRecord(value, 'deployment artifact');
  assertOnlyKeys(artifact, ['name', 'bytes', 'sha256', 'url'], 'deployment artifact');
  const parsed = parseManifestFile({
    name: artifact.name,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
  });
  const url = requiredString(artifact.url, 'deployment artifact URL');
  if (parsed.name !== expected.name || parsed.bytes !== expected.bytes || parsed.sha256 !== expected.sha256
    || url !== new URL(parsed.name, baseUrl).toString()) {
    fail('deployment artifact does not match the signed manifest');
  }
  return { ...parsed, url };
}

/** Verifies a deployment receipt signed by the trusted Task 5 Ed25519 key. */
export function verifySignedDeploymentReceipt(
  value: unknown,
  publicationVerifyKey: unknown,
): VerifiedDeploymentReceipt {
  const receipt = asRecord(value, 'deployment receipt');
  assertOnlyKeys(receipt, [
    'schemaVersion', 'manifest', 'changesEnvelope', 'artifactBaseUrl', 'artifacts', 'signature',
  ], 'deployment receipt');
  if (receipt.schemaVersion !== 'tokenbench-cheatsheet-deployment-receipt/v1') {
    fail('deployment receipt schema is invalid');
  }
  const signatureRecord = asRecord(receipt.signature, 'deployment receipt signature');
  assertOnlyKeys(signatureRecord, ['algorithm', 'value'], 'deployment receipt signature');
  if (signatureRecord.algorithm !== 'Ed25519') fail('deployment receipt signature is invalid');
  const signatureValue = requiredString(signatureRecord.value, 'deployment receipt signature');
  const signature = Buffer.from(signatureValue, 'base64');
  if (signature.byteLength !== 64 || signature.toString('base64') !== signatureValue) {
    fail('deployment receipt signature is invalid');
  }
  const unsigned = {
    schemaVersion: receipt.schemaVersion,
    manifest: receipt.manifest,
    changesEnvelope: receipt.changesEnvelope,
    artifactBaseUrl: receipt.artifactBaseUrl,
    artifacts: receipt.artifacts,
  };
  if (!verify(
    null,
    Buffer.from(canonicalSignatureJson(unsigned)),
    trustedEd25519Key(publicationVerifyKey),
    signature,
  )) {
    fail('deployment receipt signature is invalid');
  }

  const manifest = parseManifest(receipt.manifest);
  const changesEnvelope = asRecord(receipt.changesEnvelope, 'deployment changes envelope');
  assertOnlyKeys(changesEnvelope, ['previous', 'current', 'changes'], 'deployment changes envelope');
  const previous = asRecord(changesEnvelope.previous, 'deployment previous revision');
  const current = asRecord(changesEnvelope.current, 'deployment current revision');
  if (Object.keys(previous).length === 0 || Object.keys(current).length === 0) {
    fail('deployment changes envelope is invalid');
  }
  const changes = parseChanges(changesEnvelope.changes);
  if (manifest.revision !== changes.toRevision
    || manifest.changes.fromRevision !== changes.fromRevision
    || manifest.changes.toRevision !== changes.toRevision
    || manifest.changes.dedupeKey !== changes.dedupeKey) {
    fail('deployment changes do not match the signed manifest');
  }
  const baseValue = requiredString(receipt.artifactBaseUrl, 'deployment artifact base URL');
  if (baseValue.length > 2_048) fail('deployment artifact base URL is invalid');
  let baseUrl: URL;
  try {
    baseUrl = new URL(baseValue);
  } catch {
    fail('deployment artifact base URL is invalid');
  }
  const manifestHash = createHash('sha256')
    .update(canonicalSignatureJson(manifest))
    .digest('hex');
  if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash
    || !baseUrl.pathname.endsWith('/')
    || !baseUrl.pathname.split('/').includes(manifest.revision)
    || !baseUrl.pathname.split('/').includes(`sha256-${manifestHash}`)) {
    fail('deployment artifact base URL is not immutable');
  }
  if (!Array.isArray(receipt.artifacts) || receipt.artifacts.length !== manifest.files.length) {
    fail('deployment artifacts do not match the signed manifest');
  }
  const manifestFiles = manifest.files.slice().sort((left, right) => compareUtf8Binary(left.name, right.name));
  const rawArtifacts = receipt.artifacts.slice().sort((left, right) => {
    const leftName = asRecord(left, 'deployment artifact').name;
    const rightName = asRecord(right, 'deployment artifact').name;
    return compareUtf8Binary(String(leftName), String(rightName));
  });
  const artifacts = rawArtifacts.map((artifact, index) => deploymentArtifactUrl(artifact, manifestFiles[index]!, baseUrl));
  return {
    schemaVersion: 'tokenbench-cheatsheet-deployment-receipt/v1',
    manifest,
    changesEnvelope,
    artifactBaseUrl: baseUrl.toString(),
    artifacts,
    signature: { algorithm: 'Ed25519', value: signatureValue },
  };
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

interface OpenedRoot {
  readonly path: string;
  readonly handle: FileHandle;
  readonly identity: FileIdentity;
}

interface GuardedDirectory {
  readonly root: OpenedRoot;
  readonly path: string;
  readonly ancestors: readonly { readonly path: string; readonly identity: FileIdentity }[];
  readonly label: string;
}

interface GuardedPath {
  readonly directory: GuardedDirectory;
  readonly path: string;
  readonly label: string;
  readonly leafIdentity?: FileIdentity;
}

interface RuntimeRoots {
  readonly artifactRoot: OpenedRoot;
  readonly stateRoot: OpenedRoot;
  readonly publicationVerifyKey: string;
}

function relativePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096
    || isAbsolute(value) || value.includes('://') || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(`${label} must be a safe relative path`);
  }
  const segments = value.split(/[\\/]/u);
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    fail(`${label} must be a safe relative path`);
  }
  return segments.join(sep);
}

async function canonicalDirectory(value: unknown, label: string): Promise<OpenedRoot> {
  if (typeof value !== 'string' || !isAbsolute(value) || value.length > 4_096
    || /[\u0000-\u001f\u007f]/u.test(value)) fail(`${label} is invalid`);
  let handle: FileHandle | undefined;
  try {
    const metadata = await lstat(value);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail(`${label} is invalid`);
    const path = await realpath(value);
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
    const identity = await handle.stat();
    const current = await lstat(path);
    if (!identity.isDirectory() || current.isSymbolicLink() || !sameIdentity(identity, current)
      || await realpath(path) !== path) fail(`${label} is invalid`);
    return { path, handle, identity };
  } catch (error) {
    await handle?.close();
    if (error instanceof Error && error.message === `${label} is invalid`) throw error;
    fail(`${label} is invalid`);
  }
}

async function runtimeRoots(environment: Record<string, unknown>): Promise<RuntimeRoots> {
  const publicationVerifyKey = nonEmptyString(environment.TOKENBENCH_PUBLICATION_VERIFY_KEY);
  if (!publicationVerifyKey) fail('trusted publication verification key is unavailable');
  const artifactRoot = await canonicalDirectory(
    environment.TOKENBENCH_NEWSLETTER_ARTIFACT_ROOT,
    'campaign artifact root',
  );
  try {
    const stateRoot = await canonicalDirectory(
      environment.TOKENBENCH_NEWSLETTER_STATE_ROOT,
      'campaign state root',
    );
    return { artifactRoot, stateRoot, publicationVerifyKey };
  } catch (error) {
    await artifactRoot.handle.close();
    throw error;
  }
}

async function assertOpenedRoot(root: OpenedRoot, label: string): Promise<void> {
  try {
    const [opened, current, canonical] = await Promise.all([
      root.handle.stat(),
      lstat(root.path),
      realpath(root.path),
    ]);
    if (!opened.isDirectory() || !current.isDirectory() || current.isSymbolicLink()
      || !sameIdentity(opened, root.identity) || !sameIdentity(current, root.identity)
      || canonical !== root.path) fail(`${label} root ownership changed`);
  } catch (error) {
    if (error instanceof Error && error.message.includes(label)) throw error;
    fail(`${label} root ownership changed`);
  }
}

async function assertGuardedDirectory(directory: GuardedDirectory): Promise<void> {
  await assertOpenedRoot(directory.root, directory.label);
  for (const ancestor of directory.ancestors) {
    try {
      const [metadata, canonical] = await Promise.all([lstat(ancestor.path), realpath(ancestor.path)]);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()
        || !sameIdentity(metadata, ancestor.identity) || canonical !== ancestor.path) {
        fail(`${directory.label} ancestor ownership changed`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes(directory.label)) throw error;
      fail(`${directory.label} ancestor ownership changed`);
    }
  }
}

async function rootedPath(
  root: OpenedRoot,
  input: unknown,
  label: string,
  allowMissingFinal = false,
): Promise<GuardedPath> {
  await assertOpenedRoot(root, label);
  const normalized = relativePath(input, label);
  const target = resolve(root.path, normalized);
  const relation = relative(root.path, target);
  if (relation.startsWith(`..${sep}`) || relation === '..' || isAbsolute(relation)) {
    fail(`${label} must be within its configured root`);
  }
  const segments = relation.split(sep);
  let current = root.path;
  const ancestors: Array<{ path: string; identity: FileIdentity }> = [];
  let leafIdentity: FileIdentity | undefined;
  for (let index = 0; index < segments.length; index += 1) {
    current = resolve(current, segments[index]!);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) fail(`${label} cannot traverse a symlink`);
      if (index < segments.length - 1) {
        if (!metadata.isDirectory() || await realpath(current) !== current) fail(`${label} path is invalid`);
        ancestors.push({ path: current, identity: metadata });
      } else {
        leafIdentity = metadata;
      }
    } catch (error) {
      if (allowMissingFinal && index === segments.length - 1
        && (error as NodeJS.ErrnoException).code === 'ENOENT') break;
      if (error instanceof Error && (error.message.includes(label) || error.message.includes('symlink'))) throw error;
      fail(`${label} path is invalid`);
    }
  }
  const directory: GuardedDirectory = {
    root,
    path: dirname(target),
    ancestors,
    label,
  };
  await assertGuardedDirectory(directory);
  return { directory, path: target, label, leafIdentity };
}

async function readBoundedFile(path: GuardedPath, maximum: number, label: string): Promise<Uint8Array> {
  let handle: FileHandle | undefined;
  try {
    await assertGuardedDirectory(path.directory);
    handle = await open(path.path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const metadata = await handle.stat();
    const current = await lstat(path.path);
    if (!metadata.isFile() || metadata.size > maximum || current.isSymbolicLink()
      || !sameIdentity(metadata, current)
      || (path.leafIdentity && !sameIdentity(metadata, path.leafIdentity))) {
      fail(`${label} size or ownership exceeds its limit`);
    }
    await assertGuardedDirectory(path.directory);
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const chunk = new Uint8Array(Math.min(64 * 1024, maximum + 1 - total));
      const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maximum) fail(`${label} size exceeds its limit`);
      chunks.push(chunk.slice(0, bytesRead));
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const after = await lstat(path.path);
    if (after.isSymbolicLink() || !sameIdentity(metadata, after)) fail(`${label} ownership changed`);
    await assertGuardedDirectory(path.directory);
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.message.includes(label)) throw error;
    fail(`${label} could not be read`);
  } finally {
    await handle?.close();
  }
}

async function readLocalJson(path: GuardedPath, label: string): Promise<unknown> {
  const bytes = await readBoundedFile(path, MAX_JSON_BYTES, label);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    fail(`${label} must contain valid JSON`);
  }
}

async function loadArtifactBundle(
  artifactRoot: OpenedRoot,
  manifestRelativePath: string,
  manifest: CampaignManifest,
): Promise<CampaignArtifactBundle> {
  const directory = dirname(relativePath(manifestRelativePath, 'campaign manifest'));
  const artifacts: Array<{ name: string; bytes: Uint8Array }> = [];
  let actualTotal = 0;
  for (const file of manifest.files) {
    const relativeArtifact = directory === '.' ? file.name : `${directory}/${file.name}`;
    const path = await rootedPath(artifactRoot, relativeArtifact, 'campaign artifact');
    const typeMaximum = file.name.endsWith('.pdf') ? MAX_PDF_BYTES : MAX_ARTIFACT_BYTES;
    const maximum = Math.min(file.bytes, typeMaximum);
    const bytes = await readBoundedFile(path, maximum, 'campaign artifact');
    actualTotal += bytes.byteLength;
    if (actualTotal > MAX_TOTAL_ARTIFACT_BYTES) fail('campaign artifact total size exceeds its limit');
    artifacts.push({ name: file.name, bytes });
  }
  return { manifest, artifacts };
}

function parseReceipt(value: unknown): CampaignDraftReceipt {
  const receipt = asRecord(value, 'campaign receipt');
  assertOnlyKeys(receipt, ['schemaVersion', 'dedupeKey', 'campaignId', 'campaignName', 'fingerprint'], 'campaign receipt');
  if (receipt.schemaVersion !== 'tokenbench-brevo-campaign-receipt/v1') fail('campaign receipt is invalid');
  const campaignId = receipt.campaignId;
  if (!Number.isSafeInteger(campaignId) || (campaignId as number) <= 0) fail('campaign receipt is invalid');
  return {
    schemaVersion: 'tokenbench-brevo-campaign-receipt/v1',
    dedupeKey: requiredString(receipt.dedupeKey, 'campaign receipt dedupeKey'),
    campaignId: campaignId as number,
    campaignName: requiredString(receipt.campaignName, 'campaign receipt campaignName'),
    fingerprint: requiredDigest(receipt.fingerprint, 'campaign receipt fingerprint'),
  };
}

function parsePending(value: unknown): CampaignPendingDraft {
  const pending = asRecord(value, 'campaign pending record');
  assertOnlyKeys(pending, ['dedupeKey', 'campaignName', 'fingerprint'], 'campaign pending record');
  return {
    dedupeKey: requiredString(pending.dedupeKey, 'campaign pending dedupeKey'),
    campaignName: requiredString(pending.campaignName, 'campaign pending campaignName'),
    fingerprint: requiredDigest(pending.fingerprint, 'campaign pending fingerprint'),
  };
}

async function readOptionalState(path: GuardedPath, label: string): Promise<unknown | null> {
  await assertGuardedDirectory(path.directory);
  let metadata: Awaited<ReturnType<typeof lstat>>;
  try {
    metadata = await lstat(path.path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`${label} is invalid`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await assertGuardedDirectory(path.directory);
      return null;
    }
    throw error;
  }
  return readLocalJson({ ...path, leafIdentity: metadata }, label);
}

async function readReceipt(path: GuardedPath): Promise<CampaignDraftReceipt | null> {
  const value = await readOptionalState(path, 'campaign receipt');
  return value === null ? null : parseReceipt(value);
}

async function readPending(path: GuardedPath): Promise<CampaignPendingDraft | null> {
  const value = await readOptionalState(path, 'campaign pending record');
  return value === null ? null : parsePending(value);
}

async function writeStateFile(
  path: GuardedPath,
  value: CampaignPendingDraft | CampaignDraftReceipt,
  stage: 'pending-file' | 'verified-file',
  syncImpl: NonNullable<CreateNewsletterCampaignDraftDependencies['syncImpl']>,
): Promise<void> {
  const temporary = resolve(path.directory.path, `.${basename(path.path)}.${randomUUID()}.tmp`);
  let handle: FileHandle | undefined;
  let temporaryIdentity: FileIdentity | undefined;
  try {
    await assertGuardedDirectory(path.directory);
    handle = await open(
      temporary,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW,
      0o600,
    );
    temporaryIdentity = await handle.stat();
    const openedTemporary = await lstat(temporary);
    if (openedTemporary.isSymbolicLink() || !sameIdentity(temporaryIdentity, openedTemporary)) {
      fail('campaign state temporary ownership changed');
    }
    await assertGuardedDirectory(path.directory);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await syncImpl(handle, stage);
    const syncedIdentity = await handle.stat();
    const currentTemporary = await lstat(temporary);
    if (!sameIdentity(temporaryIdentity, syncedIdentity) || !sameIdentity(temporaryIdentity, currentTemporary)) {
      fail('campaign state temporary ownership changed');
    }
    await handle.close();
    handle = undefined;
    await assertGuardedDirectory(path.directory);
    try {
      const existing = await lstat(path.path);
      if (existing) fail('campaign state destination already exists');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await rename(temporary, path.path);
    const installed = await lstat(path.path);
    if (installed.isSymbolicLink() || !temporaryIdentity || !sameIdentity(temporaryIdentity, installed)) {
      fail('campaign state destination ownership changed');
    }
    await assertGuardedDirectory(path.directory);
    const directory = await open(
      path.directory.path,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    );
    try {
      const openedDirectory = await directory.stat();
      const expectedDirectory = path.directory.ancestors.at(-1)?.identity ?? path.directory.root.identity;
      if (!sameIdentity(openedDirectory, expectedDirectory)) fail('campaign state ancestor ownership changed');
      await syncImpl(directory, 'state-directory');
    } finally {
      await directory.close();
    }
    await assertGuardedDirectory(path.directory);
  } finally {
    await handle?.close();
    try {
      await assertGuardedDirectory(path.directory);
      await unlink(temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT'
        && !(error instanceof Error && error.message.includes('ownership changed'))) throw error;
    }
  }
}

async function removeStateFile(
  path: GuardedPath,
  syncImpl: NonNullable<CreateNewsletterCampaignDraftDependencies['syncImpl']>,
): Promise<void> {
  await assertGuardedDirectory(path.directory);
  let identity: FileIdentity;
  try {
    const existing = await lstat(path.path);
    if (!existing.isFile() || existing.isSymbolicLink()) fail('campaign state file is invalid');
    identity = existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const removed = `${path.path}.remove.${randomUUID()}`;
  await assertGuardedDirectory(path.directory);
  await rename(path.path, removed);
  const claimed = await lstat(removed);
  if (!sameIdentity(identity, claimed)) {
    await restoreClaimedLock(removed, path.path);
    fail('campaign state file ownership changed');
  }
  await assertGuardedDirectory(path.directory);
  await unlink(removed);
  const directory = await open(
    path.directory.path,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
  );
  try {
    const openedDirectory = await directory.stat();
    const expectedDirectory = path.directory.ancestors.at(-1)?.identity ?? path.directory.root.identity;
    if (!sameIdentity(openedDirectory, expectedDirectory)) fail('campaign state ancestor ownership changed');
    await syncImpl(directory, 'state-directory');
  } finally {
    await directory.close();
  }
  await assertGuardedDirectory(path.directory);
}

interface CampaignStatePaths {
  readonly directory: GuardedDirectory;
  readonly pending: GuardedPath;
  readonly receipt: GuardedPath;
  readonly lock: GuardedPath;
}

async function ensureStateDirectory(
  root: OpenedRoot,
  segments: readonly string[],
): Promise<GuardedDirectory> {
  const ancestors: Array<{ path: string; identity: FileIdentity }> = [];
  let path = root.path;
  for (const segment of segments) {
    const parent: GuardedDirectory = {
      root,
      path,
      ancestors: [...ancestors],
      label: 'campaign state',
    };
    await assertGuardedDirectory(parent);
    path = resolve(path, segment);
    try {
      await mkdir(path, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        fail('campaign state directory could not be created');
      }
    }
    const metadata = await lstat(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || await realpath(path) !== path) {
      fail('campaign state directory is invalid');
    }
    ancestors.push({ path, identity: metadata });
    await assertGuardedDirectory({ root, path, ancestors: [...ancestors], label: 'campaign state' });
  }
  return { root, path, ancestors, label: 'campaign state' };
}

async function campaignStatePaths(stateRoot: OpenedRoot, dedupeKey: string): Promise<CampaignStatePaths> {
  const key = sha256(new TextEncoder().encode(dedupeKey)).slice('sha256:'.length);
  const directory = await ensureStateDirectory(stateRoot, ['campaigns', key]);
  const child = (name: string): GuardedPath => ({
    directory,
    path: resolve(directory.path, name),
    label: 'campaign state',
  });
  return {
    directory,
    pending: child('pending.json'),
    receipt: child('receipt.json'),
    lock: child('draft.lock'),
  };
}

interface CampaignLockRecord {
  readonly schemaVersion: 'tokenbench-brevo-campaign-lock/v1';
  readonly pid: number;
  readonly startedAt: string;
  readonly fingerprint: string;
  readonly token: string;
}

interface CampaignLockLease {
  readonly assertOwned: () => Promise<void>;
  readonly release: () => Promise<void>;
}

interface FileIdentity {
  readonly dev: number | bigint;
  readonly ino: number | bigint;
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function parseCampaignLock(value: unknown, expectedFingerprint: string): CampaignLockRecord {
  const record = asRecord(value, 'campaign receipt lock');
  assertOnlyKeys(
    record,
    ['schemaVersion', 'pid', 'startedAt', 'fingerprint', 'token'],
    'campaign receipt lock',
  );
  if (record.schemaVersion !== 'tokenbench-brevo-campaign-lock/v1'
    || !Number.isSafeInteger(record.pid) || (record.pid as number) <= 0
    || record.fingerprint !== expectedFingerprint
    || typeof record.startedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(record.startedAt)
    || Number.isNaN(Date.parse(record.startedAt))
    || typeof record.token !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(record.token)) {
    fail('campaign receipt is locked');
  }
  return record as unknown as CampaignLockRecord;
}

async function inspectCampaignLock(
  lockPath: GuardedPath,
  expectedFingerprint: string,
): Promise<{ readonly identity: FileIdentity; readonly record: CampaignLockRecord }> {
  let handle: FileHandle | undefined;
  try {
    await assertGuardedDirectory(lockPath.directory);
    handle = await open(lockPath.path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_LOCK_BYTES) {
      fail('campaign receipt is locked');
    }
    const bytes = await handle.readFile('utf8');
    let value: unknown;
    try {
      value = JSON.parse(bytes);
    } catch {
      fail('campaign receipt is locked');
    }
    const current = await lstat(lockPath.path);
    if (!current.isFile() || current.isSymbolicLink() || !sameIdentity(metadata, current)) {
      fail('campaign receipt is locked');
    }
    await assertGuardedDirectory(lockPath.directory);
    return { identity: metadata, record: parseCampaignLock(value, expectedFingerprint) };
  } catch (error) {
    if (error instanceof Error && error.message === 'campaign receipt is locked') throw error;
    fail('campaign receipt is locked');
  } finally {
    await handle?.close();
  }
}

function processOwnerIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    return true;
  }
}

async function restoreClaimedLock(claimPath: string, lockPath: string): Promise<void> {
  try {
    await link(claimPath, lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      fail('campaign receipt lock ownership could not be restored');
    }
  }
  await unlink(claimPath);
}

async function claimLockPath(
  lockPath: GuardedPath,
  expectedIdentity: FileIdentity,
  purpose: 'recover' | 'release',
): Promise<string> {
  await assertGuardedDirectory(lockPath.directory);
  const claimPath = `${lockPath.path}.${purpose}.${randomUUID()}`;
  try {
    await rename(lockPath.path, claimPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail('campaign receipt is locked');
    fail('campaign receipt lock ownership could not be verified');
  }
  const claimed = await lstat(claimPath);
  if (!sameIdentity(claimed, expectedIdentity)) {
    await restoreClaimedLock(claimPath, lockPath.path);
    fail('campaign receipt is locked because lock ownership changed');
  }
  await assertGuardedDirectory(lockPath.directory);
  return claimPath;
}

async function assertCampaignLockOwnership(
  lockPath: GuardedPath,
  identity: FileIdentity,
  expected: CampaignLockRecord,
): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    await assertGuardedDirectory(lockPath.directory);
    handle = await open(lockPath.path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size <= 0 || opened.size > MAX_LOCK_BYTES
      || !sameIdentity(opened, identity)) fail('campaign receipt lock ownership changed');
    const parsed = parseCampaignLock(JSON.parse(await handle.readFile('utf8')), expected.fingerprint);
    const current = await lstat(lockPath.path);
    if (current.isSymbolicLink() || !sameIdentity(current, identity)
      || canonicalSignatureJson(parsed) !== canonicalSignatureJson(expected)) {
      fail('campaign receipt lock ownership changed');
    }
    await assertGuardedDirectory(lockPath.directory);
  } catch (error) {
    if (error instanceof Error && error.message.includes('lock ownership')) throw error;
    fail('campaign receipt lock ownership changed');
  } finally {
    await handle?.close();
  }
}

async function acquireReceiptLock(lockPath: GuardedPath, dedupeKey: string): Promise<CampaignLockLease> {
  const directory = lockPath.directory.path;
  try {
    await assertGuardedDirectory(lockPath.directory);
    const parent = await lstat(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink()) fail('campaign receipt path is invalid');
  } catch (error) {
    if (error instanceof Error && error.message === 'campaign receipt path is invalid') throw error;
    fail('campaign receipt path is invalid');
  }
  const fingerprint = sha256(new TextEncoder().encode(dedupeKey));
  let lock: FileHandle | undefined;
  let recovered = false;
  while (!lock) {
    try {
      lock = await open(
        lockPath.path,
        fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW,
        0o600,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        fail('campaign receipt lock could not be acquired');
      }
      if (recovered) fail('campaign receipt is locked');
      const existing = await inspectCampaignLock(lockPath, fingerprint);
      const startedAt = Date.parse(existing.record.startedAt);
      const age = Date.now() - startedAt;
      if (age < LOCK_STALE_AFTER_MS || processOwnerIsAlive(existing.record.pid)) {
        fail('campaign receipt is locked');
      }
      const claimPath = await claimLockPath(lockPath, existing.identity, 'recover');
      await unlink(claimPath);
      recovered = true;
    }
  }
  const record: CampaignLockRecord = {
    schemaVersion: 'tokenbench-brevo-campaign-lock/v1',
    pid: process.pid,
    startedAt: new Date().toISOString(),
    fingerprint,
    token: randomUUID(),
  };
  const identity = await lock.stat();
  try {
    await lock.writeFile(`${JSON.stringify(record)}\n`, 'utf8');
    await lock.sync();
    const current = await lstat(lockPath.path);
    if (!sameIdentity(identity, current)) fail('campaign receipt lock ownership changed');
    await assertGuardedDirectory(lockPath.directory);
    const parent = await open(
      directory,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    );
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
    await assertGuardedDirectory(lockPath.directory);
  } catch {
    await lock.close();
    try {
      const claimPath = await claimLockPath(lockPath, identity, 'release');
      await unlink(claimPath);
    } catch {
      // The failed lock is intentionally left for human review when unlinking is unsafe.
    }
    fail('campaign receipt lock could not be acquired');
  }
  return {
    assertOwned: () => assertCampaignLockOwnership(lockPath, identity, record),
    release: async () => {
      try {
        await lock.close();
      } finally {
        try {
          const claimPath = await claimLockPath(lockPath, identity, 'release');
          await unlink(claimPath);
        } catch (error) {
          if (error instanceof Error && error.message === 'campaign receipt is locked') return;
          throw error;
        }
      }
    },
  };
}

/** Reads campaign credentials from process-only configuration, never browser variables. */
export function parseBrevoCampaignConfig(value: unknown): BrevoCampaignConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const environment = value as Record<string, unknown>;
  const apiKey = boundedConfigurationString(environment.BREVO_CAMPAIGN_API_KEY);
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
  const name = boundedConfigurationString(rawSenderName, 256);
  const email = boundedConfigurationString(rawSenderEmail, 320);
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

interface PreparedCampaign {
  readonly draft: CampaignDraft;
  readonly fingerprint: string;
  readonly payload: Record<string, unknown>;
}

function brevoHeaderText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum
    || /[\u0000-\u001f\u007f]/u.test(value)) fail(`${label} exceeds the Brevo destination limit`);
  return value;
}

function validatePreparedCampaign(config: BrevoCampaignConfig, prepared: PreparedCampaign): void {
  if (!isValidCampaignConfig(config)) fail('campaign configuration is invalid');
  const payload = prepared.payload;
  assertOnlyKeys(payload, [
    'name', 'sender', 'subject', 'previewText', 'htmlContent', 'recipients', 'attachmentUrl',
  ], 'Brevo campaign payload');
  const name = brevoHeaderText(payload.name, 'campaign name', 255);
  if (!/^[\p{L}\p{N} .:_-]+$/u.test(name)) fail('campaign name grammar is invalid');
  brevoHeaderText(payload.subject, 'campaign subject', 255);
  brevoHeaderText(payload.previewText, 'campaign preview text', 255);
  if (typeof payload.htmlContent !== 'string'
    || new TextEncoder().encode(payload.htmlContent).byteLength <= 10
    || new TextEncoder().encode(payload.htmlContent).byteLength >= 1024 * 1024
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\r]/u.test(payload.htmlContent)) {
    fail('campaign HTML exceeds the Brevo destination limit');
  }
  const attachmentUrl = brevoHeaderText(payload.attachmentUrl, 'campaign attachment URL', 2_048);
  let parsedAttachment: URL;
  try {
    parsedAttachment = new URL(attachmentUrl);
  } catch {
    fail('campaign attachment URL is invalid');
  }
  if (parsedAttachment.protocol !== 'https:' || parsedAttachment.username || parsedAttachment.password
    || parsedAttachment.search || parsedAttachment.hash
    || !parsedAttachment.pathname.endsWith('/tokenbench-cheatsheet.pdf')) {
    fail('campaign attachment URL is invalid');
  }
  const recipients = asRecord(payload.recipients, 'Brevo campaign recipients');
  assertOnlyKeys(recipients, ['listIds'], 'Brevo campaign recipients');
  if (!Array.isArray(recipients.listIds) || recipients.listIds.length !== 1
    || recipients.listIds[0] !== config.monthlyCheatsheetListId) {
    fail('Brevo campaign recipients are invalid');
  }
}

function prepareCampaign(config: BrevoCampaignConfig, draft: CampaignDraft): PreparedCampaign {
  const baseName = draft.name.replace(/ fp-[a-f0-9]{24}$/u, '');
  const fingerprint = sha256(new TextEncoder().encode(canonicalSignatureJson({
    dedupeKey: draft.dedupeKey,
    audience: draft.audience,
    baseName,
    sender: config.sender,
    listId: config.monthlyCheatsheetListId,
    subject: draft.subject,
    previewText: draft.previewText,
    htmlContent: draft.htmlContent,
    attachmentUrl: draft.attachmentUrl,
  })));
  const preparedDraft = { ...draft, name: `${baseName} fp-${fingerprint.slice(7, 31)}` };
  return {
    draft: preparedDraft,
    fingerprint,
    payload: {
      name: preparedDraft.name,
      sender: config.sender,
      subject: preparedDraft.subject,
      previewText: preparedDraft.previewText,
      htmlContent: preparedDraft.htmlContent,
      recipients: { listIds: [config.monthlyCheatsheetListId] },
      attachmentUrl: preparedDraft.attachmentUrl,
    },
  };
}

async function boundedResponseJson(response: Response): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BREVO_RESPONSE_BYTES) {
        await reader.cancel();
        throw new BrevoCampaignError(response.status);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new BrevoCampaignError(response.status);
  }
}

function verifiedRemoteCampaign(
  value: unknown,
  id: number,
  prepared: PreparedCampaign,
  status: number,
): void {
  const campaign = asRecord(value, 'Brevo campaign');
  const expectedSender = asRecord(prepared.payload.sender, 'campaign sender');
  const actualSender = asRecord(campaign.sender, 'Brevo campaign sender');
  const recipients = asRecord(campaign.recipients, 'Brevo campaign recipients');
  const expectedRecipients = asRecord(prepared.payload.recipients, 'campaign recipients');
  const expectedListIds = expectedRecipients.listIds;
  const senderMatches = Object.hasOwn(expectedSender, 'id')
    ? actualSender.id === expectedSender.id
    : actualSender.name === expectedSender.name && actualSender.email === expectedSender.email;
  if (campaign.id !== id
    || campaign.name !== prepared.draft.name
    || campaign.status !== 'draft'
    || campaign.type !== 'classic'
    || campaign.testSent !== false
    || (campaign.scheduledAt !== undefined && campaign.scheduledAt !== '')
    || campaign.subject !== prepared.draft.subject
    || campaign.previewText !== prepared.draft.previewText
    || campaign.htmlContent !== prepared.draft.htmlContent
    || campaign.attachmentUrl !== prepared.draft.attachmentUrl
    || !senderMatches
    || canonicalSignatureJson(recipients.lists) !== canonicalSignatureJson(expectedListIds)
    || canonicalSignatureJson(recipients.exclusionLists) !== canonicalSignatureJson([])) {
    throw new BrevoCampaignError(status);
  }
}

function requestInit(config: BrevoCampaignConfig, init: RequestInit): RequestInit {
  return {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
    headers: {
      'api-key': config.apiKey,
      ...(init.headers ?? {}),
    },
  };
}

async function verifyCampaignById(
  config: BrevoCampaignConfig,
  id: number,
  prepared: PreparedCampaign,
  fetchImpl: BrevoFetch,
): Promise<CampaignDraftReceipt> {
  const response = await fetchImpl(
    `${BREVO_CAMPAIGNS_URL}/${id}`,
    requestInit(config, { method: 'GET' }),
  );
  if (response.status !== 200) throw new BrevoCampaignError(response.status);
  verifiedRemoteCampaign(await boundedResponseJson(response), id, prepared, response.status);
  return {
    schemaVersion: 'tokenbench-brevo-campaign-receipt/v1',
    dedupeKey: prepared.draft.dedupeKey,
    campaignId: id,
    campaignName: prepared.draft.name,
    fingerprint: prepared.fingerprint,
  };
}

function isValidCampaignConfig(value: unknown): value is BrevoCampaignConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  if (!boundedConfigurationString(config.apiKey) || !Number.isSafeInteger(config.monthlyCheatsheetListId)
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
    && boundedConfigurationString(sender.name, 256) !== null
    && typeof sender.email === 'string'
    && boundedConfigurationString(sender.email, 320) !== null
    && validEmail(sender.email);
}

/** Creates one email campaign, then proves the returned lifecycle is draft. */
async function createCampaignDraft(
  config: BrevoCampaignConfig,
  draft: CampaignDraft,
  fetchImpl: BrevoFetch,
  assertMutationAllowed: () => Promise<void>,
): Promise<CampaignDraftReceipt> {
  if (!isValidCampaignConfig(config)) fail('campaign configuration is invalid');
  if (draft.audience !== 'monthly-cheatsheet') fail('campaign audience is invalid');
  const prepared = prepareCampaign(config, draft);
  await assertMutationAllowed();
  validatePreparedCampaign(config, prepared);
  try {
    const created = await fetchImpl(BREVO_CAMPAIGNS_URL, {
      ...requestInit(config, { method: 'POST' }),
      headers: { 'content-type': 'application/json', 'api-key': config.apiKey },
      body: JSON.stringify(prepared.payload),
    });
    if (created.status !== 201) throw new BrevoCampaignError(created.status);
    const id = campaignId(await boundedResponseJson(created), created.status);
    return await verifyCampaignById(config, id, prepared, fetchImpl);
  } catch (error) {
    if (error instanceof BrevoCampaignError) throw error;
    throw new BrevoCampaignError(null);
  }
}

async function reconcileCampaignDraft(
  config: BrevoCampaignConfig,
  prepared: PreparedCampaign,
  fetchImpl: BrevoFetch,
): Promise<CampaignDraftReceipt | null> {
  const exactIds: number[] = [];
  try {
    for (let page = 0; page < MAX_BREVO_PAGES; page += 1) {
      const offset = page * BREVO_PAGE_SIZE;
      const url = `${BREVO_CAMPAIGNS_URL}?type=classic&status=draft&limit=${BREVO_PAGE_SIZE}&offset=${offset}`;
      const response = await fetchImpl(url, requestInit(config, { method: 'GET' }));
      if (response.status !== 200) throw new BrevoCampaignError(response.status);
      const body = asRecord(await boundedResponseJson(response), 'Brevo draft list');
      if (!Array.isArray(body.campaigns) || !Number.isSafeInteger(body.count) || (body.count as number) < 0
        || (body.count as number) > MAX_BREVO_PAGES * BREVO_PAGE_SIZE) {
        throw new BrevoCampaignError(response.status);
      }
      for (const candidate of body.campaigns) {
        const item = asRecord(candidate, 'Brevo draft list item');
        if (item.name === prepared.draft.name && item.status === 'draft' && item.type === 'classic'
          && Number.isSafeInteger(item.id) && (item.id as number) > 0) {
          exactIds.push(item.id as number);
        }
      }
      if (body.campaigns.length < BREVO_PAGE_SIZE || offset + BREVO_PAGE_SIZE >= (body.count as number)) break;
    }
    if (exactIds.length > 1) fail('campaign draft reconciliation is ambiguous');
    return exactIds.length === 1
      ? await verifyCampaignById(config, exactIds[0]!, prepared, fetchImpl)
      : null;
  } catch (error) {
    if (error instanceof BrevoCampaignError || (error instanceof Error && error.message.includes('reconciliation'))) {
      throw error;
    }
    throw new BrevoCampaignError(null);
  }
}

/**
 * Verifies signed deployment artifacts and performs a crash-safe, reconciled
 * Brevo draft creation. It never calls send, schedule, or template endpoints.
 */
export async function createNewsletterCampaignDraft(
  args: CreateNewsletterCampaignDraftArgs,
  dependencies: CreateNewsletterCampaignDraftDependencies = {},
): Promise<CampaignDraftReceipt> {
  const environment = dependencies.environment ?? process.env;
  const config = parseBrevoCampaignConfig(environment);
  if (!config) fail('campaign configuration is unavailable');
  if (!args || typeof args !== 'object' || !environment || typeof environment !== 'object'
    || Array.isArray(environment)) fail('campaign arguments are invalid');
  assertOnlyKeys(args as unknown as Record<string, unknown>, [
    'manifest', 'changes', 'deploymentReceipt', 'artifactBaseUrl',
  ], 'campaign arguments');
  const roots = await runtimeRoots(environment as Record<string, unknown>);
  try {
  const [manifestPath, changesPath, deploymentReceiptPath] = await Promise.all([
    rootedPath(roots.artifactRoot, args.manifest, 'campaign manifest'),
    rootedPath(roots.artifactRoot, args.changes, 'campaign changes'),
    rootedPath(roots.artifactRoot, args.deploymentReceipt, 'deployment receipt'),
  ]);
  const [rawManifest, rawChangesEnvelope, rawDeploymentReceipt] = await Promise.all([
    readLocalJson(manifestPath, 'campaign manifest'),
    readLocalJson(changesPath, 'campaign changes'),
    readLocalJson(deploymentReceiptPath, 'deployment receipt'),
  ]);
  const deployment = verifySignedDeploymentReceipt(rawDeploymentReceipt, roots.publicationVerifyKey);
  const manifest = parseManifest(rawManifest);
  const changesEnvelope = asRecord(rawChangesEnvelope, 'campaign changes envelope');
  assertOnlyKeys(changesEnvelope, ['previous', 'current', 'changes'], 'campaign changes envelope');
  const changes = parseChanges(changesEnvelope.changes);
  if (canonicalSignatureJson(manifest) !== canonicalSignatureJson(deployment.manifest)
    || canonicalSignatureJson(changesEnvelope) !== canonicalSignatureJson(deployment.changesEnvelope)
    || args.artifactBaseUrl !== deployment.artifactBaseUrl) {
    fail('local campaign inputs do not match the signed deployment receipt');
  }
  const bundle = await loadArtifactBundle(roots.artifactRoot, args.manifest, manifest);
  const pdf = deployment.artifacts.find((artifact) => artifact.name === 'tokenbench-cheatsheet.pdf')?.url;
  const csv = deployment.artifacts.find((artifact) => artifact.name === 'tokenbench-cheatsheet.csv')?.url;
  if (!pdf || !csv) fail('signed deployment receipt is missing campaign artifact URLs');
  const draft = campaignFromArtifacts(bundle, changes, { pdf, csv });
  const prepared = prepareCampaign(config, draft);
  validatePreparedCampaign(config, prepared);
  const state = await campaignStatePaths(roots.stateRoot, draft.dedupeKey);
  const lock = await acquireReceiptLock(state.lock, draft.dedupeKey);
  const fetchImpl = dependencies.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const syncImpl = dependencies.syncImpl ?? ((handle: FileHandle) => handle.sync());
  try {
    await lock.assertOwned();
    const existingReceipt = await readReceipt(state.receipt);
    if (existingReceipt) fail('campaign revision is already drafted');
    const reconciled = await reconcileCampaignDraft(config, prepared, fetchImpl);
    if (reconciled) {
      await lock.assertOwned();
      await writeStateFile(state.receipt, reconciled, 'verified-file', syncImpl);
      await lock.assertOwned();
      await removeStateFile(state.pending, syncImpl);
      return reconciled;
    }
    const pending = await readPending(state.pending);
    if (pending) {
      if (pending.campaignName !== prepared.draft.name || pending.fingerprint !== prepared.fingerprint) {
        fail('campaign pending record does not match the requested draft');
      }
      fail('campaign draft remains pending reconciliation');
    }
    await lock.assertOwned();
    await writeStateFile(state.pending, {
      dedupeKey: draft.dedupeKey,
      campaignName: prepared.draft.name,
      fingerprint: prepared.fingerprint,
    }, 'pending-file', syncImpl);
    const receipt = await createCampaignDraft(config, draft, fetchImpl, lock.assertOwned);
    await lock.assertOwned();
    await writeStateFile(state.receipt, receipt, 'verified-file', syncImpl);
    await lock.assertOwned();
    await removeStateFile(state.pending, syncImpl);
    return receipt;
  } finally {
    await lock.release();
  }
  } finally {
    await Promise.all([roots.artifactRoot.handle.close(), roots.stateRoot.handle.close()]);
  }
}

/** Parses the intentionally small CLI surface; no network options are accepted. */
export function parseCreateNewsletterCampaignDraftArgs(
  argv: readonly string[],
): CreateNewsletterCampaignDraftArgs {
  const values: Partial<Record<'manifest' | 'changes' | 'deploymentReceipt' | 'artifactBaseUrl', string>> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const key = argument === '--manifest'
      ? 'manifest'
      : argument === '--changes'
        ? 'changes'
        : argument === '--deployment-receipt'
          ? 'deploymentReceipt'
        : argument === '--artifact-base-url'
          ? 'artifactBaseUrl'
          : null;
    if (!key) fail(`unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--') || values[key] !== undefined) {
      fail(`${argument} must be supplied once with a value`);
    }
    values[key] = value;
    index += 1;
  }
  if (!values.manifest || !values.changes || !values.deploymentReceipt || !values.artifactBaseUrl) {
    fail('required options are --manifest, --changes, --deployment-receipt, and --artifact-base-url');
  }
  return {
    manifest: values.manifest,
    changes: values.changes,
    deploymentReceipt: values.deploymentReceipt,
    artifactBaseUrl: values.artifactBaseUrl,
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
