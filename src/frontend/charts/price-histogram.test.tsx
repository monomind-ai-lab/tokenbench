import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PriceHistogram, priceBuckets } from './price-histogram';

describe('priceBuckets', () => {
  it('groups prices into contiguous buckets covering the range', () => {
    const buckets = priceBuckets([0, 1, 2, 3, 10], 5);
    expect(buckets).toHaveLength(5);
    expect(buckets[0]!.from).toBe(0);
    expect(buckets[buckets.length - 1]!.to).toBe(10);
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(5);
  });

  it('returns no buckets for an empty input', () => {
    expect(priceBuckets([], 5)).toEqual([]);
  });

  it('ignores non-finite prices rather than bucketing them at zero', () => {
    const buckets = priceBuckets([1, Number.NaN, 3], 2);
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(2);
  });

  it('keeps a single-value input in one bucket without dividing by zero', () => {
    const buckets = priceBuckets([4, 4, 4], 5);
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(3);
    expect(buckets.every((bucket) => Number.isFinite(bucket.from) && Number.isFinite(bucket.to))).toBe(true);
  });
});

describe('PriceHistogram', () => {
  it('renders server-side SVG with the accessible label', () => {
    const html = renderToString(
      <PriceHistogram buckets={priceBuckets([0, 1, 2, 3, 10], 5)} ariaLabel="Price distribution" />,
    );
    expect(html).toContain('aria-label="Price distribution"');
    expect(html).toContain('<svg');
    expect(html.length).toBeGreaterThan(400);
  });

  it('renders nothing when there are no buckets', () => {
    expect(renderToString(<PriceHistogram buckets={[]} ariaLabel="Price distribution" />)).toBe('');
  });
});
