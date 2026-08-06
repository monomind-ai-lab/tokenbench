import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BenchmarkMetric } from '../benchmarks/contracts';
import type { ComparisonMetricRow } from './comparison-contracts';
import { ComparisonRadar, radarAxes } from './comparison-radar';

const UPDATED_AT = '2026-08-06T00:00:00.000Z';

function metric(
  modelKey: string,
  metricKey: string,
  category: string,
  value: number,
  overrides: Partial<BenchmarkMetric> = {},
): BenchmarkMetric {
  return {
    modelKey,
    metricKey,
    category,
    value,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    sourceUpdatedAt: UPDATED_AT,
    sourceModelId: modelKey,
    sourceArtifactId: 'benchlm-metrics',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
    ...overrides,
  };
}

function sharedMetricRows(
  count: number,
  options: { readonly values?: readonly [number, number] } = {},
): readonly ComparisonMetricRow[] {
  const categories = ['coding', 'knowledge', 'multimodal', 'reasoning', 'math'];
  return Array.from({ length: count }, (_, index) => {
    const category = categories[index] ?? `category-${index}`;
    const metricKey = `benchlm:category:${category}`;
    const [modelAValue, modelBValue] = options.values ?? [80 + index, 70 + index];
    return {
      metricKey,
      category,
      unit: 'score',
      sourceId: 'benchlm',
      methodology: 'benchlm_raw_composite',
      modelA: metric('provider:alpha', metricKey, category, modelAValue),
      modelB: metric('provider:beta', metricKey, category, modelBValue),
    };
  });
}

function heterogeneousPriceRow(): ComparisonMetricRow {
  const metricKey = 'openrouter:pricing:input';
  return {
    metricKey,
    category: 'input pricing',
    unit: 'usd_per_million_tokens',
    sourceId: 'openrouter',
    methodology: 'ips',
    modelA: metric('provider:alpha', metricKey, 'input pricing', 1, {
      metricKey,
      category: 'input pricing',
      unit: 'usd_per_million_tokens',
      sourceId: 'openrouter',
      methodology: 'ips',
    }),
    modelB: metric('provider:beta', metricKey, 'input pricing', 2, {
      metricKey,
      category: 'input pricing',
      unit: 'usd_per_million_tokens',
      sourceId: 'openrouter',
      methodology: 'ips',
    }),
  };
}

function compatibleScoreRow({
  metricKey,
  category,
  sourceId,
  methodology,
  sourceArtifactId,
  values,
}: {
  readonly metricKey: string;
  readonly category: string;
  readonly sourceId: 'benchlm' | 'lmarena';
  readonly methodology: 'benchlm_raw_composite' | 'bradley_terry';
  readonly sourceArtifactId: string;
  readonly values: readonly [number, number];
}): ComparisonMetricRow {
  return {
    metricKey,
    category,
    unit: 'score',
    sourceId,
    methodology,
    modelA: metric('provider:alpha', metricKey, category, values[0], { sourceId, methodology, sourceArtifactId }),
    modelB: metric('provider:beta', metricKey, category, values[1], { sourceId, methodology, sourceArtifactId }),
  };
}

describe('radarAxes', () => {
  it('requires four shared same-unit same-methodology metrics', () => {
    expect(radarAxes(sharedMetricRows(3))).toEqual([]);
    expect(radarAxes(sharedMetricRows(4))).toHaveLength(4);
    expect(radarAxes([...sharedMetricRows(4), heterogeneousPriceRow()])).toHaveLength(4);
    expect(radarAxes(sharedMetricRows(4, { values: [145, 230] }))).toHaveLength(4);
  });

  it.each([
    ['metric key', { metricKey: 'benchlm:category:other' }],
    ['source', { sourceId: 'lmarena' as const }],
    ['source artifact', { sourceArtifactId: 'other-source-snapshot' }],
    ['unit', { unit: 'arena_score' as const }],
    ['methodology', { methodology: 'ips' as const }],
    ['ranking eligibility', { rankingEligible: false }],
  ])('rejects a pair with a mismatched %s', (_reason, metricOverride) => {
    const rows = sharedMetricRows(4);
    const first = rows[0]!;
    const incompatibleFirst = {
      ...first,
      modelB: { ...first.modelB!, ...metricOverride },
    };

    expect(radarAxes([incompatibleFirst, ...rows.slice(1)])).toEqual([]);
  });

  it.each([
    ['a missing measurement', 'modelA', null],
    ['a negative measurement', 'modelA', -1],
    ['a non-finite measurement', 'modelB', Number.NaN],
  ] as const)('rejects %s', (_reason, side, value) => {
    const rows = sharedMetricRows(4);
    const first = rows[0]!;
    const incompatibleFirst: ComparisonMetricRow = {
      ...first,
      [side]: value === null ? null : { ...first[side]!, value },
    };

    expect(radarAxes([incompatibleFirst, ...rows.slice(1)])).toEqual([]);
  });

  it('sorts otherwise-tied axes by source identity for deterministic output', () => {
    const sharedKey = 'shared:category:overall';
    const rows = [
      compatibleScoreRow({ metricKey: sharedKey, category: 'overall', sourceId: 'lmarena', methodology: 'bradley_terry', sourceArtifactId: 'lmarena-snapshot', values: [20, 10] }),
      compatibleScoreRow({ metricKey: sharedKey, category: 'overall', sourceId: 'benchlm', methodology: 'benchlm_raw_composite', sourceArtifactId: 'benchlm-snapshot', values: [10, 5] }),
      ...sharedMetricRows(2),
    ];

    expect(radarAxes(rows).map((axis) => axis.modelA)).toEqual([80, 81, 10, 20]);
  });
});

