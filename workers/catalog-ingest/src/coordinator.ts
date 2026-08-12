import { DurableObject } from 'cloudflare:workers';
import { catalogCadenceKey, cycleDue } from '../../../src/ingestion/cadence';
import type { IngestionCycle } from '../../_shared/checkpointed-ingestion';
import {
  CATALOG_CYCLE_EXPIRY_MS,
  runCatalogCycleStep,
  type CatalogCycleEnvironment,
  type CatalogCycleStepResult,
} from './catalog-cycle';

export interface CatalogCoordinatorNamespace {
  getByName(name: string): {
    start(input: { scheduledTime: number; force?: boolean }): Promise<StartCycleResult>;
  };
}

export interface CatalogIngestEnv extends CatalogCycleEnvironment {
  readonly INGEST_COORDINATOR?: CatalogCoordinatorNamespace;
}

export type StartCycleResult =
  | { status: 'started'; cycle: IngestionCycle }
  | { status: 'already-running'; cycle: IngestionCycle }
  | { status: 'already-completed'; cycle: IngestionCycle };

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

interface CoordinatorDependencies {
  readonly now: () => number;
  readonly randomUUID: () => string;
  readonly runStep: typeof runCatalogCycleStep;
  readonly log: (record: Record<string, unknown>) => void;
}

const CYCLE_STORAGE_KEY = 'catalog-cycle';

const defaultDependencies: CoordinatorDependencies = {
  now: () => Date.now(),
  randomUUID: () => crypto.randomUUID(),
  runStep: runCatalogCycleStep,
  log: (record) => console.log(JSON.stringify(record)),
};

function isActive(cycle: IngestionCycle): boolean {
  return cycle.state === 'running'
    || cycle.state === 'retry_wait'
    || cycle.state === 'ready_to_publish';
}

