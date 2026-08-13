import { AxisBottom } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleLinear } from '@visx/scale';
import { Bar } from '@visx/shape';
import { CHART_THEME } from './chart-theme';

export interface PriceBucket {
  readonly from: number;
  readonly to: number;
  readonly count: number;
}

export interface PriceHistogramProps {
  readonly buckets: readonly PriceBucket[];
  readonly ariaLabel: string;
  readonly width?: number;
}

const MARGIN = { top: 12, right: 16, bottom: 44, left: 40 } as const;
const HEIGHT = 220;

/**
 * Groups published prices into contiguous buckets spanning the observed range.
 *
 * Non-finite values are dropped rather than bucketed at zero, which would
 * invent a free route. A single distinct value still yields one usable bucket
 * instead of a zero-width division.
 */
export function priceBuckets(
  prices: readonly number[],
  bucketCount = 12,
): readonly PriceBucket[] {
  const usable = prices.filter((price) => Number.isFinite(price));
  if (usable.length === 0 || bucketCount < 1) return [];
  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const span = max - min;
  const width = span === 0 ? 1 : span / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    from: min + index * width,
    to: index === bucketCount - 1 ? max : min + (index + 1) * width,
    count: 0,
  }));
  for (const price of usable) {
    const rawIndex = span === 0 ? 0 : Math.floor((price - min) / width);
    const index = Math.min(bucketCount - 1, Math.max(0, rawIndex));
    buckets[index]!.count += 1;
  }
  return buckets;
}

/** Shows where the published prices actually cluster, which a sorted table hides. */
export function PriceHistogram({ buckets, ariaLabel, width = 720 }: PriceHistogramProps) {
  if (buckets.length === 0) return null;

  const plotWidth = Math.max(120, width - MARGIN.left - MARGIN.right);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 0);
  const minPrice = buckets[0]!.from;
  const maxPrice = buckets[buckets.length - 1]!.to;
  const x = scaleLinear({
    domain: [minPrice, maxPrice === minPrice ? minPrice + 1 : maxPrice],
    range: [0, plotWidth],
  });
  const y = scaleLinear({ domain: [0, maxCount === 0 ? 1 : maxCount], range: [plotHeight, 0] });
  const barWidth = Math.max(1, plotWidth / buckets.length - 2);

  return <svg
    className="price-histogram"
    viewBox={`0 0 ${width} ${HEIGHT}`}
    width="100%"
    height={HEIGHT}
    role="img"
    aria-label={ariaLabel}
  >
    <Group left={MARGIN.left} top={MARGIN.top}>
      {buckets.map((bucket, index) => {
        const barHeight = plotHeight - y(bucket.count);
        return <Bar
          key={`${bucket.from}-${index}`}
          x={index * (plotWidth / buckets.length)}
          y={y(bucket.count)}
          width={barWidth}
          height={Math.max(0, barHeight)}
          rx={2}
          fill={CHART_THEME.bar}
        >
          <title>{`$${bucket.from.toFixed(2)}–$${bucket.to.toFixed(2)} per 1M: ${bucket.count} models`}</title>
        </Bar>;
      })}
      <AxisBottom
        top={plotHeight}
        scale={x}
        numTicks={5}
        stroke={CHART_THEME.axis}
        tickStroke={CHART_THEME.axis}
        label="USD per 1M tokens"
        tickLabelProps={() => ({ className: 'price-histogram-tick', textAnchor: 'middle', dy: '0.25em' })}
      />
    </Group>
  </svg>;
}
