import {
  catalogApiCacheProjections,
  mergeManualSubscriptionPlans,
  readPublishedCatalog,
} from '../../../functions/api/catalog';
import { splitApiResponseBody } from '../../../src/cache/api-response-chunks';
import type { CatalogResponse } from '../../../src/catalog/contracts';
import {
  buildManualSubscriptionSources,
  MANUAL_SUBSCRIPTION_PROVIDER_IDS,
} from '../../../src/catalog/manual-manifests';
import { validateCatalogResponse } from '../../../src/catalog/validation';
import {
  assertCycleTransition,
  nextRetryAlarmAt,
  providerRetryAt,
  type IngestionCycle,
  type IngestionCycleState,
} from '../../_shared/checkpointed-ingestion';
import {
  combineOpenCodeSource,
  parseOpenCodeCatalog,
  parseOpenRouterModels,
  prepareOpenCodeModels,
  prepareOpenCodePricing,
  prepareOpenRouterSource,
  type D1Database,
  type ParsedSource,
} from './index';

export const CATALOG_CYCLE_STEPS = [
  'acquire',
  'retrieve-openrouter',
  'retrieve-opencode-models',
  'retrieve-opencode-pricing',
  'prepare-manual',
  'stage',
  'validate',
  'publish',
  'receipt',
] as const;

export type CatalogCycleStep = typeof CATALOG_CYCLE_STEPS[number];

export const CATALOG_CYCLE_EXPIRY_MS = 12 * 60 * 60 * 1_000;
export const CATALOG_STEP_DELAY_MS = 15_000;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';
const OPENCODE_MODELS_URL = 'https://opencode.ai/zen/v1/models';
const OPENCODE_PRICING_URL = 'https://opencode.ai/docs/zen/';

interface BoundStatement {
  readonly sql?: string;
  readonly values?: readonly unknown[];
}

interface QueryStatement extends BoundStatement {
  all<T = unknown>(): Promise<{ results: T[] }>;
}

export interface CatalogR2Object {
  readonly customMetadata?: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text?(): Promise<string>;
}

