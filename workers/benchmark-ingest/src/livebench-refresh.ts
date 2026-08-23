import {
  parseLiveBenchRelease,
  validateLiveBenchLicenseEvidence,
  type LiveBenchDiscoveryState,
  type LiveBenchLicenseEvidence,
  type LiveBenchReleaseArtifact,
  type LiveBenchReleaseBundle,
  type LiveBenchReleaseDescriptor,
} from '../../../src/livebench';
import {
  sourceArtifactKey,
  sourceManifestKey,
  writeCandidateEvidence,
  type CandidateEvidenceArtifact,
  type CandidateEvidenceBucket,
} from '../../_shared/candidate-evidence';
import {
  sourceManifestDigest,
  type SourceArtifactManifest,
  type SourceManifest,
} from '../../../src/pipeline/source-contracts';
import {
  acquireLiveBenchPublicationLease,
  LiveBenchPublicationLeaseError,
  publishLiveBenchRelease,
  readActiveLiveBenchRelease,
  stageLiveBenchRelease,
  validateLiveBenchRelease,
  type LiveBenchD1Database,
  type LiveBenchLicenseVerification,
  type LiveBenchPublicationLease,
} from '../../../functions/_shared/livebench-db';
import { discoverLiveBenchRelease } from './livebench-discovery';

export interface VerifiedLiveBenchLicenseConfiguration extends LiveBenchLicenseEvidence {
  readonly verifiedBy: string;
  readonly attributionText: string;
}

/**
 * LiveBench's own license, verified against the upstream project rather than
 * assumed. An earlier revision recorded CDLA-Permissive-2.0 and pointed its
 * verification URL at cdla.dev -- at the license text itself, not at any
 * LiveBench adoption of it. LiveBench never adopted CDLA: the benchmark repo
 * carries Apache-2.0 at its root, the paper and datasheet both state Apache 2.0,
 * and the published HuggingFace dataset is tagged Apache-2.0. The dashboard repo
 * we read release artifacts from omits its own LICENSE file, but its CSVs are
 * derived from that Apache-2.0 project.
 *
 * Apache-2.0 is a permission plus two obligations we owe upstream: retain the
 * attribution, and state that changes were made. TokenBench re-aggregates and
 * re-prices LiveBench evidence, so the second obligation applies to us and is
 * carried in `attributionText`.
 */
export const ACCEPTED_LIVEBENCH_LICENSE: VerifiedLiveBenchLicenseConfiguration = {
  licenseId: 'Apache-2.0',
  verificationUrl: 'https://github.com/LiveBench/LiveBench/blob/main/LICENSE',
  verifiedAt: '2026-08-24T00:00:00.000Z',
  verifiedBy: 'TokenBench project owner',
  attributionText: 'LiveBench · Apache-2.0 · re-aggregated and re-priced by TokenBench',
};

export interface LiveBenchRefreshEnvironment {
  readonly CATALOG_DB: LiveBenchD1Database;
  readonly SOURCE_SNAPSHOTS: CandidateEvidenceBucket;
}

export type LiveBenchRefreshResult =
  | { readonly status: 'unchanged'; readonly state: LiveBenchDiscoveryState; readonly revision: string | null }
  | { readonly status: 'incomplete_upstream_release'; readonly state: LiveBenchDiscoveryState; readonly releaseId: string }
  | { readonly status: 'superseded'; readonly state: LiveBenchDiscoveryState; readonly revision: string | null }
  | { readonly status: 'published'; readonly state: LiveBenchDiscoveryState; readonly revision: string };

export interface RetrievedLiveBenchCandidate {
  readonly bundle: LiveBenchReleaseBundle;
  readonly descriptor: LiveBenchReleaseDescriptor;
  readonly manifest: SourceManifest;
  readonly manifestHash: `sha256:${string}`;
  readonly artifacts: readonly CandidateEvidenceArtifact[];
  readonly sourceRevision: string;
  readonly attemptId: string;
}

