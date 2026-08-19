import { isCanonicalIsoTimestamp, isSha256Digest } from '../benchmarks/contracts';

export type SourceDomain = 'catalog' | 'benchmark' | 'runtime' | 'lifecycle' | 'subscriptions';
export type PipelineLicenseId =
  | 'CDLA-Permissive-2.0' | 'MIT' | 'CC-BY-4.0' | 'OpenRouter-ToS' | 'provider-terms';

export interface SourceArtifactManifest {
  readonly artifactId: string;
  readonly upstreamUrl: string;
  readonly r2Key: string;
  readonly contentType: string;
  readonly byteLength: number;
  readonly contentHash: `sha256:${string}`;
  readonly upstreamBlobId: string | null;
}

export interface SourceManifest {
  readonly schemaVersion: 1;
  readonly domain: SourceDomain;
  readonly sourceId: string;
  readonly attemptId: string;
  readonly upstreamRevision: string;
  readonly releaseId: string | null;
  readonly licenseId: PipelineLicenseId;
  readonly observedAt: string;
  readonly parserVersion: string;
  readonly artifacts: readonly SourceArtifactManifest[];
}

export interface PipelineLicenseRegistryRecord {
  readonly licenseId: PipelineLicenseId;
  readonly canonicalUrl: string;
  readonly licenseText: string;
  readonly licenseTextHash: `sha256:${string}`;
  readonly observedAt: string;
}

const SOURCE_DOMAINS: readonly SourceDomain[] = ['catalog', 'benchmark', 'runtime', 'lifecycle', 'subscriptions'];
const PIPELINE_LICENSE_IDS: readonly PipelineLicenseId[] = [
  'CDLA-Permissive-2.0', 'MIT', 'CC-BY-4.0', 'OpenRouter-ToS', 'provider-terms',
];
const PATH_UNSAFE = /[\\/\u0000-\u001f\u007f]/;

function fail(message: string): never {
  throw new Error(message);
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${name} must be a non-empty string`);
}

function requireNullableString(value: unknown, name: string): asserts value is string | null {
  if (value !== null) requireString(value, name);
}

function requirePathComponent(value: unknown, name: string): asserts value is string {
  requireString(value, name);
  if (value === '.' || value === '..' || PATH_UNSAFE.test(value)) {
    fail(`${name} must be a path-safe identifier`);
  }
}

function requireHttpsUrl(value: unknown, name: string): asserts value is string {
  requireString(value, name);
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname.length === 0) fail(`${name} must be an https URL`);
  } catch {
    fail(`${name} must be an https URL`);
  }
}

function requireIsoTimestamp(value: unknown, name: string): asserts value is string {
  requireString(value, name);
  if (!isCanonicalIsoTimestamp(value)) fail(`${name} must be a finite ISO timestamp`);
}

function requireSha256Digest(value: unknown, name: string): asserts value is `sha256:${string}` {
  if (!isSha256Digest(value)) fail(`${name} must be a sha256: digest`);
}

function requireNonNegativeInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail(`${name} must be a non-negative integer`);
  }
}

function artifactKey(domain: SourceDomain, sourceId: string, attemptId: string, artifactId: string): string {
  return `evidence/${domain}/${sourceId}/${attemptId}/artifacts/${artifactId}`;
}

function validateArtifact(
  value: unknown,
  index: number,
  domain: SourceDomain,
  sourceId: string,
  attemptId: string,
): SourceArtifactManifest {
  const name = `artifacts[${index}]`;
  const artifact = requireRecord(value, name);
  requirePathComponent(artifact.artifactId, `${name}.artifact ID`);
  requireHttpsUrl(artifact.upstreamUrl, `${name}.upstreamUrl`);
  requireString(artifact.r2Key, `${name}.r2Key`);
  if (artifact.r2Key !== artifactKey(domain, sourceId, attemptId, artifact.artifactId)) {
    fail(`${name}.r2Key must be its attempt-owned key`);
  }
  requireString(artifact.contentType, `${name}.contentType`);
  requireNonNegativeInteger(artifact.byteLength, `${name}.byteLength`);
  requireSha256Digest(artifact.contentHash, `${name}.contentHash`);
  requireNullableString(artifact.upstreamBlobId, `${name}.upstreamBlobId`);
  return {
    artifactId: artifact.artifactId,
    upstreamUrl: artifact.upstreamUrl,
    r2Key: artifact.r2Key,
    contentType: artifact.contentType,
    byteLength: artifact.byteLength,
    contentHash: artifact.contentHash,
    upstreamBlobId: artifact.upstreamBlobId as string | null,
  };
}

export function validateSourceManifest(value: unknown): SourceManifest {
  const manifest = requireRecord(value, 'source manifest');
  if (manifest.schemaVersion !== 1) fail('source manifest.schemaVersion must be 1');
  if (!(SOURCE_DOMAINS as readonly string[]).includes(manifest.domain as string)) {
    fail('source manifest.domain is invalid');
  }
  const domain = manifest.domain as SourceDomain;
  const sourceId = manifest.sourceId;
  const attemptId = manifest.attemptId;
  requirePathComponent(sourceId, 'source manifest.sourceId');
  requirePathComponent(attemptId, 'source manifest.attemptId');
  requireString(manifest.upstreamRevision, 'source manifest upstream revision');
  requireNullableString(manifest.releaseId, 'source manifest.releaseId');
  if (!(PIPELINE_LICENSE_IDS as readonly string[]).includes(manifest.licenseId as string)) {
    fail('source manifest.licenseId is invalid');
  }
  const licenseId = manifest.licenseId as PipelineLicenseId;
  requireIsoTimestamp(manifest.observedAt, 'source manifest.observedAt');
  requireString(manifest.parserVersion, 'source manifest.parserVersion');
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    fail('source manifest.artifacts must contain at least one artifact');
  }
  const artifacts = manifest.artifacts.map((artifact, index) => validateArtifact(
    artifact,
    index,
    domain,
    sourceId,
    attemptId,
  ));
  const artifactIds = new Set<string>();
  for (const artifact of artifacts) {
    if (artifactIds.has(artifact.artifactId)) fail('source manifest.artifacts must not repeat artifact IDs');
    artifactIds.add(artifact.artifactId);
  }
  return {
    schemaVersion: 1,
    domain,
    sourceId,
    attemptId,
    upstreamRevision: manifest.upstreamRevision,
    releaseId: manifest.releaseId as string | null,
    licenseId,
    observedAt: manifest.observedAt,
    parserVersion: manifest.parserVersion,
    artifacts,
  };
}

export async function sourceManifestDigest(manifest: SourceManifest): Promise<`sha256:${string}`> {
  const bytes = new TextEncoder().encode(JSON.stringify(validateSourceManifest(manifest)));
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}
