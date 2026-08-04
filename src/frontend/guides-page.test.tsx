import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GUIDES } from '../guides/content';
import { GuideArticlePage, GuidesHub } from './guides-page';

describe('guides experience', () => {
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
    expect(screen.getByRole('link', { name: /Open calculator/i })).toHaveAttribute('href', '/#calculator');
  });
});
