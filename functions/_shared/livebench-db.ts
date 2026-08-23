import {
  assertLiveBenchTimestamp,
  validateLiveBenchLicenseEvidence,
  validateLiveBenchRelease as validateLiveBenchBundle,
  validateLiveBenchReleaseDescriptor,
  type LiveBenchReleaseBundle,
  type LiveBenchReleaseDescriptor,
} from '../../src/livebench/contracts';

export const LIVEBENCH_STAGE_BATCH_SIZE = 25;
/**
 * D1 permits 2 MB string values but only 50 queries per invocation on the free
 * plan. Feed validated rows through json_each() so a production-sized release
 * stays well below the query budget without approaching the value-size limit.
 */
export const LIVEBENCH_STAGE_JSON_CHUNK_BYTES = 1_000_000;
/**
 * Keep a deliberate margin below D1's 50-query invocation ceiling. A stage
 * owns two control queries (release insert + ownership read), leaving at most
 * 38 deterministic JSON bulk inserts. If a future schema/data shape exceeds
 * this budget, leave the candidate staged for a later checkpointed retry
 * instead of starting a D1 invocation that must exceed the hard limit.
 */
export const LIVEBENCH_STAGE_MAX_D1_STATEMENTS = 40;
const LIVEBENCH_STAGE_CONTROL_STATEMENT_COUNT = 2;

export type LiveBenchReleaseKind = 'current' | 'historical';
export type LiveBenchIdentityMatchKind = 'exact' | 'reviewed' | 'proposal';
export type LiveBenchIdentityReviewStatus = 'verified' | 'needs_review' | 'rejected';
export type LiveBenchLicenseVerificationState = 'pending' | 'verified' | 'rejected';

export interface LiveBenchD1Statement {
  bind(...values: unknown[]): LiveBenchD1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface LiveBenchD1Result {
  readonly meta?: { readonly changes?: number };
}

export interface LiveBenchD1Database {
  prepare(sql: string): LiveBenchD1Statement;
  batch(statements: readonly LiveBenchD1Statement[]): Promise<readonly LiveBenchD1Result[]>;
}

/**
 * A source configuration remains source-only until a separate reviewed mapping
 * supplies canonicalConfigurationId. `null` is therefore meaningful data, not
 * a missing fallback value.
 */
export interface LiveBenchCanonicalIdentity {
  readonly configurationId: string;
  readonly canonicalConfigurationId: string | null;
  readonly matchKind: LiveBenchIdentityMatchKind;
  readonly reviewStatus: LiveBenchIdentityReviewStatus;
  readonly reviewedBy: string | null;
  readonly evidenceUrl: string | null;
}

/** Explicit external evidence; it is never inferred from the upstream repo. */
export interface LiveBenchLicenseVerification {
  readonly licenseId: string;
  readonly verificationState: LiveBenchLicenseVerificationState;
  readonly verificationUrl: string | null;
  readonly verifiedAt: string | null;
  readonly verifiedBy: string | null;
  readonly attributionText: string;
}

export interface StageLiveBenchReleaseInput {
  readonly db: LiveBenchD1Database;
  readonly bundle: LiveBenchReleaseBundle;
  readonly descriptor: LiveBenchReleaseDescriptor;
  /** D1 revision, distinct from the human-facing upstream release date. */
  readonly revision: string;
  readonly attemptId: string;
  readonly releaseKind: LiveBenchReleaseKind;
  /** The persisted source_revision_manifests source revision. */
  readonly sourceRevision: string;
  readonly sourceManifestKey: string;
  readonly sourceManifestHash: string;
  readonly checkedAt: string;
  readonly releasedAt: string;
  readonly license: LiveBenchLicenseVerification;
  readonly identities: readonly LiveBenchCanonicalIdentity[];
}

export interface LiveBenchStageReceipt {
  readonly revision: string;
  readonly attemptId: string;
  readonly artifacts: number;
  readonly categories: number;
  readonly tasks: number;
  readonly models: number;
  readonly scores: number;
  readonly economics: number;
}

export interface LiveBenchValidationReceipt {
  readonly revision: string;
  readonly attemptId: string;
  readonly artifacts: number;
  readonly categories: number;
  readonly tasks: number;
  readonly models: number;
  readonly scores: number;
  readonly economics: number;
}

/**
 * A database-persisted fence token. A later refresh acquisition supersedes all
 * earlier tokens before any candidate can move the public pointer.
 */
export interface LiveBenchPublicationLease {
  readonly attemptId: string;
  readonly epoch: number;
}

export interface ActiveLiveBenchRelease {
  readonly revision: string;
  readonly sourceReleaseId: string;
  readonly releaseKind: 'current';
  readonly sourceCommit: string;
  readonly sourceManifestKey: string;
  readonly sourceManifestHash: string;
  readonly sourceFingerprint: string;
  readonly observedAt: string;
  readonly checkedAt: string;
  readonly releasedAt: string;
  readonly publishedAt: string;
  readonly licenseId: 'Apache-2.0';
  readonly licenseVerificationUrl: string;
  readonly licenseVerifiedAt: string;
  readonly attributionText: string;
}

type CandidateRelease = {
  readonly revision: string;
  readonly sourceReleaseId: string;
  readonly releaseKind: LiveBenchReleaseKind;
  readonly publicationState: string;
  readonly attemptId: string;
  readonly sourceRevision: string;
  readonly sourceCommit: string;
  readonly sourceManifestKey: string;
  readonly sourceManifestHash: string;
  readonly sourceFingerprint: string;
  readonly licenseId: string;
  readonly licenseVerificationState: string;
};

type ValidationRow = Record<string, unknown>;

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
const REQUIRED_ARTIFACT_IDS = ['table', 'categories', 'cost', 'model-links'] as const;

export class LiveBenchStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveBenchStorageError';
  }
}

/** A validated candidate lost its persisted publication lease before commit. */
export class LiveBenchPublicationLeaseError extends LiveBenchStorageError {
  constructor(message: string) {
    super(message);
    this.name = 'LiveBenchPublicationLeaseError';
  }
}

function fail(message: string): never {
  throw new LiveBenchStorageError(message);
}

function requireNonBlank(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256_DIGEST.test(value)) fail(`${label} must be a sha256: digest`);
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function requireCount(row: ValidationRow, key: string): number {
  const value = row[key];
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(`candidate validation ${key} is invalid`);
  return Number(value);
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) fail(`${label} must be a positive integer`);
  return Number(value);
}

function nullableBoolean(value: boolean | null): 0 | 1 | null {
  return value === null ? null : value ? 1 : 0;
}

