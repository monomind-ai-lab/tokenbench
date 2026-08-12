import { describe, expect, it, vi } from 'vitest';
import {
  inspectIngestionCycle,
  parseInspectIngestionArgs,
  parseWranglerD1Json,
} from './inspect-ingestion-cycle';

describe('inspect-ingestion-cycle', () => {
  it('accepts exactly one supported scope', () => {
    expect(parseInspectIngestionArgs(['--scope', 'catalog'])).toEqual({ scope: 'catalog' });
    expect(parseInspectIngestionArgs(['--scope', 'benchmarks'])).toEqual({ scope: 'benchmarks' });
    expect(() => parseInspectIngestionArgs([])).toThrow('--scope');
    expect(() => parseInspectIngestionArgs(['--scope', 'other'])).toThrow('catalog|benchmarks');
    expect(() => parseInspectIngestionArgs(['--scope', 'catalog', '--remote'])).toThrow('unknown argument');
  });

  it('parses one bounded D1 result row', () => {
    const row = parseWranglerD1Json(JSON.stringify([{
      success: true,
      results: [{
        scope: 'benchmarks',
        cycleId: 'cycle-1',
        cadenceKey: '2026-W33',
        state: 'running',
        phase: 'stage-profiles',
        cursor: 12,
        startedAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-12T00:05:00.000Z',
        activeRevision: 'benchmark_old',
        lastCompletedRevision: 'benchmark_old',
      }],
    }]));
    expect(row).toMatchObject({ scope: 'benchmarks', cursor: 12, activeRevision: 'benchmark_old' });
  });

  it('rejects missing, failed, extra, and corrupt D1 results', () => {
    expect(() => parseWranglerD1Json('[]')).toThrow('missing');
    expect(() => parseWranglerD1Json(JSON.stringify([{ success: false, results: [] }]))).toThrow('failed');
    expect(() => parseWranglerD1Json(JSON.stringify([{ success: true, results: [{}, {}] }]))).toThrow('exactly one');
    expect(() => parseWranglerD1Json(JSON.stringify([{ success: true, results: [{ scope: 'catalog' }] }]))).toThrow('corrupt');
  });

  it('executes one read-only remote D1 query and returns bounded status', async () => {
    const execute = vi.fn(async (_command: string, _args: readonly string[]) => JSON.stringify([{
      success: true,
      results: [{
        scope: 'catalog', cycleId: 'cycle-1', cadenceKey: '2026-08-12', state: 'published',
        phase: 'receipt', cursor: 8, startedAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-12T00:01:00.000Z', activeRevision: 'catalog_new',
        lastCompletedRevision: 'catalog_new',
      }],
    }]));
    const output = await inspectIngestionCycle({ scope: 'catalog' }, execute);
    expect(output.state).toBe('published');
    expect(execute).toHaveBeenCalledOnce();
    const [command, args] = execute.mock.calls[0]!;
    expect(command).toBe('wrangler');
    expect(args).toContain('--remote');
    expect(args.join(' ')).toContain('SELECT');
    expect(args.join(' ')).not.toMatch(/\b(?:DELETE|UPDATE|INSERT|ALTER|DROP)\b/i);
  });
});
