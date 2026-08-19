import {
  assertLiveBenchCommit,
  assertLiveBenchReleaseId,
  assertLiveBenchTimestamp,
  type LiveBenchArtifactId,
  type LiveBenchDiscoveryResult,
  type LiveBenchDiscoveryState,
  type LiveBenchReleaseArtifact,
  type LiveBenchReleaseDescriptor,
  LiveBenchValidationError,
  validateLiveBenchDiscoveryState,
  validateLiveBenchReleaseDescriptor,
} from '../../../src/livebench/contracts';
import { parseRestrictedLiteral } from '../../../src/livebench/restricted-literal';

export type {
  LiveBenchDiscoveryResult,
  LiveBenchDiscoveryState,
  LiveBenchReleaseDescriptor,
} from '../../../src/livebench/contracts';

export interface DiscoverLiveBenchReleaseInput {
  readonly previous: LiveBenchDiscoveryState;
  readonly checkedAt: string;
  readonly forceWeeklyVerification: boolean;
  readonly fetchImpl: typeof fetch;
}

export class LiveBenchDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveBenchDiscoveryError';
  }
}

const GITHUB_API_BASE = 'https://api.github.com/repos/LiveBench/new-livebench';
const RAW_GITHUB_BASE = 'https://raw.githubusercontent.com/LiveBench/new-livebench';
const USER_AGENT = 'TokenBench LiveBench discovery';
const MAX_GITHUB_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_RELEASE_CONTROL_BYTES = 128 * 1024;
const MAX_TREE_ENTRIES = 10_000;
const METHODOLOGY_PATHS = ['src/lib/compute.js', 'src/Table/Averaging.js'] as const;
const RELEASE_CONTROL_PATH = 'src/lib/constants.js';
const SUPPORTED_METHODOLOGY_BLOBS: Readonly<Record<typeof METHODOLOGY_PATHS[number], string>> = {
  'src/lib/compute.js': '7bb8f5e8021ed0a7220d5891fd4cec7dccb9a39f',
  'src/Table/Averaging.js': '8048d175739ea66e8069711ff6e572c684cfc75b',
};
const RELEASE_ARTIFACT_IDS = ['table', 'categories', 'cost'] as const;

type ReleaseArtifactId = typeof RELEASE_ARTIFACT_IDS[number];

interface TreeBlob {
  readonly path: string;
  readonly blobId: string;
}

interface ResolvedRelease {
  readonly releaseId: string;
  readonly artifacts: readonly LiveBenchReleaseArtifact[];
  readonly methodology: readonly TreeBlob[];
}

function isReleaseArtifactId(value: string): value is ReleaseArtifactId {
  return (RELEASE_ARTIFACT_IDS as readonly string[]).includes(value);
}

function readRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LiveBenchDiscoveryError(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

async function readBoundedBytes(
  response: Response,
  context: string,
  maximumBytes = MAX_GITHUB_RESPONSE_BYTES,
): Promise<Uint8Array> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > maximumBytes) {
      throw new LiveBenchDiscoveryError(`${context} exceeds response byte bound`);
    }
  }
  if (!response.body) throw new LiveBenchDiscoveryError(`${context} has no response body`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new LiveBenchDiscoveryError(`${context} exceeds response byte bound`);
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readBoundedJson(response: Response, context: string): Promise<unknown> {
  const bytes = await readBoundedBytes(response, context);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new LiveBenchDiscoveryError(`${context} is not valid UTF-8`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new LiveBenchDiscoveryError(`${context} is not valid JSON`);
  }
}

function sourceHeaders(etag: string | null, conditional: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': USER_AGENT,
  };
  if (conditional && etag) headers['If-None-Match'] = etag;
  return headers;
}

function normalizeReleaseId(value: string): string | null {
  const normalized = value.replaceAll('_', '-');
  try {
    return assertLiveBenchReleaseId(normalized, 'upstream release ID');
  } catch {
    return null;
  }
}

