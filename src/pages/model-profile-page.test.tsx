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
  });
});
