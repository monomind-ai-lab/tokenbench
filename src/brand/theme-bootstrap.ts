import { SITE_CONFIG } from './site-config';

/**
 * Runs before React hydration so every HTML shell starts in the persisted
 * explicit theme without allowing the former automatic dark default to flash.
 */
export function themeBootstrapMarkup(): string {
  return `<script>try{var theme=localStorage.getItem('${SITE_CONFIG.themeStorageKey}'),explicit=localStorage.getItem('${SITE_CONFIG.themeExplicitStorageKey}')==='true';if(theme==='dark'&&explicit){document.documentElement.dataset.theme='dark'}else{if(theme==='dark')localStorage.removeItem('${SITE_CONFIG.themeStorageKey}');document.documentElement.dataset.theme='${SITE_CONFIG.defaultTheme}'}}catch(e){document.documentElement.dataset.theme='${SITE_CONFIG.defaultTheme}'}</script>`;
}
