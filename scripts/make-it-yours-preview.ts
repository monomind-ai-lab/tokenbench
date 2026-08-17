import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { previewStaticEntries, type PreviewStaticEntry } from '../src/preview/route-manifest';
import { FRONTEND_ASSETS } from '../src/routing/frontend-assets';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prototypeDirectory = join(projectRoot, 'prototypes', 'ui-revamp-3');
const sharedAssetPath = '/ui-revamp-3-assets';
const sharedAssetDirectoryName = sharedAssetPath.slice(1);
const chartAssetSource = join(projectRoot, 'node_modules', 'chart.js', 'dist', 'chart.umd.js');

const sharedScripts = ['common.js', 'data.js', 'make-it-yours.js', 'articles.js', 'article-detail.js', 'cost-calculator.js'] as const;

export function prototypeBundleEntries(entries: readonly PreviewStaticEntry[] = previewStaticEntries()): readonly PreviewStaticEntry[] {
  return entries.filter((entry) => entry.source === 'prototype-bundle' && entry.delivery === 'prototype');
}

function withSharedAssetPaths(document: string): string {
  return document
    .replace(/(src|href)="(styles\.css|data\.js|common\.js|make-it-yours\.js|articles\.js|article-detail\.js|cost-calculator\.js|chart\.umd\.js)([^"]*)"/gu, (_match, attribute, file, suffix) => `${attribute}="${sharedAssetPath}/${file}${suffix}"`)
    .replaceAll('src="assets/', `src="${sharedAssetPath}/assets/`)
    .replaceAll('href="assets/', `href="${sharedAssetPath}/assets/`)
    .replaceAll('/assets/main.js', FRONTEND_ASSETS.script)
    .replaceAll('/assets/tokenbench.css', FRONTEND_ASSETS.stylesheet);
}

async function copyPreviewPage(outputDirectory: string, page: PreviewStaticEntry): Promise<void> {
  if (!page.document) throw new Error(`Prototype bundle entry is missing its source document: ${page.outputPathname}`);
  const destination = join(outputDirectory, ...page.output);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, withSharedAssetPaths(await readFile(join(prototypeDirectory, page.document), 'utf8')));
}

async function copySharedAssets(outputDirectory: string): Promise<void> {
  const destination = join(outputDirectory, sharedAssetDirectoryName);
  await mkdir(destination, { recursive: true });
  await Promise.all([
    cp(join(prototypeDirectory, 'styles.css'), join(destination, 'styles.css')),
    cp(join(prototypeDirectory, 'assets'), join(destination, 'assets'), { recursive: true }),
    cp(chartAssetSource, join(destination, 'chart.umd.js')),
    ...sharedScripts.map((script) => cp(join(prototypeDirectory, script), join(destination, script))),
  ]);
}

/** Copies the approved rebuilt surfaces into their Pages canonical routes. */
export async function copyMakeItYoursPreview(outputDirectory: string, entries: readonly PreviewStaticEntry[] = previewStaticEntries()): Promise<void> {
  const reactOutputs = new Set(entries
    .filter((entry) => entry.delivery === 'react')
    .map((entry) => entry.output.join('/')));
  const bundles = prototypeBundleEntries(entries)
    .filter((entry) => !reactOutputs.has(entry.output.join('/')));
  if (bundles.length === 0) return;
  const outputDirectories = new Set(bundles.flatMap((entry) => entry.clearOutputDirectory && entry.output.length > 1 ? [entry.output[0]] : []));
  await Promise.all([...outputDirectories].map((directory) => rm(join(outputDirectory, directory), { recursive: true, force: true })));
  await Promise.all([
    copySharedAssets(outputDirectory),
    ...bundles.map((page) => copyPreviewPage(outputDirectory, page)),
  ]);
}

/** Emits the preview only for production builds, after Vite clears the output directory. */
export function makeItYoursPreviewPlugin(): Plugin {
  let outputDirectory = '';

  return {
    name: 'copy-approved-preview-pages',
    apply: 'build',
    configResolved(config) {
      outputDirectory = config.build.outDir;
    },
    async closeBundle() {
      await copyMakeItYoursPreview(outputDirectory);
    },
  };
}
