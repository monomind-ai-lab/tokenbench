import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartConfiguration } from 'chart.js';
import { createTokenBenchChart } from './chart-js';
import { TokenBenchChartCanvas } from './chart-canvas';

vi.mock('./chart-js', () => ({
  createTokenBenchChart: vi.fn(),
}));

const configuration: ChartConfiguration<'bar'> = {
  type: 'bar',
  data: {
    labels: ['Alpha'],
    datasets: [{ data: [42] }],
  },
};

describe('TokenBenchChartCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.dataset.theme = 'light';
    vi.mocked(createTokenBenchChart).mockReturnValue({ destroy: vi.fn(), update: vi.fn() } as never);
  });

  afterEach(() => {
    delete document.documentElement.dataset.theme;
    vi.restoreAllMocks();
  });

  it('keeps the written finding and semantic table beside the chart', () => {
    render(<TokenBenchChartCanvas
      title="Scores by model"
      finding="Alpha leads this sample."
      configuration={configuration}
      table={<table><caption>Exact score values</caption><tbody><tr><td>Alpha</td><td>42</td></tr></tbody></table>}
    />);

    expect(screen.getByText('Alpha leads this sample.')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Exact score values' })).toBeInTheDocument();
    expect(screen.getByRole('figure')).toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('destroys the chart before replacement and on unmount', () => {
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    vi.mocked(createTokenBenchChart)
      .mockReturnValueOnce({ destroy: firstDestroy, update: vi.fn() } as never)
      .mockReturnValueOnce({ destroy: secondDestroy, update: vi.fn() } as never);

    const { rerender, unmount } = render(<TokenBenchChartCanvas
      title="Scores"
      finding="Alpha leads."
      configuration={configuration}
    />);
    expect(createTokenBenchChart).toHaveBeenCalledTimes(1);

    rerender(<TokenBenchChartCanvas
      title="Scores"
      finding="Beta leads."
      configuration={{ ...configuration, data: { ...configuration.data, labels: ['Beta'] } }}
    />);
    expect(firstDestroy).toHaveBeenCalledTimes(1);
    expect(createTokenBenchChart).toHaveBeenCalledTimes(2);

    unmount();
    expect(secondDestroy).toHaveBeenCalledTimes(1);
  });

  it('preserves the table and exposes the written chart failure fallback', () => {
    vi.mocked(createTokenBenchChart).mockImplementation(() => {
      throw new Error('canvas unavailable');
    });

    render(<TokenBenchChartCanvas
      title="Scores by model"
      finding="The table contains the exact values."
      configuration={configuration}
      table={<table><caption>Exact score values</caption><tbody><tr><td>Alpha</td><td>42</td></tr></tbody></table>}
    />);

    expect(screen.getByRole('status')).toHaveTextContent('Chart unavailable. Exact values remain in the table.');
    expect(screen.getByRole('table', { name: 'Exact score values' })).toBeInTheDocument();
    expect(screen.getByRole('figure')).toHaveAttribute('data-chart-failed', 'true');
  });

  it('sets zero-duration animation when reduced motion is preferred', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(<TokenBenchChartCanvas title="Scores" finding="Alpha leads." configuration={configuration} />);

    expect(vi.mocked(createTokenBenchChart).mock.calls[0]?.[1].options).toMatchObject({
      animation: { duration: 0 },
    });
  });
});
