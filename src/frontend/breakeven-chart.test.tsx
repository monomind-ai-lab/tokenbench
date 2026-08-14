import { fireEvent, render, screen } from '@testing-library/react';
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

  it('labels an in-domain crossover and exposes a bounded inspection action without a false edge marker', () => {
    const result = buildBreakevenResult({
      seats: 1, feePerSeat: 20, maxTokensMillions: 300, inputShare: 0.5,
      inputPricePerMillion: 1, outputPricePerMillion: 1, capacityTokens: null,
    });
    if (result.kind !== 'available') throw new Error('Expected an available fee result');
    const onInspect = vi.fn();

    render(<BreakevenChart result={result} onCrossoverInspected={onInspect} />);

    expect(screen.getByText(/crossover annotation: 20\.000000m/i)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect crossover details' }));
    expect(onInspect).toHaveBeenCalledTimes(1);
  });
});
