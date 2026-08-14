import { describe, expect, it } from 'vitest';
import { canonicalComparisonPair } from './[pair]';

describe('canonicalComparisonPair', () => {
  it('sorts a reverse-order pair into its one canonical stable-slug path', () => {
    expect(canonicalComparisonPair('zeta', 'alpha')).toEqual({
      canonical: 'alpha-vs-zeta', left: 'alpha', right: 'zeta', redirected: true,
    });
  });
});
