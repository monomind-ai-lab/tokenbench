import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CostPage } from './cost-page';

describe('CostPage', () => {
  it('keeps the distinct simulator and breakeven decisions, source coverage, and clean-start choice in initial markup', () => {
    render(<CostPage sharedState={{ carriedFields: ['model', 'host'], present: true }} sourceCoverage={{ completePriceRoutes: 4, effectiveAt: '2026-08-14T00:00:00.000Z', freshness: 'fresh' }} />);

    expect(screen.getByRole('heading', { name: 'Choose the right cost question', level: 1 })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Cost Simulator' })).toHaveAttribute('href', '/cost/calculator/');
    expect(screen.getByRole('link', { name: 'Open Breakeven Calculator' })).toHaveAttribute('href', '/cost/breakeven/');
    expect(screen.getByText(/Fee crossover is not subscription-capacity evidence/i)).toBeVisible();
    expect(screen.getByText(/4 complete published price routes/i)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Continue with shared state' })).toHaveAttribute('href', '/cost/calculator/?carry=model%2Chost');
    expect(screen.getByRole('link', { name: 'Start clean' })).toHaveAttribute('href', '/cost/calculator/');
  });

  it('emits only the bounded tool-opened event from a tool card', () => {
    const listener = vi.fn();
    window.addEventListener('tokenbench:analytics', listener);
    render(<CostPage />);

    fireEvent.click(screen.getByRole('link', { name: 'Open Breakeven Calculator' }));

    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      name: 'cost_hub_tool_opened', tool: 'breakeven', route: '/cost/',
    });
    window.removeEventListener('tokenbench:analytics', listener);
  });
});