export interface CatalogR2Bucket {
  put(
    key: string,
    value: string | ArrayBufferView,
    options?: {
      httpMetadata?: { contentType: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<CatalogR2Object | null>;
  head?(key: string): Promise<Pick<CatalogR2Object, 'customMetadata'> | null>;
}

export interface CatalogCycleEnvironment {
  readonly CATALOG_DB: D1Database;
  readonly SOURCE_SNAPSHOTS: CatalogR2Bucket;
  readonly AUTOMATED_SOURCE_IDS?: string;
}

export interface CatalogArtifact {
  readonly key: string;
  readonly byteLength: number;
  readonly contentHash: string;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly unchanged: boolean;
}

export interface CatalogSourceValidator {
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly priorSnapshotKey: string | null;
}

export interface CatalogCycleManifest {
  readonly schemaVersion: 1;
  readonly cycleId: string;
  readonly cadenceKey: string;
  readonly observedAt: string;
  readonly baselineKey: string;
  readonly frozenCatalogRevision: string | null;
  readonly validators: Readonly<Record<string, CatalogSourceValidator>>;
  readonly artifacts: Readonly<Record<string, CatalogArtifact>>;
  readonly final?: {
    readonly catalogRevision: string;
    readonly cacheRevision: string;
    readonly changed: boolean;
    readonly sourceCount: number;
    readonly sourceIds: readonly string[];
    readonly planCount: number;
    readonly modelCount: number;
    readonly cacheVariantCount: number;
  };
}

export interface CatalogCycleStepInput {
  readonly cycle: IngestionCycle;
  readonly env: CatalogCycleEnvironment;
  readonly nowMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly jitterMs?: number;
}

export type CatalogCycleStepResult =
  | { kind: 'advanced'; cycle: IngestionCycle; alarmAt: number; outputCount: number }
  | { kind: 'retry'; cycle: IngestionCycle; alarmAt: number; errorCode: string }
  | { kind: 'terminal'; cycle: IngestionCycle; status: 'published' | 'unchanged' | 'failed' | 'expired' };

export function catalogCandidateCacheRevision(catalogRevision: string, cycleId: string): string {
  return `${catalogRevision}+cache-${cycleId}`;
}

function asQuery(statement: unknown): QueryStatement {
  if (!statement || typeof statement !== 'object'
    || typeof (statement as { all?: unknown }).all !== 'function') {
    throw new Error('D1 query result is unavailable');
  }
  return statement as QueryStatement;
}

async function queryRows<T>(db: D1Database, sql: string, ...values: unknown[]): Promise<T[]> {
  return (await asQuery(db.prepare(sql).bind(...values)).all<T>()).results;
}

function iso(value: number): string {
  return new Date(value).toISOString();
}

function copyCycle(cycle: IngestionCycle, patch: Partial<IngestionCycle>): IngestionCycle {
  const next = { ...cycle, ...patch, schemaVersion: 1 as const };
  assertCycleTransition(cycle.state, next.state);
  return next;
}

function isTerminalState(state: IngestionCycleState): boolean {
  return state === 'published' || state === 'failed' || state === 'expired';
}

function sourceAllowed(env: CatalogCycleEnvironment, sourceId: string): boolean {
  return env.AUTOMATED_SOURCE_IDS?.split(',').map((value) => value.trim()).includes(sourceId) ?? false;
}

function conditionalHeaders(validator: CatalogSourceValidator | undefined): Headers | undefined {
  if (!validator?.etag && !validator?.lastModified) return undefined;
  const headers = new Headers();
  if (validator.etag) headers.set('If-None-Match', validator.etag);
  if (validator.lastModified) headers.set('If-Modified-Since', validator.lastModified);
  return headers;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const fields = Object.entries(value as Record<string, unknown>)
      .filter(([, field]) => field !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${fields.map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalCatalogContent(catalog: CatalogResponse): string {
  return canonicalJson({
    provenance: catalog.provenance.map((source) => ({
      id: source.id,
      providerId: source.providerId,
      sourceUrl: source.sourceUrl,
      sourceKind: source.sourceKind,
      confidence: source.confidence,
      contentHash: source.contentHash ?? null,
      parserVersion: source.parserVersion ?? null,
      evidenceLocator: source.evidenceLocator ?? null,
      reviewStatus: source.reviewStatus ?? null,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    plans: [...catalog.plans].sort((left, right) => left.id.localeCompare(right.id)),
    modelOffers: [...catalog.modelOffers].sort((left, right) => left.id.localeCompare(right.id)),
  });
}

async function readR2Bytes(bucket: CatalogR2Bucket, key: string): Promise<Uint8Array> {
  const object = await bucket.get(key);
  if (!object) throw new Error(`candidate artifact missing: ${key}`);
  return new Uint8Array(await object.arrayBuffer());
}

async function readR2Json<T>(bucket: CatalogR2Bucket, key: string): Promise<T> {
  const bytes = await readR2Bytes(bucket, key);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T;
  } catch {
    throw new Error(`candidate artifact invalid: ${key}`);
  }
}

async function writeManifest(
  bucket: CatalogR2Bucket,
  key: string,
  manifest: CatalogCycleManifest,
): Promise<void> {
  await bucket.put(key, new TextEncoder().encode(JSON.stringify(manifest)), {
    httpMetadata: { contentType: 'application/json' },
  });
}

async function readManifest(input: CatalogCycleStepInput): Promise<CatalogCycleManifest> {
  if (!input.cycle.manifestKey) throw new Error('catalog manifest key missing');
  return readR2Json<CatalogCycleManifest>(input.env.SOURCE_SNAPSHOTS, input.cycle.manifestKey);
}

function multiRowInsert(
  db: D1Database,
  prefix: string,
  rows: readonly (readonly unknown[])[],
  columnsPerRow: number,
): unknown[] {
  if (rows.length === 0) return [];
  const rowsPerStatement = Math.max(1, Math.floor(100 / columnsPerRow));
  const statements: unknown[] = [];
  for (let offset = 0; offset < rows.length; offset += rowsPerStatement) {
    const chunk = rows.slice(offset, offset + rowsPerStatement);
    const placeholders = chunk.map(() => `(${Array.from({ length: columnsPerRow }, () => '?').join(', ')})`).join(', ');
    statements.push(db.prepare(`${prefix} ${placeholders}`).bind(...chunk.flat()));
  }
  return statements;
}

function cacheCandidateStatements(input: {
  db: D1Database;
  catalog: CatalogResponse;
  cacheRevision: string;
  createdAt: string;
}): unknown[] {
  const { db, catalog, cacheRevision, createdAt } = input;
  const response = mergeManualSubscriptionPlans(catalog);
  const rows = catalogApiCacheProjections(response).flatMap((projection) => ([
    ['fresh', projection.etagFresh, projection.bodyFresh],
    ['stale', projection.etagStale, projection.bodyStale],
  ] as const).flatMap(([variant, etag, body]) => splitApiResponseBody(body).map((chunk, chunkIndex) => ([
    'catalog', cacheRevision, projection.cacheKey, variant, chunkIndex, etag, chunk,
  ] as const))));
  return [
    db.prepare(`INSERT OR IGNORE INTO api_response_revisions
      (scope, revision, checked_at, published_at, created_at)
      VALUES ('catalog', ?, ?, ?, ?)`).bind(
      cacheRevision,
      response.freshness.checkedAt,
      response.publishedAt,
      createdAt,
    ),
    ...multiRowInsert(
      db,
      `INSERT OR IGNORE INTO api_response_entries
        (scope, revision, cache_key, variant, chunk_index, etag, body) VALUES`,
      rows,
      7,
    ),
  ];
}

export function buildCatalogCandidateStatements(input: {
  db: D1Database;
  catalog: CatalogResponse;
  cycleId: string;
  snapshotKeys: Readonly<Record<string, string>>;
  createdAt: string;
}): BoundStatement[] {
  const { db, catalog, cycleId, snapshotKeys, createdAt } = input;
  const cacheRevision = catalogCandidateCacheRevision(catalog.revision, cycleId);
  const sourceRows = catalog.provenance.map((source) => ([
    catalog.revision,
    source.id,
    source.providerId,
    source.sourceUrl,
    source.observedAt,
    source.sourceKind,
    source.confidence,
    snapshotKeys[source.id] ?? source.snapshotKey ?? null,
    source.contentHash ?? null,
    source.parserVersion ?? 'adapter-v1',
    source.evidenceLocator ?? null,
    source.reviewStatus ?? 'verified',
  ]));
  const planRows = catalog.plans.map((plan) => ([
    catalog.revision,
    plan.id,
    plan.providerId,
    plan.displayName,
    plan.monthlyCostMicroDollars,
    plan.currency,
    JSON.stringify(plan.entitlement),
    JSON.stringify(plan.entitlementEvidence),
    plan.billingCycle ?? null,
    plan.supportedModelIds ? JSON.stringify(plan.supportedModelIds) : null,
    plan.sourceId,
  ]));
  const modelRows = catalog.modelOffers.map((model) => ([
    catalog.revision,
    model.id,
    model.providerId,
    model.displayName,
    model.modelId,
    model.pricingBasis,
    model.route,
    model.currency,
    model.unit,
    model.inputMicroDollarsPerMillion,
    model.cachedInputMicroDollarsPerMillion ?? null,
    model.outputMicroDollarsPerMillion,
    model.contextWindowTokens ?? null,
    model.maxOutputTokens ?? null,
    model.availability ?? null,
    model.expirationDate ?? null,
    model.sourceId,
  ]));
  return [
    db.prepare(`INSERT OR IGNORE INTO catalog_revisions
      (revision, published_at, checked_at, publication_state, publication_attempt_id)
      VALUES (?, ?, ?, 'pending', ?)`).bind(
      catalog.revision,
      catalog.publishedAt,
      catalog.freshness.checkedAt,
      cycleId,
    ),
    ...multiRowInsert(db, `INSERT OR IGNORE INTO source_records
      (revision, id, provider_id, source_url, observed_at, source_kind,
       confidence, snapshot_key, content_hash, parser_version,
       evidence_locator, review_status) VALUES`, sourceRows, 12),
    ...multiRowInsert(db, `INSERT OR IGNORE INTO plan_offers
      (revision, id, provider_id, display_name, monthly_cost_micro_dollars,
       currency, entitlement_json, entitlement_evidence_json, billing_cycle,
       supported_model_ids_json, source_id) VALUES`, planRows, 11),
    ...multiRowInsert(db, `INSERT OR IGNORE INTO model_offers
      (revision, id, provider_id, display_name, model_id, pricing_basis,
       route, currency, unit, input_micro_dollars_per_million,
       cached_input_micro_dollars_per_million, output_micro_dollars_per_million,
       context_window_tokens, max_output_tokens, availability, expiration_date,
       source_id) VALUES`, modelRows, 17),
    ...cacheCandidateStatements({ db, catalog, cacheRevision, createdAt }),
  ] as BoundStatement[];
}

export function buildCatalogPublicationStatements(input: {
  db: D1Database;
  catalogRevision: string;
  cacheRevision: string;
  frozenCatalogRevision: string | null;
  cycleId: string;
  sourceIds?: readonly string[];
  now: string;
}): BoundStatement[] {
  const { db, catalogRevision, cacheRevision, frozenCatalogRevision, now, cycleId } = input;
  return [
    db.prepare(`UPDATE catalog_revisions
      SET publication_state = 'superseded'
      WHERE revision = ?
        AND publication_state = 'published'
        AND ? = (SELECT active_revision FROM catalog_publication_state WHERE singleton = 1)`).bind(
      frozenCatalogRevision,
      frozenCatalogRevision,
    ),
    db.prepare(`UPDATE catalog_revisions
      SET publication_state = 'published'
      WHERE revision = ?
        AND publication_state = 'pending'
        AND publication_attempt_id = ?
        AND ((? IS NULL AND NOT EXISTS (
          SELECT 1 FROM catalog_publication_state WHERE singleton = 1
        )) OR EXISTS (
          SELECT 1 FROM catalog_publication_state
          WHERE singleton = 1 AND active_revision = ?
        ))`).bind(catalogRevision, cycleId, frozenCatalogRevision, frozenCatalogRevision),
    db.prepare(`INSERT INTO catalog_publication_state
      (singleton, active_revision, updated_at)
      SELECT 1, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM catalog_revisions
        WHERE revision = ? AND publication_state = 'published'
          AND publication_attempt_id = ?
      )
      AND ((? IS NULL AND NOT EXISTS (
        SELECT 1 FROM catalog_publication_state WHERE singleton = 1
      )) OR EXISTS (
        SELECT 1 FROM catalog_publication_state
        WHERE singleton = 1 AND active_revision = ?
      ))
      ON CONFLICT(singleton) DO UPDATE SET
        active_revision = excluded.active_revision,
        updated_at = excluded.updated_at`).bind(
      catalogRevision,
      now,
      catalogRevision,
      cycleId,
      frozenCatalogRevision,
      frozenCatalogRevision,
    ),
    db.prepare(`INSERT INTO api_response_publication_state
      (scope, active_revision, updated_at)
      SELECT 'catalog', ?, ?
      WHERE EXISTS (
        SELECT 1 FROM catalog_publication_state
        WHERE singleton = 1 AND active_revision = ?
      )
      ON CONFLICT(scope) DO UPDATE SET
        active_revision = excluded.active_revision,
        updated_at = excluded.updated_at`).bind(cacheRevision, now, catalogRevision),
    ...(input.sourceIds ?? []).map((sourceId) => db.prepare(`INSERT INTO source_refresh_state
      (source_id, last_success_at, last_revision, last_error)
      SELECT ?, ?, ?, NULL
      WHERE EXISTS (
        SELECT 1 FROM catalog_publication_state
        WHERE singleton = 1 AND active_revision = ?
      )
      ON CONFLICT(source_id) DO UPDATE SET
        last_success_at = excluded.last_success_at,
        last_revision = excluded.last_revision,
        last_error = NULL`).bind(sourceId, now, catalogRevision, catalogRevision)),
  ] as BoundStatement[];
}

function buildUnchangedPublicationStatements(input: {
  db: D1Database;
  catalogRevision: string;
  cacheRevision: string;
  sourceIds: readonly string[];
  now: string;
}): BoundStatement[] {
  const { db, catalogRevision, cacheRevision, sourceIds, now } = input;
  return [
    db.prepare(`UPDATE catalog_revisions
      SET checked_at = ?
      WHERE revision = ? AND publication_state = 'published'
        AND EXISTS (
          SELECT 1 FROM catalog_publication_state
          WHERE singleton = 1 AND active_revision = ?
        )`).bind(now, catalogRevision, catalogRevision),
    db.prepare(`INSERT INTO api_response_publication_state
      (scope, active_revision, updated_at)
      SELECT 'catalog', ?, ?
      WHERE EXISTS (
        SELECT 1 FROM catalog_publication_state
        WHERE singleton = 1 AND active_revision = ?
      )
      ON CONFLICT(scope) DO UPDATE SET
        active_revision = excluded.active_revision,
        updated_at = excluded.updated_at`).bind(cacheRevision, now, catalogRevision),
    ...sourceIds.map((sourceId) => db.prepare(`INSERT INTO source_refresh_state
      (source_id, last_success_at, last_revision, last_error)
      SELECT ?, ?, ?, NULL
      WHERE EXISTS (
        SELECT 1 FROM catalog_publication_state
        WHERE singleton = 1 AND active_revision = ?
      )
      ON CONFLICT(source_id) DO UPDATE SET
        last_success_at = excluded.last_success_at,
        last_revision = excluded.last_revision,
        last_error = NULL`).bind(sourceId, now, catalogRevision, catalogRevision)),
  ] as BoundStatement[];
}

function cycleUpdateStatement(db: D1Database, cycle: IngestionCycle, completedAt: string | null): unknown {
  return db.prepare(`UPDATE ingestion_cycles SET
    state = ?, phase = ?, cursor = ?, attempt = ?, frozen_catalog_revision = ?,
    manifest_key = ?, updated_at = ?, completed_at = ?, next_retry_at = ?,
    final_revision = ?, error_code = ?, error_source_id = ?, error_artifact_id = ?
    WHERE scope = 'catalog' AND cycle_id = ?`).bind(
    cycle.state,
    cycle.phase,
    cycle.cursor,
    cycle.attempt,
    cycle.frozenCatalogRevision,
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

async function persistStep(input: {
  env: CatalogCycleEnvironment;
  previous: IngestionCycle;
  next: IngestionCycle;
  status: 'completed' | 'retry_wait' | 'failed' | 'skipped';
  stepAttempt: number;
  outputCount: number;
  errorCode?: string | null;
  completedAt?: string | null;
}): Promise<void> {
  const { env, previous, next, status, stepAttempt, outputCount } = input;
  await env.CATALOG_DB.batch([
    env.CATALOG_DB.prepare(`INSERT INTO ingestion_cycle_steps
      (scope, cycle_id, phase, cursor, status, attempt, started_at,
       completed_at, output_count, error_code)
      VALUES ('catalog', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope, cycle_id, phase, cursor) DO UPDATE SET
        status = excluded.status,
        attempt = excluded.attempt,
        completed_at = excluded.completed_at,
        output_count = excluded.output_count,
        error_code = excluded.error_code`).bind(
      previous.cycleId,
      previous.phase,
      previous.cursor,
      status,
      Math.max(1, Math.min(3, stepAttempt)),
      previous.updatedAt,
      next.updatedAt,
      outputCount,
      input.errorCode ?? null,
    ),
    cycleUpdateStatement(env.CATALOG_DB, next, input.completedAt ?? null),
  ]);
}

function advance(
  cycle: IngestionCycle,
  nowMs: number,
  outputCount: number,
  state: IngestionCycleState = 'running',
): CatalogCycleStepResult {
  const cursor = cycle.cursor + 1;
  if (cursor >= CATALOG_CYCLE_STEPS.length) {
    return { kind: 'terminal', cycle, status: 'published' };
  }
  const next = copyCycle(cycle, {
    state,
    phase: CATALOG_CYCLE_STEPS[cursor],
    cursor,
    attempt: 0,
    updatedAt: iso(nowMs),
    nextRetryAt: null,
    errorCode: null,
    errorSourceId: null,
    errorArtifactId: null,
  });
  return { kind: 'advanced', cycle: next, alarmAt: nowMs + CATALOG_STEP_DELAY_MS, outputCount };
}

async function completedStepResult(input: CatalogCycleStepInput): Promise<CatalogCycleStepResult | null> {
  const rows = await queryRows<{ status: string }>(input.env.CATALOG_DB, `SELECT status
    FROM ingestion_cycle_steps
    WHERE scope = 'catalog' AND cycle_id = ? AND phase = ? AND cursor = ?`,
  input.cycle.cycleId, input.cycle.phase, input.cycle.cursor);
  if (!['completed', 'skipped'].includes(rows[0]?.status ?? '')) return null;
  const persisted = await queryRows<Record<string, unknown>>(input.env.CATALOG_DB, `SELECT *
    FROM ingestion_cycles WHERE scope = 'catalog' AND cycle_id = ?`, input.cycle.cycleId);
  if (persisted.length === 0) throw new Error('persisted catalog cycle missing');
  const row = persisted[0];
  const cycle: IngestionCycle = {
    schemaVersion: 1,
    scope: 'catalog',
    cycleId: String(row.cycle_id),
    cadenceKey: String(row.cadence_key),
    state: row.state as IngestionCycleState,
    phase: String(row.phase),
    cursor: Number(row.cursor),
    attempt: Number(row.attempt),
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at),
    expiresAt: String(row.expires_at),
    nextRetryAt: row.next_retry_at === null ? null : String(row.next_retry_at),
    frozenCatalogRevision: row.frozen_catalog_revision === null ? null : String(row.frozen_catalog_revision),
    frozenBenchmarkRevision: row.frozen_benchmark_revision === null ? null : String(row.frozen_benchmark_revision),
    manifestKey: row.manifest_key === null ? null : String(row.manifest_key),
    finalRevision: row.final_revision === null ? null : String(row.final_revision),
    errorCode: row.error_code === null ? null : String(row.error_code),
    errorSourceId: row.error_source_id === null ? null : String(row.error_source_id),
    errorArtifactId: row.error_artifact_id === null ? null : String(row.error_artifact_id),
  };
  if (cycle.state === 'failed') return { kind: 'terminal', cycle, status: 'failed' };
  if (cycle.state === 'expired') return { kind: 'terminal', cycle, status: 'expired' };
  if (cycle.state === 'published' && cycle.phase !== 'receipt') {
    return { kind: 'terminal', cycle, status: 'published' };
  }
  return {
    kind: 'advanced',
    cycle,
    alarmAt: (input.nowMs ?? Date.now()) + CATALOG_STEP_DELAY_MS,
    outputCount: 0,
  };
}

function sanitizedErrorCode(error: unknown): string {
  if (error instanceof Error && /allowlisted/i.test(error.message)) return 'source_not_allowlisted';
  if (error instanceof Error && /exceeds .* byte limit/i.test(error.message)) return 'payload_too_large';
  if (error instanceof Error && /valid (JSON|UTF-8)|payload|pricing tables|model/i.test(error.message)) return 'payload_invalid';
  if (error instanceof Error && /candidate artifact/i.test(error.message)) return 'candidate_invalid';
  return 'step_failed';
}

async function retrievalFailure(input: {
  stepInput: CatalogCycleStepInput;
  sourceId: string;
  error: unknown;
  response?: Response;
}): Promise<CatalogCycleStepResult> {
  const { stepInput, sourceId, response } = input;
  const nowMs = stepInput.nowMs ?? Date.now();
  const consumedAttempt = stepInput.cycle.attempt + 1;
  const code = response?.status === 429
    ? 'rate_limited'
    : response
      ? `upstream_http_${response.status}`
      : sanitizedErrorCode(input.error);
  if (nowMs >= Date.parse(stepInput.cycle.expiresAt)) {
    const next = copyCycle(stepInput.cycle, {
      state: 'expired',
      attempt: Math.min(3, consumedAttempt),
      updatedAt: iso(nowMs),
      nextRetryAt: null,
      errorCode: 'cycle_expired',
      errorSourceId: sourceId,
    });
    await persistStep({
      env: stepInput.env,
      previous: stepInput.cycle,
      next,
      status: 'failed',
      stepAttempt: consumedAttempt,
      outputCount: 0,
      errorCode: 'cycle_expired',
      completedAt: next.updatedAt,
    });
    return { kind: 'terminal', cycle: next, status: 'expired' };
  }
  if (consumedAttempt >= 3) {
    const next = copyCycle(stepInput.cycle, {
      state: 'failed',
      attempt: 3,
      updatedAt: iso(nowMs),
      nextRetryAt: null,
      errorCode: code,
      errorSourceId: sourceId,
    });
    await persistStep({
      env: stepInput.env,
      previous: stepInput.cycle,
      next,
      status: 'failed',
      stepAttempt: 3,
      outputCount: 0,
      errorCode: code,
      completedAt: next.updatedAt,
    });
    return { kind: 'terminal', cycle: next, status: 'failed' };
  }
  const alarmAt = nextRetryAlarmAt({
    attempt: consumedAttempt,
    nowMs,
    providerRetryAtMs: response ? providerRetryAt(response.headers, nowMs) : null,
    jitterMs: stepInput.jitterMs ?? Math.floor(Math.random() * 15_001),
  });
  const next = copyCycle(stepInput.cycle, {
    state: 'retry_wait',
    attempt: consumedAttempt,
    updatedAt: iso(nowMs),
    nextRetryAt: iso(alarmAt),
    errorCode: code,
    errorSourceId: sourceId,
  });
  await persistStep({
    env: stepInput.env,
    previous: stepInput.cycle,
    next,
    status: 'retry_wait',
    stepAttempt: consumedAttempt,
    outputCount: 0,
    errorCode: code,
  });
  return { kind: 'retry', cycle: next, alarmAt, errorCode: code };
}

async function storeArtifact(input: {
  stepInput: CatalogCycleStepInput;
  manifest: CatalogCycleManifest;
  artifactId: string;
  bytes: Uint8Array;
  etag: string | null;
  lastModified: string | null;
  originalContentHash?: string | null;
}): Promise<{ manifest: CatalogCycleManifest; artifact: CatalogArtifact }> {
  const contentHash = `sha256:${await sha256(input.bytes)}`;
  const attempt = input.stepInput.cycle.attempt + 1;
  const key = `catalog-candidates/${input.stepInput.cycle.cycleId}/${input.artifactId}/attempt-${attempt}-${contentHash.slice(7, 23)}.json`;
  const customMetadata: Record<string, string> = { content_hash: contentHash };
  if (input.etag) customMetadata.etag = input.etag;
  if (input.lastModified) customMetadata.last_modified = input.lastModified;
  if (input.originalContentHash) customMetadata.original_content_hash = input.originalContentHash;
  await input.stepInput.env.SOURCE_SNAPSHOTS.put(key, input.bytes, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata,
  });
  const artifact: CatalogArtifact = {
    key,
    byteLength: input.bytes.byteLength,
    contentHash,
    etag: input.etag,
    lastModified: input.lastModified,
    unchanged: false,
  };
  const manifest = {
    ...input.manifest,
    artifacts: { ...input.manifest.artifacts, [input.artifactId]: artifact },
  };
  await writeManifest(input.stepInput.env.SOURCE_SNAPSHOTS, input.stepInput.cycle.manifestKey!, manifest);
  return { manifest, artifact };
}

async function markUnchanged(
  input: CatalogCycleStepInput,
  manifest: CatalogCycleManifest,
  artifactId: string,
  response: Response,
): Promise<CatalogArtifact> {
  const prior = manifest.validators[artifactId];
  if (!prior?.priorSnapshotKey) throw new Error(`304 without prior artifact: ${artifactId}`);
  const artifact: CatalogArtifact = {
    key: prior.priorSnapshotKey,
    byteLength: 0,
    contentHash: 'unchanged',
    etag: response.headers.get('etag') ?? prior.etag,
    lastModified: response.headers.get('last-modified') ?? prior.lastModified,
    unchanged: true,
  };
  const next = { ...manifest, artifacts: { ...manifest.artifacts, [artifactId]: artifact } };
  await writeManifest(input.env.SOURCE_SNAPSHOTS, input.cycle.manifestKey!, next);
  return artifact;
}

async function acquireStep(input: CatalogCycleStepInput, nowMs: number): Promise<CatalogCycleStepResult> {
  const baseline = await readPublishedCatalog(input.env.CATALOG_DB as Parameters<typeof readPublishedCatalog>[0]);
  const frozenCatalogRevision = baseline?.revision ?? null;
  const baselineKey = `catalog-candidates/${input.cycle.cycleId}/baseline.json`;
  await input.env.SOURCE_SNAPSHOTS.put(
    baselineKey,
    new TextEncoder().encode(JSON.stringify(baseline)),
    { httpMetadata: { contentType: 'application/json' } },
  );
  const validators: Record<string, CatalogSourceValidator> = {};
  const metadataBySource: Record<string, Record<string, string>> = {};
  for (const source of baseline?.provenance ?? []) {
    if (!source.snapshotKey) continue;
    const metadata = await input.env.SOURCE_SNAPSHOTS.head?.(source.snapshotKey);
    metadataBySource[source.id] = metadata?.customMetadata ?? {};
    validators[source.id] = {
      etag: metadata?.customMetadata?.etag ?? null,
      lastModified: metadata?.customMetadata?.last_modified ?? null,
      priorSnapshotKey: source.snapshotKey,
    };
  }
  const openCodePrior = validators['opencode-zen'];
  if (openCodePrior) {
    const metadata = metadataBySource['opencode-zen'] ?? {};
    validators['opencode-models'] = {
      etag: metadata.models_etag ?? openCodePrior.etag,
      lastModified: metadata.models_last_modified ?? openCodePrior.lastModified,
      priorSnapshotKey: openCodePrior.priorSnapshotKey,
    };
    validators['opencode-pricing'] = {
      etag: metadata.pricing_etag ?? openCodePrior.etag,
      lastModified: metadata.pricing_last_modified ?? openCodePrior.lastModified,
      priorSnapshotKey: openCodePrior.priorSnapshotKey,
    };
  }
  const manifest: CatalogCycleManifest = {
    schemaVersion: 1,
    cycleId: input.cycle.cycleId,
    cadenceKey: input.cycle.cadenceKey,
    observedAt: iso(nowMs),
    baselineKey,
    frozenCatalogRevision,
    validators,
    artifacts: {},
  };
  await writeManifest(input.env.SOURCE_SNAPSHOTS, input.cycle.manifestKey!, manifest);
  const result = advance(copyCycle(input.cycle, { frozenCatalogRevision }), nowMs, baseline ? 1 : 0);
  await persistStep({
    env: input.env,
    previous: input.cycle,
    next: result.cycle,
    status: 'completed',
    stepAttempt: 1,
    outputCount: baseline ? 1 : 0,
  });
  return result;
}

async function retrievalStep(input: CatalogCycleStepInput, nowMs: number): Promise<CatalogCycleStepResult> {
  const manifest = await readManifest(input);
  const fetchImpl = input.fetchImpl ?? ((request, init) => globalThis.fetch(request, init));
  const step = input.cycle.phase as CatalogCycleStep;
  const sourceId = step === 'retrieve-openrouter' ? 'openrouter-models' : 'opencode-zen';
  if (!sourceAllowed(input.env, sourceId)) {
    return retrievalFailure({ stepInput: input, sourceId, error: new Error(`${sourceId} not allowlisted`) });
  }
  const artifactId = step === 'retrieve-openrouter'
    ? 'openrouter-models'
    : step === 'retrieve-opencode-models'
      ? 'opencode-models'
      : 'opencode-pricing';
  const url = step === 'retrieve-openrouter'
    ? OPENROUTER_URL
    : step === 'retrieve-opencode-models'
      ? OPENCODE_MODELS_URL
      : OPENCODE_PRICING_URL;
  const completedArtifact = manifest.artifacts[artifactId];
  if (completedArtifact) {
    const result = advance(input.cycle, nowMs, completedArtifact.byteLength);
    await persistStep({
      env: input.env,
      previous: input.cycle,
      next: result.cycle,
      status: completedArtifact.unchanged ? 'skipped' : 'completed',
      stepAttempt: Math.max(1, input.cycle.attempt + 1),
      outputCount: completedArtifact.byteLength,
    });
    return result;
  }
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: conditionalHeaders(manifest.validators[artifactId]) });
  } catch (error) {
    return retrievalFailure({ stepInput: input, sourceId, error });
  }
  if (response.status === 304) {
    try {
      await markUnchanged(input, manifest, artifactId, response);
      const result = advance(input.cycle, nowMs, 0);
      await persistStep({
        env: input.env,
        previous: input.cycle,
        next: result.cycle,
        status: 'skipped',
        stepAttempt: input.cycle.attempt + 1,
        outputCount: 0,
      });
      return result;
    } catch (error) {
      return retrievalFailure({ stepInput: input, sourceId, error, response });
    }
  }
  if (!response.ok) {
    return retrievalFailure({ stepInput: input, sourceId, error: new Error(`HTTP ${response.status}`), response });
  }
  try {
    let bytes: Uint8Array;
    let etag: string | null;
    let lastModified: string | null;
    let originalContentHash: string | null = null;
    let outputCount = 1;
    if (step === 'retrieve-openrouter') {
      const prepared = await prepareOpenRouterSource(response, manifest.observedAt);
      bytes = prepared.projectedBytes;
      etag = prepared.etag;
      lastModified = prepared.lastModified;
      originalContentHash = prepared.originalContentHash;
      outputCount = prepared.parsed.modelOffers.length;
    } else if (step === 'retrieve-opencode-models') {
      const prepared = await prepareOpenCodeModels(response);
      bytes = prepared.projectedBytes;
      etag = prepared.etag;
      lastModified = prepared.lastModified;
    } else {
      const prepared = await prepareOpenCodePricing(response);
      bytes = prepared.projectedBytes;
      etag = prepared.etag;
      lastModified = prepared.lastModified;
    }
    await storeArtifact({
      stepInput: input,
      manifest,
      artifactId,
      bytes,
      etag,
      lastModified,
      originalContentHash,
    });
    const result = advance(input.cycle, nowMs, outputCount);
    await persistStep({
      env: input.env,
      previous: input.cycle,
      next: result.cycle,
      status: 'completed',
      stepAttempt: input.cycle.attempt + 1,
      outputCount,
    });
    return result;
  } catch (error) {
    return retrievalFailure({ stepInput: input, sourceId, error, response });
  }
}

function rotatingManualProvider(cadenceKey: string): string {
  const day = Math.floor(Date.parse(`${cadenceKey}T00:00:00.000Z`) / 86_400_000);
  return MANUAL_SUBSCRIPTION_PROVIDER_IDS[day % MANUAL_SUBSCRIPTION_PROVIDER_IDS.length];
}

async function manualStep(input: CatalogCycleStepInput, nowMs: number): Promise<CatalogCycleStepResult> {
  const manifest = await readManifest(input);
  const completedArtifact = manifest.artifacts.manual;
  if (completedArtifact) {
    const result = advance(input.cycle, nowMs, completedArtifact.byteLength);
    await persistStep({
      env: input.env,
      previous: input.cycle,
      next: result.cycle,
      status: 'completed',
      stepAttempt: 1,
      outputCount: completedArtifact.byteLength,
    });
    return result;
  }
  const providerId = rotatingManualProvider(input.cycle.cadenceKey);
  const sources = buildManualSubscriptionSources(providerId, manifest.observedAt);
  const bytes = new TextEncoder().encode(JSON.stringify(sources));
  await storeArtifact({
    stepInput: input,
    manifest,
    artifactId: 'manual',
    bytes,
    etag: null,
    lastModified: null,
  });
  const result = advance(input.cycle, nowMs, sources.length);
  await persistStep({
    env: input.env,
    previous: input.cycle,
    next: result.cycle,
    status: 'completed',
    stepAttempt: 1,
    outputCount: sources.length,
  });
  return result;
}

function replaceSources(
  baseline: CatalogResponse,
  replacements: readonly ParsedSource[],
  observedAt: string,
): CatalogResponse {
  const sourceIds = new Set(replacements.map((source) => source.source.id));
  return {
    ...baseline,
    freshness: { status: 'fresh', checkedAt: observedAt },
    provenance: [
      ...baseline.provenance.filter((source) => !sourceIds.has(source.id)),
      ...replacements.map((source) => source.source),
    ],
    plans: [
      ...baseline.plans.filter((plan) => !sourceIds.has(plan.sourceId)),
      ...replacements.flatMap((source) => source.plans),
    ],
    modelOffers: [
      ...baseline.modelOffers.filter((offer) => !sourceIds.has(offer.sourceId)),
      ...replacements.flatMap((source) => source.modelOffers),
    ],
  };
}

async function stageStep(input: CatalogCycleStepInput, nowMs: number): Promise<CatalogCycleStepResult> {
  const manifest = await readManifest(input);
  const baseline = await readR2Json<CatalogResponse | null>(input.env.SOURCE_SNAPSHOTS, manifest.baselineKey);
  const current = await readPublishedCatalog(input.env.CATALOG_DB as Parameters<typeof readPublishedCatalog>[0]);
  if ((current?.revision ?? null) !== manifest.frozenCatalogRevision) {
    throw new Error('frozen catalog revision changed before stage');
  }
  const empty: CatalogResponse = {
    revision: 'catalog-empty',
    publishedAt: manifest.observedAt,
    freshness: { status: 'fresh', checkedAt: manifest.observedAt },
    provenance: [],
    plans: [],
    modelOffers: [],
  };
  let candidate = baseline ?? empty;
  const replacements: ParsedSource[] = [];
  const snapshotKeys: Record<string, string> = {};
  const openRouter = manifest.artifacts['openrouter-models'];
  if (!openRouter) throw new Error('OpenRouter candidate missing');
  if (!openRouter.unchanged) {
    const payload = await readR2Json<unknown>(input.env.SOURCE_SNAPSHOTS, openRouter.key);
    const source = parseOpenRouterModels(payload, manifest.observedAt);
    source.source.snapshotKey = openRouter.key;
    source.source.contentHash = openRouter.contentHash;
    replacements.push(source);
    snapshotKeys[source.source.id] = openRouter.key;
  }

  const modelsArtifact = manifest.artifacts['opencode-models'];
  const pricingArtifact = manifest.artifacts['opencode-pricing'];
  if (!modelsArtifact || !pricingArtifact) throw new Error('OpenCode candidate missing');
  if (!modelsArtifact.unchanged || !pricingArtifact.unchanged) {
    let modelsPayload: unknown;
    let pricingHtml: string;
    if (modelsArtifact.unchanged || pricingArtifact.unchanged) {
      const priorKey = manifest.validators['opencode-zen']?.priorSnapshotKey;
      if (!priorKey) throw new Error('OpenCode prior combined candidate missing');
      const prior = await readR2Json<{ models: unknown; pricingHtml: string }>(input.env.SOURCE_SNAPSHOTS, priorKey);
      modelsPayload = modelsArtifact.unchanged
        ? prior.models
        : await readR2Json<unknown>(input.env.SOURCE_SNAPSHOTS, modelsArtifact.key);
      pricingHtml = pricingArtifact.unchanged
        ? prior.pricingHtml
        : new TextDecoder('utf-8', { fatal: true }).decode(await readR2Bytes(input.env.SOURCE_SNAPSHOTS, pricingArtifact.key));
    } else {
      modelsPayload = await readR2Json<unknown>(input.env.SOURCE_SNAPSHOTS, modelsArtifact.key);
      pricingHtml = new TextDecoder('utf-8', { fatal: true }).decode(await readR2Bytes(input.env.SOURCE_SNAPSHOTS, pricingArtifact.key));
    }
    const combined = combineOpenCodeSource(
      { payload: modelsPayload, projectedBytes: new TextEncoder().encode(JSON.stringify(modelsPayload)), etag: modelsArtifact.etag, lastModified: modelsArtifact.lastModified },
      { pricingHtml, projectedBytes: new TextEncoder().encode(pricingHtml), etag: pricingArtifact.etag, lastModified: pricingArtifact.lastModified },
      manifest.observedAt,
    );
    const combinedHash = `sha256:${await sha256(combined.projectedBytes)}`;
    const combinedKey = `catalog-candidates/${input.cycle.cycleId}/opencode-zen/${combinedHash.slice(7, 23)}.json`;
    await input.env.SOURCE_SNAPSHOTS.put(combinedKey, combined.projectedBytes, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        content_hash: combinedHash,
        ...(modelsArtifact.etag ? { models_etag: modelsArtifact.etag } : {}),
        ...(modelsArtifact.lastModified ? { models_last_modified: modelsArtifact.lastModified } : {}),
        ...(pricingArtifact.etag ? { pricing_etag: pricingArtifact.etag } : {}),
        ...(pricingArtifact.lastModified ? { pricing_last_modified: pricingArtifact.lastModified } : {}),
      },
    });
    combined.parsed.source.snapshotKey = combinedKey;
    combined.parsed.source.contentHash = combinedHash;
    replacements.push(combined.parsed);
    snapshotKeys[combined.parsed.source.id] = combinedKey;
  }

  const manualArtifact = manifest.artifacts.manual;
  if (!manualArtifact) throw new Error('manual candidate missing');
  const manualSources = await readR2Json<ParsedSource[]>(input.env.SOURCE_SNAPSHOTS, manualArtifact.key);
  replacements.push(...manualSources);
  for (const source of manualSources) snapshotKeys[source.source.id] = manualArtifact.key;
  candidate = replaceSources(candidate, replacements, manifest.observedAt);
  const contentHash = await sha256(new TextEncoder().encode(canonicalCatalogContent(candidate)));
  const baselineHash = baseline
    ? await sha256(new TextEncoder().encode(canonicalCatalogContent(baseline)))
    : null;
  const changed = contentHash !== baselineHash;
  const catalogRevision = changed
    ? `catalog_${contentHash.slice(0, 24)}_${input.cycle.cycleId.slice(0, 8)}`
    : manifest.frozenCatalogRevision;
  if (!catalogRevision) throw new Error('cold catalog candidate cannot be unchanged');
  candidate = validateCatalogResponse({
    ...candidate,
    revision: catalogRevision,
    publishedAt: changed ? manifest.observedAt : baseline!.publishedAt,
    freshness: { status: 'fresh', checkedAt: manifest.observedAt },
  });
  const cacheRevision = catalogCandidateCacheRevision(catalogRevision, input.cycle.cycleId);
  const statements = changed
    ? buildCatalogCandidateStatements({
      db: input.env.CATALOG_DB,
      catalog: candidate,
      cycleId: input.cycle.cycleId,
      snapshotKeys,
      createdAt: manifest.observedAt,
    })
    : cacheCandidateStatements({
      db: input.env.CATALOG_DB,
      catalog: candidate,
      cacheRevision,
      createdAt: manifest.observedAt,
    });
  await input.env.CATALOG_DB.batch(statements);
  const response = mergeManualSubscriptionPlans(candidate);
  const cacheVariantCount = catalogApiCacheProjections(response).length * 2;
  const nextManifest: CatalogCycleManifest = {
    ...manifest,
    final: {
      catalogRevision,
      cacheRevision,
      changed,
      sourceCount: candidate.provenance.length,
      sourceIds: [...new Set([
        'openrouter-models',
        'opencode-zen',
        ...manualSources.map((source) => source.source.id),
      ])],
      planCount: candidate.plans.length,
      modelCount: candidate.modelOffers.length,
      cacheVariantCount,
    },
  };
  await writeManifest(input.env.SOURCE_SNAPSHOTS, input.cycle.manifestKey!, nextManifest);
  const result = advance(copyCycle(input.cycle, { finalRevision: catalogRevision }), nowMs, candidate.modelOffers.length);
  await persistStep({
    env: input.env,
    previous: input.cycle,
    next: result.cycle,
    status: 'completed',
    stepAttempt: 1,
    outputCount: candidate.provenance.length + candidate.plans.length + candidate.modelOffers.length,
  });
  return result;
}

async function validateStep(input: CatalogCycleStepInput, nowMs: number): Promise<CatalogCycleStepResult> {
  const manifest = await readManifest(input);
  if (!manifest.final) throw new Error('catalog final manifest missing');
  const final = manifest.final;
  const revisionCount = final.changed
    ? Number((await queryRows<{ count: number }>(input.env.CATALOG_DB,
      `SELECT COUNT(*) AS count FROM catalog_revisions WHERE revision = ? AND publication_state = 'pending'`,
    final.catalogRevision))[0]?.count ?? 0)
    : 1;
  const cacheRows = await queryRows<{ count: number }>(input.env.CATALOG_DB, `SELECT COUNT(DISTINCT cache_key || ':' || variant) AS count
    FROM api_response_entries WHERE scope = 'catalog' AND revision = ?`, final.cacheRevision);
  if (revisionCount !== 1 || Number(cacheRows[0]?.count ?? 0) !== final.cacheVariantCount) {
    throw new Error('catalog candidate validation failed');
  }
  const result = advance(input.cycle, nowMs, final.cacheVariantCount, 'ready_to_publish');
  await persistStep({
    env: input.env,
    previous: input.cycle,
    next: result.cycle,
    status: 'completed',
    stepAttempt: 1,
    outputCount: final.cacheVariantCount,
  });
  return result;
}

async function publishStep(input: CatalogCycleStepInput, nowMs: number): Promise<CatalogCycleStepResult> {
  const manifest = await readManifest(input);
  if (!manifest.final) throw new Error('catalog final manifest missing');
  const final = manifest.final;
  const now = iso(nowMs);
  const statements = final.changed
    ? buildCatalogPublicationStatements({
      db: input.env.CATALOG_DB,
      catalogRevision: final.catalogRevision,
      cacheRevision: final.cacheRevision,
      frozenCatalogRevision: manifest.frozenCatalogRevision,
      cycleId: input.cycle.cycleId,
      sourceIds: final.sourceIds,
      now,
    })
    : buildUnchangedPublicationStatements({
      db: input.env.CATALOG_DB,
      catalogRevision: final.catalogRevision,
      cacheRevision: final.cacheRevision,
      sourceIds: final.sourceIds,
      now,
    });
  await input.env.CATALOG_DB.batch(statements);
  const pointers = await queryRows<{ catalog_revision: string; cache_revision: string }>(input.env.CATALOG_DB, `SELECT
    catalog.active_revision AS catalog_revision,
    cache.active_revision AS cache_revision
    FROM catalog_publication_state AS catalog
    INNER JOIN api_response_publication_state AS cache ON cache.scope = 'catalog'
    WHERE catalog.singleton = 1`);
  if (pointers[0]?.catalog_revision !== final.catalogRevision
    || pointers[0]?.cache_revision !== final.cacheRevision) {
    throw new Error('catalog publication compare-and-swap lost');
  }
  const result = advance(input.cycle, nowMs, 1, 'published');
  await persistStep({
    env: input.env,
    previous: input.cycle,
    next: result.cycle,
    status: 'completed',
    stepAttempt: 1,
    outputCount: 1,
  });
  return result;
}

async function receiptStep(input: CatalogCycleStepInput, nowMs: number): Promise<CatalogCycleStepResult> {
  const manifest = await readManifest(input);
  if (!manifest.final) throw new Error('catalog final manifest missing');
  const cycle = copyCycle(input.cycle, { updatedAt: iso(nowMs) });
  await input.env.CATALOG_DB.batch([
    input.env.CATALOG_DB.prepare(`INSERT INTO ingestion_cycle_steps
      (scope, cycle_id, phase, cursor, status, attempt, started_at,
       completed_at, output_count, error_code)
      VALUES ('catalog', ?, 'receipt', ?, 'completed', 1, ?, ?, 1, NULL)
      ON CONFLICT(scope, cycle_id, phase, cursor) DO UPDATE SET
        status = 'completed', completed_at = excluded.completed_at,
        output_count = 1, error_code = NULL`).bind(
      cycle.cycleId,
      cycle.cursor,
      cycle.updatedAt,
      cycle.updatedAt,
    ),
    input.env.CATALOG_DB.prepare(`UPDATE ingestion_cycles SET
      state = 'published', updated_at = ?, completed_at = ?, final_revision = ?,
      result_json = ?, next_retry_at = NULL, error_code = NULL,
      error_source_id = NULL, error_artifact_id = NULL
      WHERE scope = 'catalog' AND cycle_id = ?`).bind(
      cycle.updatedAt,
      cycle.updatedAt,
      manifest.final.catalogRevision,
      JSON.stringify({
        status: manifest.final.changed ? 'published' : 'unchanged',
        catalogRevision: manifest.final.catalogRevision,
        cacheRevision: manifest.final.cacheRevision,
        sourceCount: manifest.final.sourceCount,
        planCount: manifest.final.planCount,
        modelCount: manifest.final.modelCount,
      }),
      cycle.cycleId,
    ),
  ]);
  return {
    kind: 'terminal',
    cycle,
    status: manifest.final.changed ? 'published' : 'unchanged',
  };
}

export async function runCatalogCycleStep(input: CatalogCycleStepInput): Promise<CatalogCycleStepResult> {
  const nowMs = input.nowMs ?? Date.now();
  if (nowMs >= Date.parse(input.cycle.expiresAt) && !isTerminalState(input.cycle.state)) {
    const cycle = copyCycle(input.cycle, {
      state: 'expired',
      updatedAt: iso(nowMs),
      nextRetryAt: null,
      errorCode: 'cycle_expired',
    });
    await persistStep({
      env: input.env,
      previous: input.cycle,
      next: cycle,
      status: 'failed',
      stepAttempt: Math.max(1, input.cycle.attempt),
      outputCount: 0,
      errorCode: 'cycle_expired',
      completedAt: cycle.updatedAt,
    });
    return { kind: 'terminal', cycle, status: 'expired' };
  }
  if (input.cycle.state === 'failed') return { kind: 'terminal', cycle: input.cycle, status: 'failed' };
  if (input.cycle.state === 'expired') return { kind: 'terminal', cycle: input.cycle, status: 'expired' };
  if (input.cycle.state === 'published' && input.cycle.phase !== 'receipt') {
    return { kind: 'terminal', cycle: input.cycle, status: 'published' };
  }
  if (input.cycle.state === 'retry_wait') {
    const retryAt = Date.parse(input.cycle.nextRetryAt ?? '');
    if (Number.isFinite(retryAt) && nowMs < retryAt) {
      return { kind: 'retry', cycle: input.cycle, alarmAt: retryAt, errorCode: input.cycle.errorCode ?? 'retry_wait' };
    }
    input = { ...input, cycle: copyCycle(input.cycle, { state: 'running', updatedAt: iso(nowMs), nextRetryAt: null }) };
  }
  const replayed = await completedStepResult(input);
  if (replayed) return replayed;
  const step = input.cycle.phase as CatalogCycleStep;
  try {
    if (step === 'acquire') return acquireStep(input, nowMs);
    if (step.startsWith('retrieve-')) return retrievalStep(input, nowMs);
    if (step === 'prepare-manual') return manualStep(input, nowMs);
    if (step === 'stage') return stageStep(input, nowMs);
    if (step === 'validate') return validateStep(input, nowMs);
    if (step === 'publish') return publishStep(input, nowMs);
    if (step === 'receipt') return receiptStep(input, nowMs);
    throw new Error(`unknown catalog cycle step: ${step}`);
  } catch (error) {
    if (step.startsWith('retrieve-')) {
      return retrievalFailure({
        stepInput: input,
        sourceId: step === 'retrieve-openrouter' ? 'openrouter-models' : 'opencode-zen',
        error,
      });
    }
    const cycle = copyCycle(input.cycle, {
      state: 'failed',
      updatedAt: iso(nowMs),
      nextRetryAt: null,
      errorCode: sanitizedErrorCode(error),
      errorSourceId: step,
    });
    await persistStep({
      env: input.env,
      previous: input.cycle,
      next: cycle,
      status: 'failed',
      stepAttempt: 1,
      outputCount: 0,
      errorCode: cycle.errorCode,
      completedAt: cycle.updatedAt,
    });
    return { kind: 'terminal', cycle, status: 'failed' };
  }
}
