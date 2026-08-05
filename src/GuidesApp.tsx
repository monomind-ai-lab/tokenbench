import { GuideArticlePage, GuidesHub } from './frontend/guides-page';
import { SiteFooter, SiteHeader } from './frontend/app-shell';
import { useSitePreferences } from './frontend/site-preferences';
import { GUIDE_BY_SLUG } from './guides/content';

function currentGuideSlug(): string | undefined {
  const match = window.location.pathname.match(/^\/guides\/([^/]+)\/?$/);
  return match?.[1];
}

export default function GuidesApp() {
  const { theme, language, toggleTheme, changeLanguage } = useSitePreferences();
  const slug = currentGuideSlug();
  const guide = slug ? GUIDE_BY_SLUG.get(slug) : undefined;

  return <div className="app-shell guides-shell">
    <a className="skip-link" href="#guide-content">Skip to guide content</a>
    <SiteHeader theme={theme} language={language} activePage="guides" onThemeToggle={toggleTheme} onLanguageChange={changeLanguage} />
    {guide ? <GuideArticlePage guide={guide} /> : <GuidesHub />}
    <SiteFooter status="Independent, source-backed guidance." notice="Verify provider terms before purchasing." />
  </div>;
}
