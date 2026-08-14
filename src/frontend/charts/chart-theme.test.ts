import { describe, expect, it } from 'vitest';
import { chartThemeFor } from './chart-theme';

describe('chartThemeFor', () => {
  it('returns the light semantic chart palette', () => {
    expect(chartThemeFor('light')).toEqual({
      text: '#475569',
      grid: '#e2e8f0',
      surface: '#ffffff',
      primary: '#741a66',
    });
  });

  it('returns the dark semantic chart palette', () => {
    expect(chartThemeFor('dark')).toEqual({
      text: '#a8a8a8',
      grid: '#383838',
      surface: '#1d1d1d',
      primary: '#d88ac8',
    });
  });
});
