import { describe, expect, it, vi } from 'vitest';
import type { IngestionCycle } from '../../_shared/checkpointed-ingestion';
import {
  CatalogIngestCoordinator,
  createCatalogCycle,
  type CatalogIngestEnv,
} from './coordinator';

interface Statement { sql: string; values: unknown[] }

function storage(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  let alarm: number | null = null;
  return {
    values,
    get alarm() { return alarm; },
    async get<T>(key: string) { return values.get(key) as T | undefined; },
    async put<T>(key: string, value: T) { values.set(key, value); },
    async delete(key: string) { return values.delete(key); },
    async setAlarm(when: number | Date) { alarm = when instanceof Date ? when.getTime() : when; },
    async deleteAlarm() { alarm = null; },
  };
}

function environment() {
  const statements: Statement[] = [];
  const env: CatalogIngestEnv = {
    AUTOMATED_SOURCE_IDS: 'openrouter-models,opencode-zen',
    SOURCE_SNAPSHOTS: {
      put: async () => undefined,
      get: async () => null,
    },
    CATALOG_DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            const statement = { sql, values };
            return {
              ...statement,
              async all() {
                if (sql.includes('catalog_publication_state')) return { results: [] };
                return { results: [] };
              },
            };
          },
        };
      },
      async batch(batch: unknown[]) { statements.push(...batch as Statement[]); },
    },
  };
  return { env, statements };
}