function validateIdentity(value: LiveBenchCanonicalIdentity): LiveBenchCanonicalIdentity {
  const configurationId = requireNonBlank(value.configurationId, 'identity configurationId');
  const canonicalConfigurationId = value.canonicalConfigurationId === null
    ? null
    : requireNonBlank(value.canonicalConfigurationId, 'identity canonicalConfigurationId');
  const reviewedBy = value.reviewedBy === null ? null : requireNonBlank(value.reviewedBy, 'identity reviewedBy');
  const evidenceUrl = value.evidenceUrl === null ? null : requireNonBlank(value.evidenceUrl, 'identity evidenceUrl');
  if (evidenceUrl !== null && !evidenceUrl.startsWith('https://')) fail('identity evidenceUrl must be an https URL');

  const unresolved = canonicalConfigurationId === null
    && value.matchKind === 'proposal'
    && value.reviewStatus === 'needs_review'
    && reviewedBy === null
    && evidenceUrl === null;
  const explicitlyRejected = canonicalConfigurationId === null
    && value.matchKind === 'reviewed'
    && value.reviewStatus === 'rejected'
    && reviewedBy !== null
    && evidenceUrl !== null;
  const exact = canonicalConfigurationId !== null
    && value.matchKind === 'exact'
    && value.reviewStatus === 'verified';
  const reviewed = canonicalConfigurationId !== null
    && value.matchKind === 'reviewed'
    && value.reviewStatus === 'verified'
    && reviewedBy !== null
    && evidenceUrl !== null;
  if (!unresolved && !explicitlyRejected && !exact && !reviewed) {
    fail(`identity ${configurationId} has an invalid canonical/review combination`);
  }
  return {
    configurationId,
    canonicalConfigurationId,
    matchKind: value.matchKind,
    reviewStatus: value.reviewStatus,
    reviewedBy,
    evidenceUrl,
  };
}

function identitiesByConfiguration(
  models: LiveBenchReleaseBundle['models'],
  identities: readonly LiveBenchCanonicalIdentity[],
): ReadonlyMap<string, LiveBenchCanonicalIdentity> {
  const expected = new Set(models.map((model) => model.configurationId));
  const resolved = new Map<string, LiveBenchCanonicalIdentity>();
  for (const value of identities) {
    const identity = validateIdentity(value);
    if (!expected.has(identity.configurationId)) fail(`identity ${identity.configurationId} is outside this release`);
    if (resolved.has(identity.configurationId)) fail(`identity ${identity.configurationId} is duplicated`);
    resolved.set(identity.configurationId, identity);
  }
  if (resolved.size !== expected.size) fail('every LiveBench source configuration requires an explicit identity review state');
  return resolved;
}

function validateLicense(value: LiveBenchLicenseVerification): LiveBenchLicenseVerification {
  const licenseId = requireNonBlank(value.licenseId, 'license ID');
  const attributionText = requireNonBlank(value.attributionText, 'license attribution text');
  if (value.verificationState !== 'pending' && value.verificationState !== 'verified' && value.verificationState !== 'rejected') {
    fail('license verification state is invalid');
  }
  const verificationUrl = value.verificationUrl === null ? null : requireNonBlank(value.verificationUrl, 'license verification URL');
  const verifiedAt = value.verifiedAt === null ? null : assertLiveBenchTimestamp(value.verifiedAt, 'license verifiedAt');
  const verifiedBy = value.verifiedBy === null ? null : requireNonBlank(value.verifiedBy, 'license verifiedBy');
  if (verificationUrl !== null && !verificationUrl.startsWith('https://')) fail('license verification URL must be an https URL');
  if (value.verificationState === 'verified') {
    if (verificationUrl === null || verifiedAt === null || verifiedBy === null) {
      fail('verified license evidence must include URL, timestamp, and reviewer');
    }
    if (licenseId === 'Apache-2.0') {
      validateLiveBenchLicenseEvidence({
        licenseId: 'Apache-2.0',
        verificationUrl,
        verifiedAt,
      });
    }
  }
  return {
    licenseId,
    verificationState: value.verificationState,
    verificationUrl,
    verifiedAt,
    verifiedBy,
    attributionText,
  };
}

function validateStageInput(input: StageLiveBenchReleaseInput) {
  const bundle = validateLiveBenchBundle(input.bundle);
  const descriptor = validateLiveBenchReleaseDescriptor(input.descriptor);
  const revision = requireNonBlank(input.revision, 'revision');
  const attemptId = requireNonBlank(input.attemptId, 'attemptId');
  const sourceRevision = requireNonBlank(input.sourceRevision, 'sourceRevision');
  const sourceManifestKey = requireNonBlank(input.sourceManifestKey, 'sourceManifestKey');
  const sourceManifestHash = requireSha256(input.sourceManifestHash, 'sourceManifestHash');
  const checkedAt = assertLiveBenchTimestamp(input.checkedAt, 'checkedAt');
  const releasedAt = assertLiveBenchTimestamp(input.releasedAt, 'releasedAt');
  const license = validateLicense(input.license);
  if (input.releaseKind !== 'current' && input.releaseKind !== 'historical') fail('releaseKind is invalid');
  if (descriptor.releaseId !== bundle.releaseId || descriptor.commit !== bundle.sourceCommit) {
    fail('release descriptor does not match the parsed bundle');
  }
  const artifactIds = new Set(descriptor.artifacts.map((artifact) => artifact.artifactId));
  if (artifactIds.size !== REQUIRED_ARTIFACT_IDS.length || REQUIRED_ARTIFACT_IDS.some((artifactId) => !artifactIds.has(artifactId))) {
    fail('LiveBench release must provide the complete immutable artifact bundle');
  }
  return {
    bundle,
    descriptor,
    revision,
    attemptId,
    sourceRevision,
    sourceManifestKey,
    sourceManifestHash,
    checkedAt,
    releasedAt,
    license,
    identities: identitiesByConfiguration(bundle.models, input.identities),
  };
}

