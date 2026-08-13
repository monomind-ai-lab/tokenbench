/** Bump whenever the stable frontend CSS or JavaScript payload changes. */
export const FRONTEND_ASSET_REVISION = '20260813-release5-2';

export const FRONTEND_ASSETS = {
  script: `/assets/main.js?v=${FRONTEND_ASSET_REVISION}`,
  stylesheet: `/assets/tokenbench.css?v=${FRONTEND_ASSET_REVISION}`,
} as const;

/** Vite keeps stable asset filenames for Pages Functions; version their HTML references. */
export function versionFrontendAssetReferences(html: string): string {
  return html
    .replaceAll('/assets/main.js', FRONTEND_ASSETS.script)
    .replaceAll('/assets/tokenbench.css', FRONTEND_ASSETS.stylesheet);
}
