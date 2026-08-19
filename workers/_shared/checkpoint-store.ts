import {
  assertCycleTransition,
  type IngestionCycle,
  type IngestionScope,
  type IngestionStepReceipt,
} from './checkpointed-ingestion';

export interface CheckpointStore {
  read(scope: IngestionScope, cycleId: string): Promise<IngestionCycle | null>;
  write(cycle: IngestionCycle, receipt: IngestionStepReceipt): Promise<void>;
}

type StepOutcome = {
  outputCount: number;
  nextPhase: string;
  nextCursor: number;
};

const STEP_DELAY_MS = 15_000;
const CANONICAL_ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function fail(message: string): never {
  throw new Error(message);
}

function requireNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${name} must be a non-empty string`);
}

function requireNonNegativeInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail(`${name} must be a non-negative integer`);
  }
}

function timestampMs(value: unknown, name: string): number {
  if (typeof value !== 'string' || !CANONICAL_ISO_UTC.test(value)) {
    fail(`${name} must be a canonical ISO UTC timestamp`);
  }
  const parsed = Date.parse(value);
  const canonical = Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  if (canonical === null || (value !== canonical && value !== canonical.replace(/\.000Z$/, 'Z'))) {
    fail(`${name} must be a canonical ISO UTC timestamp`);
  }
  return parsed;
}

function requireStepOutcome(value: unknown): StepOutcome {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('step outcome must be an object');
  }
  const outcome = value as Record<string, unknown>;
  requireNonNegativeInteger(outcome.outputCount, 'outputCount');
  requireNonEmptyString(outcome.nextPhase, 'nextPhase');
  requireNonNegativeInteger(outcome.nextCursor, 'nextCursor');
  return {
    outputCount: outcome.outputCount,
    nextPhase: outcome.nextPhase,
    nextCursor: outcome.nextCursor,
  };
}

export async function runCheckpointedStep(input: {
  cycle: IngestionCycle;
  execute: () => Promise<{ outputCount: number; nextPhase: string; nextCursor: number }>;
  persist: (cycle: IngestionCycle, receipt: IngestionStepReceipt) => Promise<void>;
  schedule: (timestampMs: number) => Promise<void>;
  now?: () => string;
}): Promise<IngestionCycle> {
  if (input.cycle.state !== 'running') fail('runCheckpointedStep requires a running cycle');
  requireNonEmptyString(input.cycle.phase, 'cycle.phase');
  requireNonNegativeInteger(input.cycle.cursor, 'cycle.cursor');
  assertCycleTransition(input.cycle.state, input.cycle.state);

  const outcome = requireStepOutcome(await input.execute());
  const completedAt = input.now?.() ?? new Date().toISOString();
  const completedAtMs = timestampMs(completedAt, 'now');
  const scheduleAtMs = completedAtMs + STEP_DELAY_MS;
  if (!Number.isSafeInteger(scheduleAtMs) || !Number.isFinite(new Date(scheduleAtMs).getTime())) {
    fail('now must be schedulable');
  }

  const receipt: IngestionStepReceipt = {
    scope: input.cycle.scope,
    cycleId: input.cycle.cycleId,
    phase: input.cycle.phase,
    cursor: input.cycle.cursor,
    status: 'completed',
    attempt: input.cycle.attempt,
    startedAt: input.cycle.startedAt,
    completedAt,
    outputCount: outcome.outputCount,
    errorCode: null,
  };
  const nextCycle: IngestionCycle = {
    ...input.cycle,
    state: 'running',
    phase: outcome.nextPhase,
    cursor: outcome.nextCursor,
    updatedAt: completedAt,
    nextRetryAt: null,
    errorCode: null,
    errorSourceId: null,
    errorArtifactId: null,
  };

  assertCycleTransition(input.cycle.state, nextCycle.state);
  await input.persist(nextCycle, receipt);
  await input.schedule(scheduleAtMs);
  return nextCycle;
}
