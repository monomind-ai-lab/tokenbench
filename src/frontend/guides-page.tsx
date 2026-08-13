import { ArrowRight, BookOpen, ChevronRight, Clock, ExternalLink } from 'lucide-react';
import { SITE_CONFIG } from '../brand/site-config';
import { GUIDES, guidePath, relatedGuides, type GuideArticle, type GuideSection } from '../guides/content';
import { LEADERBOARD_ROUTES, ROUTE_PATHS } from '../routing/routes';

function formatGuideDate(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

export function GuideCard({ guide }: { readonly guide: GuideArticle; readonly key?: string }) {
  return <article className="guide-card">
    <div className="guide-card-meta"><span>{guide.category}</span><span><Clock aria-hidden="true" size={14} />{guide.readMinutes} min read</span></div>
    <h2><a href={guidePath(guide.slug)}>{guide.title}</a></h2>
    <p>{guide.dek}</p>
    <a className="guide-card-link" href={guidePath(guide.slug)}>Read guide <ArrowRight aria-hidden="true" size={16} /></a>
  </article>;
}

export function InsightsChannel() {
  return <main id="guide-content" className="guides-main" tabIndex={-1}>
    <section className="guides-hero" aria-labelledby="insights-heading">
      <span className="eyebrow"><BookOpen aria-hidden="true" size={16} /> LLM insights</span>
      <h1 id="insights-heading">LLM insights</h1>
      <p>Evidence-aware ecosystem updates, model releases, and benchmark analysis as this channel is populated.</p>
    </section>
    <section className="guide-index" aria-labelledby="insights-channel-heading">
      <div className="guide-index-heading"><div><span className="eyebrow">Insights</span><h2 id="insights-channel-heading">Not yet separately populated</h2></div><p>This channel is reserved for future evidence-ledger analysis. The guides channel remains the populated Articles destination.</p></div>
      <div className="guide-grid"><a className="guide-card-link" href={ROUTE_PATHS.guides}>Browse all guides <ArrowRight aria-hidden="true" size={16} /></a></div>
    </section>
  </main>;
}

export function GuidesHub({ isInsights = false }: { readonly isInsights?: boolean }) {
  if (isInsights) return <InsightsChannel />;
  return <main id="guide-content" className="guides-main" tabIndex={-1}>
    <section className="guides-hero" aria-labelledby="guides-heading">
      <span className="eyebrow"><BookOpen aria-hidden="true" size={16} /> AI bill playbook</span>
      <h1 id="guides-heading">Spend smarter on AI</h1>
      <p>Practical, source-backed guides for measuring usage, choosing the right access path, and cutting avoidable token costs without trading away quality.</p>
      <div className="guides-hero-actions"><a className="button guide-primary-action" href={`${ROUTE_PATHS.calculator}#calculator`}>Open the calculator</a><span>5 field guides · Reviewed {formatGuideDate(GUIDES[0].updatedAt)}</span></div>
    </section>
    <section className="guide-index" aria-labelledby="all-guides-heading">
      <div className="guide-index-heading"><div><span className="eyebrow">Guides</span><h2 id="all-guides-heading">Start with the bill you can see</h2></div><p>Each guide links to official documentation and the next useful step.</p></div>
      <div className="guide-grid">{GUIDES.map((guide) => <GuideCard key={guide.slug} guide={guide} />)}</div>
    </section>
  </main>;
}

function GuideSectionView({ section }: { readonly section: GuideSection; readonly key?: string }) {
  return <section id={section.id} className="article-section">
    <h2>{section.title}</h2>
    {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    {section.steps ? <ol>{section.steps.map((step) => <li key={step}>{step}</li>)}</ol> : null}
    {section.bullets ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
    {section.table ? <div className="guide-table-wrap"><table className="guide-table"><thead><tr>{section.table.headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{section.table.rows.map((row) => <tr key={row.join('|')}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div> : null}
    {section.callout ? <aside className="guide-callout"><strong>{section.callout.title}</strong><p>{section.callout.text}</p></aside> : null}
    {section.sources?.length ? <div className="section-sources"><span>Official references</span>{section.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.label}<ExternalLink aria-hidden="true" size={13} /></a>)}</div> : null}
  </section>;
}

function GuideContextualLinks({ guide }: { readonly guide: GuideArticle }) {
  return <aside className="guide-callout decision-context" aria-labelledby="decision-context-heading">
    <span className="eyebrow">Decision context</span>
    <h2 id="decision-context-heading">Related decision context</h2>
    <p>Use these source-aware pages as a starting point, then inspect the published evidence and unavailable states before relying on a route.</p>
    <ul>{guide.contextualLinks.map((link) => <li key={link.leaderboard}><a href={LEADERBOARD_ROUTES[link.leaderboard].pathname}>{link.label}</a><span> — {link.description}</span></li>)}</ul>
  </aside>;
}

export function GuideArticlePage({ guide }: { readonly guide: GuideArticle }) {
  const recommendations = relatedGuides(guide);
  return <main id="guide-content" className="guides-main article-main" tabIndex={-1}>
    <nav className="breadcrumbs" aria-label="Breadcrumb"><a href={ROUTE_PATHS.guides}>Guides</a><ChevronRight aria-hidden="true" size={14} /><span aria-current="page">{guide.category}</span></nav>
    <article className="guide-article">
      <header className="article-header">
        <span className="eyebrow">{guide.category}</span>
        <h1>{guide.title}</h1>
        <p className="article-dek">{guide.dek}</p>
        <div className="article-byline"><span>By {SITE_CONFIG.parentName}</span><span>Updated {formatGuideDate(guide.updatedAt)}</span><span><Clock aria-hidden="true" size={15} />{guide.readMinutes} min read</span></div>
      </header>
      <div className="article-layout">
        <div className="article-body">
          <aside className="takeaways" aria-labelledby="takeaways-heading"><span className="eyebrow">At a glance</span><h2 id="takeaways-heading">What you’ll learn</h2><ul>{guide.takeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}</ul></aside>
          {guide.sections.map((section) => <GuideSectionView key={section.id} section={section} />)}
          <GuideContextualLinks guide={guide} />
          <aside className="calculator-cta"><div><span className="eyebrow">Put the numbers to work</span><h2>Compare your usage with current plan and API prices</h2><p>Use your observed monthly tokens and model mix to estimate API-equivalent value and potential savings.</p></div><a className="button" href={`${ROUTE_PATHS.calculator}#calculator`}>Open calculator <ArrowRight aria-hidden="true" size={16} /></a></aside>
        </div>
        <aside className="article-toc" aria-label="On this page"><strong>On this page</strong><ol>{guide.sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.title.replace(/^\d+\.\s*/, '')}</a></li>)}</ol></aside>
      </div>
    </article>
    <section className="related-guides" aria-labelledby="related-guides-heading"><div className="guide-index-heading"><div><span className="eyebrow">Keep optimizing</span><h2 id="related-guides-heading">Related guides</h2></div><a href={ROUTE_PATHS.guides}>View all guides</a></div><div className="related-grid">{recommendations.map((related) => <GuideCard guide={related} key={related.slug} />)}</div></section>
  </main>;
}
