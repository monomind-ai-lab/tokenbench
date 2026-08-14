import { useEffect } from 'react';
import { INSIGHT_CATEGORIES, INSIGHTS, insightPath } from '../articles/content';
import { GUIDES, guidePath } from '../guides/content';
import { trackTokenBenchEvent } from '../frontend/analytics';
import { ROUTE_PATHS } from '../routing/routes';

export type ArticleIndexState = 'healthy' | 'empty' | 'stale' | 'partial' | 'load-failure';

function topicForGuide(topic: string): string {
  return topic.includes('Hybrid') ? 'hybrid-routing'
    : topic.includes('Caching') ? 'caching'
      : topic.includes('Self-Hosting') ? 'self-hosting'
        : topic.includes('Native') ? 'hosting'
          : topic.includes('Tokenizer') ? 'tokenizers'
            : topic.includes('Retirement') ? 'lifecycle' : 'selection';
}

function channelStatus(state: ArticleIndexState): string | null {
  if (state === 'healthy') return null;
  if (state === 'empty') return 'No articles match this editorial view. Both channels remain available below.';
  if (state === 'stale') return 'The editorial index may be stale. Dates and source review states remain visible on every record.';
  if (state === 'partial') return 'Some metadata is unavailable. Article links and the evidence state remain available.';
  return 'The live index did not load. These authored channel links remain available without JavaScript.';
}

export default function ArticlesPage({ state = 'healthy' }: { readonly state?: ArticleIndexState }) {
  const params = new URLSearchParams(window.location.search);
  const topic = params.get('topic') ?? 'all';
  const view = params.get('view') ?? 'recent';
  const guides = GUIDES.filter((guide) => topic === 'all' || topicForGuide(guide.topic) === topic).filter((guide) => view === 'featured' ? guide.featured : true);
  const insights = INSIGHTS.filter((insight) => topic === 'all' || insight.topic === topic).filter((insight) => view === 'featured' ? insight.featured : true);
  const status = channelStatus(state);
  useEffect(() => { trackTokenBenchEvent('articles_channel_opened', { channel: 'guides', route: window.location.pathname }); }, []);
  return <main id="articles-content" className="guides-main articles-hub" tabIndex={-1}>
    <section className="articles-channel-split" aria-label="Article channels">
      <section aria-labelledby="articles-guides-heading"><span className="eyebrow">Evergreen practical decisions</span><h1 id="articles-guides-heading">Guides</h1><p>Source-aware frameworks for routing, cost, lifecycle, and production model selection.</p><a className="button" href={ROUTE_PATHS.guides} onClick={() => trackTokenBenchEvent('articles_channel_opened', { channel: 'guides', route: window.location.pathname })}>Browse guides</a></section>
      <section aria-labelledby="articles-insights-heading"><span className="eyebrow">Time-sensitive evidence records</span><h2 id="articles-insights-heading">Insights</h2><p>Factual briefs and clearly labeled TokenBench interpretation for releases, benchmarks, pricing, lifecycle, and ecosystem updates.</p><a className="button" href={ROUTE_PATHS.insights} onClick={() => trackTokenBenchEvent('articles_channel_opened', { channel: 'insights', route: window.location.pathname })}>Browse LLM insights</a></section>
    </section>
    <section className="guide-index" aria-labelledby="article-reading-heading">
      <div className="guide-index-heading"><div><span className="eyebrow">Article index</span><h2 id="article-reading-heading">Featured and recent reading</h2></div><p>Topic links have URL state and work without JavaScript.</p></div>
      <nav className="article-filters" aria-label="Article filters"><a aria-current={view === 'featured' ? 'page' : undefined} href={`?topic=${encodeURIComponent(topic)}&view=featured`} onClick={() => trackTokenBenchEvent('articles_topic_filtered', { topic, route: window.location.pathname })}>Featured</a><a aria-current={view === 'recent' ? 'page' : undefined} href={`?topic=${encodeURIComponent(topic)}&view=recent`} onClick={() => trackTokenBenchEvent('articles_topic_filtered', { topic, route: window.location.pathname })}>Recent</a><a aria-current={topic === 'all' ? 'page' : undefined} href="?topic=all&view=recent" onClick={() => trackTokenBenchEvent('articles_topic_filtered', { topic: 'all', route: window.location.pathname })}>All topics</a><a aria-current={topic === 'hybrid-routing' ? 'page' : undefined} href="?topic=hybrid-routing&view=recent" onClick={() => trackTokenBenchEvent('articles_topic_filtered', { topic: 'hybrid-routing', route: window.location.pathname })}>Hybrid routing</a>{INSIGHT_CATEGORIES.map((category) => { const key = category.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-').replace(/-$/u, ''); return <a key={category} aria-current={topic === key ? 'page' : undefined} href={`?topic=${key}&view=recent`} onClick={() => trackTokenBenchEvent('articles_topic_filtered', { topic: key, route: window.location.pathname })}>{category}</a>; })}</nav>
      <p role="status">{guides.length + insights.length} results for {topic} · {view}</p>
      {status ? <p className="article-status" role="status">{status}</p> : null}
      <div className="article-channel-index">
        <section aria-labelledby="featured-guides-heading"><h2 id="featured-guides-heading">Guides</h2>{guides.length ? <div className="guide-grid">{guides.map((guide) => <article className="guide-card" key={guide.slug}><p className="guide-card-meta">Guide · Updated {new Date(guide.updatedAt).toLocaleDateString('en-CA', { timeZone: 'UTC' })}</p><h3><a href={guidePath(guide.slug)} onClick={() => trackTokenBenchEvent('article_opened', { articleId: guide.id, route: window.location.pathname })}>{guide.title}</a></h3><p>{guide.dek}</p><a href={guide.relatedDecisionLinks[0].href} onClick={() => trackTokenBenchEvent('article_tool_opened', { tool: 'compare', subjectId: guide.id, route: window.location.pathname })}>Related decision tool</a></article>)}</div> : <p>No guide result for this topic. <a href={ROUTE_PATHS.guides}>Browse all guides</a>.</p>}</section>
        <section aria-labelledby="featured-insights-heading"><h2 id="featured-insights-heading">Insights</h2>{insights.length ? <div className="guide-grid">{insights.map((insight) => <article className="guide-card" key={insight.slug}><p className="guide-card-meta">Insight · {insight.category} · Updated {new Date(insight.updatedAt).toLocaleDateString('en-CA', { timeZone: 'UTC' })}</p><h3><a href={insightPath(insight.slug)} onClick={() => trackTokenBenchEvent('article_opened', { articleId: insight.id, route: window.location.pathname })}>{insight.title}</a></h3><p>{insight.factualBrief}</p><a href={insight.relatedDecisionLinks[0].href} onClick={() => trackTokenBenchEvent('article_tool_opened', { tool: 'compare', subjectId: insight.id, route: window.location.pathname })}>Related decision tool</a></article>)}</div> : <p>No insight result for this topic. <a href={ROUTE_PATHS.insights}>Browse all LLM insights</a>.</p>}</section>
      </div>
    </section>
  </main>;
}
