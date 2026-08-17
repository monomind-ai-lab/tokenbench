import { describe, expect, it } from 'vitest';
import { compareCsv } from './compare-export-actions';

describe('compare CSV export', () => {
  it('emits the displayed semantic matrix rows in their visible order', () => {
    const csv = compareCsv({
      models: [{ name: 'GPT-4o' }, { name: 'DeepSeek V3' }],
      rows: [
        { label: 'Reasoning', values: ['91.0', '83.0'] },
        { label: 'Input / output · $/1M', values: ['$2.50 / $10.00', '$0.27 / $1.10'] },
      ],
    });

    expect(csv.split('\n')).toEqual([
      'Metric,GPT-4o,DeepSeek V3',
      'Reasoning,91.0,83.0',
      'Input / output · $/1M,$2.50 / $10.00,$0.27 / $1.10',
    ]);
  });

  it('quotes cells that would otherwise change the CSV column order', () => {
    expect(compareCsv({
      models: [{ name: 'GPT-4o' }],
      rows: [{ label: 'Conditions', values: ['Hosted, p50'] }],
    })).toContain('Conditions,"Hosted, p50"');
  });
});