async function assertStagedOwnership(
  db: LiveBenchD1Database,
  revision: string,
  attemptId: string,
): Promise<CandidateRelease> {
  const row = await db.prepare(`
    SELECT revision, source_release_id, release_kind, publication_state,
      staging_attempt_id, source_revision, source_commit, source_manifest_key,
      source_manifest_hash, source_fingerprint, license_id, license_verification_state
    FROM livebench_releases
    WHERE revision = ?
    LIMIT 1
  `).bind(revision).first<Record<string, unknown>>();
  if (!row) fail(`LiveBench revision ${revision} is missing`);
  const candidate: CandidateRelease = {
    revision: requireNonBlank(row.revision, 'candidate revision'),
    sourceReleaseId: requireNonBlank(row.source_release_id, 'candidate source release ID'),
    releaseKind: row.release_kind === 'current' || row.release_kind === 'historical'
      ? row.release_kind
      : fail('candidate release kind is invalid'),
    publicationState: requireNonBlank(row.publication_state, 'candidate publication state'),
    attemptId: requireNonBlank(row.staging_attempt_id, 'candidate attempt ID'),
    sourceRevision: requireNonBlank(row.source_revision, 'candidate source revision'),
    sourceCommit: requireNonBlank(row.source_commit, 'candidate source commit'),
    sourceManifestKey: requireNonBlank(row.source_manifest_key, 'candidate source manifest key'),
    sourceManifestHash: requireSha256(row.source_manifest_hash, 'candidate source manifest hash'),
    sourceFingerprint: requireSha256(row.source_fingerprint, 'candidate source fingerprint'),
    licenseId: requireNonBlank(row.license_id, 'candidate license ID'),
    licenseVerificationState: requireNonBlank(row.license_verification_state, 'candidate license verification state'),
  };
  if (candidate.revision !== revision || candidate.attemptId !== attemptId) {
    fail('LiveBench candidate belongs to another attempt');
  }
  return candidate;
}

function validatePublicationLease(
  value: LiveBenchPublicationLease,
  attemptId: string,
): LiveBenchPublicationLease {
  const leaseAttemptId = requireNonBlank(value.attemptId, 'publication lease attemptId');
  if (leaseAttemptId !== attemptId) {
    fail('LiveBench publication lease does not belong to the staged attempt');
  }
  return { attemptId: leaseAttemptId, epoch: requirePositiveInteger(value.epoch, 'publication lease epoch') };
}

/**
 * Acquire the next persisted fence token before a refresh performs expensive
 * work. This survives Durable Object restarts and orders refreshes even when
 * their scheduled timestamps are equal.
 */
export async function acquireLiveBenchPublicationLease(input: {
  readonly db: LiveBenchD1Database;
  readonly attemptId: string;
  readonly acquiredAt: string;
}): Promise<LiveBenchPublicationLease> {
  const attemptId = requireNonBlank(input.attemptId, 'publication lease attemptId');
  const acquiredAt = assertLiveBenchTimestamp(input.acquiredAt, 'publication lease acquiredAt');
  const row = await input.db.prepare(`
    INSERT INTO livebench_publication_epochs (
      singleton, current_epoch, current_attempt_id, active_epoch, updated_at
    ) VALUES (1, 1, ?, 0, ?)
    ON CONFLICT(singleton) DO UPDATE SET
      current_epoch = livebench_publication_epochs.current_epoch + 1,
      current_attempt_id = excluded.current_attempt_id,
      updated_at = excluded.updated_at
    RETURNING current_epoch, current_attempt_id
  `).bind(attemptId, acquiredAt).first<Record<string, unknown>>();
  if (!row) fail('LiveBench publication lease acquisition did not return a row');
  const returnedAttemptId = requireNonBlank(row.current_attempt_id, 'publication lease returned attemptId');
  if (returnedAttemptId !== attemptId) fail('LiveBench publication lease acquisition returned another attempt');
  return {
    attemptId,
    epoch: requirePositiveInteger(row.current_epoch, 'publication lease returned epoch'),
  };
}

/** True only while no later refresh has acquired a newer persisted fence token. */
export async function isLiveBenchPublicationLeaseCurrent(input: {
  readonly db: LiveBenchD1Database;
  readonly lease: LiveBenchPublicationLease;
}): Promise<boolean> {
  const attemptId = requireNonBlank(input.lease.attemptId, 'publication lease attemptId');
  const epoch = requirePositiveInteger(input.lease.epoch, 'publication lease epoch');
  const row = await input.db.prepare(`
    SELECT 1 AS current_lease
    FROM livebench_publication_epochs
    WHERE singleton = 1
      AND current_epoch = ?
      AND current_attempt_id = ?
    LIMIT 1
  `).bind(epoch, attemptId).first<Record<string, unknown>>();
  return row?.current_lease === 1;
}

function stageStatement(
  db: LiveBenchD1Database,
  sql: string,
  values: readonly unknown[],
): LiveBenchD1Statement {
  return db.prepare(sql).bind(...values);
}

function jsonRowChunks(rows: readonly Record<string, unknown>[]): readonly string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let encodedRows: string[] = [];
  let bytes = 2;
  for (const row of rows) {
    const encoded = JSON.stringify(row);
    const encodedBytes = encoder.encode(encoded).byteLength;
    if (encodedBytes + 2 > LIVEBENCH_STAGE_JSON_CHUNK_BYTES) {
      fail('one LiveBench staging row exceeds the JSON chunk bound');
    }
    const separatorBytes = encodedRows.length === 0 ? 0 : 1;
    if (bytes + separatorBytes + encodedBytes > LIVEBENCH_STAGE_JSON_CHUNK_BYTES) {
      chunks.push(`[${encodedRows.join(',')}]`);
      encodedRows = [];
      bytes = 2;
    }
    encodedRows.push(encoded);
    bytes += (encodedRows.length === 1 ? 0 : 1) + encodedBytes;
  }
  if (encodedRows.length > 0) chunks.push(`[${encodedRows.join(',')}]`);
  return chunks;
}

function jsonStageStatements(
  db: LiveBenchD1Database,
  sql: string,
  rows: readonly Record<string, unknown>[],
  revision: string,
  attemptId: string,
): readonly LiveBenchD1Statement[] {
  return jsonRowChunks(rows).map((payload) => stageStatement(
    db,
    sql,
    [revision, attemptId, payload, revision, attemptId],
  ));
}

async function executeBoundedBatches(
  db: LiveBenchD1Database,
  statements: readonly LiveBenchD1Statement[],
): Promise<void> {
  for (let offset = 0; offset < statements.length; offset += LIVEBENCH_STAGE_BATCH_SIZE) {
    await db.batch(statements.slice(offset, offset + LIVEBENCH_STAGE_BATCH_SIZE));
  }
}

function assertStageStatementBudget(statements: readonly LiveBenchD1Statement[]): void {
  const total = LIVEBENCH_STAGE_CONTROL_STATEMENT_COUNT + statements.length;
  if (total > LIVEBENCH_STAGE_MAX_D1_STATEMENTS) {
    fail(
      `LiveBench staging requires ${total} D1 statements, exceeding the ${LIVEBENCH_STAGE_MAX_D1_STATEMENTS} safe invocation budget`,
    );
  }
}

function batchChanges(
  results: readonly LiveBenchD1Result[],
  index: number,
  label: string,
): number {
  const changes = results[index]?.meta?.changes;
  if (!Number.isSafeInteger(changes) || Number(changes) < 0) {
    fail(`${label} did not return a valid D1 change count`);
  }
  return Number(changes);
}

