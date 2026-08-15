import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PopularModelsPage } from './popular-models-page';

vi.mock('../frontend/popular-models/chart-canvas', () => ({
  PopularChartCanvas: ({ ariaLabel }: { readonly ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

describe('PopularModelsPage', () => {
  it('renders both interactive LiveBench-inspired sections with an explicit fixture boundary', () => {
    render(<PopularModelsPage />);

    expect(screen.getByRole('heading', { name: 'Popular models leaderboard', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '01 Leaderboard', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '02 Insights', level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/Every name, score, cost, verbosity value/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Quality versus cost scatter/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Horizontal ranking of models by cost/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Seven-category profile comparison/ })).toBeInTheDocument();
  });

  it('filters in real time and changes the score scope to category subtasks', () => {
    render(<PopularModelsPage />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search models' }), { target: { value: 'DeepSeek V3.2' } });
    expect(screen.getByText('1 model shown')).toBeInTheDocument();
    const leaderboard = screen.getByRole('region', { name: 'Scrollable popular model leaderboard' });
    expect(within(leaderboard).getByRole('link', { name: 'DeepSeek V3.2' })).toHaveAttribute('href', '/model-profile?model=deepseek-v3-2');

    fireEvent.click(within(screen.getByRole('region', { name: '01 Leaderboard' })).getByRole('button', { name: 'Reasoning' }));
    expect(within(leaderboard).getByRole('columnheader', { name: /Constraint synthesis/ })).toBeInTheDocument();
    expect(within(leaderboard).getByRole('columnheader', { name: /Multi-step planning/ })).toBeInTheDocument();
  });

  it('expands inline subtask evidence and supports a third comparison model', () => {
    render(<PopularModelsPage />);

    fireEvent.click(screen.getAllByRole('button', { name: /Expand Claude Opus 4.1 subtasks/ })[0]!);
    expect(screen.getAllByRole('region', { name: 'Reasoning subtasks' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Constraint synthesis').length).toBeGreaterThan(0);

    const selector = screen.getByRole('combobox', { name: 'Add a model' });
    fireEvent.change(selector, { target: { value: 'claude-haiku-4-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add model' }));
    expect(screen.getByText('3 of 3 models selected. Add a third model, then remove one to replace a current selection.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Claude Haiku 4.5' })).toBeEnabled();
  });
});
