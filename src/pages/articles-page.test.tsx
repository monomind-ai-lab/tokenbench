import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import ArticlesPage from './articles-page';

describe('ArticlesPage', () => {
  beforeEach(() => window.history.replaceState({}, '', '/articles/?topic=hybrid-routing'));

  it('starts with a distinct Guides and Insights split, then preserves URL-backed filter counts and crawlable article links', () => {
    render(<ArticlesPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Guides' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Insights' })).not.toHaveLength(0);
    expect(screen.getByText(/results for hybrid-routing/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Hybrid Routers/i })).toHaveAttribute('href', '/articles/guides/hybrid-routers/');
    expect(screen.getAllByRole('link', { name: /LLM insights/i }).every((link) => link.getAttribute('href') === '/articles/insights/')).toBe(true);
  });
});
