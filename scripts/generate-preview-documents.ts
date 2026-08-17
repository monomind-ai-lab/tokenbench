import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewRoutes, previewStaticEntries, type PreviewRoute, type PreviewRouteMatch } from '../src/preview/route-manifest';
import { renderPreviewDocument } from '../src/preview/route-document';

interface PreviewDocumentEntry {
  readonly route: PreviewRoute;
  readonly match: PreviewRouteMatch;
  readonly output: readonly string[];
}

function outputForPathname(pathname: string): readonly string[] {
  const segments = pathname.split('/').filter(Boolean);
  return [...segments, 'index.html'];
}

function outputKey(entry: PreviewDocumentEntry): string {
  return `preview-${entry.route.id}-${entry.output.join('-').replace(/[^a-zA-Z0-9-]/gu, '-')}`;
}

function routeMatch(route: PreviewRoute): PreviewRouteMatch {
  const match = route.match(new URL(route.outputPathname, 'https://tokenbench.test'));
  if (!match) throw new Error(`Preview route did not match its output pathname: ${route.id}`);
  return match;
}

function assertDocumentReady(route: PreviewRoute): void {
  if (route.documentReadiness.status === 'ready') return;
  throw new Error(`React preview document is not ready for ${route.id}: ${route.documentReadiness.reason}`);
}

/**
 * Expands React-delivered routes from the manifest. Article guides come from
 * the manifest's generated-guide entries, so their slugs have one owner.
 */
export function previewDocumentEntries(routes: readonly PreviewRoute[] = previewRoutes): readonly PreviewDocumentEntry[] {
  return routes.flatMap((route) => {
    if (route.delivery !== 'react') return [];
    assertDocumentReady(route);

    const ownEntry: PreviewDocumentEntry = {
      route,
      match: routeMatch(route),
      output: outputForPathname(route.outputPathname),
    };
    const articleEntries = previewStaticEntries()
      .filter((entry) => entry.routeId === route.id && entry.source === 'generated-guide')
      .map((entry) => ({ route, match: entry.match, output: entry.output }));

    return [ownEntry, ...articleEntries];
  });
}

/** Provides Vite only the HTML documents currently delivered by React. */
export function previewHtmlEntries(rootDir: string, routes: readonly PreviewRoute[] = previewRoutes): Record<string, string> {
  return Object.fromEntries(previewDocumentEntries(routes).map((entry) => [
    outputKey(entry),
    resolve(rootDir, ...entry.output),
  ]));
}

/** Generates static React documents without touching prototype-delivered routes. */
export async function generatePreviewDocuments(rootDir: string, routes: readonly PreviewRoute[] = previewRoutes): Promise<void> {
  await Promise.all(previewDocumentEntries(routes).map(async (entry) => {
    const outputPath = resolve(rootDir, ...entry.output);
    const data = await entry.route.staticData(entry.match);
    await mkdir(resolve(outputPath, '..'), { recursive: true });
    await writeFile(outputPath, renderPreviewDocument(entry.route, entry.match, data));
  }));
}

async function runGenerator(): Promise<void> {
  await generatePreviewDocuments(process.cwd());
  console.log('Generated React preview documents from the manifest.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runGenerator();
}
