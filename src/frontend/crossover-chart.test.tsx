import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const configurations = vi.hoisted(() => [] as Array<{ readonly data: { readonly datasets: readonly { readonly label?: string; readonly data?: unknown }[] } }>);

vi.mock('./popular-models/chart-canvas', () => ({
  PopularChartCanvas: ({ ariaLabel, configuration }: { readonly ariaLabel: string; readonly configuration: { readonly data: { readonly datasets: readonly { readonly label?: string; readonly data?: unknown }[] } } }) => {
    configurations.push(configuration);
    return <div role="img" aria-label={ariaLabel} />;
  },
}));

import { CrossoverChart, crossoverChartConfiguration } from './crossover-chart';

const domain = [
  { tokens: 0, monthlySubscriptionUsd: 20, apiUsd: 0 },
  { tokens: 25_000_000, monthlySubscriptionUsd: 20, apiUsd: 120.83 },
] as const;

describe('CrossoverChart', () => {
  it('uses the same crossover domain values as the semantic table', () => {
    const configuration = crossoverChartConfiguration(domain);

    expect(configuration.data.datasets).toEqual([
      expect.objectContaining({ label: 'Monthly subscription', data: [{ x: 0, y: 20 }, { x: 25_000_000, y: 20 }] }),
      expect.objectContaining({ label: 'API usage', data: [{ x: 0, y: 0 }, { x: 25_000_000, y: 120.83 }] }),
    ]);

    render(<CrossoverChart domain={domain} />);
    expect(screen.getByRole('img', { name: 'API usage and Monthly subscription cost across zero to 300 million monthly tokens' })).toBeInTheDocument();
  });
});
