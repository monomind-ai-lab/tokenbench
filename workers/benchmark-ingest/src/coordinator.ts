import { DurableObject } from 'cloudflare:workers';
import { parquetReadObjects } from 'hyparquet';
import { benchmarkCadenceKey } from '../../../src/ingestion/cadence';
import {
  assertCycleTransition,
  nextRetryAlarmAt,
  type IngestionCycle,
  type IngestionCycleState,
} from '../../_shared/checkpointed-ingestion';
import {
  candidateManifestKey,
  readCandidateManifest,
  writeCandidateManifest,
  BENCHLM_ARTIFACT_IDS,
  type BenchmarkCandidateManifestV1,
  type CandidateR2Bucket,
} from './candidate-storage';
import { LMARENA_SUBSETS, type LmArenaSubset } from './lmarena';
import {
  assembleBenchLmStep,
  normalizeSourceStep,
  retrieveBenchLmArtifactStep,
  retrieveLiteLlmStep,
  retrieveLmArenaPageStep,
  retrieveLmArenaRevisionStep,
  SourceRateLimitedError,
  SourceStepFailure,
  BENCHLM_ARTIFACTS,
  type BenchLmArtifact,
  type CandidateArtifact,
  type CandidatePartition,
  type LmArenaPageTransport,
  type LmArenaParquetDownload,
} from './source-steps';
import {
  normalizeOpenRouterCatalogStep,
  type FrozenOpenRouterCatalog,
} from './openrouter-normalization';
import {
  deriveCandidatePartitions,
  derivedPartitionToCandidate,
  readDerivedCandidateSnapshot,
  type DerivedCandidate,
} from './candidate-derivation';
import {
  ensurePendingBenchmarkRevision,
  stageBenchmarkFactPartition,
  validateStagedBenchmarkFacts,
} from './partitioned-publication';
import {
  prepareModelProfilePartition,
  stageModelProfilePartition,
} from './model-directory-publication';
import { publicLeaderboardFromSnapshot } from './benchlm-public-leaderboard';
import {
  listRequiredBenchmarkCachePartitions,
  stageBenchmarkCachePartition,
} from './cache-partitions';
import {
  benchmarkCandidateCacheRevision,
  publishBenchmarkCandidate,
  validateCompleteBenchmarkCandidate,
} from './final-publication';

// ---------------------------------------------------------------------------
// Environment bindings
// ---------------------------------------------------------------------------

/** Minimal prepared-statement surface the coordinator consumes from D1. */
export interface BenchmarkPreparedStatement {
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}

export interface BenchmarkBoundStatement {
  bind(...values: unknown[]): BenchmarkPreparedStatement;
}

export interface BenchmarkD1Database {
  prepare(sql: string): BenchmarkBoundStatement;
  batch(statements: unknown[]): Promise<unknown>;
}

/** RPC surface exposed by the singleton coordinator to the scheduled handler. */
export interface BenchmarkCoordinatorNamespace {
  getByName(name: string): {
    start(input: { scheduledTime: number; force?: boolean }): Promise<StartCycleResult>;
  };
}

export interface BenchmarkIngestEnv {
  readonly CATALOG_DB: BenchmarkD1Database;
  readonly SOURCE_SNAPSHOTS: CandidateR2Bucket;
  readonly AUTOMATED_SOURCE_IDS?: string;
  readonly INGEST_COORDINATOR?: BenchmarkCoordinatorNamespace;
}

export type StartCycleResult =
  | { status: 'started'; cycle: IngestionCycle }
  | { status: 'already-running'; cycle: IngestionCycle }
  | { status: 'already-completed'; cycle: IngestionCycle };

// ---------------------------------------------------------------------------
// Durable Object storage + dependency seams
// ---------------------------------------------------------------------------

interface CoordinatorStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(when: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
}

interface CoordinatorState {
  readonly storage: CoordinatorStorage;
}

/** The exact retrieval-phase source steps, injectable for isolated testing. */
export interface CoordinatorSteps {
  retrieveBenchLmArtifactStep: typeof retrieveBenchLmArtifactStep;
  assembleBenchLmStep: typeof assembleBenchLmStep;
  retrieveLiteLlmStep: typeof retrieveLiteLlmStep;
  retrieveLmArenaRevisionStep: typeof retrieveLmArenaRevisionStep;
  retrieveLmArenaPageStep: typeof retrieveLmArenaPageStep;
  normalizeSourceStep: typeof normalizeSourceStep;
  normalizeOpenRouterCatalogStep: typeof normalizeOpenRouterCatalogStep;
}

export interface CoordinatorDependencies {
  now: () => number;
  randomUUID: () => string;
  jitterMs: () => number;
  fetchImpl: typeof fetch;
  readParquetRows: (bytes: ArrayBuffer) => Promise<Record<string, unknown>[]>;
  log: (record: Record<string, unknown>) => void;
  steps: CoordinatorSteps;
}

const defaultDependencies: CoordinatorDependencies = {
  now: () => Date.now(),
  randomUUID: () => crypto.randomUUID(),
  jitterMs: () => Math.floor(Math.random() * 15_001),
  fetchImpl: (input, init) => globalThis.fetch(input, init),
  readParquetRows: async (bytes) => parquetReadObjects({ file: bytes }) as Promise<Record<string, unknown>[]>,
  log: (record) => console.log(JSON.stringify(record)),
  steps: {
    retrieveBenchLmArtifactStep,
    assembleBenchLmStep,
    retrieveLiteLlmStep,
    retrieveLmArenaRevisionStep,
    retrieveLmArenaPageStep,
    normalizeSourceStep,
    normalizeOpenRouterCatalogStep,
  },
};

// ---------------------------------------------------------------------------
// Compact private checkpoint state
// ---------------------------------------------------------------------------

/** One frozen active source record used for provenance and conditional reuse. */
export interface FrozenSourceValidator {
  readonly sourceId: string;
  readonly artifactId: string;
  readonly sourceUrl: string;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly snapshotKey: string;
  readonly contentHash: string;
  readonly originalContentHash: string;
  readonly upstreamRevision: string | null;
  readonly schemaVersion: string | null;
}

/** Bounded cross-subset LMArena pagination cursor for one cycle. */
export interface LmArenaProgress {
  readonly subsetIndex: number;
  readonly offset: number;
  readonly declaredTotal: number | null;
  readonly transport: LmArenaPageTransport;
  readonly download: LmArenaParquetDownload | null;
  readonly pageCount: number;
}

/** One retrieved LMArena page and the provenance normalization needs. */
export interface LmArenaCandidate {
  readonly artifact: CandidateArtifact;
  readonly subset: LmArenaSubset;
  readonly offset: number;
}

/**
 * The compact durable checkpoint. It holds incremental descriptors so the
 * public candidate manifest can stay strict: the strict `BenchmarkCandidateManifestV1`
 * is written only once six BenchLM artifacts exist and then rewritten canonically
 * after each later output, with its exact SHA-256 recorded in `manifestContentHash`.
 */