/**
 * Stage one immutable release under its own revision and attempt. The generic
 * source manifest/artifact records must already exist; their foreign keys make
 * R2 evidence a prerequisite, not a post-publication repair.
 */
export async function stageLiveBenchRelease(input: StageLiveBenchReleaseInput): Promise<LiveBenchStageReceipt> {
  const stage = validateStageInput(input);
  await input.db.prepare(`INSERT OR IGNORE INTO livebench_releases (
    revision, source_release_id, release_kind, publication_state, staging_attempt_id,
    source_domain, source_id, source_revision, source_commit,
    source_manifest_key, source_manifest_hash, source_fingerprint,
    observed_at, checked_at, released_at, published_at,
    license_id, license_verification_state, license_verification_url,
    license_verified_at, license_verified_by, attribution_text,
    expected_artifact_count, expected_category_count, expected_task_count,
    expected_model_count, expected_score_count, expected_economics_count
  ) VALUES (?, ?, ?, 'staged', ?, 'benchmark', 'livebench', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      stage.revision, stage.bundle.releaseId, input.releaseKind, stage.attemptId, stage.sourceRevision, stage.bundle.sourceCommit,
      stage.sourceManifestKey, stage.sourceManifestHash, stage.descriptor.fingerprint,
      stage.bundle.observedAt, stage.checkedAt, stage.releasedAt,
      stage.license.licenseId, stage.license.verificationState, stage.license.verificationUrl,
      stage.license.verifiedAt, stage.license.verifiedBy, stage.license.attributionText,
      stage.descriptor.artifacts.length, stage.bundle.categories.length, stage.bundle.tasks.length,
      stage.bundle.models.length, stage.bundle.taskScores.length, stage.bundle.taskEconomics.length,
    ).run();

  const owner = await assertStagedOwnership(input.db, stage.revision, stage.attemptId);
  if (owner.publicationState !== 'staged') {
    fail(`LiveBench revision ${stage.revision} is not stageable (state: ${owner.publicationState})`);
  }
  if (owner.releaseKind !== input.releaseKind
    || owner.sourceReleaseId !== stage.bundle.releaseId
    || owner.sourceRevision !== stage.sourceRevision
    || owner.sourceCommit !== stage.bundle.sourceCommit
    || owner.sourceManifestKey !== stage.sourceManifestKey
    || owner.sourceManifestHash !== stage.sourceManifestHash
    || owner.sourceFingerprint !== stage.descriptor.fingerprint) {
    fail(`LiveBench revision ${stage.revision} does not match its immutable staged source identity`);
  }

  const artifactStatements = jsonStageStatements(input.db, `
    INSERT OR IGNORE INTO livebench_release_artifacts (
      revision, staging_attempt_id, artifact_id, source_domain, source_id, source_revision,
      source_path, source_blob_id, source_url
    ) SELECT ?, ?,
      json_extract(value, '$.artifactId'), 'benchmark', 'livebench',
      json_extract(value, '$.sourceRevision'), json_extract(value, '$.path'),
      json_extract(value, '$.blobId'), json_extract(value, '$.rawUrl')
    FROM json_each(?)
    WHERE EXISTS (
      SELECT 1 FROM livebench_releases
      WHERE revision = ? AND staging_attempt_id = ? AND publication_state = 'staged'
    )
  `, stage.descriptor.artifacts.map((artifact) => ({
    artifactId: artifact.artifactId,
    sourceRevision: stage.sourceRevision,
    path: artifact.path,
    blobId: artifact.blobId,
    rawUrl: artifact.rawUrl,
  })), stage.revision, stage.attemptId);

  const categoryStatements = jsonStageStatements(input.db, `
    INSERT OR IGNORE INTO livebench_categories (
      revision, staging_attempt_id, category_id, label, source_artifact_id
    ) SELECT ?, ?, json_extract(value, '$.categoryId'),
      json_extract(value, '$.label'), 'categories'
    FROM json_each(?)
    WHERE EXISTS (
      SELECT 1 FROM livebench_releases
      WHERE revision = ? AND staging_attempt_id = ? AND publication_state = 'staged'
    )
  `, stage.bundle.categories.map((category) => ({
    categoryId: category.categoryId,
    label: category.label,
  })), stage.revision, stage.attemptId);

  const taskStatements = jsonStageStatements(input.db, `
    INSERT OR IGNORE INTO livebench_tasks (
      revision, staging_attempt_id, task_id, category_id, label, source_artifact_id
    ) SELECT ?, ?, json_extract(value, '$.taskId'),
      json_extract(value, '$.categoryId'), json_extract(value, '$.label'), 'table'
    FROM json_each(?)
    WHERE EXISTS (
      SELECT 1 FROM livebench_releases
      WHERE revision = ? AND staging_attempt_id = ? AND publication_state = 'staged'
    )
  `, stage.bundle.tasks.map((task) => ({
    taskId: task.taskId,
    categoryId: task.categoryId,
    label: task.label,
  })), stage.revision, stage.attemptId);

  const modelRows = stage.bundle.models.map((model) => {
    const identity = stage.identities.get(model.configurationId);
    if (!identity) fail(`LiveBench model ${model.configurationId} is missing identity state`);
    return {
      configurationId: model.configurationId,
      sourceModelId: model.sourceModelId,
      displayName: model.displayName,
      organization: model.organization,
      openWeights: nullableBoolean(model.openWeights),
      reasoner: nullableBoolean(model.reasoner),
      isDerivativeFinetune: model.isDerivativeFinetune ? 1 : 0,
      baseConfigurationId: model.baseConfigurationId,
      lineageSourceUrl: model.lineageSourceUrl,
      canonicalConfigurationId: identity.canonicalConfigurationId,
      identityMatchKind: identity.matchKind,
      identityReviewStatus: identity.reviewStatus,
      identityReviewedBy: identity.reviewedBy,
      identityEvidenceUrl: identity.evidenceUrl,
    };
  });
  const modelStatements = jsonStageStatements(input.db, `
    INSERT OR IGNORE INTO livebench_model_configurations (
      revision, staging_attempt_id, configuration_id, source_id, source_model_id,
      display_name, organization, open_weights, reasoner, is_derivative_finetune,
      base_configuration_id, lineage_source_url, canonical_configuration_id,
      identity_match_kind, identity_review_status, identity_reviewed_by,
      identity_evidence_url, source_artifact_id
    ) SELECT ?, ?, json_extract(value, '$.configurationId'), 'livebench',
      json_extract(value, '$.sourceModelId'), json_extract(value, '$.displayName'),
      json_extract(value, '$.organization'), json_extract(value, '$.openWeights'),
      json_extract(value, '$.reasoner'), json_extract(value, '$.isDerivativeFinetune'),
      json_extract(value, '$.baseConfigurationId'), json_extract(value, '$.lineageSourceUrl'),
      json_extract(value, '$.canonicalConfigurationId'), json_extract(value, '$.identityMatchKind'),
      json_extract(value, '$.identityReviewStatus'), json_extract(value, '$.identityReviewedBy'),
      json_extract(value, '$.identityEvidenceUrl'), 'model-links'
    FROM json_each(?)
    WHERE EXISTS (
      SELECT 1 FROM livebench_releases
      WHERE revision = ? AND staging_attempt_id = ? AND publication_state = 'staged'
    )
  `, modelRows, stage.revision, stage.attemptId);

  const sourceModelByConfiguration = new Map(stage.bundle.models.map((model) => [
    model.configurationId,
    model.sourceModelId,
  ]));
  const scoreRows = stage.bundle.taskScores.map((score) => {
    const sourceModelId = sourceModelByConfiguration.get(score.configurationId);
    if (!sourceModelId) fail(`LiveBench score ${score.configurationId} is missing its source model`);
    return {
      configurationId: score.configurationId,
      sourceModelId,
      taskId: score.taskId,
      score: score.score,
    };
  });
  const scoreStatements = jsonStageStatements(input.db, `
    INSERT OR IGNORE INTO livebench_task_scores (
      revision, staging_attempt_id, configuration_id, source_model_id, task_id,
      source_id, score, source_rank, task_rank, rank_field_size, source_artifact_id
    ) SELECT ?, ?, json_extract(value, '$.configurationId'),
      json_extract(value, '$.sourceModelId'), json_extract(value, '$.taskId'),
      'livebench', json_extract(value, '$.score'), NULL, NULL, NULL, 'table'
    FROM json_each(?)
    WHERE EXISTS (
      SELECT 1 FROM livebench_releases
      WHERE revision = ? AND staging_attempt_id = ? AND publication_state = 'staged'
    )
  `, scoreRows, stage.revision, stage.attemptId);

  const economicsRows = stage.bundle.taskEconomics.map((economics) => {
    const sourceModelId = sourceModelByConfiguration.get(economics.configurationId);
    if (!sourceModelId) fail(`LiveBench economics ${economics.configurationId} is missing its source model`);
    return {
      configurationId: economics.configurationId,
      sourceModelId,
      taskId: economics.taskId,
      questionCount: economics.questionCount,
      evaluationCostUsd: economics.evaluationCostUsd,
      inputPriceUsdPerMillion: economics.inputPriceUsdPerMillion,
      outputPriceUsdPerMillion: economics.outputPriceUsdPerMillion,
      meanInputTokens: economics.meanInputTokens,
      meanOutputTokens: economics.meanOutputTokens,
    };
  });
  const economicsStatements = jsonStageStatements(input.db, `
    INSERT OR IGNORE INTO livebench_task_economics (
      revision, staging_attempt_id, configuration_id, source_model_id, task_id, source_id,
      question_count, evaluation_cost_usd, input_price_usd_per_million,
      output_price_usd_per_million, mean_input_tokens, mean_output_tokens, source_artifact_id
    ) SELECT ?, ?, json_extract(value, '$.configurationId'),
      json_extract(value, '$.sourceModelId'), json_extract(value, '$.taskId'), 'livebench',
      json_extract(value, '$.questionCount'), json_extract(value, '$.evaluationCostUsd'),
      json_extract(value, '$.inputPriceUsdPerMillion'),
      json_extract(value, '$.outputPriceUsdPerMillion'),
      json_extract(value, '$.meanInputTokens'), json_extract(value, '$.meanOutputTokens'), 'cost'
    FROM json_each(?)
    WHERE EXISTS (
      SELECT 1 FROM livebench_releases
      WHERE revision = ? AND staging_attempt_id = ? AND publication_state = 'staged'
    )
  `, economicsRows, stage.revision, stage.attemptId);
  // Build the full deterministic bulk plan before writing any facts. The
  // release row is the durable checkpoint: if an invocation fails after a
  // batch, retrying this same revision/attempt safely skips committed rows via
  // INSERT OR IGNORE. Never begin a plan that could cross D1's query ceiling.
  const factStatements = [
    ...artifactStatements,
    ...categoryStatements,
    ...taskStatements,
    ...modelStatements,
    ...scoreStatements,
    ...economicsStatements,
  ];
  assertStageStatementBudget(factStatements);
  await executeBoundedBatches(input.db, factStatements);

  return {
    revision: stage.revision,
    attemptId: stage.attemptId,
    artifacts: stage.descriptor.artifacts.length,
    categories: stage.bundle.categories.length,
    tasks: stage.bundle.tasks.length,
    models: stage.bundle.models.length,
    scores: stage.bundle.taskScores.length,
    economics: stage.bundle.taskEconomics.length,
  };
}

/** Validate all revision-scoped links before changing a release state. */
export async function validateLiveBenchRelease(input: {
  readonly db: LiveBenchD1Database;
  readonly revision: string;
  readonly attemptId: string;
}): Promise<LiveBenchValidationReceipt> {
  const revision = requireNonBlank(input.revision, 'revision');
  const attemptId = requireNonBlank(input.attemptId, 'attemptId');
  const owner = await assertStagedOwnership(input.db, revision, attemptId);
  if (owner.publicationState !== 'staged') fail(`LiveBench revision ${revision} is not staged`);

  const row = await input.db.prepare(`
    SELECT
      releases.expected_artifact_count,
      releases.expected_category_count,
      releases.expected_task_count,
      releases.expected_model_count,
      releases.expected_score_count,
      releases.expected_economics_count,
      (SELECT COUNT(*) FROM livebench_release_artifacts WHERE revision = releases.revision) AS artifact_count,
      (SELECT COUNT(*) FROM livebench_categories WHERE revision = releases.revision) AS category_count,
      (SELECT COUNT(*) FROM livebench_tasks WHERE revision = releases.revision) AS task_count,
      (SELECT COUNT(*) FROM livebench_model_configurations WHERE revision = releases.revision) AS model_count,
      (SELECT COUNT(*) FROM livebench_task_scores WHERE revision = releases.revision) AS score_count,
      (SELECT COUNT(*) FROM livebench_task_economics WHERE revision = releases.revision) AS economics_count,
      (SELECT COUNT(*) FROM source_revision_manifests AS manifests
        WHERE manifests.domain = releases.source_domain
          AND manifests.source_id = releases.source_id
          AND manifests.source_revision = releases.source_revision
          AND manifests.r2_manifest_key = releases.source_manifest_key
          AND manifests.content_hash = releases.source_manifest_hash
          AND manifests.license_id = releases.license_id
          AND manifests.status IN ('validated', 'active', 'historical')) AS source_manifest_count,
      (SELECT COUNT(*) FROM livebench_tasks AS tasks
        LEFT JOIN livebench_categories AS categories
          ON categories.revision = tasks.revision AND categories.category_id = tasks.category_id
        WHERE tasks.revision = releases.revision AND categories.category_id IS NULL) AS missing_category_count,
      (SELECT COUNT(*) FROM livebench_task_scores AS scores
        LEFT JOIN livebench_tasks AS tasks
          ON tasks.revision = scores.revision AND tasks.task_id = scores.task_id
        LEFT JOIN livebench_model_configurations AS models
          ON models.revision = scores.revision
         AND models.configuration_id = scores.configuration_id
         AND models.source_model_id = scores.source_model_id
        WHERE scores.revision = releases.revision
          AND (tasks.task_id IS NULL OR models.configuration_id IS NULL)) AS missing_task_count,
      (SELECT COUNT(*) FROM livebench_task_economics AS economics
        LEFT JOIN livebench_tasks AS tasks
          ON tasks.revision = economics.revision AND tasks.task_id = economics.task_id
        LEFT JOIN livebench_model_configurations AS models
          ON models.revision = economics.revision
         AND models.configuration_id = economics.configuration_id
         AND models.source_model_id = economics.source_model_id
        WHERE economics.revision = releases.revision
          AND (tasks.task_id IS NULL OR models.configuration_id IS NULL)) AS missing_model_count,
      (SELECT COUNT(*) FROM livebench_task_scores AS scores
        LEFT JOIN livebench_task_economics AS economics
          ON economics.revision = scores.revision
         AND economics.configuration_id = scores.configuration_id
         AND economics.task_id = scores.task_id
        WHERE scores.revision = releases.revision AND economics.task_id IS NULL) AS missing_score_count,
      (SELECT COUNT(*) FROM livebench_task_economics AS economics
        LEFT JOIN livebench_task_scores AS scores
          ON scores.revision = economics.revision
         AND scores.configuration_id = economics.configuration_id
         AND scores.task_id = economics.task_id
        WHERE economics.revision = releases.revision AND scores.task_id IS NULL) AS missing_economics_count,
      (SELECT COUNT(*) FROM livebench_release_artifacts AS artifacts
        LEFT JOIN source_artifacts AS source_artifacts
          ON source_artifacts.domain = artifacts.source_domain
         AND source_artifacts.source_id = artifacts.source_id
         AND source_artifacts.source_revision = artifacts.source_revision
         AND source_artifacts.artifact_id = artifacts.artifact_id
        WHERE artifacts.revision = releases.revision AND source_artifacts.artifact_id IS NULL) AS missing_artifact_count,
      (SELECT COUNT(*) FROM livebench_model_configurations AS models
        WHERE models.revision = releases.revision
          AND NOT (
            (models.canonical_configuration_id IS NULL
              AND models.identity_match_kind = 'proposal'
              AND models.identity_review_status = 'needs_review'
              AND models.identity_reviewed_by IS NULL
              AND models.identity_evidence_url IS NULL)
            OR (models.canonical_configuration_id IS NULL
              AND models.identity_match_kind = 'reviewed'
              AND models.identity_review_status = 'rejected'
              AND models.identity_reviewed_by IS NOT NULL
              AND models.identity_evidence_url LIKE 'https://%')
            OR (models.canonical_configuration_id IS NOT NULL
              AND models.identity_match_kind = 'exact'
              AND models.identity_review_status = 'verified')
            OR (models.canonical_configuration_id IS NOT NULL
              AND models.identity_match_kind = 'reviewed'
              AND models.identity_review_status = 'verified'
              AND models.identity_reviewed_by IS NOT NULL
              AND models.identity_evidence_url LIKE 'https://%')
          )) AS invalid_identity_count,
      CASE WHEN releases.license_id = 'Apache-2.0'
              AND releases.license_verification_state = 'verified'
              AND releases.license_verification_url LIKE 'https://%'
              AND releases.license_verified_at IS NOT NULL
              AND releases.license_verified_by IS NOT NULL
           THEN 1 ELSE 0 END AS verified_cdla_license
    FROM livebench_releases AS releases
    WHERE releases.revision = ?
      AND releases.staging_attempt_id = ?
    LIMIT 1
  `).bind(revision, attemptId).first<ValidationRow>();
  if (!row) fail(`LiveBench candidate ${revision} was not found for validation`);

  const artifacts = requireCount(row, 'artifact_count');
  const categories = requireCount(row, 'category_count');
  const tasks = requireCount(row, 'task_count');
  const models = requireCount(row, 'model_count');
  const scores = requireCount(row, 'score_count');
  const economics = requireCount(row, 'economics_count');
  const exactCounts: ReadonlyArray<readonly [string, string]> = [
    ['artifact_count', 'expected_artifact_count'],
    ['category_count', 'expected_category_count'],
    ['task_count', 'expected_task_count'],
    ['model_count', 'expected_model_count'],
    ['score_count', 'expected_score_count'],
    ['economics_count', 'expected_economics_count'],
  ];
  for (const [actual, expected] of exactCounts) {
    if (requireCount(row, actual) !== requireCount(row, expected)) {
      fail(`LiveBench ${actual.replace('_count', '')} staging count is incomplete`);
    }
  }
  if (requireCount(row, 'source_manifest_count') !== 1) fail('LiveBench source manifest coverage is incomplete');
  if (requireCount(row, 'missing_category_count') !== 0) fail('LiveBench category coverage is incomplete');
  if (requireCount(row, 'missing_task_count') !== 0) fail('LiveBench task coverage is incomplete');
  if (requireCount(row, 'missing_model_count') !== 0) fail('LiveBench model coverage is incomplete');
  if (requireCount(row, 'missing_score_count') !== 0) fail('LiveBench task score coverage is incomplete');
  if (requireCount(row, 'missing_economics_count') !== 0) fail('LiveBench task economics coverage is incomplete');
  if (requireCount(row, 'missing_artifact_count') !== 0) fail('LiveBench artifact coverage is incomplete');
  if (requireCount(row, 'invalid_identity_count') !== 0) fail('LiveBench canonical identity coverage is incomplete');
  if (requireCount(row, 'verified_cdla_license') !== 1) {
    fail('LiveBench publication requires independently verified CDLA license evidence');
  }

  const update = await input.db.prepare(`
    UPDATE livebench_releases
    SET publication_state = 'validated'
    WHERE revision = ?
      AND staging_attempt_id = ?
      AND publication_state = 'staged'
  `).bind(revision, attemptId).run();
  if ((update.meta?.changes ?? 0) !== 1) fail('LiveBench candidate changed while being validated');
  return { revision, attemptId, artifacts, categories, tasks, models, scores, economics };
}

/** Move the sole public pointer only after a validated current candidate still owns its lease. */
export async function publishLiveBenchRelease(input: {
  readonly db: LiveBenchD1Database;
  readonly revision: string;
  readonly attemptId: string;
  readonly lease: LiveBenchPublicationLease;
  readonly publishedAt: string;
}): Promise<{ revision: string; publishedAt: string }> {
  const revision = requireNonBlank(input.revision, 'revision');
  const attemptId = requireNonBlank(input.attemptId, 'attemptId');
  const lease = validatePublicationLease(input.lease, attemptId);
  const publishedAt = assertLiveBenchTimestamp(input.publishedAt, 'publishedAt');
  const candidate = await assertStagedOwnership(input.db, revision, attemptId);
  if (candidate.releaseKind !== 'current') fail('historical LiveBench releases cannot move the active pointer');
  if (candidate.publicationState !== 'validated') fail(`LiveBench revision ${revision} is not validated`);
  if (candidate.licenseId !== 'Apache-2.0' || candidate.licenseVerificationState !== 'verified') {
    fail('LiveBench publication requires independently verified CDLA license evidence');
  }
  const results = await input.db.batch([
    input.db.prepare(`
      UPDATE livebench_releases
      SET publication_state = 'published', published_at = ?
      WHERE revision = ?
        AND staging_attempt_id = ?
        AND release_kind = 'current'
        AND publication_state = 'validated'
        AND license_id = 'Apache-2.0'
        AND license_verification_state = 'verified'
        AND EXISTS (
          SELECT 1 FROM livebench_publication_epochs
          WHERE singleton = 1
            AND current_epoch = ?
            AND current_attempt_id = ?
        )
    `).bind(publishedAt, revision, attemptId, lease.epoch, lease.attemptId),
    input.db.prepare(`
      INSERT INTO livebench_publication_state (singleton, active_revision, updated_at)
      SELECT 1, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM livebench_releases
        WHERE revision = ?
          AND staging_attempt_id = ?
          AND release_kind = 'current'
          AND publication_state = 'published'
          AND license_id = 'Apache-2.0'
          AND license_verification_state = 'verified'
      )
      AND EXISTS (
        SELECT 1 FROM livebench_publication_epochs
        WHERE singleton = 1
          AND current_epoch = ?
          AND current_attempt_id = ?
      )
      ON CONFLICT(singleton) DO UPDATE SET
        active_revision = excluded.active_revision,
        updated_at = excluded.updated_at
    `).bind(revision, publishedAt, revision, attemptId, lease.epoch, lease.attemptId),
    input.db.prepare(`
      UPDATE livebench_publication_epochs
      SET active_epoch = ?, updated_at = ?
      WHERE singleton = 1
        AND current_epoch = ?
        AND current_attempt_id = ?
        AND EXISTS (
          SELECT 1 FROM livebench_releases
          WHERE revision = ?
            AND staging_attempt_id = ?
            AND publication_state = 'published'
        )
    `).bind(lease.epoch, publishedAt, lease.epoch, lease.attemptId, revision, attemptId),
  ]);
  if (batchChanges(results, 0, 'LiveBench candidate publication') !== 1) {
    throw new LiveBenchPublicationLeaseError(
      `LiveBench publication lease ${lease.epoch} was superseded before ${revision} could become public`,
    );
  }
  if (batchChanges(results, 1, 'LiveBench publication pointer') !== 1
    || batchChanges(results, 2, 'LiveBench publication epoch') !== 1) {
    fail('LiveBench publication did not atomically activate its lease-owned candidate');
  }
  return { revision, publishedAt };
}

/** A stale pointer is never treated as evidence: return the last good current release or null. */
export async function readActiveLiveBenchRelease(
  db: LiveBenchD1Database,
): Promise<ActiveLiveBenchRelease | null> {
  const row = await db.prepare(`
    SELECT releases.revision, releases.release_kind, releases.source_commit,
      releases.source_release_id,
      releases.source_manifest_key, releases.source_manifest_hash,
      releases.source_fingerprint, releases.observed_at, releases.checked_at,
      releases.released_at, releases.published_at, releases.license_id,
      releases.license_verification_url, releases.license_verified_at,
      releases.attribution_text
    FROM livebench_publication_state AS pointer
    INNER JOIN livebench_releases AS releases
      ON releases.revision = pointer.active_revision
    WHERE pointer.singleton = 1
      AND releases.release_kind = 'current'
      AND releases.publication_state = 'published'
      AND releases.license_id = 'Apache-2.0'
      AND releases.license_verification_state = 'verified'
    LIMIT 1
  `).bind().first<Record<string, unknown>>();
  if (!row) return null;
  const releaseKind = requireNonBlank(row.release_kind, 'active LiveBench release kind');
  const publicationState = requireNonBlank(row.publication_state ?? 'published', 'active LiveBench publication state');
  if (releaseKind !== 'current' || publicationState !== 'published') return null;
  const licenseId = requireNonBlank(row.license_id, 'active LiveBench license ID');
  if (licenseId !== 'Apache-2.0') return null;
  const publishedAt = assertLiveBenchTimestamp(row.published_at, 'active LiveBench publishedAt');
  const licenseVerificationUrl = requireNonBlank(row.license_verification_url, 'active LiveBench license verification URL');
  const licenseVerifiedAt = assertLiveBenchTimestamp(row.license_verified_at, 'active LiveBench license verifiedAt');
  return {
    revision: requireNonBlank(row.revision, 'active LiveBench revision'),
    sourceReleaseId: requireNonBlank(row.source_release_id, 'active LiveBench source release ID'),
    releaseKind: 'current',
    sourceCommit: requireNonBlank(row.source_commit, 'active LiveBench source commit'),
    sourceManifestKey: requireNonBlank(row.source_manifest_key, 'active LiveBench source manifest key'),
    sourceManifestHash: requireSha256(row.source_manifest_hash, 'active LiveBench source manifest hash'),
    sourceFingerprint: requireSha256(row.source_fingerprint, 'active LiveBench source fingerprint'),
    observedAt: assertLiveBenchTimestamp(row.observed_at, 'active LiveBench observedAt'),
    checkedAt: assertLiveBenchTimestamp(row.checked_at, 'active LiveBench checkedAt'),
    releasedAt: assertLiveBenchTimestamp(row.released_at, 'active LiveBench releasedAt'),
    publishedAt,
    licenseId: 'Apache-2.0',
    licenseVerificationUrl,
    licenseVerifiedAt,
    attributionText: requireNonBlank(row.attribution_text, 'active LiveBench attribution text'),
  };
}

function nullableD1Boolean(value: unknown, label: string): boolean | null {
  if (value === null) return null;
  if (value === 0 || value === false) return false;
  if (value === 1 || value === true) return true;
  fail(`${label} must be a D1 boolean or null`);
}

function d1Boolean(value: unknown, label: string): boolean {
  const parsed = nullableD1Boolean(value, label);
  if (parsed === null) fail(`${label} must be a D1 boolean`);
  return parsed;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be finite`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) fail(`${label} must be a positive integer`);
  return Number(value);
}

