import { useEffect, useState } from 'react';
import { ArrowRight, ChevronRight, Clock, ExternalLink } from 'lucide-react';
import { SITE_CONFIG } from '../brand/site-config';
import { articlePath, relatedArticles, type Article, type ArticleSection } from '../articles/content';
import { LEADERBOARD_ROUTES, PREVIEW_ROUTE_PATHS } from '../routing/routes';

function formatArticleDate(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function tocLabel(section: ArticleSection): string {
  return section.tocLabel ?? section.title.replace(/^\d+\.\s*/, '');
}

export function articleJsonLd(article: Article): Record<string, unknown> {
  const url = `${SITE_CONFIG.origin}${articlePath(article.slug)}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    image: `${SITE_CONFIG.origin}/og-guides.png`,
    url,
    mainEntityOfPage: url,
    author: { '@type': 'Organization', name: SITE_CONFIG.parentName, url: SITE_CONFIG.parentUrl },
    publisher: { '@type': 'Organization', name: SITE_CONFIG.parentName, url: SITE_CONFIG.parentUrl },
    keywords: article.keywords.join(', '),
  };
}

function ArticleTable({ table, label }: { readonly table: NonNullable<ArticleSection['table']>; readonly label?: string }) {
  return <div className="guide-table-wrap" role={label ? 'region' : undefined} aria-label={label} tabIndex={label ? 0 : undefined}><table className="guide-table" aria-label={label}><thead><tr>{table.headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{table.rows.map((row) => <tr key={row.join('|')}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function ArticleSectionView({ section }: { readonly section: ArticleSection; readonly key?: string }) {
  return <section id={section.id} className="article-section">
    <h2>{section.title}</h2>
    {section.decision ? <p className="article-detail-decision">{section.decision}</p> : null}
    {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    {section.steps ? <ol>{section.steps.map((step) => <li key={step}>{step}</li>)}</ol> : null}
    {section.bullets ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
    {section.table ? <ArticleTable table={section.table} label={section.id === 'evidence' ? 'Evidence framing table' : section.id === 'matrix' ? 'Architecture decision matrix' : undefined} /> : null}
    {section.cards ? <div className="article-detail-data-cards" aria-label={`${tocLabel(section)} cards`}>{section.cards.map((card) => <article key={card.title}><span>{card.label}</span><strong>{card.title}</strong><p>{card.description}</p></article>)}</div> : null}
    {section.figure ? <figure className="article-detail-chart-panel"><div role="img" aria-label={section.figure.ariaLabel}>{section.figure.values.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div><figcaption>{section.figure.caption}</figcaption></figure> : null}
    {section.detailsTable ? <details className="article-detail-details"><summary>Exact illustrative values</summary><ArticleTable table={section.detailsTable.table} label={section.detailsTable.label} /></details> : null}
    {section.contextLinks ? <nav className="article-detail-context-links" aria-label="Related decision tools">{section.contextLinks.map((link) => <a href={link.href} key={link.href}><span>{link.label}</span><small>{link.description}</small></a>)}</nav> : null}
    {section.callout ? <aside className="guide-callout"><strong>{section.callout.title}</strong><p>{section.callout.text}</p></aside> : null}
    {section.sources?.length ? <div className="section-sources"><span>Official references</span>{section.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.label}<ExternalLink aria-hidden="true" size={13} /></a>)}</div> : null}
  </section>;
}

function ArticleCard({ article }: { readonly article: Article; readonly key?: string }) {
  return <article className="guide-card"><div className="guide-card-meta"><span>{article.category}</span><span><Clock aria-hidden="true" size={14} />{article.readMinutes} min read</span></div><h3><a href={articlePath(article.slug)}>{article.title}</a></h3><p>{article.dek}</p><a className="guide-card-link" href={articlePath(article.slug)}>Read article <ArrowRight aria-hidden="true" size={16} /></a></article>;
}

function DecisionContext({ article }: { readonly article: Article }) {
  if (article.contextualLinks.length === 0) return null;
  return <aside className="guide-callout decision-context" aria-labelledby="decision-context-heading">
    <span className="eyebrow">Related decision context</span>
    <h2 id="decision-context-heading">Keep the next decision grounded</h2>
    <p>Use the linked evidence surface to carry the article’s assumptions into the next model or cost decision.</p>
    <nav className="article-detail-context-links" aria-label="Related decision context">
      {article.contextualLinks.map((link) => <a href={LEADERBOARD_ROUTES[link.leaderboard].pathname} key={link.leaderboard}>
        <span>{link.label}</span><small>{link.description}</small>
      </a>)}
    </nav>
  </aside>;
}

export interface ArticleDetailPageProps {
  readonly article: Article;
  readonly legacyGuideBreadcrumb?: boolean;
}

export function ArticleDetailPage({ article, legacyGuideBreadcrumb = false }: ArticleDetailPageProps) {
  const [activeSection, setActiveSection] = useState(article.sections[0]?.id);
  const recommendations = relatedArticles(article);

  useEffect(() => {
    setActiveSection(article.sections[0]?.id);
    if (!('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
      if (visible[0]) setActiveSection(visible[0].target.id);
    }, { rootMargin: '-120px 0px -62% 0px', threshold: [0, 0.15] });
    article.sections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [article]);

  const breadcrumbCurrent = legacyGuideBreadcrumb ? article.category : article.title;
  return <div className="guides-main article-main">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><a href={PREVIEW_ROUTE_PATHS.articles}>Articles</a><ChevronRight aria-hidden="true" size={14} /><a href={`${PREVIEW_ROUTE_PATHS.articles}?channel=${article.channel}`}>{article.channelLabel}</a><ChevronRight aria-hidden="true" size={14} /><span aria-current="page">{breadcrumbCurrent}</span></nav>
    <article className="guide-article">
      <header className="article-header"><span className="eyebrow">{article.contentType === 'insight' ? 'LLM Insight · Prototype' : `Guide · ${article.category}`}</span><h1>{article.title}</h1><p className="article-dek">{article.dek}</p><div className="article-byline"><span>By {SITE_CONFIG.parentName}</span><span>Updated {formatArticleDate(article.updatedAt)}</span><span><Clock aria-hidden="true" size={15} />{article.readMinutes} min read</span></div></header>
      <div className="article-layout"><div className="article-body"><aside className="takeaways" aria-labelledby="takeaways-heading"><span className="eyebrow">At a glance</span><h2 id="takeaways-heading">What you’ll learn</h2><ul>{article.takeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}</ul>{article.fixtureNote ? <p>{article.fixtureNote}</p> : null}</aside>{article.sections.map((section) => <ArticleSectionView key={section.id} section={section} />)}<DecisionContext article={article} /><aside className="guide-callout decision-context" aria-labelledby="make-it-yours-heading"><span className="eyebrow">Make it yours</span><h2 id="make-it-yours-heading">Build a ranking around your priorities</h2><p>Adjust capability weights and service thresholds to create a shortlist that reflects the work you need models to do.</p><a href={PREVIEW_ROUTE_PATHS.makeItYours}>Make it yours <ArrowRight aria-hidden="true" size={16} /></a></aside><aside className="calculator-cta"><div><span className="eyebrow">Cost planning</span><h2>Explore Subscribe vs API</h2><p>Compare subscription and API costs, find a breakeven point, and review the assumptions behind one shareable scenario.</p></div><a className="button" href={PREVIEW_ROUTE_PATHS.calculator}>Explore Subscribe vs API <ArrowRight aria-hidden="true" size={16} /></a></aside></div><aside className="article-toc" aria-label="On this page"><strong>On this page</strong><ol>{article.sections.map((section) => <li key={section.id}><a href={`#${section.id}`} aria-current={activeSection === section.id ? 'location' : undefined} onClick={() => setActiveSection(section.id)}>{tocLabel(section)}</a></li>)}</ol></aside></div>
    </article>
    <section className="related-guides" aria-labelledby="related-articles-heading"><div className="guide-index-heading"><div><span className="eyebrow">Keep optimizing</span><h2 id="related-articles-heading">Related articles</h2></div><a href={PREVIEW_ROUTE_PATHS.articles}>View all articles</a></div>{recommendations.length ? <div className="related-grid">{recommendations.map((related) => <ArticleCard article={related} key={related.slug} />)}</div> : null}</section>
  </div>;
}
