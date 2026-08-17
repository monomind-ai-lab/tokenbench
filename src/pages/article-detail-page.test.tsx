import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTICLE_BY_SLUG, ARTICLES } from '../articles/content';
import { ArticleDetailPage, articleJsonLd } from './article-detail-page';

function renderArticleRoute(slug: string) {
  const article = ARTICLE_BY_SLUG.get(slug);
  if (!article) throw new Error(`Missing article fixture: ${slug}`);
  render(<ArticleDetailPage article={article} />);
  const breadcrumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
  return {
    heading: screen.getByRole('heading', { level: 1 }).textContent,
    breadcrumbs: [
      breadcrumbs.getByRole('link', { name: 'Articles' }).textContent,
      breadcrumbs.getByRole('link', { name: article.channelLabel }).textContent,
      breadcrumbs.getByText(article.title).textContent,
    ],
    jsonLd: articleJsonLd(article),
  };
}

describe('ArticleDetailPage', () => {
  it.each(ARTICLES)('renders $slug with breadcrumbs, related articles, and Article JSON-LD', (article) => {
    const result = renderArticleRoute(article.slug);

    expect(result.heading).toBe(article.title);
    expect(result.breadcrumbs).toEqual(['Articles', article.channelLabel, article.title]);
    expect(result.jsonLd).toMatchObject({
      '@type': 'Article',
      headline: article.title,
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
      image: 'https://tokenbench.monomind.one/og-guides.png',
    });
    expect(screen.getByRole('complementary', { name: 'On this page' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Build a ranking around your priorities' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Make it yours' })).toHaveAttribute('href', '/make-it-yours/');
    expect(screen.getByRole('link', { name: 'Explore Subscribe vs API' })).toHaveAttribute('href', '/subscribe-vs-api');
    for (const relatedSlug of article.relatedSlugs) {
      const related = ARTICLE_BY_SLUG.get(relatedSlug);
      if (!related) throw new Error(`Missing related article: ${relatedSlug}`);
      expect(screen.getAllByRole('link', { name: related.title }).some((link) => link.getAttribute('href') === `/articles/${related.slug}/`)).toBe(true);
    }
  });

  it('marks the selected table-of-contents item current and retains Hybrid Router’s text alternative', () => {
    const hybrid = ARTICLE_BY_SLUG.get('hybrid-router');
    if (!hybrid) throw new Error('Hybrid Router article fixture is missing');
    render(<ArticleDetailPage article={hybrid} />);

    const toc = within(screen.getByRole('complementary', { name: 'On this page' }));
    const evidence = toc.getByRole('link', { name: 'Separate evidence and interpretation' });
    fireEvent.click(evidence);

    expect(evidence).toHaveAttribute('aria-current', 'location');
    expect(screen.getByRole('table', { name: 'Exact illustrative routing cost values' })).toHaveTextContent('Hybrid with review');
    expect(screen.getByText('Illustrative monthly cost index. Lower cost does not imply acceptable quality or operational risk.')).toBeVisible();
  });
});
