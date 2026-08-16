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
    expect(screen.getByRole('heading', { name: 'Quick comparison', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Quality versus cost scatter/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Horizontal ranking of models by cost/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Seven-category profile comparison/ })).toBeInTheDocument();

    const selected = screen.getByRole('list', { name: 'Selected comparison models' });
    expect(within(selected).getByRole('link', { name: 'Claude Opus 4.1' })).toBeInTheDocument();
    expect(within(selected).getByRole('link', { name: 'GPT-5' })).toBeInTheDocument();

    const decisionMatrix = screen.getByRole('region', { name: 'Selected model decision matrix' });
    expect(within(decisionMatrix).getByRole('columnheader', { name: /Claude Opus 4.1/ })).toBeInTheDocument();
    expect(within(decisionMatrix).getByRole('columnheader', { name: /GPT-5/ })).toBeInTheDocument();
    expect(within(decisionMatrix).getByRole('rowheader', { name: 'Overall score' })).toBeInTheDocument();
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

  it('uses provider terminology while filtering the existing organization field', () => {
    render(<PopularModelsPage />);
    expect(screen.getByRole('button', { name: 'Providers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show provider' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Scrollable popular model leaderboard' })).getByRole('columnheader', { name: 'Provider' })).toBeInTheDocument();
    expect(screen.queryByText('Organization')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Providers' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search providers' }), { target: { value: 'Anthropic' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anthropic' }));
    expect(screen.getByText('3 models shown')).toBeInTheDocument();
  });

  it('keeps exact insight tables as native disclosures', () => {
    render(<PopularModelsPage />);
    const disclosure = screen.getByText('Exact quality and cost values').closest('details');
    expect(disclosure).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Exact quality and cost values'));
    expect(disclosure).toHaveAttribute('open');
    expect(within(disclosure!).getByRole('columnheader', { name: 'Provider' })).toBeInTheDocument();
  });

  it('uses the reusable quick comparison action order', () => {
    render(<PopularModelsPage />);

    const workspace = screen.getByRole('region', { name: 'Quick comparison' });
    expect(within(workspace).getByRole('heading', { name: 'Quick comparison' })).toBeInTheDocument();
    expect(within(workspace).getByRole('button', { name: 'clear' })).toBeInTheDocument();
    expect(within(workspace).getByRole('button', { name: 'Add a model' })).toBeInTheDocument();
    expect(within(workspace).getByRole('link', { name: 'More details' })).toHaveAttribute('href', '/compare?models=claude-opus-4-1%2Cgpt-5');
  });

  it('expands inline subtask evidence and compares up to four model columns through search', () => {
    render(<PopularModelsPage />);

    fireEvent.click(screen.getAllByRole('button', { name: /Expand Claude Opus 4.1 subtasks/ })[0]!);
    expect(screen.getAllByRole('region', { name: 'Reasoning subtasks' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Constraint synthesis').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Add a model' }));
    const search = screen.getByRole('combobox', { name: 'Search models or providers' });
    fireEvent.change(search, { target: { value: 'Haiku' } });
    fireEvent.click(screen.getByRole('option', { name: /Claude Haiku 4.5/ }));
    expect(screen.getByText('3 of 4 models selected. Add up to 1 more.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Claude Haiku 4.5' })).toBeEnabled();

    fireEvent.change(screen.getByRole('combobox', { name: 'Search models or providers' }), { target: { value: 'DeepSeek V3.2' } });
    fireEvent.click(screen.getByRole('option', { name: /DeepSeek V3.2/ }));
    expect(screen.getByText('4 of 4 models selected. Remove a model to add another.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a model' })).toBeDisabled();

    const profileDetails = screen.getByText('Exact capability values').closest('details')!;
    fireEvent.click(within(profileDetails).getByText('Exact capability values'));
    const matrix = within(profileDetails).getByRole('table');
    expect(within(matrix).getByRole('columnheader', { name: /Claude Opus 4.1/ })).toBeInTheDocument();
    expect(within(matrix).getByRole('columnheader', { name: /DeepSeek V3.2/ })).toBeInTheDocument();
    expect(within(matrix).getByRole('rowheader', { name: 'Reasoning' })).toBeInTheDocument();

    expect(within(profileDetails).getByRole('list', { name: 'Exact capability comparison, metric-first mobile view' })).toBeInTheDocument();
    const evidenceMatrix = screen.getByRole('region', { name: 'Itemized model comparison' });
    expect(within(evidenceMatrix).getByRole('rowheader', { name: 'Evidence status' })).toBeInTheDocument();
  });
});
