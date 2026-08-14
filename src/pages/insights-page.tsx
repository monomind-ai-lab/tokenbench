import { useEffect } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { INSIGHT_CATEGORIES, INSIGHTS, insightPath, type InsightRecord } from '../articles/content';
import { EditorialCta } from '../frontend/editorial-cta';
import { trackTokenBenchEvent } from '../frontend/analytics';
import { ROUTE_PATHS } from '../routing/routes';

function categoryKey(category: string): string {
  return category.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-').replace(/-$/u, '');
}

function date(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

export function InsightsPage({ state = 'healthy' }: { readonly state?: 'healthy' | 'stale' | 'partial' | 'load-failure' }) {
  const params = new URLSearchParams(window.location.search);
  const topic = params.get('topic') ?? 'all';
  const dateFilter = params.get('date') ?? 'all';
  const view = params.get('view') ?? 'recent';
  const visible = INSIGHTS.filter((record) => topic === 'all' || record.topic === topic)
    .filter((record) => dateFilter === 'all' || record.publishedAt.startsWith(dateFilter))
    .filter((record) => view === 'featured' ? record.featured : true);
  const stateMessage = state === 'healthy' ? null : state === 'stale' ? 'This index may be stale; read each evidence state before acting.' : state === 'partial' ? 'Some metadata is unavailable; crawlable detail links remain available.' : 'The live index did not load; this authored, no-JS index remains available.';
  useEffect(() => { trackTokenBenchEvent('articles_channel_opened', { channel: 'insights', route: window.location.pathname }); }, []);
  return <main id="insights-content" className="guides-main" tabIndex={-1}>
    <section className="guides-hero" aria-labelledby="insights-heading"><span className="eyebrow">LLM insights</span><h1 id="insights-heading">LLM insights</h1><p>Factual primary-source briefs with TokenBench interpretation clearly separated from observed evidence.</p><p><a href={ROUTE_PATHS.guides}>Browse all guides</a></p></section>
    <section className="guide-index" aria-labelledby="insights-index-heading"><div className="guide-index-heading"><div><span className="eyebrow">Insights</span><h2 id="insights-index-heading">Five evidence channels</h2></div><p>Each record has one primary category, publication/update dates, and factual-review status.</p></div>
      <nav className="article-filters" aria-label="Insight filters"><a href={`?topic=${encodeURIComponent(topic)}&date=${dateFilter}&view=featured`} aria-current={view === 'featured' ? 'page' : undefined}>Featured</a><a href={`?topic=${encodeURIComponent(topic)}&date=${dateFilter}&view=recent`} aria-current={view === 'recent' ? 'page' : undefined}>Recent</a><a href={`?topic=${encodeURIComponent(topic)}&date=all&view=${view}`} aria-current={dateFilter === 'all' ? 'page' : undefined}>All dates</a><a href={`?topic=${encodeURIComponent(topic)}&date=2026-08&view=${view}`} aria-current={dateFilter === '2026-08' ? 'page' : undefined}>August 2026</a>{INSIGHT_CATEGORIES.map((category) => <a key={category} href={`?topic=${categoryKey(category)}&date=${dateFilter}&view=${view}`} aria-current={topic === categoryKey(category) ? 'page' : undefined} onClick={() => trackTokenBenchEvent('insight_topic_filtered', { topic: categoryKey(category), route: window.location.pathname })}>{category}</a>)}</nav>
      <p role="status">{visible.length} results for {topic} · {dateFilter} date filter · {view}</p>{stateMessage ? <p className="article-status" role="status">{stateMessage}</p> : null}
      <div className="guide-grid">{visible.map((insight) => <article className="guide-card" key={insight.slug}><div className="guide-card-meta"><span>Insight · {insight.category}</span><span>Published {date(insight.publishedAt)}</span></div><h3><a href={insightPath(insight.slug)} onClick={() => trackTokenBenchEvent('article_opened', { articleId: insight.id, route: window.location.pathname })}>{insight.title}</a></h3><p>{insight.factualBrief}</p><p className="article-status">Factual review: {insight.factualReview}</p></article>)}</div>
      {visible.length === 0 ? <p>No insight matches this URL state. <a href={ROUTE_PATHS.insights}>Return to all insights</a>.</p> : null}
    </section>
  </main>;
}

export function InsightDetailPage({ insight }: { readonly insight: InsightRecord }) {
  useEffect(() => { trackTokenBenchEvent('insight_viewed', { articleId: insight.id, route: window.location.pathname }); }, [insight.id]);
  return <main id="insights-content" className="guides-main article-main" tabIndex={-1}>
    <nav className="breadcrumbs" aria-label="Breadcrumb"><a href={ROUTE_PATHS.articles}>Articles</a><ChevronRight aria-hidden="true" size={14} /><a href={ROUTE_PATHS.insights}>Insights</a><ChevronRight aria-hidden="true" size={14} /><span aria-current="page">{insight.title}</span></nav>
    <article className="guide-article">
      <header className="article-header"><span className="eyebrow">Insight · {insight.category}</span><h1>{insight.title}</h1><div className="article-byline"><span>Published {date(insight.publishedAt)}</span><span>Updated {date(insight.updatedAt)}</span><span>Factual review: {insight.factualReview}</span><span>Author: {insight.author.name ?? 'Unavailable'}</span><span>Reviewer: {insight.reviewer.name ?? 'Unavailable'}</span></div>{insight.factualReview !== 'reviewed' ? <p className="article-status" role="status">Evidence state: {insight.factualReview}. This record does not silently substitute a current claim for incomplete or undated evidence.</p> : null}</header>
      <div className="article-body">
        <section className="article-section"><h2>Factual brief</h2><p>{insight.factualBrief}</p></section>
        <section className="article-section"><h2>What changed</h2><p>{insight.whatChanged}</p></section>
        <section className="article-section"><h2>Evidence timeline</h2><ol className="evidence-timeline">{insight.evidenceTimeline.map((entry) => <li key={entry.url}><strong>{entry.dateLabel}</strong><p>{entry.detail}</p><a href={entry.url} target="_blank" rel="noreferrer" onClick={() => trackTokenBenchEvent('insight_source_opened', { articleId: insight.id, route: window.location.pathname })}>{entry.label} <span>{entry.effectiveAt ?? `effective date ${entry.evidenceStatus}`}</span><ExternalLink aria-hidden="true" size={13} /></a></li>)}</ol></section>
        {insight.factBlocks.map((block) => <section className="article-section" data-article-block={block.kind} key={block.heading}><h2>{block.heading}</h2><p>{block.body}</p></section>)}
        {insight.interpretationBlocks.map((block) => <section className="article-section" data-article-block={block.kind} key={block.heading}><h2>{block.heading}</h2><p>{block.body}</p></section>)}
        <section className="article-section"><h2>Affected models and hosts</h2>{insight.affectedModelIds.length || insight.affectedHostIds.length ? <ul>{insight.affectedModelIds.map((id) => <li key={id}><a href={`/models/${id}/`} onClick={() => trackTokenBenchEvent('insight_affected_model_opened', { articleId: insight.id, route: window.location.pathname })}>{id}</a></li>)}{insight.affectedHostIds.map((id) => <li key={id}>{id}</li>)}</ul> : <p>No verified profile or host mapping is available for this record.</p>}</section>
        <section className="article-section"><h2>Practical implications</h2><ul>{insight.implications.map((implication) => <li key={implication}>{implication}</li>)}</ul></section>
        <section className="article-section"><h2>Corrections</h2>{insight.corrections.length ? insight.corrections.map((correction) => <details key={correction.id} onToggle={(event) => { if (event.currentTarget.open) trackTokenBenchEvent('insight_correction_opened', { articleId: insight.id, route: window.location.pathname }); }}><summary id={correction.id}>Correction published {date(correction.publishedAt)}</summary><p>{correction.detail}</p></details>) : <p>No corrections have been published for this record.</p>}</section>
      </div>
    </article>
    <section className="guide-callout decision-context"><h2>Related decision links</h2><ul>{insight.relatedDecisionLinks.map((link) => <li key={link.href}><a href={link.href} onClick={() => trackTokenBenchEvent('article_tool_opened', { tool: link.href.includes('cost') ? 'cost' : link.href.includes('lifecycle') ? 'lifecycle' : 'compare', subjectId: insight.id, route: window.location.pathname })}>{link.label}</a></li>)}</ul></section>
    <EditorialCta eligible={insight.ctaEligible} route={insightPath(insight.slug)} precedingAction="article" subjectId={insight.id} />
  </main>;
}
