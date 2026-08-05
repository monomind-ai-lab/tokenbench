import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import GuidesApp from '../GuidesApp';
import { SITE_CONFIG } from '../brand/site-config';
import { GUIDES } from '../guides/content';
import { GuideArticlePage, GuidesHub } from './guides-page';

const expectedLeaderboardLinks = {
  'track-claude-code-usage': [
    { label: 'Review AI model pricing and context', href: '/leaderboards/llm/pricing-context/' },
  ],
  'monitor-openai-codex-usage': [
    { label: 'Review AI model pricing and context', href: '/leaderboards/llm/pricing-context/' },
  ],
  'openrouter-guide-model-routing-cost-controls': [
    { label: 'Review AI model pricing and context', href: '/leaderboards/llm/pricing-context/' },
  ],
  'legitimate-free-ai-api-access-credits': [
    { label: 'Review AI model pricing and context', href: '/leaderboards/llm/pricing-context/' },
  ],
  'reduce-llm-api-costs-caching-batch-output-limits': [
    { label: 'Review AI coding model benchmarks', href: '/leaderboards/llm/coding/' },
    { label: 'Explore the LLM value frontier', href: '/leaderboards/llm/value/' },
  ],
} as const;

describe('guides experience', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/guides/');
  });

  it('uses shared TokenBench chrome and the dedicated calculator route', () => {
    render(<GuidesApp />);

    expect(screen.getByRole('link', { name: `${SITE_CONFIG.name} home` })).toHaveAttribute('href', '/');
    expect(screen.getByText('Source-aware decision support.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the calculator' })).toHaveAttribute('href', '/tools/subscriptions-vs-apis/#calculator');
    expect(screen.queryByText(/AI Cost Engine/i)).not.toBeInTheDocument();
  });

  it('renders a single-heading hub with every published guide', () => {
    render(<GuidesHub />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Spend smarter on AI' })).toBeInTheDocument();
    for (const guide of GUIDES) expect(screen.getByRole('link', { name: guide.title })).toHaveAttribute('href', `/guides/${guide.slug}/`);
  });

  it('renders article navigation, official sources, and valid related guides', () => {
    const guide = GUIDES[0];
    render(<GuideArticlePage guide={guide} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: guide.title })).toBeInTheDocument();
    const toc = screen.getByRole('complementary', { name: 'On this page' });
    for (const section of guide.sections) expect(within(toc).getByRole('link', { name: section.title.replace(/^\d+\.\s*/, '') })).toHaveAttribute('href', `#${section.id}`);
    expect(screen.getAllByRole('link', { name: /Claude Code/i }).some((link) => link.getAttribute('href')?.startsWith('https://'))).toBe(true);
    expect(screen.getByRole('heading', { name: 'Related guides' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open calculator/i })).toHaveAttribute('href', '/tools/subscriptions-vs-apis/#calculator');
  });

  it('renders a relevant checked-in leaderboard context link for every article', () => {
    for (const guide of GUIDES) {
      const view = render(<GuideArticlePage guide={guide} />);

      expect(screen.getByRole('heading', { name: 'Related decision context' })).toBeInTheDocument();
      for (const link of expectedLeaderboardLinks[guide.slug as keyof typeof expectedLeaderboardLinks]) {
        expect(screen.getByRole('link', { name: link.label })).toHaveAttribute('href', link.href);
      }

      view.unmount();
    }
  });
});
