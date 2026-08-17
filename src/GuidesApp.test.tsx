import { fireEvent, render, screen, within } from '@testing-library/react';
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

  it('uses the shared preview navigation and footer for an article detail page', () => {
    window.history.replaceState({}, '', '/guides/openrouter-guide-model-routing-cost-controls/');
    render(<GuidesApp />);

    expect(document.querySelector('.app-shell')).toHaveAttribute('data-layout', 'desktop');

    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
    expect(within(navigation).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(navigation).getByRole('button', { name: 'Articles' })).toHaveAttribute('aria-current', 'page');
    expect(within(navigation).getByRole('link', { name: 'Compare' })).toHaveAttribute('href', '/compare');
    expect(within(navigation).getByRole('link', { name: 'Subscribe vs API' })).toHaveAttribute('href', '/cost');

    fireEvent.click(within(navigation).getByRole('button', { name: 'Models' }));
    expect(within(screen.getByRole('region', { name: 'Models' })).getByRole('link', { name: /^Models workbench/ })).toHaveAttribute('href', '/models');

    fireEvent.click(within(navigation).getByRole('button', { name: 'Leaderboards' }));
    const leaderboards = screen.getByRole('region', { name: 'Leaderboards' });
    expect(within(leaderboards).getByRole('link', { name: /^Popular Models/ })).toHaveAttribute('href', '/popular-models/');
    expect(within(leaderboards).getByRole('link', { name: /^Make it yours/ })).toHaveAttribute('href', '/make-it-yours/');

    fireEvent.click(within(navigation).getByRole('button', { name: 'Articles' }));
    expect(within(screen.getByRole('region', { name: 'Articles' })).getByRole('link', { name: 'All' })).toHaveAttribute('href', '/articles');

    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'Models workbench' })).toHaveAttribute('href', '/models');
    expect(within(footer).getByRole('link', { name: 'Articles' })).toHaveAttribute('href', '/articles');
  });
});