function releaseArtifactPath(path: string): { readonly artifactId: ReleaseArtifactId; readonly releaseId: string } | null {
  const match = /^public\/(table|categories|cost)_(\d{4}[-_]\d{2}[-_]\d{2})\.(csv|json)$/.exec(path);
  if (!match || !isReleaseArtifactId(match[1] as string)) return null;
  const artifactId = match[1] as ReleaseArtifactId;
  const expectedExtension = artifactId === 'categories' ? 'json' : 'csv';
  if (match[3] !== expectedExtension) return null;
  const releaseId = normalizeReleaseId(match[2] as string);
  return releaseId ? { artifactId, releaseId } : null;
}

function requiredTreeBlob(tree: readonly unknown[], path: string): TreeBlob {
  const matches = tree
    .map((value, index) => relevantBlobFromTreeEntry(value, index))
    .filter((blob): blob is TreeBlob => blob?.path === path);
  if (matches.length !== 1) throw new LiveBenchDiscoveryError(`tree must contain exactly one ${path} blob`);
  return matches[0] as TreeBlob;
}

function decodeUtf8(bytes: Uint8Array, context: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new LiveBenchDiscoveryError(`${context} is not valid UTF-8`);
  }
}

function parseCanonicalReleaseId(bytes: Uint8Array): string {
  const source = decodeUtf8(bytes, 'LiveBench release control');
  const declaration = /^[ \t]*export[ \t]+const[ \t]+RELEASES[ \t]*=/mu.exec(source);
  if (declaration?.index === undefined) {
    throw new LiveBenchDiscoveryError('LiveBench release control has no literal RELEASES export');
  }
  const literal = parseRestrictedLiteral(source.slice(declaration.index), {
    exportName: 'RELEASES',
    allowTrailingSource: true,
    maxBytes: MAX_RELEASE_CONTROL_BYTES,
  });
  if (!Array.isArray(literal) || literal.length === 0) {
    throw new LiveBenchDiscoveryError('LiveBench RELEASES must be a non-empty literal array');
  }
  const releases = literal.map((value, index) => {
    try {
      return assertLiveBenchReleaseId(value, `LiveBench RELEASES[${index}]`);
    } catch (error) {
      throw new LiveBenchDiscoveryError(error instanceof Error ? error.message : 'invalid LiveBench release ID');
    }
  });
  if (new Set(releases).size !== releases.length) {
    throw new LiveBenchDiscoveryError('LiveBench RELEASES contains a duplicate release ID');
  }
  return releases.at(-1) as string;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function gitBlobId(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const payload = new Uint8Array(header.byteLength + bytes.byteLength);
  payload.set(header);
  payload.set(bytes, header.byteLength);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-1', payload)));
}

function relevantBlobFromTreeEntry(value: unknown, index: number): TreeBlob | null {
  const entry = readRecord(value, `tree entry ${index}`);
  const path = typeof entry.path === 'string' ? entry.path : null;
  if (!path) return null;
  const isRelevant = path === 'src/Table/modelLinks.js'
    || path === RELEASE_CONTROL_PATH
    || (METHODOLOGY_PATHS as readonly string[]).includes(path)
    || releaseArtifactPath(path) !== null;
  if (!isRelevant) return null;
  if (entry.type !== 'blob') throw new LiveBenchDiscoveryError(`relevant tree path ${path} must be a blob`);
  let blobId: string;
  try {
    blobId = assertLiveBenchCommit(entry.sha, `tree blob SHA for ${path}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid SHA';
    throw new LiveBenchDiscoveryError(message);
  }
  return { path, blobId };
}

function resolveRelease(
  tree: readonly unknown[],
  commit: string,
  canonicalReleaseId: string,
): ResolvedRelease | { readonly releaseId: string } {
  const byRelease = new Map<string, Map<ReleaseArtifactId, TreeBlob>>();
  const methodology = new Map<string, TreeBlob>();
  let releaseControl: TreeBlob | null = null;
  let modelLinks: TreeBlob | null = null;
  for (const [index, value] of tree.entries()) {
    const blob = relevantBlobFromTreeEntry(value, index);
    if (!blob) continue;
    if (blob.path === 'src/Table/modelLinks.js') {
      if (modelLinks) throw new LiveBenchDiscoveryError('tree contains duplicate modelLinks.js blobs');
      modelLinks = blob;
      continue;
    }
    if (blob.path === RELEASE_CONTROL_PATH) {
      if (releaseControl) throw new LiveBenchDiscoveryError(`tree contains duplicate ${RELEASE_CONTROL_PATH} blobs`);
      releaseControl = blob;
      continue;
    }
    if ((METHODOLOGY_PATHS as readonly string[]).includes(blob.path)) {
      if (methodology.has(blob.path)) throw new LiveBenchDiscoveryError(`tree contains duplicate methodology path ${blob.path}`);
      methodology.set(blob.path, blob);
      continue;
    }
    const parsed = releaseArtifactPath(blob.path);
    if (!parsed) continue;
    const artifacts = byRelease.get(parsed.releaseId) ?? new Map<ReleaseArtifactId, TreeBlob>();
    if (artifacts.has(parsed.artifactId)) {
      throw new LiveBenchDiscoveryError(`tree contains duplicate ${parsed.artifactId} artifact for ${parsed.releaseId}`);
    }
    artifacts.set(parsed.artifactId, blob);
    byRelease.set(parsed.releaseId, artifacts);
  }
  const releaseArtifacts = byRelease.get(canonicalReleaseId);
  if (!modelLinks
    || !releaseControl
    || !releaseArtifacts
    || RELEASE_ARTIFACT_IDS.some((artifactId) => !releaseArtifacts.has(artifactId))
    || METHODOLOGY_PATHS.some((path) => !methodology.has(path))) {
    return { releaseId: canonicalReleaseId };
  }
  for (const path of METHODOLOGY_PATHS) {
    const blob = methodology.get(path) as TreeBlob;
    if (blob.blobId !== SUPPORTED_METHODOLOGY_BLOBS[path]) {
      throw new LiveBenchDiscoveryError(
        `LiveBench methodology ${path} changed and requires a reviewed TokenBench projection update`,
      );
    }
  }
  const artifacts: LiveBenchReleaseArtifact[] = RELEASE_ARTIFACT_IDS.map((artifactId) => {
    const artifact = releaseArtifacts.get(artifactId) as TreeBlob;
    return {
      artifactId,
      path: artifact.path,
      blobId: artifact.blobId,
      rawUrl: `${RAW_GITHUB_BASE}/${commit}/${artifact.path}`,
    };
  });
  artifacts.push({
    artifactId: 'model-links',
    path: modelLinks.path,
    blobId: modelLinks.blobId,
    rawUrl: `${RAW_GITHUB_BASE}/${commit}/${modelLinks.path}`,
  });
  return {
    releaseId: canonicalReleaseId,
    artifacts,
    methodology: [
      ...METHODOLOGY_PATHS.map((path) => methodology.get(path) as TreeBlob),
      releaseControl,
    ],
  };
}

function hasDescriptorShape(value: ResolvedRelease | { readonly releaseId: string }): value is ResolvedRelease {
  return 'artifacts' in value;
}

async function sha256(value: string): Promise<`sha256:${string}`> {
  if (!globalThis.crypto?.subtle) throw new LiveBenchDiscoveryError('Web Crypto SHA-256 is unavailable');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

async function releaseFingerprint(release: ResolvedRelease): Promise<`sha256:${string}`> {
  const components = [
    ...release.artifacts.map((artifact) => `artifact:${artifact.artifactId}:${artifact.path}:${artifact.blobId}`),
    ...release.methodology.map((artifact) => `methodology:${artifact.path}:${artifact.blobId}`),
  ].sort();
  return sha256(components.join('\n'));
}

function isoWeek(timestamp: string): string {
  const date = new Date(timestamp);
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - day);
  const isoYear = thursday.getUTCFullYear();
  const start = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((thursday.valueOf() - start.valueOf()) / 86_400_000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function discoveryState(
  previous: LiveBenchDiscoveryState,
  headCommit: string,
  etag: string | null,
  fingerprint: string | null,
  checkedAt: string,
  forceWeeklyVerification: boolean,
): LiveBenchDiscoveryState {
  return validateLiveBenchDiscoveryState({
    etag: etag ?? previous.etag,
    headCommit,
    fingerprint,
    verifiedIsoWeek: forceWeeklyVerification ? isoWeek(checkedAt) : previous.verifiedIsoWeek,
  });
}

/**
 * Resolve one complete current LiveBench release from one Git commit. The
 * request never executes upstream JavaScript and the descriptor URLs are all
 * immutable raw-GitHub URLs pinned to the resolved commit.
 */
export async function discoverLiveBenchRelease(input: DiscoverLiveBenchReleaseInput): Promise<LiveBenchDiscoveryResult> {
  const previous = validateLiveBenchDiscoveryState(input.previous);
  const checkedAt = assertLiveBenchTimestamp(input.checkedAt, 'checkedAt');
  const refResponse = await input.fetchImpl(`${GITHUB_API_BASE}/git/ref/heads/main`, {
    method: 'GET',
    headers: sourceHeaders(previous.etag, !input.forceWeeklyVerification),
  });
  if (refResponse.status === 304 && !input.forceWeeklyVerification) {
    return Object.freeze({ status: 'unchanged' as const, checkedAt, state: previous });
  }
  if (!refResponse.ok) throw new LiveBenchDiscoveryError(`GitHub ref request failed with HTTP ${refResponse.status}`);
  const ref = readRecord(await readBoundedJson(refResponse, 'GitHub ref response'), 'GitHub ref response');
  const object = readRecord(ref.object, 'GitHub ref object');
  let commit: string;
  try {
    commit = assertLiveBenchCommit(object.sha, 'GitHub ref SHA');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid SHA';
    throw new LiveBenchDiscoveryError(message);
  }
  const treeResponse = await input.fetchImpl(`${GITHUB_API_BASE}/git/trees/${commit}?recursive=1`, {
    method: 'GET',
    headers: sourceHeaders(null, false),
  });
  if (!treeResponse.ok) throw new LiveBenchDiscoveryError(`GitHub tree request failed with HTTP ${treeResponse.status}`);
  const treePayload = readRecord(await readBoundedJson(treeResponse, 'GitHub tree response'), 'GitHub tree response');
  if (treePayload.truncated === true) throw new LiveBenchDiscoveryError('GitHub tree response is truncated');
  if (!Array.isArray(treePayload.tree) || treePayload.tree.length > MAX_TREE_ENTRIES) {
    throw new LiveBenchDiscoveryError(`GitHub tree must contain at most ${MAX_TREE_ENTRIES} entries`);
  }
  const releaseControl = requiredTreeBlob(treePayload.tree, RELEASE_CONTROL_PATH);
  const releaseControlResponse = await input.fetchImpl(`${RAW_GITHUB_BASE}/${commit}/${RELEASE_CONTROL_PATH}`, {
    method: 'GET',
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!releaseControlResponse.ok) {
    throw new LiveBenchDiscoveryError(`LiveBench release control request failed with HTTP ${releaseControlResponse.status}`);
  }
  const releaseControlBytes = await readBoundedBytes(
    releaseControlResponse,
    'LiveBench release control',
    MAX_RELEASE_CONTROL_BYTES,
  );
  if (await gitBlobId(releaseControlBytes) !== releaseControl.blobId) {
    throw new LiveBenchDiscoveryError('LiveBench release control bytes do not match the discovered Git blob');
  }
  const canonicalReleaseId = parseCanonicalReleaseId(releaseControlBytes);
  const resolved = resolveRelease(treePayload.tree, commit, canonicalReleaseId);
  const stateEtag = refResponse.headers.get('etag');
  if (!hasDescriptorShape(resolved)) {
    return Object.freeze({
      status: 'incomplete_upstream_release' as const,
      checkedAt,
      releaseId: resolved.releaseId,
      state: discoveryState(previous, commit, stateEtag, previous.fingerprint, checkedAt, input.forceWeeklyVerification),
    });
  }
  const fingerprint = await releaseFingerprint(resolved);
  const state = discoveryState(previous, commit, stateEtag, fingerprint, checkedAt, input.forceWeeklyVerification);
  if (previous.fingerprint === fingerprint) {
    return Object.freeze({ status: 'unchanged' as const, checkedAt, state });
  }
  const release = validateLiveBenchReleaseDescriptor({
    releaseId: resolved.releaseId,
    commit,
    fingerprint,
    artifacts: resolved.artifacts,
  });
  return Object.freeze({ status: 'changed' as const, checkedAt, release, state });
}
