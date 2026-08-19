import { describe, expect, it, vi } from 'vitest';
import type {
  IngestionCycle,
  IngestionScope,
  IngestionStepReceipt,
} from './checkpointed-ingestion';
import {
  runCheckpointedStep,
  type CheckpointStore,
} from './checkpoint-store';

const FIRST_NOW = '2026-08-17T00:18:00.000Z';
const SECOND_NOW = '2026-08-17T00:19:00.000Z';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function cycle(overrides: Partial<IngestionCycle> = {}): IngestionCycle {
  return {
    schemaVersion: 1,
    scope: 'benchmarks',
    cycleId: 'livebench:2026-W34',
    cadenceKey: '2026-08-17T00',
    state: 'running',
    phase: 'discover',
    cursor: 3,
    attempt: 1,
    startedAt: '2026-08-17T00:17:00.000Z',
    updatedAt: '2026-08-17T00:17:30.000Z',
    expiresAt: '2026-08-18T00:17:00.000Z',
    nextRetryAt: null,
    frozenCatalogRevision: 'catalog-r1',
    frozenBenchmarkRevision: 'benchmark-r1',
    manifestKey: null,
    finalRevision: null,
    errorCode: null,
    errorSourceId: null,
    errorArtifactId: null,
    ...overrides,
  };
}

interface MemoryCheckpointStore extends CheckpointStore {
  readonly receipts: readonly IngestionStepReceipt[];
  failWrites(error?: Error): void;
}

function cloneCycle(value: IngestionCycle): IngestionCycle {
  return { ...value };
}

function cloneReceipt(value: IngestionStepReceipt): IngestionStepReceipt {
  return { ...value };
}

export function createMemoryCheckpointStore(): MemoryCheckpointStore {
  const cycles = new Map<string, IngestionCycle>();
  const receipts = new Map<string, IngestionStepReceipt>();
  let writeFailure: Error | null = null;

  const cycleKey = (scope: IngestionScope, cycleId: string): string => `${scope}:${cycleId}`;
  const receiptKey = (receipt: IngestionStepReceipt): string => [
    receipt.scope,
    receipt.cycleId,
    receipt.phase,
    receipt.cursor,
    receipt.attempt,
  ].join(':');

  return {
    async read(scope, cycleId) {
      const storedCycle = cycles.get(cycleKey(scope, cycleId));
      return storedCycle === undefined ? null : cloneCycle(storedCycle);
    },
    async write(nextCycle, receipt) {
      if (writeFailure !== null) throw writeFailure;
      const key = receiptKey(receipt);
      if (receipts.has(key)) throw new Error(`duplicate receipt write: ${key}`);
      receipts.set(key, cloneReceipt(receipt));
      cycles.set(cycleKey(nextCycle.scope, nextCycle.cycleId), cloneCycle(nextCycle));
    },
    get receipts() {
      return [...receipts.values()].map(cloneReceipt);
    },
    failWrites(error = new Error('D1 unavailable')) {
      writeFailure = error;
    },
  };
}

