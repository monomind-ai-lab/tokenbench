import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InsightDetailPage, InsightsPage } from './insights-page';
import { INSIGHTS } from '../articles/content';

describe('InsightsPage', () => {
  it('lists all five insight categories and URL-backed count state', () => {
    window.history.replaceState({}, '', '/articles/insights/?topic=pricing-changes');
    render(<InsightsPage />);
    for (const category of ['Releases', 'Benchmark Analyses', 'Pricing Changes', 'Lifecycle Announcements', 'Ecosystem/Technical Insights']) {
      expect(screen.getByText(category)).toBeInTheDocument();
    }
    expect(screen.getByText(/results for pricing-changes/i)).toBeInTheDocument();
  });

  it('keeps insight status in metadata instead of decorative eyebrow scaffolding', () => {
    const { container } = render(<InsightsPage />);

    expect(container.querySelector('.eyebrow')).toBeNull();
    expect(screen.getByText(/Factual review:/i)).toBeInTheDocument();
  });

  it('renders a factual brief, evidence timeline, interpretation, corrections, and related decision links', () => {
    render(<InsightDetailPage insight={INSIGHTS[0]} />);
    expect(screen.getByRole('heading', { name: 'Factual brief' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Evidence timeline' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TokenBench interpretation' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Related decision links' })).toBeInTheDocument();
  });
});
