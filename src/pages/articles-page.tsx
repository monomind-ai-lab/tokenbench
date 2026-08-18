import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock } from 'lucide-react';
import { articlePath, type Article, type ArticleChannel } from '../articles/content';

type ArticleChannelFilter = 'all' | ArticleChannel;
type ArticleSort = 'newest' | 'oldest' | 'shortest' | 'title';

const CHANNELS: readonly { readonly value: ArticleChannelFilter; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'guides', label: 'Guides' },
  { value: 'insights', label: 'Insights' },
  { value: 'news', label: 'News' },
];

const ARTICLE_TYPES = ['Usage monitoring', 'API routing', 'Cost optimization', 'Architecture'] as const;

function formatArticleDate(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

export function articleChannelFromSearch(value: string | null | undefined): ArticleChannelFilter {
  return CHANNELS.some((channel) => channel.value === value) ? value as ArticleChannelFilter : 'all';
}

function updateChannelInHistory(channel: ArticleChannelFilter): void {
  const url = new URL(window.location.href);
  if (channel === 'all') url.searchParams.delete('channel');
  else url.searchParams.set('channel', channel);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function ArticleIndexCard({ article }: { readonly article: Article; readonly key?: string }) {
  return <article className="guide-card article-index-card">
    <div className="guide-card-meta"><span>{article.contentType === 'insight' ? 'Prototype insight' : `${article.channelLabel.slice(0, -1)} · ${article.category}`}</span><span><Clock aria-hidden="true" size={14} />{article.readMinutes} min read</span></div>
    <time dateTime={article.updatedAt}>Updated {formatArticleDate(article.updatedAt)}</time>
    <h2><a href={articlePath(article.slug)}>{article.title}</a></h2>
    <p>{article.dek}</p>
    <a className="guide-card-link" href={articlePath(article.slug)}>Read {article.contentType === 'insight' ? 'insight' : 'article'} <ArrowRight aria-hidden="true" size={16} /></a>
  </article>;
}

export interface ArticlesPageProps {
  readonly articles: readonly Article[];
  readonly initialChannel?: ArticleChannelFilter;
}

export function ArticlesPage({ articles, initialChannel }: ArticlesPageProps) {
  const [channel, setChannel] = useState<ArticleChannelFilter>(() => articleChannelFromSearch(initialChannel ?? (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('channel'))));
  const [type, setType] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ArticleSort>('newest');
  useEffect(() => {
    const channelFromUrl = articleChannelFromSearch(new URLSearchParams(window.location.search).get('channel'));
    setChannel((current) => current === channelFromUrl ? current : channelFromUrl);
  }, []);
  const channelCounts = useMemo(() => new Map(CHANNELS.map(({ value }) => [value, value === 'all' ? articles.length : articles.filter((article) => article.channel === value).length])), [articles]);
  const visibleArticles = useMemo(() => [...articles]
    .filter((article) => (channel === 'all' || article.channel === channel)
      && (type === 'all' || article.category === type)
      && (!query.trim() || `${article.title} ${article.description} ${article.dek}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
    .sort((left, right) => {
      if (sort === 'title') return left.title.localeCompare(right.title);
      if (sort === 'shortest') return left.readMinutes - right.readMinutes;
      return sort === 'oldest'
        ? left.updatedAt.localeCompare(right.updatedAt)
        : right.updatedAt.localeCompare(left.updatedAt);
    }), [articles, channel, query, sort, type]);

  const selectChannel = (next: ArticleChannelFilter) => {
    setChannel(next);
    updateChannelInHistory(next);
  };

  const reset = () => {
    setChannel('all');
    setType('all');
    setQuery('');
    setSort('newest');
    updateChannelInHistory('all');
  };

  return <div className="guides-main">
    <section className="guides-hero articles-hero" aria-labelledby="articles-heading">
      <span className="eyebrow">Articles</span>
      <h1 id="articles-heading">Articles for the AI bill you can explain.</h1>
      <p>Practical guides and clearly labeled prototype insights for tracking usage, choosing access paths, and making model decisions with evidence in view.</p>
    </section>
    <nav className="articles-tabs" aria-label="Article channels" role="tablist">
      {CHANNELS.map((item, index) => <button
        type="button"
        role="tab"
        id={`article-tab-${item.value}`}
        aria-controls="article-index"
        aria-selected={channel === item.value}
        tabIndex={channel === item.value ? 0 : -1}
        key={item.value}
        onClick={() => selectChannel(item.value)}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? CHANNELS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + CHANNELS.length) % CHANNELS.length;
          const next = CHANNELS[nextIndex];
          selectChannel(next.value);
          document.getElementById(`article-tab-${next.value}`)?.focus();
        }}
      >{item.label} <span>{channelCounts.get(item.value)}</span></button>)}
    </nav>
    <section className="guide-index articles-index" aria-labelledby="article-index-heading">
      <div className="guide-index-heading"><div><span className="eyebrow">Browse</span><h2 id="article-index-heading">Find the next useful answer</h2><div className="articles-type-filters" aria-label="Filter by article type">
        <button type="button" aria-pressed={type === 'all'} onClick={() => setType('all')}>All topics</button>
        {ARTICLE_TYPES.map((articleType) => <button type="button" aria-pressed={type === articleType} key={articleType} onClick={() => setType(articleType)}>{articleType}</button>)}
      </div></div><div className="articles-controls"><label className="sr-only" htmlFor="article-search">Search articles</label><input id="article-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search articles" /><label className="sr-only" htmlFor="article-sort">Sort articles</label><select id="article-sort" value={sort} onChange={(event) => setSort(event.target.value as ArticleSort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="shortest">Shortest read</option><option value="title">Title A–Z</option></select><button type="button" onClick={reset}>Clear all filters</button></div></div>
      <p className="articles-result-count" aria-live="polite">{visibleArticles.length} {visibleArticles.length === 1 ? 'article' : 'articles'} shown</p>
      <div className="guide-grid articles-grid" id="article-index" role="tabpanel" aria-labelledby={`article-tab-${channel}`}>{visibleArticles.map((article) => <ArticleIndexCard article={article} key={article.slug} />)}</div>
      {visibleArticles.length === 0 ? <div className="articles-empty" id="article-empty"><strong>No articles match those filters.</strong><p>Try another channel, topic, or search phrase.</p></div> : null}
      <p className="articles-prototype-note">LLM Insight entries are prototype-labeled editorial concepts, not published research or factual claims.</p>
    </section>
  </div>;
}
