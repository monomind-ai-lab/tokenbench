import { GuideArticlePage, GuidesHub } from './frontend/guides-page';
import { AppShell } from './frontend/app-shell';
import { useSitePreferences } from './frontend/site-preferences';
import { GUIDE_BY_SLUG } from './guides/content';
import { matchRoute } from './routing/routes';

function currentGuideSlug(): string | undefined {
  const route = matchRoute(window.location.pathname);
  return route.kind === 'guides' ? route.slug : undefined;
}

export default function GuidesApp() {
  const { theme, language, toggleTheme, changeLanguage } = useSitePreferences();
  const slug = currentGuideSlug();
  const guide = slug ? GUIDE_BY_SLUG.get(slug) : undefined;

  return <AppShell
    activePage="guides"
    contentWrapper="none"
    language={language}
    onLanguageChange={changeLanguage}
    onThemeToggle={toggleTheme}
    skipLinkLabel="Skip to guide content"
    skipLinkTarget="guide-content"
    theme={theme}
  >
    {guide ? <GuideArticlePage guide={guide} /> : <GuidesHub />}
  </AppShell>;
}