describe('ComparisonRadar', () => {
  it('renders a labelled SVG and equivalent table', () => {
    render(<ComparisonRadar modelAName="Alpha" modelBName="Beta" rows={sharedMetricRows(4)} />);

    expect(screen.getByRole('img', { name: 'Alpha and Beta shared metric radar' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Radar chart data' })).toBeInTheDocument();
  });

  it('provides a text legend for the solid and dashed series', () => {
    render(<ComparisonRadar modelAName="Alpha" modelBName="Beta" rows={sharedMetricRows(4)} />);

    expect(screen.getByRole('list', { name: 'Radar chart series' })).toBeInTheDocument();
    expect(screen.getByText('Alpha: solid line')).toBeVisible();
    expect(screen.getByText('Beta: dashed line')).toBeVisible();
  });

  it('uses each pair maximum for deterministic series geometry and keeps exact values adjacent', () => {
    render(<ComparisonRadar modelAName="Alpha" modelBName="Beta" rows={sharedMetricRows(4, { values: [145, 230] })} />);

    const chart = screen.getByRole('img', { name: 'Alpha and Beta shared metric radar' });
    const series = Array.from(chart.querySelectorAll<SVGPolygonElement>('polygon.comparison-radar-series'));
    const table = screen.getByRole('table', { name: 'Radar chart data' });

    expect(series).toHaveLength(2);
    expect(series[0]).toHaveAttribute('stroke-dasharray', 'none');
    expect(series[1]).toHaveAttribute('stroke-dasharray', '7 4');
    expect(series[0]).toHaveAttribute('points', expect.stringContaining('160.000,89.391'));
    expect(series[1]).toHaveAttribute('points', expect.stringContaining('160.000,48.000'));
    expect(chart.nextElementSibling).toBe(table);
    expect(within(table).getAllByText('145')).toHaveLength(4);
    expect(within(table).getAllByText('230')).toHaveLength(4);
    expect(within(table).getAllByText('score')).toHaveLength(4);
  });

  it('keeps zero-valued compatible axes finite and centered', () => {
    render(<ComparisonRadar modelAName="Alpha" modelBName="Beta" rows={sharedMetricRows(4, { values: [0, 0] })} />);

    const chart = screen.getByRole('img', { name: 'Alpha and Beta shared metric radar' });
    const markers = Array.from(chart.querySelectorAll<SVGCircleElement>('circle.comparison-radar-marker'));

    expect(markers).toHaveLength(8);
    markers.forEach((marker) => {
      expect(marker).toHaveAttribute('cx', '160');
      expect(marker).toHaveAttribute('cy', '160');
    });
  });

  it('aligns rounded markers with the plotted polygon and keeps labels outside it', () => {
    render(<ComparisonRadar modelAName="Alpha" modelBName="Beta" rows={sharedMetricRows(4)} />);

    const chart = screen.getByRole('img', { name: 'Alpha and Beta shared metric radar' });
    const markers = Array.from(chart.querySelectorAll<SVGCircleElement>('circle.comparison-radar-marker-b'));
    const labels = Array.from(chart.querySelectorAll<SVGTextElement>('text.comparison-radar-axis-label'));

    expect(markers[1]).toHaveAttribute('cx', '258.173');
    expect(labels[0]).toHaveAttribute('y', '34');
    expect(labels[1]).toHaveAttribute('x', '286');
    expect(labels[1]).toHaveAttribute('text-anchor', 'end');
  });
});
