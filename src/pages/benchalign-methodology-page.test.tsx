import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

describe('BenchAlign methodology page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    window.history.replaceState({}, '', '/methodology/benchalign/');
  });

  it('explains the BenchAlign source boundary without claiming ownership', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'How BenchAlign rankings work' })).toBeVisible();
    expect(screen.getByText(/TokenBench republishes BenchLM's BenchAlign results/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /Read BenchLM's methodology/i })).toHaveAttribute(
      'href',
      'https://benchlm.ai/methodology',
    );
  });
});