function logRecord(
  event: string,
  cycle: IngestionCycle,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
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

export function createCatalogCycle(scheduledTime: number, cycleId: string): IngestionCycle {
  const startedAt = new Date(scheduledTime).toISOString();
  return {
    schemaVersion: 1,
    scope: 'catalog',
    cycleId,
    cadenceKey: catalogCadenceKey(startedAt),
    state: 'running',
    phase: 'acquire',
    cursor: 0,
    attempt: 0,
    startedAt,
    updatedAt: startedAt,
    expiresAt: new Date(scheduledTime + CATALOG_CYCLE_EXPIRY_MS).toISOString(),
    nextRetryAt: null,
    frozenCatalogRevision: null,
    frozenBenchmarkRevision: null,
    manifestKey: `catalog-candidates/${cycleId}/manifest.json`,
    finalRevision: null,
    errorCode: null,
    errorSourceId: null,
    errorArtifactId: null,
  };
}

function insertCycleStatement(env: CatalogIngestEnv, cycle: IngestionCycle): unknown {
  return env.CATALOG_DB.prepare(`INSERT INTO ingestion_cycles
    (scope, cycle_id, cadence_key, state, phase, cursor, attempt,
     frozen_catalog_revision, frozen_benchmark_revision, manifest_key,
     started_at, updated_at, completed_at, expires_at, next_retry_at,
     final_revision, result_json, error_code, error_source_id, error_artifact_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?)`).bind(
    cycle.scope,
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

function updateCycleStatement(env: CatalogIngestEnv, cycle: IngestionCycle, completedAt: string | null): unknown {
  return env.CATALOG_DB.prepare(`UPDATE ingestion_cycles SET
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

function terminal(
  result: CatalogCycleStepResult,
): result is Extract<CatalogCycleStepResult, { kind: 'terminal' }> {
  return result.kind === 'terminal';
}

export class CatalogIngestCoordinator extends DurableObject<CatalogIngestEnv> {
  private readonly coordinatorState: CoordinatorState;
  private readonly coordinatorEnv: CatalogIngestEnv;
  private readonly dependencies: CoordinatorDependencies;

  constructor(
    state: CoordinatorState,
    env: CatalogIngestEnv,
    dependencies: Partial<CoordinatorDependencies> = {},
  ) {
    super(state as never, env);
    this.coordinatorState = state;
    this.coordinatorEnv = env;
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  async start(input: { scheduledTime: number; force?: boolean }): Promise<StartCycleResult> {
    const scheduledTime = Number.isFinite(input.scheduledTime)
      ? input.scheduledTime
      : this.dependencies.now();
    const cadenceKey = catalogCadenceKey(new Date(scheduledTime).toISOString());
    const existing = await this.coordinatorState.storage.get<IngestionCycle>(CYCLE_STORAGE_KEY);
    if (existing?.cadenceKey === cadenceKey && isActive(existing)) {
      this.dependencies.log(logRecord('catalog_cycle_already_running', existing));
      return { status: 'already-running', cycle: existing };
    }
    if (existing?.cadenceKey === cadenceKey && existing.state === 'published' && !input.force) {
      this.dependencies.log(logRecord('catalog_cycle_already_completed', existing));
      return { status: 'already-completed', cycle: existing };
    }
    if (existing?.state === 'published' && !input.force
      && !cycleDue(existing.cadenceKey, cadenceKey)) {
      this.dependencies.log(logRecord('catalog_cycle_already_completed', existing));
      return { status: 'already-completed', cycle: existing };
    }

    const cycle = createCatalogCycle(scheduledTime, this.dependencies.randomUUID());
    await this.coordinatorEnv.CATALOG_DB.batch([insertCycleStatement(this.coordinatorEnv, cycle)]);
    await this.coordinatorState.storage.put(CYCLE_STORAGE_KEY, cycle);
    await this.coordinatorState.storage.setAlarm(scheduledTime);
    this.dependencies.log(logRecord('catalog_cycle_started', cycle));
    return { status: 'started', cycle };
  }

  async status(): Promise<IngestionCycle | null> {
    return await this.coordinatorState.storage.get<IngestionCycle>(CYCLE_STORAGE_KEY) ?? null;
  }

  async alarm(): Promise<void> {
    const cycle = await this.status();
    if (!cycle || (cycle.state === 'published' && cycle.phase !== 'receipt')
      || cycle.state === 'failed' || cycle.state === 'expired') {
      await this.coordinatorState.storage.deleteAlarm();
      return;
    }
    const startedAt = this.dependencies.now();
    try {
      const result = await this.dependencies.runStep({
        cycle,
        env: this.coordinatorEnv,
        nowMs: startedAt,
      });
      await this.coordinatorState.storage.put(CYCLE_STORAGE_KEY, result.cycle);
      this.dependencies.log(logRecord('catalog_cycle_step', result.cycle, {
        status: result.kind === 'terminal' ? result.status : result.kind,
        elapsedMs: Math.max(0, this.dependencies.now() - startedAt),
        ...(result.kind === 'advanced' ? { outputCount: result.outputCount } : {}),
        ...(result.kind === 'retry' ? { errorCode: result.errorCode } : {}),
      }));
      if (terminal(result)) {
        await this.coordinatorState.storage.deleteAlarm();
      } else {
        await this.coordinatorState.storage.setAlarm(result.alarmAt);
      }
    } catch {
      const updatedAt = new Date(this.dependencies.now()).toISOString();
      const failed: IngestionCycle = {
        ...cycle,
        state: 'failed',
        updatedAt,
        nextRetryAt: null,
        errorCode: 'alarm_failed',
        errorSourceId: cycle.phase,
        errorArtifactId: null,
      };
      await this.coordinatorState.storage.put(CYCLE_STORAGE_KEY, failed);
      await this.coordinatorEnv.CATALOG_DB.batch([
        updateCycleStatement(this.coordinatorEnv, failed, updatedAt),
      ]);
      await this.coordinatorState.storage.deleteAlarm();
      this.dependencies.log(logRecord('catalog_cycle_alarm_failed', failed, {
        errorCode: 'alarm_failed',
        elapsedMs: Math.max(0, this.dependencies.now() - startedAt),
      }));
    }
  }
}