const CONTENT_TYPES: Readonly<Record<LiveBenchReleaseArtifact['artifactId'], string>> = {
  table: 'text/csv; charset=utf-8',
  categories: 'application/json; charset=utf-8',
  cost: 'text/csv; charset=utf-8',
  'model-links': 'text/javascript; charset=utf-8',
};
const MAX_BYTES: Readonly<Record<LiveBenchReleaseArtifact['artifactId'], number>> = {
  table: 8 * 1024 * 1024,
  categories: 1024 * 1024,
  cost: 16 * 1024 * 1024,
  'model-links': 1024 * 1024,
};

function fail(message: string): never {
  throw new Error(message);
}

function requireNonBlank(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function digest(algorithm: 'SHA-1' | 'SHA-256', bytes: Uint8Array): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest(algorithm, bytes as Uint8Array<ArrayBuffer>)));
}

async function sha256(bytes: Uint8Array): Promise<`sha256:${string}`> {
  return `sha256:${await digest('SHA-256', bytes)}`;
}

async function gitBlobId(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const payload = new Uint8Array(header.byteLength + bytes.byteLength);
  payload.set(header);
  payload.set(bytes, header.byteLength);
  return digest('SHA-1', payload);
}

async function boundedBytes(response: Response, maximumBytes: number, label: string): Promise<Uint8Array> {
  if (!response.ok) fail(`${label} request failed with HTTP ${response.status}`);
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) {
    fail(`${label} exceeds its byte limit`);
  }
  if (!response.body) fail(`${label} has no response body`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      fail(`${label} exceeds its byte limit`);
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

function text(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail(`${label} is not valid UTF-8`);
  }
}

function artifactById(
  artifacts: readonly CandidateEvidenceArtifact[],
  artifactId: LiveBenchReleaseArtifact['artifactId'],
): Uint8Array {
  const artifact = artifacts.find((candidate) => candidate.artifactId === artifactId);
  if (!artifact) fail(`retrieved LiveBench candidate is missing ${artifactId}`);
  return artifact.bytes;
}

/** Retrieve and validate the immutable four-artifact source bundle. */
export async function retrieveLiveBenchCandidate(input: {
  readonly descriptor: LiveBenchReleaseDescriptor;
  readonly checkedAt: string;
  readonly attemptId: string;
  readonly license: VerifiedLiveBenchLicenseConfiguration;
  readonly fetchImpl: typeof fetch;
}): Promise<RetrievedLiveBenchCandidate> {
  const license = validateLiveBenchLicenseEvidence({
    licenseId: input.license.licenseId,
    verificationUrl: input.license.verificationUrl,
    verifiedAt: input.license.verifiedAt,
  });
  const attemptId = requireNonBlank(input.attemptId, 'LiveBench attempt ID');
  const sourceRevision = `livebench-${input.descriptor.releaseId}-${input.descriptor.fingerprint.slice(7, 19)}-${attemptId}`;
  const evidenceArtifacts: CandidateEvidenceArtifact[] = [];
  const manifestArtifacts: SourceArtifactManifest[] = [];
  for (const artifact of input.descriptor.artifacts) {
    const bytes = await boundedBytes(
      await input.fetchImpl(artifact.rawUrl, { headers: { 'User-Agent': 'TokenBench LiveBench ingestion' } }),
      MAX_BYTES[artifact.artifactId],
      `LiveBench ${artifact.artifactId}`,
    );
    if (await gitBlobId(bytes) !== artifact.blobId) fail(`LiveBench ${artifact.artifactId} bytes do not match the discovered Git blob`);
    const contentHash = await sha256(bytes);
    evidenceArtifacts.push({ artifactId: artifact.artifactId, bytes });
    manifestArtifacts.push({
      artifactId: artifact.artifactId,
      upstreamUrl: artifact.rawUrl,
      r2Key: sourceArtifactKey('benchmark', 'livebench', attemptId, artifact.artifactId),
      contentType: CONTENT_TYPES[artifact.artifactId],
      byteLength: bytes.byteLength,
      contentHash,
      upstreamBlobId: artifact.blobId,
    });
  }
  const manifest: SourceManifest = {
    schemaVersion: 1,
    domain: 'benchmark',
    sourceId: 'livebench',
    attemptId,
    upstreamRevision: input.descriptor.commit,
    releaseId: input.descriptor.releaseId,
    licenseId: license.licenseId,
    observedAt: input.checkedAt,
    parserVersion: 'livebench-parser-v1',
    artifacts: manifestArtifacts,
  };
  const bundle = parseLiveBenchRelease({
    releaseId: input.descriptor.releaseId,
    sourceCommit: input.descriptor.commit,
    observedAt: input.checkedAt,
    licenseEvidence: license,
    tableCsv: artifactById(evidenceArtifacts, 'table'),
    categoriesJson: artifactById(evidenceArtifacts, 'categories'),
    costCsv: artifactById(evidenceArtifacts, 'cost'),
    modelLinksSource: artifactById(evidenceArtifacts, 'model-links'),
  });
  return {
    bundle,
    descriptor: input.descriptor,
    manifest,
    manifestHash: await sourceManifestDigest(manifest),
    artifacts: evidenceArtifacts,
    sourceRevision,
    attemptId,
  };
}

