import type { ReactNode } from 'react';
import type { PreviewRoute } from '../preview/route-types';
import { AppShell } from './app-shell';
import { useSitePreferences } from './site-preferences';
import type { CatalogState } from './use-catalog';

interface PageFrameProps {
  readonly children: ReactNode;
  readonly shell: PreviewRoute['shell'];
  readonly catalogState?: CatalogState;
  readonly contentWrapper?: 'main' | 'none';
}

export function PageFrame({ children, shell, catalogState, contentWrapper = 'main' }: PageFrameProps) {
  const preferences = useSitePreferences();

  return <AppShell
    theme={preferences.theme}
    language={preferences.language}
    activePage={shell.activePage}
    skipLinkTarget={shell.skipLinkTarget}
    skipLinkLabel={shell.skipLinkLabel}
    onThemeToggle={preferences.toggleTheme}
    onLanguageChange={preferences.changeLanguage}
    catalogPhase={catalogState?.phase}
    notice={catalogState?.notice}
    error={catalogState?.error}
    onRetry={catalogState?.retry}
    contentWrapper={contentWrapper}
  >{children}</AppShell>;
}
