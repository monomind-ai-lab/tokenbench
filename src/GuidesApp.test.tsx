import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import GuidesApp from './GuidesApp';

describe('guides shared chrome', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/guides/');
  });

  it('renders the linked TokenBench endorsement and research footer', () => {
    render(<GuidesApp />);

    expect(screen.getByRole('link', { name: 'Powered by MonoMind AI Lab' })).toHaveAttribute('href', 'https://monomind.one/');
    expect(screen.queryByRole('link', { name: 'Sources' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Methodology' })).toHaveAttribute('href', '/methodology/benchalign/');
  });
});