async function requireRegisteredLiveBenchLicense(db: LiveBenchD1Database): Promise<void> {
  const row = await db.prepare(`
    SELECT license_id, canonical_url, license_text_hash
    FROM pipeline_license_registry
    WHERE license_id = 'Apache-2.0'
    LIMIT 1
  `).bind().first<Record<string, unknown>>();
  if (!row
    || row.license_id !== 'Apache-2.0'
    || typeof row.canonical_url !== 'string'
    || !row.canonical_url.startsWith('https://')
    || typeof row.license_text_hash !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(row.license_text_hash)) {
    fail('The reviewed Apache-2.0 registry record is missing or invalid');
  }
}

async function persistSourceEvidence(
  env: LiveBenchRefreshEnvironment,
  candidate: RetrievedLiveBenchCandidate,
): Promise<void> {
  await writeCandidateEvidence(env.SOURCE_SNAPSHOTS, candidate.manifest, candidate.artifacts);
  const statements = [
    env.CATALOG_DB.prepare(`
      INSERT INTO source_revision_manifests (
        domain, source_id, source_revision, attempt_id, upstream_revision,
        release_id, license_id, r2_manifest_key, content_hash, parser_version,
        observed_at, status
      ) VALUES ('benchmark', 'livebench', ?, ?, ?, ?, 'Apache-2.0', ?, ?, ?, ?, 'validated')
    `).bind(
      candidate.sourceRevision,
      candidate.attemptId,
      candidate.descriptor.commit,
      candidate.descriptor.releaseId,
      sourceManifestKey('benchmark', 'livebench', candidate.attemptId),
      candidate.manifestHash,
      candidate.manifest.parserVersion,
      candidate.manifest.observedAt,
    ),
    ...candidate.manifest.artifacts.map((artifact) => env.CATALOG_DB.prepare(`
      INSERT INTO source_artifacts (
        domain, source_id, source_revision, artifact_id, upstream_url,
        r2_key, content_type, byte_length, content_hash, upstream_blob_id
      ) VALUES ('benchmark', 'livebench', ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      candidate.sourceRevision,
      artifact.artifactId,
      artifact.upstreamUrl,
      artifact.r2Key,
      artifact.contentType,
      artifact.byteLength,
      artifact.contentHash,
      artifact.upstreamBlobId,
    )),
  ];
  await env.CATALOG_DB.batch(statements);
}

function stageLicense(value: VerifiedLiveBenchLicenseConfiguration): LiveBenchLicenseVerification {
  return {
    licenseId: 'Apache-2.0',
    verificationState: 'verified',
    verificationUrl: value.verificationUrl,
    verifiedAt: value.verifiedAt,
    verifiedBy: requireNonBlank(value.verifiedBy, 'LiveBench license reviewer'),
    attributionText: requireNonBlank(value.attributionText, 'LiveBench attribution text'),
  };
}

export async function refreshLiveBenchRelease(input: {
  readonly env: LiveBenchRefreshEnvironment;
  readonly previous: LiveBenchDiscoveryState;
  readonly checkedAt: string;
  readonly forceWeeklyVerification: boolean;
  readonly license?: VerifiedLiveBenchLicenseConfiguration;
  readonly fetchImpl: typeof fetch;
  readonly attemptId: () => string;
  /** Optional coordinator-acquired persisted fence token. */
  readonly publicationLease?: LiveBenchPublicationLease;
}): Promise<LiveBenchRefreshResult> {
  const acceptedLicense = input.license ?? ACCEPTED_LIVEBENCH_LICENSE;
  validateLiveBenchLicenseEvidence({
    licenseId: acceptedLicense.licenseId,
    verificationUrl: acceptedLicense.verificationUrl,
    verifiedAt: acceptedLicense.verifiedAt,
  });
  await requireRegisteredLiveBenchLicense(input.env.CATALOG_DB);
  const discovery = await discoverLiveBenchRelease({
    previous: input.previous,
    checkedAt: input.checkedAt,
    forceWeeklyVerification: input.forceWeeklyVerification,
    fetchImpl: input.fetchImpl,
  });
  if (discovery.status === 'unchanged') {
    return { status: 'unchanged', state: discovery.state, revision: (await readActiveLiveBenchRelease(input.env.CATALOG_DB))?.revision ?? null };
  }
  if (discovery.status === 'incomplete_upstream_release') {
    return { status: 'incomplete_upstream_release', state: discovery.state, releaseId: discovery.releaseId };
  }
  const active = await readActiveLiveBenchRelease(input.env.CATALOG_DB);
  if (active?.sourceFingerprint === discovery.release.fingerprint) {
    return { status: 'unchanged', state: discovery.state, revision: active.revision };
  }
  const publicationLease = input.publicationLease ?? await acquireLiveBenchPublicationLease({
    db: input.env.CATALOG_DB,
    attemptId: input.attemptId(),
    acquiredAt: input.checkedAt,
  });
  const candidate = await retrieveLiveBenchCandidate({
    descriptor: discovery.release,
    checkedAt: input.checkedAt,
    attemptId: publicationLease.attemptId,
    license: acceptedLicense,
    fetchImpl: input.fetchImpl,
  });
  await persistSourceEvidence(input.env, candidate);
  const revision = `${candidate.sourceRevision}-projection`;
  await stageLiveBenchRelease({
    db: input.env.CATALOG_DB,
    bundle: candidate.bundle,
    descriptor: candidate.descriptor,
    revision,
    attemptId: candidate.attemptId,
    releaseKind: 'current',
    sourceRevision: candidate.sourceRevision,
    sourceManifestKey: sourceManifestKey('benchmark', 'livebench', candidate.attemptId),
    sourceManifestHash: candidate.manifestHash,
    checkedAt: input.checkedAt,
    releasedAt: `${candidate.descriptor.releaseId}T00:00:00.000Z`,
    license: stageLicense(acceptedLicense),
    identities: candidate.bundle.models.map((model) => ({
      configurationId: model.configurationId,
      canonicalConfigurationId: null,
      matchKind: 'proposal',
      reviewStatus: 'needs_review',
      reviewedBy: null,
      evidenceUrl: null,
    })),
  });
  await validateLiveBenchRelease({ db: input.env.CATALOG_DB, revision, attemptId: candidate.attemptId });
  try {
    await publishLiveBenchRelease({
      db: input.env.CATALOG_DB,
      revision,
      attemptId: candidate.attemptId,
      lease: publicationLease,
      publishedAt: input.checkedAt,
    });
  } catch (error) {
    if (error instanceof LiveBenchPublicationLeaseError) {
      return {
        status: 'superseded',
        state: discovery.state,
        revision: (await readActiveLiveBenchRelease(input.env.CATALOG_DB))?.revision ?? null,
      };
    }
    throw error;
  }
  return { status: 'published', state: discovery.state, revision };
}

export { gitBlobId as liveBenchGitBlobIdForTest };
