import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EditorialCta } from './editorial-cta';

describe('EditorialCta', () => {
  it('stays absent until the surrounding decision surface becomes eligible', () => {
    const { rerender } = render(<EditorialCta eligible={false} route="/models/" precedingAction="catalog" />);

    expect(screen.queryByRole('link', { name: /MonoMind AI Lab/i })).not.toBeInTheDocument();
    rerender(<EditorialCta eligible route="/models/" precedingAction="catalog" />);
    expect(screen.getByRole('link', { name: /MonoMind AI Lab/i })).toBeInTheDocument();
  });
});