describe('checkpointed step runner', () => {
  it('persists the next cursor before scheduling the next alarm', async () => {
    const events: string[] = [];
    const persistStarted = deferred<void>();
    const persistGate = deferred<void>();
    const persistSettled = deferred<void>();
    const scheduleStarted = deferred<void>();
    const scheduleGate = deferred<void>();
    const scheduleSettled = deferred<void>();
    let persistedCycle: IngestionCycle | undefined;
    let persistedReceipt: IngestionStepReceipt | undefined;
    let scheduleInvoked = false;
    let outerSettled = false;

    const runPromise = runCheckpointedStep({
      cycle: cycle(),
      execute: async () => ({ outputCount: 3, nextPhase: 'normalize', nextCursor: 4 }),
      persist: async (nextCycle, receipt) => {
        events.push('persist-enter');
        persistStarted.resolve(undefined);
        persistedCycle = nextCycle;
        persistedReceipt = receipt;
        await persistGate.promise;
        events.push('persist-exit');
        persistSettled.resolve(undefined);
      },
      schedule: async (timestampMs) => {
        events.push('schedule-enter');
        scheduleInvoked = true;
        scheduleStarted.resolve(undefined);
        expect(timestampMs).toBe(Date.parse(FIRST_NOW) + 15_000);
        await scheduleGate.promise;
        events.push('schedule-exit');
        scheduleSettled.resolve(undefined);
      },
      now: () => FIRST_NOW,
    });
    void runPromise.then(() => { outerSettled = true; });

    await persistStarted.promise;
    expect(events).toEqual(['persist-enter']);
    expect(scheduleInvoked).toBe(false);
    persistGate.resolve(undefined);
    await persistSettled.promise;
    await scheduleStarted.promise;
    expect(events).toEqual(['persist-enter', 'persist-exit', 'schedule-enter']);
    expect(outerSettled).toBe(false);

    scheduleGate.resolve(undefined);
    await scheduleSettled.promise;
    const result = await runPromise;

    expect(outerSettled).toBe(true);
    expect(events).toEqual(['persist-enter', 'persist-exit', 'schedule-enter', 'schedule-exit']);
    expect(result).toMatchObject({
      state: 'running',
      phase: 'normalize',
      cursor: 4,
      updatedAt: FIRST_NOW,
    });
    expect(persistedCycle).toMatchObject({
      state: 'running',
      phase: 'normalize',
      cursor: 4,
      updatedAt: FIRST_NOW,
    });
    expect(persistedReceipt).toEqual({
      scope: 'benchmarks',
      cycleId: 'livebench:2026-W34',
      phase: 'discover',
      cursor: 3,
      status: 'completed',
      attempt: 1,
      startedAt: '2026-08-17T00:17:00.000Z',
      completedAt: FIRST_NOW,
      outputCount: 3,
      errorCode: null,
    });
  });

  it('does not schedule after failed persistence', async () => {
    const execute = vi.fn(async () => ({ outputCount: 1, nextPhase: 'normalize', nextCursor: 1 }));
    const persist = vi.fn(async () => { throw new Error('D1 unavailable'); });
    const schedule = vi.fn(async () => undefined);

    await expect(runCheckpointedStep({
      cycle: cycle(),
      execute,
      persist,
      schedule,
      now: () => FIRST_NOW,
    })).rejects.toThrow('D1 unavailable');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('does not schedule after execution failure', async () => {
    const schedule = vi.fn(async () => undefined);
    const execute = vi.fn(async () => { throw new Error('provider unavailable'); });

    await expect(runCheckpointedStep({
      cycle: cycle(),
      execute,
      persist: async () => undefined,
      schedule,
      now: () => FIRST_NOW,
    })).rejects.toThrow('provider unavailable');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('accepts only a running cycle and validates step values before persistence', async () => {
    const execute = vi.fn(async () => ({ outputCount: 1, nextPhase: 'normalize', nextCursor: 1 }));
    const persist = vi.fn(async () => undefined);
    const schedule = vi.fn(async () => undefined);

    await expect(runCheckpointedStep({
      cycle: cycle({ state: 'idle' }),
      execute,
      persist,
      schedule,
      now: () => FIRST_NOW,
    })).rejects.toThrow(/running cycle/i);
    expect(execute).not.toHaveBeenCalled();

    await expect(runCheckpointedStep({
      cycle: cycle({ phase: ' ' }),
      execute,
      persist,
      schedule,
      now: () => FIRST_NOW,
    })).rejects.toThrow(/phase/i);

    await expect(runCheckpointedStep({
      cycle: cycle({ cursor: -1 }),
      execute,
      persist,
      schedule,
      now: () => FIRST_NOW,
    })).rejects.toThrow(/cursor/i);
  });

  it.each([
    ['an empty next phase', { outputCount: 1, nextPhase: ' ', nextCursor: 4 }],
    ['a negative output count', { outputCount: -1, nextPhase: 'normalize', nextCursor: 4 }],
    ['a fractional next cursor', { outputCount: 1, nextPhase: 'normalize', nextCursor: 4.5 }],
  ])('rejects %s without persisting or scheduling', async (_description, outcome) => {
    const persist = vi.fn(async () => undefined);
    const schedule = vi.fn(async () => undefined);

    await expect(runCheckpointedStep({
      cycle: cycle(),
      execute: async () => outcome,
      persist,
      schedule,
      now: () => FIRST_NOW,
    })).rejects.toThrow();
    expect(persist).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('rejects a non-canonical or unschedulable now value before persistence', async () => {
    const persist = vi.fn(async () => undefined);
    const schedule = vi.fn(async () => undefined);

    await expect(runCheckpointedStep({
      cycle: cycle(),
      execute: async () => ({ outputCount: 1, nextPhase: 'normalize', nextCursor: 4 }),
      persist,
      schedule,
      now: () => '2026-02-30T00:18:00.000Z',
    })).rejects.toThrow(/timestamp/i);
    expect(persist).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('resumes after restart from the stored cursor and rejects duplicate receipt writes', async () => {
    const store = createMemoryCheckpointStore();
    const persist = (nextCycle: IngestionCycle, receipt: IngestionStepReceipt) => store.write(nextCycle, receipt);

    await runCheckpointedStep({
      cycle: cycle(),
      execute: async () => ({ outputCount: 3, nextPhase: 'normalize', nextCursor: 4 }),
      persist,
      schedule: async () => undefined,
      now: () => FIRST_NOW,
    });

    const restartedCycle = await store.read('benchmarks', 'livebench:2026-W34');
    expect(restartedCycle).toMatchObject({ phase: 'normalize', cursor: 4, updatedAt: FIRST_NOW });

    await runCheckpointedStep({
      cycle: restartedCycle as IngestionCycle,
      execute: async () => ({ outputCount: 2, nextPhase: 'publish', nextCursor: 5 }),
      persist,
      schedule: async () => undefined,
      now: () => SECOND_NOW,
    });

    expect(await store.read('benchmarks', 'livebench:2026-W34')).toMatchObject({
      phase: 'publish',
      cursor: 5,
      updatedAt: SECOND_NOW,
    });
    await expect(store.write(
      restartedCycle as IngestionCycle,
      store.receipts[0],
    )).rejects.toThrow(/duplicate receipt/i);
  });

  it('snapshots cycle and receipt values when they are written', async () => {
    const store = createMemoryCheckpointStore();
    const inputCycle = cycle();
    const inputReceipt: IngestionStepReceipt = {
      scope: 'benchmarks',
      cycleId: 'livebench:2026-W34',
      phase: 'discover',
      cursor: 3,
      status: 'completed',
      attempt: 1,
      startedAt: '2026-08-17T00:17:00.000Z',
      completedAt: FIRST_NOW,
      outputCount: 3,
      errorCode: null,
    };

    await store.write(inputCycle, inputReceipt);
    (inputCycle as unknown as { cursor: number; phase: string }).cursor = 99;
    (inputCycle as unknown as { cursor: number; phase: string }).phase = 'mutated';
    (inputReceipt as { cursor: number; outputCount: number }).cursor = 99;
    (inputReceipt as { cursor: number; outputCount: number }).outputCount = 99;

    expect(await store.read('benchmarks', 'livebench:2026-W34')).toMatchObject({
      cursor: 3,
      phase: 'discover',
    });
    expect(store.receipts[0]).toMatchObject({ cursor: 3, outputCount: 3 });
  });

  it('returns a fresh cycle snapshot on every read', async () => {
    const store = createMemoryCheckpointStore();
    const inputCycle = cycle();
    const inputReceipt: IngestionStepReceipt = {
      scope: 'benchmarks',
      cycleId: 'livebench:2026-W34',
      phase: 'discover',
      cursor: 3,
      status: 'completed',
      attempt: 1,
      startedAt: '2026-08-17T00:17:00.000Z',
      completedAt: FIRST_NOW,
      outputCount: 3,
      errorCode: null,
    };
    await store.write(inputCycle, inputReceipt);

    const firstRead = await store.read('benchmarks', 'livebench:2026-W34');
    const mutableRead = firstRead as IngestionCycle;
    (mutableRead as unknown as { cursor: number; phase: string }).cursor = 88;
    (mutableRead as unknown as { cursor: number; phase: string }).phase = 'mutated';

    expect(await store.read('benchmarks', 'livebench:2026-W34')).toMatchObject({
      cursor: 3,
      phase: 'discover',
    });
  });

  it('leaves the stored cycle unchanged when its persistence fails', async () => {
    const store = createMemoryCheckpointStore();
    store.failWrites();
    const schedule = vi.fn(async () => undefined);

    await expect(runCheckpointedStep({
      cycle: cycle(),
      execute: async () => ({ outputCount: 1, nextPhase: 'normalize', nextCursor: 4 }),
      persist: (nextCycle, receipt) => store.write(nextCycle, receipt),
      schedule,
      now: () => FIRST_NOW,
    })).rejects.toThrow('D1 unavailable');
    expect(await store.read('benchmarks', 'livebench:2026-W34')).toBeNull();
    expect(schedule).not.toHaveBeenCalled();
  });
});