describe('catalog ingest coordinator', () => {
  it('creates UUID-owned 12-hour cycles for one UTC cadence key', () => {
    const cycle = createCatalogCycle(
      Date.parse('2026-08-12T00:20:00.000Z'),
      '550e8400-e29b-41d4-a716-446655440000',
    );

    expect(cycle).toMatchObject({
      scope: 'catalog',
      cycleId: '550e8400-e29b-41d4-a716-446655440000',
      cadenceKey: '2026-08-12',
      phase: 'acquire',
      cursor: 0,
      attempt: 0,
      state: 'running',
      manifestKey: 'catalog-candidates/550e8400-e29b-41d4-a716-446655440000/manifest.json',
      expiresAt: '2026-08-12T12:20:00.000Z',
    });
  });

  it('starts a cadence once, persists its D1 receipt, and schedules the first alarm', async () => {
    const durableStorage = storage();
    const { env, statements } = environment();
    const coordinator = new CatalogIngestCoordinator({ storage: durableStorage } as never, env, {
      randomUUID: () => '550e8400-e29b-41d4-a716-446655440000',
    });

    const first = await coordinator.start({ scheduledTime: Date.parse('2026-08-12T00:20:00.000Z') });
    const second = await coordinator.start({ scheduledTime: Date.parse('2026-08-12T08:20:00.000Z') });

    expect(first.status).toBe('started');
    expect(second.status).toBe('already-running');
    expect(statements.some(({ sql }) => sql.includes('INSERT INTO ingestion_cycles'))).toBe(true);
    expect(durableStorage.alarm).toBe(Date.parse('2026-08-12T00:20:00.000Z'));
  });

  it('returns the persisted cycle after coordinator reconstruction', async () => {
    const cycle = createCatalogCycle(
      Date.parse('2026-08-12T00:20:00.000Z'),
      '550e8400-e29b-41d4-a716-446655440000',
    );
    const durableStorage = storage({ 'catalog-cycle': cycle });
    const { env } = environment();
    const coordinator = new CatalogIngestCoordinator({ storage: durableStorage } as never, env);

    await expect(coordinator.status()).resolves.toEqual(cycle);
  });

  it('does not restart a completed cadence without an explicit force', async () => {
    const running = createCatalogCycle(
      Date.parse('2026-08-12T00:20:00.000Z'),
      '550e8400-e29b-41d4-a716-446655440000',
    );
    const completed: IngestionCycle = {
      ...running,
      state: 'published',
      phase: 'receipt',
      cursor: 8,
    };
    const durableStorage = storage({ 'catalog-cycle': completed });
    const { env, statements } = environment();
    const coordinator = new CatalogIngestCoordinator({ storage: durableStorage } as never, env);

    const result = await coordinator.start({ scheduledTime: Date.parse('2026-08-12T08:20:00.000Z') });

    expect(result.status).toBe('already-completed');
    expect(statements).toEqual([]);
  });

  it('expires a different-cadence active receipt before starting the next day', async () => {
    const prior = createCatalogCycle(
      Date.parse('2026-08-12T00:20:00.000Z'),
      '550e8400-e29b-41d4-a716-446655440000',
    );
    const durableStorage = storage({ 'catalog-cycle': prior });
    const { env, statements } = environment();
    const coordinator = new CatalogIngestCoordinator({ storage: durableStorage } as never, env, {
      randomUUID: () => '11111111-2222-4333-8444-555555555555',
    });

    const result = await coordinator.start({ scheduledTime: Date.parse('2026-08-13T00:20:00.000Z') });

    expect(result.status).toBe('started');
    expect(result.cycle.cadenceKey).toBe('2026-08-13');
    expect(statements[0]).toMatchObject({
      sql: expect.stringContaining('UPDATE ingestion_cycles'),
      values: expect.arrayContaining(['expired', 'cadence_superseded', prior.cycleId]),
    });
    expect(statements[1]?.sql).toContain('INSERT INTO ingestion_cycles');
  });

  it('catches an alarm failure, persists a bounded code, and removes the alarm', async () => {
    const cycle = createCatalogCycle(
      Date.parse('2026-08-12T00:20:00.000Z'),
      '550e8400-e29b-41d4-a716-446655440000',
    );
    const durableStorage = storage({ 'catalog-cycle': cycle });
    const { env, statements } = environment();
    const coordinator = new CatalogIngestCoordinator({ storage: durableStorage } as never, env, {
      runStep: vi.fn(async () => { throw new Error('secret response body'); }),
    });

    await coordinator.alarm();

    const stored = durableStorage.values.get('catalog-cycle') as IngestionCycle;
    expect(stored.state).toBe('failed');
    expect(stored.errorCode).toBe('alarm_failed');
    expect(JSON.stringify(statements)).not.toContain('secret response body');
    expect(durableStorage.alarm).toBeNull();
  });

  it('resumes the persisted cursor after reconstruction and schedules the returned alarm', async () => {
    const initial = createCatalogCycle(
      Date.parse('2026-08-12T00:20:00.000Z'),
      '550e8400-e29b-41d4-a716-446655440000',
    );
    const cycle: IngestionCycle = { ...initial, phase: 'retrieve-opencode-pricing', cursor: 3 };
    const advanced: IngestionCycle = { ...cycle, phase: 'prepare-manual', cursor: 4 };
    const durableStorage = storage({ 'catalog-cycle': cycle });
    const { env } = environment();
    const runStep = vi.fn(async () => ({
      kind: 'advanced' as const,
      cycle: advanced,
      alarmAt: Date.parse('2026-08-12T00:21:00.000Z'),
      outputCount: 1,
    }));
    const coordinator = new CatalogIngestCoordinator({ storage: durableStorage } as never, env, { runStep });

    await coordinator.alarm();

    expect(runStep).toHaveBeenCalledWith(expect.objectContaining({
      cycle: expect.objectContaining({ phase: 'retrieve-opencode-pricing', cursor: 3 }),
    }));
    expect(durableStorage.values.get('catalog-cycle')).toEqual(advanced);
    expect(durableStorage.alarm).toBe(Date.parse('2026-08-12T00:21:00.000Z'));
  });

  it('removes the alarm after a published terminal result', async () => {
    const cycle = createCatalogCycle(
      Date.parse('2026-08-12T00:20:00.000Z'),
      '550e8400-e29b-41d4-a716-446655440000',
    );
    const published: IngestionCycle = { ...cycle, state: 'published', phase: 'receipt', cursor: 8 };
    const durableStorage = storage({ 'catalog-cycle': cycle });
    await durableStorage.setAlarm(Date.parse('2026-08-12T00:20:00.000Z'));
    const { env } = environment();
    const coordinator = new CatalogIngestCoordinator({ storage: durableStorage } as never, env, {
      runStep: async () => ({ kind: 'terminal', cycle: published, status: 'published' }),
    });

    await coordinator.alarm();

    expect(durableStorage.alarm).toBeNull();
    expect(durableStorage.values.get('catalog-cycle')).toEqual(published);
  });

  it('no-ops a replayed terminal alarm without invoking the step runner', async () => {
    const running = createCatalogCycle(
      Date.parse('2026-08-12T00:20:00.000Z'),
      '550e8400-e29b-41d4-a716-446655440000',
    );
    const published: IngestionCycle = { ...running, state: 'published', phase: 'publish', cursor: 7 };
    const durableStorage = storage({ 'catalog-cycle': published });
    await durableStorage.setAlarm(Date.parse('2026-08-12T00:20:00.000Z'));
    const { env } = environment();
    const runStep = vi.fn();
    const coordinator = new CatalogIngestCoordinator({ storage: durableStorage } as never, env, { runStep });

    await coordinator.alarm();

    expect(runStep).not.toHaveBeenCalled();
    expect(durableStorage.alarm).toBeNull();
  });

  it('emits bounded structured logs without payloads or response bodies', async () => {
    const cycle = createCatalogCycle(
      Date.parse('2026-08-12T00:20:00.000Z'),
      '550e8400-e29b-41d4-a716-446655440000',
    );
    const advanced: IngestionCycle = { ...cycle, phase: 'retrieve-openrouter', cursor: 1 };
    const durableStorage = storage({ 'catalog-cycle': cycle });
    const { env } = environment();
    const records: Record<string, unknown>[] = [];
    const coordinator = new CatalogIngestCoordinator({ storage: durableStorage } as never, env, {
      runStep: async () => ({ kind: 'advanced', cycle: advanced, alarmAt: Date.now() + 15_000, outputCount: 1 }),
      log: (record) => records.push(record),
    });

    await coordinator.alarm();

    expect(records).toHaveLength(1);
    expect(Object.keys(records[0]).sort()).toEqual([
      'attempt', 'cadenceKey', 'cursor', 'cycleId', 'elapsedMs', 'event',
      'outputCount', 'phase', 'scope', 'state', 'status',
    ]);
    expect(JSON.stringify(records)).not.toMatch(/payload|response|body|secret/i);
  });
});
