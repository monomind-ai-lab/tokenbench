import { GuideArticlePage, GuidesHub } from './frontend/guides-page';
import { SiteFooter, SiteHeader } from './frontend/app-shell';
import { useSitePreferences } from './frontend/site-preferences';
import { GUIDE_BY_SLUG } from './guides/content';
import { INSIGHT_BY_SLUG } from './articles/content';
import ArticlesPage from './pages/articles-page';
import { InsightDetailPage, InsightsPage } from './pages/insights-page';
import { NotFoundPage } from './pages/not-found-page';
import { matchRoute } from './routing/routes';

export default function GuidesApp() {
  const { theme, language, toggleTheme, changeLanguage } = useSitePreferences();
  const route = matchRoute(window.location.pathname);
  const slug = route.kind === 'guides' ? route.slug : undefined;
  const guide = slug ? GUIDE_BY_SLUG.get(slug) : undefined;
  const insight = route.kind === 'insightDetail' ? INSIGHT_BY_SLUG.get(route.slug) : undefined;
  const contentId = route.kind === 'articles' ? 'articles-content'
    : route.kind === 'insights' || route.kind === 'insightDetail' ? 'insights-content'
      : 'guide-content';

  return <div className="app-shell guides-shell">
    <a className="skip-link" href={`#${contentId}`}>Skip to article content</a>
    <SiteHeader theme={theme} language={language} activePage="guides" onThemeToggle={toggleTheme} onLanguageChange={changeLanguage} />
    {route.kind === 'articles' ? <ArticlesPage />
      : guide ? <GuideArticlePage guide={guide} />
        : route.kind === 'guides' ? <GuidesHub />
          : route.kind === 'insights' ? <InsightsPage />
            : insight ? <InsightDetailPage insight={insight} />
              : <NotFoundPage attemptedPath={window.location.pathname} />}
    <SiteFooter disclaimer="Verify provider evidence before purchasing." />
  </div>;
}
