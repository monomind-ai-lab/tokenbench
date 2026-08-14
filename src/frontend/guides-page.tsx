import { ArrowRight, BookOpen, ChevronRight, Clock, ExternalLink } from 'lucide-react';
import { useEffect } from 'react';
import { SITE_CONFIG } from '../brand/site-config';
import { EditorialCta } from './editorial-cta';
import { trackTokenBenchEvent } from './analytics';
import { GUIDES, guidePath, relatedGuides, type GuideArticle, type GuideSection } from '../guides/content';
import { LEADERBOARD_ROUTES, ROUTE_PATHS } from '../routing/routes';
import { InsightsPage } from '../pages/insights-page';

function formatGuideDate(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

function guideTopicKey(guide: GuideArticle): string {
  if (guide.topic.includes('Hybrid')) return 'hybrid-routing';
  if (guide.topic.includes('Caching')) return 'caching';
  if (guide.topic.includes('Self-Hosting')) return 'self-hosting';
  if (guide.topic.includes('Native')) return 'hosting';
  if (guide.topic.includes('Tokenizer')) return 'tokenizers';
  if (guide.topic.includes('Retirement')) return 'lifecycle';
  return 'selection';
}

function filterGuideRecords(records: readonly GuideArticle[], topic: string, view: string): readonly GuideArticle[] {
  const byTopic = topic === 'all' ? records : records.filter((guide) => guideTopicKey(guide) === topic);
  return view === 'featured' ? byTopic.filter((guide) => guide.featured) : [...byTopic].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function tracker(event: 'article_opened' | 'article_tool_opened', guide: GuideArticle, tool?: 'compare' | 'cost' | 'lifecycle' | 'profile' | 'leaderboard') {
  if (event === 'article_opened') trackTokenBenchEvent(event, { articleId: guide.id, route: window.location.pathname });
  else if (tool) trackTokenBenchEvent(event, { subjectId: guide.id, tool, route: window.location.pathname });
}

export function GuideCard({ guide, relatedTo }: { readonly guide: GuideArticle; readonly relatedTo?: GuideArticle; readonly key?: string }) {
  const opened = () => relatedTo
    ? trackTokenBenchEvent('guide_related_opened', { articleId: relatedTo.id, route: window.location.pathname })
    : tracker('article_opened', guide);
  return <article className="guide-card">
    <div className="guide-card-meta"><span>Guide · {guide.category}</span><span>Updated {formatGuideDate(guide.updatedAt)}</span>{guide.readMinutes ? <span><Clock aria-hidden="true" size={14} />{guide.readMinutes} min read</span> : null}</div>
    <h2><a href={guidePath(guide.slug)} onClick={opened}>{guide.title}</a></h2>
    <p>{guide.dek}</p>
    <p className="article-status">Factual review: {guide.factualReview} · Reviewer: {guide.reviewer.name ?? 'Unavailable'}</p>
    <a className="guide-card-link" href={guidePath(guide.slug)} onClick={opened}>Read guide <ArrowRight aria-hidden="true" size={16} /></a>
  </article>;
}

function GuideFilters({ topic, view }: { readonly topic: string; readonly view: string }) {
  const topics = ['all', 'hybrid-routing', 'caching', 'self-hosting', 'hosting', 'tokenizers', 'lifecycle', 'selection'];
  return <nav className="article-filters" aria-label="Guide filters">
    <span>View:</span>
    {(['featured', 'recent'] as const).map((candidate) => <a key={candidate} aria-current={view === candidate ? 'page' : undefined} href={`?topic=${encodeURIComponent(topic)}&view=${candidate}`}>{candidate === 'featured' ? 'Featured' : 'Recent'}</a>)}
    <span>Topic:</span>
    {topics.map((candidate) => <a key={candidate} aria-current={topic === candidate ? 'page' : undefined} href={`?topic=${candidate}&view=${encodeURIComponent(view)}`}>{candidate === 'all' ? 'All topics' : candidate.replaceAll('-', ' ')}</a>)}
  </nav>;
}

export function InsightsChannel() {
  return <InsightsPage />;
}

export function GuidesHub({ isInsights = false }: { readonly isInsights?: boolean }) {
  if (isInsights) return <InsightsChannel />;
  const params = new URLSearchParams(window.location.search);
  const topic = params.get('topic') ?? 'all';
  const view = params.get('view') ?? 'recent';
  const visible = filterGuideRecords(GUIDES, topic, view);
  const validTopic = topic === 'all' || GUIDES.some((guide) => guideTopicKey(guide) === topic);
  return <main id="guide-content" className="guides-main" tabIndex={-1}>
    <section className="guides-hero" aria-labelledby="guides-heading">
      <span className="eyebrow"><BookOpen aria-hidden="true" size={16} /> AI decision guides</span>
      <h1 id="guides-heading">AI cost optimization guides</h1>
      <p>Practical, source-backed guides for routing, cost, lifecycle, and production model decisions. Evidence that lacks a durable source date remains visibly undated.</p>
      <div className="guides-hero-actions"><a className="button guide-primary-action" href={`${ROUTE_PATHS.calculator}#calculator`}>Open the calculator</a><span>{GUIDES.length} field guides · editorial index reviewed {formatGuideDate(GUIDES[0].updatedAt)}</span></div>
    </section>
    <section className="guide-index" aria-labelledby="all-guides-heading">
      <div className="guide-index-heading"><div><span className="eyebrow">Guides</span><h2 id="all-guides-heading">Start with the decision you need to make</h2></div><p>Featured and recent are editorial views, not implicit recency claims. <a href={ROUTE_PATHS.insights}>Browse LLM insights</a>.</p></div>
      <GuideFilters topic={topic} view={view} />
      <p role="status">{visible.length} results for {validTopic ? topic : 'an unavailable topic'} · {view}</p>
      {!validTopic ? <p className="article-status">This topic is unavailable. The complete guide inventory remains linked below.</p> : null}
      {visible.length === 0 ? <p className="article-status">No {view} guides match this topic. Use Recent or All topics to keep the complete inventory available.</p> : null}
      <div className="guide-grid">{visible.map((guide) => <GuideCard key={guide.slug} guide={guide} />)}</div>
      <p className="article-status">If live editorial metadata cannot load, this authored inventory remains available with each record’s dated or undated evidence state.</p>
    </section>
  </main>;
}

function GuideSectionView({ section, guide }: { readonly section: GuideSection; readonly guide: GuideArticle; readonly key?: string }) {
  return <section id={section.id} className="article-section">
    <h2>{section.title}</h2>
    {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    {section.steps ? <ol>{section.steps.map((step) => <li key={step}>{step}</li>)}</ol> : null}
    {section.bullets ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
    {section.table ? <div className="guide-table-wrap" role="region" aria-label={`${section.title} table`} tabIndex={0}><table className="guide-table"><thead><tr>{section.table.headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{section.table.rows.map((row) => <tr key={row.join('|')}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div> : null}
    {section.callout ? <aside className="guide-callout"><strong>{section.callout.title}</strong><p>{section.callout.text}</p></aside> : null}
    {section.sources?.length ? <details className="section-sources"><summary>Sources and effective dates</summary>{section.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url} onClick={() => trackTokenBenchEvent('guide_source_opened', { articleId: guide.id, route: window.location.pathname })}>{source.label} <span>{source.effectiveAt ? `Effective ${formatGuideDate(source.effectiveAt)}` : `Effective date ${source.evidenceStatus}`}</span><ExternalLink aria-hidden="true" size={13} /></a>)}</details> : null}
  </section>;
}

function EvidenceBlocks({ guide }: { readonly guide: GuideArticle }) {
  const factBlocks = guide.factBlocks;
  const calculationBlocks = factBlocks.filter((block) => block.kind === 'calculation');
  const observed = factBlocks.filter((block) => block.kind === 'fact');
  const render = (block: GuideArticle['factBlocks'][number]) => <section className="article-section" data-article-block={block.kind} key={block.heading}><h2>{block.heading}</h2><p>{block.body}</p></section>;
  return <>
    {observed.map(render)}
    {calculationBlocks.map(render)}
    {guide.interpretationBlocks.map((block) => <section className="article-section" data-article-block={block.kind} key={block.heading}><h2>{block.heading}</h2><p>{block.body}</p></section>)}
    <section className="article-section"><h2>Sources and effective dates</h2><p>Each listed source is a primary evidence link. An undated state means this article does not infer an effective date.</p>{factBlocks.flatMap((block) => block.sources).filter((source, index, sources) => sources.findIndex((candidate) => candidate.url === source.url) === index).map((source) => <a className="article-source" key={source.url} href={source.url} target="_blank" rel="noreferrer" onClick={() => trackTokenBenchEvent('guide_source_opened', { articleId: guide.id, route: window.location.pathname })}>{source.label} — {source.effectiveAt ? `effective ${formatGuideDate(source.effectiveAt)}` : `effective date ${source.evidenceStatus}`} <ExternalLink aria-hidden="true" size={13} /></a>)}</section>
  </>;
}

function GuideContextualLinks({ guide }: { readonly guide: GuideArticle }) {
  return <section className="guide-callout decision-context" aria-labelledby="decision-context-heading">
    <span className="eyebrow">Decision context</span>
    <h2 id="decision-context-heading">Related decision links</h2>
    <ul>{guide.contextualLinks.map((link) => <li key={link.leaderboard}><a href={LEADERBOARD_ROUTES[link.leaderboard].pathname} onClick={() => tracker('article_tool_opened', guide, 'leaderboard')}>{link.label}</a><span> — {link.description}</span></li>)}{guide.relatedDecisionLinks.map((link) => <li key={link.href}><a href={link.href} onClick={() => tracker('article_tool_opened', guide, link.href.includes('cost') ? 'cost' : link.href.includes('lifecycle') ? 'lifecycle' : 'compare')}>{link.label}</a></li>)}</ul>
  </section>;
}

export function GuideArticlePage({ guide }: { readonly guide: GuideArticle }) {
  const recommendations = relatedGuides(guide);
  useEffect(() => { trackTokenBenchEvent('guide_viewed', { articleId: guide.id, route: window.location.pathname }); }, [guide.id]);
  return <main id="guide-content" className="guides-main article-main" tabIndex={-1}>
    <nav className="breadcrumbs" aria-label="Breadcrumb"><a href={ROUTE_PATHS.articles}>Articles</a><ChevronRight aria-hidden="true" size={14} /><a href={ROUTE_PATHS.guides}>Guides</a><ChevronRight aria-hidden="true" size={14} /><span aria-current="page">{guide.title}</span></nav>
    <article className="guide-article">
      <header className="article-header">
        <span className="eyebrow">Guide · {guide.category}</span>
        <h1>{guide.title}</h1>
        <p className="article-dek">{guide.dek}</p>
        <div className="article-byline"><span>Published {formatGuideDate(guide.publishedAt)}</span><span>Updated {formatGuideDate(guide.updatedAt)}</span><span>Factual review: {guide.factualReview}</span><span>Author: {guide.author.name ?? 'Unavailable'}</span><span>Reviewer: {guide.reviewer.name ?? 'Unavailable'}</span>{guide.readMinutes ? <span><Clock aria-hidden="true" size={15} />{guide.readMinutes} min read</span> : null}</div>
        {guide.factualReview === 'stale' || guide.factualReview === 'partial' ? <p className="article-status" role="status">Evidence review state: {guide.factualReview}. Undated or incomplete source claims are not treated as current facts.</p> : null}
      </header>
      <div className="article-layout">
        <div className="article-body">
          <section className="takeaways"><span className="eyebrow">Decision</span><h2>Decision question</h2><p>{guide.decisionQuestion}</p><h2>Concise answer</h2><p>{guide.answer}</p></section>
          <section className="article-section"><h2>Assumptions</h2><ul>{guide.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section className="article-section"><h2>Reproducible framework</h2><ol>{guide.framework.map((item) => <li key={item}>{item}</li>)}</ol></section>
          <EvidenceBlocks guide={guide} />
          {guide.sections.map((section) => <GuideSectionView key={section.id} guide={guide} section={section} />)}
          <section className="article-section"><h2>Limitations and comparability</h2><ul>{guide.limitations.map((item) => <li key={item}>{item}</li>)}</ul></section>
        </div>
        <details className="article-toc" onToggle={(event) => { if (event.currentTarget.open) trackTokenBenchEvent('guide_toc_opened', { articleId: guide.id, route: window.location.pathname }); }}><summary>On this page</summary><ol>{guide.sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.title.replace(/^\d+\.\s*/, '')}</a></li>)}</ol></details>
      </div>
    </article>
    <section className="related-guides" aria-labelledby="related-guides-heading"><div className="guide-index-heading"><div><span className="eyebrow">Keep evaluating</span><h2 id="related-guides-heading">Related guides</h2></div><a href={ROUTE_PATHS.guides}>View all guides</a></div><div className="related-grid">{recommendations.map((related) => <GuideCard guide={related} relatedTo={guide} key={related.slug} />)}</div></section>
    <GuideContextualLinks guide={guide} />
    <EditorialCta eligible={guide.ctaEligible} route={guidePath(guide.slug)} precedingAction="article" subjectId={guide.id} />
  </main>;
}
