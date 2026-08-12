import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { modelProfileViewModelFixture } from '../frontend/model-profile-test-fixture';
import { ModelProfilePage } from './model-profile-page';

describe('ModelProfilePage', () => {
  it('shows corrected category evidence, route facts, and ledger sources', () => {
    render(<ModelProfilePage viewModel={modelProfileViewModelFixture()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'GPT-5.6 Sol' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Coding' })).toHaveTextContent('78.0');
    expect(screen.getByRole('article', { name: 'Coding' })).toHaveTextContent('#3');
    expect(screen.getByText('$5.00')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /source/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: 'Score' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: 'Last Updated' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('BenchLM')[0].closest('a')).toHaveAttribute('href', 'https://benchlm.ai/models/gpt-5-6-sol');
    expect(screen.queryByRole('columnheader', { name: 'Benchmark' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Raw' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Evidence' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sources' })).not.toBeInTheDocument();
  });
});
