import { describe, expect, it } from 'vitest';
import {
  formatDisplayNumber,
  formatDisplayUsd,
  roundDisplayValue,
} from './display-format';

describe('reader-facing number formatting', () => {
  it('caps requested precision at two decimal places without padding integers', () => {
    expect(formatDisplayNumber(12.34567, { maximumFractionDigits: 6 })).toBe('12.35');
    expect(formatDisplayNumber(12.5)).toBe('12.5');
    expect(formatDisplayNumber(12)).toBe('12');
  });

  it('does not present a positive sub-cent cost as zero', () => {
    expect(formatDisplayUsd(0.004)).toBe('<$0.01');
    expect(formatDisplayUsd(17.567)).toBe('$17.57');
  });

  it('rounds export-bound numeric cells to the same maximum precision', () => {
    expect(roundDisplayValue(0.01449)).toBe(0.01);
    expect(roundDisplayValue(19.999)).toBe(20);
  });
});
