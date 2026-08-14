import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BenchmarkMetric, BenchmarkModel } from '../benchmarks/contracts';
import type { ComparisonMetricRow } from './comparison-contracts';
import { ComparisonRadar, radarAxes } from './comparison-radar';

const UPDATED_AT = '2026-08-06T00:00:00.000Z';

function model(modelKey: string, name: string): BenchmarkModel {
  return {
    modelKey, slug: modelKey.split(':').at(-1) ?? modelKey, name, creator: 'Example provider', sourceType: 'Proprietary', reasoningType: null,
    releaseDate: null, contextWindowTokens: 128_000, evidenceStatus: 'supported', rankingEligible: true, confidenceLower: null, confidenceUpper: null,
    benchmarkCount: 6, sourceId: 'benchlm', sourceModelId: modelKey, sourceArtifactId: 'benchlm-models',
  };
}

const models = [model('provider:alpha', 'Alpha'), model('provider:beta', 'Beta')] as const;

function metric(modelKey: string, metricKey: string, category: string, value: number): BenchmarkMetric {
  return {
    modelKey, metricKey, category, value, rawValue: null, rank: null, lower: null, upper: null, voteCount: null, unit: 'score', sourceId: 'benchlm',
    sourceUpdatedAt: UPDATED_AT, sourceModelId: modelKey, sourceArtifactId: 'benchlm-metrics', rankingEligible: true,
    methodology: 'benchlm_raw_composite', observationCount: null, sessionCount: null,
  };
}

function rows(count = 6): readonly ComparisonMetricRow[] {
  return Array.from({ length: count }, (_, index) => {
    const category = `domain ${index + 1}`;
    const metricKey = `benchlm:category:${category}`;
    return {
      metricKey, category, unit: 'score', sourceId: 'benchlm', methodology: 'benchlm_raw_composite',
      modelA: metric(models[0].modelKey, metricKey, category, 90 - index),
      modelB: metric(models[1].modelKey, metricKey, category, 80 - index),
    };
  });
}

describe('ComparisonRadar', () => {
  it('requires six compatible source-backed axes', () => {
    expect(radarAxes(rows(5), models)).toEqual([]);
    expect(radarAxes(rows(7), models)).toHaveLength(6);
  });

  it('uses one six-axis selector for its Chart.js data and adjacent exact table', () => {
    render(<ComparisonRadar modelAName="Alpha" modelBName="Beta" models={models} rows={rows()} />);

    const figure = screen.getByRole('figure', { name: 'Alpha and Beta shared metric radar' });
    const table = screen.getByRole('table', { name: 'Radar chart data' });
    expect(figure.querySelector('svg')).toBeNull();
    expect(within(table).getAllByRole('rowheader')).toHaveLength(6);
    expect(within(table).getByRole('rowheader', { name: 'Domain 1' }).closest('tr')).toHaveAttribute('data-source-id', 'benchlm');
    expect(figure.nextElementSibling).toBe(table.parentElement);
  });
});
