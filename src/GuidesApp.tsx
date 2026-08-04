import { GuideArticlePage, GuidesHub } from './frontend/guides-page';
import { SiteHeader } from './frontend/app-shell';
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
    <footer className="app-footer"><span>MonoMind AI Lab · 2026</span><span>Independent, source-backed guidance.</span><span>Verify provider terms before purchasing.</span></footer>
  </div>;
}
