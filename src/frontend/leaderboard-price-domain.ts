export interface LeaderboardPriceDomain {
  readonly values: readonly number[];
  readonly publishedMinimum: number;
  readonly publishedMaximum: number;
  readonly minimumIndex: number;
  readonly maximumIndex: number;
}

function validBound(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

export function createLeaderboardPriceDomain(
  publishedValues: readonly number[] | null,
  priceMinimum: number | null,
  priceMaximum: number | null,
): LeaderboardPriceDomain | null {
  const published = [...new Set((publishedValues ?? []).filter(validBound))]
    .sort((left, right) => left - right);
  if (published.length === 0) return null;

  const publishedMinimum = published[0]!;
  const publishedMaximum = published[published.length - 1]!;
  const activeMinimum = validBound(priceMinimum) ? priceMinimum : null;
  const activeMaximum = validBound(priceMaximum) ? priceMaximum : null;
  const values = [...new Set([
    ...published,
    ...(activeMinimum === null ? [] : [activeMinimum]),
    ...(activeMaximum === null ? [] : [activeMaximum]),
  ])].sort((left, right) => left - right);
  const minimumIndex = activeMinimum === null ? 0 : values.indexOf(activeMinimum);
  const maximumIndex = activeMaximum === null ? values.length - 1 : values.indexOf(activeMaximum);

  return {
    values,
    publishedMinimum,
    publishedMaximum,
    minimumIndex: minimumIndex <= maximumIndex ? minimumIndex : 0,
    maximumIndex: minimumIndex <= maximumIndex ? maximumIndex : values.length - 1,
  };
}

export function priceBoundsAt(
  domain: LeaderboardPriceDomain,
  minimumIndex: number,
  maximumIndex: number,
): { readonly priceMinimum: number | null; readonly priceMaximum: number | null } {
  const minimum = domain.values[minimumIndex]!;
  const maximum = domain.values[maximumIndex]!;
  return {
    priceMinimum: minimum <= domain.publishedMinimum ? null : minimum,
    priceMaximum: maximum >= domain.publishedMaximum ? null : maximum,
  };
}
