import { ArrowRight, BookOpen, Clock } from 'lucide-react';
import { ARTICLE_BY_SLUG, articlePath } from '../articles/content';
import { GUIDES, type GuideArticle } from '../guides/content';
import { ArticleDetailPage } from '../pages/article-detail-page';
import { PREVIEW_ROUTE_PATHS, ROUTE_PATHS } from '../routing/routes';

function formatGuideDate(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

export function GuideCard({ guide }: { readonly guide: GuideArticle; readonly key?: string }) {
  return <article className="guide-card">
    <div className="guide-card-meta"><span>{guide.category}</span><span><Clock aria-hidden="true" size={14} />{guide.readMinutes} min read</span></div>
    <h2><a href={articlePath(guide.slug)}>{guide.title}</a></h2>
    <p>{guide.dek}</p>
    <a className="guide-card-link" href={articlePath(guide.slug)}>Read guide <ArrowRight aria-hidden="true" size={16} /></a>
  </article>;
}

export function GuidesHub() {
  return <main id="guide-content" className="guides-main" tabIndex={-1}>
    <section className="guides-hero" aria-labelledby="guides-heading">
      <span className="eyebrow"><BookOpen aria-hidden="true" size={16} /> AI bill playbook</span>
      <h1 id="guides-heading">Spend smarter on AI</h1>
      <p>Practical, source-backed guides for measuring usage, choosing the right access path, and cutting avoidable token costs without trading away quality.</p>
      <div className="guides-hero-actions"><a className="button guide-primary-action" href={PREVIEW_ROUTE_PATHS.calculator}>Open Subscribe vs API</a><span>5 field guides · Reviewed {formatGuideDate(GUIDES[0].updatedAt)}</span></div>
    </section>
    <section className="guide-index" aria-labelledby="all-guides-heading">
      <div className="guide-index-heading"><div><span className="eyebrow">Guides</span><h2 id="all-guides-heading">Start with the bill you can see</h2></div><p>Each guide links to official documentation and the next useful step.</p></div>
      <div className="guide-grid">{GUIDES.map((guide) => <GuideCard key={guide.slug} guide={guide} />)}</div>
    </section>
  </main>;
}

export function GuideArticlePage({ guide }: { readonly guide: GuideArticle }) {
  const article = ARTICLE_BY_SLUG.get(guide.slug);
  if (!article) return null;
  return <ArticleDetailPage article={article} legacyGuideBreadcrumb />;
}
