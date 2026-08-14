import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BreakevenChart } from './breakeven-chart';
import { buildBreakevenResult } from './breakeven-state';

vi.mock('./charts/chart-js', () => ({ createTokenBenchChart: vi.fn(() => ({ destroy: vi.fn() })) }));

describe('BreakevenChart', () => {
  it('renders its exact sampled table and out-of-domain finding from the same selector as the chart', () => {
    const result = buildBreakevenResult({
      seats: 10, feePerSeat: 20, maxTokensMillions: 300, inputShare: 0.75,
      inputPricePerMillion: 0.27, outputPricePerMillion: 1.10, capacityTokens: null,
    });
    if (result.kind !== 'available') throw new Error('Expected a fee result');

    render(<BreakevenChart result={result} />);

    expect(screen.getByText(/outside the displayed 0–300M range/i)).toBeVisible();
    const table = screen.getByRole('table', { name: 'Breakeven cost samples' });
    expect(table).toHaveTextContent('300M');
    expect(table).toHaveTextContent('Subscription');
  });
});
