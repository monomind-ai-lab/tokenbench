import { describe, expect, it } from 'vitest';
import { createLeaderboardPriceDomain, priceBoundsAt } from './leaderboard-price-domain';

describe('leaderboard price domain', () => {
  it('inserts exact shared-link bounds into the published discrete domain', () => {
    expect(createLeaderboardPriceDomain([0.125, 5, 1_000], 3, 900)).toEqual({
      values: [0.125, 3, 5, 900, 1_000],
      publishedMinimum: 0.125,
      publishedMaximum: 1_000,
      minimumIndex: 1,
      maximumIndex: 3,
    });
  });

  it('maps the complete endpoints back to open URL bounds', () => {
    const domain = createLeaderboardPriceDomain([0.125, 5, 1_000], 3, 900)!;

    expect(priceBoundsAt(domain, 0, domain.values.length - 1)).toEqual({
      priceMinimum: null,
      priceMaximum: null,
    });
    expect(priceBoundsAt(domain, 2, 3)).toEqual({
      priceMinimum: 5,
      priceMaximum: 900,
    });
  });

  it('keeps an exact no-match range visible between published prices', () => {
    expect(createLeaderboardPriceDomain([2, 5], 3, 4)).toMatchObject({
      values: [2, 3, 4, 5],
      minimumIndex: 1,
      maximumIndex: 2,
    });
  });

  it('returns null without published prices and preserves a one-price domain', () => {
    expect(createLeaderboardPriceDomain([], null, null)).toBeNull();
    expect(createLeaderboardPriceDomain([2], null, null)).toMatchObject({
      values: [2],
      minimumIndex: 0,
      maximumIndex: 0,
    });
  });
});