async function allRows(
  db: LiveBenchD1Database,
  sql: string,
  revision: string,
): Promise<Record<string, unknown>[]> {
  const rows = await db.prepare(sql).bind(revision).all<unknown>();
  return rows.results.map((row, index) => requireRecord(row, `active LiveBench row ${index}`));
}

/**
 * Reconstruct the complete active bundle only from the verified pointer. A
 * final pointer reread prevents a pointer change during the bounded reads from
 * returning a mixed-revision fact graph.
 */
export async function readActiveLiveBenchBundle(
  db: LiveBenchD1Database,
): Promise<{ release: ActiveLiveBenchRelease; bundle: LiveBenchReleaseBundle } | null> {
  const release = await readActiveLiveBenchRelease(db);
  if (!release) return null;
  const revision = release.revision;
  const [categoryRows, taskRows, modelRows, scoreRows, economicsRows] = await Promise.all([
    allRows(db, `
      SELECT category_id, label
      FROM livebench_categories
      WHERE revision = ?
      ORDER BY category_id ASC
    `, revision),
    allRows(db, `
      SELECT task_id, label, category_id
      FROM livebench_tasks
      WHERE revision = ?
      ORDER BY category_id ASC, task_id ASC
    `, revision),
    allRows(db, `
      SELECT configuration_id, source_model_id, display_name, organization,
        open_weights, reasoner, is_derivative_finetune, base_configuration_id,
        lineage_source_url
      FROM livebench_model_configurations
      WHERE revision = ?
      ORDER BY configuration_id ASC
    `, revision),
    allRows(db, `
      SELECT configuration_id, task_id, score
      FROM livebench_task_scores
      WHERE revision = ?
      ORDER BY configuration_id ASC, task_id ASC
    `, revision),
    allRows(db, `
      SELECT configuration_id, task_id, question_count, evaluation_cost_usd,
        input_price_usd_per_million, output_price_usd_per_million,
        mean_input_tokens, mean_output_tokens
      FROM livebench_task_economics
      WHERE revision = ?
      ORDER BY configuration_id ASC, task_id ASC
    `, revision),
  ]);

  const taskIdsByCategory = new Map<string, string[]>();
  const tasks = taskRows.map((row) => {
    const categoryId = requireNonBlank(row.category_id, 'active LiveBench task category ID');
    const taskId = requireNonBlank(row.task_id, 'active LiveBench task ID');
    const categoryTasks = taskIdsByCategory.get(categoryId) ?? [];
    categoryTasks.push(taskId);
    taskIdsByCategory.set(categoryId, categoryTasks);
    return {
      taskId,
      label: requireNonBlank(row.label, 'active LiveBench task label'),
      categoryId,
    };
  });
  const categories = categoryRows.map((row) => {
    const categoryId = requireNonBlank(row.category_id, 'active LiveBench category ID');
    return {
      categoryId,
      label: requireNonBlank(row.label, 'active LiveBench category label'),
      taskIds: taskIdsByCategory.get(categoryId) ?? [],
    };
  });
  const models = modelRows.map((row) => ({
    configurationId: requireNonBlank(row.configuration_id, 'active LiveBench configuration ID'),
    sourceModelId: requireNonBlank(row.source_model_id, 'active LiveBench source model ID'),
    displayName: requireNonBlank(row.display_name, 'active LiveBench display name'),
    organization: requireNonBlank(row.organization, 'active LiveBench organization'),
    openWeights: nullableD1Boolean(row.open_weights, 'active LiveBench open weights'),
    reasoner: nullableD1Boolean(row.reasoner, 'active LiveBench reasoner'),
    isDerivativeFinetune: d1Boolean(row.is_derivative_finetune, 'active LiveBench derivative flag'),
    baseConfigurationId: row.base_configuration_id === null
      ? null
      : requireNonBlank(row.base_configuration_id, 'active LiveBench base configuration ID'),
    lineageSourceUrl: row.lineage_source_url === null
      ? null
      : requireNonBlank(row.lineage_source_url, 'active LiveBench lineage URL'),
  }));
  const taskScores = scoreRows.map((row) => ({
    configurationId: requireNonBlank(row.configuration_id, 'active LiveBench score configuration ID'),
    taskId: requireNonBlank(row.task_id, 'active LiveBench score task ID'),
    score: finiteNumber(row.score, 'active LiveBench score'),
  }));
  const taskEconomics = economicsRows.map((row) => ({
    configurationId: requireNonBlank(row.configuration_id, 'active LiveBench economics configuration ID'),
    taskId: requireNonBlank(row.task_id, 'active LiveBench economics task ID'),
    questionCount: positiveInteger(row.question_count, 'active LiveBench economics question count'),
    evaluationCostUsd: finiteNumber(row.evaluation_cost_usd, 'active LiveBench evaluation cost'),
    inputPriceUsdPerMillion: row.input_price_usd_per_million === null
      ? null
      : finiteNumber(row.input_price_usd_per_million, 'active LiveBench input price'),
    outputPriceUsdPerMillion: row.output_price_usd_per_million === null
      ? null
      : finiteNumber(row.output_price_usd_per_million, 'active LiveBench output price'),
    meanInputTokens: row.mean_input_tokens === null
      ? null
      : finiteNumber(row.mean_input_tokens, 'active LiveBench mean input tokens'),
    meanOutputTokens: row.mean_output_tokens === null
      ? null
      : finiteNumber(row.mean_output_tokens, 'active LiveBench mean output tokens'),
  }));

  const confirmed = await readActiveLiveBenchRelease(db);
  if (!confirmed || confirmed.revision !== revision) return null;
  const bundle = validateLiveBenchBundle({
    schemaVersion: 1,
    releaseId: release.sourceReleaseId,
    sourceCommit: release.sourceCommit,
    observedAt: release.observedAt,
    categories,
    tasks,
    models,
    taskScores,
    taskEconomics,
  });
  return { release: confirmed, bundle };
}