export interface BenchmarkCheckpoint {
  readonly schemaVersion: 1;
  readonly cycleId: string;
  readonly observedAt: string;
  readonly frozenCatalogRevision: string;
  readonly frozenBenchmarkRevision: string | null;
  readonly frozenOpenRouterCatalog: FrozenOpenRouterCatalog;
  readonly validators: readonly FrozenSourceValidator[];
  readonly benchLm: readonly CandidateArtifact[];
  readonly benchLmBundle: CandidatePartition | null;
  readonly liteLlm: CandidateArtifact | null;
  readonly lmArenaRevision: string | null;
  readonly lmArena: readonly LmArenaCandidate[];
  readonly lmArenaProgress: LmArenaProgress;
  readonly normalizedPartitions: readonly CandidatePartition[];
  readonly manifestContentHash: string | null;
  readonly derived: DerivedCandidate | null;
  readonly cacheRevision: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BENCHMARK_CYCLE_EXPIRY_MS = 24 * 60 * 60 * 1_000;

/**
 * Delay between two purely internal steps (D1 staging, derivation, publish).
 *
 * These steps call no upstream source, so the only reason to wait was the
 * free-tier CPU budget. Measured on cycle 111cf1e4: 172 of 207 steps were
 * internal, so a flat 15s delay spent ~43 minutes idling for no external
 * reason. The account is now on Workers Paid, where the alarm CPU ceiling is
 * far higher than a single staging step needs.
 */
export const BENCHMARK_STEP_DELAY_MS = 500;

/**
 * Delay between two steps that call an upstream source. Deliberately unchanged
 * from the proven pacing: this is politeness toward BenchLM, LiteLLM, and
 * LMArena, not a CPU-budget concession, so the paid plan does not justify
 * shortening it.
 */
export const BENCHMARK_UPSTREAM_STEP_DELAY_MS = 15_000;

/** Persisted phase order used by operations and the production-scale restart harness. */
export const BENCHMARK_CYCLE_PHASES = [
  'acquire',
  'retrieve-benchlm',
  'assemble-benchlm',
  'retrieve-litellm',
  'retrieve-lmarena-revision',
  'retrieve-lmarena-pages',
  'normalize-sources',
  'derive',
  'stage-facts',
  'stage-profiles',
  'stage-cache',
  'validate-candidate',
  'publish',
  'receipt',
] as const;
export type BenchmarkCyclePhase = typeof BENCHMARK_CYCLE_PHASES[number];

const CYCLE_STORAGE_KEY = 'benchmark-cycle';
const CHECKPOINT_STORAGE_KEY = 'benchmark-checkpoint';

/** Phases that make a bounded upstream request and may retry a transient fault. */
const RETRYABLE_PHASES: Record<string, true> = {
  'retrieve-benchlm': true,
  'retrieve-litellm': true,
  'retrieve-lmarena-revision': true,
  'retrieve-lmarena-pages': true,
  'normalize-sources': true,
};

/**
 * Returns the delay to schedule after completing a step in `phase`. Upstream
 * phases keep the polite 15s spacing; internal phases advance promptly.
 */
export function stepDelayMsFor(phase: string): number {
  return RETRYABLE_PHASES[phase] === true
    ? BENCHMARK_UPSTREAM_STEP_DELAY_MS
    : BENCHMARK_STEP_DELAY_MS;
}

// ---------------------------------------------------------------------------
// Step results
// ---------------------------------------------------------------------------

interface AdvancedResult {
  kind: 'advanced';
  cycle: IngestionCycle;
  checkpoint: BenchmarkCheckpoint;
  alarmAt: number;
  outputCount: number;
}

interface RetryResult {
  kind: 'retry';
  cycle: IngestionCycle;
  checkpoint?: BenchmarkCheckpoint;
  alarmAt: number;
  errorCode: string;
  stepAttempt: number;
  /** True when only the alarm is rescheduled (a not-yet-elapsed retry wait). */
  reschedule?: boolean;
}

interface TerminalResult {
  kind: 'terminal';
  cycle: IngestionCycle;
  status: 'published' | 'failed' | 'expired';
  errorCode: string;
  stepAttempt: number;
}

type BenchmarkStepResult = AdvancedResult | RetryResult | TerminalResult;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function iso(value: number): string {
  return new Date(value).toISOString();
}

function copyCycle(cycle: IngestionCycle, patch: Partial<IngestionCycle>): IngestionCycle {
  const next = { ...cycle, ...patch, schemaVersion: 1 as const };
  assertCycleTransition(cycle.state, next.state);
  return next;
}

function isActive(cycle: IngestionCycle): boolean {
  return cycle.state === 'running' || cycle.state === 'retry_wait' || cycle.state === 'ready_to_publish';
}

function isTerminalState(state: IngestionCycleState): boolean {
  return state === 'published' || state === 'failed' || state === 'expired';
}

function advancePhase(cycle: IngestionCycle, phase: string, cursor: number, nowMs: number): IngestionCycle {
  return copyCycle(cycle, {
    state: 'running',
    phase,
    cursor,
    attempt: 0,
    updatedAt: iso(nowMs),
    nextRetryAt: null,
    errorCode: null,
    errorSourceId: null,
    errorArtifactId: null,
  });
}

function errorCodeFor(error: unknown): string {
  if (error instanceof SourceRateLimitedError) return 'rate_limited';
  if (error instanceof SourceStepFailure && error.message === 'normalize_artifact_failed') return 'normalize_artifact_failed';
  if (error instanceof SourceStepFailure && error.message === 'normalize_manifest_failed') return 'normalize_manifest_failed';
  if (error instanceof SourceStepFailure) return 'source_step_failed';
  if (error instanceof Error && /manifest/i.test(error.message)) return 'manifest_invalid';
  return 'step_failed';
}

async function validatorFor(
  checkpoint: BenchmarkCheckpoint,
  sourceId: string,
  artifactId: string,
  store: CandidateR2Bucket,
): Promise<CandidateArtifact | null> {
  const previous = checkpoint.validators.find((candidate) => (
    candidate.sourceId === sourceId && candidate.artifactId === artifactId
  ));
  if (!previous) return null;
  const object = await store.get(previous.snapshotKey);
  if (!object) throw new Error(`frozen ${sourceId}/${artifactId} candidate bytes are missing`);
  const byteLength = (await object.arrayBuffer()).byteLength;
  if (byteLength < 1) throw new Error(`frozen ${sourceId}/${artifactId} candidate bytes are empty`);
  return {
    artifactId: previous.artifactId,
    key: previous.snapshotKey,
    contentHash: previous.contentHash,
    originalContentHash: previous.originalContentHash,
    byteLength,
    sourceUrl: previous.sourceUrl,
    etag: previous.etag,
    lastModified: previous.lastModified,
    upstreamRevision: previous.upstreamRevision,
    schemaVersion: previous.schemaVersion,
  };
}

export function createBenchmarkCycle(scheduledTime: number, cycleId: string): IngestionCycle {
  const startedAt = iso(scheduledTime);
  return {
    schemaVersion: 1,
    scope: 'benchmarks',
    cycleId,
    cadenceKey: benchmarkCadenceKey(startedAt),
    state: 'running',
    phase: 'acquire',
    cursor: 0,
    attempt: 0,
    startedAt,
    updatedAt: startedAt,
    expiresAt: iso(scheduledTime + BENCHMARK_CYCLE_EXPIRY_MS),
    nextRetryAt: null,
    frozenCatalogRevision: null,
    frozenBenchmarkRevision: null,
    manifestKey: candidateManifestKey(cycleId),
    finalRevision: null,
    errorCode: null,
    errorSourceId: null,
    errorArtifactId: null,
  };
}

function buildManifest(checkpoint: BenchmarkCheckpoint): BenchmarkCandidateManifestV1 {
  return {
    schemaVersion: 1,
    cycleId: checkpoint.cycleId,
    frozenCatalogRevision: checkpoint.frozenCatalogRevision,
    previousBenchmarkRevision: checkpoint.frozenBenchmarkRevision,
    checkedAt: checkpoint.observedAt,
    benchLm: checkpoint.benchLm,
    liteLlm: checkpoint.liteLlm,
    lmArenaRevision: checkpoint.lmArena.length > 0 ? checkpoint.lmArenaRevision : null,
    lmArena: checkpoint.lmArena.map((entry) => entry.artifact),
    normalizedPartitions: checkpoint.normalizedPartitions,
    derivedPartitions: [],
  };
}

/**
 * Writes the strict candidate manifest once the six BenchLM artifacts exist and
 * returns its recorded SHA-256, keeping the manifest canonical after every later
 * output. Before the BenchLM set is complete no manifest exists yet.
 */
async function writeManifestIfReady(env: BenchmarkIngestEnv, checkpoint: BenchmarkCheckpoint): Promise<string | null> {
  if (checkpoint.benchLm.length < BENCHLM_ARTIFACT_IDS.length) return checkpoint.manifestContentHash;
  const { contentHash } = await writeCandidateManifest(env.SOURCE_SNAPSHOTS, checkpoint.cycleId, buildManifest(checkpoint));
  return contentHash;
}

// ---------------------------------------------------------------------------
// D1 receipt statements (cycle + step receipts only, never public pointers)
// ---------------------------------------------------------------------------

function insertCycleStatement(env: BenchmarkIngestEnv, cycle: IngestionCycle): unknown {
  return env.CATALOG_DB.prepare(`INSERT INTO ingestion_cycles
    (scope, cycle_id, cadence_key, state, phase, cursor, attempt,
     frozen_catalog_revision, frozen_benchmark_revision, manifest_key,
     started_at, updated_at, completed_at, expires_at, next_retry_at,
     final_revision, result_json, error_code, error_source_id, error_artifact_id)
    VALUES ('benchmarks', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?)`).bind(
    cycle.cycleId,
    cycle.cadenceKey,
    cycle.state,
    cycle.phase,
    cycle.cursor,
    cycle.attempt,
    cycle.frozenCatalogRevision,
    cycle.frozenBenchmarkRevision,
    cycle.manifestKey,
    cycle.startedAt,
    cycle.updatedAt,
    cycle.expiresAt,
    cycle.nextRetryAt,
    cycle.finalRevision,
    cycle.errorCode,
    cycle.errorSourceId,
    cycle.errorArtifactId,
  );
}

function updateCycleStatement(env: BenchmarkIngestEnv, cycle: IngestionCycle, completedAt: string | null): unknown {
  return env.CATALOG_DB.prepare(`UPDATE ingestion_cycles SET
    state = ?, phase = ?, cursor = ?, attempt = ?, frozen_catalog_revision = ?,
    frozen_benchmark_revision = ?, manifest_key = ?, updated_at = ?, completed_at = ?,
    next_retry_at = ?, final_revision = ?, error_code = ?, error_source_id = ?, error_artifact_id = ?
    WHERE scope = 'benchmarks' AND cycle_id = ?`).bind(
    cycle.state,
    cycle.phase,
    cycle.cursor,
    cycle.attempt,
    cycle.frozenCatalogRevision,
    cycle.frozenBenchmarkRevision,
    cycle.manifestKey,
    cycle.updatedAt,
    completedAt,
    cycle.nextRetryAt,
    cycle.finalRevision,
    cycle.errorCode,
    cycle.errorSourceId,
    cycle.errorArtifactId,
    cycle.cycleId,
  );
}

interface StepReceipt {
  status: 'completed' | 'retry_wait' | 'failed' | 'skipped';
  stepAttempt: number;
  outputCount: number;
  errorCode: string | null;
  completedAt: string | null;
}

async function persistStep(
  env: BenchmarkIngestEnv,
  previous: IngestionCycle,
  next: IngestionCycle,
  receipt: StepReceipt,
): Promise<void> {
  await env.CATALOG_DB.batch([
    env.CATALOG_DB.prepare(`INSERT INTO ingestion_cycle_steps
      (scope, cycle_id, phase, cursor, status, attempt, started_at,
       completed_at, output_count, error_code)
      VALUES ('benchmarks', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope, cycle_id, phase, cursor) DO UPDATE SET
        status = excluded.status,
        attempt = excluded.attempt,
        completed_at = excluded.completed_at,
        output_count = excluded.output_count,
        error_code = excluded.error_code`).bind(
      previous.cycleId,
      previous.phase,
      previous.cursor,
      receipt.status,
      Math.max(1, Math.min(3, receipt.stepAttempt)),
      previous.updatedAt,
      receipt.completedAt,
      receipt.outputCount,
      receipt.errorCode,
    ),
    updateCycleStatement(env, next, receipt.completedAt),
  ]);
}

async function hasPublishedReceipt(env: BenchmarkIngestEnv, cadenceKey: string): Promise<boolean> {
  const row = await env.CATALOG_DB.prepare(`SELECT cycle_id FROM ingestion_cycles
    WHERE scope = 'benchmarks' AND cadence_key = ? AND state = 'published' LIMIT 1`)
    .bind(cadenceKey).first<{ cycle_id: string }>();
  return row !== null;
}

function logRecord(event: string, cycle: IngestionCycle, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event,
    scope: cycle.scope,
    cycleId: cycle.cycleId,
    cadenceKey: cycle.cadenceKey,
    phase: cycle.phase,
    cursor: cycle.cursor,
    state: cycle.state,
    attempt: cycle.attempt,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Phase handlers
// ---------------------------------------------------------------------------

async function acquireStep(
  cycle: IngestionCycle,
  nowMs: number,
  env: BenchmarkIngestEnv,
): Promise<BenchmarkStepResult> {
  const catalogRow = await env.CATALOG_DB.prepare(`SELECT catalog_revisions.revision AS revision,
      source_records.source_url AS sourceUrl, source_records.observed_at AS observedAt,
      source_records.snapshot_key AS snapshotKey, source_records.content_hash AS contentHash
    FROM catalog_publication_state
    JOIN catalog_revisions ON catalog_revisions.revision = catalog_publication_state.active_revision
    JOIN source_records ON source_records.revision = catalog_revisions.revision
    WHERE catalog_publication_state.singleton = 1
      AND catalog_revisions.publication_state = 'published'
      AND source_records.id = 'openrouter-models'`)
    .bind().first<{ revision: string; sourceUrl: string; observedAt: string; snapshotKey: string; contentHash: string }>();
  const frozenCatalogRevision = catalogRow?.revision ?? null;
  if (!frozenCatalogRevision) {
    const failed = copyCycle(cycle, {
      state: 'failed',
      updatedAt: iso(nowMs),
      nextRetryAt: null,
      errorCode: 'catalog_unavailable',
      errorSourceId: 'acquire',
    });
    return { kind: 'terminal', cycle: failed, status: 'failed', errorCode: 'catalog_unavailable', stepAttempt: 1 };
  }
  const catalogObject = await env.SOURCE_SNAPSHOTS.get(catalogRow.snapshotKey);
  const catalogOriginalHash = catalogObject?.customMetadata?.original_content_hash ?? null;
  if (!catalogObject || !/^sha256:[a-f0-9]{64}$/.test(catalogOriginalHash ?? '')) {
    const failed = copyCycle(cycle, {
      state: 'failed', updatedAt: iso(nowMs), nextRetryAt: null,
      errorCode: 'catalog_snapshot_invalid', errorSourceId: 'openrouter', errorArtifactId: 'catalog',
    });
    return { kind: 'terminal', cycle: failed, status: 'failed', errorCode: 'catalog_snapshot_invalid', stepAttempt: 1 };
  }
  const frozenOpenRouterCatalog: FrozenOpenRouterCatalog = {
    revision: catalogRow.revision,
    sourceUrl: catalogRow.sourceUrl,
    observedAt: catalogRow.observedAt,
    snapshotKey: catalogRow.snapshotKey,
    contentHash: catalogRow.contentHash,
    originalContentHash: catalogOriginalHash as string,
  };

  const benchmarkRow = await env.CATALOG_DB.prepare(`SELECT benchmark_revisions.revision AS revision
    FROM benchmark_publication_state
    JOIN benchmark_revisions ON benchmark_revisions.revision = benchmark_publication_state.active_revision
    WHERE benchmark_publication_state.singleton = 1 AND benchmark_revisions.publication_state = 'published'`)
    .bind().first<{ revision: string }>();
  const frozenBenchmarkRevision = benchmarkRow?.revision ?? null;

  let validators: FrozenSourceValidator[] = [];
  if (frozenBenchmarkRevision !== null) {
    const rows = await env.CATALOG_DB.prepare(`SELECT source_id AS sourceId, artifact_id AS artifactId,
      source_url AS sourceUrl, etag AS etag, last_modified AS lastModified, snapshot_key AS snapshotKey,
      content_hash AS contentHash, original_content_hash AS originalContentHash,
      upstream_revision AS upstreamRevision, schema_version AS schemaVersion
      FROM benchmark_source_records WHERE revision = ?`).bind(frozenBenchmarkRevision).all<FrozenSourceValidator>();
    validators = rows.results;
  }

  const checkpoint: BenchmarkCheckpoint = {
    schemaVersion: 1,
    cycleId: cycle.cycleId,
    observedAt: cycle.startedAt,
    frozenCatalogRevision,
    frozenBenchmarkRevision,
    frozenOpenRouterCatalog,
    validators,
    benchLm: [],
    benchLmBundle: null,
    liteLlm: null,
    lmArenaRevision: null,
    lmArena: [],
    lmArenaProgress: { subsetIndex: 0, offset: 0, declaredTotal: null, transport: 'dataset-viewer', download: null, pageCount: 0 },
    normalizedPartitions: [],
    manifestContentHash: null,
    derived: null,
    cacheRevision: null,
  };
  const next = copyCycle(cycle, {
    state: 'running',
    phase: 'retrieve-benchlm',
    cursor: 0,
    attempt: 0,
    updatedAt: iso(nowMs),
    nextRetryAt: null,
    errorCode: null,
    errorSourceId: null,
    errorArtifactId: null,
    frozenCatalogRevision,
    frozenBenchmarkRevision,
  });
  return { kind: 'advanced', cycle: next, checkpoint, alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS, outputCount: 0 };
}

async function retrieveBenchLmStep(
  cycle: IngestionCycle,
  checkpoint: BenchmarkCheckpoint,
  nowMs: number,
  env: BenchmarkIngestEnv,
  deps: CoordinatorDependencies,
): Promise<BenchmarkStepResult> {
  const artifactName = BENCHLM_ARTIFACTS[cycle.cursor];
  if (!artifactName) throw new Error('benchlm retrieval cursor is out of range');
  const descriptor = await deps.steps.retrieveBenchLmArtifactStep({
    cycleId: checkpoint.cycleId,
    store: env.SOURCE_SNAPSHOTS,
    fetchImpl: deps.fetchImpl,
    observedAt: checkpoint.observedAt,
    artifact: artifactName,
    previous: await validatorFor(checkpoint, 'benchlm', artifactName, env.SOURCE_SNAPSHOTS),
  });
  const nextCheckpoint: BenchmarkCheckpoint = { ...checkpoint, benchLm: [...checkpoint.benchLm, descriptor] };
  const nextCursor = cycle.cursor + 1;
  const target = nextCursor < BENCHLM_ARTIFACTS.length
    ? advancePhase(cycle, 'retrieve-benchlm', nextCursor, nowMs)
    : advancePhase(cycle, 'assemble-benchlm', 0, nowMs);
  return { kind: 'advanced', cycle: target, checkpoint: nextCheckpoint, alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS, outputCount: 1 };
}

async function assembleBenchLmStepHandler(
  cycle: IngestionCycle,
  checkpoint: BenchmarkCheckpoint,
  nowMs: number,
  env: BenchmarkIngestEnv,
  deps: CoordinatorDependencies,
): Promise<BenchmarkStepResult> {
  const artifacts = {} as Record<BenchLmArtifact, CandidateArtifact>;
  for (const descriptor of checkpoint.benchLm) {
    artifacts[descriptor.artifactId as BenchLmArtifact] = descriptor;
  }
  const bundle = await deps.steps.assembleBenchLmStep({
    cycleId: checkpoint.cycleId,
    store: env.SOURCE_SNAPSHOTS,
    artifacts,
  });
  const withBundle: BenchmarkCheckpoint = { ...checkpoint, benchLmBundle: bundle };
  const nextCheckpoint: BenchmarkCheckpoint = { ...withBundle, manifestContentHash: await writeManifestIfReady(env, withBundle) };
  return {
    kind: 'advanced',
    cycle: advancePhase(cycle, 'retrieve-litellm', 0, nowMs),
    checkpoint: nextCheckpoint,
    alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS,
    outputCount: 1,
  };
}

async function retrieveLiteLlmStepHandler(
  cycle: IngestionCycle,
  checkpoint: BenchmarkCheckpoint,
  nowMs: number,
  env: BenchmarkIngestEnv,
  deps: CoordinatorDependencies,
): Promise<BenchmarkStepResult> {
  const descriptor = await deps.steps.retrieveLiteLlmStep({
    cycleId: checkpoint.cycleId,
    store: env.SOURCE_SNAPSHOTS,
    fetchImpl: deps.fetchImpl,
    observedAt: checkpoint.observedAt,
    previous: await validatorFor(checkpoint, 'litellm', 'model-prices', env.SOURCE_SNAPSHOTS),
  });
  const withLiteLlm: BenchmarkCheckpoint = { ...checkpoint, liteLlm: descriptor };
  const nextCheckpoint: BenchmarkCheckpoint = { ...withLiteLlm, manifestContentHash: await writeManifestIfReady(env, withLiteLlm) };
  return {
    kind: 'advanced',
    cycle: advancePhase(cycle, 'retrieve-lmarena-revision', 0, nowMs),
    checkpoint: nextCheckpoint,
    alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS,
    outputCount: 1,
  };
}

async function retrieveLmArenaRevisionStepHandler(
  cycle: IngestionCycle,
  checkpoint: BenchmarkCheckpoint,
  nowMs: number,
  env: BenchmarkIngestEnv,
  deps: CoordinatorDependencies,
): Promise<BenchmarkStepResult> {
  const revision = await deps.steps.retrieveLmArenaRevisionStep({
    cycleId: checkpoint.cycleId,
    store: env.SOURCE_SNAPSHOTS,
    fetchImpl: deps.fetchImpl,
    observedAt: checkpoint.observedAt,
    previous: null,
  });
  const nextCheckpoint: BenchmarkCheckpoint = { ...checkpoint, lmArenaRevision: revision };
  return {
    kind: 'advanced',
    cycle: advancePhase(cycle, 'retrieve-lmarena-pages', 0, nowMs),
    checkpoint: nextCheckpoint,
    alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS,
    outputCount: 0,
  };
}

async function retrieveLmArenaPagesStep(
  cycle: IngestionCycle,
  checkpoint: BenchmarkCheckpoint,
  nowMs: number,
  env: BenchmarkIngestEnv,
  deps: CoordinatorDependencies,
): Promise<BenchmarkStepResult> {
  const progress = checkpoint.lmArenaProgress;
  if (progress.subsetIndex >= LMARENA_SUBSETS.length) {
    return {
      kind: 'advanced',
      cycle: advancePhase(cycle, 'normalize-sources', 0, nowMs),
      checkpoint,
      alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS,
      outputCount: 0,
    };
  }
  if (checkpoint.lmArenaRevision === null) throw new Error('LMArena revision was not frozen before pagination');
  const subset = LMARENA_SUBSETS[progress.subsetIndex];

  let output;
  try {
    output = await deps.steps.retrieveLmArenaPageStep({
      cycleId: checkpoint.cycleId,
      store: env.SOURCE_SNAPSHOTS,
      fetchImpl: deps.fetchImpl,
      observedAt: checkpoint.observedAt,
      subset,
      offset: progress.offset,
      upstreamRevision: checkpoint.lmArenaRevision,
      declaredTotal: progress.declaredTotal,
      transport: progress.transport,
      download: progress.download,
      readParquetRows: deps.readParquetRows,
      previous: null,
    });
  } catch (error) {
    if (error instanceof SourceRateLimitedError) throw error;
    // Dataset viewer is primary; a hard failure at the head of a subset enters
    // the pinned parquet resolve/download fallback the source steps define.
    if (progress.transport === 'dataset-viewer' && progress.offset === 0 && progress.pageCount === 0) {
      const flipped: BenchmarkCheckpoint = {
        ...checkpoint,
        lmArenaProgress: { ...progress, transport: 'hub-parquet-resolve' },
      };
      const alarmAt = nowMs + BENCHMARK_STEP_DELAY_MS;
      const next = copyCycle(cycle, {
        state: 'retry_wait',
        updatedAt: iso(nowMs),
        nextRetryAt: iso(alarmAt),
        errorCode: 'dataset_viewer_fallback',
        errorSourceId: 'lmarena',
        errorArtifactId: subset,
      });
      return { kind: 'retry', cycle: next, checkpoint: flipped, alarmAt, errorCode: 'dataset_viewer_fallback', stepAttempt: Math.max(1, cycle.attempt) };
    }
    throw error;
  }

  let lmArena = checkpoint.lmArena;
  let nextProgress: LmArenaProgress;
  let outputCount = 0;
  if (output.kind === 'page') {
    lmArena = [...checkpoint.lmArena, { artifact: output.artifact, subset, offset: output.offset }];
    outputCount = 1;
    nextProgress = output.complete
      ? { subsetIndex: progress.subsetIndex + 1, offset: 0, declaredTotal: null, transport: 'dataset-viewer', download: null, pageCount: 0 }
      : { ...progress, offset: output.offset + output.rowCount, declaredTotal: output.declaredTotal, pageCount: progress.pageCount + 1 };
  } else if (output.kind === 'resolved') {
    nextProgress = { ...progress, transport: 'hub-parquet-download', download: output.download };
  } else {
    lmArena = [
      ...checkpoint.lmArena,
      ...output.artifacts.map((artifact, pageIndex) => ({
        artifact,
        subset,
        offset: pageIndex * 100,
      })),
    ];
    outputCount = output.artifacts.length;
    nextProgress = { subsetIndex: progress.subsetIndex + 1, offset: 0, declaredTotal: null, transport: 'dataset-viewer', download: null, pageCount: 0 };
  }

  const withPages: BenchmarkCheckpoint = { ...checkpoint, lmArena, lmArenaProgress: nextProgress };
  const nextCheckpoint: BenchmarkCheckpoint = output.kind === 'resolved'
    ? withPages
    : { ...withPages, manifestContentHash: await writeManifestIfReady(env, withPages) };

  const target = nextProgress.subsetIndex >= LMARENA_SUBSETS.length
    ? advancePhase(cycle, 'normalize-sources', 0, nowMs)
    : advancePhase(cycle, 'retrieve-lmarena-pages', cycle.cursor + 1, nowMs);
  return { kind: 'advanced', cycle: target, checkpoint: nextCheckpoint, alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS, outputCount };
}

type NormalizationItem =
  | { source: 'benchlm' }
  | { source: 'litellm' }
  | { source: 'openrouter' }
  | { source: 'lmarena'; entry: LmArenaCandidate };

function normalizationWorklist(checkpoint: BenchmarkCheckpoint): NormalizationItem[] {
  return [
    { source: 'benchlm' },
    { source: 'litellm' },
    { source: 'openrouter' },
    ...checkpoint.lmArena.map((entry): NormalizationItem => ({ source: 'lmarena', entry })),
  ];
}

async function normalizeSourcesStep(
  cycle: IngestionCycle,
  checkpoint: BenchmarkCheckpoint,
  nowMs: number,
  env: BenchmarkIngestEnv,
  deps: CoordinatorDependencies,
): Promise<BenchmarkStepResult> {
  const worklist = normalizationWorklist(checkpoint);
  if (cycle.cursor >= worklist.length) {
    return { kind: 'advanced', cycle: advancePhase(cycle, 'derive', 0, nowMs), checkpoint, alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS, outputCount: 0 };
  }
  const item = worklist[cycle.cursor];
  let partition: CandidatePartition;
  try {
    if (item.source === 'benchlm') {
      if (!checkpoint.benchLmBundle) throw new Error('benchlm bundle is missing before normalization');
      partition = await deps.steps.normalizeSourceStep({
        source: 'benchlm',
        cycleId: checkpoint.cycleId,
        store: env.SOURCE_SNAPSHOTS,
        observedAt: checkpoint.observedAt,
        index: cycle.cursor,
        bundle: checkpoint.benchLmBundle,
      });
    } else if (item.source === 'litellm') {
      if (!checkpoint.liteLlm) throw new Error('litellm artifact is missing before normalization');
      partition = await deps.steps.normalizeSourceStep({
        source: 'litellm',
        cycleId: checkpoint.cycleId,
        store: env.SOURCE_SNAPSHOTS,
        observedAt: checkpoint.observedAt,
        index: cycle.cursor,
        artifact: checkpoint.liteLlm,
      });
    } else if (item.source === 'openrouter') {
      partition = await deps.steps.normalizeOpenRouterCatalogStep({
        cycleId: checkpoint.cycleId,
        store: env.SOURCE_SNAPSHOTS,
        catalog: checkpoint.frozenOpenRouterCatalog,
        index: cycle.cursor,
      });
    } else {
      partition = await deps.steps.normalizeSourceStep({
        source: 'lmarena',
        cycleId: checkpoint.cycleId,
        store: env.SOURCE_SNAPSHOTS,
        observedAt: checkpoint.observedAt,
        index: cycle.cursor,
        artifact: item.entry.artifact,
        subset: item.entry.subset,
        offset: item.entry.offset,
      });
    }
  } catch {
    throw new SourceStepFailure(item.source === 'openrouter' ? 'openrouter' : item.source, `normalize:${cycle.cursor}`, 'normalize_artifact_failed');
  }

  const withPartition: BenchmarkCheckpoint = { ...checkpoint, normalizedPartitions: [...checkpoint.normalizedPartitions, partition] };
  let manifestContentHash: string | null;
  try {
    manifestContentHash = await writeManifestIfReady(env, withPartition);
  } catch {
    throw new SourceStepFailure(item.source === 'openrouter' ? 'openrouter' : item.source, `manifest:${cycle.cursor}`, 'normalize_manifest_failed');
  }
  const nextCheckpoint: BenchmarkCheckpoint = { ...withPartition, manifestContentHash };
  const nextCursor = cycle.cursor + 1;
  if (nextCursor >= worklist.length) {
    return { kind: 'advanced', cycle: advancePhase(cycle, 'derive', 0, nowMs), checkpoint: nextCheckpoint, alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS, outputCount: 1 };
  }
  return {
    kind: 'advanced',
    cycle: advancePhase(cycle, 'normalize-sources', nextCursor, nowMs),
    checkpoint: nextCheckpoint,
    alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS,
    outputCount: 1,
  };
}

async function requireManifest(env: BenchmarkIngestEnv, checkpoint: BenchmarkCheckpoint): Promise<BenchmarkCandidateManifestV1> {
  if (!checkpoint.manifestContentHash) throw new Error('benchmark candidate manifest hash is missing');
  return await readCandidateManifest(
    env.SOURCE_SNAPSHOTS,
    checkpoint.cycleId,
    checkpoint.manifestContentHash,
  );
}

async function deriveStep(
  cycle: IngestionCycle,
  checkpoint: BenchmarkCheckpoint,
  nowMs: number,
  env: BenchmarkIngestEnv,
): Promise<BenchmarkStepResult> {
  const manifest = await requireManifest(env, checkpoint);
  const derived = await deriveCandidatePartitions(manifest, { SOURCE_SNAPSHOTS: env.SOURCE_SNAPSHOTS });
  const withDerived: BenchmarkCheckpoint = { ...checkpoint, derived };
  const manifestWithDerived = {
    ...buildManifest(withDerived),
    derivedPartitions: derived.partitions.map(derivedPartitionToCandidate),
  };
  const written = await writeCandidateManifest(env.SOURCE_SNAPSHOTS, checkpoint.cycleId, manifestWithDerived);
  const nextCheckpoint: BenchmarkCheckpoint = { ...withDerived, manifestContentHash: written.contentHash };
  if (checkpoint.frozenBenchmarkRevision === derived.revision) {
    const snapshot = await readDerivedCandidateSnapshot({
      manifest: manifestWithDerived,
      bucket: env.SOURCE_SNAPSHOTS,
      revision: derived.revision,
      contentHash: derived.contentHash,
      generatedAt: checkpoint.observedAt,
    });
    return {
      kind: 'advanced',
      cycle: advancePhase(cycle, 'stage-cache', 0, nowMs),
      checkpoint: { ...nextCheckpoint, cacheRevision: benchmarkCandidateCacheRevision(snapshot, checkpoint.cycleId) },
      alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS,
      outputCount: derived.partitions.length,
    };
  }
  return {
    kind: 'advanced',
    cycle: advancePhase(cycle, 'stage-facts', 0, nowMs),
    checkpoint: nextCheckpoint,
    alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS,
    outputCount: derived.partitions.length,
  };
}

async function stageFactsStep(
  cycle: IngestionCycle,
  checkpoint: BenchmarkCheckpoint,
  nowMs: number,
  env: BenchmarkIngestEnv,
): Promise<BenchmarkStepResult> {
  if (!checkpoint.derived) throw new Error('derived benchmark candidate is missing');
  const manifest = await requireManifest(env, checkpoint);
  const openRouterHash = checkpoint.frozenOpenRouterCatalog.contentHash;
  await ensurePendingBenchmarkRevision({
    db: env.CATALOG_DB as never,
    cycleId: checkpoint.cycleId,
    revision: checkpoint.derived.revision,
    generatedAt: checkpoint.observedAt,
    checkedAt: checkpoint.observedAt,
    contentHash: checkpoint.derived.contentHash,
    catalogRevision: checkpoint.frozenCatalogRevision,
    openrouterContentHash: openRouterHash,
  });
  const partition = checkpoint.derived.partitions[cycle.cursor];
  if (!partition) {
    await validateStagedBenchmarkFacts({
      db: env.CATALOG_DB as never,
      cycleId: checkpoint.cycleId,
      revision: checkpoint.derived.revision,
      manifest,
    });
    return {
      kind: 'advanced', cycle: advancePhase(cycle, 'stage-profiles', 0, nowMs), checkpoint,
      alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS, outputCount: 0,
    };
  }
  const staged = await stageBenchmarkFactPartition({
    db: env.CATALOG_DB as never,
    bucket: env.SOURCE_SNAPSHOTS,
    cycleId: checkpoint.cycleId,
    revision: checkpoint.derived.revision,
    partition,
  });
  return {
    kind: 'advanced',
    cycle: advancePhase(cycle, 'stage-facts', cycle.cursor + 1, nowMs),
    checkpoint,
    alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS,
    outputCount: staged.rows,
  };
}

async function stageProfilesStep(
  cycle: IngestionCycle,
  checkpoint: BenchmarkCheckpoint,
  nowMs: number,
  env: BenchmarkIngestEnv,
): Promise<BenchmarkStepResult> {
  if (!checkpoint.derived) throw new Error('derived benchmark candidate is missing');
  const manifest = await requireManifest(env, checkpoint);
  const snapshot = await readDerivedCandidateSnapshot({
    manifest,
    bucket: env.SOURCE_SNAPSHOTS,
    revision: checkpoint.derived.revision,
    contentHash: checkpoint.derived.contentHash,
    generatedAt: checkpoint.observedAt,
  });
  const offset = cycle.cursor * 100;
  if (offset >= snapshot.models.length) {
    const cacheRevision = benchmarkCandidateCacheRevision(snapshot, checkpoint.cycleId);
    return {
      kind: 'advanced', cycle: advancePhase(cycle, 'stage-cache', 0, nowMs),
      checkpoint: { ...checkpoint, cacheRevision }, alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS, outputCount: 0,
    };
  }
  const partition = await prepareModelProfilePartition(
    snapshot,
    publicLeaderboardFromSnapshot(snapshot),
    checkpoint.observedAt,
    offset,
  );
  const profileBytes = new TextEncoder().encode(JSON.stringify(partition));
  const profileDigest = await crypto.subtle.digest('SHA-256', profileBytes);
  const profileHash = [...new Uint8Array(profileDigest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  await env.SOURCE_SNAPSHOTS.put(
    `benchmark-candidates/${checkpoint.cycleId}/profiles/${cycle.cursor}/${profileHash}.json`,
    profileBytes,
    { httpMetadata: { contentType: 'application/json' }, customMetadata: { content_hash: `sha256:${profileHash}` } },
  );
  await stageModelProfilePartition({
    db: env.CATALOG_DB as never,
    cycleId: checkpoint.cycleId,
    revision: checkpoint.derived.revision,
    partition,
  });
  return {
    kind: 'advanced', cycle: advancePhase(cycle, 'stage-profiles', cycle.cursor + 1, nowMs),
    checkpoint,
    alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS,
    outputCount: partition.profiles.length,
  };
}

async function stageCacheStep(
  cycle: IngestionCycle,
  checkpoint: BenchmarkCheckpoint,
  nowMs: number,
  env: BenchmarkIngestEnv,
): Promise<BenchmarkStepResult> {
  if (!checkpoint.derived || !checkpoint.cacheRevision) throw new Error('cache candidate metadata is missing');
  const manifest = await requireManifest(env, checkpoint);
  const snapshot = await readDerivedCandidateSnapshot({
    manifest, bucket: env.SOURCE_SNAPSHOTS, revision: checkpoint.derived.revision,
    contentHash: checkpoint.derived.contentHash, generatedAt: checkpoint.observedAt,
  });
  const cacheKeys = listRequiredBenchmarkCachePartitions(snapshot);
  const cacheKey = cacheKeys[cycle.cursor];
  if (!cacheKey) {
    return {
      kind: 'advanced', cycle: advancePhase(cycle, 'validate-candidate', 0, nowMs), checkpoint,
      alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS, outputCount: 0,
    };
  }
  await stageBenchmarkCachePartition({
    db: env.CATALOG_DB as never,
    snapshot,
    cacheKey,
    cacheRevision: checkpoint.cacheRevision,
    publicationAttemptId: checkpoint.cycleId,
    updatedAt: checkpoint.observedAt,
  });
  return {
    kind: 'advanced', cycle: advancePhase(cycle, 'stage-cache', cycle.cursor + 1, nowMs), checkpoint,
    alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS, outputCount: 1,
  };
}

async function validateCandidateStep(
  cycle: IngestionCycle,
  checkpoint: BenchmarkCheckpoint,
  nowMs: number,
  env: BenchmarkIngestEnv,
): Promise<BenchmarkStepResult> {
  if (!checkpoint.derived || !checkpoint.cacheRevision || !checkpoint.manifestContentHash) {
    throw new Error('complete benchmark candidate metadata is missing');
  }
  const manifest = await requireManifest(env, checkpoint);
  const snapshot = await readDerivedCandidateSnapshot({
    manifest, bucket: env.SOURCE_SNAPSHOTS, revision: checkpoint.derived.revision,
    contentHash: checkpoint.derived.contentHash, generatedAt: checkpoint.observedAt,
  });
  const receipt = await validateCompleteBenchmarkCandidate({
    db: env.CATALOG_DB as never, cycleId: checkpoint.cycleId, revision: checkpoint.derived.revision,
    cacheRevision: checkpoint.cacheRevision, snapshot, manifest, manifestHash: checkpoint.manifestContentHash,
  });
  return {
    kind: 'advanced', cycle: copyCycle(cycle, {
      state: 'ready_to_publish', phase: 'publish', cursor: 0, attempt: 0,
      updatedAt: iso(nowMs), nextRetryAt: null, errorCode: null, errorSourceId: null, errorArtifactId: null,
    }), checkpoint, alarmAt: nowMs + BENCHMARK_STEP_DELAY_MS, outputCount: receipt.cacheKeyCount,
  };
}

async function publishCandidateStep(
  cycle: IngestionCycle,
  checkpoint: BenchmarkCheckpoint,
  nowMs: number,
  env: BenchmarkIngestEnv,
): Promise<BenchmarkStepResult> {
  if (!checkpoint.derived || !checkpoint.cacheRevision || !checkpoint.manifestContentHash) {
    throw new Error('publishable benchmark candidate metadata is missing');
  }
  const manifest = await requireManifest(env, checkpoint);
  const snapshot = await readDerivedCandidateSnapshot({
    manifest, bucket: env.SOURCE_SNAPSHOTS, revision: checkpoint.derived.revision,
    contentHash: checkpoint.derived.contentHash, generatedAt: checkpoint.observedAt,
  });
  await publishBenchmarkCandidate({
    db: env.CATALOG_DB as never,
    cycleId: checkpoint.cycleId,
    cadenceKey: cycle.cadenceKey,
    revision: checkpoint.derived.revision,
    cacheRevision: checkpoint.cacheRevision,
    manifestHash: checkpoint.manifestContentHash,
    snapshot,
    checkedAt: checkpoint.observedAt,
  });
  const published = copyCycle(cycle, {
    state: 'published', phase: 'receipt', cursor: 0, attempt: 0, updatedAt: iso(nowMs),
    nextRetryAt: null, finalRevision: checkpoint.derived.revision,
    errorCode: null, errorSourceId: null, errorArtifactId: null,
  });
  return { kind: 'terminal', cycle: published, status: 'published', errorCode: 'published', stepAttempt: 1 };
}

function retryOrFail(
  cycle: IngestionCycle,
  nowMs: number,
  error: unknown,
  deps: CoordinatorDependencies,
): BenchmarkStepResult {
  const consumedAttempt = cycle.attempt + 1;
  const code = errorCodeFor(error);
  const sourceId = error instanceof SourceStepFailure ? error.sourceId : cycle.phase;
  const artifactId = error instanceof SourceStepFailure ? error.artifactId : null;
  if (nowMs >= Date.parse(cycle.expiresAt)) {
    const expired = copyCycle(cycle, {
      state: 'expired',
      attempt: Math.min(3, consumedAttempt),
      updatedAt: iso(nowMs),
      nextRetryAt: null,
      errorCode: 'cycle_expired',
      errorSourceId: sourceId,
      errorArtifactId: artifactId,
    });
    return { kind: 'terminal', cycle: expired, status: 'expired', errorCode: 'cycle_expired', stepAttempt: consumedAttempt };
  }
  if (consumedAttempt >= 3) {
    const failed = copyCycle(cycle, {
      state: 'failed',
      attempt: 3,
      updatedAt: iso(nowMs),
      nextRetryAt: null,
      errorCode: code,
      errorSourceId: sourceId,
      errorArtifactId: artifactId,
    });
    return { kind: 'terminal', cycle: failed, status: 'failed', errorCode: code, stepAttempt: 3 };
  }
  const providerRetryAtMs = error instanceof SourceRateLimitedError ? error.providerRetryAtMs : null;
  const alarmAt = nextRetryAlarmAt({ attempt: consumedAttempt, nowMs, providerRetryAtMs, jitterMs: deps.jitterMs() });
  const next = copyCycle(cycle, {
    state: 'retry_wait',
    attempt: consumedAttempt,
    updatedAt: iso(nowMs),
    nextRetryAt: iso(alarmAt),
    errorCode: code,
    errorSourceId: sourceId,
    errorArtifactId: artifactId,
  });
  return { kind: 'retry', cycle: next, alarmAt, errorCode: code, stepAttempt: consumedAttempt };
}

// ---------------------------------------------------------------------------
// Durable Object
// ---------------------------------------------------------------------------

export class BenchmarkIngestCoordinator extends DurableObject<BenchmarkIngestEnv> {
  private readonly durable: CoordinatorStorage;
  private readonly coordinatorEnv: BenchmarkIngestEnv;
  private readonly deps: CoordinatorDependencies;

  constructor(state: CoordinatorState, env: BenchmarkIngestEnv, deps: Partial<CoordinatorDependencies> = {}) {
    super(state as never, env);
    this.durable = state.storage;
    this.coordinatorEnv = env;
    this.deps = { ...defaultDependencies, ...deps };
  }

  async start(input: { scheduledTime: number; force?: boolean }): Promise<StartCycleResult> {
    const scheduledTime = Number.isFinite(input.scheduledTime) ? input.scheduledTime : this.deps.now();
    const cadenceKey = benchmarkCadenceKey(iso(scheduledTime));
    const existing = await this.durable.get<IngestionCycle>(CYCLE_STORAGE_KEY);
    if (existing?.cadenceKey === cadenceKey && isActive(existing)) {
      this.deps.log(logRecord('benchmark_cycle_already_running', existing));
      return { status: 'already-running', cycle: existing };
    }
    if (existing?.cadenceKey === cadenceKey && existing.state === 'published' && !input.force) {
      this.deps.log(logRecord('benchmark_cycle_already_completed', existing));
      return { status: 'already-completed', cycle: existing };
    }
    if (!input.force && await hasPublishedReceipt(this.coordinatorEnv, cadenceKey)) {
      const cycle = existing ?? createBenchmarkCycle(scheduledTime, this.deps.randomUUID());
      this.deps.log(logRecord('benchmark_cycle_already_completed', cycle));
      return { status: 'already-completed', cycle };
    }

    if (existing && existing.cadenceKey !== cadenceKey && isActive(existing)) {
      const expired = copyCycle(existing, {
        state: 'expired',
        updatedAt: iso(scheduledTime),
        nextRetryAt: null,
        errorCode: 'cadence_superseded',
        errorSourceId: existing.phase,
        errorArtifactId: null,
      });
      await this.coordinatorEnv.CATALOG_DB.batch([
        updateCycleStatement(this.coordinatorEnv, expired, expired.updatedAt),
      ]);
    }

    const cycle = createBenchmarkCycle(scheduledTime, this.deps.randomUUID());
    await this.coordinatorEnv.CATALOG_DB.batch([insertCycleStatement(this.coordinatorEnv, cycle)]);
    await this.durable.put(CYCLE_STORAGE_KEY, cycle);
    await this.durable.setAlarm(scheduledTime);
    this.deps.log(logRecord('benchmark_cycle_started', cycle));
    return { status: 'started', cycle };
  }

  async status(): Promise<IngestionCycle | null> {
    return await this.durable.get<IngestionCycle>(CYCLE_STORAGE_KEY) ?? null;
  }

  async checkpointMetadata(): Promise<Record<string, unknown> | null> {
    const cycle = await this.durable.get<IngestionCycle>(CYCLE_STORAGE_KEY);
    const checkpoint = await this.durable.get<BenchmarkCheckpoint>(CHECKPOINT_STORAGE_KEY);
    if (!cycle || !checkpoint) return null;
    return {
      cycleId: cycle.cycleId,
      phase: cycle.phase,
      cursor: cycle.cursor,
      manifestContentHash: checkpoint.manifestContentHash,
      normalizedPartitions: checkpoint.normalizedPartitions.map((partition) => ({
        partitionId: partition.partitionId,
        index: partition.index,
        key: partition.key,
        contentHash: partition.contentHash,
        byteLength: partition.byteLength,
      })),
      lmArena: checkpoint.lmArena.map((entry) => ({
        subset: entry.subset,
        offset: entry.offset,
        artifactId: entry.artifact.artifactId,
        key: entry.artifact.key,
        contentHash: entry.artifact.contentHash,
        originalContentHash: entry.artifact.originalContentHash,
        byteLength: entry.artifact.byteLength,
        upstreamRevision: entry.artifact.upstreamRevision,
        schemaVersion: entry.artifact.schemaVersion,
      })),
    };
  }

  async alarm(): Promise<void> {
    const cycle = await this.durable.get<IngestionCycle>(CYCLE_STORAGE_KEY);
    if (!cycle || isTerminalState(cycle.state)) {
      await this.durable.deleteAlarm();
      return;
    }
    const startedAt = this.deps.now();
    const checkpoint = await this.durable.get<BenchmarkCheckpoint>(CHECKPOINT_STORAGE_KEY);
    try {
      const result = await this.runStep(cycle, checkpoint, startedAt);
      await this.persist(cycle, result, startedAt);
    } catch {
      const updatedAt = iso(this.deps.now());
      const failed = copyCycle(cycle, {
        state: 'failed',
        updatedAt,
        nextRetryAt: null,
        errorCode: 'alarm_failed',
        errorSourceId: cycle.phase,
        errorArtifactId: null,
      });
      await this.durable.put(CYCLE_STORAGE_KEY, failed);
      await this.coordinatorEnv.CATALOG_DB.batch([updateCycleStatement(this.coordinatorEnv, failed, updatedAt)]);
      await this.durable.deleteAlarm();
      this.deps.log(logRecord('benchmark_cycle_alarm_failed', failed, {
        errorCode: 'alarm_failed',
        elapsedMs: Math.max(0, this.deps.now() - startedAt),
      }));
    }
  }

  private async runStep(
    cycle: IngestionCycle,
    checkpoint: BenchmarkCheckpoint | undefined,
    nowMs: number,
  ): Promise<BenchmarkStepResult> {
    if (nowMs >= Date.parse(cycle.expiresAt) && !isTerminalState(cycle.state)) {
      const expired = copyCycle(cycle, {
        state: 'expired',
        updatedAt: iso(nowMs),
        nextRetryAt: null,
        errorCode: 'cycle_expired',
        errorSourceId: cycle.phase,
      });
      return { kind: 'terminal', cycle: expired, status: 'expired', errorCode: 'cycle_expired', stepAttempt: Math.max(1, cycle.attempt) };
    }

    let current = cycle;
    if (current.state === 'retry_wait') {
      const retryAt = Date.parse(current.nextRetryAt ?? '');
      if (Number.isFinite(retryAt) && nowMs < retryAt) {
        return { kind: 'retry', cycle: current, alarmAt: retryAt, errorCode: current.errorCode ?? 'retry_wait', stepAttempt: current.attempt, reschedule: true };
      }
      current = copyCycle(current, { state: 'running', updatedAt: iso(nowMs), nextRetryAt: null });
    }

    if (current.phase === 'acquire') return acquireStep(current, nowMs, this.coordinatorEnv);
    if (!checkpoint) throw new Error(`benchmark checkpoint missing for phase ${current.phase}`);

    try {
      switch (current.phase) {
        case 'retrieve-benchlm': return await retrieveBenchLmStep(current, checkpoint, nowMs, this.coordinatorEnv, this.deps);
        case 'assemble-benchlm': return await assembleBenchLmStepHandler(current, checkpoint, nowMs, this.coordinatorEnv, this.deps);
        case 'retrieve-litellm': return await retrieveLiteLlmStepHandler(current, checkpoint, nowMs, this.coordinatorEnv, this.deps);
        case 'retrieve-lmarena-revision': return await retrieveLmArenaRevisionStepHandler(current, checkpoint, nowMs, this.coordinatorEnv, this.deps);
        case 'retrieve-lmarena-pages': return await retrieveLmArenaPagesStep(current, checkpoint, nowMs, this.coordinatorEnv, this.deps);
        case 'normalize-sources': return await normalizeSourcesStep(current, checkpoint, nowMs, this.coordinatorEnv, this.deps);
        case 'derive': return await deriveStep(current, checkpoint, nowMs, this.coordinatorEnv);
        case 'stage-facts': return await stageFactsStep(current, checkpoint, nowMs, this.coordinatorEnv);
        case 'stage-profiles': return await stageProfilesStep(current, checkpoint, nowMs, this.coordinatorEnv);
        case 'stage-cache': return await stageCacheStep(current, checkpoint, nowMs, this.coordinatorEnv);
        case 'validate-candidate': return await validateCandidateStep(current, checkpoint, nowMs, this.coordinatorEnv);
        case 'publish': return await publishCandidateStep(current, checkpoint, nowMs, this.coordinatorEnv);
        default: throw new Error(`unknown benchmark retrieval phase: ${current.phase}`);
      }
    } catch (error) {
      if (RETRYABLE_PHASES[current.phase]) return retryOrFail(current, nowMs, error, this.deps);
      const failed = copyCycle(current, {
        state: 'failed',
        updatedAt: iso(nowMs),
        nextRetryAt: null,
        errorCode: errorCodeFor(error),
        errorSourceId: current.phase,
      });
      return { kind: 'terminal', cycle: failed, status: 'failed', errorCode: errorCodeFor(error), stepAttempt: Math.max(1, current.attempt + 1) };
    }
  }

  private async persist(previous: IngestionCycle, result: BenchmarkStepResult, startedAt: number): Promise<void> {
    const elapsedMs = Math.max(0, this.deps.now() - startedAt);
    if (result.kind === 'retry' && result.reschedule) {
      await this.durable.setAlarm(result.alarmAt);
      this.deps.log(logRecord('benchmark_cycle_retry_wait', result.cycle, { status: 'retry_wait', errorCode: result.errorCode, elapsedMs }));
      return;
    }

    if ('checkpoint' in result && result.checkpoint) {
      await this.durable.put(CHECKPOINT_STORAGE_KEY, result.checkpoint);
    }
    await this.durable.put(CYCLE_STORAGE_KEY, result.cycle);

    const receipt: StepReceipt = result.kind === 'advanced'
      ? { status: 'completed', stepAttempt: Math.max(1, previous.attempt + 1), outputCount: result.outputCount, errorCode: null, completedAt: result.cycle.updatedAt }
      : result.kind === 'retry'
        ? { status: 'retry_wait', stepAttempt: result.stepAttempt, outputCount: 0, errorCode: result.errorCode, completedAt: null }
        : { status: result.status === 'published' ? 'completed' : 'failed', stepAttempt: result.stepAttempt, outputCount: 0, errorCode: result.status === 'published' ? null : result.errorCode, completedAt: result.cycle.updatedAt };
    await persistStep(this.coordinatorEnv, previous, result.cycle, receipt);

    if (result.kind === 'terminal' && result.status === 'published') {
      await this.durable.deleteAlarm();
      this.deps.log(logRecord('benchmark_cycle_step', result.cycle, {
        status: 'published', outputCount: 0, elapsedMs,
      }));
      return;
    }

    // Step handlers schedule with the internal delay. Re-pace the alarm here
    // from the phase the cycle is entering, so upstream phases keep the polite
    // 15s spacing while internal staging advances promptly. Retry backoff is
    // deliberately left exactly as the retry path computed it.
    if (result.kind === 'advanced') {
      await this.durable.setAlarm(this.deps.now() + stepDelayMsFor(result.cycle.phase));
    } else if (result.kind === 'retry') {
      await this.durable.setAlarm(result.alarmAt);
    } else {
      await this.durable.deleteAlarm();
    }

    const status = result.kind === 'advanced' ? 'completed' : result.kind === 'retry' ? 'retry_wait' : result.status;
    this.deps.log(logRecord('benchmark_cycle_step', result.cycle, {
      status,
      outputCount: receipt.outputCount,
      elapsedMs,
      ...(receipt.errorCode ? { errorCode: receipt.errorCode } : {}),
    }));
  }
}
