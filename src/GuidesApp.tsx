import { GuideArticlePage, GuidesHub } from './frontend/guides-page';
import { SiteFooter, SiteHeader } from './frontend/app-shell';
import { useSitePreferences } from './frontend/site-preferences';
import { GUIDE_BY_SLUG } from './guides/content';
import { matchRoute } from './routing/routes';

export default function GuidesApp() {
  const { theme, language, toggleTheme, changeLanguage } = useSitePreferences();
  const route = matchRoute(window.location.pathname);
  const slug = route.kind === 'guides' ? route.slug : undefined;
  const guide = slug ? GUIDE_BY_SLUG.get(slug) : undefined;

  return <div className="app-shell guides-shell">
    <a className="skip-link" href="#guide-content">Skip to guide content</a>
    <SiteHeader theme={theme} language={language} activePage="guides" onThemeToggle={toggleTheme} onLanguageChange={changeLanguage} />
    {guide ? <GuideArticlePage guide={guide} /> : <GuidesHub isInsights={route.kind === 'insights'} />}
    <SiteFooter disclaimer="Verify provider evidence before purchasing." />
  </div>;
}
