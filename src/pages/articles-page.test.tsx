import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ARTICLES } from '../articles/content';
import { ArticlesPage } from './articles-page';

describe('ArticlesPage', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/articles?channel=guides');
  });

  it('filters channels without changing the article pathname', () => {
    render(<ArticlesPage articles={ARTICLES} initialChannel="guides" />);

    fireEvent.click(screen.getByRole('tab', { name: /^News/ }));

    expect(window.location.pathname).toBe('/articles');
    expect(window.location.search).toBe('?channel=news');
    expect(screen.getByRole('tab', { name: /^News/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('No articles match those filters.')).toBeVisible();
  });

  it('keeps search, topic, sort, and reset controls accessible', () => {
    render(<ArticlesPage articles={ARTICLES} />);

    fireEvent.click(screen.getByRole('button', { name: 'Architecture' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search articles' }), { target: { value: 'hybrid' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort articles' }), { target: { value: 'title' } });

    expect(screen.getByRole('link', { name: 'A hybrid router for high-stakes agentic work' })).toHaveAttribute('href', '/articles/hybrid-router/');
    expect(screen.getByText('1 article shown')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));

    expect(window.location.pathname).toBe('/articles');
    expect(window.location.search).toBe('');
    expect(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'All topics' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('searchbox', { name: 'Search articles' })).toHaveValue('');
  });

  it('uses the all-channel first render then synchronizes a valid direct channel URL without console errors', () => {
    window.history.replaceState({}, '', '/articles?channel=insights');
    const staticHtml = renderToStaticMarkup(<ArticlesPage articles={ARTICLES} initialChannel="all" />);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(staticHtml).toContain('id="article-tab-all" aria-controls="article-index" aria-selected="true"');
    render(<ArticlesPage articles={ARTICLES} initialChannel="all" />);

    expect(screen.getByRole('tab', { name: /^Insights/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('2 articles shown')).toBeVisible();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
