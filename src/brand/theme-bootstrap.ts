import { SITE_CONFIG } from './site-config';

/**
 * Runs before React hydration so every HTML shell starts in the persisted
 * explicit theme or the configured default (dark) without a flash of the
 * wrong appearance. Unmarked stored values are treated as stale and removed
 * so they cannot override the default.
 */
export function themeBootstrapMarkup(): string {
  return `<script>try{var theme=localStorage.getItem('${SITE_CONFIG.themeStorageKey}'),explicit=localStorage.getItem('${SITE_CONFIG.themeExplicitStorageKey}')==='true';if(theme&&explicit){document.documentElement.dataset.theme=theme}else{if(theme)localStorage.removeItem('${SITE_CONFIG.themeStorageKey}');document.documentElement.dataset.theme='${SITE_CONFIG.defaultTheme}'}}catch(e){document.documentElement.dataset.theme='${SITE_CONFIG.defaultTheme}'}</script>`;
}
