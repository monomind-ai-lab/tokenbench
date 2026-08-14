import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import GuidesApp from '../GuidesApp';
import { SITE_CONFIG } from '../brand/site-config';
import { GUIDES } from '../guides/content';
import { ROUTE_PATHS } from '../routing/routes';
import { GuideArticlePage, GuidesHub } from './guides-page';

describe('guides experience', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', ROUTE_PATHS.guides);
  });

  it('uses shared TokenBench chrome and the dedicated calculator route', () => {
    render(<GuidesApp />);

    expect(screen.getByRole('link', { name: `${SITE_CONFIG.name} home` })).toHaveAttribute('href', '/');
    expect(screen.getByText('Source-aware model, pricing, and workload evidence for practical AI decisions.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the calculator' })).toHaveAttribute('href', `${ROUTE_PATHS.calculator}#calculator`);
    expect(screen.queryByText(/AI Cost Engine/i)).not.toBeInTheDocument();
  });

  it('renders a single-heading hub with every published guide', () => {
    const { container } = render(<GuidesHub />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'AI cost optimization guides' })).toBeInTheDocument();
    expect(container.querySelector('.eyebrow')).toBeNull();
    for (const guide of GUIDES) expect(screen.getByRole('link', { name: guide.title })).toHaveAttribute('href', `/articles/guides/${guide.slug}/`);
  });

  it('shows URL-backed filters, editorial views, counts, and review status on the eight-guide index', () => {
    window.history.replaceState({}, '', '/articles/guides/?topic=hybrid-routing&view=featured');
    render(<GuidesHub />);
    expect(screen.getByRole('link', { name: 'Featured' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recent' })).toBeInTheDocument();
    expect(screen.getByText(/results for hybrid-routing/i)).toBeInTheDocument();
    expect(screen.getAllByText(/factual review/i).length).toBeGreaterThan(0);
  });

  it('renders article navigation, official sources, and valid related guides', () => {
    const guide = GUIDES[0];
    render(<GuideArticlePage guide={guide} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: guide.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Decision question' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assumptions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reproducible framework' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Observed facts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sources and effective dates' })).toBeInTheDocument();
    const toc = screen.getByText('On this page').closest('details');
    expect(toc).not.toBeNull();
    for (const section of guide.sections) expect(within(toc!).getByRole('link', { name: section.title.replace(/^\d+\.\s*/, '') })).toHaveAttribute('href', `#${section.id}`);
    expect(screen.getAllByRole('link').some((link) => link.getAttribute('href')?.startsWith('https://'))).toBe(true);
    expect(screen.getByRole('heading', { name: 'Related guides' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Estimate API costs/i })).toHaveAttribute('href', ROUTE_PATHS.calculator);
  });

  it('renders a relevant checked-in leaderboard context link for every article', () => {
    for (const guide of GUIDES) {
      const view = render(<GuideArticlePage guide={guide} />);

      expect(screen.getByRole('heading', { name: 'Related decision links' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Review AI model pricing and context' })).toHaveAttribute('href', '/leaderboards/llm/pricing-context/');

      view.unmount();
    }
  });

  it('links the guides index to its populated Insights peer channel', () => {
    render(<GuidesHub isInsights />);

    expect(screen.getByRole('heading', { name: 'LLM insights' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse all guides' })).toHaveAttribute('href', ROUTE_PATHS.guides);
  });

  it('renders the insights channel from the insights route', () => {
    window.history.replaceState({}, '', ROUTE_PATHS.insights);
    render(<GuidesApp />);

    expect(screen.getByRole('heading', { name: 'LLM insights' })).toBeInTheDocument();
  });
});
