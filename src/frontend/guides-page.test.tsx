import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import GuidesApp from '../GuidesApp';
import { articlePath, GUIDES } from '../guides/content';
import { GuideArticlePage, GuidesHub } from './guides-page';

describe('guides experience', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/guides/');
  });

  it('uses shared TokenBench chrome and the preview calculator destination', () => {
    render(<GuidesApp />);

    expect(screen.getByRole('link', { name: 'TokenBench home' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Source-aware model, pricing, and workload evidence for practical AI decisions.')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Primary navigation' })).getByRole('link', { name: 'Subscribe vs API' })).toHaveAttribute('href', '/subscribe-vs-api');
    expect(screen.queryByText(/AI Cost Engine/i)).not.toBeInTheDocument();
  });

  it('renders a single-heading hub with every published guide', () => {
    render(<GuidesHub />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Spend smarter on AI' })).toBeInTheDocument();
    for (const guide of GUIDES) expect(screen.getByRole('link', { name: guide.title })).toHaveAttribute('href', articlePath(guide.slug));
  });

  it('renders article navigation, calls to action, official sources, and valid related articles', () => {
    const guide = GUIDES[0];
    render(<GuideArticlePage guide={guide} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: guide.title })).toBeInTheDocument();
    const breadcrumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumbs).getByRole('link', { name: 'Articles' })).toHaveAttribute('href', '/articles');
    expect(within(breadcrumbs).getByRole('link', { name: 'Guides' })).toHaveAttribute('href', '/articles?channel=guides');
    expect(within(breadcrumbs).getByText(guide.category)).toHaveAttribute('aria-current', 'page');
    const toc = screen.getByRole('complementary', { name: 'On this page' });
    for (const section of guide.sections) expect(within(toc).getByRole('link', { name: section.title.replace(/^\d+\.\s*/, '') })).toHaveAttribute('href', `#${section.id}`);
    expect(screen.getAllByRole('link', { name: /Claude Code/i }).some((link) => link.getAttribute('href')?.startsWith('https://'))).toBe(true);
    expect(screen.getByRole('heading', { name: 'Build a ranking around your priorities' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Make it yours' })).toHaveAttribute('href', '/make-it-yours/');
    expect(screen.getByRole('heading', { name: 'Explore Subscribe vs API' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explore Subscribe vs API' })).toHaveAttribute('href', '/subscribe-vs-api');
    expect(screen.getByRole('heading', { name: 'Related articles' })).toBeInTheDocument();
    for (const slug of guide.relatedSlugs) {
      const related = GUIDES.find((item) => item.slug === slug);
      if (!related) throw new Error(`Missing related guide ${slug}`);
      expect(screen.getByRole('link', { name: related.title })).toHaveAttribute('href', articlePath(slug));
    }
  });
});
