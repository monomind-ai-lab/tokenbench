import {
  validateSourceManifest,
  type SourceDomain,
  type SourceManifest,
} from '../../src/pipeline/source-contracts';

export type CandidateEvidenceBody = string | ArrayBuffer | ArrayBufferView;

export interface CandidateEvidenceBucket {
  get(key: string): Promise<unknown | null>;
  put(key: string, value: CandidateEvidenceBody, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
}

export interface CandidateEvidenceArtifact {
  readonly artifactId: string;
  readonly bytes: Uint8Array;
}

const SOURCE_DOMAINS: readonly SourceDomain[] = ['catalog', 'benchmark', 'runtime', 'lifecycle', 'subscriptions'];
const PATH_UNSAFE = /[\\/\u0000-\u001f\u007f]/;

function fail(message: string): never {
  throw new Error(message);
}

function requirePathComponent(value: string, name: string): void {
  if (value.trim().length === 0 || value === '.' || value === '..' || PATH_UNSAFE.test(value)) {
    fail(`${name} must be a path-safe identifier`);
  }
}

function requireDomain(value: SourceDomain): void {
  if (!(SOURCE_DOMAINS as readonly string[]).includes(value)) fail('domain is invalid');
}

async function sha256Digest(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

export function sourceArtifactKey(
  domain: SourceDomain,
  sourceId: string,
  attemptId: string,
  artifactId: string,
): string {
  requireDomain(domain);
  requirePathComponent(sourceId, 'sourceId');
  requirePathComponent(attemptId, 'attemptId');
  requirePathComponent(artifactId, 'artifactId');
  return `evidence/${domain}/${sourceId}/${attemptId}/artifacts/${artifactId}`;
}

export function sourceManifestKey(domain: SourceDomain, sourceId: string, attemptId: string): string {
  requireDomain(domain);
  requirePathComponent(sourceId, 'sourceId');
  requirePathComponent(attemptId, 'attemptId');
  return `evidence/${domain}/${sourceId}/${attemptId}/manifest.json`;
}

export async function writeCandidateEvidence(
  bucket: CandidateEvidenceBucket,
  manifest: SourceManifest,
  artifacts: readonly CandidateEvidenceArtifact[],
): Promise<void> {
  const validatedManifest = validateSourceManifest(manifest);
  if (!Array.isArray(artifacts) || artifacts.length !== validatedManifest.artifacts.length) {
    fail('candidate evidence must provide the complete artifact set');
  }

  const manifestArtifacts = new Map(validatedManifest.artifacts.map((artifact) => [artifact.artifactId, artifact]));
  const bytesByArtifactId = new Map<string, Uint8Array>();
  for (const candidate of artifacts) {
    if (!candidate || typeof candidate.artifactId !== 'string' || !(candidate.bytes instanceof Uint8Array)) {
      fail('candidate evidence artifacts must provide an artifact ID and bytes');
    }
    if (bytesByArtifactId.has(candidate.artifactId)) fail('candidate evidence must not repeat artifact IDs');
    const artifact = manifestArtifacts.get(candidate.artifactId);
    if (!artifact) fail(`candidate evidence artifact ${candidate.artifactId} is not declared by the manifest`);
    const bytes = candidate.bytes.slice();
    if (bytes.byteLength !== artifact.byteLength || await sha256Digest(bytes) !== artifact.contentHash) {
      fail(`candidate evidence artifact ${candidate.artifactId} bytes do not match its manifest`);
    }
    bytesByArtifactId.set(candidate.artifactId, bytes);
  }
  if (bytesByArtifactId.size !== manifestArtifacts.size) {
    fail('candidate evidence must provide the complete artifact set');
  }

  const manifestKey = sourceManifestKey(
    validatedManifest.domain,
    validatedManifest.sourceId,
    validatedManifest.attemptId,
  );
  if (await bucket.get(manifestKey)) fail(`candidate evidence manifest already exists at ${manifestKey}`);

  for (const artifact of validatedManifest.artifacts) {
    const bytes = bytesByArtifactId.get(artifact.artifactId);
    if (!bytes) fail(`candidate evidence artifact ${artifact.artifactId} is missing`);
    await bucket.put(artifact.r2Key, bytes, { httpMetadata: { contentType: artifact.contentType } });
  }
  const manifestBytes = new TextEncoder().encode(JSON.stringify(validatedManifest));
  await bucket.put(manifestKey, manifestBytes, { httpMetadata: { contentType: 'application/json' } });
}
